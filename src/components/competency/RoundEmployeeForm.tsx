"use client";

import { useMemo, useState } from "react";
import SearchableSelect from "@/components/competency/SearchableSelect";

type SelectOption = {
  value: string;
  label: string;
};

type ExistingEmployeeRule = {
  round_id: number;
  payroll_no: string;
};

type RoundEmployeeFormProps = {
  roundOptions: SelectOption[];
  employeeOptions: SelectOption[];
  divisionOptions: SelectOption[];
  existingEmployeeRules: ExistingEmployeeRule[];
  addRoundEmployeeAction: (formData: FormData) => void;
  importDivisionEmployeesAction: (formData: FormData) => void;
  importAllEmployeesAction: (formData: FormData) => void;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const disabledButtonClassName =
  "h-11 cursor-not-allowed rounded-lg bg-gray-300 px-5 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300";

const saveButtonClassName =
  "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600";

export default function RoundEmployeeForm({
  roundOptions,
  employeeOptions,
  divisionOptions,
  existingEmployeeRules,
  addRoundEmployeeAction,
  importDivisionEmployeesAction,
  importAllEmployeesAction,
}: RoundEmployeeFormProps) {
  const defaultRoundId = roundOptions[0]?.value || "";

  const [employeeRoundId, setEmployeeRoundId] = useState(defaultRoundId);
  const [divisionRoundId, setDivisionRoundId] = useState(defaultRoundId);
  const [allEmployeeRoundId, setAllEmployeeRoundId] = useState(defaultRoundId);

  const availableEmployeeOptions = useMemo(() => {
    if (!employeeRoundId) return [];

    const usedPayrollSet = new Set(
      existingEmployeeRules
        .filter((rule) => String(rule.round_id) === employeeRoundId)
        .map((rule) => String(rule.payroll_no)),
    );

    return employeeOptions.filter(
      (option) => !usedPayrollSet.has(option.value),
    );
  }, [employeeOptions, employeeRoundId, existingEmployeeRules]);

  const disableEmployeeSubmit =
    !employeeRoundId || availableEmployeeOptions.length === 0;
  const disableDivisionSubmit =
    !divisionRoundId || divisionOptions.length === 0;
  const disableAllEmployeeSubmit = !allEmployeeRoundId;

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          นำเข้าทั้งโรงพยาบาล
        </h2>

        <form
          action={importAllEmployeesAction}
          className="grid grid-cols-1 gap-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบประเมิน
            </label>
            <select
              name="round_id"
              required
              value={allEmployeeRoundId}
              onChange={(event) => setAllEmployeeRoundId(event.target.value)}
              className={selectClassName}
            >
              <option value="">เลือกรอบประเมิน</option>
              {roundOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={disableAllEmployeeSubmit}
              className={
                disableAllEmployeeSubmit
                  ? disabledButtonClassName
                  : saveButtonClassName
              }
            >
              นำเข้าทั้งโรงพยาบาล
            </button>
          </div>
        </form>

        <div className="mt-auto rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
          ระบบจะเพิ่มเฉพาะเจ้าหน้าที่ที่ข้อมูลพร้อมและยังไม่อยู่ในรอบที่เลือก
        </div>
      </div>

      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          นำเข้าตามกลุ่มภารกิจ
        </h2>

        <form
          action={importDivisionEmployeesAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบประเมิน
            </label>
            <select
              name="round_id"
              required
              value={divisionRoundId}
              onChange={(event) => setDivisionRoundId(event.target.value)}
              className={selectClassName}
            >
              <option value="">เลือกรอบประเมิน</option>
              {roundOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-8">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              กลุ่มภารกิจ
            </label>
            <SearchableSelect
              key={`division-${divisionRoundId}`}
              name="division_code"
              required
              placeholder={
                divisionRoundId
                  ? "เลือกกลุ่มภารกิจ"
                  : "กรุณาเลือกรอบประเมินก่อน"
              }
              options={divisionRoundId ? divisionOptions : []}
            />
          </div>

          <div className="flex justify-end lg:col-span-12">
            <button
              type="submit"
              disabled={disableDivisionSubmit}
              className={
                disableDivisionSubmit
                  ? disabledButtonClassName
                  : saveButtonClassName
              }
            >
              นำเข้าผู้ถูกประเมิน
            </button>
          </div>
        </form>

        <div className="mt-auto rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
          สามารถนำเข้าซ้ำได้ ระบบจะเพิ่มเฉพาะรายชื่อที่ยังไม่อยู่ในรอบ
        </div>
      </div>

      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          เพิ่มผู้ถูกประเมินรายคน
        </h2>

        <form
          action={addRoundEmployeeAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          <div className="lg:col-span-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบประเมิน
            </label>
            <select
              name="round_id"
              required
              value={employeeRoundId}
              onChange={(event) => setEmployeeRoundId(event.target.value)}
              className={selectClassName}
            >
              <option value="">เลือกรอบประเมิน</option>
              {roundOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-8">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ผู้ถูกประเมิน
            </label>
            <SearchableSelect
              key={`employee-${employeeRoundId}-${availableEmployeeOptions.length}`}
              name="payroll_no"
              required
              placeholder={
                employeeRoundId
                  ? "ค้นหาชื่อหรือรหัสเจ้าหน้าที่"
                  : "กรุณาเลือกรอบประเมินก่อน"
              }
              options={availableEmployeeOptions}
            />
          </div>

          {employeeRoundId && availableEmployeeOptions.length === 0 && (
            <div className="lg:col-span-12">
              <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
                รอบนี้ไม่มีเจ้าหน้าที่ให้เพิ่มแล้ว
              </p>
            </div>
          )}

          <div className="flex justify-end lg:col-span-12">
            <button
              type="submit"
              disabled={disableEmployeeSubmit}
              className={
                disableEmployeeSubmit
                  ? disabledButtonClassName
                  : saveButtonClassName
              }
            >
              เพิ่มผู้ถูกประเมิน
            </button>
          </div>
        </form>

        <div className="mt-auto pt-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            แสดงเฉพาะเจ้าหน้าที่ที่ยังปฏิบัติงานและไม่อยู่ในหน่วยที่ยกเว้นการประเมิน
          </div>
        </div>
      </div>
    </div>
  );
}