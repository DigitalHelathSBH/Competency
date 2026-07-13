import ActionAlert from "@/components/competency/ActionAlert";
import EvaluationScoreForm from "@/components/competency/EvaluationScoreForm";
import PageHeader from "@/components/competency/PageHeader";
import { getEvaluationFormData, getEvaluationScoreTemplates, saveEvaluation } from "@/lib/competency";
import { requireSession } from "@/lib/session";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const EVALUATION_ASSIGNMENT_COOKIE = "competency_evaluation_assignment_id";
const EVALUATION_RETURN_COOKIE = "competency_evaluation_return_path";
const EVALUATION_NOTICE_COOKIE = "competency_evaluation_notice";

type Notice = {
  type: "success" | "error";
  message: string;
};

function shouldUseSecureCookie() {
  const cookieSecure = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (cookieSecure === "true") return true;
  if (cookieSecure === "false") return false;
  return process.env.NODE_ENV === "production";
}

function parseNotice(value: string | undefined): Notice | null {
  if (!value) return null;

  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) return null;

  const type = value.slice(0, separatorIndex);
  const encodedMessage = value.slice(separatorIndex + 1);

  if (type !== "success" && type !== "error") return null;

  try {
    return {
      type,
      message: decodeURIComponent(encodedMessage),
    };
  } catch {
    return null;
  }
}

async function setNoticeCookie(type: "success" | "error", message: string) {
  const cookieStore = await cookies();
  cookieStore.set(EVALUATION_NOTICE_COOKIE, `${type}:${encodeURIComponent(message)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    maxAge: type === "success" ? 8 : 30,
    path: "/",
  });
}

function getSafeReturnPath() {
  return "/evaluations";
}

export default async function EvaluationFormPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const assignmentId = Number(cookieStore.get(EVALUATION_ASSIGNMENT_COOKIE)?.value || 0);
  const notice = parseNotice(cookieStore.get(EVALUATION_NOTICE_COOKIE)?.value);

  async function submitForm(formData: FormData) {
    "use server";

    const currentSession = await requireSession();
    const currentCookieStore = await cookies();
    const currentAssignmentId = Number(currentCookieStore.get(EVALUATION_ASSIGNMENT_COOKIE)?.value || 0);
    let redirectPath = "/evaluations/form";

    try {
      if (!Number.isInteger(currentAssignmentId) || currentAssignmentId <= 0) {
        throw new Error("ไม่พบรายการประเมิน กรุณาเปิดรายการจากหน้ารายการประเมินอีกครั้ง");
      }

      const data = await getEvaluationFormData(currentAssignmentId, currentSession.emp_id);
      if (!data) {
        throw new Error("รายการนี้อาจไม่ใช่ของผู้ใช้งานที่ login อยู่ หรือถูกยกเลิกแล้ว");
      }

      if (!data.can_edit) {
        throw new Error("รอบประเมินนี้ปิดแล้ว หรือไม่ได้อยู่ในสถานะเปิดประเมิน จึงไม่สามารถแก้ไขคะแนนได้");
      }

      redirectPath = getSafeReturnPath();

      const details = data.questions.map((question) => {
        const scoreRaw = String(formData.get(`score_${question.round_question_id}`) || "").trim();
        const commentText = String(formData.get(`comment_${question.round_question_id}`) || "").trim();
        const maxScore = Number(question.max_score);

        if (scoreRaw === "") {
          return {
            round_question_id: question.round_question_id,
            score: null,
            comment_text: commentText === "" ? null : commentText,
          };
        }

        const score = Number(scoreRaw);
        if (!Number.isFinite(score)) {
          throw new Error(`คะแนนข้อ ${question.question_no} ไม่ถูกต้อง`);
        }

        if (score < 0 || score > maxScore) {
          throw new Error(`คะแนนข้อ ${question.question_no} ต้องอยู่ระหว่าง 0 ถึง ${maxScore} คะแนน`);
        }

        return {
          round_question_id: question.round_question_id,
          score,
          comment_text: commentText === "" ? null : commentText,
        };
      });

      if (details.some((detail) => detail.score === null)) {
        throw new Error("กรุณาระบุคะแนนให้ครบทุกข้อก่อนส่งผลประเมิน");
      }

      await saveEvaluation(currentAssignmentId, currentSession.emp_id, "submit", details);

      await setNoticeCookie("success", "ส่งผลประเมินเรียบร้อยแล้ว");

      currentCookieStore.set(EVALUATION_ASSIGNMENT_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookie(),
        maxAge: 0,
        path: "/",
      });
      currentCookieStore.set(EVALUATION_RETURN_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookie(),
        maxAge: 0,
        path: "/",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกผลประเมินได้";
      await setNoticeCookie("error", message);
      redirectPath = "/evaluations/form";
    }

    redirect(redirectPath);
  }

  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return (
      <div>
        <PageHeader
          title="ยังไม่ได้เลือกรายการประเมิน"
          description="กรุณาเปิดแบบประเมินจากหน้ารายการประเมิน"
        />

        {notice?.type === "error" && <ActionAlert type={notice.type} message={notice.message} />}

        <Link
          href="/evaluations"
          className="inline-flex rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          กลับไปรายการประเมิน
        </Link>
      </div>
    );
  }

  const data = await getEvaluationFormData(assignmentId, session.emp_id);

  if (!data) {
    return (
      <div>
        <PageHeader
          title="ไม่พบรายการประเมิน"
          description="รายการนี้อาจไม่ใช่ของผู้ใช้งานที่ login อยู่ หรือถูกยกเลิกแล้ว"
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

  const templates = data.can_edit ? await getEvaluationScoreTemplates(assignmentId, session.emp_id) : [];

  return (
    <div>
      <PageHeader
        title="แบบประเมิน Competency"
        description="เลือกคะแนนจาก dropdown หรือเลือกค่าเริ่มต้น 3 คะแนนทุกข้อ"
      />

      {notice?.type === "error" && <ActionAlert type={notice.type} message={notice.message} />}

      <EvaluationScoreForm data={data} templates={templates} submitForm={submitForm} />
    </div>
  );
}