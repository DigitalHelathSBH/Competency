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

export type GovernmentRankOption = {
  rank_code: string;
  rank_name: string;
};

export type RankGroupOption = {
  rank_group_id: number;
  rank_group_name: string;
};

export type GovernmentRankMapItem = {
  rank_group_map_id: number;
  rank_code: string;
  rank_name: string;
  rank_group_id: number;
  rank_group_name: string;
  active_status: boolean;
};

type GovernmentRankMapFormTableProps = {
  governmentRanks: GovernmentRankOption[];
  rankGroups: RankGroupOption[];
  rankGroupMaps: GovernmentRankMapItem[];
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
  searchPlaceholder = "พิมพ์เพื่อค้นหา...",
  required = false,
  disabled = false,
  onChange,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const keyword = searchText.trim().toLocaleLowerCase("th-TH");

    if (!keyword) {
      return options;
    }

    return options.filter((option) =>
      `${option.label} ${option.value}`
        .toLocaleLowerCase("th-TH")
        .includes(keyword),
    );
  }, [options, searchText]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchText("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchText("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function openDropdown() {
    if (disabled) {
      return;
    }

    setIsOpen((current) => !current);
    setSearchText("");

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setIsOpen(false);
    setSearchText("");
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`${inputClass} flex items-center justify-between gap-3 text-left`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            selectedOption
              ? "text-gray-800 dark:text-white/90"
              : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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

export default function GovernmentRankMapFormTable({
  governmentRanks,
  rankGroups,
  rankGroupMaps,
  createAction,
  updateAction,
  toggleAction,
}: GovernmentRankMapFormTableProps) {
  const [editingMap, setEditingMap] =
    useState<GovernmentRankMapItem | null>(null);
  const [selectedRankCode, setSelectedRankCode] = useState("");
  const [selectedRankGroupId, setSelectedRankGroupId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formSectionRef = useRef<HTMLDivElement>(null);

  const selectableRanks = useMemo(() => {
    if (editingMap) {
      return governmentRanks;
    }

    const mappedRankCodes = new Set(
      rankGroupMaps.map((item) => item.rank_code.trim()),
    );

    return governmentRanks.filter(
      (rank) => !mappedRankCodes.has(rank.rank_code.trim()),
    );
  }, [editingMap, governmentRanks, rankGroupMaps]);

  const rankSelectOptions = useMemo(
    () =>
      selectableRanks.map((rank) => ({
        value: rank.rank_code,
        label: `${rank.rank_name} [ ${rank.rank_code} ]`,
      })),
    [selectableRanks],
  );

  const rankGroupSelectOptions = useMemo(
    () =>
      rankGroups.map((group) => ({
        value: String(group.rank_group_id),
        label: group.rank_group_name,
      })),
    [rankGroups],
  );

  function resetForm() {
    setEditingMap(null);
    setSelectedRankCode("");
    setSelectedRankGroupId("");
    setErrorMessage("");
  }

  function handleEdit(item: GovernmentRankMapItem) {
    setErrorMessage("");
    setEditingMap(item);
    setSelectedRankCode(item.rank_code);
    setSelectedRankGroupId(String(item.rank_group_id));

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
    const action = editingMap ? updateAction : createAction;

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
            {editingMap
              ? "แก้ไขระดับข้าราชการ"
              : "เพิ่มระดับข้าราชการ"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            แสดงเฉพาะระดับข้าราชการที่ยังปฏิบัติงานอยู่
          </p>
          {editingMap ? (
            <p className="mt-1 text-sm font-medium text-[#f8ac59]">
              กำลังแก้ไข: {editingMap.rank_name} [ {editingMap.rank_code} ]
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-[#ed5565]/30 bg-[#ed5565]/10 px-4 py-3 text-sm text-[#ed5565]">
            {errorMessage}
          </div>
        ) : null}

        <form
          key={editingMap?.rank_group_map_id ?? "create"}
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 md:grid-cols-12"
        >
          {editingMap ? (
            <input
              type="hidden"
              name="rank_group_map_id"
              value={editingMap.rank_group_map_id}
            />
          ) : null}

          <div className="md:col-span-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ระดับข้าราชการ
            </label>
            <SearchableDropdown
              name="rank_code"
              required
              value={selectedRankCode}
              onChange={setSelectedRankCode}
              placeholder="เลือกระดับข้าราชการ"
              searchPlaceholder="ค้นหาชื่อหรือรหัสระดับ..."
              options={rankSelectOptions}
              disabled={isPending}
            />
          </div>

          <div className="md:col-span-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              กลุ่มระดับการถูกประเมิน
            </label>
            <SearchableDropdown
              name="rank_group_id"
              required
              value={selectedRankGroupId}
              onChange={setSelectedRankGroupId}
              placeholder="เลือกกลุ่มระดับ"
              searchPlaceholder="ค้นหากลุ่มระดับ..."
              options={rankGroupSelectOptions}
              disabled={isPending}
            />
          </div>

          {!editingMap && selectableRanks.length === 0 ? (
            <div className="md:col-span-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
              RANK ของข้าราชการที่พบถูกกำหนดกลุ่มระดับครบแล้ว
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 md:col-span-12">
            {editingMap ? (
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
                !selectedRankCode ||
                !selectedRankGroupId ||
                (!editingMap && selectableRanks.length === 0)
              }
              className={
                editingMap
                  ? "h-11 rounded-lg bg-[#f8ac59] px-5 text-sm font-medium text-white hover:bg-[#f6a23c] disabled:cursor-not-allowed disabled:opacity-60"
                  : "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              {isPending
                ? "กำลังบันทึก..."
                : editingMap
                  ? "บันทึกการแก้ไข"
                  : "บันทึกระดับข้าราชการ"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">
          รายการระดับข้าราชการ
        </h2>

        <DataTable
          headers={[
            "ระดับข้าราชการ",
            "กลุ่มระดับการถูกประเมิน",
            "สถานะ",
            "จัดการ",
          ]}
          emptyText="ยังไม่มีการกำหนดระดับข้าราชการ"
        >
          {rankGroupMaps.map((item) => (
            <tr
              key={item.rank_group_map_id}
              data-search={`${item.rank_code} ${item.rank_name} ${item.rank_group_name} ${item.active_status ? "เปิดใช้งาน" : "ปิดใช้งาน"}`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {item.rank_name} [ {item.rank_code} ]
              </td>
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {item.rank_group_name}
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
                      name="rank_group_map_id"
                      value={item.rank_group_map_id}
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