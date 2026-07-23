"use client";

import {
  Fragment,
  useMemo,
  useState,
} from "react";

export type PerformanceReportStatus =
  | "complete"
  | "pending_both"
  | "pending_competency"
  | "pending_kpi"
  | "competency_weight_issue"
  | "invalid_percent";

export type PerformanceReportRow = {
  payroll_no: string;
  employee_full_name: string;
  round_code: string;
  division_code: string;
  division_name: string;
  section_code: string;
  section_name: string;

  competency_percent: number | null;
  kpi_percent: number | null;

  competency_report_status: string;
  competency_expected_count: number;
  competency_submitted_count: number;
  competency_evaluator_weight_total: number | null;
  competency_raw_score: number | null;
  competency_component_score: number | null;

  kpi_evaluation_status_type: number | null;
  kpi_raw_score: number | null;
  kpi_component_score: number | null;
  kpi_form_code: string;
  kpi_form_name: string;
  kpi_evaluator_payroll_no: string;
  kpi_evaluator_full_name: string;

  total_score: number | null;
  report_status: PerformanceReportStatus;
};

type Props = {
  rows: PerformanceReportRow[];
  isAdmin: boolean;
};

type StatusFilter =
  | "all"
  | PerformanceReportStatus;

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

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

function formatPercent(
  value: number | null,
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "-";
  }

  return `${value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })}%`;
}

function statusLabel(
  status: PerformanceReportStatus,
) {
  if (status === "complete") {
    return "ผลรวมครบ";
  }

  if (status === "invalid_percent") {
    return "สัดส่วนคะแนนไม่ถูกต้อง";
  }

  if (
    status ===
    "competency_weight_issue"
  ) {
    return "น้ำหนักผู้ประเมิน Competency ไม่ครบ";
  }

  if (status === "pending_both") {
    return "รอ Competency และ KPI";
  }

  if (
    status === "pending_competency"
  ) {
    return "รอ Competency";
  }

  return "รอ KPI";
}

function statusClassName(
  status: PerformanceReportStatus,
) {
  if (status === "complete") {
    return "bg-[#1ab394] text-white";
  }

  if (
    status === "invalid_percent" ||
    status ===
      "competency_weight_issue"
  ) {
    return "bg-[#ed5565] text-white";
  }

  if (status === "pending_both") {
    return "bg-gray-500 text-white";
  }

  return "bg-[#f8ac59] text-white";
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

export default function PerformanceReportTable({
  rows,
  isAdmin,
}: Props) {
  const [search, setSearch] = useState("");
  const [divisionCode, setDivisionCode] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [expandedPayrollNos, setExpandedPayrollNos] =
    useState<Set<string>>(new Set());

  const divisionOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of rows) {
      if (!row.division_code) continue;

      map.set(
        row.division_code,
        row.division_name ||
          row.division_code,
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
        row.report_status !== statusFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      return [
        row.employee_full_name,
        row.payroll_no,
        row.division_name,
        row.section_name,
        row.kpi_form_code,
        row.kpi_form_name,
        row.kpi_evaluator_full_name,
        row.kpi_evaluator_payroll_no,
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

  const completeRows = rows.filter(
    (row) =>
      row.report_status === "complete" &&
      row.total_score !== null,
  );

  const pendingCount = rows.filter(
    (row) =>
      row.report_status ===
        "pending_both" ||
      row.report_status ===
        "pending_competency" ||
      row.report_status === "pending_kpi",
  ).length;

  const dataIssueCount = rows.filter(
    (row) =>
      row.report_status ===
        "invalid_percent" ||
      row.report_status ===
        "competency_weight_issue",
  ).length;

  const averageTotal =
    completeRows.length > 0
      ? completeRows.reduce(
          (sum, row) =>
            sum +
            Number(row.total_score || 0),
          0,
        ) / completeRows.length
      : null;

  function toggleDetail(
    payrollNo: string,
  ) {
    setExpandedPayrollNos((current) => {
      const next = new Set(current);

      if (next.has(payrollNo)) {
        next.delete(payrollNo);
      } else {
        next.add(payrollNo);
      }

      return next;
    });
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="บุคลากรทั้งหมด"
          value={rows.length.toLocaleString(
            "th-TH",
          )}
        />

        <SummaryCard
          title="ผลรวมครบแล้ว"
          value={completeRows.length.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#1ab394]"
        />

        <SummaryCard
          title="ยังรอผลประเมิน"
          value={pendingCount.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#f8ac59]"
        />

        <SummaryCard
          title="ข้อมูลที่ต้องตรวจสอบ"
          value={dataIssueCount.toLocaleString(
            "th-TH",
          )}
          valueClassName="text-[#ed5565]"
        />

        <SummaryCard
          title="คะแนนรวมเฉลี่ย"
          value={formatScore(averageTotal)}
          valueClassName="text-[#23c6c8]"
        />
      </div>

      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
        สัดส่วน Competency ใช้ค่าที่บันทึกไว้กับบุคลากรในรอบนั้น ส่วนสัดส่วน KPI
        คำนวณจาก 100 ลบด้วยสัดส่วน Competency จึงอาจแตกต่างกันตามประเภทบุคลากร
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
              placeholder="ค้นหาบุคลากร หน่วยงาน แบบฟอร์ม หรือผู้ประเมิน KPI..."
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
              <option value="complete">
                ผลรวมครบ
              </option>
              <option value="pending_both">
                รอทั้งสองส่วน
              </option>
              <option value="pending_competency">
                รอ Competency
              </option>
              <option value="pending_kpi">
                รอ KPI
              </option>
              <option value="invalid_percent">
                สัดส่วนคะแนนไม่ถูกต้อง
              </option>
              <option value="competency_weight_issue">
                น้ำหนักผู้ประเมิน Competency ไม่ครบ
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
                  "บุคลากร",
                  "หน่วยงาน",
                  "ผล Competency",
                  "ส่วน Competency",
                  "ผล KPI",
                  "ส่วน KPI",
                  "คะแนนรวม",
                  "สถานะ",
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
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ไม่พบข้อมูลตามเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const expanded =
                    expandedPayrollNos.has(
                      row.payroll_no,
                    );

                  return (
                    <Fragment
                      key={row.payroll_no}
                    >
                      <tr>
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {
                              row.employee_full_name
                            }
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {row.payroll_no}
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

                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {formatScore(
                              row.competency_raw_score,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {
                              row.competency_report_status
                            }
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-semibold text-[#23c6c8]">
                            {formatScore(
                              row.competency_component_score,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            สัดส่วน{" "}
                            {formatPercent(
                              row.competency_percent,
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {formatScore(
                              row.kpi_raw_score,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {row.kpi_evaluation_status_type ===
                            1
                              ? "ส่งผลแล้ว"
                              : row.kpi_evaluation_status_type ===
                                  0
                                ? "บันทึกร่าง"
                                : "ยังไม่เริ่ม"}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-semibold text-[#f8ac59]">
                            {formatScore(
                              row.kpi_component_score,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            สัดส่วน{" "}
                            {formatPercent(
                              row.kpi_percent,
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top text-base font-semibold text-[#1ab394]">
                          {formatScore(
                            row.total_score,
                          )}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                              statusClassName(
                                row.report_status,
                              ),
                            ].join(" ")}
                          >
                            {statusLabel(
                              row.report_status,
                            )}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              toggleDetail(
                                row.payroll_no,
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
                              : "ดูสูตร"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td
                            colSpan={9}
                            className="bg-gray-50 px-4 py-4 dark:bg-white/[0.02]"
                          >
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                                <h3 className="font-semibold text-gray-800 dark:text-white/90">
                                  Competency
                                </h3>

                                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                  <p>
                                    ผู้ประเมินส่งแล้ว{" "}
                                    {
                                      row.competency_submitted_count
                                    }{" "}
                                    /{" "}
                                    {
                                      row.competency_expected_count
                                    }{" "}
                                    คน
                                  </p>

                                  <p>
                                    น้ำหนักผู้ประเมินรวม:{" "}
                                    {row.competency_evaluator_weight_total ===
                                    null
                                      ? "-"
                                      : `${row.competency_evaluator_weight_total}%`}
                                  </p>

                                  <p>
                                    คะแนนมาตรฐานเต็ม 100:{" "}
                                    {formatScore(
                                      row.competency_raw_score,
                                    )}
                                  </p>

                                  <p className="font-medium text-[#23c6c8]">
                                    {formatScore(
                                      row.competency_raw_score,
                                    )}{" "}
                                    ×{" "}
                                    {formatPercent(
                                      row.competency_percent,
                                    )}{" "}
                                    ={" "}
                                    {formatScore(
                                      row.competency_component_score,
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                                <h3 className="font-semibold text-gray-800 dark:text-white/90">
                                  KPI
                                </h3>

                                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                  <p>
                                    แบบฟอร์ม:{" "}
                                    {row.kpi_form_code
                                      ? `${row.kpi_form_code} - ${row.kpi_form_name}`
                                      : "-"}
                                  </p>

                                  <p>
                                    ผู้ประเมิน:{" "}
                                    {row.kpi_evaluator_full_name ||
                                      "-"}
                                    {isAdmin &&
                                    row.kpi_evaluator_payroll_no
                                      ? ` (${row.kpi_evaluator_payroll_no})`
                                      : ""}
                                  </p>

                                  <p>
                                    คะแนน KPI เต็ม 100:{" "}
                                    {formatScore(
                                      row.kpi_raw_score,
                                    )}
                                  </p>

                                  <p className="font-medium text-[#f8ac59]">
                                    {formatScore(
                                      row.kpi_raw_score,
                                    )}{" "}
                                    ×{" "}
                                    {formatPercent(
                                      row.kpi_percent,
                                    )}{" "}
                                    ={" "}
                                    {formatScore(
                                      row.kpi_component_score,
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-900">
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                คะแนนรวม:
                              </span>{" "}
                              <span className="font-semibold text-[#1ab394]">
                                {formatScore(
                                  row.competency_component_score,
                                )}{" "}
                                +{" "}
                                {formatScore(
                                  row.kpi_component_score,
                                )}{" "}
                                ={" "}
                                {formatScore(
                                  row.total_score,
                                )}
                              </span>
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