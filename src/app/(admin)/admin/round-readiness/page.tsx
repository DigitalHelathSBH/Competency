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
  missingLevel1: number;
  missingLevel2: number;
  selfAssignment: number;
  inactiveEvaluator: number;
  unmappedEvaluatorRank: number;
  lowerRankEvaluator: number;
  duplicateAssignmentLevel: number;
  missingWeightScope: number;
  missingCommonQuestion: number;
  missingProfessionQuestion: number;
  missingDescription: number;
};

type ProblemRow = {
  problem_type: string;
  problem_level: "error" | "warning" | "info";
  problem_text: string;
  reference_text: string;
  menu_hint: string;
};

type WeightRule = {
  scope_value: string;
  level1_weight: number;
  level2_weight: number;
  total_weight: number;
  level_count: number;
};

type WeightScope = {
  scope_value: string;
  scope_label: string;
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
    "/admin/assignments": "กำหนดผู้ประเมิน",
    "/admin/evaluator-weights": "น้ำหนักคะแนน",
    "/admin/questions": "หัวข้อประเมิน",
    "/admin/question-descriptions": "คำอธิบายหัวข้อ",
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
    missingLevel1: 0,
    missingLevel2: 0,
    selfAssignment: 0,
    inactiveEvaluator: 0,
    unmappedEvaluatorRank: 0,
    lowerRankEvaluator: 0,
    duplicateAssignmentLevel: 0,
    missingWeightScope: 0,
    missingCommonQuestion: 0,
    missingProfessionQuestion: 0,
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

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function isWeightComplete(rule: WeightRule | undefined) {
  if (!rule) return false;
  return rule.level_count >= 2 && Math.abs(Number(rule.total_weight || 0) - 100) < 0.01;
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

  const roundResult = await pool
    .request()
    .input("round_id", sql.Int, roundId)
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
          reference_text: `round_id: ${roundId}`,
          menu_hint: "/admin/rounds",
        },
      ],
      canOpenRound: false,
    };
  }

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
        '__DEFAULT__' AS scope_value,
        N'ค่า default ทุกกลุ่มภารกิจ' AS scope_label
      UNION ALL
      SELECT DISTINCT
        NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') AS scope_value,
        ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) + N' (' + NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') + N')' AS scope_label
      FROM dbo.competency_round_employee re
      LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
        ON ds.CODE = re.division_code
       AND ds.CTRLCODE = '10028'
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
        SUM(CASE WHEN evaluator_level = 1 AND active_status = 1 THEN CAST(weight_percent AS decimal(10,2)) ELSE 0 END) AS level1_weight,
        SUM(CASE WHEN evaluator_level = 2 AND active_status = 1 THEN CAST(weight_percent AS decimal(10,2)) ELSE 0 END) AS level2_weight,
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

  const weightRules = (weightRuleResult.recordset as WeightRule[]).map((rule) => ({
    ...rule,
    level1_weight: Number(rule.level1_weight || 0),
    level2_weight: Number(rule.level2_weight || 0),
    total_weight: Number(rule.total_weight || 0),
    level_count: Number(rule.level_count || 0),
  }));

  const weightRuleMap = new Map(weightRules.map((rule) => [rule.scope_value, rule]));
  const defaultWeightRule = weightRuleMap.get("__DEFAULT__");
  const defaultComplete = isWeightComplete(defaultWeightRule);

  const weightScopes = weightScopeResult.recordset as WeightScope[];
  const missingWeightScopes = weightScopes.filter((scope) => {
    if (scope.scope_value === "__DEFAULT__") {
      return !defaultComplete;
    }

    const divisionRule = weightRuleMap.get(scope.scope_value);
    return !isWeightComplete(divisionRule) && !defaultComplete;
  });
 
  const questionRecordsets =
    questionResult.recordsets as unknown as Array<Array<Record<string, unknown>>>;

  const commonQuestionCheck = questionRecordsets[0]?.[0] ?? {};
  const professionQuestionCheck = questionRecordsets[1]?.[0] ?? {};
  const descriptionCheck = questionRecordsets[2]?.[0] ?? {};

  const counts: SummaryCounts = {
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
    missingWeightScope: missingWeightScopes.length,
    missingCommonQuestion: toNumber(commonQuestionCheck.missing_common_question),
    missingProfessionQuestion: toNumber(professionQuestionCheck.missing_profession_question),
    missingDescription: toNumber(descriptionCheck.missing_description),
  };

  const problems: ProblemRow[] = [];

  if (Number(round.status_type) !== 0) {
    problems.push({
      problem_type: "รอบประเมิน",
      problem_level: "error",
      problem_text: `รอบนี้อยู่สถานะ ${roundStatusText(Number(round.status_type))} ไม่ใช่สถานะร่าง`,
      reference_text: round.round_code,
      menu_hint: "/admin/rounds",
    });
  }

  if (counts.totalEmployees <= 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: "ยังไม่มีผู้ถูกประเมินในรอบนี้",
      reference_text: round.round_code,
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingRankGroup > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "error",
      problem_text: `มีผู้ถูกประเมินที่ยังไม่มี rank_group ${counts.missingRankGroup} คน`,
      reference_text: "rank_group_id ว่าง",
      menu_hint: "/admin/rank-groups",
    });
  }

  if (counts.missingPositionCode > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "warning",
      problem_text: `มีผู้ถูกประเมินที่ไม่มี position_code ${counts.missingPositionCode} คน`,
      reference_text: "อาจกระทบคำถาม PROFESSION",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingDivisionCode > 0) {
    problems.push({
      problem_type: "ผู้ถูกประเมิน",
      problem_level: "warning",
      problem_text: `มีผู้ถูกประเมินที่ไม่มี division_code ${counts.missingDivisionCode} คน`,
      reference_text: "อาจกระทบน้ำหนักแบบแยกกลุ่มภารกิจ",
      menu_hint: "/admin/round-employees",
    });
  }

  if (counts.missingLevel1 > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `ยังไม่มีหัวหน้าใกล้ชิด ${counts.missingLevel1} คน`,
      reference_text: "evaluator_level = 1",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.missingLevel2 > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `ยังไม่มีหัวหน้าใหญ่ ${counts.missingLevel2} คน`,
      reference_text: "evaluator_level = 2 เฉพาะผู้ถูกประเมินที่ตั้งค่าให้ต้องมีผู้ประเมิน 2 คน",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.selfAssignment > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบรายการผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน ${counts.selfAssignment} รายการ`,
      reference_text: "payroll_no ตรงกัน",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.inactiveEvaluator > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ประเมินที่ไม่พบใน PYREXT หรือพ้นสภาพแล้ว ${counts.inactiveEvaluator} รายการ`,
      reference_text: "PYREXT.TERMINATEDATE",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.unmappedEvaluatorRank > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ประเมินที่ RANK ยังไม่ถูก map ${counts.unmappedEvaluatorRank} รายการ`,
      reference_text: "competency_rank_group_map",
      menu_hint: "/admin/rank-groups",
    });
  }

  if (counts.lowerRankEvaluator > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ประเมินที่ระดับต่ำกว่าผู้ถูกประเมิน ${counts.lowerRankEvaluator} รายการ`,
      reference_text: "sort_order ผู้ประเมิน < ผู้ถูกประเมิน",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.duplicateAssignmentLevel > 0) {
    problems.push({
      problem_type: "ผู้ประเมิน",
      problem_level: "error",
      problem_text: `พบผู้ถูกประเมินที่มีผู้ประเมินระดับเดียวกันซ้ำ ${counts.duplicateAssignmentLevel} คน`,
      reference_text: "round_employee_id + evaluator_level ซ้ำ",
      menu_hint: "/admin/assignments",
    });
  }

  if (counts.missingWeightScope > 0) {
    missingWeightScopes.forEach((scope) => {
      const rule = weightRuleMap.get(scope.scope_value);
      problems.push({
        problem_type: "น้ำหนักผู้ประเมิน",
        problem_level: "error",
        problem_text: `น้ำหนักผู้ประเมินยังไม่ครบ 100% สำหรับ ${scope.scope_label}`,
        reference_text: rule
          ? `level 1 ${formatPercent(Number(rule.level1_weight || 0))}, level 2 ${formatPercent(Number(rule.level2_weight || 0))}, รวม ${formatPercent(Number(rule.total_weight || 0))}`
          : "ยังไม่ได้กำหนดน้ำหนัก",
        menu_hint: "/admin/evaluator-weights",
      });
    });
  }

  if (counts.missingCommonQuestion > 0) {
    problems.push({
      problem_type: "หัวข้อประเมิน",
      problem_level: "error",
      problem_text: `หัวข้อ COMMON ข้อ 1-4 ยังไม่ครบ ${counts.missingCommonQuestion} ข้อ`,
      reference_text: "question_scope = COMMON",
      menu_hint: "/admin/questions",
    });
  }

  if (counts.missingProfessionQuestion > 0) {
    problems.push({
      problem_type: "หัวข้อประเมิน",
      problem_level: "error",
      problem_text: `หัวข้อ PROFESSION ข้อ 5-7 ยังไม่ครบ ${counts.missingProfessionQuestion} รายการตามวิชาชีพในรอบ`,
      reference_text: "question_scope = PROFESSION",
      menu_hint: "/admin/questions",
    });
  }

  if (counts.missingDescription > 0) {
    problems.push({
      problem_type: "คำอธิบายหัวข้อ",
      problem_level: "warning",
      problem_text: `ยังไม่มีคำอธิบาย current ครบตามหัวข้อและกลุ่มระดับ ${counts.missingDescription} รายการ`,
      reference_text: "question_no + rank_group_id",
      menu_hint: "/admin/question-descriptions",
    });
  }

  const canOpenRound =
    Number(round.status_type) === 0 &&
    counts.totalEmployees > 0 &&
    counts.missingRankGroup === 0 &&
    counts.missingLevel1 === 0 &&
    counts.selfAssignment === 0 &&
    counts.inactiveEvaluator === 0 &&
    counts.unmappedEvaluatorRank === 0 &&
    counts.lowerRankEvaluator === 0 &&
    counts.duplicateAssignmentLevel === 0 &&
    counts.missingWeightScope === 0 &&
    counts.missingCommonQuestion === 0 &&
    counts.missingProfessionQuestion === 0;

  return {
    round,
    counts,
    problems,
    canOpenRound,
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
  const selectedRoundId = Number(params?.round_id || draftRounds[0]?.round_id || 0);
  const checkResult = await getReadinessResult(selectedRoundId);
  const counts = checkResult.counts;

  const blockingProblemCount = checkResult.problems.filter(
    (problem) => problem.problem_level === "error",
  ).length;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="ตรวจสอบความพร้อมเปิดรอบ"
        description="ตรวจความพร้อมของรายชื่อผู้ถูกประเมิน ผู้ประเมิน น้ำหนัก หัวข้อประเมิน และคำอธิบายก่อนเปิดรอบจริง"
      />

      <ActionAlert
        type={params?.alert_type as "success" | "error" | "warning" | "info" | undefined}
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
                detail="นับเฉพาะรายการที่ยังไม่ถูกยกเลิก"
                tone={counts.totalEmployees > 0 ? "green" : "red"}
              />
              <SummaryCard
                title="ไม่มีผู้ประเมิน level 1"
                value={counts.missingLevel1}
                detail="หัวหน้าใกล้ชิดต้องครบทุกคน"
                tone={counts.missingLevel1 === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="ไม่มีผู้ประเมิน level 2"
                value={counts.missingLevel2}
                detail="ตรวจเฉพาะคนที่ต้องมีผู้ประเมิน 2 คน"
                tone={counts.missingLevel2 === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="น้ำหนักไม่ครบ"
                value={counts.missingWeightScope}
                detail="ตรวจ default และ fallback ตามกลุ่มภารกิจ"
                tone={counts.missingWeightScope === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="ไม่มี rank group"
                value={counts.missingRankGroup}
                detail="ต้อง map RANK เข้ากลุ่มระดับให้ครบ"
                tone={counts.missingRankGroup === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="หัวข้อ COMMON ไม่ครบ"
                value={counts.missingCommonQuestion}
                detail="ข้อ 1-4 ต้องมี current version"
                tone={counts.missingCommonQuestion === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="หัวข้อ PROFESSION ไม่ครบ"
                value={counts.missingProfessionQuestion}
                detail="ข้อ 5-7 ต้องครบตามวิชาชีพในรอบ"
                tone={counts.missingProfessionQuestion === 0 ? "green" : "red"}
              />
              <SummaryCard
                title="คำอธิบายยังไม่ครบ"
                value={counts.missingDescription}
                detail="ยังเปิดรอบได้ แต่ควรตรวจให้ครบก่อนใช้งานจริง"
                tone={counts.missingDescription === 0 ? "green" : "orange"}
              />
            </div>
          </div>

          <div className="mt-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-800 dark:text-white/90">
              รายการที่ต้องตรวจสอบ
            </h2>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <DataTable
                headers={["ประเภท", "ระดับ", "รายละเอียด", "อ้างอิง", "เมนูที่เกี่ยวข้อง"]}
                searchPlaceholder="ค้นหาประเภท / รายละเอียด / เมนู..."
                emptyText="ไม่พบปัญหา สามารถไปขั้นตอนเปิดรอบได้"
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
                    options: Array.from(new Set(checkResult.problems.map((problem) => problem.problem_type))).map(
                      (problemType) => ({ value: problemType, label: problemType }),
                    ),
                  },
                ]}
              >
                {checkResult.problems.map((problem, index) => (
                  <tr
                    key={`${problem.problem_type}-${problem.problem_text}-${index}`}
                    data-filter-level={problem.problem_level}
                    data-filter-type={problem.problem_type}
                    data-search={`${problem.problem_type} ${problem.problem_text} ${problem.reference_text} ${getMenuLabel(problem.menu_hint)} ${problem.menu_hint}`}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {problem.problem_type}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className={getProblemBadgeClass(problem.problem_level)}>
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
                        className="font-medium text-brand-600 hover:underline dark:text-brand-300"
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
