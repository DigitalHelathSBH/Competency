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

function isWeightComplete(rule: { total_weight: number; level_count: number } | undefined) {
  if (!rule) return false;
  return Number(rule.level_count || 0) >= 2 && Math.abs(Number(rule.total_weight || 0) - 100) < 0.01;
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
          SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(re.division_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_division_code
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
          SUM(CASE WHEN ISNULL(re.evaluator_required_type, 2) = 2 AND ISNULL(a2.assignment_count, 0) = 0 THEN 1 ELSE 0 END) AS missing_level_2
        FROM dbo.competency_round_employee re
        LEFT JOIN (
          SELECT
            round_employee_id,
            COUNT(*) AS assignment_count
          FROM dbo.competency_evaluator_assignment
          WHERE evaluator_level = 1
            AND status_type <> 9
          GROUP BY round_employee_id
        ) a1
          ON a1.round_employee_id = re.round_employee_id
        LEFT JOIN (
          SELECT
            round_employee_id,
            COUNT(*) AS assignment_count
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
        SELECT
          SUM(CASE WHEN a.evaluator_payroll_no = re.payroll_no THEN 1 ELSE 0 END) AS self_assignment,
          SUM(CASE WHEN p.PAYROLLNO IS NULL OR p.TERMINATEDATE IS NOT NULL THEN 1 ELSE 0 END) AS inactive_evaluator,
          SUM(CASE WHEN p.PAYROLLNO IS NOT NULL AND p.TERMINATEDATE IS NULL AND eval_rg.rank_group_id IS NULL THEN 1 ELSE 0 END) AS unmapped_evaluator_rank,
          SUM(CASE WHEN eval_rg.rank_group_id IS NOT NULL AND emp_rg.rank_group_id IS NOT NULL AND eval_rg.sort_order < emp_rg.sort_order THEN 1 ELSE 0 END) AS lower_rank_evaluator
        FROM dbo.competency_evaluator_assignment a
        JOIN dbo.competency_round_employee re
          ON re.round_employee_id = a.round_employee_id
        LEFT JOIN ${ssbDb()}.dbo.PYREXT p
          ON p.PAYROLLNO = a.evaluator_payroll_no
        LEFT JOIN dbo.competency_rank_group emp_rg
          ON emp_rg.rank_group_id = re.rank_group_id
         AND emp_rg.active_status = 1
        LEFT JOIN dbo.competency_rank_group_map eval_rgm
          ON eval_rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
         AND eval_rgm.active_status = 1
        LEFT JOIN dbo.competency_rank_group eval_rg
          ON eval_rg.rank_group_id = eval_rgm.rank_group_id
         AND eval_rg.active_status = 1
        WHERE re.round_id = @round_id
          AND re.status_type <> 9
          AND a.status_type <> 9;
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

    const questionResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        SELECT COUNT(*) AS missing_common_question
        FROM (VALUES (1), (2), (3), (4)) qn(question_no)
        WHERE NOT EXISTS (
          SELECT 1
          FROM dbo.competency_question q
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE q.question_no = qn.question_no
            AND q.question_scope = 'COMMON'
            AND q.active_status = 1
        );

        SELECT COUNT(*) AS missing_profession_question
        FROM (
          SELECT DISTINCT
            re.position_code,
            qn.question_no
          FROM dbo.competency_round_employee re
          CROSS JOIN (VALUES (5), (6), (7)) qn(question_no)
          WHERE re.round_id = @round_id
            AND re.status_type <> 9
            AND NULLIF(LTRIM(RTRIM(ISNULL(re.position_code, ''))), '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.competency_question q
              JOIN dbo.competency_question_version qv
                ON qv.question_id = q.question_id
               AND qv.is_current = 1
               AND qv.active_status = 1
              WHERE q.question_no = qn.question_no
                AND q.question_scope = 'PROFESSION'
                AND q.position_code = re.position_code
                AND q.active_status = 1
            )
        ) x;

        SELECT COUNT(*) AS missing_description
        FROM (
          SELECT DISTINCT
            q.question_no,
            re.rank_group_id
          FROM dbo.competency_round_employee re
          JOIN dbo.competency_question q
            ON q.active_status = 1
           AND (
                (q.question_scope = 'COMMON' AND q.question_no BETWEEN 1 AND 4)
                OR
                (q.question_scope = 'PROFESSION' AND q.question_no BETWEEN 5 AND 7 AND q.position_code = re.position_code)
           )
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE re.round_id = @round_id
            AND re.status_type <> 9
            AND re.rank_group_id IS NOT NULL
        ) x
        WHERE NOT EXISTS (
          SELECT 1
          FROM dbo.competency_question_description_version qdv
          WHERE qdv.question_no = x.question_no
            AND qdv.rank_group_id = x.rank_group_id
            AND qdv.is_current = 1
            AND qdv.active_status = 1
        );
      `);

    const weightScopeResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        SELECT DISTINCT
          '__DEFAULT__' AS scope_value
        UNION ALL
        SELECT DISTINCT
          NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') AS scope_value
        FROM dbo.competency_round_employee re
        WHERE re.round_id = @round_id
          AND re.status_type <> 9
          AND NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') IS NOT NULL;
      `);

    const weightRuleResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(CAST(division_code AS varchar(20)))), ''), '__DEFAULT__') AS scope_value,
          SUM(CASE WHEN active_status = 1 THEN CAST(weight_percent AS decimal(10,2)) ELSE 0 END) AS total_weight,
          COUNT(DISTINCT CASE WHEN active_status = 1 THEN evaluator_level END) AS level_count
        FROM dbo.competency_evaluator_weight
        WHERE round_id = @round_id
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(CAST(division_code AS varchar(20)))), ''), '__DEFAULT__');
      `);

    const base = baseResult.recordset[0] || {};
    const assignment = assignmentResult.recordset[0] || {};
    const invalidAssignment = invalidAssignmentResult.recordset[0] || {};
    const duplicateAssignment = duplicateAssignmentResult.recordset[0] || {};

    const weightRules = (weightRuleResult.recordset as Array<{ scope_value: string; total_weight: number; level_count: number }>).map((rule) => ({
      scope_value: rule.scope_value,
      total_weight: Number(rule.total_weight || 0),
      level_count: Number(rule.level_count || 0),
    }));

    const weightRuleMap = new Map(weightRules.map((rule) => [rule.scope_value, rule]));
    const defaultWeightRule = weightRuleMap.get("__DEFAULT__");
    const defaultComplete = isWeightComplete(defaultWeightRule);
    const missingWeightScopes = (weightScopeResult.recordset as Array<{ scope_value: string }>).filter((scope) => {
      if (scope.scope_value === "__DEFAULT__") {
        return !defaultComplete;
      }

      const divisionRule = weightRuleMap.get(scope.scope_value);
      return !isWeightComplete(divisionRule) && !defaultComplete;
    }).length;
    
    const questionRecordsets =
      questionResult.recordsets as unknown as Array<Array<Record<string, unknown>>>;

    const commonQuestionCheck = questionRecordsets[0]?.[0] ?? {};
    const professionQuestionCheck = questionRecordsets[1]?.[0] ?? {};
    const descriptionCheck = questionRecordsets[2]?.[0] ?? {};

    const counts = {
      totalEmployees: toNumber(base.total_employees),
      missingRankGroup: toNumber(base.missing_rank_group),
      missingPositionCode: toNumber(base.missing_position_code),
      missingDivisionCode: toNumber(base.missing_division_code),
      missingLevel1: toNumber(assignment.missing_level_1),
      missingLevel2: toNumber(assignment.missing_level_2),
      selfAssignment: toNumber(invalidAssignment.self_assignment),
      inactiveEvaluator: toNumber(invalidAssignment.inactive_evaluator),
      unmappedEvaluatorRank: toNumber(invalidAssignment.unmapped_evaluator_rank),
      lowerRankEvaluator: toNumber(invalidAssignment.lower_rank_evaluator),
      duplicateAssignmentLevel: toNumber(duplicateAssignment.duplicate_assignment_level),
      missingWeightScope: missingWeightScopes,
      missingCommonQuestion: toNumber(commonQuestionCheck.missing_common_question),
      missingProfessionQuestion: toNumber(professionQuestionCheck.missing_profession_question),
      missingDescription: toNumber(descriptionCheck.missing_description),
    };

    const blockingIssueCount =
      (counts.totalEmployees <= 0 ? 1 : 0) +
      counts.missingRankGroup +
      counts.missingLevel1 +
      counts.missingLevel2 +
      counts.selfAssignment +
      counts.inactiveEvaluator +
      counts.unmappedEvaluatorRank +
      counts.lowerRankEvaluator +
      counts.duplicateAssignmentLevel +
      counts.missingWeightScope +
      counts.missingCommonQuestion +
      counts.missingProfessionQuestion;

    const warningIssueCount = counts.missingPositionCode + counts.missingDivisionCode + counts.missingDescription;

    return NextResponse.json({
      ok: true,
      has_draft_round: true,
      round_id: roundId,
      round_code: round.round_code,
      readiness_ready: blockingIssueCount === 0,
      blocking_issue_count: blockingIssueCount,
      warning_issue_count: warningIssueCount,
      issue_count: blockingIssueCount + warningIssueCount,
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
