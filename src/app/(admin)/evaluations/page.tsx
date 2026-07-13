import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import {
  evaluatorLevelText,
  getEvaluationFormData,
  getMyEvaluationAssignments,
  safeFetch,
  statusText,
  type EvaluationListRow,
} from "@/lib/competency";
import { requireSession } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Script from "next/script";

export const dynamic = "force-dynamic";

const EVALUATION_ASSIGNMENT_COOKIE = "competency_evaluation_assignment_id";
const EVALUATION_RETURN_COOKIE = "competency_evaluation_return_path";
const EVALUATION_NOTICE_COOKIE = "competency_evaluation_notice";
const EVALUATION_OPEN_GROUP_COOKIE = "competency_evaluation_open_group";

type Notice = {
  type: "success" | "error";
  message: string;
};

type EvaluationGroup = {
  groupKey: string;
  divisionName: string;
  rows: EvaluationListRow[];
  submittedCount: number;
  totalCount: number;
};

function shouldUseSecureCookie() {
  const cookieSecure = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (cookieSecure === "true") return true;
  if (cookieSecure === "false") return false;
  return process.env.NODE_ENV === "production";
}

const thaiMonthsShort = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function decodeCookieValue(value: string | undefined) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
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
  cookieStore.set(
    EVALUATION_NOTICE_COOKIE,
    `${type}:${encodeURIComponent(message)}`,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge: type === "success" ? 5 : 30,
      path: "/",
    },
  );
}

function formatThaiDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const rawValue = String(value).trim();
  if (!rawValue) return "-";

  const [datePart, timePart = ""] = rawValue.replace("T", " ").split(" ");
  const [yearText, monthText, dayText] = datePart.split("-");
  const yearAD = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!yearAD || !month || !day || month < 1 || month > 12) return "-";

  const [hourText = "00", minuteText = "00"] = timePart.split(":");
  const hour = String(Number(hourText || 0)).padStart(2, "0");
  const minute = String(Number(minuteText || 0)).padStart(2, "0");
  const yearBE = String(yearAD + 543).slice(-2);

  return `${day} ${thaiMonthsShort[month - 1]} ${yearBE} ${hour}:${minute}`;
}

function getDivisionName(row: EvaluationListRow) {
  const divisionName = String(row.division_name || "").trim();
  if (divisionName) return divisionName;

  const divisionCode = String(row.division_code || "").trim();
  return divisionCode
    ? `ไม่พบชื่อกลุ่มภารกิจ (${divisionCode})`
    : "ไม่ระบุกลุ่มภารกิจ";
}

function groupRows(rows: EvaluationListRow[]): EvaluationGroup[] {
  const map = new Map<string, EvaluationGroup>();

  for (const row of rows) {
    const divisionName = getDivisionName(row);
    const groupKey = `${row.division_code || "NO_DIVISION"}_${divisionName}`;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        groupKey,
        divisionName,
        rows: [],
        submittedCount: 0,
        totalCount: 0,
      });
    }

    const group = map.get(groupKey);
    if (!group) continue;

    group.rows.push(row);
    group.totalCount += 1;

    if (Number(row.evaluation_status_type || 0) === 1) {
      group.submittedCount += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.divisionName.localeCompare(b.divisionName, "th"),
  );
}

function EvaluationActionButton({
  row,
  groupKey,
  action,
}: {
  row: EvaluationListRow;
  groupKey: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const isSubmitted = Number(row.evaluation_status_type || 0) === 1;

  return (
    <form action={action}>
      <input type="hidden" name="assignment_id" value={row.assignment_id} />
      <input type="hidden" name="group_key" value={groupKey} />
      <button
        type="submit"
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-theme-xs ${
          isSubmitted
            ? "bg-[#f8ac59] hover:bg-[#ee9a3a]"
            : "bg-brand-500 hover:bg-brand-600"
        }`}
      >
        {isSubmitted ? "แก้ไขการประเมิน" : "ให้ประเมิน"}
      </button>
    </form>
  );
}

export default async function EvaluationsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const notice = parseNotice(cookieStore.get(EVALUATION_NOTICE_COOKIE)?.value);
  const openGroupKey = decodeCookieValue(
    cookieStore.get(EVALUATION_OPEN_GROUP_COOKIE)?.value,
  );
  const rows = await safeFetch(
    () => getMyEvaluationAssignments(session.emp_id),
    [],
  );
  const groups = groupRows(rows);
  const openGroupIndex = groups.findIndex(
    (group) => group.groupKey === openGroupKey,
  );
  const openGroupDomId =
    openGroupIndex >= 0 ? `evaluation-group-${openGroupIndex}` : "";

  async function openEvaluationForm(formData: FormData) {
    "use server";

    const currentSession = await requireSession();
    const assignmentId = Number(formData.get("assignment_id"));

    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      await setNoticeCookie("error", "ไม่พบรายการประเมินที่ต้องการเปิด");
      redirect("/evaluations");
    }

    const groupKey = String(formData.get("group_key") || "").trim();
    const data = await getEvaluationFormData(
      assignmentId,
      currentSession.emp_id,
    );
    if (!data) {
      await setNoticeCookie(
        "error",
        "รายการนี้อาจไม่ใช่ของผู้ใช้งานที่ login อยู่ หรือถูกยกเลิกแล้ว",
      );
      redirect("/evaluations");
    }

    if (Number(data.assignment.round_status_type) !== 1) {
      await setNoticeCookie(
        "error",
        "รอบประเมินนี้ไม่ได้อยู่ในสถานะเปิดประเมินแล้ว",
      );
      redirect("/evaluations");
    }

    const cookieStore = await cookies();
    cookieStore.set(EVALUATION_NOTICE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge: 0,
      path: "/",
    });
    cookieStore.set(EVALUATION_ASSIGNMENT_COOKIE, String(assignmentId), {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge: 30 * 60,
      path: "/",
    });
    cookieStore.set(EVALUATION_RETURN_COOKIE, "/evaluations", {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge: 30 * 60,
      path: "/",
    });

    if (groupKey) {
      cookieStore.set(
        EVALUATION_OPEN_GROUP_COOKIE,
        encodeURIComponent(groupKey),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: shouldUseSecureCookie(),
          maxAge: 30 * 60,
          path: "/",
        },
      );
    }

    redirect("/evaluations/form");
  }

  const totalCount = rows.length;
  const submittedCount = rows.filter(
    (row) => Number(row.evaluation_status_type || 0) === 1,
  ).length;
  const pendingCount = totalCount - submittedCount;

  return (
    <div>
      <PageHeader
        title="รายการประเมิน Competency"
        description="รวมรายการที่ต้องประเมินและรายการที่ส่งผลแล้ว แสดงแยกตามกลุ่มภารกิจของผู้ถูกประเมิน"
      />

      {notice && <ActionAlert type={notice.type} message={notice.message} />}

      {openGroupDomId && (
        <Script
          id="scroll-to-open-evaluation-group"
          strategy="afterInteractive"
        >
          {`setTimeout(function(){var el=document.getElementById(${JSON.stringify(openGroupDomId)});if(el){el.scrollIntoView({block:"start"});}},0);`}
        </Script>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ต้องประเมินทั้งหมด
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {totalCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ประเมินแล้ว
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#1ab394]">
            {submittedCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ยังไม่ประเมิน
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#ed5565]">
            {pendingCount.toLocaleString()}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          ไม่พบรายการประเมินในรอบที่เปิดอยู่
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, groupIndex) => {
            const groupPendingCount = group.totalCount - group.submittedCount;

            return (
              <details
                key={group.groupKey}
                id={`evaluation-group-${groupIndex}`}
                open={openGroupKey === group.groupKey}
                className="group scroll-mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <summary className="grid cursor-pointer list-none grid-cols-1 gap-3 border-b border-transparent px-5 py-4 text-sm transition hover:bg-gray-50 group-open:border-gray-100 dark:hover:bg-white/[0.04] md:grid-cols-12 md:items-center">
                  <div className="md:col-span-5">
                    <p className="font-semibold text-gray-800 dark:text-white/90">
                      {group.divisionName}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      คลิกเพื่อแสดงรายชื่อผู้ถูกประเมิน
                    </p>
                  </div>
                  <div className="md:col-span-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ประเมินแล้ว / ต้องประเมินทั้งหมด
                    </p>
                    <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                      {group.submittedCount.toLocaleString()} /{" "}
                      {group.totalCount.toLocaleString()} คน
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ยังไม่ประเมิน
                    </p>
                    <p
                      className={`mt-1 font-semibold ${groupPendingCount > 0 ? "text-[#ed5565]" : "text-[#1ab394]"}`}
                    >
                      {groupPendingCount.toLocaleString()} คน
                    </p>
                  </div>
                  <div className="text-left md:col-span-2 md:text-right">
                    <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 group-open:hidden dark:bg-gray-800 dark:text-gray-300">
                      เปิดดู
                    </span>
                    <span className="hidden rounded-full bg-[#23c6c8] px-3 py-1 text-xs font-medium text-white group-open:inline-flex">
                      กำลังแสดงรายชื่อ
                    </span>
                  </div>
                </summary>

                <div className="max-w-full overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        {[
                          "ผู้ถูกประเมิน",
                          "หน่วยงาน",
                          "รอบ",
                          "ระดับผู้ประเมิน",
                          "สถานะ",
                          "คะแนนรวม",
                          "วันที่ส่งผล",
                          "",
                        ].map((header) => (
                          <th
                            key={header}
                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {group.rows.map((row) => {
                        const isSubmitted =
                          Number(row.evaluation_status_type || 0) === 1;

                        return (
                          <tr
                            key={row.assignment_id}
                            className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                          >
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-800 dark:text-white/90">
                                {row.employee_full_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {row.employee_payroll_no}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.section_name || row.section_code || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.round_code}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {evaluatorLevelText(row.evaluator_level)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                  isSubmitted
                                    ? "bg-[#1ab394]/10 text-[#1ab394]"
                                    : "bg-[#ed5565]/10 text-[#ed5565]"
                                }`}
                              >
                                {statusText(row.evaluation_status_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.total_score ?? "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {formatThaiDateTime(row.submitted_date)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              <EvaluationActionButton
                                row={row}
                                groupKey={group.groupKey}
                                action={openEvaluationForm}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}