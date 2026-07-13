"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import ActionAlert from "@/components/competency/ActionAlert";
import SearchableSelect from "@/components/competency/SearchableSelect";

type AlertType = "success" | "error" | "warning" | "info";

type SelectOption = {
  value: string;
  label: string;
};

type AssignmentTableState = {
  page: number;
  pageSize: number;
  search: string;
  roundId: string;
  divisionCode: string;
  level: string;
  status: string;
};

type AssignmentTableRow = {
  round_employee_id: number;
  round_id: number;
  round_code: string;
  round_status_type: number;
  employee_payroll_no: string;
  employee_full_name: string;
  employee_division_code: string | null;
  employee_division_name: string | null;
  level1_assignment_id: number | null;
  level1_evaluator_payroll_no: string | null;
  level1_evaluator_full_name: string | null;
  level1_evaluation_status_type: number | null;
  level2_assignment_id: number | null;
  level2_evaluator_payroll_no: string | null;
  level2_evaluator_full_name: string | null;
  level2_evaluation_status_type: number | null;
  evaluator_required_type: number;
  has_cancelled_assignment: number;
};

type AssignmentTablePayload = {
  rows: AssignmentTableRow[];
  totalRows: number;
  state: AssignmentTableState;
};

type AssignmentTableActionResult = {
  ok: boolean;
  type: AlertType;
  message: string;
  table: AssignmentTablePayload;
};

type AssignmentsTableClientProps = {
  initialRows: AssignmentTableRow[];
  initialTotalRows: number;
  initialState: AssignmentTableState;
  roundOptions: SelectOption[];
  divisionOptions: SelectOption[];
  loadTableAction: (state: AssignmentTableState) => Promise<AssignmentTableActionResult>;
  toggleEvaluatorRequiredTypeAction: (
    roundEmployeeId: number,
    nextType: number,
    state: AssignmentTableState,
  ) => Promise<AssignmentTableActionResult>;
  cancelEmployeeAssignmentsAction: (
    roundEmployeeId: number,
    state: AssignmentTableState,
  ) => Promise<AssignmentTableActionResult>;
  selectAssignmentForEditAction: (formData: FormData) => void | Promise<void>;
};

const DEFAULT_TABLE_STATE: AssignmentTableState = {
  page: 1,
  pageSize: 25,
  search: "",
  roundId: "",
  divisionCode: "",
  level: "",
  status: "active",
};

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const lockedButtonClass =
  "rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400";

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

export default function AssignmentsTableClient({
  initialRows,
  initialTotalRows,
  initialState,
  roundOptions,
  divisionOptions,
  loadTableAction,
  toggleEvaluatorRequiredTypeAction,
  cancelEmployeeAssignmentsAction,
  selectAssignmentForEditAction,
}: AssignmentsTableClientProps) {
  const [rows, setRows] = useState(initialRows);
  const [totalRows, setTotalRows] = useState(initialTotalRows);
  const [tableState, setTableState] = useState(initialState);
  const [alert, setAlert] = useState<{ id: number; type: AlertType; message: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AssignmentTableRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalRows / tableState.pageSize));
  const currentPage = normalizePage(tableState.page, totalPages);
  const startItem = totalRows === 0 ? 0 : (currentPage - 1) * tableState.pageSize + 1;
  const endItem = Math.min(currentPage * tableState.pageSize, totalRows);
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  const tableRoundOptions = useMemo(
    () => [{ value: "", label: "ทั้งหมด" }, ...roundOptions],
    [roundOptions],
  );

  const tableDivisionOptions = useMemo(
    () => [{ value: "", label: "ทั้งหมด" }, ...divisionOptions],
    [divisionOptions],
  );

  function applyPayload(payload: AssignmentTablePayload) {
    setRows(payload.rows);
    setTotalRows(payload.totalRows);
    setTableState(payload.state);
  }

  function showAlert(type: AlertType, message: string) {
    setAlert({ id: Date.now(), type, message });
  }

  function runLoad(nextState: AssignmentTableState, showLoadingOnly = false) {
    startTransition(async () => {
      const result = await loadTableAction(nextState);
      applyPayload(result.table);
      if (!showLoadingOnly && result.message) {
        showAlert(result.type, result.message);
      }
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextState: AssignmentTableState = {
      page: 1,
      pageSize: Number(formData.get("page_size") || tableState.pageSize),
      search: String(formData.get("search") || ""),
      roundId: String(formData.get("round_id") || ""),
      divisionCode: String(formData.get("division_code") || ""),
      level: String(formData.get("level") || ""),
      status: String(formData.get("status") || "active"),
    };

    runLoad(nextState, true);
  }

  function handleClear() {
    runLoad(DEFAULT_TABLE_STATE, true);
  }

  function handlePageChange(page: number) {
    runLoad({ ...tableState, page: normalizePage(page, totalPages) }, true);
  }

  function handlePageInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    handlePageChange(Number(formData.get("page") || 1));
  }

  function handleToggleRequiredType(roundEmployeeId: number, nextType: number) {
    startTransition(async () => {
      const result = await toggleEvaluatorRequiredTypeAction(roundEmployeeId, nextType, tableState);
      applyPayload(result.table);
      showAlert(result.type, result.message);
    });
  }

  function handleCancelAssignments(row: AssignmentTableRow) {
    setCancelTarget(row);
  }

  function confirmCancelAssignments() {
    if (!cancelTarget) return;

    const roundEmployeeId = cancelTarget.round_employee_id;
    setCancelTarget(null);

    startTransition(async () => {
      const result = await cancelEmployeeAssignmentsAction(roundEmployeeId, tableState);
      applyPayload(result.table);
      showAlert(result.type, result.message);
    });
  }

  function renderEvaluatorCell(
    assignmentId: number | null,
    evaluatorName: string | null,
    roundStatusType: number,
    colorClassName: string,
  ) {
    if (!assignmentId || !evaluatorName) {
      return <span className="text-xs text-gray-400 dark:text-gray-500">ยังไม่ได้กำหนด</span>;
    }

    const nameClassName = `font-medium ${colorClassName}`;

    if (roundStatusType !== 0) {
      return <div className={`${nameClassName} text-sm`}>{evaluatorName}</div>;
    }

    return (
      <form action={selectAssignmentForEditAction}>
        <input type="hidden" name="assignment_id" value={assignmentId} />
        <button
          type="submit"
          className={`${nameClassName} text-left text-sm hover:underline`}
          title="กดเพื่อแก้ไขผู้ประเมิน"
        >
          {evaluatorName}
        </button>
      </form>
    );
  }

  function renderEvaluatorRequiredType(row: AssignmentTableRow) {
    const isSingleEvaluator = Number(row.evaluator_required_type || 2) === 1;
    const isDraftRound = Number(row.round_status_type) === 0;
    const nextType = isSingleEvaluator ? 2 : 1;

    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={!isDraftRound || isPending}
          onClick={() => handleToggleRequiredType(row.round_employee_id, nextType)}
          title={
            isSingleEvaluator
              ? "เปิดอยู่: ประเมินแค่หัวหน้าใกล้ชิด"
              : "ปิดอยู่: ต้องมีหัวหน้าใกล้ชิดและหัวหน้าใหญ่"
          }
          className={[
            "relative inline-flex h-6 w-14 items-center rounded-full border transition",
            isDraftRound && !isPending ? "cursor-pointer" : "cursor-not-allowed opacity-60",
            isSingleEvaluator
              ? "border-[#1ab394] bg-[#1ab394]"
              : "border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-800",
          ].join(" ")}
        >
          <span
            className={[
              "absolute text-[10px] font-bold uppercase leading-none text-white transition",
              isSingleEvaluator ? "left-2 opacity-100" : "left-2 opacity-0",
            ].join(" ")}
          >
            ON
          </span>

          <span
            className={[
              "absolute text-[10px] font-bold uppercase leading-none transition",
              isSingleEvaluator
                ? "right-2 opacity-0"
                : "right-2 text-gray-500 opacity-100 dark:text-gray-300",
            ].join(" ")}
          >
            OFF
          </span>

          <span
            className={[
              "absolute h-5 w-5 rounded-full bg-white shadow transition",
              isSingleEvaluator ? "translate-x-8" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>

        <div className="text-xs text-gray-500 dark:text-gray-400">
          {isSingleEvaluator ? "ใช้หัวหน้าใกล้ชิด 100%" : "ต้องมี 2 คน"}
        </div>
      </div>
    );
  }

  function renderCancelActions(row: AssignmentTableRow) {
    const activeAssignmentCount = Number(row.level1_assignment_id ? 1 : 0) + Number(row.level2_assignment_id ? 1 : 0);

    if (activeAssignmentCount === 0) {
      return <span className="text-xs text-gray-400 dark:text-gray-500">-</span>;
    }

    if (row.round_status_type !== 0) {
      return <span className={lockedButtonClass}>ล็อกแล้ว</span>;
    }

    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleCancelAssignments(row)}
        className={redActionButtonClass}
      >
        ยกเลิก
      </button>
    );
  }

  return (
    <>
      {alert && <ActionAlert key={alert.id} type={alert.type} message={alert.message} />}

      {cancelTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-2xl font-bold text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300">
                !
              </div>

              <h3 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                ยืนยันการยกเลิกผู้ประเมิน
              </h3>

              <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-300">
                ต้องการยกเลิกผู้ประเมินของ
                <br />
                <span className="font-semibold text-gray-800 dark:text-white/90">
                  {cancelTarget.employee_full_name}
                </span>
                <br />
                ในรอบ {cancelTarget.round_code} ใช่หรือไม่?
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  className="h-11 min-w-28 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={confirmCancelAssignments}
                  className="h-11 min-w-28 rounded-lg bg-[#1ab394] px-5 text-sm font-medium text-white hover:bg-[#18a689]"
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <form onSubmit={handleSearch} className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ค้นหา
            </label>
            <input
              name="search"
              defaultValue={tableState.search}
              placeholder="ค้นหารอบ ผู้ถูกประเมิน ผู้ประเมิน หรือกลุ่มงาน..."
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบ
            </label>
            <SearchableSelect
              key={`round-${tableState.roundId}`}
              name="round_id"
              defaultValue={tableState.roundId}
              placeholder="รอบ: ทั้งหมด"
              options={tableRoundOptions}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              กลุ่มภารกิจ
            </label>
            <SearchableSelect
              key={`division-${tableState.divisionCode}`}
              name="division_code"
              defaultValue={tableState.divisionCode}
              placeholder="กลุ่มภารกิจ: ทั้งหมด"
              options={tableDivisionOptions}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ผู้ประเมิน
            </label>
            <SearchableSelect
              key={`level-${tableState.level}`}
              name="level"
              defaultValue={tableState.level}
              placeholder="ผู้ประเมิน: ทั้งหมด"
              options={[
                { value: "", label: "ทั้งหมด" },
                { value: "1", label: "มีหัวหน้าใกล้ชิด" },
                { value: "2", label: "มีหัวหน้าใหญ่" },
              ]}
            />
          </div>

          <div className="lg:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              สถานะ
            </label>
            <SearchableSelect
              key={`status-${tableState.status}`}
              name="status"
              defaultValue={tableState.status}
              placeholder="สถานะ: มีผู้ประเมินแล้ว"
              options={[
                { value: "active", label: "ใช้งาน" },
                { value: "inactive", label: "ยกเลิก" },
              ]}
            />
          </div>

          <div className="lg:col-span-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              แถว
            </label>
            <select
              name="page_size"
              defaultValue={String(tableState.pageSize)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div className="flex items-end justify-end lg:col-span-1">
            <button
              type="submit"
              disabled={isPending}
              className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ค้นหา
            </button>
          </div>
        </form>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={handleClear}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            ล้างเงื่อนไข
          </button>
        </div>

        <div className={isPending ? "opacity-60 transition" : "transition"}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  {["รอบ", "ผู้ถูกประเมิน", "หัวหน้าใกล้ชิด", "หัวหน้าใหญ่", "ประเมินแค่หัวหน้าใกล้ชิด", "ยกเลิก"].map((header) => (
                    <th key={header} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      ยังไม่มีข้อมูลผู้ประเมิน
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.round_employee_id}>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {row.round_code}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {roundStatusText(row.round_status_type)}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {row.employee_full_name || "-"}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.employee_division_name || row.employee_division_code || "ไม่ระบุกลุ่มงาน"}
                        </div>
                      </td>

                      <td className="px-5 py-4 align-top">
                        {renderEvaluatorCell(
                          row.level1_assignment_id,
                          row.level1_evaluator_full_name,
                          row.round_status_type,
                          "text-[#23c6c8]",
                        )}
                      </td>

                      <td className="px-5 py-4 align-top">
                        {renderEvaluatorCell(
                          row.level2_assignment_id,
                          row.level2_evaluator_full_name,
                          row.round_status_type,
                          "text-[#f8ac59]",
                        )}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                        {renderEvaluatorRequiredType(row)}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                        {renderCancelActions(row)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col gap-4 border-t border-gray-100 pt-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400 xl:flex-row xl:items-center xl:justify-between">
            <div>
              แสดง {startItem.toLocaleString()}-{endItem.toLocaleString()} จาก {totalRows.toLocaleString()} รายการ
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isFirstPage || isPending}
                  onClick={() => handlePageChange(1)}
                  className={paginationButtonClass}
                >
                  หน้าแรก
                </button>

                <button
                  type="button"
                  disabled={isFirstPage || isPending}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className={paginationButtonClass}
                >
                  ก่อนหน้า
                </button>
              </div>

              <form onSubmit={handlePageInput} className="flex items-center gap-2">
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
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ไป
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isLastPage || isPending}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className={paginationButtonClass}
                >
                  ถัดไป
                </button>

                <button
                  type="button"
                  disabled={isLastPage || isPending}
                  onClick={() => handlePageChange(totalPages)}
                  className={paginationButtonClass}
                >
                  หน้าสุดท้าย
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}