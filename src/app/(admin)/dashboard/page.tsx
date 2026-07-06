import Link from "next/link";

import PageHeader from "@/components/competency/PageHeader";
import {
  getMyEvaluationAssignments,
  getWeightedReport,
  safeFetch,
  type CompetencyReportData,
  type CompetencyReportDivisionSummary,
  type EvaluationListRow,
} from "@/lib/competency";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const emptyReport: CompetencyReportData = {
  rounds: [],
  selected_round: null,
  summary: {
    total_employee_count: 0,
    completed_employee_count: 0,
    pending_employee_count: 0,
    weight_issue_count: 0,
    average_final_score: null,
  },
  division_summary: [],
  rows: [],
};

type MyDivisionSummary = {
  division_key: string;
  division_name: string;
  total_count: number;
  submitted_count: number;
  pending_count: number;
};

function numberText(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("th-TH");
}

function scoreText(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const score = Number(value);
  if (!Number.isFinite(score)) return "-";
  return score.toFixed(2);
}

function percentValue(done: number, total: number) {
  if (!total) return 0;
  const percent = Math.round((done / total) * 100);
  return Math.min(100, Math.max(0, percent));
}

function formatThaiDate(value: string | null | undefined) {
  if (!value) return "-";

  const [year, month, day] = String(value).substring(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year + 543}`;
}

function getStatusBadgeClass(status: number | null | undefined) {
  if (status === 1) return "border-[#1ab394]/20 bg-[#1ab394]/10 text-[#1ab394]";
  if (status === 2) return "border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300";
  if (status === 9) return "border-[#ed5565]/20 bg-[#ed5565]/10 text-[#ed5565]";
  return "border-[#f8ac59]/20 bg-[#f8ac59]/10 text-[#f8ac59]";
}

function getStatusText(status: number | null | undefined) {
  if (status === 1) return "เปิดประเมิน";
  if (status === 2) return "ปิดรอบ";
  if (status === 9) return "ยกเลิก";
  return "ร่าง";
}

function groupMyAssignments(rows: EvaluationListRow[]) {
  const map = new Map<string, MyDivisionSummary>();

  for (const row of rows) {
    const divisionName = row.division_name || "ไม่ระบุกลุ่มภารกิจ";
    const divisionKey = `${row.division_code || ""}::${divisionName}`;

    if (!map.has(divisionKey)) {
      map.set(divisionKey, {
        division_key: divisionKey,
        division_name: divisionName,
        total_count: 0,
        submitted_count: 0,
        pending_count: 0,
      });
    }

    const item = map.get(divisionKey);
    if (!item) continue;

    item.total_count += 1;
    if (row.evaluation_status_type === 1) item.submitted_count += 1;
    else item.pending_count += 1;
  }

  return Array.from(map.values()).sort((a, b) => a.division_name.localeCompare(b.division_name, "th"));
}

function getLatestMyRows(rows: EvaluationListRow[]) {
  return [...rows]
    .sort((a, b) => {
      const aSubmitted = a.evaluation_status_type === 1 ? 1 : 0;
      const bSubmitted = b.evaluation_status_type === 1 ? 1 : 0;
      if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;
      return (a.division_name || "").localeCompare(b.division_name || "", "th");
    })
    .slice(0, 8);
}

export default async function DashboardPage() {
  const session = await requireSession();

  const [myAssignments, report] = await Promise.all([
    safeFetch(() => getMyEvaluationAssignments(session.emp_id), [] as EvaluationListRow[]),
    session.is_admin
      ? safeFetch(() => getWeightedReport(null), emptyReport)
      : Promise.resolve(emptyReport),
  ]);

  const myTotal = myAssignments.length;
  const mySubmitted = myAssignments.filter((row) => row.evaluation_status_type === 1).length;
  const myPending = myTotal - mySubmitted;
  const myPercent = percentValue(mySubmitted, myTotal);
  const myDivisionSummary = groupMyAssignments(myAssignments);
  const latestMyRows = getLatestMyRows(myAssignments);

  const adminTotal = report.summary.total_employee_count;
  const adminCompleted = report.summary.completed_employee_count;
  const adminPending = report.summary.pending_employee_count;
  const adminProgress = percentValue(adminCompleted, adminTotal);

  return (
    <>
      <PageHeader
        title="หน้าหลัก"
        description={`ภาพรวมระบบประเมินสมรรถนะรายบุคคลของ ${session.full_name}`}
      />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">งานประเมินของฉัน</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                ประเมินแล้ว {numberText(mySubmitted)} / {numberText(myTotal)} คน
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                รายการที่ยังต้องประเมิน {numberText(myPending)} คน
              </p>
            </div>

            <Link
              href="/evaluations"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
            >
              ไปหน้ารายการประเมิน
            </Link>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>ความคืบหน้าของฉัน</span>
              <span>{myPercent}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-[#1ab394]" style={{ width: `${myPercent}%` }} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <DashboardMetric label="ต้องประเมินทั้งหมด" value={numberText(myTotal)} />
            <DashboardMetric label="ยังไม่ประเมิน" value={numberText(myPending)} valueClassName="text-[#f8ac59]" />
            <DashboardMetric label="ประเมินแล้ว" value={numberText(mySubmitted)} valueClassName="text-[#1ab394]" />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">รอบประเมินปัจจุบัน</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {report.selected_round?.round_code || myAssignments[0]?.round_code || "ยังไม่มีรอบเปิด"}
              </h2>
            </div>

            {report.selected_round && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(report.selected_round.status_type)}`}>
                {getStatusText(report.selected_round.status_type)}
              </span>
            )}
          </div>

          {session.is_admin && report.selected_round ? (
            <div className="mt-4 grid gap-3 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
                <span>วันเริ่มต้น</span>
                <span className="font-medium text-gray-800 dark:text-white/90">{formatThaiDate(report.selected_round.start_date)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
                <span>วันสิ้นสุด</span>
                <span className="font-medium text-gray-800 dark:text-white/90">{formatThaiDate(report.selected_round.end_date)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
                <span>คะแนนเฉลี่ย</span>
                <span className="font-medium text-gray-800 dark:text-white/90">{scoreText(report.summary.average_final_score)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              {myAssignments.length > 0
                ? "ระบบแสดงรายการประเมินจากรอบที่กำลังเปิดอยู่"
                : "ยังไม่มีรายการประเมินที่ต้องดำเนินการในขณะนี้"}
            </div>
          )}
        </section>
      </div>

      {session.is_admin && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <DashboardMetric label="ผู้ถูกประเมินทั้งหมด" value={numberText(adminTotal)} />
            <DashboardMetric label="ประเมินครบแล้ว" value={numberText(adminCompleted)} valueClassName="text-[#1ab394]" />
            <DashboardMetric label="รอประเมิน" value={numberText(adminPending)} valueClassName="text-[#f8ac59]" />
            <DashboardMetric label="น้ำหนักไม่ครบ" value={numberText(report.summary.weight_issue_count)} valueClassName="text-[#ed5565]" />
            <DashboardMetric label="ความคืบหน้า" value={`${adminProgress}%`} valueClassName="text-[#23c6c8]" />
          </div>

          <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">ภาพรวมรายกลุ่มภารกิจ</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  แสดงจำนวนประเมินครบเทียบกับผู้ถูกประเมินทั้งหมดในรอบที่เลือก
                </p>
              </div>
              <Link
                href="/admin/reports"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                เปิดรายงานผล
              </Link>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">กลุ่มภารกิจ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">ประเมินครบ / ทั้งหมด</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">รอประเมิน</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">คะแนนเฉลี่ย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {report.division_summary.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        ยังไม่มีข้อมูลสำหรับแสดง Dashboard
                      </td>
                    </tr>
                  ) : (
                    report.division_summary.slice(0, 8).map((row) => (
                      <DivisionProgressRow key={`${row.division_code}-${row.division_name}`} row={row} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">สรุปรายการประเมินของฉัน</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                แยกตามกลุ่มภารกิจ เพื่อช่วยเลือกทำงานต่อได้เร็วขึ้น
              </p>
            </div>
            <Link href="/evaluations" className="text-sm font-medium text-brand-500 hover:text-brand-600">
              ดูทั้งหมด →
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {myDivisionSummary.length === 0 ? (
              <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                ยังไม่มีรายการประเมินในรอบที่เปิดอยู่
              </div>
            ) : (
              myDivisionSummary.map((item) => {
                const itemPercent = percentValue(item.submitted_count, item.total_count);
                return (
                  <div key={item.division_key} className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white/90">{item.division_name}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          ประเมินแล้ว {numberText(item.submitted_count)} / {numberText(item.total_count)} คน
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#23c6c8]">{itemPercent}%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-[#23c6c8]" style={{ width: `${itemPercent}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">รายการล่าสุดของฉัน</h2>
          <div className="mt-4 space-y-3">
            {latestMyRows.length === 0 ? (
              <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                ไม่มีรายการล่าสุด
              </div>
            ) : (
              latestMyRows.map((row) => (
                <div key={row.assignment_id} className="rounded-xl border border-gray-100 px-4 py-3 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-white/90">{row.employee_full_name}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.division_name || "ไม่ระบุกลุ่มภารกิจ"} / {row.section_name || "ไม่ระบุหน่วยงาน"}
                      </p>
                    </div>
                    {row.evaluation_status_type === 1 ? (
                      <span className="rounded-full bg-[#1ab394]/10 px-2 py-1 text-xs font-medium text-[#1ab394]">ประเมินแล้ว</span>
                    ) : (
                      <span className="rounded-full bg-[#f8ac59]/10 px-2 py-1 text-xs font-medium text-[#f8ac59]">รอประเมิน</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">ทางลัด</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink href="/evaluations" title="รายการประเมิน" description="เปิดกลุ่มภารกิจและประเมินต่อ" />
          {session.is_admin && (
            <>
              <QuickLink href="/admin/round-readiness" title="ตรวจสอบความพร้อม" description="ตรวจเงื่อนไขก่อนเปิดรอบ" />
              <QuickLink href="/admin/round-issues" title="รายการที่ต้องแก้ไข" description="แก้ปัญหาที่ค้างรายคน" />
              <QuickLink href="/admin/reports" title="รายงานผล" description="ดูคะแนนและสถานะรายกลุ่ม" />
            </>
          )}
        </div>
      </section>
    </>
  );
}

function DashboardMetric({
  label,
  value,
  valueClassName = "text-gray-800 dark:text-white/90",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function DivisionProgressRow({ row }: { row: CompetencyReportDivisionSummary }) {
  const progress = percentValue(row.completed_employee_count, row.total_employee_count);

  return (
    <tr>
      <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
        <div>{row.division_name}</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div className="h-full rounded-full bg-[#1ab394]" style={{ width: `${progress}%` }} />
        </div>
      </td>
      <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
        {numberText(row.completed_employee_count)} / {numberText(row.total_employee_count)}
      </td>
      <td className="px-4 py-3 text-center text-sm text-[#f8ac59]">{numberText(row.pending_employee_count)}</td>
      <td className="px-4 py-3 text-right text-sm font-medium text-gray-800 dark:text-white/90">
        {scoreText(row.average_final_score)}
      </td>
    </tr>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
    >
      <p className="font-medium text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </Link>
  );
}
