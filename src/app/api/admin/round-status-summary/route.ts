import { NextResponse } from "next/server";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!session.is_admin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  try {
    const pool = await getDbPool();

    const roundResult = await pool.request().query(`
      SELECT TOP 1
        round_id,
        round_code,
        status_type
      FROM dbo.competency_round
      WHERE status_type = 0
      ORDER BY round_year DESC, round_no DESC, round_id DESC;
    `);

    const round = roundResult.recordset[0];

    if (!round) {
      return NextResponse.json({
        ok: true,
        has_draft_round: false,
        round_id: null,
        round_code: null,
        readiness_ready: true,
        blocking_issue_count: 0,
        warning_issue_count: 0,
        issue_count: 0,
      });
    }

    const roundId = Number(round.round_id);

    const baseResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        SELECT
          COUNT(*) AS total_employees,
          SUM(CASE WHEN re.rank_group_id IS NULL THEN 1 ELSE 0 END) AS missing_rank_group,
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(re.position_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_position_code,
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(re.division_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_division_code,
          SUM(
            CASE
              WHEN re.rank_group_source = 'TENURE'
                AND (re.first_employee_date IS NULL OR re.service_year IS NULL)
              THEN 1
              ELSE 0
            END
          ) AS missing_tenure_data,
          SUM(
            CASE
              WHEN re.rank_group_source IS NULL
                OR re.rank_group_source NOT IN ('RANK', 'TENURE')
              THEN 1
              ELSE 0
            END
          ) AS invalid_group_source,
          SUM(
            CASE
              WHEN re.competency_percent IS NULL
                OR re.competency_percent < 0
                OR re.competency_percent > 100
              THEN 1
              ELSE 0
            END
          ) AS invalid_competency_percent
        FROM dbo.competency_round_employee re
        WHERE re.round_id = @round_id
          AND re.status_type <> 9;
      `);

    const assignmentResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        SELECT
          SUM(CASE WHEN ISNULL(a1.assignment_count, 0) = 0 THEN 1 ELSE 0 END) AS missing_level_1,
          SUM(
            CASE
              WHEN ISNULL(re.evaluator_required_type, 2) = 2
                AND ISNULL(a2.assignment_count, 0) = 0
              THEN 1
              ELSE 0
            END
          ) AS missing_level_2
        FROM dbo.competency_round_employee re
        LEFT JOIN (
          SELECT round_employee_id, COUNT(*) AS assignment_count
          FROM dbo.competency_evaluator_assignment
          WHERE evaluator_level = 1
            AND status_type <> 9
          GROUP BY round_employee_id
        ) a1
          ON a1.round_employee_id = re.round_employee_id
        LEFT JOIN (
          SELECT round_employee_id, COUNT(*) AS assignment_count
          FROM dbo.competency_evaluator_assignment
          WHERE evaluator_level = 2
            AND status_type <> 9
          GROUP BY round_employee_id
        ) a2
          ON a2.round_employee_id = re.round_employee_id
        WHERE re.round_id = @round_id
          AND re.status_type <> 9;
      `);

    const invalidAssignmentResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        WITH evaluator_base AS (
          SELECT
            ea.evaluator_payroll_no,
            re.payroll_no AS employee_payroll_no,
            re.rank_group_id AS employee_rank_group_id,
            ev.PAYROLLNO AS found_payroll_no,
            ev.TERMINATEDATE,
            NULLIF(LTRIM(RTRIM(CAST(ev.[RANK] AS varchar(20)))), '') AS evaluator_rank_code,
            NULLIF(LTRIM(RTRIM(CAST(ev.SITECODE AS varchar(20)))), '') AS evaluator_site_code,
            TRY_CONVERT(date, ev.FIRSTEMPLOYEEDATE) AS evaluator_first_employee_date,
            r.start_date
          FROM dbo.competency_evaluator_assignment ea
          JOIN dbo.competency_round_employee re
            ON re.round_employee_id = ea.round_employee_id
           AND re.round_id = @round_id
           AND re.status_type <> 9
          JOIN dbo.competency_round r
            ON r.round_id = re.round_id
          LEFT JOIN ${ssbDb()}.dbo.PYREXT ev
            ON CAST(ev.PAYROLLNO AS varchar(20)) = ea.evaluator_payroll_no
          WHERE ea.status_type <> 9
        ),
        evaluator_calc AS (
          SELECT
            b.*,
            CASE
              WHEN b.evaluator_first_employee_date IS NULL
                OR b.evaluator_first_employee_date > b.start_date
              THEN NULL
              ELSE
                DATEDIFF(YEAR, b.evaluator_first_employee_date, b.start_date)
                - CASE
                    WHEN DATEADD(
                      YEAR,
                      DATEDIFF(YEAR, b.evaluator_first_employee_date, b.start_date),
                      b.evaluator_first_employee_date
                    ) > b.start_date
                    THEN 1
                    ELSE 0
                  END
            END AS evaluator_service_year,
            CASE
              WHEN ISNULL(b.evaluator_site_code, '') = '1' THEN 'RANK'
              ELSE 'TENURE'
            END AS evaluator_rank_group_source
          FROM evaluator_base b
        ),
        evaluator_resolved AS (
          SELECT
            c.*,
            CASE
              WHEN c.evaluator_rank_group_source = 'RANK' THEN rank_map.rank_group_id
              ELSE tenure_map.rank_group_id
            END AS evaluator_rank_group_id
          FROM evaluator_calc c
          OUTER APPLY (
            SELECT TOP 1 rg.rank_group_id
            FROM dbo.competency_rank_group_map rgm
            JOIN dbo.competency_rank_group rg
              ON rg.rank_group_id = rgm.rank_group_id
             AND rg.active_status = 1
            WHERE rgm.active_status = 1
              AND rgm.rank_code = c.evaluator_rank_code
            ORDER BY rgm.rank_group_map_id DESC
          ) rank_map
          OUTER APPLY (
            SELECT TOP 1 rg.rank_group_id
            FROM dbo.competency_tenure_rank_group trg
            JOIN dbo.competency_rank_group rg
              ON rg.rank_group_id = trg.rank_group_id
             AND rg.active_status = 1
            WHERE trg.active_status = 1
              AND c.evaluator_service_year IS NOT NULL
              AND c.evaluator_service_year >= trg.min_service_year
              AND (trg.max_service_year IS NULL OR c.evaluator_service_year < trg.max_service_year)
            ORDER BY trg.min_service_year DESC, trg.tenure_rank_group_id DESC
          ) tenure_map
        )
        SELECT
          SUM(
            CASE
              WHEN evaluator_payroll_no = employee_payroll_no THEN 1
              ELSE 0
            END
          ) AS self_assignment,
          SUM(
            CASE
              WHEN found_payroll_no IS NULL OR TERMINATEDATE IS NOT NULL THEN 1
              ELSE 0
            END
          ) AS inactive_evaluator,
          SUM(
            CASE
              WHEN found_payroll_no IS NOT NULL
                AND TERMINATEDATE IS NULL
                AND evaluator_rank_group_id IS NULL
              THEN 1
              ELSE 0
            END
          ) AS unmapped_evaluator_rank,
          SUM(
            CASE
              WHEN evaluator_group.rank_group_id IS NOT NULL
                AND employee_group.rank_group_id IS NOT NULL
                AND evaluator_group.sort_order < employee_group.sort_order
              THEN 1
              ELSE 0
            END
          ) AS lower_rank_evaluator
        FROM evaluator_resolved resolved
        LEFT JOIN dbo.competency_rank_group evaluator_group
          ON evaluator_group.rank_group_id = resolved.evaluator_rank_group_id
         AND evaluator_group.active_status = 1
        LEFT JOIN dbo.competency_rank_group employee_group
          ON employee_group.rank_group_id = resolved.employee_rank_group_id
         AND employee_group.active_status = 1;
      `);

    const duplicateAssignmentResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        SELECT COUNT(*) AS duplicate_assignment_level
        FROM (
          SELECT
            a.round_employee_id,
            a.evaluator_level
          FROM dbo.competency_evaluator_assignment a
          JOIN dbo.competency_round_employee re
            ON re.round_employee_id = a.round_employee_id
          WHERE re.round_id = @round_id
            AND re.status_type <> 9
            AND a.status_type <> 9
          GROUP BY a.round_employee_id, a.evaluator_level
          HAVING COUNT(*) > 1
        ) x;
      `);

    const invalidWeightScopeResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        WITH RequiredScopes AS (
          SELECT DISTINCT
            ISNULL(
              NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), ''),
              '__NO_DIVISION__'
            ) AS scope_value
          FROM dbo.competency_round_employee re
          WHERE re.round_id = @round_id
            AND re.status_type <> 9
            AND ISNULL(re.evaluator_required_type, 2) = 2
        ),
        WeightRules AS (
          SELECT
            ISNULL(
              NULLIF(LTRIM(RTRIM(CAST(w.division_code AS varchar(20)))), ''),
              '__DEFAULT__'
            ) AS scope_value,
            COUNT(CASE WHEN w.active_status = 1 THEN 1 END) AS active_row_count,
            COUNT(
              DISTINCT CASE
                WHEN w.active_status = 1
                  AND w.evaluator_level IN (1, 2)
                THEN w.evaluator_level
              END
            ) AS level_count,
            SUM(
              CASE
                WHEN w.active_status = 1
                THEN CAST(w.weight_percent AS decimal(10,2))
                ELSE 0
              END
            ) AS total_weight
          FROM dbo.competency_evaluator_weight w
          WHERE w.round_id = @round_id
          GROUP BY ISNULL(
            NULLIF(LTRIM(RTRIM(CAST(w.division_code AS varchar(20)))), ''),
            '__DEFAULT__'
          )
        )
        SELECT COUNT(*) AS invalid_scope_count
        FROM RequiredScopes required_scope
        LEFT JOIN WeightRules specific_rule
          ON specific_rule.scope_value = required_scope.scope_value
        LEFT JOIN WeightRules default_rule
          ON default_rule.scope_value = '__DEFAULT__'
        WHERE
          (
            ISNULL(specific_rule.active_row_count, 0) > 0
            AND (
              ISNULL(specific_rule.level_count, 0) <> 2
              OR ABS(ISNULL(specific_rule.total_weight, 0) - 100) >= 0.01
            )
          )
          OR
          (
            ISNULL(specific_rule.active_row_count, 0) = 0
            AND (
              ISNULL(default_rule.level_count, 0) <> 2
              OR ABS(ISNULL(default_rule.total_weight, 0) - 100) >= 0.01
            )
          );
      `);

    const commonQuestionResult = await pool.request().query(`
      SELECT
        4 - COUNT(DISTINCT q.fixed_question_no) AS missing_common_question
      FROM dbo.competency_question q
      JOIN dbo.competency_question_version qv
        ON qv.question_id = q.question_id
       AND qv.is_current = 1
       AND qv.active_status = 1
      WHERE q.active_status = 1
        AND q.question_scope = 'COMMON'
        AND q.fixed_question_no BETWEEN 1 AND 4;
    `);

    const professionQuestionResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        WITH round_positions AS (
          SELECT DISTINCT NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code
          FROM dbo.competency_round_employee
          WHERE round_id = @round_id
            AND status_type <> 9
            AND NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
        ),
        map_summary AS (
          SELECT
            rp.position_code,
            COUNT(DISTINCT CASE WHEN m.active_status = 1 THEN m.question_no END) AS active_map_count,
            COUNT(
              DISTINCT CASE
                WHEN m.active_status = 1
                  AND q.question_scope = 'PROFESSION'
                  AND q.active_status = 1
                  AND qv.question_version_id IS NOT NULL
                THEN m.question_no
              END
            ) AS valid_map_count,
            COUNT(
              DISTINCT CASE
                WHEN m.active_status = 1
                  AND q.question_scope = 'PROFESSION'
                  AND q.active_status = 1
                  AND qv.question_version_id IS NOT NULL
                THEN m.question_id
              END
            ) AS distinct_topic_count
          FROM round_positions rp
          LEFT JOIN dbo.competency_profession_question_map m
            ON m.position_code = rp.position_code
           AND m.active_status = 1
          LEFT JOIN dbo.competency_question q
            ON q.question_id = m.question_id
          LEFT JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          GROUP BY rp.position_code
        )
        SELECT
          SUM(CASE WHEN active_map_count NOT IN (0, 3) THEN 1 ELSE 0 END) AS partial_count,
          SUM(CASE WHEN active_map_count = 3 AND valid_map_count <> 3 THEN 1 ELSE 0 END) AS invalid_topic_count,
          SUM(CASE WHEN active_map_count = 3 AND distinct_topic_count <> 3 THEN 1 ELSE 0 END) AS duplicate_topic_count
        FROM map_summary;
      `);

    const descriptionResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        WITH active_employees AS (
          SELECT DISTINCT
            NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code,
            rank_group_id
          FROM dbo.competency_round_employee
          WHERE round_id = @round_id
            AND status_type <> 9
            AND rank_group_id IS NOT NULL
        ),
        common_questions AS (
          SELECT qv.question_version_id
          FROM dbo.competency_question q
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE q.active_status = 1
            AND q.question_scope = 'COMMON'
            AND q.fixed_question_no BETWEEN 1 AND 4
        ),
        profession_questions AS (
          SELECT
            m.position_code,
            qv.question_version_id
          FROM dbo.competency_profession_question_map m
          JOIN dbo.competency_question q
            ON q.question_id = m.question_id
           AND q.question_scope = 'PROFESSION'
           AND q.active_status = 1
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE m.active_status = 1
        ),
        required_pairs AS (
          SELECT DISTINCT
            ae.rank_group_id,
            cq.question_version_id
          FROM active_employees ae
          CROSS JOIN common_questions cq

          UNION

          SELECT DISTINCT
            ae.rank_group_id,
            pq.question_version_id
          FROM active_employees ae
          JOIN profession_questions pq
            ON pq.position_code = ae.position_code
        )
        SELECT COUNT(*) AS missing_description_count
        FROM required_pairs rp
        WHERE NOT EXISTS (
          SELECT 1
          FROM dbo.competency_question_description_version dv
          WHERE dv.question_version_id = rp.question_version_id
            AND dv.rank_group_id = rp.rank_group_id
            AND dv.active_status = 1
        );
      `);

    const base = baseResult.recordset[0] || {};
    const assignment = assignmentResult.recordset[0] || {};
    const invalidAssignment = invalidAssignmentResult.recordset[0] || {};
    const duplicateAssignment = duplicateAssignmentResult.recordset[0] || {};
    const invalidWeightScope = invalidWeightScopeResult.recordset[0] || {};
    const commonQuestion = commonQuestionResult.recordset[0] || {};
    const professionQuestion = professionQuestionResult.recordset[0] || {};
    const description = descriptionResult.recordset[0] || {};

    const counts = {
      totalEmployees: toNumber(base.total_employees),
      missingRankGroup: toNumber(base.missing_rank_group),
      missingPositionCode: toNumber(base.missing_position_code),
      missingDivisionCode: toNumber(base.missing_division_code),
      missingTenureData: toNumber(base.missing_tenure_data),
      invalidGroupSource: toNumber(base.invalid_group_source),
      invalidCompetencyPercent: toNumber(base.invalid_competency_percent),
      missingLevel1: toNumber(assignment.missing_level_1),
      missingLevel2: toNumber(assignment.missing_level_2),
      selfAssignment: toNumber(invalidAssignment.self_assignment),
      inactiveEvaluator: toNumber(invalidAssignment.inactive_evaluator),
      unmappedEvaluatorRank: toNumber(invalidAssignment.unmapped_evaluator_rank),
      lowerRankEvaluator: toNumber(invalidAssignment.lower_rank_evaluator),
      duplicateAssignmentLevel: toNumber(
        duplicateAssignment.duplicate_assignment_level,
      ),
      missingWeightScope: toNumber(invalidWeightScope.invalid_scope_count),
      missingCommonQuestion: Math.max(
        0,
        toNumber(commonQuestion.missing_common_question),
      ),
      partialProfessionSet: toNumber(professionQuestion.partial_count),
      invalidProfessionTopic: toNumber(professionQuestion.invalid_topic_count),
      duplicateProfessionTopic: toNumber(
        professionQuestion.duplicate_topic_count,
      ),
      missingDescription: toNumber(description.missing_description_count),
    };

    const blockingIssueCount =
      (counts.totalEmployees <= 0 ? 1 : 0) +
      counts.missingRankGroup +
      counts.missingPositionCode +
      counts.missingDivisionCode +
      counts.missingTenureData +
      counts.invalidGroupSource +
      counts.invalidCompetencyPercent +
      counts.missingLevel1 +
      counts.missingLevel2 +
      counts.selfAssignment +
      counts.inactiveEvaluator +
      counts.unmappedEvaluatorRank +
      counts.lowerRankEvaluator +
      counts.duplicateAssignmentLevel +
      counts.missingWeightScope +
      counts.missingCommonQuestion +
      counts.partialProfessionSet +
      counts.invalidProfessionTopic +
      counts.duplicateProfessionTopic +
      counts.missingDescription;

    return NextResponse.json({
      ok: true,
      has_draft_round: true,
      round_id: roundId,
      round_code: round.round_code,
      readiness_ready: blockingIssueCount === 0,
      blocking_issue_count: blockingIssueCount,
      warning_issue_count: 0,
      issue_count: blockingIssueCount,
    });
  } catch (error) {
    console.error("round-status-summary error", error);
    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถตรวจสอบสถานะความพร้อมของรอบได้",
      },
      { status: 500 },
    );
  }
}