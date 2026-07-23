"use client";

import {
  Fragment,
  useMemo,
  useState,
} from "react";

export type KpiReportDetail = {
  form_item_id: number;
  item_order: number;
  indicator_code: string;
  indicator_name: string;
  weight_percent: number;
  actual_value: number | null;
  achieved_level: number | null;
  calculated_score: number | null;
  evaluator_note: string;
};

export type KpiReportRow = {
  kpi_assignment_id: number;
  round_code: string;
  employee_payroll_no: string;
  employee_full_name: string;
  division_code: string;
  division_name: string;
  section_code: string;
  section_name: string;
  form_code: string;
  form_name: string;
  evaluator_payroll_no: string;
  evaluator_full_name: string;
  item_count: number;
  completed_item_count: number;
  evaluation_status_type: number | null;
  total_kpi_score: number | null;
  submitted_date: string;
  details: KpiReportDetail[];
};

type Props = {
  rows: KpiReportRow[];
  isAdmin: boolean;
};

type StatusFilter =
  | "all"
  | "submitted"
  | "draft"
  | "not_started";

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function getStatusKey(
  statusType: number | null,
): Exclude<StatusFilter, "all"> {
  if (statusType === 1) return "submitted";
  if (statusType === 0) return "draft";
  return "not_started";
}

function statusBadge(
  statusType: number | null,
) {
  if (statusType === 1) {
    return (
      <span className="inline-flex rounded-full bg-[#1ab394] px-2.5 py-1 text-xs font-medium text-white">
        ส่งผลแล้ว
      </span>
    );
  }

  if (statusType === 0) {
    return (
      <span className="inline-flex rounded-full bg-[#f8ac59] px-2.5 py-1 text-xs font-medium text-white">
        บันทึกร่าง
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      ยังไม่เริ่ม
    </span>
  );
}

function formatScore(
  value: number | null,
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "-";
  }

  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatThaiDateTime(value: string) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "-";

  const [datePart, timePart = ""] =
    rawValue.split(" ");
  const [year, month, day] =
    datePart.split("-").map(Number);
  const [hour = 0, minute = 0] =
    timePart.split(":").map(Number);

  if (!year || !month || !day) {
    return rawValue;
  }

  return `${String(day).padStart(
    2,
    "0",
  )}/${String(month).padStart(
    2,
    "0",
  )}/${year + 543} ${String(
    hour,
  ).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}`;
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
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function KpiReportTable({
  rows,
  isAdmin,
}: Props) {
  const [search, setSearch] = useState("");
  const [divisionCode, setDivisionCode] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [expandedIds, setExpandedIds] =
    useState<Set<number>>(new Set());

  const divisionOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of rows) {
      const code = row.division_code.trim();

      if (!code) continue;

      map.set(
        code,
        row.division_name || code,
      );
    }

    return Array.from(map.entries())
      .map(([code, name]) => ({
        code,
        name,
      }))
      .sort((first, second) =>
        first.name.localeCompare(
          second.name,
          "th",
        ),
      );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword =
      search.trim().toLowerCase();

    return rows.filter((row) => {
      if (
        divisionCode &&
        row.division_code !== divisionCode
      ) {
        return false;
      }

      if (
        statusFilter !== "all" &&
        getStatusKey(
          row.evaluation_status_type,
        ) !== statusFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      return [
        row.employee_full_name,
        row.employee_payroll_no,
        row.division_name,
        row.section_name,
        row.form_code,
        row.form_name,
        row.evaluator_full_name,
        row.evaluator_payroll_no,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [
    divisionCode,
    rows,
    search,
    statusFilter,
  ]);

  const submittedRows = rows.filter(
    (row) =>
      row.evaluation_status_type === 1,
  );
  const draftCount = rows.filter(
    (row) =>
      row.evaluation_status_type === 0,
  ).length;
  const notStartedCount =
    rows.length -
    submittedRows.length -
    draftCount;

  const averageScore =
    submittedRows.length > 0
      ? submittedRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.total_kpi_score || 0,
            ),
          0,
        ) / submittedRows.length
      : null;

  function toggleDetail(
    kpiAssignmentId: number,
  ) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(kpiAssignmentId)) {
        next.delete(kpiAssignmentId);
      } else {
        next.add(kpiAssignmentId);
      }

      return next;
    });
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="ผู้ถูกประเมินทั้งหมด"
          value={rows.length.toLocaleString(
            "th-TH",
          )}
        />
        <SummaryCard
          title="ส่งผลแล้ว"
          value={submittedRows.length.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#1ab394]"
        />
        <SummaryCard
          title="บันทึกร่าง"
          value={draftCount.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#f8ac59]"
        />
        <SummaryCard
          title="ยังไม่เริ่ม"
          value={notStartedCount.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#ed5565]"
        />
        <SummaryCard
          title="คะแนน KPI เฉลี่ย"
          value={formatScore(averageScore)}
          valueClassName="text-[#23c6c8]"
        />
      </div>

      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ค้นหา
            </label>
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={
                isAdmin
                  ? "ค้นหาผู้ถูกประเมิน หน่วยงาน แบบฟอร์ม หรือผู้ประเมิน..."
                  : "ค้นหาผู้ถูกประเมิน หน่วยงาน หรือแบบฟอร์ม..."
              }
              className={inputClassName}
            />
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              กลุ่มงาน
            </label>
            <select
              value={divisionCode}
              onChange={(event) =>
                setDivisionCode(
                  event.target.value,
                )
              }
              className={inputClassName}
            >
              <option value="">
                ทุกกลุ่มงาน
              </option>
              {divisionOptions.map(
                (division) => (
                  <option
                    key={division.code}
                    value={division.code}
                  >
                    {division.name} (
                    {division.code})
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              สถานะ
            </label>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value as StatusFilter,
                )
              }
              className={inputClassName}
            >
              <option value="all">
                ทุกสถานะ
              </option>
              <option value="submitted">
                ส่งผลแล้ว
              </option>
              <option value="draft">
                บันทึกร่าง
              </option>
              <option value="not_started">
                ยังไม่เริ่ม
              </option>
            </select>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          แสดง{" "}
          {filteredRows.length.toLocaleString(
            "th-TH",
          )}{" "}
          จาก{" "}
          {rows.length.toLocaleString(
            "th-TH",
          )}{" "}
          รายการ
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {[
                  "ผู้ถูกประเมิน",
                  "หน่วยงาน",
                  "แบบฟอร์ม",
                  ...(isAdmin
                    ? ["ผู้ประเมิน"]
                    : []),
                  "ความคืบหน้า",
                  "สถานะ",
                  "คะแนน KPI",
                  "วันที่ส่ง",
                  "รายละเอียด",
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
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 8}
                    className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ไม่พบข้อมูลตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const expanded =
                    expandedIds.has(
                      row.kpi_assignment_id,
                    );

                  return (
                    <Fragment
                      key={row.kpi_assignment_id}
                    >
                      <tr>
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {
                              row.employee_full_name
                            }
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {
                              row.employee_payroll_no
                            }
                            {" • "}
                            {row.round_code}
                          </div>
                        </td>

                        <td className="max-w-xs px-4 py-4 align-top">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {row.division_name ||
                              "-"}
                          </div>
                          {row.section_name && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {row.section_name}
                            </div>
                          )}
                        </td>

                        <td className="max-w-sm px-4 py-4 align-top">
                          <div className="text-sm font-semibold text-[#23c6c8]">
                            {row.form_code}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                            {row.form_name}
                          </div>
                        </td>

                        {isAdmin && (
                          <td className="px-4 py-4 align-top">
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {row.evaluator_full_name ||
                                "-"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {
                                row.evaluator_payroll_no
                              }
                            </div>
                          </td>
                        )}

                        <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                          {
                            row.completed_item_count
                          }{" "}
                          / {row.item_count} ข้อ
                        </td>

                        <td className="px-4 py-4 align-top">
                          {statusBadge(
                            row.evaluation_status_type,
                          )}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span className="text-sm font-semibold text-[#1ab394]">
                            {formatScore(
                              row.total_kpi_score,
                            )}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-600 dark:text-gray-300">
                          {formatThaiDateTime(
                            row.submitted_date,
                          )}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              toggleDetail(
                                row.kpi_assignment_id,
                              )
                            }
                            className={[
                              "rounded-lg px-3 py-2 text-xs font-medium text-white",
                              expanded
                                ? "bg-gray-500 hover:bg-gray-600"
                                : "bg-[#23c6c8] hover:bg-[#1fb5b7]",
                            ].join(" ")}
                          >
                            {expanded
                              ? "ซ่อน"
                              : "ดูรายละเอียด"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr
                          key={`detail-${row.kpi_assignment_id}`}
                        >
                          <td
                            colSpan={
                              isAdmin ? 9 : 8
                            }
                            className="bg-gray-50 px-4 py-4 dark:bg-white/[0.02]"
                          >
                            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                                  รายละเอียดตัวชี้วัด
                                </h3>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                  <thead className="bg-gray-50 dark:bg-gray-900/60">
                                    <tr>
                                      {[
                                        "ลำดับ",
                                        "ตัวชี้วัด",
                                        "น้ำหนัก",
                                        "ค่าผลงานจริง",
                                        "ระดับ",
                                        "คะแนน",
                                        "หมายเหตุ",
                                      ].map(
                                        (header) => (
                                          <th
                                            key={
                                              header
                                            }
                                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                                          >
                                            {
                                              header
                                            }
                                          </th>
                                        ),
                                      )}
                                    </tr>
                                  </thead>

                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {row.details.map(
                                      (detail) => (
                                        <tr
                                          key={
                                            detail.form_item_id
                                          }
                                        >
                                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                            {
                                              detail.item_order
                                            }
                                          </td>
                                          <td className="max-w-xl px-4 py-3">
                                            <div className="text-xs font-semibold text-[#23c6c8]">
                                              {
                                                detail.indicator_code
                                              }
                                            </div>
                                            <div className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                                              {
                                                detail.indicator_name
                                              }
                                            </div>
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                            {
                                              detail.weight_percent
                                            }
                                            %
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                            {detail.actual_value ??
                                              "-"}
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-[#f8ac59]">
                                            {detail.achieved_level ??
                                              "-"}
                                          </td>
                                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-[#1ab394]">
                                            {formatScore(
                                              detail.calculated_score,
                                            )}
                                          </td>
                                          <td className="max-w-sm px-4 py-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                                            {detail.evaluator_note ||
                                              "-"}
                                          </td>
                                        </tr>
                                      ),
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}