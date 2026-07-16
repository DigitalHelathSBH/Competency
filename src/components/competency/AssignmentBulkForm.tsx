"use client";

import { useMemo, useState } from "react";
import SearchableSelect from "@/components/competency/SearchableSelect";

type SelectOption = {
  value: string;
  label: string;
};

type RoundEmployeeOption = {
  round_employee_id: number;
  round_id: number;
  payroll_no: string;
  employee_label: string;
  rank_order: number;
  division_code: string;
  section_code: string;
  section_label: string;
};

type EvaluatorOption = {
  payroll_no: string;
  evaluator_label: string;
  rank_order: number;
};

type ExistingAssignmentRule = {
  assignment_id: number;
  round_employee_id: number;
  evaluator_payroll_no: string;
  evaluator_level: number;
};

type AssignmentBulkFormProps = {
  roundOptions: SelectOption[];
  divisionOptions: SelectOption[];
  roundEmployeeOptions: RoundEmployeeOption[];
  evaluatorOptions: EvaluatorOption[];
  existingAssignmentRules: ExistingAssignmentRule[];
  bulkAssignDivisionAction: (formData: FormData) => void | Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const disabledButtonClassName =
  "h-11 cursor-not-allowed rounded-lg bg-gray-300 px-5 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300";

const saveButtonClassName =
  "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600";

export default function AssignmentBulkForm({
  roundOptions,
  divisionOptions,
  roundEmployeeOptions,
  evaluatorOptions,
  existingAssignmentRules,
  bulkAssignDivisionAction,
}: AssignmentBulkFormProps) {
  const defaultRoundId = roundOptions[0]?.value || "";

  const [roundId, setRoundId] = useState(defaultRoundId);
  const [divisionCode, setDivisionCode] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [evaluatorLevel, setEvaluatorLevel] = useState("1");
  const [evaluatorPayrollNo, setEvaluatorPayrollNo] = useState("");

  const usedLevelSet = useMemo(() => {
    return new Set(
      existingAssignmentRules
        .filter((rule) => String(rule.evaluator_level) === evaluatorLevel)
        .map((rule) => String(rule.round_employee_id)),
    );
  }, [evaluatorLevel, existingAssignmentRules]);

  const availableEmployees = useMemo(() => {
    if (!roundId || !evaluatorLevel) return [];

    return roundEmployeeOptions
      .filter((employee) => String(employee.round_id) === roundId)
      .filter(
        (employee) =>
          !usedLevelSet.has(String(employee.round_employee_id)),
      );
  }, [evaluatorLevel, roundEmployeeOptions, roundId, usedLevelSet]);

  const availableDivisionOptions = useMemo(() => {
    const availableDivisionCodeSet = new Set(
      availableEmployees
        .map((employee) => employee.division_code)
        .filter(Boolean),
    );

    return divisionOptions.filter((option) =>
      availableDivisionCodeSet.has(option.value),
    );
  }, [availableEmployees, divisionOptions]);

  const availableSectionOptions = useMemo(() => {
    if (!divisionCode) return [];

    const sectionMap = new Map<string, SelectOption>();

    for (const employee of availableEmployees) {
      if (employee.division_code !== divisionCode) continue;

      const code = String(employee.section_code || "").trim();
      if (!code) continue;

      sectionMap.set(code, {
        value: code,
        label: `${employee.section_label || code} (${code})`,
      });
    }

    return [
      { value: "", label: "ทุกหน่วยงานในกลุ่มงาน" },
      ...Array.from(sectionMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label, "th"),
      ),
    ];
  }, [availableEmployees, divisionCode]);

  const baseTargetEmployees = useMemo(() => {
    if (!roundId || !divisionCode || !evaluatorLevel) return [];

    return availableEmployees
      .filter((employee) => employee.division_code === divisionCode)
      .filter(
        (employee) =>
          !sectionCode || employee.section_code === sectionCode,
      );
  }, [
    availableEmployees,
    divisionCode,
    evaluatorLevel,
    roundId,
    sectionCode,
  ]);

  const targetEmployees = useMemo(() => {
    if (!evaluatorPayrollNo) return baseTargetEmployees;

    const sameEvaluatorEmployeeSet = new Set(
      existingAssignmentRules
        .filter(
          (rule) =>
            rule.evaluator_payroll_no === evaluatorPayrollNo,
        )
        .map((rule) => String(rule.round_employee_id)),
    );

    return baseTargetEmployees
      .filter(
        (employee) =>
          employee.payroll_no !== evaluatorPayrollNo,
      )
      .filter(
        (employee) =>
          !sameEvaluatorEmployeeSet.has(
            String(employee.round_employee_id),
          ),
      );
  }, [
    baseTargetEmployees,
    evaluatorPayrollNo,
    existingAssignmentRules,
  ]);

  const availableEvaluatorOptions = useMemo(() => {
    if (
      !roundId ||
      !divisionCode ||
      baseTargetEmployees.length === 0
    ) {
      return [];
    }

    return evaluatorOptions.map((option) => ({
      value: option.payroll_no,
      label: option.evaluator_label,
    }));
  }, [
    baseTargetEmployees.length,
    divisionCode,
    evaluatorOptions,
    roundId,
  ]);

  const evaluatorOptionExists = availableEvaluatorOptions.some(
    (option) => option.value === evaluatorPayrollNo,
  );

  const disableSubmit =
    !roundId ||
    !divisionCode ||
    !evaluatorLevel ||
    targetEmployees.length === 0 ||
    !evaluatorPayrollNo ||
    !evaluatorOptionExists;

  function handleRoundChange(value: string) {
    setRoundId(value);
    setDivisionCode("");
    setSectionCode("");
    setEvaluatorPayrollNo("");
  }

  function handleDivisionChange(value: string) {
    setDivisionCode(value);
    setSectionCode("");
    setEvaluatorPayrollNo("");
  }

  function handleSectionChange(value: string) {
    setSectionCode(value);
    setEvaluatorPayrollNo("");
  }

  function handleLevelChange(value: string) {
    setEvaluatorLevel(value);
    setDivisionCode("");
    setSectionCode("");
    setEvaluatorPayrollNo("");
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
        กำหนดผู้ประเมินแบบกลุ่ม
      </h2>

      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        เลือกรอบ กลุ่มงาน ระดับผู้ประเมิน และผู้ประเมิน
        หากไม่เลือกหน่วยงาน ระบบจะมอบหมายให้ทั้งกลุ่มงาน
        แต่ถ้าเลือกหน่วยงาน ระบบจะมอบหมายเฉพาะหน่วยงานนั้น
      </p>

      <form
        action={bulkAssignDivisionAction}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            รอบประเมิน
          </label>
          <select
            name="round_id"
            required
            value={roundId}
            onChange={(event) =>
              handleRoundChange(event.target.value)
            }
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

        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ระดับผู้ประเมิน
          </label>
          <select
            name="evaluator_level"
            required
            value={evaluatorLevel}
            onChange={(event) =>
              handleLevelChange(event.target.value)
            }
            className={selectClassName}
          >
            <option value="1">หัวหน้าใกล้ชิด</option>
            <option value="2">หัวหน้าใหญ่</option>
          </select>
        </div>

        <div className="lg:col-span-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            กลุ่มงาน
          </label>
          <SearchableSelect
            key={`bulk-division-${roundId}-${evaluatorLevel}-${divisionCode}-${availableDivisionOptions.length}`}
            name="division_code"
            required
            defaultValue={divisionCode}
            placeholder="เลือกกลุ่มงาน"
            options={availableDivisionOptions}
            onValueChange={handleDivisionChange}
          />
        </div>

        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            หน่วยงาน
          </label>
          <SearchableSelect
            key={`bulk-section-${roundId}-${divisionCode}-${evaluatorLevel}-${sectionCode}-${availableSectionOptions.length}`}
            name="section_code"
            defaultValue={sectionCode}
            placeholder={
              divisionCode
                ? "ทุกหน่วยงาน"
                : "เลือกกลุ่มงานก่อน"
            }
            options={availableSectionOptions}
            onValueChange={handleSectionChange}
          />
        </div>

        <div className="lg:col-span-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ผู้ประเมิน
          </label>
          <SearchableSelect
            key={`bulk-evaluator-${roundId}-${divisionCode}-${sectionCode}-${evaluatorLevel}-${availableEvaluatorOptions.length}`}
            name="evaluator_payroll_no"
            required
            defaultValue={evaluatorPayrollNo}
            placeholder={
              divisionCode
                ? "ค้นหาผู้ประเมิน"
                : "กรุณาเลือกกลุ่มงานก่อน"
            }
            options={availableEvaluatorOptions}
            onValueChange={(value) =>
              setEvaluatorPayrollNo(value)
            }
          />
        </div>

        {roundId && availableDivisionOptions.length === 0 && (
          <div className="lg:col-span-12">
            <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
              ไม่มีกลุ่มงานที่ต้องกำหนดผู้ประเมินระดับนี้แล้ว
              หรือถูกกำหนดครบแล้ว
            </p>
          </div>
        )}

        {roundId &&
          divisionCode &&
          baseTargetEmployees.length === 0 && (
            <div className="lg:col-span-12">
              <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
                {sectionCode
                  ? "หน่วยงานนี้ไม่มีผู้ถูกประเมินที่ต้องกำหนดผู้ประเมินระดับนี้แล้ว"
                  : "กลุ่มงานนี้ไม่มีผู้ถูกประเมินที่ต้องกำหนดผู้ประเมินระดับนี้แล้ว"}
              </p>
            </div>
          )}

        {evaluatorPayrollNo &&
          baseTargetEmployees.length > 0 &&
          targetEmployees.length === 0 && (
            <div className="lg:col-span-12">
              <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
                ผู้ประเมินคนนี้ไม่สามารถถูกมอบหมายให้รายการที่เลือกได้
                เนื่องจากเป็นผู้ถูกประเมินเอง
                หรือถูกกำหนดให้ผู้ถูกประเมินเหล่านี้ในอีกระดับแล้ว
              </p>
            </div>
          )}

        {targetEmployees.length > 0 && (
          <div className="lg:col-span-12">
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
              จะมอบหมายให้ผู้ถูกประเมินที่ยังไม่มีผู้ประเมินระดับนี้ จำนวน{" "}
              {targetEmployees.length.toLocaleString()} คน
              {sectionCode
                ? " เฉพาะหน่วยงานที่เลือก"
                : " ทั้งกลุ่มงาน"}
              โดยระบบอนุญาตให้ผู้ประเมินอยู่กลุ่มระดับใดก็ได้
              และจะข้ามเฉพาะตัวผู้ประเมินเองหรือรายการที่ถูกกำหนดซ้ำ
            </p>
          </div>
        )}

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
            กำหนดผู้ประเมินแบบกลุ่ม
          </button>
        </div>
      </form>
    </div>
  );
}