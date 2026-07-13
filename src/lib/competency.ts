import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "./db";

export type DashboardSummary = {
  open_round_count: number;
  my_pending_count: number;
  my_submitted_count: number;
  total_round_employee_count: number;
  total_assignment_count: number;
};

export type AssignmentRow = {
  assignment_id: number;
  round_code: string;
  round_status_type: number;
  employee_payroll_no: string;
  employee_full_name: string;
  position_code: string | null;
  rank_code: string | null;
  division_code: string | null;
  dept_code: string | null;
  section_code: string | null;
  section_name?: string | null;
  evaluator_level: number;
  assignment_status_type: number;
  evaluation_status_type: number | null;
  total_score: number | null;
  submitted_date: string | null;
};

export type EvaluationListRow = AssignmentRow & {
  division_name: string | null;
  section_name: string | null;
};

export type EvaluationQuestion = {
  round_question_id: number;
  question_no: number;
  question_title: string;
  description_text: string | null;
  max_score: number;
  weight_percent: number;
  score: number | null;
  comment_text: string | null;
};

export type EvaluationFormData = {
  assignment: AssignmentRow;
  questions: EvaluationQuestion[];
  can_edit: boolean;
};

export type EvaluationScoreTemplate = {
  template_key: string;
  template_assignment_id: number;
  employee_payroll_no: string;
  employee_full_name: string;
  evaluation_status_type: number | null;
  total_score: number | null;
  scores: Record<number, number | null>;
};

export type RoundRow = {
  round_id: number;
  round_year: number;
  round_no: number;
  round_code: string;
  start_date: string | null;
  end_date: string | null;
  status_type: number;
};

export type SimpleRow = Record<string, string | number | boolean | null>;

export async function safeFetch<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn();
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

export function statusText(
  value: number | null | undefined,
  scope: "round" | "evaluation" = "evaluation",
) {
  if (scope === "round") {
    if (value === 0) return "ร่าง";
    if (value === 1) return "เปิดประเมิน";
    if (value === 2) return "ปิดรอบ";
    if (value === 9) return "ยกเลิก";
  }

  if (value === 0) return "ร่าง";
  if (value === 1) return "ส่งแล้ว";
  if (value === 9) return "ยกเลิก";
  return "ยังไม่เริ่ม";
}

export function evaluatorLevelText(value: number) {
  if (value === 1) return "หัวหน้าใกล้ชิด";
  if (value === 2) return "หัวหน้าใหญ่";
  return `ระดับ ${value}`;
}

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

export async function getDashboardSummary(
  empId: string,
  isAdmin: boolean,
): Promise<DashboardSummary> {
  const pool = await getDbPool();

  const result = await pool.request().input("emp_id", sql.VarChar(20), empId)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.competency_round WHERE status_type = 1) AS open_round_count,
        (SELECT COUNT(*)
         FROM dbo.competency_evaluator_assignment a
         LEFT JOIN dbo.competency_evaluation ev ON ev.assignment_id = a.assignment_id
         JOIN dbo.competency_round_employee re ON re.round_employee_id = a.round_employee_id
         JOIN dbo.competency_round r ON r.round_id = re.round_id
         WHERE a.evaluator_payroll_no = @emp_id
           AND r.status_type = 1
           AND ISNULL(ev.status_type, 0) = 0
           AND a.status_type <> 9
           AND re.status_type <> 9) AS my_pending_count,
        (SELECT COUNT(*)
         FROM dbo.competency_evaluator_assignment a
         JOIN dbo.competency_evaluation ev ON ev.assignment_id = a.assignment_id
         JOIN dbo.competency_round r ON r.round_id = ev.round_id
         WHERE a.evaluator_payroll_no = @emp_id
           AND r.status_type IN (1, 2)
           AND a.status_type <> 9
           AND ev.status_type = 1) AS my_submitted_count,
        ${isAdmin ? `(SELECT COUNT(*) FROM dbo.competency_round_employee WHERE status_type <> 9)` : `CAST(0 AS int)`} AS total_round_employee_count,
        ${isAdmin ? `(SELECT COUNT(*) FROM dbo.competency_evaluator_assignment WHERE status_type <> 9)` : `CAST(0 AS int)`} AS total_assignment_count;
    `);

  return result.recordset[0] as DashboardSummary;
}

export async function getMyAssignments(
  empId: string,
  mode: "pending" | "history" = "pending",
): Promise<AssignmentRow[]> {
  const pool = await getDbPool();
  const submittedFilter =
    mode === "history"
      ? "AND r.status_type IN (1, 2) AND ev.status_type = 1"
      : "AND r.status_type = 1 AND ISNULL(ev.status_type, 0) <> 1";

  const result = await pool.request().input("emp_id", sql.VarChar(20), empId)
    .query(`
      SELECT
          a.assignment_id,
          r.round_code,
          r.status_type AS round_status_type,
          re.payroll_no AS employee_payroll_no,
          ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
          re.position_code,
          re.rank_code,
          re.division_code,
          re.dept_code,
          re.section_code,
          sectioncode.ThaiName AS section_name,
          a.evaluator_level,
          a.status_type AS assignment_status_type,
          ev.status_type AS evaluation_status_type,
          ev.total_score,
          CONVERT(varchar(19), ev.submitted_date, 120) AS submitted_date
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round r ON r.round_id = re.round_id
      OUTER APPLY (
          SELECT TOP 1
              ev2.evaluation_id,
              ev2.status_type,
              ev2.total_score,
              ev2.submitted_date
          FROM dbo.competency_evaluation ev2
          WHERE ev2.assignment_id = a.assignment_id
          ORDER BY ev2.evaluation_id DESC
      ) ev
      LEFT JOIN ${ssbDb()}.dbo.sectioncode sectioncode
          ON re.section_code = sectioncode.Code
      WHERE a.evaluator_payroll_no = @emp_id
        AND a.status_type <> 9
        AND re.status_type <> 9
        ${submittedFilter}
      ORDER BY r.round_year DESC, r.round_no DESC, re.payroll_no;
    `);

  return result.recordset as AssignmentRow[];
}

export async function getMyEvaluationAssignments(
  empId: string,
): Promise<EvaluationListRow[]> {
  const pool = await getDbPool();

  const result = await pool.request().input("emp_id", sql.VarChar(20), empId)
    .query(`
      SELECT
          a.assignment_id,
          r.round_code,
          r.status_type AS round_status_type,
          re.payroll_no AS employee_payroll_no,
          ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
          re.position_code,
          re.rank_code,
          re.division_code,
          re.dept_code,
          re.section_code,
          ISNULL(division_list.division_name, N'ไม่ระบุกลุ่มภารกิจ') AS division_name,
          sectioncode.ThaiName AS section_name,
          a.evaluator_level,
          a.status_type AS assignment_status_type,
          ev.status_type AS evaluation_status_type,
          ev.total_score,
          CONVERT(varchar(19), COALESCE(ev.submitted_date, a.submitted_date), 120) AS submitted_date
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
          ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round r
          ON r.round_id = re.round_id
      OUTER APPLY (
          SELECT TOP 1
              ev2.evaluation_id,
              ev2.status_type,
              ev2.total_score,
              ev2.submitted_date
          FROM dbo.competency_evaluation ev2
          WHERE ev2.assignment_id = a.assignment_id
          ORDER BY ev2.evaluation_id DESC
      ) ev
      LEFT JOIN (
          SELECT
              code,
              ${ssbDb()}.dbo.GetSSBName(ISNULL(thainame, englishname)) AS division_name
          FROM ${ssbDb()}.dbo.sysconfig
          WHERE ctrlcode = '10028'
      ) division_list
          ON division_list.code = re.division_code
      LEFT JOIN ${ssbDb()}.dbo.sectioncode sectioncode
          ON re.section_code = sectioncode.Code
      WHERE a.evaluator_payroll_no = @emp_id
        AND a.status_type <> 9
        AND re.status_type <> 9
        AND r.status_type = 1
      ORDER BY
          r.round_year DESC,
          r.round_no DESC,
          ISNULL(division_list.division_name, N'ไม่ระบุกลุ่มภารกิจ'),
          ISNULL(sectioncode.ThaiName, N''),
          re.payroll_no;
    `);

  return result.recordset as EvaluationListRow[];
}

export async function getEvaluationFormData(
  assignmentId: number,
  empId: string,
): Promise<EvaluationFormData | null> {
  const pool = await getDbPool();

  const assignmentResult = await pool
    .request()
    .input("assignment_id", sql.Int, assignmentId)
    .input("emp_id", sql.VarChar(20), empId).query(`
      SELECT TOP 1
          a.assignment_id,
          r.round_code,
          r.status_type AS round_status_type,
          re.payroll_no AS employee_payroll_no,
          ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
          re.position_code,
          re.rank_code,
          re.division_code,
          re.dept_code,
          re.section_code,
          sectioncode.ThaiName AS section_name,
          a.evaluator_level,
          a.status_type AS assignment_status_type,
          ev.status_type AS evaluation_status_type,
          ev.total_score,
          CONVERT(varchar(19), ev.submitted_date, 120) AS submitted_date
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round r ON r.round_id = re.round_id
      LEFT JOIN dbo.competency_evaluation ev ON ev.assignment_id = a.assignment_id
      LEFT JOIN ${ssbDb()}.dbo.sectioncode sectioncode
          ON re.section_code = sectioncode.Code
      WHERE a.assignment_id = @assignment_id
        AND a.evaluator_payroll_no = @emp_id
        AND a.status_type <> 9
          AND re.status_type <> 9;
    `);

  const assignment = assignmentResult.recordset[0] as AssignmentRow | undefined;
  if (!assignment) return null;

  const questionResult = await pool
    .request()
    .input("assignment_id", sql.Int, assignmentId)
    .input("emp_id", sql.VarChar(20), empId).query(`
      SELECT
          crq.round_question_id,
          crq.question_no,
          qv.question_title,
          qdv.description_text,
          crq.max_score,
          crq.weight_percent,
          ed.score,
          ed.comment_text
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round_question crq
          ON crq.round_id = re.round_id
         AND crq.active_status = 1
         AND crq.position_code = re.position_code
      JOIN dbo.competency_question_version qv
          ON qv.question_version_id = crq.question_version_id
      LEFT JOIN dbo.competency_question_description_version qdv
          ON qdv.question_version_id = crq.question_version_id
         AND qdv.rank_group_id = re.rank_group_id
         AND qdv.active_status = 1
      OUTER APPLY (
          SELECT TOP 1 ev2.evaluation_id
          FROM dbo.competency_evaluation ev2
          WHERE ev2.assignment_id = a.assignment_id
          ORDER BY ev2.evaluation_id DESC
      ) ev
      LEFT JOIN dbo.competency_evaluation_detail ed
          ON ed.evaluation_id = ev.evaluation_id
         AND ed.round_question_id = crq.round_question_id
      WHERE a.assignment_id = @assignment_id
        AND a.evaluator_payroll_no = @emp_id
        AND a.status_type <> 9
        AND re.status_type <> 9
      ORDER BY crq.question_no;
    `);

  return {
    assignment,
    questions: questionResult.recordset as EvaluationQuestion[],
    can_edit: assignment.round_status_type === 1,
  };
}

export async function getEvaluationScoreTemplates(
  assignmentId: number,
  empId: string,
): Promise<EvaluationScoreTemplate[]> {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input("assignment_id", sql.Int, assignmentId)
    .input("emp_id", sql.VarChar(20), empId).query(`
      SELECT
          a2.assignment_id AS template_assignment_id,
          re2.payroll_no AS employee_payroll_no,
          ${ssbDb()}.dbo.GetUserFullName(re2.payroll_no) AS employee_full_name,
          ev.status_type AS evaluation_status_type,
          ev.total_score,
          crq.question_no,
          ed.score
      FROM dbo.competency_evaluator_assignment current_a
      JOIN dbo.competency_round_employee current_re
          ON current_re.round_employee_id = current_a.round_employee_id
      JOIN dbo.competency_evaluator_assignment a2
          ON a2.evaluator_payroll_no = current_a.evaluator_payroll_no
         AND a2.assignment_id <> current_a.assignment_id
         AND a2.status_type <> 9
      JOIN dbo.competency_round_employee re2
          ON re2.round_employee_id = a2.round_employee_id
         AND re2.round_id = current_re.round_id
         AND re2.position_code = current_re.position_code
         AND re2.status_type <> 9
      JOIN dbo.competency_evaluation ev
          ON ev.assignment_id = a2.assignment_id
         AND ev.status_type IN (0, 1)
      JOIN dbo.competency_evaluation_detail ed
          ON ed.evaluation_id = ev.evaluation_id
         AND ed.score IS NOT NULL
      JOIN dbo.competency_round_question crq
          ON crq.round_question_id = ed.round_question_id
      WHERE current_a.assignment_id = @assignment_id
        AND current_a.evaluator_payroll_no = @emp_id
        AND current_a.status_type <> 9
        AND current_re.status_type <> 9
      ORDER BY re2.payroll_no, crq.question_no;
    `);

  const templateMap = new Map<number, EvaluationScoreTemplate>();

  for (const row of result.recordset as Array<{
    template_assignment_id: number;
    employee_payroll_no: string;
    employee_full_name: string;
    evaluation_status_type: number | null;
    total_score: number | null;
    question_no: number;
    score: number | null;
  }>) {
    const templateAssignmentId = Number(row.template_assignment_id);

    if (!templateMap.has(templateAssignmentId)) {
      templateMap.set(templateAssignmentId, {
        template_key: `assignment_${templateAssignmentId}`,
        template_assignment_id: templateAssignmentId,
        employee_payroll_no: row.employee_payroll_no,
        employee_full_name: row.employee_full_name,
        evaluation_status_type: row.evaluation_status_type,
        total_score: row.total_score,
        scores: {},
      });
    }

    const template = templateMap.get(templateAssignmentId);
    if (!template) continue;

    const score =
      row.score === null || row.score === undefined ? null : Number(row.score);
    template.scores[Number(row.question_no)] = Number.isFinite(score)
      ? score
      : null;
  }

  return Array.from(templateMap.values());
}

export async function saveEvaluation(
  assignmentId: number,
  empId: string,
  actionType: "draft" | "submit",
  details: {
    round_question_id: number;
    score: number | null;
    comment_text: string | null;
  }[],
) {
  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const request = new sql.Request(transaction);
    const check = await request
      .input("assignment_id", sql.Int, assignmentId)
      .input("emp_id", sql.VarChar(20), empId).query(`
        SELECT TOP 1
            a.assignment_id,
            a.round_employee_id,
            re.round_id,
            r.status_type AS round_status_type
        FROM dbo.competency_evaluator_assignment a
        JOIN dbo.competency_round_employee re ON re.round_employee_id = a.round_employee_id
        JOIN dbo.competency_round r ON r.round_id = re.round_id
        WHERE a.assignment_id = @assignment_id
          AND a.evaluator_payroll_no = @emp_id
          AND a.status_type <> 9
          AND re.status_type <> 9;
      `);

    const assignment = check.recordset[0];
    if (!assignment)
      throw new Error("ไม่พบรายการประเมิน หรือไม่มีสิทธิ์เข้าถึง");
    if (Number(assignment.round_status_type) !== 1)
      throw new Error(
        "รอบประเมินยังไม่เปิด หรือถูกปิดแล้ว ไม่สามารถบันทึกผลประเมินได้",
      );

    const allowedQuestionResult = await new sql.Request(transaction)
      .input("assignment_id", sql.Int, assignmentId)
      .input("emp_id", sql.VarChar(20), empId).query(`
        SELECT
          crq.round_question_id,
          crq.max_score,
          crq.weight_percent
        FROM dbo.competency_evaluator_assignment a
        JOIN dbo.competency_round_employee re
          ON re.round_employee_id = a.round_employee_id
        JOIN dbo.competency_round_question crq
          ON crq.round_id = re.round_id
         AND crq.position_code = re.position_code
         AND crq.active_status = 1
        WHERE a.assignment_id = @assignment_id
          AND a.evaluator_payroll_no = @emp_id
          AND a.status_type <> 9
          AND re.status_type <> 9;
      `);

    const allowedQuestionMap = new Map<
      number,
      { max_score: number; weight_percent: number }
    >();

    for (const row of allowedQuestionResult.recordset as Array<{
      round_question_id: number;
      max_score: number;
      weight_percent: number;
    }>) {
      allowedQuestionMap.set(Number(row.round_question_id), {
        max_score: Number(row.max_score),
        weight_percent: Number(row.weight_percent),
      });
    }

    if (allowedQuestionMap.size === 0) {
      throw new Error("ไม่พบหัวข้อประเมินสำหรับผู้ถูกประเมินรายนี้");
    }

    const totalQuestionWeight = Array.from(allowedQuestionMap.values()).reduce(
      (total, question) => total + Number(question.weight_percent || 0),
      0,
    );

    if (
      ![4, 7].includes(allowedQuestionMap.size) ||
      Math.abs(totalQuestionWeight - 100) > 0.01
    ) {
      throw new Error(
        "ชุดหัวข้อประเมินยังไม่สมบูรณ์ กรุณาแจ้งผู้ดูแลระบบตรวจสอบรอบประเมิน",
      );
    }

    const submittedQuestionIds = new Set<number>();

    for (const detail of details) {
      const questionId = Number(detail.round_question_id);
      const question = allowedQuestionMap.get(questionId);

      if (!question) {
        throw new Error("พบหัวข้อประเมินที่ไม่อยู่ในชุดคำถามของรายการนี้");
      }

      if (submittedQuestionIds.has(questionId)) {
        throw new Error("พบหัวข้อประเมินซ้ำ");
      }
      submittedQuestionIds.add(questionId);

      if (detail.score !== null) {
        const score = Number(detail.score);
        if (
          !Number.isFinite(score) ||
          score < 0 ||
          score > question.max_score
        ) {
          throw new Error("คะแนนที่ระบุไม่อยู่ในช่วงที่อนุญาต");
        }
      }
    }

    if (actionType === "submit") {
      for (const questionId of allowedQuestionMap.keys()) {
        const detail = details.find(
          (item) => Number(item.round_question_id) === questionId,
        );
        if (!detail || detail.score === null) {
          throw new Error("กรุณาให้คะแนนทุกหัวข้อก่อนส่งผลประเมิน");
        }
      }
    }

    const statusType = actionType === "submit" ? 1 : 0;

    const evaluationRequest = new sql.Request(transaction);
    const existing = await evaluationRequest.input(
      "assignment_id",
      sql.Int,
      assignmentId,
    ).query(`
        SELECT TOP 1 evaluation_id, status_type
        FROM dbo.competency_evaluation
        WHERE assignment_id = @assignment_id
        ORDER BY evaluation_id DESC;
      `);

    let evaluationId: number;
    if (existing.recordset[0]) {
      const existingStatusType = Number(existing.recordset[0].status_type || 0);
      const nextStatusType = existingStatusType === 1 ? 1 : statusType;

      evaluationId = existing.recordset[0].evaluation_id;
      await new sql.Request(transaction)
        .input("evaluation_id", sql.Int, evaluationId)
        .input("status_type", sql.TinyInt, nextStatusType).query(`
          UPDATE dbo.competency_evaluation
          SET status_type = @status_type,
              submitted_date = CASE
                  WHEN @status_type = 1 THEN SYSDATETIME()
                  ELSE NULL
              END
          WHERE evaluation_id = @evaluation_id;
        `);
    } else {
      const inserted = await new sql.Request(transaction)
        .input("assignment_id", sql.Int, assignmentId)
        .input("round_employee_id", sql.Int, assignment.round_employee_id)
        .input("round_id", sql.Int, assignment.round_id)
        .input("evaluator_payroll_no", sql.VarChar(20), empId)
        .input("status_type", sql.TinyInt, statusType).query(`
          INSERT INTO dbo.competency_evaluation
              (assignment_id, round_employee_id, round_id, evaluator_payroll_no, status_type, submitted_date)
          OUTPUT inserted.evaluation_id
          VALUES
              (@assignment_id, @round_employee_id, @round_id, @evaluator_payroll_no, @status_type,
               CASE WHEN @status_type = 1 THEN SYSDATETIME() ELSE NULL END);
        `);
      evaluationId = inserted.recordset[0].evaluation_id;
    }

    for (const detail of details) {
      await new sql.Request(transaction)
        .input("evaluation_id", sql.Int, evaluationId)
        .input("round_question_id", sql.Int, detail.round_question_id)
        .input("score", sql.Decimal(4, 2), detail.score)
        .input("comment_text", sql.NVarChar(sql.MAX), detail.comment_text)
        .query(`
          IF EXISTS (
              SELECT 1
              FROM dbo.competency_evaluation_detail
              WHERE evaluation_id = @evaluation_id
                AND round_question_id = @round_question_id
          )
          BEGIN
              UPDATE dbo.competency_evaluation_detail
              SET score = @score,
                  comment_text = @comment_text
              WHERE evaluation_id = @evaluation_id
                AND round_question_id = @round_question_id;
          END
          ELSE
          BEGIN
              INSERT INTO dbo.competency_evaluation_detail
                  (evaluation_id, round_question_id, score, comment_text)
              VALUES
                  (@evaluation_id, @round_question_id, @score, @comment_text);
          END
        `);
    }

    await new sql.Request(transaction).input(
      "evaluation_id",
      sql.Int,
      evaluationId,
    ).query(`
        UPDATE ev
        SET total_score = score_sum.total_score
        FROM dbo.competency_evaluation ev
        CROSS APPLY (
          SELECT
            CAST(
              SUM(
                CASE
                  WHEN crq.max_score > 0
                  THEN ISNULL(ed.score, 0) * crq.weight_percent / crq.max_score
                  ELSE 0
                END
              )
              AS decimal(6,2)
            ) AS total_score
          FROM dbo.competency_evaluation_detail ed
          JOIN dbo.competency_round_question crq
            ON crq.round_question_id = ed.round_question_id
           AND crq.active_status = 1
          WHERE ed.evaluation_id = ev.evaluation_id
        ) score_sum
        WHERE ev.evaluation_id = @evaluation_id;
      `);

    const savedEvaluation = await new sql.Request(transaction).input(
      "evaluation_id",
      sql.Int,
      evaluationId,
    ).query(`
        SELECT status_type
        FROM dbo.competency_evaluation
        WHERE evaluation_id = @evaluation_id;
      `);

    if (Number(savedEvaluation.recordset[0]?.status_type || 0) === 1) {
      await new sql.Request(transaction).input(
        "assignment_id",
        sql.Int,
        assignmentId,
      ).query(`
          UPDATE dbo.competency_evaluator_assignment
          SET status_type = 1,
              submitted_date = SYSDATETIME()
          WHERE assignment_id = @assignment_id;
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getRounds(): Promise<RoundRow[]> {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT round_id, round_year, round_no, round_code,
           CONVERT(varchar(10), start_date, 120) AS start_date,
           CONVERT(varchar(10), end_date, 120) AS end_date,
           status_type
    FROM dbo.competency_round
    ORDER BY round_year DESC, round_no DESC;
  `);
  return result.recordset as RoundRow[];
}

export async function createRound(formData: FormData, createdBy: string) {
  const roundYear = Number(formData.get("round_year"));
  const roundNo = Number(formData.get("round_no"));
  const startDate = String(formData.get("start_date") || "");
  const endDate = String(formData.get("end_date") || "");

  if (!Number.isInteger(roundYear) || roundYear < 2500) {
    throw new Error("ปีงบประมาณไม่ถูกต้อง");
  }

  if (!Number.isInteger(roundNo) || roundNo < 1 || roundNo > 2) {
    throw new Error("รอบประเมินต้องเป็นรอบ 1 หรือ 2 เท่านั้น");
  }

  if (!startDate || !endDate) {
    throw new Error("กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด");
  }

  if (startDate > endDate) {
    throw new Error("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
  }

  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const checkRequest = new sql.Request(transaction);

    const checkResult = await checkRequest.input(
      "round_year",
      sql.SmallInt,
      roundYear,
    ).query(`
        SELECT ISNULL(MAX(round_no), 0) AS max_round_no
        FROM dbo.competency_round WITH (UPDLOCK, HOLDLOCK)
        WHERE round_year = @round_year
          AND status_type <> 9;
      `);

    const maxRoundNo = Number(checkResult.recordset[0]?.max_round_no ?? 0);
    const expectedRoundNo = maxRoundNo + 1;

    if (expectedRoundNo > 2) {
      throw new Error(`ปีงบ ${roundYear} มีรอบประเมินครบ 2 รอบแล้ว`);
    }

    if (roundNo !== expectedRoundNo) {
      throw new Error(
        `ปีงบ ${roundYear} ต้องสร้างรอบ ${expectedRoundNo} เป็นลำดับถัดไปเท่านั้น`,
      );
    }

    const roundCode = `${roundYear}/${roundNo}`;

    const insertRequest = new sql.Request(transaction);

    await insertRequest
      .input("round_year", sql.SmallInt, roundYear)
      .input("round_no", sql.TinyInt, roundNo)
      .input("round_code", sql.VarChar(20), roundCode)
      .input("start_date", sql.Date, startDate)
      .input("end_date", sql.Date, endDate)
      .input("created_by", sql.VarChar(20), createdBy).query(`
        INSERT INTO dbo.competency_round
            (round_year, round_no, round_code, start_date, end_date, status_type, created_by)
        VALUES
            (@round_year, @round_no, @round_code, @start_date, @end_date, 0, @created_by);
      `);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
export async function getAdminTableRows(
  tableName: string,
  top = 100,
): Promise<SimpleRow[]> {
  const allowedTables = new Set([
    "competency_rank_group",
    "competency_rank_group_map",
    "competency_tenure_rank_group",
    "competency_site_percent",
    "competency_question",
    "competency_question_version",
    "competency_question_description_version",
    "competency_profession_question_map",
    "competency_round_employee",
    "competency_evaluator_assignment",
    "competency_evaluator_weight",
  ]);

  if (!allowedTables.has(tableName)) throw new Error("Invalid table name");
  const pool = await getDbPool();
  const result = await pool
    .request()
    .query(`SELECT TOP (${top}) * FROM dbo.${tableName} ORDER BY 1 DESC;`);
  return result.recordset as SimpleRow[];
}

export async function createEvaluatorWeight(
  formData: FormData,
  createdBy: string,
) {
  const pool = await getDbPool();
  await pool
    .request()
    .input("round_id", sql.Int, Number(formData.get("round_id")))
    .input(
      "division_code",
      sql.VarChar(20),
      String(formData.get("division_code") || ""),
    )
    .input(
      "evaluator_level",
      sql.TinyInt,
      Number(formData.get("evaluator_level")),
    )
    .input(
      "weight_percent",
      sql.Decimal(5, 2),
      Number(formData.get("weight_percent")),
    )
    .input("created_by", sql.VarChar(20), createdBy).query(`
      INSERT INTO dbo.competency_evaluator_weight
          (round_id, division_code, evaluator_level, weight_percent, active_status, created_by)
      VALUES
          (@round_id, @division_code, @evaluator_level, @weight_percent, 1, @created_by);
    `);
}

export type CompetencyReportRound = {
  round_id: number;
  round_year: number;
  round_no: number;
  round_code: string;
  status_type: number;
  start_date: string | null;
  end_date: string | null;
};

export type CompetencyReportRow = {
  round_code: string;
  payroll_no: string;
  employee_full_name: string;
  division_code: string | null;
  division_name: string | null;
  section_code: string | null;
  section_name: string | null;
  evaluator_required_type: number;
  expected_evaluator_count: number;
  submitted_evaluator_count: number;
  level1_score: number | null;
  level2_score: number | null;
  level1_weight: number | null;
  level2_weight: number | null;
  weight_total: number | null;
  max_possible_score: number | null;
  competency_percent: number | null;
  final_score: number | null;
  competency_score: number | null;
  level1_submitted_date: string | null;
  level2_submitted_date: string | null;
  report_status: string;
};

export type CompetencyReportDivisionSummary = {
  division_code: string;
  division_name: string;
  total_employee_count: number;
  completed_employee_count: number;
  pending_employee_count: number;
  weight_issue_count: number;
  average_final_score: number | null;
  average_competency_score?: number | null;
};

export type CompetencyReportData = {
  rounds: CompetencyReportRound[];
  selected_round: CompetencyReportRound | null;
  summary: {
    total_employee_count: number;
    completed_employee_count: number;
    pending_employee_count: number;
    weight_issue_count: number;
    average_final_score: number | null;
    average_competency_score?: number | null;
  };
  division_summary: CompetencyReportDivisionSummary[];
  rows: CompetencyReportRow[];
};

export async function getWeightedReport(
  selectedRoundId?: number | null,
  evaluatorPayrollNo?: string | null,
): Promise<CompetencyReportData> {
  const pool = await getDbPool();
  const evaluatorFilter = String(evaluatorPayrollNo || "").trim();

  const roundsResult = await pool
    .request()
    .input("evaluator_payroll_no", sql.VarChar(20), evaluatorFilter).query(`
    SELECT
        round_id,
        round_year,
        round_no,
        round_code,
        status_type,
        CONVERT(varchar(10), start_date, 120) AS start_date,
        CONVERT(varchar(10), end_date, 120) AS end_date
    FROM dbo.competency_round r
    WHERE r.status_type IN (1, 2)
      AND (
          @evaluator_payroll_no = ''
          OR EXISTS (
              SELECT 1
              FROM dbo.competency_round_employee re_filter
              JOIN dbo.competency_evaluator_assignment a_filter
                  ON a_filter.round_employee_id = re_filter.round_employee_id
                 AND a_filter.status_type <> 9
              WHERE re_filter.round_id = r.round_id
                AND re_filter.status_type <> 9
                AND a_filter.evaluator_payroll_no = @evaluator_payroll_no
          )
      )
    ORDER BY
        CASE WHEN r.status_type = 1 THEN 0 ELSE 1 END,
        r.round_year DESC,
        r.round_no DESC,
        r.round_id DESC;
  `);

  const rounds = roundsResult.recordset as CompetencyReportRound[];
  const requestedRoundId = Number(selectedRoundId || 0);
  const selectedRound =
    rounds.find((round) => Number(round.round_id) === requestedRoundId) ||
    rounds[0] ||
    null;

  if (!selectedRound) {
    return {
      rounds,
      selected_round: null,
      summary: {
        total_employee_count: 0,
        completed_employee_count: 0,
        pending_employee_count: 0,
        weight_issue_count: 0,
        average_final_score: null,
        average_competency_score: null,
      },
      division_summary: [],
      rows: [],
    };
  }

  const result = await pool
    .request()
    .input("round_id", sql.Int, selectedRound.round_id)
    .input("evaluator_payroll_no", sql.VarChar(20), evaluatorFilter).query(`
      SELECT
          row_data.round_code,
          row_data.payroll_no,
          row_data.employee_full_name,
          row_data.division_code,
          row_data.division_name,
          row_data.section_code,
          row_data.section_name,
          row_data.evaluator_required_type,
          row_data.expected_evaluator_count,
          row_data.submitted_evaluator_count,
          row_data.level1_score,
          row_data.level2_score,
          row_data.level1_weight,
          row_data.level2_weight,
          row_data.weight_total,
          row_data.max_possible_score,
          row_data.competency_percent,
          row_data.final_score,
          row_data.competency_score,
          row_data.level1_submitted_date,
          row_data.level2_submitted_date,
          CASE
              WHEN row_data.evaluator_required_type = 2 AND ISNULL(row_data.weight_total, 0) <> 100
                  THEN N'น้ำหนักไม่ครบ 100%'
              WHEN row_data.submitted_evaluator_count >= row_data.expected_evaluator_count
                  THEN N'ประเมินครบ'
              ELSE N'รอประเมิน'
          END AS report_status
      FROM (
          SELECT
              r.round_code,
              re.payroll_no,
              ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
              re.division_code,
              ISNULL(division_list.division_name, N'ไม่ระบุกลุ่มภารกิจ') AS division_name,
              re.section_code,
              sectioncode.ThaiName AS section_name,
              ISNULL(re.evaluator_required_type, 2) AS evaluator_required_type,
              CASE WHEN ISNULL(re.evaluator_required_type, 2) = 1 THEN 1 ELSE 2 END AS expected_evaluator_count,
              ISNULL(level1.is_submitted, 0) +
                  CASE WHEN ISNULL(re.evaluator_required_type, 2) = 1 THEN 0 ELSE ISNULL(level2.is_submitted, 0) END
                  AS submitted_evaluator_count,
              level1.score AS level1_score,
              level2.score AS level2_score,
              CASE
                  WHEN ISNULL(re.evaluator_required_type, 2) = 1 THEN CAST(100 AS decimal(5,2))
                  ELSE CAST(ISNULL(level1_weight.weight_percent, default_level1_weight.weight_percent) AS decimal(5,2))
              END AS level1_weight,
              CASE
                  WHEN ISNULL(re.evaluator_required_type, 2) = 1 THEN CAST(0 AS decimal(5,2))
                  ELSE CAST(ISNULL(level2_weight.weight_percent, default_level2_weight.weight_percent) AS decimal(5,2))
              END AS level2_weight,
              CASE
                  WHEN ISNULL(re.evaluator_required_type, 2) = 1 THEN CAST(100 AS decimal(5,2))
                  ELSE CAST(
                      ISNULL(ISNULL(level1_weight.weight_percent, default_level1_weight.weight_percent), 0) +
                      ISNULL(ISNULL(level2_weight.weight_percent, default_level2_weight.weight_percent), 0)
                      AS decimal(5,2)
                  )
              END AS weight_total,
              max_score_total.max_possible_score,
              CAST(ISNULL(re.competency_percent, 20) AS decimal(5,2)) AS competency_percent,
              CAST(
                  CASE
                      WHEN ISNULL(re.evaluator_required_type, 2) = 1
                          THEN level1.score
                      ELSE
                          ISNULL(level1.score, 0) * ISNULL(ISNULL(level1_weight.weight_percent, default_level1_weight.weight_percent), 0) / 100.0 +
                          ISNULL(level2.score, 0) * ISNULL(ISNULL(level2_weight.weight_percent, default_level2_weight.weight_percent), 0) / 100.0
                  END
                  AS decimal(8,2)
              ) AS final_score,
              CAST(
                  CASE
                      WHEN ISNULL(max_score_total.max_possible_score, 0) <= 0 THEN NULL
                      ELSE
                          (
                              CASE
                                  WHEN ISNULL(re.evaluator_required_type, 2) = 1
                                      THEN ISNULL(level1.score, 0)
                                  ELSE
                                      ISNULL(level1.score, 0) * ISNULL(ISNULL(level1_weight.weight_percent, default_level1_weight.weight_percent), 0) / 100.0 +
                                      ISNULL(level2.score, 0) * ISNULL(ISNULL(level2_weight.weight_percent, default_level2_weight.weight_percent), 0) / 100.0
                              END
                          ) * ISNULL(re.competency_percent, 20) / 100.0
                  END
                  AS decimal(8,2)
              ) AS competency_score,
              level1.submitted_date AS level1_submitted_date,
              level2.submitted_date AS level2_submitted_date
          FROM dbo.competency_round_employee re
          JOIN dbo.competency_round r
              ON r.round_id = re.round_id
          OUTER APPLY (
              SELECT
                  CAST(SUM(CAST(crq.weight_percent AS decimal(8,2))) AS decimal(8,2)) AS max_possible_score
              FROM dbo.competency_round_question crq
              WHERE crq.round_id = re.round_id
                AND crq.active_status = 1
                AND crq.position_code = re.position_code
          ) max_score_total
          OUTER APPLY (
              SELECT TOP 1
                  CAST(ev.total_score AS decimal(8,2)) AS score,
                  CASE WHEN ev.status_type = 1 THEN 1 ELSE 0 END AS is_submitted,
                  CONVERT(varchar(19), ev.submitted_date, 120) AS submitted_date
              FROM dbo.competency_evaluator_assignment a
              JOIN dbo.competency_evaluation ev
                  ON ev.assignment_id = a.assignment_id
                 AND ev.status_type = 1
              WHERE a.round_employee_id = re.round_employee_id
                AND a.evaluator_level = 1
                AND a.status_type <> 9
              ORDER BY ev.evaluation_id DESC
          ) level1
          OUTER APPLY (
              SELECT TOP 1
                  CAST(ev.total_score AS decimal(8,2)) AS score,
                  CASE WHEN ev.status_type = 1 THEN 1 ELSE 0 END AS is_submitted,
                  CONVERT(varchar(19), ev.submitted_date, 120) AS submitted_date
              FROM dbo.competency_evaluator_assignment a
              JOIN dbo.competency_evaluation ev
                  ON ev.assignment_id = a.assignment_id
                 AND ev.status_type = 1
              WHERE a.round_employee_id = re.round_employee_id
                AND a.evaluator_level = 2
                AND a.status_type <> 9
              ORDER BY ev.evaluation_id DESC
          ) level2
          OUTER APPLY (
              SELECT TOP 1 w.weight_percent
              FROM dbo.competency_evaluator_weight w
              WHERE w.round_id = re.round_id
                AND w.division_code = ISNULL(re.division_code, '')
                AND w.evaluator_level = 1
                AND w.active_status = 1
              ORDER BY w.evaluator_weight_id DESC
          ) level1_weight
          OUTER APPLY (
              SELECT TOP 1 w.weight_percent
              FROM dbo.competency_evaluator_weight w
              WHERE w.round_id = re.round_id
                AND w.division_code = ISNULL(re.division_code, '')
                AND w.evaluator_level = 2
                AND w.active_status = 1
              ORDER BY w.evaluator_weight_id DESC
          ) level2_weight
          OUTER APPLY (
              SELECT TOP 1 w.weight_percent
              FROM dbo.competency_evaluator_weight w
              WHERE w.round_id = re.round_id
                AND w.division_code = ''
                AND w.evaluator_level = 1
                AND w.active_status = 1
              ORDER BY w.evaluator_weight_id DESC
          ) default_level1_weight
          OUTER APPLY (
              SELECT TOP 1 w.weight_percent
              FROM dbo.competency_evaluator_weight w
              WHERE w.round_id = re.round_id
                AND w.division_code = ''
                AND w.evaluator_level = 2
                AND w.active_status = 1
              ORDER BY w.evaluator_weight_id DESC
          ) default_level2_weight
          LEFT JOIN (
              SELECT
                  code,
                  ${ssbDb()}.dbo.GetSSBName(ISNULL(thainame, englishname)) AS division_name
              FROM ${ssbDb()}.dbo.sysconfig
              WHERE ctrlcode = '10028'
          ) division_list
              ON division_list.code = re.division_code
          LEFT JOIN ${ssbDb()}.dbo.sectioncode sectioncode
              ON sectioncode.Code = re.section_code
          WHERE re.round_id = @round_id
            AND re.status_type <> 9
            AND (
                @evaluator_payroll_no = ''
                OR EXISTS (
                    SELECT 1
                    FROM dbo.competency_evaluator_assignment own_assignment
                    WHERE own_assignment.round_employee_id = re.round_employee_id
                      AND own_assignment.evaluator_payroll_no = @evaluator_payroll_no
                      AND own_assignment.status_type <> 9
                )
            )
      ) row_data
      ORDER BY
          row_data.division_name,
          ISNULL(row_data.section_name, N''),
          row_data.employee_full_name,
          row_data.payroll_no;
    `);

  const rows = result.recordset as CompetencyReportRow[];
  const totalEmployeeCount = rows.length;
  const completedEmployeeCount = rows.filter(
    (row) => row.report_status === "ประเมินครบ",
  ).length;
  const weightIssueCount = rows.filter(
    (row) => row.report_status === "น้ำหนักไม่ครบ 100%",
  ).length;
  const completedScores = rows
    .filter((row) => row.report_status === "ประเมินครบ")
    .map((row) => Number(row.final_score))
    .filter((score) => Number.isFinite(score));
  const averageFinalScore =
    completedScores.length > 0
      ? Number(
          (
            completedScores.reduce((total, score) => total + score, 0) /
            completedScores.length
          ).toFixed(2),
        )
      : null;
  const completedCompetencyScores = rows
    .filter((row) => row.report_status === "ประเมินครบ")
    .map((row) => Number(row.competency_score))
    .filter((score) => Number.isFinite(score));
  const averageCompetencyScore =
    completedCompetencyScores.length > 0
      ? Number(
          (
            completedCompetencyScores.reduce(
              (total, score) => total + score,
              0,
            ) / completedCompetencyScores.length
          ).toFixed(2),
        )
      : null;

  const divisionMap = new Map<string, CompetencyReportDivisionSummary>();

  for (const row of rows) {
    const divisionCode = row.division_code || "";
    const divisionName = row.division_name || "ไม่ระบุกลุ่มภารกิจ";
    const key = `${divisionCode}::${divisionName}`;

    if (!divisionMap.has(key)) {
      divisionMap.set(key, {
        division_code: divisionCode,
        division_name: divisionName,
        total_employee_count: 0,
        completed_employee_count: 0,
        pending_employee_count: 0,
        weight_issue_count: 0,
        average_final_score: null,
        average_competency_score: null,
      });
    }

    const item = divisionMap.get(key);
    if (!item) continue;

    item.total_employee_count += 1;
    if (row.report_status === "ประเมินครบ") item.completed_employee_count += 1;
    if (row.report_status === "รอประเมิน") item.pending_employee_count += 1;
    if (row.report_status === "น้ำหนักไม่ครบ 100%")
      item.weight_issue_count += 1;
  }

  for (const item of divisionMap.values()) {
    const divisionScores = rows
      .filter(
        (row) =>
          (row.division_code || "") === item.division_code &&
          (row.division_name || "ไม่ระบุกลุ่มภารกิจ") === item.division_name &&
          row.report_status === "ประเมินครบ",
      )
      .map((row) => Number(row.final_score))
      .filter((score) => Number.isFinite(score));

    item.average_final_score =
      divisionScores.length > 0
        ? Number(
            (
              divisionScores.reduce((total, score) => total + score, 0) /
              divisionScores.length
            ).toFixed(2),
          )
        : null;

    const divisionCompetencyScores = rows
      .filter(
        (row) =>
          (row.division_code || "") === item.division_code &&
          (row.division_name || "ไม่ระบุกลุ่มภารกิจ") === item.division_name &&
          row.report_status === "ประเมินครบ",
      )
      .map((row) => Number(row.competency_score))
      .filter((score) => Number.isFinite(score));

    item.average_competency_score =
      divisionCompetencyScores.length > 0
        ? Number(
            (
              divisionCompetencyScores.reduce(
                (total, score) => total + score,
                0,
              ) / divisionCompetencyScores.length
            ).toFixed(2),
          )
        : null;
  }

  return {
    rounds,
    selected_round: selectedRound,
    summary: {
      total_employee_count: totalEmployeeCount,
      completed_employee_count: completedEmployeeCount,
      pending_employee_count: totalEmployeeCount - completedEmployeeCount,
      weight_issue_count: weightIssueCount,
      average_final_score: averageFinalScore,
      average_competency_score: averageCompetencyScore,
    },
    division_summary: Array.from(divisionMap.values()),
    rows,
  };
}