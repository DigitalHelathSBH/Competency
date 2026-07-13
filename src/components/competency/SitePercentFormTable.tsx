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

export type StaffTypeOption = {
  site_code: string;
  staff_type_name: string;
};

export type SitePercentItem = {
  site_percent_id: number;
  site_code: string;
  staff_type_name: string;
  competency_percent: number;
  active_status: boolean;
};

type SitePercentFormTableProps = {
  staffTypes: StaffTypeOption[];
  sitePercents: SitePercentItem[];
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
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

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

  return (
    <div ref={dropdownRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((current) => !current);
        }}
        className={`${inputClass} flex items-center justify-between text-left`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className={
            selectedOption
              ? "truncate text-gray-800 dark:text-white/90"
              : "truncate text-gray-500 dark:text-gray-400"
          }
        >
          {selectedOption?.label || placeholder}
        </span>
        <span className="ml-3 text-gray-400">⌄</span>
      </button>

      {required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => undefined}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      ) : null}

      {isOpen ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-2 dark:border-gray-700">
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={searchPlaceholder}
              className={inputClass}
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setSearchText("");
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      isSelected
                        ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
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

function formatPercent(value: number) {
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default function SitePercentFormTable({
  staffTypes,
  sitePercents,
  createAction,
  updateAction,
  toggleAction,
}: SitePercentFormTableProps) {
  const [editingItem, setEditingItem] = useState<SitePercentItem | null>(null);
  const [selectedSiteCode, setSelectedSiteCode] = useState("");
  const [competencyPercent, setCompetencyPercent] = useState("30");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formSectionRef = useRef<HTMLDivElement>(null);

  const configuredSiteCodes = useMemo(
    () => new Set(sitePercents.map((item) => item.site_code)),
    [sitePercents],
  );

  const staffTypeSelectOptions = useMemo(() => {
    return staffTypes
      .filter(
        (item) =>
          editingItem?.site_code === item.site_code ||
          !configuredSiteCodes.has(item.site_code),
      )
      .map((item) => ({
        value: item.site_code,
        label: item.staff_type_name,
      }));
  }, [configuredSiteCodes, editingItem?.site_code, staffTypes]);

  function resetForm() {
    setEditingItem(null);
    setSelectedSiteCode("");
    setCompetencyPercent("30");
    setErrorMessage("");
  }

  function handleEdit(item: SitePercentItem) {
    setErrorMessage("");
    setEditingItem(item);
    setSelectedSiteCode(item.site_code);
    setCompetencyPercent(String(item.competency_percent));

    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
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

  return (
    <>
      <div
        ref={formSectionRef}
        className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {editingItem
              ? "แก้ไขเปอร์เซ็นต์ Competency"
              : "เพิ่มเปอร์เซ็นต์ Competency"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ประเภทบุคลากรที่ไม่ได้กำหนดหรือปิดใช้งานจะใช้ค่า 20%
          </p>
          {editingItem ? (
            <p className="mt-1 text-sm font-medium text-[#f8ac59]">
              กำลังแก้ไข: {editingItem.staff_type_name}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-[#ed5565]/30 bg-[#ed5565]/10 px-4 py-3 text-sm text-[#ed5565]">
            {errorMessage}
          </div>
        ) : null}

        <form
          key={editingItem?.site_percent_id ?? "create"}
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 md:grid-cols-12"
        >
          {editingItem ? (
            <input
              type="hidden"
              name="site_percent_id"
              value={editingItem.site_percent_id}
            />
          ) : null}

          <div className="md:col-span-8">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ประเภทบุคลากร
            </label>
            <SearchableDropdown
              name="site_code"
              required={!editingItem}
              value={selectedSiteCode}
              onChange={setSelectedSiteCode}
              placeholder="เลือกประเภทบุคลากร"
              searchPlaceholder="ค้นหาประเภทบุคลากร..."
              options={staffTypeSelectOptions}
              disabled={isPending || Boolean(editingItem)}
            />
          </div>

          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              เปอร์เซ็นต์ Competency
            </label>
            <div className="relative">
              <input
                type="number"
                name="competency_percent"
                min="0"
                max="100"
                step="0.01"
                required
                value={competencyPercent}
                onChange={(event) => setCompetencyPercent(event.target.value)}
                disabled={isPending}
                placeholder="เช่น 30"
                className={`${inputClass} pr-10`}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                %
              </span>
            </div>
          </div>

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
                (!editingItem && !selectedSiteCode) ||
                competencyPercent === ""
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
                  : "บันทึกเปอร์เซ็นต์"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">
          รายการเปอร์เซ็นต์ Competency
        </h2>

        <DataTable
          headers={[
            "ประเภทบุคลากร",
            "เปอร์เซ็นต์ Competency",
            "สถานะ",
            "จัดการ",
          ]}
          emptyText="ยังไม่มีการกำหนดเปอร์เซ็นต์ Competency"
        >
          {sitePercents.map((item) => (
            <tr
              key={item.site_percent_id}
              data-search={`${item.staff_type_name} ${formatPercent(item.competency_percent)} ${item.active_status ? "เปิดใช้งาน" : "ปิดใช้งาน"}`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {item.staff_type_name}
              </td>
              <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                {formatPercent(item.competency_percent)}%
              </td>
              <td className="px-5 py-4 text-sm">
                <ActiveStatusBadge active={Boolean(item.active_status)} />
              </td>
              <td className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-lg bg-[#f8ac59] px-4 py-2 text-xs font-medium text-white hover:bg-[#f6a23c]"
                  >
                    แก้ไข
                  </button>

                  <form action={toggleAction}>
                    <input
                      type="hidden"
                      name="site_percent_id"
                      value={item.site_percent_id}
                    />
                    <input
                      type="hidden"
                      name="active_status"
                      value={item.active_status ? 0 : 1}
                    />
                    <button
                      type="submit"
                      className={
                        item.active_status
                          ? redActionButtonClass
                          : greenActionButtonClass
                      }
                    >
                      {item.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}