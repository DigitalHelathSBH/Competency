import EvaluationSummaryDocument from "@/components/evaluation-summary/EvaluationSummaryDocument";
import PrintButton from "@/components/evaluation-summary/PrintButton";
import PageHeader from "@/components/competency/PageHeader";
import { getEvaluationSummary, getSummaryRounds } from "@/lib/evaluation-summary";
import { SUMMARY_FORM_LABELS } from "@/lib/evaluation-summary-types";
import { requireAnySession } from "@/lib/session";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ round_id?: string; payroll?: string }>;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
      {children}
    </div>
  );
}

export default async function EvaluationSummaryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAnySession();
  const params = await searchParams;

  // ผู้ใช้ทั่วไปดูได้เฉพาะของตัวเอง; admin ระบุรหัสพนักงานคนอื่นได้
  const requestedPayroll = String(params.payroll || "").trim().toUpperCase().slice(0, 20);
  const payrollNo = session.is_admin && requestedPayroll ? requestedPayroll : session.payroll_no;
  const isSelf = payrollNo === session.payroll_no;

  const rounds = await getSummaryRounds(payrollNo);
  const requestedRoundId = Number(params.round_id || 0);
  const selectedRound = rounds.find((round) => round.round_id === requestedRoundId) || rounds[0] || null;
  const result = selectedRound ? await getEvaluationSummary(selectedRound.round_id, payrollNo) : null;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={isSelf ? "แบบสรุปผลการประเมินของฉัน" : `แบบสรุปผลการประเมิน ${payrollNo}`}
          description="ผลสัมฤทธิ์ของงาน (KPI) + พฤติกรรม (Competency) ตามแบบฟอร์มของประเภทบุคลากร พิมพ์หรือบันทึกเป็น PDF ได้"
        />

        <form
          method="get"
          className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">รอบประเมิน</label>
            <select name="round_id" defaultValue={selectedRound?.round_id || ""} className={inputClass}>
              {rounds.length === 0 ? (
                <option value="">ไม่พบรอบที่มีรายชื่อ</option>
              ) : (
                rounds.map((round) => (
                  <option key={round.round_id} value={round.round_id}>
                    {round.round_code} ({round.status_type === 1 ? "กำลังประเมิน" : "ปิดรอบ"})
                  </option>
                ))
              )}
            </select>
          </div>

          {session.is_admin ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                รหัสพนักงาน (เว้นว่าง = ของตัวเอง)
              </label>
              <input name="payroll" defaultValue={isSelf ? "" : payrollNo} className={inputClass} />
            </div>
          ) : (
            <div />
          )}

          <button
            type="submit"
            className="h-11 rounded-lg border border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            แสดง
          </button>

          {result?.status === "ok" ? <PrintButton /> : <div />}
        </form>

        {result?.status === "ok" ? (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            แบบฟอร์ม: {SUMMARY_FORM_LABELS[result.data.form]}
            {result.data.total === null ? " — ยังไม่มีคะแนนครบทั้ง KPI และ Competency คะแนนรวมจึงแสดงเป็น -" : ""}
          </p>
        ) : null}
      </div>

      {!selectedRound ? (
        <Notice>ไม่พบรหัสพนักงาน {payrollNo} ในรอบประเมินที่เปิดหรือปิดแล้ว</Notice>
      ) : result?.status === "not_found" ? (
        <Notice>ไม่พบข้อมูลผู้ถูกประเมินในรอบนี้</Notice>
      ) : result?.status === "unsupported_site" ? (
        <Notice>ยังไม่มีแบบฟอร์มสรุปผลสำหรับประเภทบุคลากรนี้ (site code {result.site_code})</Notice>
      ) : result?.status === "ok" ? (
        <EvaluationSummaryDocument data={result.data} />
      ) : null}
    </div>
  );
}
