"use client";

import DataTable from "@/components/competency/DataTable";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

export type PositionOption = {
  position_code: string;
  position_name: string;
};

export type ProfessionQuestionOption = {
  question_id: number;
  question_title: string;
  version_no: number;
};

export type ProfessionQuestionMapItem = {
  position_code: string;
  position_name: string;
  question_5_id: number;
  question_5_title: string;
  question_6_id: number;
  question_6_title: string;
  question_7_id: number;
  question_7_title: string;
  active_status: boolean;
};

type ProfessionQuestionMapFormTableProps = {
  positions: PositionOption[];
  professionQuestions: ProfessionQuestionOption[];
  professionQuestionMaps: ProfessionQuestionMapItem[];
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
};

type SearchableOption = {
  value: string;
  label: string;
};

type SearchableDropdownProps = {
  name: string;
  value: string;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-left text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253] disabled:cursor-not-allowed disabled:opacity-60";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689] disabled:cursor-not-allowed disabled:opacity-60";

function SearchableDropdown({
  name,
  value,
  options,
  placeholder,
  searchPlaceholder = "ค้นหา...",
  required = false,
  disabled = false,
  onChange,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const keyword = searchText.trim().toLocaleLowerCase("th-TH");

    if (!keyword) return options;

    return options.filter((option) =>
      option.label.toLocaleLowerCase("th-TH").includes(keyword),
    );
  }, [options, searchText]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchText("");
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (isOpen) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  function selectOption(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setSearchText("");
  }

  return (
    <div ref={dropdownRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />

      <button
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        onClick={() => {
          if (!disabled) setIsOpen((current) => !current);
        }}
        className={`${inputClass} flex items-center justify-between gap-3`}
      >
        <span
          className={
            selectedOption
              ? "truncate"
              : "truncate text-gray-400 dark:text-gray-500"
          }
        >
          {selectedOption?.label || placeholder}
        </span>
        <span className="shrink-0 text-gray-400">⌄</span>
      </button>

      {isOpen ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 p-2 dark:border-gray-800">
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
            />
          </div>

          <div role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectOption(option.value)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected ? (
                      <span className="ml-3 text-brand-500">✓</span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                ไม่พบข้อมูลที่ค้นหา
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActiveStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
      เปิดใช้งาน
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
      ปิดใช้งาน
    </span>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง";
}

export default function ProfessionQuestionMapFormTable({
  positions,
  professionQuestions,
  professionQuestionMaps,
  createAction,
  updateAction,
  toggleAction,
}: ProfessionQuestionMapFormTableProps) {
  const [editingItem, setEditingItem] =
    useState<ProfessionQuestionMapItem | null>(null);
  const [selectedPositionCode, setSelectedPositionCode] = useState("");
  const [question5Id, setQuestion5Id] = useState("");
  const [question6Id, setQuestion6Id] = useState("");
  const [question7Id, setQuestion7Id] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formPositionRef = useRef<HTMLDivElement>(null);

  const mappedPositionCodes = useMemo(
    () => new Set(professionQuestionMaps.map((item) => item.position_code)),
    [professionQuestionMaps],
  );

  const selectablePositions = useMemo(() => {
    if (editingItem) return positions;

    return positions.filter(
      (position) => !mappedPositionCodes.has(position.position_code),
    );
  }, [editingItem, mappedPositionCodes, positions]);

  const positionOptions = useMemo(
    () =>
      selectablePositions.map((position) => ({
        value: position.position_code,
        label: `${position.position_name} [ ${position.position_code} ]`,
      })),
    [selectablePositions],
  );

  const baseQuestionOptions = useMemo(
    () =>
      professionQuestions.map((question) => ({
        value: String(question.question_id),
        label: question.question_title,
      })),
    [professionQuestions],
  );

  function getQuestionOptions(
    currentValue: string,
    otherValue1: string,
    otherValue2: string,
  ) {
    return baseQuestionOptions.filter(
      (option) =>
        option.value === currentValue ||
        (option.value !== otherValue1 && option.value !== otherValue2),
    );
  }

  const question5Options = useMemo(
    () => getQuestionOptions(question5Id, question6Id, question7Id),
    [baseQuestionOptions, question5Id, question6Id, question7Id],
  );

  const question6Options = useMemo(
    () => getQuestionOptions(question6Id, question5Id, question7Id),
    [baseQuestionOptions, question5Id, question6Id, question7Id],
  );

  const question7Options = useMemo(
    () => getQuestionOptions(question7Id, question5Id, question6Id),
    [baseQuestionOptions, question5Id, question6Id, question7Id],
  );

  const isFormComplete =
    Boolean(selectedPositionCode) &&
    Boolean(question5Id) &&
    Boolean(question6Id) &&
    Boolean(question7Id) &&
    new Set([question5Id, question6Id, question7Id]).size === 3;

  function resetForm() {
    setEditingItem(null);
    setSelectedPositionCode("");
    setQuestion5Id("");
    setQuestion6Id("");
    setQuestion7Id("");
    setErrorMessage("");
  }

  function handleEdit(item: ProfessionQuestionMapItem) {
    setEditingItem(item);
    setSelectedPositionCode(item.position_code);
    setQuestion5Id(item.question_5_id ? String(item.question_5_id) : "");
    setQuestion6Id(item.question_6_id ? String(item.question_6_id) : "");
    setQuestion7Id(item.question_7_id ? String(item.question_7_id) : "");
    setErrorMessage("");

    window.requestAnimationFrame(() => {
      formPositionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const action = editingItem ? updateAction : createAction;

    startTransition(async () => {
      try {
        await action(formData);
        resetForm();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    });
  }

  function handleToggle(item: ProfessionQuestionMapItem) {
    setErrorMessage("");

    const formData = new FormData();
    formData.set("position_code", item.position_code);
    formData.set("active_status", item.active_status ? "0" : "1");

    startTransition(async () => {
      try {
        await toggleAction(formData);

        if (editingItem?.position_code === item.position_code) {
          resetForm();
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error));

        window.requestAnimationFrame(() => {
          formPositionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    });
  }

  return (
    <>
      <div
        ref={formPositionRef}
        className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {editingItem
              ? "แก้ไขหัวข้อประเมินของวิชาชีพ"
              : "เพิ่มหัวข้อประเมินของวิชาชีพ"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            วิชาชีพที่กำหนดครบข้อ 5 ถึงข้อ 7 จะใช้แบบประเมิน 7 ข้อ ส่วนวิชาชีพที่ยังไม่ได้กำหนดจะใช้แบบประเมิน 4 ข้อ
          </p>
          {editingItem ? (
            <p className="mt-1 text-sm font-medium text-[#f8ac59]">
              กำลังแก้ไข: {editingItem.position_name} [ {editingItem.position_code} ]
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-[#ed5565]/30 bg-[#ed5565]/10 px-4 py-3 text-sm text-[#ed5565]">
            {errorMessage}
          </div>
        ) : null}

        <form
          key={editingItem?.position_code ?? "create"}
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 md:grid-cols-12"
        >
          <div className="md:col-span-12">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              วิชาชีพ
            </label>

            {editingItem ? (
              <>
                <input
                  type="hidden"
                  name="position_code"
                  value={selectedPositionCode}
                />
                <div className={`${inputClass} flex items-center bg-gray-100 dark:bg-gray-800`}>
                  {editingItem.position_name} [ {editingItem.position_code} ]
                </div>
              </>
            ) : (
              <SearchableDropdown
                name="position_code"
                required
                value={selectedPositionCode}
                onChange={setSelectedPositionCode}
                placeholder="เลือกวิชาชีพ"
                searchPlaceholder="ค้นหาชื่อหรือรหัสวิชาชีพ..."
                options={positionOptions}
                disabled={isPending}
              />
            )}
          </div>

          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ข้อ 5
            </label>
            <SearchableDropdown
              name="question_5_id"
              required
              value={question5Id}
              onChange={setQuestion5Id}
              placeholder="เลือกหัวข้อข้อ 5"
              searchPlaceholder="ค้นหาหัวข้อประเมิน..."
              options={question5Options}
              disabled={isPending}
            />
          </div>

          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ข้อ 6
            </label>
            <SearchableDropdown
              name="question_6_id"
              required
              value={question6Id}
              onChange={setQuestion6Id}
              placeholder="เลือกหัวข้อข้อ 6"
              searchPlaceholder="ค้นหาหัวข้อประเมิน..."
              options={question6Options}
              disabled={isPending}
            />
          </div>

          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ข้อ 7
            </label>
            <SearchableDropdown
              name="question_7_id"
              required
              value={question7Id}
              onChange={setQuestion7Id}
              placeholder="เลือกหัวข้อข้อ 7"
              searchPlaceholder="ค้นหาหัวข้อประเมิน..."
              options={question7Options}
              disabled={isPending}
            />
          </div>

          {!editingItem && selectablePositions.length === 0 ? (
            <div className="md:col-span-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
              วิชาชีพที่อยู่ในรายการถูกกำหนดหัวข้อครบแล้ว
            </div>
          ) : null}

          {professionQuestions.length < 3 ? (
            <div className="md:col-span-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
              ต้องมีหัวข้อตามวิชาชีพที่เปิดใช้งานอย่างน้อย 3 หัวข้อก่อนจึงจะกำหนดให้วิชาชีพได้
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 md:col-span-12">
            {editingItem ? (
              <button
                type="button"
                onClick={resetForm}
                disabled={isPending}
                className="h-11 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253] disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยกเลิกการแก้ไข
              </button>
            ) : null}

            <button
              type="submit"
              disabled={
                isPending ||
                !isFormComplete ||
                professionQuestions.length < 3 ||
                (!editingItem && selectablePositions.length === 0)
              }
              className={
                editingItem
                  ? "h-11 rounded-lg bg-[#f8ac59] px-5 text-sm font-medium text-white hover:bg-[#f6a23c] disabled:cursor-not-allowed disabled:opacity-60"
                  : "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              {isPending
                ? "กำลังบันทึก..."
                : editingItem
                  ? "บันทึกการแก้ไข"
                  : "บันทึกหัวข้อของวิชาชีพ"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">
          รายการหัวข้อประเมินตามวิชาชีพ
        </h2>

        <DataTable
          headers={[
            "วิชาชีพ",
            "ข้อ 5",
            "ข้อ 6",
            "ข้อ 7",
            "สถานะ",
            "จัดการ",
          ]}
          emptyText="ยังไม่มีการกำหนดหัวข้อประเมินตามวิชาชีพ"
        >
          {professionQuestionMaps.map((item) => (
            <tr
              key={item.position_code}
              data-search={`${item.position_code} ${item.position_name} ${item.question_5_title} ${item.question_6_title} ${item.question_7_title} ${item.active_status ? "เปิดใช้งาน" : "ปิดใช้งาน"}`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <div className="font-medium text-gray-800 dark:text-white/90">
                  {item.position_name}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {item.position_code}
                </div>
              </td>
              <td className="min-w-56 px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {item.question_5_title || "ยังไม่กำหนด"}
              </td>
              <td className="min-w-56 px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {item.question_6_title || "ยังไม่กำหนด"}
              </td>
              <td className="min-w-56 px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {item.question_7_title || "ยังไม่กำหนด"}
              </td>
              <td className="px-5 py-4 text-sm">
                <ActiveStatusBadge active={Boolean(item.active_status)} />
              </td>
              <td className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    disabled={isPending}
                    className="rounded-lg bg-[#f8ac59] px-4 py-2 text-xs font-medium text-white hover:bg-[#f6a23c] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    แก้ไข
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggle(item)}
                    disabled={isPending}
                    className={
                      item.active_status
                        ? redActionButtonClass
                        : greenActionButtonClass
                    }
                  >
                    {item.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}