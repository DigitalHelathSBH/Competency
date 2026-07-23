"use client";

import ActionAlert from "@/components/competency/ActionAlert";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type KpiCategoryOption = {
  category_id: number;
  category_code: string;
  category_name: string;
  running_digits: number;
  next_running_no: number;
  active_status: boolean;
};

export type DivisionOption = {
  division_code: string;
  division_name: string;
};

export type KpiRuleItem = {
  score_level: number;
  operator_type: string;
  compare_value: number;
  evaluation_order: number;
};

export type KpiIndicatorItem = {
  indicator_id: number;
  indicator_code: string;
  category_id: number;
  category_code: string;
  category_name: string;
  version_no: number;
  indicator_name: string;
  scope_type: number;
  score_direction_type: number;
  note: string;
  active_status: boolean;
  rules: KpiRuleItem[];
  division_codes: string[];
};

export type KpiActionState = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  result_id: number;
  entity_id: number;
  entity_code: string;
};

type RuleForm = {
  level: number;
  enabled: boolean;
  operator: string;
  value: string;
};

type IndicatorForm = {
  indicatorId: number;
  indicatorCode: string;
  categoryId: string;
  indicatorName: string;
  scopeType: string;
  directionType: string;
  note: string;
  rules: RuleForm[];
  divisionCodes: string[];
};

type Props = {
  categories: KpiCategoryOption[];
  divisions: DivisionOption[];
  indicators: KpiIndicatorItem[];
  saveIndicatorAction: (
    previousState: KpiActionState,
    formData: FormData,
  ) => Promise<KpiActionState>;
  createCategoryAction: (
    previousState: KpiActionState,
    formData: FormData,
  ) => Promise<KpiActionState>;
  toggleIndicatorAction: (
    previousState: KpiActionState,
    formData: FormData,
  ) => Promise<KpiActionState>;
};

const initialActionState: KpiActionState = {
  ok: false,
  type: "info",
  message: "",
  result_id: 0,
  entity_id: 0,
  entity_code: "",
};

const operatorOptions = [
  { value: "GT", label: ">" },
  { value: "GE", label: ">=" },
  { value: "LT", label: "<" },
  { value: "LE", label: "<=" },
  { value: "EQ", label: "=" },
];

const operatorLabel: Record<string, string> = {
  GT: ">",
  GE: ">=",
  LT: "<",
  LE: "<=",
  EQ: "=",
};

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const disabledInputClassName =
  "h-11 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-500 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400";

const saveButtonClassName =
  "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

const cancelButtonClassName =
  "h-11 rounded-lg border border-[#ed5565] bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]";

function defaultRules(): RuleForm[] {
  return [5, 4, 3, 2, 1].map((level) => ({
    level,
    enabled: true,
    operator: level === 1 ? "GT" : "LE",
    value: "",
  }));
}

function emptyForm(defaultCategoryId = ""): IndicatorForm {
  return {
    indicatorId: 0,
    indicatorCode: "",
    categoryId: defaultCategoryId,
    indicatorName: "",
    scopeType: "1",
    directionType: "2",
    note: "",
    rules: defaultRules(),
    divisionCodes: [],
  };
}

function normalizeCategoryCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export default function KpiIndicatorFormTable({
  categories,
  divisions,
  indicators,
  saveIndicatorAction,
  createCategoryAction,
  toggleIndicatorAction,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement | null>(null);

  const defaultCategoryId = String(
    categories.find(
      (item) =>
        item.category_code === "GEN" &&
        item.active_status,
    )?.category_id ||
      categories.find((item) => item.active_status)?.category_id ||
      "",
  );

  const [form, setForm] = useState<IndicatorForm>(() =>
    emptyForm(defaultCategoryId),
  );
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryCode, setCategoryCode] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [divisionSearch, setDivisionSearch] = useState("");

  const [saveState, saveFormAction, isSaving] = useActionState(
    saveIndicatorAction,
    initialActionState,
  );
  const [categoryState, categoryFormAction, isSavingCategory] =
    useActionState(createCategoryAction, initialActionState);
  const [toggleState, toggleFormAction, isToggling] = useActionState(
    toggleIndicatorAction,
    initialActionState,
  );

  const isEditMode = form.indicatorId > 0;

  const selectedCategory = categories.find(
    (item) => String(item.category_id) === form.categoryId,
  );

  const previewCode = isEditMode
    ? form.indicatorCode
    : selectedCategory
      ? selectedCategory.category_code +
        String(selectedCategory.next_running_no).padStart(
          selectedCategory.running_digits,
          "0",
        )
      : "-";

  const visibleDivisions = useMemo(() => {
    const keyword = divisionSearch.trim().toLowerCase();

    if (!keyword) return divisions;

    return divisions.filter((item) => {
      return (
        item.division_code.toLowerCase().includes(keyword) ||
        item.division_name.toLowerCase().includes(keyword)
      );
    });
  }, [divisionSearch, divisions]);

  const enabledRules = form.rules.filter((rule) => rule.enabled);

  const formInvalid =
    !form.categoryId ||
    !form.indicatorName.trim() ||
    enabledRules.length === 0 ||
    enabledRules.some(
      (rule) =>
        !operatorOptions.some((item) => item.value === rule.operator) ||
        rule.value.trim() === "" ||
        !Number.isInteger(Number(rule.value)) ||
        Number(rule.value) < 0,
    ) ||
    (form.scopeType === "2" && form.divisionCodes.length === 0);

  useEffect(() => {
    if (!saveState.ok || !saveState.result_id) return;

    setForm(emptyForm(defaultCategoryId));
    setDivisionSearch("");
    router.refresh();
  }, [
    defaultCategoryId,
    router,
    saveState.ok,
    saveState.result_id,
  ]);

  useEffect(() => {
    if (
      !categoryState.ok ||
      !categoryState.result_id ||
      !categoryState.entity_id
    ) {
      return;
    }

    setForm((current) => ({
      ...current,
      categoryId: String(categoryState.entity_id),
    }));
    setCategoryCode("");
    setCategoryName("");
    setShowCategoryForm(false);
    router.refresh();
  }, [
    categoryState.entity_id,
    categoryState.ok,
    categoryState.result_id,
    router,
  ]);

  function updateRule(
    level: number,
    field: "operator" | "value",
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule) =>
        rule.level === level ? { ...rule, [field]: value } : rule,
      ),
    }));
  }

  function toggleRule(level: number) {
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule) =>
        rule.level === level
          ? { ...rule, enabled: !rule.enabled }
          : rule,
      ),
    }));
  }

  function toggleDivision(code: string) {
    setForm((current) => {
      const selected = current.divisionCodes.includes(code);

      return {
        ...current,
        divisionCodes: selected
          ? current.divisionCodes.filter((item) => item !== code)
          : [...current.divisionCodes, code],
      };
    });
  }

  function startEdit(item: KpiIndicatorItem) {
    setForm({
      indicatorId: item.indicator_id,
      indicatorCode: item.indicator_code,
      categoryId: String(item.category_id),
      indicatorName: item.indicator_name,
      scopeType: String(item.scope_type),
      directionType: String(item.score_direction_type),
      note: item.note || "",
      rules: [5, 4, 3, 2, 1].map((level) => {
        const rule = item.rules.find(
          (value) => value.score_level === level,
        );

        return {
          level,
          enabled: Boolean(rule),
          operator:
            rule?.operator_type || (level === 1 ? "EQ" : "LE"),
          value: rule ? String(rule.compare_value) : "",
        };
      }),
      divisionCodes: [...item.division_codes],
    });
    setDivisionSearch("");

    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function clearForm() {
    setForm(emptyForm(defaultCategoryId));
    setDivisionSearch("");
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

      {categoryState.message && (
        <ActionAlert
          key={`category-${categoryState.result_id}`}
          type={categoryState.type}
          message={categoryState.message}
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
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {isEditMode
                ? "แก้ไขหัวข้อตัวชี้วัด"
                : "เพิ่มหัวข้อตัวชี้วัด"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              กำหนดเกณฑ์ระดับ 5–1 เป็นจำนวนเต็ม
              ระบบจะตรวจว่าค่าทุกช่วงต้องได้ระดับคะแนน
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCategoryForm((current) => !current)}
            className="h-10 rounded-lg border border-[#23c6c8] bg-[#23c6c8] px-4 text-sm font-medium text-white hover:bg-[#1fb5b7]"
          >
            {showCategoryForm ? "ปิดเพิ่มหมวด" : "+ เพิ่มหมวดใหม่"}
          </button>
        </div>

        {showCategoryForm && (
          <form
            action={categoryFormAction}
            className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-[#23c6c8]/30 bg-[#23c6c8]/5 p-4 lg:grid-cols-12"
          >
            <div className="lg:col-span-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                รหัสหมวด
              </label>
              <input
                name="category_code"
                required
                value={categoryCode}
                onChange={(event) =>
                  setCategoryCode(normalizeCategoryCode(event.target.value))
                }
                placeholder="เช่น ACC"
                className={inputClassName}
              />
            </div>

            <div className="lg:col-span-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ชื่อหมวด
              </label>
              <input
                name="category_name"
                required
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="เช่น งานบัญชีและการเงิน"
                className={inputClassName}
              />
            </div>

            <div className="flex items-end lg:col-span-3">
              <button
                type="submit"
                disabled={
                  isSavingCategory ||
                  categoryCode.length < 2 ||
                  !categoryName.trim()
                }
                className={saveButtonClassName}
              >
                {isSavingCategory
                  ? "กำลังเพิ่ม..."
                  : "เพิ่มและเลือกหมวดนี้"}
              </button>
            </div>

            <div className="lg:col-span-12">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ระบบกำหนดเลขรันให้ 3 หลักอัตโนมัติ เช่น ACC001,
                ACC002
              </p>
            </div>
          </form>
        )}

        <form
          action={saveFormAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <input
            type="hidden"
            name="indicator_id"
            value={form.indicatorId}
          />

          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              หมวดรหัส
            </label>

            {isEditMode ? (
              <>
                <input
                  type="hidden"
                  name="category_id"
                  value={form.categoryId}
                />
                <input
                  disabled
                  value={
                    selectedCategory
                      ? `${selectedCategory.category_code} - ${selectedCategory.category_name}`
                      : "-"
                  }
                  className={disabledInputClassName}
                />
              </>
            ) : (
              <select
                name="category_id"
                required
                value={form.categoryId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">เลือกหมวดรหัส</option>
                {categories
                  .filter((category) => category.active_status)
                  .map((category) => (
                    <option
                      key={category.category_id}
                      value={category.category_id}
                    >
                      {category.category_code} - {category.category_name}
                    </option>
                  ))}
              </select>
            )}
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รหัสตัวชี้วัด
            </label>
            <input
              disabled
              value={previewCode}
              className={disabledInputClassName}
            />
          </div>

          <div className="lg:col-span-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ชื่อตัวชี้วัด
            </label>
            <input
              name="indicator_name"
              required
              maxLength={1000}
              value={form.indicatorName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  indicatorName: event.target.value,
                }))
              }
              placeholder="กรอกชื่อพร้อมหน่วยหรือร้อยละในชื่อหัวข้อ"
              className={inputClassName}
            />
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ประเภทการใช้งาน
            </label>
            <select
              name="scope_type"
              value={form.scopeType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  scopeType: event.target.value,
                  divisionCodes:
                    event.target.value === "1"
                      ? []
                      : current.divisionCodes,
                }))
              }
              className={inputClassName}
            >
              <option value="1">ใช้ทั้งโรงพยาบาล</option>
              <option value="2">ใช้เฉพาะกลุ่มงาน</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              แนวโน้มคะแนน
            </label>
            <select
              name="score_direction_type"
              value={form.directionType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  directionType: event.target.value,
                }))
              }
              className={inputClassName}
            >
              <option value="1">ค่ายิ่งมากยิ่งดี</option>
              <option value="2">ค่ายิ่งน้อยยิ่งดี</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              หมายเหตุ
            </label>
            <input
              name="note"
              maxLength={2000}
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="ระบุเพิ่มเติมได้"
              className={inputClassName}
            />
          </div>

          <div className="lg:col-span-12">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ระดับการประเมิน
            </label>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {form.rules.map((rule) => (
                <div
                  key={rule.level}
                  className={[
                    "rounded-xl border p-3 transition",
                    rule.enabled
                      ? "border-gray-200 dark:border-gray-800"
                      : "border-gray-200 bg-gray-50 opacity-70 dark:border-gray-800 dark:bg-gray-900/40",
                  ].join(" ")}
                >
                  <label className="mb-3 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name={`enabled_level_${rule.level}`}
                      value="1"
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule.level)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="font-semibold text-gray-800 dark:text-white/90">
                      ระดับ {rule.level}
                    </span>
                  </label>

                  <div className="grid grid-cols-[90px_1fr] gap-2">
                    <select
                      name={`operator_${rule.level}`}
                      value={rule.operator}
                      disabled={!rule.enabled}
                      onChange={(event) =>
                        updateRule(
                          rule.level,
                          "operator",
                          event.target.value,
                        )
                      }
                      className={
                        rule.enabled
                          ? inputClassName
                          : disabledInputClassName
                      }
                    >
                      {operatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <input
                      name={`value_${rule.level}`}
                      type="number"
                      min="0"
                      step="1"
                      required={rule.enabled}
                      disabled={!rule.enabled}
                      value={rule.value}
                      onChange={(event) =>
                        updateRule(
                          rule.level,
                          "value",
                          event.target.value,
                        )
                      }
                      className={
                        rule.enabled
                          ? inputClassName
                          : disabledInputClassName
                      }
                    />
                  </div>

                  {!rule.enabled && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      ไม่ใช้ระดับนี้
                    </p>
                  )}
                </div>
              ))}
            </div>

            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
              สามารถปิดระดับที่ไม่ใช้ได้ เช่น ใช้เฉพาะระดับ 5, 4 และ 1
              แต่ระดับที่เปิดใช้งานห้ามใช้เงื่อนไขซ้ำกัน
              และค่าผลงานตั้งแต่ 0 ขึ้นไปต้องได้ระดับคะแนนเสมอ
            </p>
          </div>

          {form.scopeType === "2" && (
            <div className="lg:col-span-12">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">
                กลุ่มงานที่ใช้ตัวชี้วัด
              </label>

              <input
                value={divisionSearch}
                onChange={(event) =>
                  setDivisionSearch(event.target.value)
                }
                placeholder="ค้นหารหัสหรือชื่อกลุ่มงาน..."
                className={`${inputClassName} mb-3`}
              />

              <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {visibleDivisions.map((division) => (
                    <label
                      key={division.division_code}
                      className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        name="division_code"
                        value={division.division_code}
                        checked={form.divisionCodes.includes(
                          division.division_code,
                        )}
                        onChange={() =>
                          toggleDivision(division.division_code)
                        }
                        className="mt-0.5 h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {division.division_name} ({division.division_code})
                      </span>
                    </label>
                  ))}
                </div>

                {visibleDivisions.length === 0 && (
                  <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    ไม่พบกลุ่มงาน
                  </div>
                )}
              </div>

              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                เลือกแล้ว {form.divisionCodes.length.toLocaleString()}{" "}
                กลุ่มงาน
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 lg:col-span-12">
            {isEditMode && (
              <button
                type="button"
                onClick={clearForm}
                className={cancelButtonClassName}
              >
                ยกเลิกแก้ไข
              </button>
            )}

            <button
              type="submit"
              disabled={isSaving || formInvalid}
              className={saveButtonClassName}
            >
              {isSaving
                ? "กำลังบันทึก..."
                : isEditMode
                  ? "บันทึกเป็น Version ใหม่"
                  : "บันทึกตัวชี้วัด"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการหัวข้อตัวชี้วัด
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ทั้งหมด {indicators.length.toLocaleString()} รายการ
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {[
                  "รหัส",
                  "ชื่อตัวชี้วัด",
                  "การใช้งาน",
                  "เกณฑ์ระดับ 5–1",
                  "Version",
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
              {indicators.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ยังไม่มีหัวข้อตัวชี้วัด
                  </td>
                </tr>
              ) : (
                indicators.map((item) => (
                  <tr key={item.indicator_id}>
                    <td className="px-5 py-4 align-top text-sm font-semibold text-[#23c6c8]">
                      {item.indicator_code}
                      <div className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                        {item.category_name}
                      </div>
                    </td>

                    <td className="max-w-xl px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      <div className="font-medium text-gray-800 dark:text-white/90">
                        {item.indicator_name}
                      </div>
                      {item.note && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {item.note}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      {item.scope_type === 1
                        ? "ทั้งโรงพยาบาล"
                        : `${item.division_codes.length.toLocaleString()} กลุ่มงาน`}
                    </td>

                    <td className="min-w-60 px-5 py-4 align-top text-xs leading-6 text-gray-600 dark:text-gray-300">
                      {[5, 4, 3, 2, 1].map((level) => {
                        const rule = item.rules.find(
                          (value) => value.score_level === level,
                        );

                        return (
                          <div key={level}>
                            ระดับ {level}:{" "}
                            {rule
                              ? `${operatorLabel[rule.operator_type] || "-"} ${rule.compare_value}`
                              : "ไม่ใช้"}
                          </div>
                        );
                      })}
                    </td>

                    <td className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      {item.version_no}
                    </td>

                    <td className="px-5 py-4 align-top">
                      <form action={toggleFormAction}>
                        <input
                          type="hidden"
                          name="indicator_id"
                          value={item.indicator_id}
                        />
                        <input
                          type="hidden"
                          name="active_status"
                          value={item.active_status ? "0" : "1"}
                        />

                        <button
                          type="submit"
                          disabled={isToggling}
                          className={[
                            "relative inline-flex h-6 w-14 items-center rounded-full border transition",
                            isToggling
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer",
                            item.active_status
                              ? "border-[#1ab394] bg-[#1ab394]"
                              : "border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-800",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "absolute h-5 w-5 rounded-full bg-white shadow transition",
                              item.active_status
                                ? "translate-x-8"
                                : "translate-x-0.5",
                            ].join(" ")}
                          />
                        </button>
                      </form>

                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {item.active_status
                          ? "เปิดใช้งาน"
                          : "ปิดใช้งาน"}
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-lg border border-[#f8ac59] bg-[#f8ac59] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#f7a23b]"
                      >
                        แก้ไข
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