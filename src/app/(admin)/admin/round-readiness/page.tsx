import Link from "next/link";
import ActionAlert from "@/components/competency/ActionAlert";
import DataTable from "@/components/competency/DataTable";
import PageHeader from "@/components/competency/PageHeader";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RoundReadinessPageProps = {
  searchParams?: Promise<{
    round_id?: string;
    alert_type?: string;
    alert_message?: string;
  }>;
};

type RoundRow = {
  round_id: number;
  round_code: string;
  status_type: number;
};

type SummaryCounts = {
  totalEmployees: number;
  missingRankGroup: number;
  missingPositionCode: number;
  missingDivisionCode: number;
  missingTenureData: number;
  invalidGroupSource: number;
  invalidCompetencyPercent: number;
  missingLevel1: number;
  missingLevel2: number;
  selfAssignment: number;
  inactiveEvaluator: number;
  unmappedEvaluatorRank: number;
  lowerRankEvaluator: number;
  duplicateAssignmentLevel: number;
  missingWeightScope: number;
  missingCommonQuestion: number;
  partialProfessionSet: number;
  invalidProfessionTopic: number;
  duplicateProfessionTopic: number;
  missingDescription: number;
};

type ProblemRow = {
  problem_type: string;
  problem_level: "error" | "warning" | "info";
  problem_text: string;
  reference_text: string;
  menu_hint: string;
};

type ReadinessResult = {
  round: RoundRow | null;
  counts: SummaryCounts;
  problems: ProblemRow[];
  canOpenRound: boolean;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function roundStatusText(statusType: number) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";
  return `สถานะ ${statusType}`;
}

function getMenuLabel(path: string) {
  const menuMap: Record<string, string> = {
    "/admin/rounds": "รอบประเมิน",
    "/admin/round-readiness": "ตรวจสอบความพร้อมเปิดรอบ",
    "/admin/round-issues": "รายการที่ต้องแก้ไข",
    "/admin/round-employees": "ผู้ถูกประเมิน",
    "/admin/rank-groups": "กลุ่มระดับ",
    "/admin/rank-group-maps": "ระดับข้าราชการ",
    "/admin/tenure-rank-groups": "ช่วงอายุงาน",
    "/admin/site-percents": "เปอร์เซ็นต์ Competency",
    "/admin/assignments": "กำหนดผู้ประเมิน",
    "/admin/evaluator-weights": "น้ำหนักผู้ประเมิน",
    "/admin/questions": "หัวข้อประเมิน",
    "/admin/profession-questions": "หัวข้อประเมินตามวิชาชีพ",
  };

  return menuMap[path] || path;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function emptyCounts(): SummaryCounts {
  return {
    totalEmployees: 0,
    missingRankGroup: 0,
    missingPositionCode: 0,
    missingDivisionCode: 0,
    missingTenureData: 0,
    invalidGroupSource: 0,
    invalidCompetencyPercent: 0,
    missingLevel1: 0,
    missingLevel2: 0,
    selfAssignment: 0,
    inactiveEvaluator: 0,
    unmappedEvaluatorRank: 0,
    lowerRankEvaluator: 0,
    duplicateAssignmentLevel: 0,
    missingWeightScope: 0,
    missingCommonQuestion: 0,
    partialProfessionSet: 0,
    invalidProfessionTopic: 0,
    duplicateProfessionTopic: 0,
    missingDescription: 0,
  };
}

function getProblemBadgeClass(level: ProblemRow["problem_level"]) {
  if (level === "error") {
    return "inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]";
  }

  if (level === "warning") {
    return "inline-flex rounded-full bg-[#f8ac59]/10 px-2.5 py-1 text-xs font-medium text-[#f8ac59]";
  }

  return "inline-flex rounded-full bg-[#23c6c8]/10 px-2.5 py-1 text-xs font-medium text-[#23c6c8]";
}

function getProblemLevelText(level: ProblemRow["problem_level"]) {
  if (level === "error") return "ต้องแก้";
  if (level === "warning") return "ควรตรวจ";
  return "ข้อมูล";
}

async function getDraftRounds() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      round_id,
      round_code,
      status_type
    FROM dbo.competency_round
    WHERE status_type = 0
    ORDER BY round_year DESC, round_no DESC, round_id DESC;
  `);

  return result.recordset as RoundRow[];
}

async function getReadinessResult(roundId: number): Promise<ReadinessResult> {
  if (!roundId) {
    return {
      round: null,
      counts: emptyCounts(),
      problems: [],
      canOpenRound: false,
    };
  }

  const pool = await getDbPool();

  const roundResult = await pool.request().input("round_id", sql.Int, roundId)
    .query(`
      SELECT TOP 1
        round_id,
        round_code,
        status_type
      FROM dbo.competency_round
      WHERE round_id = @round_id;
    `);

  const round = roundResult.recordset[0] as RoundRow | undefined;

  if (!round) {
    return {
      round: null,
      counts: emptyCounts(),
      problems: [
        {
          problem_type: "รอบประเมิน",
          problem_level: "error",
          problem_text: "ไม่พบรอบประเมินที่เลือก",
          reference_text: "กรุณาเลือกรอบประเมินใหม่",
          menu_hint: "/admin/rounds",
        },
      ],
      canOpenRound: false,
    };
  }

  const baseResult = await pool.request().input("round_id", sql.Int, roundId)
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
    .input("round_id", sql.Int, roundId).query(`
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
    .input("round_id", sql.Int, roundId).query(`
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
    .input("round_id", sql.Int, roundId).query(`
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
    .input("round_id", sql.Int, roundId).query(`
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
    .input("round_id", sql.Int, roundId).query(`
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
    .input("round_id", sql.Int, roundId).query(`
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

  const counts: SummaryCounts = {
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

  const problems: ProblemRow[] = [];

  if (Number(round.status_type) !== 0) {
    problems.push({
      problem_type: "รอบประเมิน",
      problem_level: "error",
      problem_text: `รอบนี้อยู่สถานะ ${roundStatusText(Number(round.status_type))} ไม่สามารถเปิดซ้ำได้`,
      reference_text: round.round_code,
      menu_hint: "/admin/rounds",
    });
  }

  if (counts.totalEmployees <= 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: "ยังไม่มีผู้ถูกประเมินในรอบนี้",
      reference_text: "เพิ่มรายชื่อผู้ถูกประเมินก่อนเปิดรอบ",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingRankGroup > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่ยังไม่มีกลุ่มระดับ ${counts.missingRankGroup.toLocaleString()} คน`,
      reference_text: "ตรวจสอบการตั้งค่าระดับข้าราชการหรือช่วงอายุงาน",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingPositionCode > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่ยังไม่มีข้อมูลวิชาชีพ ${counts.missingPositionCode.toLocaleString()} คน`,
      reference_text: "ข้อมูลวิชาชีพจำเป็นต่อการเลือกชุดหัวข้อประเมิน",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingDivisionCode > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่ยังไม่มีกลุ่มภารกิจ ${counts.missingDivisionCode.toLocaleString()} คน`,
      reference_text: "ข้อมูลกลุ่มภารกิจจำเป็นต่อการกำหนดน้ำหนักผู้ประเมิน",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingTenureData > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่ไม่สามารถคำนวณอายุงาน ณ วันเริ่มรอบได้ ${counts.missingTenureData.toLocaleString()} คน`,
      reference_text:
        "ตรวจสอบว่ามีวันเริ่มปฏิบัติงาน และวันดังกล่าวต้องไม่อยู่หลังวันเริ่มรอบ",
      menu_hint: "/admin/tenure-rank-groups",
    });
  }

  if (counts.invalidGroupSource > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่ข้อมูลการจัดกลุ่มระดับไม่สมบูรณ์ ${counts.invalidGroupSource.toLocaleString()} คน`,
      reference_text: "นำเข้ารายชื่อใหม่เพื่อคำนวณกลุ่มระดับอีกครั้ง",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.invalidCompetencyPercent > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่สัดส่วน Competency ไม่ถูกต้อง ${counts.invalidCompetencyPercent.toLocaleString()} คน`,
      reference_text: "ตรวจสอบการตั้งค่าเปอร์เซ็นต์ Competency",
      menu_hint: "/admin/site-percents",
    });
  }

  if (counts.missingLevel1 > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `ยังไม่มีหัวหน้าใกล้ชิด ${counts.missingLevel1.toLocaleString()} คน`,
      reference_text: "ผู้ถูกประเมินทุกคนต้องมีหัวหน้าใกล้ชิด",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.missingLevel2 > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `ยังไม่มีหัวหน้าใหญ่ ${counts.missingLevel2.toLocaleString()} คน`,
      reference_text: "ตรวจเฉพาะผู้ที่กำหนดให้ต้องมีผู้ประเมินสองระดับ",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.selfAssignment > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบรายการที่ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน ${counts.selfAssignment.toLocaleString()} รายการ`,
      reference_text: "เปลี่ยนผู้ประเมินเป็นบุคคลอื่น",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.inactiveEvaluator > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ประเมินที่พ้นสภาพหรือไม่พบข้อมูลบุคลากร ${counts.inactiveEvaluator.toLocaleString()} รายการ`,
      reference_text: "เลือกผู้ประเมินที่ยังปฏิบัติงานอยู่",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.unmappedEvaluatorRank > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ประเมินที่ยังไม่มีกลุ่มระดับ ${counts.unmappedEvaluatorRank.toLocaleString()} รายการ`,
      reference_text: "ตรวจสอบระดับข้าราชการหรือช่วงอายุงานของผู้ประเมิน",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.lowerRankEvaluator > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ประเมินที่กลุ่มระดับต่ำกว่าผู้ถูกประเมิน ${counts.lowerRankEvaluator.toLocaleString()} รายการ`,
      reference_text: "ผู้ประเมินต้องอยู่กลุ่มระดับเดียวกันหรือสูงกว่า",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.duplicateAssignmentLevel > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ถูกประเมินที่มีผู้ประเมินระดับเดียวกันซ้ำ ${counts.duplicateAssignmentLevel.toLocaleString()} คน`,
      reference_text: "แต่ละระดับผู้ประเมินกำหนดได้หนึ่งคน",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.missingWeightScope > 0) {
    problems.push({
      problem_type: "น้ำหนักผู้ประเมิน",
      problem_level: "error",
      problem_text: `มีชุดน้ำหนักผู้ประเมินที่กำหนดไม่ครบ 100% จำนวน ${counts.missingWeightScope.toLocaleString()} ชุด`,
      reference_text: "น้ำหนักหัวหน้าใกล้ชิดและหัวหน้าใหญ่ต้องรวมเป็น 100%",
      menu_hint: "/admin/evaluator-weights",
    });
  }

  if (counts.missingCommonQuestion > 0) {
    problems.push({
      problem_type: "หัวข้อประเมิน",
      problem_level: "error",
      problem_text: `หัวข้อประเมินส่วนกลางข้อ 1-4 ยังไม่ครบ ${counts.missingCommonQuestion.toLocaleString()} ข้อ`,
      reference_text: "หัวข้อส่วนกลางต้องเปิดใช้งานครบทั้งสี่ข้อ",
      menu_hint: "/admin/questions",
    });
  }

  if (counts.partialProfessionSet > 0) {
    problems.push({
      problem_type: "หัวข้อประเมินตามวิชาชีพ",
      problem_level: "error",
      problem_text: `มีวิชาชีพที่กำหนดหัวข้อเพิ่มเติมไม่ครบข้อ 5-7 จำนวน ${counts.partialProfessionSet.toLocaleString()} วิชาชีพ`,
      reference_text: "วิชาชีพต้องไม่มีหัวข้อเพิ่มเติม หรือกำหนดครบทั้งสามข้อ",
      menu_hint: "/admin/profession-questions",
    });
  }

  if (counts.invalidProfessionTopic > 0) {
    problems.push({
      problem_type: "หัวข้อประเมินตามวิชาชีพ",
      problem_level: "error",
      problem_text: `มีวิชาชีพที่เลือกหัวข้อเพิ่มเติมซึ่งไม่พร้อมใช้งาน ${counts.invalidProfessionTopic.toLocaleString()} วิชาชีพ`,
      reference_text: "เลือกเฉพาะหัวข้อตามวิชาชีพที่เปิดใช้งาน",
      menu_hint: "/admin/profession-questions",
    });
  }

  if (counts.duplicateProfessionTopic > 0) {
    problems.push({
      problem_type: "หัวข้อประเมินตามวิชาชีพ",
      problem_level: "error",
      problem_text: `มีวิชาชีพที่เลือกหัวข้อเพิ่มเติมซ้ำกัน ${counts.duplicateProfessionTopic.toLocaleString()} วิชาชีพ`,
      reference_text: "หัวข้อข้อ 5, 6 และ 7 ต้องไม่ซ้ำกัน",
      menu_hint: "/admin/profession-questions",
    });
  }

  if (counts.missingDescription > 0) {
    problems.push({
      problem_type: "คำอธิบายหัวข้อ",
      problem_level: "error",
      problem_text: `คำอธิบายหัวข้อยังไม่ครบตามกลุ่มระดับ ${counts.missingDescription.toLocaleString()} รายการ`,
      reference_text: "เพิ่มคำอธิบายให้ครบจากหน้าหัวข้อประเมิน",
      menu_hint: "/admin/questions",
    });
  }

  const blockingProblemCount = problems.filter(
    (problem) => problem.problem_level === "error",
  ).length;

  return {
    round,
    counts,
    problems,
    canOpenRound: Number(round.status_type) === 0 && blockingProblemCount === 0,
  };
}

function SummaryCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: number | string;
  detail: string;
  tone: "green" | "red" | "orange" | "blue" | "gray";
}) {
  const toneClass = {
    green: "border-[#1ab394]/20 bg-[#1ab394]/5 text-[#1ab394]",
    red: "border-[#ed5565]/20 bg-[#ed5565]/5 text-[#ed5565]",
    orange: "border-[#f8ac59]/20 bg-[#f8ac59]/5 text-[#f8ac59]",
    blue: "border-[#23c6c8]/20 bg-[#23c6c8]/5 text-[#23c6c8]",
    gray: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-xs leading-5 opacity-80">{detail}</p>
    </div>
  );
}

export default async function RoundReadinessPage({
  searchParams,
}: RoundReadinessPageProps) {
  await requireAdminSession();

  const params = await searchParams;
  const draftRounds = await getDraftRounds();
  const selectedRoundId = Number(
    params?.round_id || draftRounds[0]?.round_id || 0,
  );
  const checkResult = await getReadinessResult(selectedRoundId);
  const counts = checkResult.counts;

  const blockingProblemCount = checkResult.problems.filter(
    (problem) => problem.problem_level === "error",
  ).length;

  const employeeDataIssueCount =
    counts.missingRankGroup +
    counts.missingPositionCode +
    counts.missingDivisionCode +
    counts.missingTenureData +
    counts.invalidGroupSource +
    counts.invalidCompetencyPercent;

  const evaluatorIssueCount =
    counts.missingLevel1 +
    counts.missingLevel2 +
    counts.selfAssignment +
    counts.inactiveEvaluator +
    counts.unmappedEvaluatorRank +
    counts.lowerRankEvaluator +
    counts.duplicateAssignmentLevel;

  const professionIssueCount =
    counts.partialProfessionSet +
    counts.invalidProfessionTopic +
    counts.duplicateProfessionTopic;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="ตรวจสอบความพร้อมเปิดรอบ"
        description="ตรวจรายชื่อ ผู้ประเมิน น้ำหนัก และหัวข้อประเมินก่อนเปิดใช้งานรอบจริง"
      />

      <ActionAlert
        type={
          params?.alert_type as
            "success" | "error" | "warning" | "info" | undefined
        }
        message={params?.alert_message}
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <form className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบประเมินสถานะร่าง
            </label>
            <select
              name="round_id"
              defaultValue={selectedRoundId || ""}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {draftRounds.length === 0 ? (
                <option value="">ยังไม่มีรอบประเมินสถานะร่าง</option>
              ) : (
                draftRounds.map((round) => (
                  <option key={round.round_id} value={round.round_id}>
                    {round.round_code} - {roundStatusText(round.status_type)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-end justify-end lg:col-span-7">
            <button
              type="submit"
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
              disabled={draftRounds.length === 0}
            >
              ตรวจสอบรอบประเมิน
            </button>
          </div>
        </form>
      </div>

      {checkResult.round ? (
        <>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  ผลตรวจรอบ {checkResult.round.round_code}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  สถานะรอบ: {roundStatusText(checkResult.round.status_type)}
                </p>
              </div>

              {checkResult.canOpenRound ? (
                <span className="inline-flex rounded-full bg-[#1ab394]/10 px-4 py-2 text-sm font-medium text-[#1ab394]">
                  พร้อมเปิดรอบประเมิน
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-[#ed5565]/10 px-4 py-2 text-sm font-medium text-[#ed5565]">
                  ยังไม่พร้อมเปิดรอบ ({blockingProblemCount} รายการต้องแก้)
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="ผู้ถูกประเมินในรอบ"
                value={counts.totalEmployees}
                detail="นับเฉพาะรายชื่อที่ยังอยู่ในรอบ"
                tone={counts.totalEmployees > 0 ? "green" : "red"}
              />
              <SummaryCard
                title="ข้อมูลผู้ถูกประเมิน"
                value={employeeDataIssueCount}
                detail="กลุ่มระดับ วิชาชีพ กลุ่มภารกิจ การคำนวณอายุงาน และเปอร์เซ็นต์"
                tone={employeeDataIssueCount === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="ปัญหาผู้ประเมิน"
                value={evaluatorIssueCount}
                detail="ตรวจความครบถ้วนและเงื่อนไขระดับผู้ประเมิน"
                tone={evaluatorIssueCount === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="น้ำหนักผู้ประเมิน"
                value={counts.missingWeightScope}
                detail="ทุกชุดที่กำหนดต้องรวมครบ 100%"
                tone={counts.missingWeightScope === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="หัวข้อส่วนกลางไม่ครบ"
                value={counts.missingCommonQuestion}
                detail="หัวข้อข้อ 1-4 ต้องเปิดใช้งานครบ"
                tone={counts.missingCommonQuestion === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="หัวข้อตามวิชาชีพ"
                value={professionIssueCount}
                detail="ต้องไม่มีหัวข้อเพิ่มเติม หรือกำหนดครบข้อ 5-7"
                tone={professionIssueCount === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="คำอธิบายยังไม่ครบ"
                value={counts.missingDescription}
                detail="คำอธิบายต้องครบตามหัวข้อและกลุ่มระดับ"
                tone={counts.missingDescription === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="รายการที่ต้องแก้"
                value={blockingProblemCount}
                detail="ต้องแก้ให้เป็นศูนย์ก่อนเปิดรอบ"
                tone={blockingProblemCount === 0 ? "green" : "red"}
              />
            </div>
          </div>

          <div className="mt-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-800 dark:text-white/90">
              รายการที่ต้องตรวจสอบ
            </h2>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <DataTable
                headers={[
                  "ประเภท",
                  "ระดับ",
                  "รายละเอียด",
                  "ข้อมูลเพิ่มเติม",
                  "จัดการ",
                ]}
                searchPlaceholder="ค้นหาประเภท รายละเอียด หรือเมนู..."
                emptyText="ไม่พบปัญหา สามารถไปเปิดรอบประเมินได้"
                initialPageSize={25}
                filters={[
                  {
                    key: "level",
                    label: "ระดับ",
                    options: [
                      { value: "error", label: "ต้องแก้" },
                      { value: "warning", label: "ควรตรวจ" },
                      { value: "info", label: "ข้อมูล" },
                    ],
                  },
                  {
                    key: "type",
                    label: "ประเภท",
                    options: Array.from(
                      new Set(
                        checkResult.problems.map(
                          (problem) => problem.problem_type,
                        ),
                      ),
                    ).map((problemType) => ({
                      value: problemType,
                      label: problemType,
                    })),
                  },
                ]}
              >
                {checkResult.problems.map((problem, index) => (
                  <tr
                    key={`${problem.problem_type}-${problem.problem_text}-${index}`}
                    data-filter-level={problem.problem_level}
                    data-filter-type={problem.problem_type}
                    data-search={`${problem.problem_type} ${problem.problem_text} ${problem.reference_text} ${getMenuLabel(problem.menu_hint)}`}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {problem.problem_type}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span
                        className={getProblemBadgeClass(problem.problem_level)}
                      >
                        {getProblemLevelText(problem.problem_level)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-800 dark:text-white/90">
                      {problem.problem_text}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {problem.reference_text}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <Link
                        href={problem.menu_hint}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#1c84c6] px-4 text-sm font-medium text-white hover:bg-[#1a7bb8]"
                      >
                        {getMenuLabel(problem.menu_hint)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
          ยังไม่มีรอบประเมินสถานะร่าง กรุณาสร้างรอบประเมินก่อน
        </div>
      )}
    </div>
  );
}