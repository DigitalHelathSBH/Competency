import ActionAlert from "@/components/competency/ActionAlert";
import EvaluationScoreForm from "@/components/competency/EvaluationScoreForm";
import PageHeader from "@/components/competency/PageHeader";
import {
  getEvaluationFormData,
  getEvaluationScoreTemplates,
  saveEvaluation,
} from "@/lib/competency";
import {
  getDbPool,
  sql,
} from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const EVALUATION_ASSIGNMENT_COOKIE =
  "competency_evaluation_assignment_id";
const EVALUATION_RETURN_COOKIE =
  "competency_evaluation_return_path";
const EVALUATION_NOTICE_COOKIE =
  "competency_evaluation_notice";

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
      secure:
        process.env.NODE_ENV ===
        "production",
      maxAge:
        type === "success" ? 8 : 30,
      path: "/",
    },
  );
}

async function getCompetencyModuleStatus(
  assignmentId: number,
  evaluatorPayrollNo: string,
) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "assignment_id",
      sql.Int,
      assignmentId,
    )
    .input(
      "evaluator_payroll_no",
      sql.VarChar(20),
      evaluatorPayrollNo,
    )
    .query(`
      SELECT TOP (1)
        module_status.status_type
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id =
           a.round_employee_id
       AND re.status_type <> 9
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
       AND r.status_type <> 9
      JOIN dbo.performance_round_module
        module_status
        ON module_status.round_id =
           r.round_id
       AND module_status.module_type =
           'COMPETENCY'
      WHERE a.assignment_id =
            @assignment_id
        AND a.evaluator_payroll_no =
            @evaluator_payroll_no
        AND a.status_type <> 9;
    `);

  const row = result.recordset[0];

  return row
    ? Number(row.status_type)
    : null;
}

function getSafeReturnPath() {
  return "/evaluations";
}

export default async function EvaluationFormPage() {
  const session = await requireSession();
  const cookieStore = await cookies();

  const assignmentId = Number(
    cookieStore.get(
      EVALUATION_ASSIGNMENT_COOKIE,
    )?.value || 0,
  );

  const notice = parseNotice(
    cookieStore.get(
      EVALUATION_NOTICE_COOKIE,
    )?.value,
  );

  async function submitForm(
    formData: FormData,
  ) {
    "use server";

    const currentSession =
      await requireSession();

    const currentCookieStore =
      await cookies();

    const currentAssignmentId = Number(
      currentCookieStore.get(
        EVALUATION_ASSIGNMENT_COOKIE,
      )?.value || 0,
    );

    let redirectPath =
      "/evaluations/form";

    try {
      if (
        !Number.isInteger(
          currentAssignmentId,
        ) ||
        currentAssignmentId <= 0
      ) {
        throw new Error(
          "ไม่พบรายการประเมิน กรุณาเปิดรายการจากหน้ารายการประเมินอีกครั้ง",
        );
      }

      const [data, moduleStatus] =
        await Promise.all([
          getEvaluationFormData(
            currentAssignmentId,
            currentSession.emp_id,
          ),
          getCompetencyModuleStatus(
            currentAssignmentId,
            currentSession.emp_id,
          ),
        ]);

      if (!data) {
        throw new Error(
          "รายการนี้อาจไม่ใช่ของผู้ใช้งานที่เข้าสู่ระบบ หรือถูกยกเลิกแล้ว",
        );
      }

      /*
        ตรวจสถานะโมดูล Competency โดยตรง
        ไม่ใช้ competency_round.status_type
      */
      if (moduleStatus !== 1) {
        throw new Error(
          "Competency ของรอบนี้ปิดแล้ว หรือไม่ได้อยู่ในสถานะเปิดประเมิน จึงไม่สามารถแก้ไขคะแนนได้",
        );
      }

      const wasSubmitted =
        Number(
          data.assignment
            .evaluation_status_type || 0,
        ) === 1;

      redirectPath = getSafeReturnPath();

      const details = data.questions.map(
        (question) => {
          const scoreRaw = String(
            formData.get(
              `score_${question.round_question_id}`,
            ) || "",
          ).trim();

          const commentText = String(
            formData.get(
              `comment_${question.round_question_id}`,
            ) || "",
          ).trim();

          const maxScore = Number(
            question.max_score,
          );

          if (scoreRaw === "") {
            return {
              round_question_id:
                question.round_question_id,
              score: null,
              comment_text:
                commentText === ""
                  ? null
                  : commentText,
            };
          }

          const score = Number(scoreRaw);

          if (!Number.isFinite(score)) {
            throw new Error(
              `คะแนนข้อ ${question.question_no} ไม่ถูกต้อง`,
            );
          }

          if (
            score < 0 ||
            score > maxScore
          ) {
            throw new Error(
              `คะแนนข้อ ${question.question_no} ต้องอยู่ระหว่าง 0 ถึง ${maxScore} คะแนน`,
            );
          }

          return {
            round_question_id:
              question.round_question_id,
            score,
            comment_text:
              commentText === ""
                ? null
                : commentText,
          };
        },
      );

      if (
        details.some(
          (detail) =>
            detail.score === null,
        )
      ) {
        throw new Error(
          "กรุณาระบุคะแนนให้ครบทุกข้อก่อนส่งผลประเมิน",
        );
      }

      /*
        saveEvaluation เดิมยังตรวจสถานะรอบหลัก
        แต่ผ่านการตรวจโมดูล Competency ด้านบนแล้ว
      */
      await saveEvaluation(
        currentAssignmentId,
        currentSession.emp_id,
        "submit",
        details,
      );

      await setNoticeCookie(
        "success",
        wasSubmitted
          ? "บันทึกการแก้ไขคะแนน Competency เรียบร้อยแล้ว"
          : "ส่งผลประเมิน Competency เรียบร้อยแล้ว",
      );

      currentCookieStore.set(
        EVALUATION_ASSIGNMENT_COOKIE,
        "",
        {
          httpOnly: true,
          sameSite: "lax",
          secure:
            process.env.NODE_ENV ===
            "production",
          maxAge: 0,
          path: "/",
        },
      );

      currentCookieStore.set(
        EVALUATION_RETURN_COOKIE,
        "",
        {
          httpOnly: true,
          sameSite: "lax",
          secure:
            process.env.NODE_ENV ===
            "production",
          maxAge: 0,
          path: "/",
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกผลประเมิน Competency ได้";

      await setNoticeCookie(
        "error",
        message,
      );

      redirectPath =
        "/evaluations/form";
    }

    redirect(redirectPath);
  }

  if (
    !Number.isInteger(assignmentId) ||
    assignmentId <= 0
  ) {
    return (
      <div>
        <PageHeader
          title="ยังไม่ได้เลือกรายการประเมิน"
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

  const [rawData, moduleStatus] =
    await Promise.all([
      getEvaluationFormData(
        assignmentId,
        session.emp_id,
      ),
      getCompetencyModuleStatus(
        assignmentId,
        session.emp_id,
      ),
    ]);

  if (!rawData) {
    return (
      <div>
        <PageHeader
          title="ไม่พบรายการประเมิน"
          description="รายการนี้อาจไม่ใช่ของผู้ใช้งานที่เข้าสู่ระบบ หรือถูกยกเลิกแล้ว"
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

  /*
    override can_edit และ round_status_type
    ด้วยสถานะของโมดูล Competency
  */
  const data = {
    ...rawData,
    assignment: {
      ...rawData.assignment,
      round_status_type:
        moduleStatus ?? 0,
    },
    can_edit: moduleStatus === 1,
  };

  const templates = data.can_edit
    ? await getEvaluationScoreTemplates(
        assignmentId,
        session.emp_id,
      )
    : [];

  return (
    <div>
      <PageHeader
        title="แบบประเมิน Competency"
        description="เลือกคะแนนจาก Dropdown หรือเลือกค่าเริ่มต้น 3 คะแนนทุกข้อ"
      />

      {notice?.type === "error" && (
        <ActionAlert
          type={notice.type}
          message={notice.message}
        />
      )}

      {!data.can_edit && (
        <ActionAlert
          type="warning"
          message="Competency ของรอบนี้ไม่ได้อยู่ในสถานะเปิดประเมิน ข้อมูลจะแสดงแบบอ่านอย่างเดียว"
        />
      )}

      <EvaluationScoreForm
        data={data}
        templates={templates}
        submitForm={submitForm}
      />
    </div>
  );
}