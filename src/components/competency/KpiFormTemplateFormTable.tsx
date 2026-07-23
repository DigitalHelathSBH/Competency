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

export type KpiFormActionState = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  result_id: number;
  entity_id: number;
  entity_code: string;
};

export type KpiDivisionOption = {
  division_code: string;
  division_name: string;
};

export type KpiIndicatorOption = {
  indicator_version_id: number;
  indicator_code: string;
  indicator_name: string;
  scope_type: number;
  division_codes: string[];
};

export type KpiFormItemOption = {
  indicator_version_id: number;
  indicator_code: string;
  indicator_name: string;
  weight_percent: number;
  item_order: number;
};

export type KpiFormOption = {
  form_id: number;
  form_version_id: number;
  form_code: string;
  form_name: string;
  version_no: number;
  scope_type: number;
  division_codes: string[];
  division_names: string[];
  total_weight_percent: number;
  active_status: boolean;
  items: KpiFormItemOption[];
};

type Props = {
  divisions: KpiDivisionOption[];
  indicators: KpiIndicatorOption[];
  forms: KpiFormOption[];
  saveAction: (
    previousState: KpiFormActionState,
    formData: FormData,
  ) => Promise<KpiFormActionState>;
  toggleAction: (
    previousState: KpiFormActionState,
    formData: FormData,
  ) => Promise<KpiFormActionState>;
};

type SelectedItem = {
  row_id: number;
  indicator_version_id: number;
  weight_percent: string;
};

type SearchableIndicatorSelectProps = {
  options: KpiIndicatorOption[];
  value: number;
  onChange: (indicatorVersionId: number) => void;
};

const initialActionState: KpiFormActionState = {
  ok: false,
  type: "info",
  message: "",
  result_id: 0,
  entity_id: 0,
  entity_code: "",
};

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const disabledButtonClassName =
  "h-11 cursor-not-allowed rounded-lg bg-gray-300 px-5 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300";

const saveButtonClassName =
  "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

const orangeButtonClassName =
  "rounded-lg border border-[#f8ac59] bg-[#f8ac59] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#f7a23b]";

const addButtonClassName =
  "h-10 rounded-lg border border-[#23c6c8] bg-[#23c6c8] px-4 text-sm font-medium text-white hover:bg-[#1fb5b7]";

const removeButtonClassName =
  "h-11 rounded-lg border border-[#ed5565] bg-[#ed5565] px-4 text-sm font-medium text-white hover:bg-[#e64253]";

function SearchableIndicatorSelect({
  options,
  value,
  onChange,
}: SearchableIndicatorSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const selected = options.find(
    (option) => option.indicator_version_id === value,
  );

  const filteredOptions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return options;

    return options.filter((option) => {
      return `${option.indicator_code} ${option.indicator_name}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [options, searchText]);

  useEffect(() => {
    function closeWhenClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearchText("");
      }
    }

    document.addEventListener("mousedown", closeWhenClickOutside);

    return () => {
      document.removeEventListener(
        "mousedown",
        closeWhenClickOutside,
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [open]);

  function choose(indicatorVersionId: number) {
    onChange(indicatorVersionId);
    setOpen(false);
    setSearchText("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${inputClassName} flex items-center justify-between gap-3 text-left`}
      >
        <span
          className={
            selected
              ? "min-w-0 flex-1 truncate"
              : "min-w-0 flex-1 truncate text-gray-400"
          }
        >
          {selected
            ? `${selected.indicator_code} - ${selected.indicator_name}`
            : "เลือกตัวชี้วัด"}
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

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 p-3 dark:border-gray-800">
            <input
              ref={searchInputRef}
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  setSearchText("");
                }
              }}
              placeholder="ค้นหารหัสหรือชื่อตัวชี้วัด..."
              className={inputClassName}
            />
          </div>

          <div
            id={listboxId}
            role="listbox"
            className="max-h-72 overflow-y-auto p-1"
          >
            {value > 0 && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(0)}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#ed5565] hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                ล้างตัวชี้วัดที่เลือก
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                ไม่พบตัวชี้วัด
              </div>
            ) : (
              filteredOptions.map((option) => {
                const active =
                  option.indicator_version_id === value;

                return (
                  <button
                    key={option.indicator_version_id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() =>
                      choose(option.indicator_version_id)
                    }
                    className={[
                      "w-full rounded-lg px-3 py-2.5 text-left transition",
                      active
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold text-[#23c6c8]">
                      {option.indicator_code}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-gray-700 dark:text-gray-300">
                      {option.indicator_name}
                    </div>
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

export default function KpiFormTemplateFormTable({
  divisions,
  indicators,
  forms,
  saveAction,
  toggleAction,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement | null>(null);
  const nextRowIdRef = useRef(2);

  const [formName, setFormName] = useState("");
  const [scopeType, setScopeType] = useState("1");
  const [divisionCodes, setDivisionCodes] = useState<string[]>([]);
  const [divisionSearch, setDivisionSearch] = useState("");
  const [sourceFormVersionId, setSourceFormVersionId] =
    useState("");
  const [selectedItems, setSelectedItems] = useState<
    SelectedItem[]
  >([
    {
      row_id: 1,
      indicator_version_id: 0,
      weight_percent: "",
    },
  ]);

  const [saveState, saveFormAction, isSaving] = useActionState(
    saveAction,
    initialActionState,
  );
  const [toggleState, toggleFormAction, isToggling] =
    useActionState(toggleAction, initialActionState);

  const selectedDivisionSet = useMemo(
    () => new Set(divisionCodes),
    [divisionCodes],
  );

  const availableIndicators = useMemo(() => {
    if (scopeType === "1") {
      return indicators.filter(
        (indicator) => indicator.scope_type === 1,
      );
    }

    if (divisionCodes.length === 0) {
      return indicators.filter(
        (indicator) => indicator.scope_type === 1,
      );
    }

    return indicators.filter((indicator) => {
      if (indicator.scope_type === 1) return true;

      return divisionCodes.every((divisionCode) =>
        indicator.division_codes.includes(divisionCode),
      );
    });
  }, [divisionCodes, indicators, scopeType]);

  const availableIndicatorIdSet = useMemo(
    () =>
      new Set(
        availableIndicators.map(
          (indicator) => indicator.indicator_version_id,
        ),
      ),
    [availableIndicators],
  );

  const visibleDivisions = useMemo(() => {
    const keyword = divisionSearch.trim().toLowerCase();

    if (!keyword) return divisions;

    return divisions.filter((division) => {
      return (
        division.division_code
          .toLowerCase()
          .includes(keyword) ||
        division.division_name
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [divisionSearch, divisions]);

  const selectedValidItems = useMemo(
    () =>
      selectedItems.filter(
        (item) => item.indicator_version_id > 0,
      ),
    [selectedItems],
  );

  const totalWeight = useMemo(() => {
    return selectedValidItems.reduce((sum, item) => {
      const weight = Number(item.weight_percent);
      return sum + (Number.isFinite(weight) ? weight : 0);
    }, 0);
  }, [selectedValidItems]);

  const invalidItemCount = selectedValidItems.filter((item) => {
    const weight = Number(item.weight_percent);

    return (
      item.weight_percent.trim() === "" ||
      !Number.isInteger(weight) ||
      weight < 1 ||
      weight > 100
    );
  }).length;

  const selectedIds = selectedValidItems.map(
    (item) => item.indicator_version_id,
  );
  const duplicateCount =
    selectedIds.length - new Set(selectedIds).size;

  const disableSubmit =
    !formName.trim() ||
    (scopeType === "2" && divisionCodes.length === 0) ||
    selectedValidItems.length === 0 ||
    invalidItemCount > 0 ||
    duplicateCount > 0 ||
    totalWeight !== 100 ||
    isSaving;

  useEffect(() => {
    setSelectedItems((current) =>
      current.map((item) => {
        if (
          item.indicator_version_id > 0 &&
          !availableIndicatorIdSet.has(
            item.indicator_version_id,
          )
        ) {
          return {
            ...item,
            indicator_version_id: 0,
            weight_percent: "",
          };
        }

        return item;
      }),
    );
  }, [availableIndicatorIdSet]);

  useEffect(() => {
    if (!saveState.ok || !saveState.result_id) return;

    setFormName("");
    setScopeType("1");
    setDivisionCodes([]);
    setDivisionSearch("");
    setSourceFormVersionId("");
    setSelectedItems([
      {
        row_id: nextRowIdRef.current++,
        indicator_version_id: 0,
        weight_percent: "",
      },
    ]);
    router.refresh();
  }, [router, saveState.ok, saveState.result_id]);

  function addIndicatorRow() {
    setSelectedItems((current) => [
      ...current,
      {
        row_id: nextRowIdRef.current++,
        indicator_version_id: 0,
        weight_percent: "",
      },
    ]);
  }

  function removeIndicatorRow(rowId: number) {
    setSelectedItems((current) => {
      const remaining = current.filter(
        (item) => item.row_id !== rowId,
      );

      if (remaining.length > 0) return remaining;

      return [
        {
          row_id: nextRowIdRef.current++,
          indicator_version_id: 0,
          weight_percent: "",
        },
      ];
    });
  }

  function updateIndicator(
    rowId: number,
    indicatorVersionId: number,
  ) {
    setSelectedItems((current) =>
      current.map((item) =>
        item.row_id === rowId
          ? {
              ...item,
              indicator_version_id: indicatorVersionId,
              weight_percent:
                indicatorVersionId === 0
                  ? ""
                  : item.weight_percent,
            }
          : item,
      ),
    );
  }

  function updateWeight(rowId: number, value: string) {
    setSelectedItems((current) =>
      current.map((item) =>
        item.row_id === rowId
          ? { ...item, weight_percent: value }
          : item,
      ),
    );
  }

  function optionsForRow(row: SelectedItem) {
    const selectedInOtherRows = new Set(
      selectedItems
        .filter(
          (item) =>
            item.row_id !== row.row_id &&
            item.indicator_version_id > 0,
        )
        .map((item) => item.indicator_version_id),
    );

    return availableIndicators.filter(
      (indicator) =>
        indicator.indicator_version_id ===
          row.indicator_version_id ||
        !selectedInOtherRows.has(
          indicator.indicator_version_id,
        ),
    );
  }

  function toggleDivision(code: string) {
    setDivisionCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  function selectAllVisibleDivisions() {
    setDivisionCodes((current) => {
      const next = new Set(current);

      for (const division of visibleDivisions) {
        next.add(division.division_code);
      }

      return Array.from(next);
    });
  }

  function clearVisibleDivisions() {
    const visibleCodes = new Set(
      visibleDivisions.map(
        (division) => division.division_code,
      ),
    );

    setDivisionCodes((current) =>
      current.filter((code) => !visibleCodes.has(code)),
    );
  }

  function applyTemplate(form: KpiFormOption) {
    setFormName(`${form.form_name} - สำเนา`);
    setScopeType(String(form.scope_type));
    setDivisionCodes([...form.division_codes]);
    setDivisionSearch("");
    setSourceFormVersionId(String(form.form_version_id));

    setSelectedItems(
      form.items.length > 0
        ? [...form.items]
            .sort(
              (first, second) =>
                first.item_order - second.item_order,
            )
            .map((item) => ({
              row_id: nextRowIdRef.current++,
              indicator_version_id:
                item.indicator_version_id,
              weight_percent: String(
                item.weight_percent,
              ),
            }))
        : [
            {
              row_id: nextRowIdRef.current++,
              indicator_version_id: 0,
              weight_percent: "",
            },
          ],
    );

    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function handleTemplateChange(value: string) {
    setSourceFormVersionId(value);

    if (!value) return;

    const form = forms.find(
      (item) => String(item.form_version_id) === value,
    );

    if (form) applyTemplate(form);
  }

  return (
    <>
      {saveState.message && (
        <ActionAlert
          key={`save-${saveState.result_id}`}
          type={saveState.type}
          message={saveState.message}
        />
      )}

      {toggleState.message && (
        <ActionAlert
          key={`toggle-${toggleState.result_id}`}
          type={toggleState.type}
          message={toggleState.message}
        />
      )}

      <div
        ref={formRef}
        className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          สร้างแบบฟอร์ม KPI
        </h2>

        <p className="mb-5 text-sm leading-6 text-gray-500 dark:text-gray-400">
          เลือกหน่วยงานที่ใช้แบบฟอร์มได้หลายหน่วยงาน
          และเพิ่มตัวชี้วัดจาก Dropdown ที่ค้นหาได้ทีละรายการ
        </p>

        <form
          action={saveFormAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <input
            type="hidden"
            name="source_form_version_id"
            value={sourceFormVersionId}
          />

          {divisionCodes.map((code) => (
            <input
              key={`division-${code}`}
              type="hidden"
              name="division_code"
              value={code}
            />
          ))}

          {selectedValidItems.map((item) => (
            <div
              key={`selected-${item.row_id}`}
              className="hidden"
            >
              <input
                type="hidden"
                name="indicator_version_id"
                value={item.indicator_version_id}
              />
              <input
                type="hidden"
                name={`weight_${item.indicator_version_id}`}
                value={item.weight_percent}
              />
            </div>
          ))}

          <div className="lg:col-span-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ชื่อแบบฟอร์ม
            </label>
            <input
              name="form_name"
              required
              maxLength={500}
              value={formName}
              onChange={(event) =>
                setFormName(event.target.value)
              }
              placeholder="เช่น แบบประเมิน KPI กลุ่มงานด้านการรักษา"
              className={inputClassName}
            />
          </div>

          <div className="lg:col-span-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ใช้แบบฟอร์มเดิมเป็นต้นแบบ
            </label>
            <select
              value={sourceFormVersionId}
              onChange={(event) =>
                handleTemplateChange(event.target.value)
              }
              className={inputClassName}
            >
              <option value="">ไม่ใช้ต้นแบบ</option>
              {forms
                .filter((form) => form.active_status)
                .map((form) => (
                  <option
                    key={form.form_version_id}
                    value={form.form_version_id}
                  >
                    {form.form_code} - {form.form_name}
                  </option>
                ))}
            </select>
          </div>

          <div className="lg:col-span-12">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
              หน่วยงานที่ใช้แบบฟอร์ม
            </label>

            <div className="mb-3 flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                <input
                  type="radio"
                  name="scope_type"
                  value="1"
                  checked={scopeType === "1"}
                  onChange={() => {
                    setScopeType("1");
                    setDivisionCodes([]);
                  }}
                />
                ทุกหน่วยงาน
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                <input
                  type="radio"
                  name="scope_type"
                  value="2"
                  checked={scopeType === "2"}
                  onChange={() => setScopeType("2")}
                />
                เลือกหลายหน่วยงาน
              </label>
            </div>

            {scopeType === "2" && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <input
                    value={divisionSearch}
                    onChange={(event) =>
                      setDivisionSearch(event.target.value)
                    }
                    placeholder="ค้นหารหัสหรือชื่อหน่วยงาน..."
                    className={`${inputClassName} md:max-w-xl`}
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisibleDivisions}
                      className="h-10 rounded-lg border border-[#23c6c8] px-3 text-sm font-medium text-[#23c6c8] hover:bg-[#23c6c8]/10"
                    >
                      เลือกที่แสดงทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={clearVisibleDivisions}
                      className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                    >
                      ล้างที่แสดง
                    </button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {visibleDivisions.map((division) => (
                      <label
                        key={division.division_code}
                        className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDivisionSet.has(
                            division.division_code,
                          )}
                          onChange={() =>
                            toggleDivision(
                              division.division_code,
                            )
                          }
                          className="mt-0.5 h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {division.division_name} (
                          {division.division_code})
                        </span>
                      </label>
                    ))}
                  </div>

                  {visibleDivisions.length === 0 && (
                    <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      ไม่พบหน่วยงาน
                    </div>
                  )}
                </div>

                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  เลือกแล้ว{" "}
                  {divisionCodes.length.toLocaleString()} หน่วยงาน
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-12">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
                  ตัวชี้วัดและน้ำหนัก
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Dropdown สามารถพิมพ์ค้นหารหัสหรือชื่อตัวชี้วัดได้
                  และรายการที่เลือกแล้วจะไม่แสดงซ้ำในแถวอื่น
                </p>
              </div>

              <button
                type="button"
                onClick={addIndicatorRow}
                className={addButtonClassName}
              >
                + เพิ่มตัวชี้วัด
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              {selectedItems.map((item, index) => (
                <div
                  key={item.row_id}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 md:grid-cols-[52px_minmax(0,1fr)_180px_90px] md:items-end dark:border-gray-800 dark:bg-white/[0.02]"
                >
                  <div className="flex h-11 items-center justify-center rounded-lg bg-white text-sm font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {index + 1}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      ตัวชี้วัด
                    </label>
                    <SearchableIndicatorSelect
                      options={optionsForRow(item)}
                      value={item.indicator_version_id}
                      onChange={(indicatorVersionId) =>
                        updateIndicator(
                          item.row_id,
                          indicatorVersionId,
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      น้ำหนัก
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        disabled={
                          item.indicator_version_id === 0
                        }
                        value={item.weight_percent}
                        onChange={(event) =>
                          updateWeight(
                            item.row_id,
                            event.target.value,
                          )
                        }
                        placeholder="0"
                        className={
                          item.indicator_version_id === 0
                            ? `${inputClassName} cursor-not-allowed bg-gray-100 dark:bg-gray-800`
                            : inputClassName
                        }
                      />
                      <span className="text-sm text-gray-500">
                        %
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      removeIndicatorRow(item.row_id)
                    }
                    className={removeButtonClassName}
                  >
                    ลบ
                  </button>
                </div>
              ))}

              {availableIndicators.length === 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
                  ไม่พบตัวชี้วัดที่ใช้ร่วมกันได้กับหน่วยงานที่เลือก
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-12">
            <div
              className={[
                "rounded-xl border px-4 py-3 text-sm",
                totalWeight === 100 &&
                invalidItemCount === 0 &&
                duplicateCount === 0 &&
                !(
                  scopeType === "2" &&
                  divisionCodes.length === 0
                )
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-200"
                  : totalWeight > 100
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
                    : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200",
              ].join(" ")}
            >
              เลือกแล้ว{" "}
              {selectedValidItems.length.toLocaleString()} ตัวชี้วัด
              {" • "}
              น้ำหนักรวม {totalWeight.toLocaleString()}%
              {scopeType === "2" && (
                <>
                  {" • "}
                  หน่วยงาน{" "}
                  {divisionCodes.length.toLocaleString()} แห่ง
                </>
              )}
              {totalWeight < 100 && (
                <>
                  {" • "}
                  ยังขาด{" "}
                  {(100 - totalWeight).toLocaleString()}%
                </>
              )}
              {totalWeight > 100 && (
                <>
                  {" • "}
                  เกิน{" "}
                  {(totalWeight - 100).toLocaleString()}%
                </>
              )}
              {invalidItemCount > 0 && (
                <> • มีน้ำหนักที่ไม่ถูกต้อง</>
              )}
              {duplicateCount > 0 && (
                <> • พบตัวชี้วัดซ้ำ</>
              )}
              {scopeType === "2" &&
                divisionCodes.length === 0 && (
                  <> • กรุณาเลือกหน่วยงาน</>
                )}
            </div>
          </div>

          <div className="flex justify-end lg:col-span-12">
            <button
              type="submit"
              disabled={disableSubmit}
              className={
                disableSubmit
                  ? disabledButtonClassName
                  : saveButtonClassName
              }
            >
              {isSaving
                ? "กำลังบันทึก..."
                : "บันทึกแบบฟอร์ม KPI"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการแบบฟอร์ม KPI
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ทั้งหมด {forms.length.toLocaleString()} แบบฟอร์ม
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {[
                  "รหัส",
                  "ชื่อแบบฟอร์ม",
                  "หน่วยงานที่ใช้",
                  "ตัวชี้วัด",
                  "น้ำหนักรวม",
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
              {forms.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ยังไม่มีแบบฟอร์ม KPI
                  </td>
                </tr>
              ) : (
                forms.map((form) => (
                  <tr key={form.form_id}>
                    <td className="px-5 py-4 align-top text-sm font-semibold text-[#23c6c8]">
                      {form.form_code}
                      <div className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                        Version {form.version_no}
                      </div>
                    </td>

                    <td className="max-w-md px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      {form.form_name}
                    </td>

                    <td className="max-w-sm px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      {form.scope_type === 1 ? (
                        "ทุกหน่วยงาน"
                      ) : (
                        <>
                          <div>
                            {form.division_codes.length.toLocaleString()}{" "}
                            หน่วยงาน
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                            {form.division_names.join(", ")}
                          </div>
                        </>
                      )}
                    </td>

                    <td className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      {form.items.length.toLocaleString()} ข้อ
                    </td>

                    <td className="px-5 py-4 align-top text-sm font-semibold text-gray-800 dark:text-white/90">
                      {form.total_weight_percent.toLocaleString()}%
                    </td>

                    <td className="px-5 py-4 align-top">
                      <form action={toggleFormAction}>
                        <input
                          type="hidden"
                          name="form_id"
                          value={form.form_id}
                        />
                        <input
                          type="hidden"
                          name="active_status"
                          value={
                            form.active_status ? "0" : "1"
                          }
                        />

                        <button
                          type="submit"
                          disabled={isToggling}
                          className={[
                            "relative inline-flex h-6 w-14 items-center rounded-full border transition",
                            isToggling
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer",
                            form.active_status
                              ? "border-[#1ab394] bg-[#1ab394]"
                              : "border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-800",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "absolute h-5 w-5 rounded-full bg-white shadow transition",
                              form.active_status
                                ? "translate-x-8"
                                : "translate-x-0.5",
                            ].join(" ")}
                          />
                        </button>
                      </form>

                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {form.active_status
                          ? "เปิดใช้งาน"
                          : "ปิดใช้งาน"}
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => applyTemplate(form)}
                        className={orangeButtonClassName}
                      >
                        ใช้เป็นต้นแบบ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}