"use client";

import { FormEvent, useState, useTransition } from "react";
import SearchableSelect from "@/components/competency/SearchableSelect";

type IssueLevel = "error" | "warning" | "info";

type SelectOption = {
  value: string;
  label: string;
};

type RoundRow = {
  round_id: number;
  round_code: string;
  round_year: number;
  round_no: number;
  status_type: number;
};

type IssueRow = {
  issue_type: string;
  issue_level: IssueLevel;
  issue_title: string;
  person_text: string;
  detail_text: string;
  reference_text: string;
  menu_path: string;
  fix_round_employee_id?: number | null;
  fix_evaluator_level?: number | null;
};

type IssueSummary = {
  total_count: number;
  error_count: number;
  warning_count: number;
  info_count: number;
};

type IssueTableState = {
  roundId: string;
  page: number;
  pageSize: number;
  search: string;
  level: string;
  type: string;
  menu: string;
};

type IssueTablePayload = {
  rows: IssueRow[];
  totalCount: number;
  summary: IssueSummary;
  state: IssueTableState;
  selectedRound: RoundRow | null;
};

type IssueTableActionResult = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  table: IssueTablePayload;
};

type RoundIssuesTableClientProps = {
  initialRows: IssueRow[];
  initialTotalCount: number;
  initialSummary: IssueSummary;
  initialState: IssueTableState;
  initialSelectedRound: RoundRow | null;
  roundOptions: SelectOption[];
  levelOptions: SelectOption[];
  typeOptions: SelectOption[];
  menuOptions: SelectOption[];
  loadTableAction: (state: IssueTableState) => Promise<IssueTableActionResult>;
  openAssignmentPrefillAction: (formData: FormData) => void | Promise<void>;
  openGenericFixMenuAction: (formData: FormData) => void | Promise<void>;
};

const DEFAULT_TABLE_STATE: IssueTableState = {
  roundId: "",
  page: 1,
  pageSize: 25,
  search: "",
  level: "",
  type: "",
  menu: "",
};

const paginationButtonClass =
  "h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

function roundStatusText(statusType: number) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";
  return `สถานะ ${statusType}`;
}

function normalizePage(value: number, totalPages: number) {
  return Math.min(Math.max(1, Number(value || 1)), Math.max(1, totalPages));
}

function getMenuLabel(path: string) {
  const menuMap: Record<string, string> = {
    "/admin/rounds": "รอบประเมิน",
    "/admin/round-readiness": "ตรวจสอบความพร้อมเปิดรอบ",
    "/admin/round-issues": "รายการที่ต้องแก้ไข",
    "/admin/round-employees": "ผู้ถูกประเมิน",
    "/admin/rank-groups": "กลุ่มระดับ",
    "/admin/assignments": "กำหนดผู้ประเมิน",
    "/admin/evaluator-weights": "น้ำหนักคะแนน",
    "/admin/questions": "หัวข้อประเมิน",
    "/admin/question-descriptions": "คำอธิบายหัวข้อ",
  };

  return menuMap[path] || path;
}

function extractPayrollNo(text: string) {
  const match = text.match(/\(([A-Za-z0-9_-]+)\)/);
  return match?.[1] || "";
}

function getFixSearchKeyword(issue: IssueRow) {
  const payrollNo = extractPayrollNo(issue.person_text || "");

  if (issue.menu_path === "/admin/round-employees" && payrollNo) {
    return payrollNo;
  }

  if (issue.menu_path === "/admin/assignments" && payrollNo) {
    return payrollNo;
  }

  if (issue.menu_path === "/admin/rank-groups") {
    return issue.reference_text.replace("rank_code:", "").trim();
  }

  return payrollNo || issue.issue_title;
}

function getIssueBadgeClass(level: IssueLevel) {
  if (level === "error") {
    return "inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]";
  }

  if (level === "warning") {
    return "inline-flex rounded-full bg-[#f8ac59]/10 px-2.5 py-1 text-xs font-medium text-[#f8ac59]";
  }

  return "inline-flex rounded-full bg-[#23c6c8]/10 px-2.5 py-1 text-xs font-medium text-[#23c6c8]";
}

function getIssueLevelText(level: IssueLevel) {
  if (level === "error") return "ต้องแก้";
  if (level === "warning") return "ควรตรวจ";
  return "ข้อมูล";
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "red" | "orange" | "green" | "blue";
}) {
  const toneClass = {
    red: "border-[#ed5565]/20 bg-[#ed5565]/5 text-[#ed5565]",
    orange: "border-[#f8ac59]/20 bg-[#f8ac59]/5 text-[#f8ac59]",
    green: "border-[#1ab394]/20 bg-[#1ab394]/5 text-[#1ab394]",
    blue: "border-[#23c6c8]/20 bg-[#23c6c8]/5 text-[#23c6c8]",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

export default function RoundIssuesTableClient({
  initialRows,
  initialTotalCount,
  initialSummary,
  initialState,
  initialSelectedRound,
  roundOptions,
  levelOptions,
  typeOptions,
  menuOptions,
  loadTableAction,
  openAssignmentPrefillAction,
  openGenericFixMenuAction,
}: RoundIssuesTableClientProps) {
  const [rows, setRows] = useState(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [summary, setSummary] = useState(initialSummary);
  const [tableState, setTableState] = useState(initialState);
  const [selectedRound, setSelectedRound] = useState<RoundRow | null>(initialSelectedRound);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / tableState.pageSize));
  const currentPage = normalizePage(tableState.page, totalPages);
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * tableState.pageSize + 1;
  const endItem = Math.min(currentPage * tableState.pageSize, totalCount);
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  function applyPayload(payload: IssueTablePayload) {
    setRows(payload.rows);
    setTotalCount(payload.totalCount);
    setSummary(payload.summary);
    setTableState(payload.state);
    setSelectedRound(payload.selectedRound);
  }

  function runLoad(nextState: IssueTableState) {
    startTransition(async () => {
      const result = await loadTableAction(nextState);
      applyPayload(result.table);
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextState: IssueTableState = {
      roundId: String(formData.get("round_id") || tableState.roundId || ""),
      page: 1,
      pageSize: Number(formData.get("page_size") || tableState.pageSize),
      search: String(formData.get("search") || ""),
      level: String(formData.get("level") || ""),
      type: String(formData.get("type") || ""),
      menu: String(formData.get("menu") || ""),
    };

    runLoad(nextState);
  }

  function handleClear() {
    runLoad({ ...DEFAULT_TABLE_STATE, roundId: roundOptions[0]?.value || "" });
  }

  function handlePageChange(page: number) {
    runLoad({ ...tableState, page: normalizePage(page, totalPages) });
  }

  function handlePageInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    handlePageChange(Number(formData.get("page") || 1));
  }

  if (!selectedRound && roundOptions.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
        ยังไม่มีรอบประเมิน กรุณาสร้างรอบประเมินก่อน
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              รอบ {selectedRound?.round_code || "-"}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              สถานะ: {selectedRound ? roundStatusText(selectedRound.status_type) : "-"}
            </p>
          </div>

          {summary.total_count === 0 ? (
            <span className="inline-flex rounded-full bg-[#1ab394]/10 px-4 py-2 text-sm font-medium text-[#1ab394]">
              ไม่พบรายการที่ต้องแก้ไข
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-[#ed5565]/10 px-4 py-2 text-sm font-medium text-[#ed5565]">
              พบรายการที่ต้องแก้ไข {summary.total_count.toLocaleString()} รายการ
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="ทั้งหมด" value={summary.total_count} tone={summary.total_count === 0 ? "green" : "blue"} />
          <SummaryCard title="ต้องแก้" value={summary.error_count} tone={summary.error_count === 0 ? "green" : "red"} />
          <SummaryCard title="ควรตรวจ" value={summary.warning_count} tone={summary.warning_count === 0 ? "green" : "orange"} />
          <SummaryCard title="ข้อมูล" value={summary.info_count} tone="blue" />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-800 dark:text-white/90">
          รายละเอียดรายการที่ต้องแก้ไข
        </h2>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <form onSubmit={handleSearch} className="border-b border-gray-100 p-4 dark:border-gray-800">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="xl:col-span-3">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ค้นหา</label>
                <input
                  name="search"
                  defaultValue={tableState.search}
                  placeholder="ค้นหาชื่อ / รหัส / ประเภท / รายละเอียด..."
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>

              <div className="xl:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">รอบประเมิน</label>
                <SearchableSelect
                  key={`round-${tableState.roundId}`}
                  name="round_id"
                  defaultValue={tableState.roundId}
                  placeholder="รอบ: ทั้งหมด"
                  options={roundOptions}
                />
              </div>

              <div className="xl:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ระดับ</label>
                <SearchableSelect
                  key={`level-${tableState.level}`}
                  name="level"
                  defaultValue={tableState.level}
                  placeholder="ระดับ: ทั้งหมด"
                  options={levelOptions}
                />
              </div>

              <div className="xl:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ประเภท</label>
                <SearchableSelect
                  key={`type-${tableState.type}`}
                  name="type"
                  defaultValue={tableState.type}
                  placeholder="ประเภท: ทั้งหมด"
                  options={typeOptions}
                />
              </div>

              <div className="xl:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">เมนูที่เกี่ยวข้อง</label>
                <SearchableSelect
                  key={`menu-${tableState.menu}`}
                  name="menu"
                  defaultValue={tableState.menu}
                  placeholder="เมนู: ทั้งหมด"
                  options={menuOptions}
                />
              </div>

              <div className="xl:col-span-1">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">แถว</label>
                <select
                  name="page_size"
                  defaultValue={tableState.pageSize}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={isPending}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                ล้างเงื่อนไข
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ค้นหา
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  {["ประเภท", "ระดับ", "รายการ", "รายละเอียด", "อ้างอิง", "เมนูที่เกี่ยวข้อง"].map((header) => (
                    <th key={header} className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      ไม่พบรายการที่ต้องแก้ไข
                    </td>
                  </tr>
                ) : (
                  rows.map((issue, index) => (
                    <tr key={`${issue.issue_type}-${issue.issue_title}-${issue.person_text}-${index}`} className="align-top">
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{issue.issue_type}</td>
                      <td className="px-5 py-4 text-sm"><span className={getIssueBadgeClass(issue.issue_level)}>{getIssueLevelText(issue.issue_level)}</span></td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                        <div>{issue.issue_title}</div>
                        <div className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">{issue.person_text}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{issue.detail_text}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{issue.reference_text}</td>
                      <td className="px-5 py-4 text-sm">
                        {issue.menu_path === "/admin/assignments" && issue.fix_round_employee_id && issue.fix_evaluator_level ? (
                          <form action={openAssignmentPrefillAction}>
                            <input type="hidden" name="round_employee_id" value={issue.fix_round_employee_id} />
                            <input type="hidden" name="evaluator_level" value={issue.fix_evaluator_level} />
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-lg border border-[#1ab394] px-3 py-1.5 text-xs font-medium text-[#1ab394] hover:bg-[#1ab394]/10"
                            >
                              ไปเพิ่มผู้ประเมิน
                            </button>
                          </form>
                        ) : (
                          <form action={openGenericFixMenuAction}>
                            <input type="hidden" name="menu_path" value={issue.menu_path} />
                            <input type="hidden" name="round_id" value={tableState.roundId} />
                            <input type="hidden" name="search_keyword" value={getFixSearchKeyword(issue)} />
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-500/10"
                            >
                              ไปที่เมนู {getMenuLabel(issue.menu_path)}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 pb-4">
            <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                แสดง {startItem.toLocaleString()}-{endItem.toLocaleString()} จาก {totalCount.toLocaleString()} รายการ
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => handlePageChange(1)} disabled={isFirstPage || isPending} className={paginationButtonClass}>หน้าแรก</button>
                <button type="button" onClick={() => handlePageChange(currentPage - 1)} disabled={isFirstPage || isPending} className={paginationButtonClass}>ก่อนหน้า</button>

                <form onSubmit={handlePageInput} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>หน้า</span>
                  <input
                    name="page"
                    type="number"
                    min="1"
                    max={totalPages}
                    defaultValue={currentPage}
                    className="h-10 w-20 rounded-lg border border-gray-300 bg-transparent px-3 text-center text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                  <span>จาก {totalPages.toLocaleString()}</span>
                  <button type="submit" disabled={isPending} className={paginationButtonClass}>ไป</button>
                </form>

                <button type="button" onClick={() => handlePageChange(currentPage + 1)} disabled={isLastPage || isPending} className={paginationButtonClass}>ถัดไป</button>
                <button type="button" onClick={() => handlePageChange(totalPages)} disabled={isLastPage || isPending} className={paginationButtonClass}>หน้าสุดท้าย</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
