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

export type KpiEmployeeFormActionState = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  result_id: number;
};

export type KpiRoundOption = {
  round_id: number;
  round_code: string;
};

export type KpiSectionOption = {
  round_id: number;
  section_code: string;
  section_name: string;
  division_codes: string[];
};

export type KpiEmployeeOption = {
  round_employee_id: number;
  round_id: number;
  payroll_no: string;
  employee_full_name: string;
  division_code: string;
  division_name: string;
  section_code: string;
  section_name: string;
  current_form_code: string;
  current_form_name: string;
  current_form_version_id: number;
  evaluation_started: boolean;
};

export type KpiAssignableFormOption = {
  form_id: number;
  form_version_id: number;
  form_code: string;
  form_name: string;
  version_no: number;
  scope_type: number;
  division_codes: string[];
  item_count: number;
  total_weight_percent: number;
};

type Props = {
  rounds: KpiRoundOption[];
  sections: KpiSectionOption[];
  employees: KpiEmployeeOption[];
  forms: KpiAssignableFormOption[];
  assignAction: (
    previousState: KpiEmployeeFormActionState,
    formData: FormData,
  ) => Promise<KpiEmployeeFormActionState>;
};

type SearchableOption = {
  value: string;
  label: string;
  description?: string;
};

type SearchableSelectProps = {
  options: SearchableOption[];
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

const initialActionState: KpiEmployeeFormActionState = {
  ok: false,
  type: "info",
  message: "",
  result_id: 0,
};

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const saveButtonClassName =
  "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((item) => item.value === value);

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
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
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
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
                const active = item.value === value;

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

export default function KpiEmployeeFormAssignment({
  rounds,
  sections,
  employees,
  forms,
  assignAction,
}: Props) {
  const router = useRouter();
  const [roundId, setRoundId] = useState(
    rounds[0] ? String(rounds[0].round_id) : "",
  );
  const [sectionCode, setSectionCode] = useState("");
  const [formVersionId, setFormVersionId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] =
    useState<number[]>([]);

  const [actionState, formAction, isPending] = useActionState(
    assignAction,
    initialActionState,
  );

  const roundSections = useMemo(
    () =>
      sections.filter(
        (item) => String(item.round_id) === roundId,
      ),
    [roundId, sections],
  );

  const selectedSection = roundSections.find(
    (item) => item.section_code === sectionCode,
  );

  const sectionEmployees = useMemo(
    () =>
      employees.filter(
        (item) =>
          String(item.round_id) === roundId &&
          item.section_code === sectionCode,
      ),
    [employees, roundId, sectionCode],
  );

  const visibleEmployees = useMemo(() => {
    const keyword = employeeSearch.trim().toLowerCase();

    if (!keyword) return sectionEmployees;

    return sectionEmployees.filter((item) =>
      `${item.employee_full_name} ${item.payroll_no} ${item.division_name}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [employeeSearch, sectionEmployees]);

  const availableForms = useMemo(() => {
    const divisionCodes =
      selectedSection?.division_codes || [];

    return forms.filter((form) => {
      if (form.scope_type === 1) return true;

      return divisionCodes.every((divisionCode) =>
        form.division_codes.includes(divisionCode),
      );
    });
  }, [forms, selectedSection]);

  const roundOptions = useMemo<SearchableOption[]>(
    () =>
      rounds.map((item) => ({
        value: String(item.round_id),
        label: item.round_code,
      })),
    [rounds],
  );

  const sectionOptions = useMemo<SearchableOption[]>(
    () =>
      roundSections.map((item) => ({
        value: item.section_code,
        label: `${item.section_name} (${item.section_code})`,
        description: `${item.division_codes.length.toLocaleString()} กลุ่มงานที่เกี่ยวข้อง`,
      })),
    [roundSections],
  );

  const formOptions = useMemo<SearchableOption[]>(
    () =>
      availableForms.map((item) => ({
        value: String(item.form_version_id),
        label: `${item.form_code} - ${item.form_name}`,
        description: `${item.item_count.toLocaleString()} ตัวชี้วัด • น้ำหนัก ${item.total_weight_percent.toLocaleString()}% • Version ${item.version_no}`,
      })),
    [availableForms],
  );

  const selectedEmployeeSet = useMemo(
    () => new Set(selectedEmployeeIds),
    [selectedEmployeeIds],
  );

  const selectedForm = availableForms.find(
    (item) => String(item.form_version_id) === formVersionId,
  );

  const selectedCount = selectedEmployeeIds.length;
  const startedCount = sectionEmployees.filter(
    (item) =>
      selectedEmployeeSet.has(item.round_employee_id) &&
      item.evaluation_started,
  ).length;

  const disableSubmit =
    !roundId ||
    !sectionCode ||
    !formVersionId ||
    selectedCount === 0 ||
    isPending;

  useEffect(() => {
    setSectionCode("");
    setFormVersionId("");
    setEmployeeSearch("");
    setSelectedEmployeeIds([]);
  }, [roundId]);

  useEffect(() => {
    setFormVersionId("");
    setEmployeeSearch("");
    setSelectedEmployeeIds([]);
  }, [sectionCode]);

  useEffect(() => {
    if (!actionState.ok || !actionState.result_id) return;

    setSelectedEmployeeIds([]);
    router.refresh();
  }, [actionState.ok, actionState.result_id, router]);

  function toggleEmployee(roundEmployeeId: number) {
    setSelectedEmployeeIds((current) =>
      current.includes(roundEmployeeId)
        ? current.filter((id) => id !== roundEmployeeId)
        : [...current, roundEmployeeId],
    );
  }

  function selectAllVisible() {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);

      for (const employee of visibleEmployees) {
        next.add(employee.round_employee_id);
      }

      return Array.from(next);
    });
  }

  function clearVisible() {
    const visibleIds = new Set(
      visibleEmployees.map((item) => item.round_employee_id),
    );

    setSelectedEmployeeIds((current) =>
      current.filter((id) => !visibleIds.has(id)),
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
            กำหนดแบบฟอร์ม KPI
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            เลือกรอบประเมิน หน่วยเบิก 5 หลัก แบบฟอร์ม
            และบุคลากรหลายคนเพื่อบันทึกพร้อมกัน
          </p>
        </div>

        <form
          action={formAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <input type="hidden" name="round_id" value={roundId} />
          <input
            type="hidden"
            name="section_code"
            value={sectionCode}
          />
          <input
            type="hidden"
            name="form_version_id"
            value={formVersionId}
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
              แบบฟอร์ม KPI
            </label>
            <SearchableSelect
              options={formOptions}
              value={formVersionId}
              placeholder="เลือกแบบฟอร์ม KPI"
              searchPlaceholder="ค้นหารหัสหรือชื่อแบบฟอร์ม..."
              disabled={!sectionCode}
              onChange={setFormVersionId}
            />
          </div>

          <div className="lg:col-span-12">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
                  บุคลากรในหน่วยเบิก
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  รายการที่เริ่มประเมินแล้วจะยังเลือกได้
                  แต่ระบบจะข้ามเพื่อรักษาข้อมูลเดิม
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={employeeSearch}
                  onChange={(event) =>
                    setEmployeeSearch(event.target.value)
                  }
                  placeholder="ค้นหาชื่อหรือรหัสบุคลากร..."
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

            <div className="max-h-[520px] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="w-16 px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      เลือก
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      บุคลากร
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      กลุ่มงาน
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      แบบฟอร์มปัจจุบัน
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      สถานะ
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
                  {!sectionCode ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        กรุณาเลือกหน่วยเบิก
                      </td>
                    </tr>
                  ) : visibleEmployees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        ไม่พบบุคลากรในหน่วยเบิกนี้
                      </td>
                    </tr>
                  ) : (
                    visibleEmployees.map((employee) => (
                      <tr
                        key={employee.round_employee_id}
                        role="checkbox"
                        tabIndex={0}
                        aria-checked={selectedEmployeeSet.has(
                            employee.round_employee_id,
                        )}
                        onClick={() =>
                            toggleEmployee(employee.round_employee_id)
                        }
                        onKeyDown={(event) => {
                            if (
                            event.key === "Enter" ||
                            event.key === " "
                            ) {
                            event.preventDefault();
                            toggleEmployee(
                                employee.round_employee_id,
                            );
                            }
                        }}
                        className={[
                            "cursor-pointer transition",
                            selectedEmployeeSet.has(
                            employee.round_employee_id,
                            )
                            ? "bg-brand-50/70 dark:bg-brand-500/10"
                            : "hover:bg-gray-50 dark:hover:bg-white/[0.03]",
                        ].join(" ")}
                        >
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedEmployeeSet.has(
                                employee.round_employee_id,
                            )}
                            onClick={(event) =>
                                event.stopPropagation()
                            }
                            onChange={() =>
                                toggleEmployee(
                                employee.round_employee_id,
                                )
                            }
                            className="h-4 w-4 cursor-pointer rounded border-gray-300"
                            />
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {employee.employee_full_name}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {employee.payroll_no}
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                          {employee.division_name ||
                            employee.division_code ||
                            "-"}
                        </td>

                        <td className="px-4 py-3 align-top">
                          {employee.current_form_version_id ? (
                            <>
                              <div className="text-sm font-semibold text-[#23c6c8]">
                                {employee.current_form_code}
                              </div>
                              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                {employee.current_form_name}
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-gray-400">
                              ยังไม่ได้กำหนด
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 align-top">
                          {employee.evaluation_started ? (
                            <span className="rounded-full bg-[#f8ac59] px-2.5 py-1 text-xs font-medium text-white">
                              เริ่มประเมินแล้ว
                            </span>
                          ) : employee.current_form_version_id ? (
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-12">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
              เลือกบุคลากรแล้ว {selectedCount.toLocaleString()} คน
              {selectedForm && (
                <>
                  {" • "}
                  แบบฟอร์ม {selectedForm.form_code}
                </>
              )}
              {startedCount > 0 && (
                <>
                  {" • "}
                  มีผู้เริ่มประเมินแล้ว{" "}
                  {startedCount.toLocaleString()} คน
                  ซึ่งระบบจะข้าม
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end lg:col-span-12">
            <button
              type="submit"
              disabled={disableSubmit}
              className={saveButtonClassName}
            >
              {isPending
                ? "กำลังบันทึก..."
                : "กำหนดแบบฟอร์มให้บุคลากร"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}