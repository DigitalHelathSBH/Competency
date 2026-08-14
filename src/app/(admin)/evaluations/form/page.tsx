import ActionAlert from "@/components/competency/ActionAlert";
import DepartmentEvaluationForm from "@/components/competency/DepartmentEvaluationForm";
import PageHeader from "@/components/competency/PageHeader";
import {
  saveEvaluation,
  type EvaluationFormData,
  type EvaluationQuestion,
  type EvaluationScoreTemplate,
} from "@/lib/competency";
import {
  getDbPool,
  getSsbDatabaseName,
  quoteSqlName,
  sql,
} from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const EVALUATION_SECTION_COOKIE =
  "competency_evaluation_section_code";
const EVALUATION_ROUND_COOKIE =
  "competency_evaluation_round_code";
const EVALUATION_RETURN_COOKIE =
  "competency_evaluation_return_path";
const EVALUATION_NOTICE_COOKIE =
  "competency_evaluation_notice";

function shouldUseSecureCookie() {
  const cookieSecure = process.env.COOKIE_SECURE
    ?.trim()
    .toLowerCase();

  if (cookieSecure === "true") return true;
  if (cookieSecure === "false") return false;

  return process.env.NODE_ENV === "production";
}

type Notice = {
  type: "success" | "error";
  message: string;
};

function parseNotice(
  value: string | undefined,
): Notice | null {
  if (!value) return null;

  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) return null;

  const type = value.slice(0, separatorIndex);
  const encodedMessage = value.slice(
    separatorIndex + 1,
  );

  if (
    type !== "success" &&
    type !== "error"
  ) {
    return null;
  }

  try {
    return {
      type,
      message: decodeURIComponent(
        encodedMessage,
      ),
    };
  } catch {
    return null;
  }
}

async function setNoticeCookie(
  type: "success" | "error",
  message: string,
) {
  const cookieStore = await cookies();

  cookieStore.set(
    EVALUATION_NOTICE_COOKIE,
    `${type}:${encodeURIComponent(message)}`,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge:
        type === "success" ? 8 : 30,
      path: "/",
    },
  );
}

function decodeCookieValue(
  value: string | undefined,
) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

async function getCompetencyModuleStatus(
  roundCode: string,
) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "round_code",
      sql.VarChar(50),
      roundCode,
    )
    .query(`
      SELECT TOP (1)
        module_status.status_type
      FROM dbo.competency_round r
      JOIN dbo.performance_round_module
        module_status
        ON module_status.round_id =
           r.round_id
       AND module_status.module_type =
           'COMPETENCY'
      WHERE r.round_code = @round_code;
    `);

  const row = result.recordset[0];

  return row
    ? Number(row.status_type)
    : null;
}

type SectionFormRow = {
  assignment_id: number;
  round_code: string;
  round_status_type: number;
  employee_payroll_no: string;
  employee_full_name: string | null;
  position_code: string | null;
  rank_code: string | null;
  division_code: string | null;
  dept_code: string | null;
  section_code: string | null;
  section_name: string | null;
  evaluator_level: number;
  assignment_status_type: number;
  evaluation_status_type: number | null;
  total_score: number | null;
  submitted_date: string | null;
  round_question_id: number | null;
  question_no: number | null;
  question_title: string | null;
  description_text: string | null;
  max_score: number | null;
  score: number | null;
  comment_text: string | null;
};

async function getSectionEvaluationFormData(
  evaluatorPayrollNo: string,
  sectionCode: string,
  roundCode: string,
  moduleStatus: number | null,
) {
  const pool = await getDbPool();
  const ssbDb = quoteSqlName(
    getSsbDatabaseName(),
  );

  const result = await pool
    .request()
    .input(
      "evaluator_payroll_no",
      sql.VarChar(20),
      evaluatorPayrollNo,
    )
    .input(
      "section_code",
      sql.VarChar(20),
      sectionCode,
    )
    .input(
      "round_code",
      sql.VarChar(50),
      roundCode,
    )
    .query(`
      SELECT
          a.assignment_id,
          r.round_code,
          r.status_type AS round_status_type,
          re.payroll_no AS employee_payroll_no,
          (
            SELECT TOP (1)
              NULLIF(
                LTRIM(RTRIM(
                  ISNULL(
                    ${ssbDb}.dbo.GetSSBName(
                      employee_name_source.FIRSTTHAINAME
                    ),
                    N''
                  )
                  + N' '
                  + ISNULL(
                    ${ssbDb}.dbo.GetSSBName(
                      employee_name_source.LASTTHAINAME
                    ),
                    N''
                  )
                )),
                N''
              )
            FROM ${ssbDb}.dbo.PYREXT
              employee_name_source
            WHERE LTRIM(
                    RTRIM(
                      CAST(
                        employee_name_source.PAYROLLNO
                        AS varchar(20)
                      )
                    )
                  ) =
                  LTRIM(
                    RTRIM(
                      CAST(
                        re.payroll_no
                        AS varchar(20)
                      )
                    )
                  )
            ORDER BY
              CASE
                WHEN employee_name_source.TERMINATEDATE
                  IS NULL
                THEN 0
                ELSE 1
              END
          ) AS employee_full_name,
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
          CONVERT(
            varchar(19),
            COALESCE(
              ev.submitted_date,
              a.submitted_date
            ),
            120
          ) AS submitted_date,

          crq.round_question_id,
          crq.question_no,
          qv.question_title,
          qdv.description_text,
          crq.max_score,
          ed.score,
          ed.comment_text

      FROM dbo.competency_evaluator_assignment a

      JOIN dbo.competency_round_employee re
        ON re.round_employee_id =
           a.round_employee_id
       AND re.status_type <> 9

      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
       AND r.round_code = @round_code

      OUTER APPLY (
        SELECT TOP (1)
          ev2.evaluation_id,
          ev2.status_type,
          ev2.total_score,
          ev2.submitted_date
        FROM dbo.competency_evaluation ev2
        WHERE ev2.assignment_id =
              a.assignment_id
        ORDER BY ev2.evaluation_id DESC
      ) ev

      LEFT JOIN ${ssbDb}.dbo.sectioncode sectioncode
        ON re.section_code =
           sectioncode.Code

      LEFT JOIN dbo.competency_round_question crq
        ON crq.round_id = re.round_id
       AND crq.active_status = 1
       AND (
            crq.position_code IS NULL
            OR crq.position_code =
               re.position_code
       )

      LEFT JOIN dbo.competency_question_version qv
        ON qv.question_version_id =
           crq.question_version_id

      LEFT JOIN dbo.competency_question_description_version qdv
        ON qdv.question_version_id =
          crq.question_version_id
      AND qdv.rank_group_id =
          re.rank_group_id
      AND qdv.active_status = 1

      LEFT JOIN dbo.competency_evaluation_detail ed
        ON ed.evaluation_id =
           ev.evaluation_id
       AND ed.round_question_id =
           crq.round_question_id

      WHERE a.evaluator_payroll_no =
            @evaluator_payroll_no
        AND a.status_type <> 9
        AND re.section_code =
            @section_code

      ORDER BY
        re.payroll_no,
        a.evaluator_level,
        crq.question_no;
    `);

  const rows =
    result.recordset as SectionFormRow[];

  const formMap = new Map<
    number,
    EvaluationFormData
  >();

  for (const row of rows) {
    const assignmentId =
      Number(row.assignment_id);

    if (!formMap.has(assignmentId)) {
      formMap.set(assignmentId, {
        assignment: {
          assignment_id: assignmentId,
          round_code: row.round_code,
          round_status_type:
            moduleStatus ?? 0,
          employee_payroll_no:
            row.employee_payroll_no,
          employee_full_name:
            row.employee_full_name ||
            row.employee_payroll_no,
          position_code: row.position_code,
          rank_code: row.rank_code,
          division_code: row.division_code,
          dept_code: row.dept_code,
          section_code: row.section_code,
          section_name: row.section_name,
          evaluator_level:
            Number(row.evaluator_level),
          assignment_status_type:
            Number(row.assignment_status_type),
          evaluation_status_type:
            row.evaluation_status_type ===
            null
              ? null
              : Number(
                  row.evaluation_status_type,
                ),
          total_score:
            row.total_score === null
              ? null
              : Number(row.total_score),
          submitted_date:
            row.submitted_date,
        },
        questions: [],
        can_edit:
          moduleStatus === 1,
      });
    }

    if (
      row.round_question_id === null ||
      row.question_no === null
    ) {
      continue;
    }

    const form =
      formMap.get(assignmentId);

    if (!form) continue;

    form.questions.push({
      round_question_id:
        Number(row.round_question_id),
      question_no:
        Number(row.question_no),
      question_title:
        row.question_title || "",
      description_text:
        row.description_text,
      max_score:
        Number(row.max_score || 0),
      score:
        row.score === null
          ? null
          : Number(row.score),
      comment_text:
        row.comment_text,
    });
  }

  return Array.from(formMap.values()).map(
    (form) => ({
      ...form,
      questions:
        form.questions.sort(
          (first, second) =>
            first.question_no -
            second.question_no,
        ),
    }),
  );
}

type SavePersonDetail = {
  round_question_id: number;
  score: number | null;
  comment_text: string | null;
};


async function getSectionEvaluationScoreTemplates(
  sectionCode: string,
  roundCode: string,
): Promise<EvaluationScoreTemplate[]> {
  const pool = await getDbPool();
  const ssbDb = quoteSqlName(getSsbDatabaseName());

  const result = await pool
    .request()
    .input("section_code", sql.VarChar(20), sectionCode)
    .input("round_code", sql.VarChar(50), roundCode)
    .query(`
      WITH evaluated_employee AS (
        SELECT
          a.assignment_id,
          re.payroll_no AS employee_payroll_no,
          ev.evaluation_id,
          ev.status_type AS evaluation_status_type,
          ev.total_score,
          ROW_NUMBER() OVER (
            PARTITION BY re.payroll_no
            ORDER BY ev.evaluation_id DESC
          ) AS rn
        FROM dbo.competency_evaluator_assignment a
        JOIN dbo.competency_round_employee re
          ON re.round_employee_id = a.round_employee_id
         AND re.status_type <> 9
         AND re.section_code = @section_code
        JOIN dbo.competency_round r
          ON r.round_id = re.round_id
         AND r.round_code = @round_code
        JOIN dbo.competency_evaluation ev
          ON ev.assignment_id = a.assignment_id
         AND ev.status_type = 1
        WHERE a.status_type <> 9
      )
      SELECT
        ee.assignment_id AS template_assignment_id,
        ee.employee_payroll_no,
        (
          SELECT TOP (1)
            NULLIF(
              LTRIM(RTRIM(
                ISNULL(
                  ${ssbDb}.dbo.GetSSBName(
                    employee_name_source.FIRSTTHAINAME
                  ),
                  N''
                )
                + N' '
                + ISNULL(
                  ${ssbDb}.dbo.GetSSBName(
                    employee_name_source.LASTTHAINAME
                  ),
                  N''
                )
              )),
              N''
            )
          FROM ${ssbDb}.dbo.PYREXT employee_name_source
          WHERE LTRIM(RTRIM(CAST(
            employee_name_source.PAYROLLNO AS varchar(20)
          ))) = LTRIM(RTRIM(CAST(
            ee.employee_payroll_no AS varchar(20)
          )))
          ORDER BY
            CASE
              WHEN employee_name_source.TERMINATEDATE IS NULL
              THEN 0 ELSE 1
            END
        ) AS employee_full_name,
        ee.evaluation_status_type,
        ee.total_score,
        crq.question_no,
        ed.score
      FROM evaluated_employee ee
      JOIN dbo.competency_evaluation_detail ed
        ON ed.evaluation_id = ee.evaluation_id
       AND ed.score IS NOT NULL
      JOIN dbo.competency_round_question crq
        ON crq.round_question_id = ed.round_question_id
      WHERE ee.rn = 1
      ORDER BY ee.employee_payroll_no, crq.question_no;
    `);

  const templateMap = new Map<number, EvaluationScoreTemplate>();

  for (const row of result.recordset as Array<{
    template_assignment_id: number;
    employee_payroll_no: string;
    employee_full_name: string | null;
    evaluation_status_type: number | null;
    total_score: number | null;
    question_no: number;
    score: number | null;
  }>) {
    const templateAssignmentId = Number(
      row.template_assignment_id,
    );

    if (!templateMap.has(templateAssignmentId)) {
      templateMap.set(templateAssignmentId, {
        template_key: `assignment_${templateAssignmentId}`,
        template_assignment_id: templateAssignmentId,
        employee_payroll_no: row.employee_payroll_no,
        employee_full_name:
          row.employee_full_name || row.employee_payroll_no,
        evaluation_status_type:
          row.evaluation_status_type,
        total_score:
          row.total_score === null
            ? null
            : Number(row.total_score),
        scores: {},
      });
    }

    const template = templateMap.get(templateAssignmentId);
    if (!template) continue;

    const score =
      row.score === null || row.score === undefined
        ? null
        : Number(row.score);

    template.scores[Number(row.question_no)] =
      Number.isFinite(score) ? score : null;
  }

  return Array.from(templateMap.values());
}

export default async function EvaluationFormPage() {
  const session =
    await requireSession();

  const cookieStore =
    await cookies();

  const sectionCode =
    decodeCookieValue(
      cookieStore.get(
        EVALUATION_SECTION_COOKIE,
      )?.value,
    );

  const roundCode =
    decodeCookieValue(
      cookieStore.get(
        EVALUATION_ROUND_COOKIE,
      )?.value,
    );

  const notice = parseNotice(
    cookieStore.get(
      EVALUATION_NOTICE_COOKIE,
    )?.value,
  );

  if (!sectionCode || !roundCode) {
    return (
      <div>
        <PageHeader
          title="ยังไม่ได้เลือกหน่วยงาน"
          description="กรุณาเปิดแบบประเมินจากหน้ารายการประเมิน Competency"
        />

        {notice?.type === "error" && (
          <ActionAlert
            type={notice.type}
            message={notice.message}
          />
        )}

        <Link
          href="/evaluations"
          className="inline-flex rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          กลับไปรายการประเมิน
        </Link>
      </div>
    );
  }

  const moduleStatus =
    await getCompetencyModuleStatus(
      roundCode,
    );

  const forms =
    await getSectionEvaluationFormData(
      session.emp_id,
      sectionCode,
      roundCode,
      moduleStatus,
    );

  if (forms.length === 0) {
    return (
      <div>
        <PageHeader
          title="ไม่พบรายการประเมิน"
          description="ไม่พบเจ้าหน้าที่ที่อยู่ในหน่วยงานนี้สำหรับรอบประเมินที่เลือก"
        />

        <Link
          href="/evaluations"
          className="inline-flex rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          กลับไปรายการประเมิน
        </Link>
      </div>
    );
  }

  const canEdit =
    moduleStatus === 1;

  const templates =
    canEdit
      ? await getSectionEvaluationScoreTemplates(
          sectionCode,
          roundCode,
        )
      : [];

  async function savePersonEvaluation(
    assignmentId: number,
    details: SavePersonDetail[],
    actionType: "draft" | "submit",
  ) {
    "use server";

    const currentSession =
      await requireSession();

    try {
      if (
        !Number.isInteger(
          assignmentId,
        ) ||
        assignmentId <= 0
      ) {
        throw new Error(
          "ไม่พบรายการประเมิน",
        );
      }

      const safeDetails =
        details.map((detail) => ({
          round_question_id:
            Number(
              detail.round_question_id,
            ),
          score:
            detail.score === null
              ? null
              : Number(detail.score),
          comment_text:
            detail.comment_text ===
              null ||
            detail.comment_text ===
              undefined
              ? null
              : String(
                  detail.comment_text,
                ),
        }));

      for (const detail of safeDetails) {
        if (
          !Number.isInteger(
            detail.round_question_id,
          )
        ) {
          throw new Error(
            "พบหัวข้อประเมินไม่ถูกต้อง",
          );
        }

        if (
          detail.score !== null &&
          !Number.isFinite(
            detail.score,
          )
        ) {
          throw new Error(
            "พบคะแนนไม่ถูกต้อง",
          );
        }
      }

      const status =
        await getCompetencyModuleStatus(
          roundCode,
        );

      if (status !== 1) {
        throw new Error(
          "Competency ของรอบนี้ไม่ได้อยู่ในสถานะเปิดประเมินแล้ว",
        );
      }

      await saveEvaluation(
        assignmentId,
        currentSession.emp_id,
        actionType,
        safeDetails,
      );

      return {
        ok: true,
        submitted:
          actionType === "submit",
      };
    } catch (error) {
      return {
        ok: false,
        submitted: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถบันทึกคะแนนได้",
      };
    }
  }

  const sectionName =
    forms[0]?.assignment
      .section_name ||
    sectionCode;

  const submittedCount =
    forms.filter(
      (form) =>
        Number(
          form.assignment
            .evaluation_status_type ||
            0,
        ) === 1,
    ).length;

  return (
    <div>
      <PageHeader
        title="แบบประเมิน Competency"
        description={`หน่วยงาน ${sectionName} (${sectionCode}) • รอบ ${roundCode} • แสดงเจ้าหน้าที่ทั้งหมดในหน่วยงานเดียวกัน`}
      />

      <div className="mb-4 flex justify-end">
        <Link
          href="/evaluations"
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          ← ย้อนกลับ
        </Link>
      </div>

      {notice && (
        <ActionAlert
          type={notice.type}
          message={notice.message}
        />
      )}

      {!canEdit && (
        <ActionAlert
          type="warning"
          message="Competency ของรอบนี้ไม่ได้อยู่ในสถานะเปิดประเมิน ข้อมูลจะแสดงแบบอ่านอย่างเดียว"
        />
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500">
            เจ้าหน้าที่ทั้งหมด
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {forms.length}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500">
            ประเมินแล้ว
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#1ab394]">
            {submittedCount}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500">
            คงเหลือ
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#ed5565]">
            {forms.length - submittedCount}
          </p>
        </div>
      </div>

      <DepartmentEvaluationForm
        forms={forms}
        templates={templates}
        canEdit={canEdit}
        savePersonEvaluation={
          savePersonEvaluation
        }
      />

      <br />

      <div className="mb-4 flex justify-end">
        <Link
          href="/evaluations"
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          ← ย้อนกลับ
        </Link>
      </div>
      
    </div>
  );
}
