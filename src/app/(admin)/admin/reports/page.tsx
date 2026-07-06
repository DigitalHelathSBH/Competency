import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import PageHeader from "@/components/competency/PageHeader";
import {
  CompetencyReportRow,
  getWeightedReport,
  safeFetch,
} from "@/lib/competency";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const REPORT_ROUND_COOKIE = "competency_my_report_round_id";

function shouldUseSecureCookie() {
  const cookieSecure = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (cookieSecure === "true") return true;
  if (cookieSecure === "false") return false;
  return process.env.NODE_ENV === "production";
}

async function selectReportRoundAction(formData: FormData) {
  "use server";

  await requireSession();

  const roundId = Number(formData.get("round_id") || 0);
  const cookieStore = await cookies();

  if (Number.isInteger(roundId) && roundId > 0) {
    cookieStore.set(REPORT_ROUND_COOKIE, String(roundId), {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge: 60 * 60 * 8,
      path: "/",
    });
  } else {
    cookieStore.delete(REPORT_ROUND_COOKIE);
  }

  redirect("/reports");
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const score = Number(value);
  if (!Number.isFinite(score)) return "-";
  return score.toFixed(2);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "-";
  return `${percent.toFixed(0)}%`;
}

function formatThaiDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const [datePart, timePart = ""] = value.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = timePart.split(":").map(Number);

  if (!year || !month || !day) return value;

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year + 543} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function statusBadgeClass(status: string) {
  if (status === "ประเมินครบ") {
    return "border-[#1ab394]/20 bg-[#1ab394]/10 text-[#1ab394]";
  }

  if (status === "น้ำหนักไม่ครบ 100%") {
    return "border-[#ed5565]/20 bg-[#ed5565]/10 text-[#ed5565]";
  }

  return "border-[#f8ac59]/20 bg-[#f8ac59]/10 text-[#f8ac59]";
}

function groupRowsByDivision(rows: CompetencyReportRow[]) {
  const map = new Map<string, CompetencyReportRow[]>();

  for (const row of rows) {
    const divisionName = row.division_name || "ไม่ระบุกลุ่มภารกิจ";
    const divisionCode = row.division_code || "";
    const key = `${divisionCode}::${divisionName}`;

    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(row);
  }

  return Array.from(map.entries()).map(([key, items]) => {
    const [, divisionName] = key.split("::");
    const completedCount = items.filter(
      (item) => item.report_status === "ประเมินครบ",
    ).length;
    const weightIssueCount = items.filter(
      (item) => item.report_status === "น้ำหนักไม่ครบ 100%",
    ).length;

    return {
      key,
      divisionName,
      completedCount,
      weightIssueCount,
      totalCount: items.length,
      rows: items,
    };
  });
}

export default async function ReportsPage() {
  const session = await requireSession();

  const cookieStore = await cookies();
  const selectedRoundId = Number(
    cookieStore.get(REPORT_ROUND_COOKIE)?.value || 0,
  );

  const report = await safeFetch(
    () =>
      getWeightedReport(
        selectedRoundId > 0 ? selectedRoundId : null,
        session.emp_id,
      ),
    {
      rounds: [],
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
    },
  );

  const groupedRows = groupRowsByDivision(report.rows);

  return (
    <>
      <PageHeader
        title="รายงานผลคนที่ฉันประเมิน"
        description="แสดงผลประเมินเฉพาะผู้ถูกประเมินที่อยู่ในความรับผิดชอบของคุณ"
      />

      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <form
          action={selectReportRoundAction}
          className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              รอบประเมิน
            </label>
            <select
              name="round_id"
              defaultValue={report.selected_round?.round_id || ""}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {report.rounds.length === 0 ? (
                <option value="">ยังไม่มีรอบประเมินที่คุณมีรายการประเมิน</option>
              ) : (
                report.rounds.map((round) => (
                  <option key={round.round_id} value={round.round_id}>
                    {round.round_code}{" "}
                    {round.status_type === 1 ? "(เปิดประเมิน)" : "(ปิดรอบ)"}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="submit"
            className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={report.rounds.length === 0}
          >
            แสดงรายงาน
          </button>
        </form>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          title="ผู้ถูกประเมินทั้งหมด"
          value={report.summary.total_employee_count.toLocaleString("th-TH")}
        />
        <SummaryCard
          title="ประเมินครบแล้ว"
          value={report.summary.completed_employee_count.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#1ab394]"
        />
        <SummaryCard
          title="รอประเมิน / ยังไม่ครบ"
          value={report.summary.pending_employee_count.toLocaleString("th-TH")}
          valueClassName="text-[#f8ac59]"
        />
        <SummaryCard
          title="ปัญหาน้ำหนักคะแนน"
          value={report.summary.weight_issue_count.toLocaleString("th-TH")}
          valueClassName="text-[#ed5565]"
        />
        <SummaryCard
          title="คะแนนดิบเฉลี่ย"
          value={formatScore(report.summary.average_final_score)}
        />
        <SummaryCard
          title="คะแนน Competency เฉลี่ย"
          value={formatScore(report.summary.average_competency_score)}
          valueClassName="text-[#1ab394]"
        />
      </div>

      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            สรุปรายกลุ่มภารกิจ
          </h2>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  กลุ่มภารกิจ
                </th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                  ประเมินครบ / ทั้งหมด
                </th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                  รอประเมิน
                </th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                  น้ำหนักไม่ครบ
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                  คะแนนดิบเฉลี่ย
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                  คะแนน Competency เฉลี่ย
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {report.division_summary.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ไม่พบข้อมูลรายงาน
                  </td>
                </tr>
              ) : (
                report.division_summary.map((item) => (
                  <tr key={`${item.division_code}-${item.division_name}`}>
                    <td className="px-5 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {item.division_name}
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                      {item.completed_employee_count.toLocaleString("th-TH")} /{" "}
                      {item.total_employee_count.toLocaleString("th-TH")}
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-[#f8ac59]">
                      {item.pending_employee_count.toLocaleString("th-TH")}
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-[#ed5565]">
                      {item.weight_issue_count.toLocaleString("th-TH")}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatScore(item.average_final_score)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-[#1ab394]">
                      {formatScore(item.average_competency_score)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        {groupedRows.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            ไม่พบข้อมูลรายงาน
          </div>
        ) : (
          groupedRows.map((group, index) => (
            <details
              key={group.key}
              open={index === 0}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <summary className="flex cursor-pointer flex-col gap-2 border-b border-gray-100 px-5 py-4 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                    {group.divisionName}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    ประเมินครบ {group.completedCount.toLocaleString("th-TH")} /{" "}
                    {group.totalCount.toLocaleString("th-TH")}
                    {group.weightIssueCount > 0
                      ? ` • น้ำหนักไม่ครบ ${group.weightIssueCount.toLocaleString("th-TH")} รายการ`
                      : ""}
                  </p>
                </div>
              </summary>

              <div className="max-w-full overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        ผู้ถูกประเมิน
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        หน่วยงาน
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        หัวหน้าใกล้ชิด
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        หัวหน้าใหญ่
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        น้ำหนัก
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                        คะแนนดิบ
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        Competency
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                        คะแนน Competency
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        สถานะ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {group.rows.map((row) => (
                      <tr key={`${row.round_code}-${row.payroll_no}`}>
                        <td className="px-4 py-3 text-sm text-gray-800 dark:text-white/90">
                          <div className="font-medium">
                            {row.employee_full_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {row.payroll_no}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {row.section_name || row.section_code || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                          <div className="font-medium">
                            {formatScore(row.level1_score)}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {formatThaiDateTime(row.level1_submitted_date)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                          <div className="font-medium">
                            {row.evaluator_required_type === 1
                              ? "ไม่ต้องใช้"
                              : formatScore(row.level2_score)}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {row.evaluator_required_type === 1
                              ? "level 1 = 100%"
                              : formatThaiDateTime(row.level2_submitted_date)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                          {formatPercent(row.level1_weight)} /{" "}
                          {formatPercent(row.level2_weight)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 dark:text-white/90">
                          <div>{formatScore(row.final_score)}</div>
                          <div className="mt-0.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                            เต็ม {formatScore(row.max_possible_score)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                          {formatPercent(row.competency_percent)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-[#1ab394]">
                          {formatScore(row.competency_score)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(row.report_status)}`}
                          >
                            {row.report_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        )}
      </div>
    </>
  );
}

function SummaryCard({
  title,
  value,
  valueClassName = "text-gray-800 dark:text-white/90",
}: {
  title: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}
