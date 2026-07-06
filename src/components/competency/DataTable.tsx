"use client";

import React, { useEffect, useMemo, useState } from "react";

type DataTableFilterOption = {
  value: string;
  label: string;
};

type DataTableFilter = {
  key: string;
  label: string;
  options: DataTableFilterOption[];
  defaultValue?: string;
};

type DataTableProps = {
  headers: string[];
  children: React.ReactNode;
  searchPlaceholder?: string;
  emptyText?: string;
  initialPageSize?: number;
  initialSearch?: string;
  filters?: DataTableFilter[];
};

function getTextFromNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join(" ");
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getTextFromNode(node.props.children);
  }

  return "";
}

function getRowSearchText(row: React.ReactNode): string {
  if (!React.isValidElement(row)) {
    return "";
  }

  const props = row.props as {
    children?: React.ReactNode;
    "data-search"?: string;
  };

  return props["data-search"] || getTextFromNode(props.children);
}

function getRowFilterValue(row: React.ReactNode, filterKey: string): string {
  if (!React.isValidElement(row)) {
    return "";
  }

  const props = row.props as Record<string, unknown>;
  const value = props[`data-filter-${filterKey}`];

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function SearchableTableFilter({
  filter,
  value,
  onChange,
}: {
  filter: DataTableFilter;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const selectedOption = filter.options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return filter.options;

    return filter.options.filter((option) => {
      return (
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword)
      );
    });
  }, [filter.options, searchText]);

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setSearchText("");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-left text-sm text-gray-800 outline-none hover:border-brand-400 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : `${filter.label}: ทั้งหมด`}
        </span>
        <span className="ml-2 text-gray-400">⌄</span>
      </button>

      {open && (
        <div className="absolute z-[9999] mt-1 w-max min-w-full max-w-[560px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 p-2 dark:border-gray-800">
            <input
              autoFocus
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ค้นหา..."
              className="h-10 w-full rounded-md border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`block w-full whitespace-normal break-words px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                value === ""
                  ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              ทั้งหมด
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">ไม่พบข้อมูล</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    option.value === value
                      ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataTable({
  headers,
  children,
  searchPlaceholder = "ค้นหา...",
  emptyText = "ไม่พบข้อมูล",
  initialPageSize = 10,
  initialSearch = "",
  filters = [],
}: DataTableProps) {
  const initialFilterValues = filters.reduce<Record<string, string>>(
    (result, filter) => {
      result[filter.key] = filter.defaultValue ?? "";
      return result;
    },
    {}
  );

  const [searchText, setSearchText] = useState(initialSearch);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValues, setFilterValues] =
    useState<Record<string, string>>(initialFilterValues);

  const allRows = useMemo(() => {
    return React.Children.toArray(children).filter((child) =>
      React.isValidElement(child)
    );
  }, [children]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return allRows.filter((row) => {
      const searchMatched =
        !keyword || getRowSearchText(row).toLowerCase().includes(keyword);

      if (!searchMatched) {
        return false;
      }

      const filtersMatched = filters.every((filter) => {
        const selectedValue = filterValues[filter.key] || "";

        if (!selectedValue) {
          return true;
        }

        return getRowFilterValue(row, filter.key) === selectedValue;
      });

      return filtersMatched;
    });
  }, [allRows, searchText, filters, filterValues]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = filteredRows.slice(startIndex, endIndex);

  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalRows);

  useEffect(() => {
    setSearchText(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, pageSize, children, filterValues]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function updateFilterValue(key: string, value: string) {
    setFilterValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:flex-1">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />

          {filters.map((filter) => (
            <SearchableTableFilter
              key={filter.key}
              filter={filter}
              value={filterValues[filter.key] || ""}
              onChange={(value) => updateFilterValue(filter.key, value)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>รายการต่อหน้า</span>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <th className="w-20 px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                ลำดับ
              </th>

              {headers.map((header) => (
                <th
                  key={header}
                  className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 1}
                  className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => {
                if (!React.isValidElement<{ children?: React.ReactNode }>(row)) {
                  return null;
                }

                const originalChildren = row.props.children;
                const sequenceNo = startIndex + index + 1;

                return React.cloneElement(
                  row,
                  {
                    key: row.key ?? sequenceNo,
                  },
                  <>
                    <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {sequenceNo}
                    </td>
                    {originalChildren}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          แสดง {startItem} ถึง {endItem} จากทั้งหมด {totalRows} รายการ
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
          >
            ก่อนหน้า
          </button>

          <span className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white">
            {safeCurrentPage}
          </span>

          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </div>
  );
}