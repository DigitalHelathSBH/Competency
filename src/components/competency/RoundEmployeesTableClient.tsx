"use client";

import { FormEvent, useState, useTransition } from "react";
import ActionAlert from "@/components/competency/ActionAlert";
import SearchableSelect from "@/components/competency/SearchableSelect";

type AlertType = "success" | "error" | "warning" | "info";

type SelectOption = {
  value: string;
  label: string;
};

type RoundEmployeesTableState = {
  page: number;
  pageSize: number;
  search: string;
  roundId: string;
  divisionCode: string;
  rankGroupId: string;
  status: string;
};

type RoundEmployeeRow = {
  round_employee_id: number;
  round_id: number;
  round_code: string;
  round_status_type: number;
  payroll_no: string;
  employee_full_name: string;
  position_code: string | null;
  position_name: string | null;
  rank_code: string | null;
  rank_name: string | null;
  rank_group_id: number | null;
  rank_group_name: string | null;
  division_code: string | null;
  division_name: string | null;
  dept_code: string | null;
  section_code: string | null;
  site_code: string | null;
  site_name: string | null;
  first_employee_date: string | null;
  service_year: number | null;
  rank_group_source: string | null;
  competency_percent: number;
  status_type: number;
};

type RoundEmployeesTablePayload = {
  rows: RoundEmployeeRow[];
  totalRows: number;
  state: RoundEmployeesTableState;
};

type RoundEmployeesTableActionResult = {
  ok: boolean;
  type: AlertType;
  message: string;
  table: RoundEmployeesTablePayload;
};

type RoundEmployeesTableClientProps = {
  initialRows: RoundEmployeeRow[];
  initialTotalRows: number;
  initialState: RoundEmployeesTableState;
  roundOptions: SelectOption[];
  divisionOptions: SelectOption[];
  rankGroupOptions: SelectOption[];
  loadTableAction: (
    state: RoundEmployeesTableState,
  ) => Promise<RoundEmployeesTableActionResult>;
  toggleStatusAction: (
    roundEmployeeId: number,
    nextStatusType: number,
    state: RoundEmployeesTableState,
  ) => Promise<RoundEmployeesTableActionResult>;
};

const DEFAULT_TABLE_STATE: RoundEmployeesTableState = {
  page: 1,
  pageSize: 25,
  search: "",
  roundId: "",
  divisionCode: "",
  rankGroupId: "",
  status: "",
};

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

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

function StatusBadge({ statusType }: { statusType: number }) {
  if (statusType === 9) {
    return (
      <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
        ยกเลิก
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
      อยู่ในรอบ
    </span>
  );
}

export default function RoundEmployeesTableClient({
  initialRows,
  initialTotalRows,
  initialState,
  roundOptions,
  divisionOptions,
  rankGroupOptions,
  loadTableAction,
  toggleStatusAction,
}: RoundEmployeesTableClientProps) {
  const [rows, setRows] = useState(initialRows);
  const [totalRows, setTotalRows] = useState(initialTotalRows);
  const [tableState, setTableState] = useState(initialState);
  const [alert, setAlert] = useState<{
    id: number;
    type: AlertType;
    message: string;
  } | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    row: RoundEmployeeRow;
    nextStatusType: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalRows / tableState.pageSize));
  const currentPage = normalizePage(tableState.page, totalPages);
  const startItem =
    totalRows === 0 ? 0 : (currentPage - 1) * tableState.pageSize + 1;
  const endItem = Math.min(currentPage * tableState.pageSize, totalRows);
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  function applyPayload(payload: RoundEmployeesTablePayload) {
    setRows(payload.rows);
    setTotalRows(payload.totalRows);
    setTableState(payload.state);
  }

  function showAlert(type: AlertType, message: string) {
    setAlert({ id: Date.now(), type, message });
  }

  function runLoad(nextState: RoundEmployeesTableState) {
    startTransition(async () => {
      const result = await loadTableAction(nextState);
      applyPayload(result.table);
      if (result.message) {
        showAlert(result.type, result.message);
      }
    });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextState: RoundEmployeesTableState = {
      page: 1,
      pageSize: Number(formData.get("page_size") || tableState.pageSize),
      search: String(formData.get("search") || ""),
      roundId: String(formData.get("round_id") || ""),
      divisionCode: String(formData.get("division_code") || ""),
      rankGroupId: String(formData.get("rank_group_id") || ""),
      status: String(formData.get("status") || ""),
    };

    runLoad(nextState);
  }

  function handleClear() {
    runLoad(DEFAULT_TABLE_STATE);
  }

  function handlePageChange(page: number) {
    runLoad({ ...tableState, page: normalizePage(page, totalPages) });
  }

  function handlePageInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    handlePageChange(Number(formData.get("page") || 1));
  }

  function requestStatusChange(row: RoundEmployeeRow) {
    setStatusTarget({
      row,
      nextStatusType: Number(row.status_type) === 9 ? 0 : 9,
    });
  }

  function confirmStatusChange() {
    if (!statusTarget) return;

    const { row, nextStatusType } = statusTarget;
    setStatusTarget(null);

    startTransition(async () => {
      const result = await toggleStatusAction(
        row.round_employee_id,
        nextStatusType,
        tableState,
      );
      applyPayload(result.table);
      showAlert(result.type, result.message);
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      {alert && (
        <ActionAlert key={alert.id} type={alert.type} message={alert.message} />
      )}

      <form
        onSubmit={handleSearch}
        className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ค้นหา
          </label>
          <input
            name="search"
            defaultValue={tableState.search}
            placeholder="ค้นหาชื่อ รหัสเจ้าหน้าที่ วิชาชีพ ระดับ"
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
            options={[{ value: "", label: "ทั้งหมด" }, ...roundOptions]}
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
            options={[{ value: "", label: "ทั้งหมด" }, ...divisionOptions]}
          />
        </div>

        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            กลุ่มระดับ
          </label>
          <SearchableSelect
            key={`rank-${tableState.rankGroupId}`}
            name="rank_group_id"
            defaultValue={tableState.rankGroupId}
            placeholder="กลุ่มระดับ: ทั้งหมด"
            options={[{ value: "", label: "ทั้งหมด" }, ...rankGroupOptions]}
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
            placeholder="สถานะ: ทั้งหมด"
            options={[
              { value: "", label: "ทั้งหมด" },
              { value: "0", label: "อยู่ในรอบ" },
              { value: "9", label: "ยกเลิก" },
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
          onClick={handleClear}
          disabled={isPending}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ล้างเงื่อนไข
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              {[
                "รอบ",
                "ผู้ถูกประเมิน",
                "วิชาชีพ",
                "ประเภทบุคลากร",
                "กลุ่มระดับ / Competency",
                "กลุ่มภารกิจ",
                "สถานะ",
                "จัดการ",
              ].map((header) => (
                <th
                  key={header}
                  className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  ยังไม่มีรายชื่อผู้ถูกประเมิน
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isLocked = Number(row.round_status_type) !== 0;
                const isCancelled = Number(row.status_type) === 9;

                return (
                  <tr
                    key={row.round_employee_id}
                    className={isPending ? "opacity-70" : ""}
                  >
                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div className="font-medium text-gray-800 dark:text-white/90">
                        {row.round_code}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {roundStatusText(Number(row.round_status_type))}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div className="font-medium text-gray-800 dark:text-white/90">
                        {row.employee_full_name || "-"}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.payroll_no}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div>{row.position_name || "-"}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.position_code || "ไม่ระบุรหัส"}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div>{row.site_name || "ไม่ระบุประเภท"}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.rank_group_source === "TENURE"
                          ? row.service_year === null ||
                            row.service_year === undefined
                            ? "ไม่พบข้อมูลอายุงาน"
                            : `อายุงาน ${Number(row.service_year).toLocaleString()} ปี`
                          : row.rank_name || row.rank_code || "ไม่ระบุระดับ"}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div>{row.rank_group_name || "ยังไม่มีกลุ่มระดับ"}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Competency{" "}
                        {Number(row.competency_percent || 20).toFixed(0)}%
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <div>{row.division_name || "-"}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.division_code || "ไม่ระบุรหัส"}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <StatusBadge statusType={Number(row.status_type)} />
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {isLocked ? (
                        <button
                          type="button"
                          disabled
                          className={lockedButtonClass}
                        >
                          ล็อกแล้ว
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestStatusChange(row)}
                          disabled={isPending}
                          className={
                            isCancelled
                              ? greenActionButtonClass
                              : redActionButtonClass
                          }
                        >
                          {isCancelled ? "เปิดใช้งาน" : "ยกเลิก"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          แสดง {startItem.toLocaleString()}-{endItem.toLocaleString()} จาก{" "}
          {totalRows.toLocaleString()} รายการ
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePageChange(1)}
            disabled={isFirstPage || isPending}
            className={paginationButtonClass}
          >
            หน้าแรก
          </button>
          <button
            type="button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={isFirstPage || isPending}
            className={paginationButtonClass}
          >
            ก่อนหน้า
          </button>

          <form
            onSubmit={handlePageInput}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
          >
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
              className={paginationButtonClass}
            >
              ไป
            </button>
          </form>

          <button
            type="button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={isLastPage || isPending}
            className={paginationButtonClass}
          >
            ถัดไป
          </button>
          <button
            type="button"
            onClick={() => handlePageChange(totalPages)}
            disabled={isLastPage || isPending}
            className={paginationButtonClass}
          >
            หน้าสุดท้าย
          </button>
        </div>
      </div>

      {statusTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-2xl font-bold text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300">
                !
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                ยืนยันการปรับสถานะ
              </h3>
              <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-300">
                ต้องการ
                {statusTarget.nextStatusType === 9 ? "ยกเลิก" : "เปิดใช้งาน"}
                ผู้ถูกประเมิน
                <br />
                <span className="font-semibold text-gray-800 dark:text-white/90">
                  {statusTarget.row.employee_full_name} (
                  {statusTarget.row.payroll_no})
                </span>
                ใช่หรือไม่?
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStatusTarget(null)}
                  className="h-11 min-w-28 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={confirmStatusChange}
                  className="h-11 min-w-28 rounded-lg bg-[#1ab394] px-5 text-sm font-medium text-white hover:bg-[#18a689]"
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}