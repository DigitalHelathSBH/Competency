"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  name: string;
  options: SearchableSelectOption[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
  onValueChange?: (value: string) => void;
};

export default function SearchableSelect({
  name,
  options,
  placeholder = "เลือกข้อมูล",
  required = false,
  defaultValue = "",
  className = "",
  onValueChange,
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [searchText, setSearchText] = useState("");

  const selectedOption = options.find((option) => option.value === selectedValue);

  const filteredOptions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return options;

    return options.filter((option) => {
      return (
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword)
      );
    });
  }, [options, searchText]);

  useEffect(() => {
    setSelectedValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;

      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function handleSelect(option: SearchableSelectOption) {
    setSelectedValue(option.value);
    setSearchText("");
    setOpen(false);
    onValueChange?.(option.value);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input name={name} type="hidden" value={selectedValue} required={required} />

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-left text-sm text-gray-800 hover:border-brand-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      >
        <span className={selectedOption ? "" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <span className="ml-2 text-gray-400">⌄</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
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
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">ไม่พบข้อมูล</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    option.value === selectedValue
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
