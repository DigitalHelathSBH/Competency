"use client";

import ActionAlert from "@/components/competency/ActionAlert";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type KpiEvaluatorActionState = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  result_id: number;
};

export type KpiEvaluatorRoundOption = {
  round_id: number;
  round_code: string;
};

export type KpiEvaluatorSectionOption = {
  round_id: number;
  section_code: string;
  section_name: string;
};

export type KpiEvaluatorStaffOption = {
  payroll_no: string;
  evaluator_full_name: string;
  division_name: string;
};

export type KpiEvaluatorRow = {
  round_employee_id: number;
  round_id: number;
  payroll_no: string;
  employee_full_name: string;
  division_code: string;
  division_name: string;
  section_code: string;
  section_name: string;
  form_code: string;
  form_name: string;
  competency_evaluator_payroll_no: string;
  competency_evaluator_full_name: string;
  kpi_assignment_id: number;
  kpi_evaluator_payroll_no: string;
  kpi_evaluator_full_name: string;
  assignment_source_type: string;
  evaluation_started: boolean;
};

type SearchOption = {
  value: string;
  label: string;
  description?: string;
};

type SearchableSelectProps = {
  options: SearchOption[];
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type Props = {
  rounds: KpiEvaluatorRoundOption[];
  sections: KpiEvaluatorSectionOption[];
  evaluators: KpiEvaluatorStaffOption[];
  rows: KpiEvaluatorRow[];
  saveAction: (
    previousState: KpiEvaluatorActionState,
    formData: FormData,
  ) => Promise<KpiEvaluatorActionState>;
};

const initialActionState: KpiEvaluatorActionState = {
  ok: false,
  type: "info",
  message: "",
  result_id: 0,
};

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const syncButtonClassName =
  "h-11 rounded-lg border border-[#23c6c8] bg-[#23c6c8] px-5 text-sm font-medium text-white hover:bg-[#1fb5b7] disabled:cursor-not-allowed disabled:opacity-60";

const manualButtonClassName =
  "h-11 rounded-lg border border-[#f8ac59] bg-[#f8ac59] px-5 text-sm font-medium text-white hover:bg-[#f7a23b] disabled:cursor-not-allowed disabled:opacity-60";

function SearchableSelect({
  options,
  value,
  placeholder,
  searchPlaceholder,
  disabled = false,
  onChange,
}: SearchableSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find(
    (item) => item.value === value,
  );

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return options;

    return options.filter((item) =>
      `${item.label} ${item.description || ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [options, search]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target as Node,
        )
      ) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutside,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside,
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() =>
          setOpen((current) => !current)
        }
        className={[
          inputClassName,
          "flex items-center justify-between gap-3 text-left",
          disabled
            ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800"
            : "",
        ].join(" ")}
      >
        <span
          className={
            selected
              ? "min-w-0 flex-1 truncate"
              : "min-w-0 flex-1 truncate text-gray-400"
          }
        >
          {selected?.label || placeholder}
        </span>

        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-gray-500 transition ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="m5.5 7.5 4.5 4.5 4.5-4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 p-3 dark:border-gray-800">
            <input
              ref={searchRef}
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  setSearch("");
                }
              }}
              placeholder={searchPlaceholder}
              className={inputClassName}
            />
          </div>

          <div
            id={listboxId}
            role="listbox"
            className="max-h-72 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                ไม่พบข้อมูล
              </div>
            ) : (
              filtered.map((item) => {
                const active =
                  item.value === value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(item.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={[
                      "w-full rounded-lg px-3 py-2.5 text-left transition",
                      active
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {item.label}
                    </div>

                    {item.description && (
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {item.description}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function KpiEvaluatorAssignment({
  rounds,
  sections,
  evaluators,
  rows,
  saveAction,
}: Props) {
  const router = useRouter();

  const [roundId, setRoundId] = useState(
    rounds[0]
      ? String(rounds[0].round_id)
      : "",
  );
  const [sectionCode, setSectionCode] =
    useState("");
  const [manualEvaluatorPayrollNo, setManualEvaluatorPayrollNo] =
    useState("");
  const [employeeSearch, setEmployeeSearch] =
    useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] =
    useState<number[]>([]);

  const [actionState, formAction, isPending] =
    useActionState(
      saveAction,
      initialActionState,
    );

  const roundSections = useMemo(
    () =>
      sections.filter(
        (item) =>
          String(item.round_id) === roundId,
      ),
    [roundId, sections],
  );

  const sectionRows = useMemo(
    () =>
      rows.filter(
        (item) =>
          String(item.round_id) === roundId &&
          item.section_code === sectionCode,
      ),
    [roundId, rows, sectionCode],
  );

  const visibleRows = useMemo(() => {
    const keyword =
      employeeSearch.trim().toLowerCase();

    if (!keyword) return sectionRows;

    return sectionRows.filter((item) =>
      [
        item.employee_full_name,
        item.payroll_no,
        item.division_name,
        item.competency_evaluator_full_name,
        item.kpi_evaluator_full_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [employeeSearch, sectionRows]);

  const roundOptions = useMemo<SearchOption[]>(
    () =>
      rounds.map((item) => ({
        value: String(item.round_id),
        label: item.round_code,
      })),
    [rounds],
  );

  const sectionOptions = useMemo<SearchOption[]>(
    () =>
      roundSections.map((item) => ({
        value: item.section_code,
        label: `${item.section_name} (${item.section_code})`,
      })),
    [roundSections],
  );

  const evaluatorOptions =
    useMemo<SearchOption[]>(
      () =>
        evaluators.map((item) => ({
          value: item.payroll_no,
          label: `${item.evaluator_full_name} (${item.payroll_no})`,
          description:
            item.division_name || undefined,
        })),
      [evaluators],
    );

  const selectedEmployeeSet = useMemo(
    () => new Set(selectedEmployeeIds),
    [selectedEmployeeIds],
  );

  const changeableVisibleRows =
    visibleRows.filter(
      (item) => !item.evaluation_started,
    );

  const blockedSelectedCount =
    sectionRows.filter(
      (item) =>
        selectedEmployeeSet.has(
          item.round_employee_id,
        ) && item.evaluation_started,
    ).length;

  const disableSync =
    !roundId ||
    !sectionCode ||
    selectedEmployeeIds.length === 0 ||
    isPending;

  const disableManual =
    disableSync ||
    !manualEvaluatorPayrollNo;

  useEffect(() => {
    setSectionCode("");
    setEmployeeSearch("");
    setSelectedEmployeeIds([]);
    setManualEvaluatorPayrollNo("");
  }, [roundId]);

  useEffect(() => {
    setEmployeeSearch("");
    setSelectedEmployeeIds([]);
    setManualEvaluatorPayrollNo("");
  }, [sectionCode]);

  useEffect(() => {
    if (
      !actionState.ok ||
      !actionState.result_id
    ) {
      return;
    }

    setSelectedEmployeeIds([]);
    router.refresh();
  }, [
    actionState.ok,
    actionState.result_id,
    router,
  ]);

  function toggleEmployee(
    roundEmployeeId: number,
    evaluationStarted: boolean,
  ) {
    if (evaluationStarted) return;

    setSelectedEmployeeIds((current) =>
      current.includes(roundEmployeeId)
        ? current.filter(
            (id) => id !== roundEmployeeId,
          )
        : [...current, roundEmployeeId],
    );
  }

  function selectAllVisible() {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);

      for (const row of changeableVisibleRows) {
        next.add(row.round_employee_id);
      }

      return Array.from(next);
    });
  }

  function clearVisible() {
    const visibleIds = new Set(
      visibleRows.map(
        (item) => item.round_employee_id,
      ),
    );

    setSelectedEmployeeIds((current) =>
      current.filter(
        (id) => !visibleIds.has(id),
      ),
    );
  }

  return (
    <>
      {actionState.message && (
        <ActionAlert
          key={actionState.result_id}
          type={actionState.type}
          message={actionState.message}
        />
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            ผู้ประเมิน KPI
          </h2>

          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            ใช้หัวหน้าใกล้ชิดระดับ 1 จาก Competency
            อัตโนมัติ หรือเลือกผู้ประเมินคนอื่นแบบกำหนดเอง
            น้ำหนักผู้ประเมิน KPI เท่ากับ 100%
          </p>
        </div>

        <form
          action={formAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <input
            type="hidden"
            name="round_id"
            value={roundId}
          />

          <input
            type="hidden"
            name="section_code"
            value={sectionCode}
          />

          <input
            type="hidden"
            name="manual_evaluator_payroll_no"
            value={manualEvaluatorPayrollNo}
          />

          {selectedEmployeeIds.map((id) => (
            <input
              key={id}
              type="hidden"
              name="round_employee_id"
              value={id}
            />
          ))}

          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบประเมิน
            </label>

            <SearchableSelect
              options={roundOptions}
              value={roundId}
              placeholder="เลือกรอบประเมิน"
              searchPlaceholder="ค้นหารอบประเมิน..."
              onChange={setRoundId}
            />
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              หน่วยเบิก 5 หลัก
            </label>

            <SearchableSelect
              options={sectionOptions}
              value={sectionCode}
              placeholder="เลือกหน่วยเบิก"
              searchPlaceholder="ค้นหารหัสหรือชื่อหน่วยเบิก..."
              disabled={!roundId}
              onChange={setSectionCode}
            />
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ผู้ประเมินแบบกำหนดเอง
            </label>

            <SearchableSelect
              options={evaluatorOptions}
              value={manualEvaluatorPayrollNo}
              placeholder="ค้นหาและเลือกผู้ประเมิน"
              searchPlaceholder="ค้นหาชื่อหรือรหัสบุคลากร..."
              disabled={!sectionCode}
              onChange={
                setManualEvaluatorPayrollNo
              }
            />
          </div>

          <div className="lg:col-span-12">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
                  บุคลากรที่มีแบบฟอร์ม KPI
                </label>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  คลิกบริเวณใดก็ได้ในแถวเพื่อเลือก
                  รายการที่เริ่มประเมินแล้วจะล็อกไม่ให้เปลี่ยน
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={employeeSearch}
                  onChange={(event) =>
                    setEmployeeSearch(
                      event.target.value,
                    )
                  }
                  placeholder="ค้นหาบุคลากรหรือผู้ประเมิน..."
                  disabled={!sectionCode}
                  className={`${inputClassName} sm:w-80`}
                />

                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={!sectionCode}
                  className="h-11 rounded-lg border border-[#23c6c8] px-3 text-sm font-medium text-[#23c6c8] hover:bg-[#23c6c8]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  เลือกที่แสดงทั้งหมด
                </button>

                <button
                  type="button"
                  onClick={clearVisible}
                  disabled={!sectionCode}
                  className="h-11 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                >
                  ล้างที่แสดง
                </button>
              </div>
            </div>

            <div className="max-h-[560px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {[
                      "เลือก",
                      "ผู้ถูกประเมิน",
                      "แบบฟอร์ม KPI",
                      "หัวหน้าใกล้ชิด Competency",
                      "ผู้ประเมิน KPI ปัจจุบัน",
                      "ที่มา",
                      "สถานะ",
                    ].map((header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                  {!sectionCode ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        กรุณาเลือกหน่วยเบิก
                      </td>
                    </tr>
                  ) : visibleRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        ไม่พบบุคลากรที่มีแบบฟอร์ม KPI
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const selected =
                        selectedEmployeeSet.has(
                          row.round_employee_id,
                        );

                      return (
                        <tr
                          key={row.round_employee_id}
                          role="checkbox"
                          tabIndex={
                            row.evaluation_started
                              ? -1
                              : 0
                          }
                          aria-checked={selected}
                          aria-disabled={
                            row.evaluation_started
                          }
                          onClick={() =>
                            toggleEmployee(
                              row.round_employee_id,
                              row.evaluation_started,
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              row.evaluation_started
                            ) {
                              return;
                            }

                            if (
                              event.key ===
                                "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              toggleEmployee(
                                row.round_employee_id,
                                false,
                              );
                            }
                          }}
                          className={[
                            "transition",
                            row.evaluation_started
                              ? "cursor-not-allowed bg-gray-50/70 opacity-75 dark:bg-white/[0.02]"
                              : "cursor-pointer",
                            selected
                              ? "bg-brand-50/70 dark:bg-brand-500/10"
                              : !row.evaluation_started
                                ? "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                                : "",
                          ].join(" ")}
                        >
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              disabled={
                                row.evaluation_started
                              }
                              checked={selected}
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                              onChange={() =>
                                toggleEmployee(
                                  row.round_employee_id,
                                  row.evaluation_started,
                                )
                              }
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 disabled:cursor-not-allowed"
                            />
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {row.employee_full_name}
                            </div>

                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {row.payroll_no}
                              {row.division_name
                                ? ` • ${row.division_name}`
                                : ""}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="text-sm font-semibold text-[#23c6c8]">
                              {row.form_code}
                            </div>

                            <div className="mt-1 max-w-64 text-xs text-gray-600 dark:text-gray-300">
                              {row.form_name}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top">
                            {row.competency_evaluator_payroll_no ? (
                              <>
                                <div className="text-sm text-gray-800 dark:text-white/90">
                                  {
                                    row.competency_evaluator_full_name
                                  }
                                </div>

                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {
                                    row.competency_evaluator_payroll_no
                                  }
                                </div>
                              </>
                            ) : (
                              <span className="text-sm text-[#ed5565]">
                                ยังไม่มีหัวหน้าใกล้ชิด
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 align-top">
                            {row.kpi_evaluator_payroll_no ? (
                              <>
                                <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                                  {
                                    row.kpi_evaluator_full_name
                                  }
                                </div>

                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {
                                    row.kpi_evaluator_payroll_no
                                  }
                                </div>
                              </>
                            ) : (
                              <span className="text-sm text-[#ed5565]">
                                ยังไม่ได้กำหนด
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 align-top">
                            {row.assignment_source_type ===
                            "AUTO_COMPETENCY" ? (
                              <span className="rounded-full bg-[#23c6c8] px-2.5 py-1 text-xs font-medium text-white">
                                อัตโนมัติ
                              </span>
                            ) : row.assignment_source_type ===
                              "MANUAL" ? (
                              <span className="rounded-full bg-[#f8ac59] px-2.5 py-1 text-xs font-medium text-white">
                                กำหนดเอง
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">
                                -
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 align-top">
                            {row.evaluation_started ? (
                              <span className="rounded-full bg-[#ed5565] px-2.5 py-1 text-xs font-medium text-white">
                                เริ่มประเมินแล้ว
                              </span>
                            ) : row.kpi_evaluator_payroll_no ? (
                              <span className="rounded-full bg-[#1ab394] px-2.5 py-1 text-xs font-medium text-white">
                                พร้อมประเมิน
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                รอกำหนด
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-12">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
              เลือกแล้ว{" "}
              {selectedEmployeeIds.length.toLocaleString()} คน
              {" • "}
              ผู้ประเมิน KPI มีน้ำหนัก 100%
              {blockedSelectedCount > 0 && (
                <>
                  {" • "}
                  มีรายการที่เริ่มประเมินแล้ว{" "}
                  {blockedSelectedCount.toLocaleString()} คน
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-end gap-3 sm:flex-row lg:col-span-12">
            <button
              type="submit"
              name="action_type"
              value="sync"
              disabled={disableSync}
              className={syncButtonClassName}
            >
              {isPending
                ? "กำลังบันทึก..."
                : "ใช้หัวหน้าใกล้ชิด Competency"}
            </button>

            <button
              type="submit"
              name="action_type"
              value="manual"
              disabled={disableManual}
              className={manualButtonClassName}
            >
              {isPending
                ? "กำลังบันทึก..."
                : "กำหนดผู้ประเมินที่เลือก"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}