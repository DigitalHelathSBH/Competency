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

type EditAssignment = {
  assignment_id: number;
  round_id: number;
  round_employee_id: number;
  evaluator_payroll_no: string;
  evaluator_level: number;
} | null;

type PrefillAssignment = {
  round_id: number;
  round_employee_id: number;
  evaluator_level: number;
} | null;

type AssignmentFormProps = {
  roundOptions: SelectOption[];
  roundEmployeeOptions: RoundEmployeeOption[];
  evaluatorOptions: EvaluatorOption[];
  existingAssignmentRules: ExistingAssignmentRule[];
  editAssignment?: EditAssignment;
  prefillAssignment?: PrefillAssignment;
  saveAssignmentAction: (formData: FormData) => void | Promise<void>;
  updateAssignmentAction: (formData: FormData) => void | Promise<void>;
  clearPrefillAction?: (formData: FormData) => void | Promise<void>;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const disabledButtonClassName =
  "h-11 cursor-not-allowed rounded-lg bg-gray-300 px-5 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300";

const saveButtonClassName =
  "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600";

const cancelButtonClassName =
  "inline-flex h-11 items-center justify-center rounded-lg border border-[#ed5565] bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]";

export default function AssignmentForm({
  roundOptions,
  roundEmployeeOptions,
  evaluatorOptions,
  existingAssignmentRules,
  editAssignment = null,
  prefillAssignment = null,
  saveAssignmentAction,
  updateAssignmentAction,
  clearPrefillAction,
}: AssignmentFormProps) {
  const isEditMode = Boolean(editAssignment);
  const isPrefillMode = !isEditMode && Boolean(prefillAssignment);
  const lockContext = isEditMode || isPrefillMode;

  const defaultRoundId = roundOptions[0]?.value || "";

  const [roundId, setRoundId] = useState(
    editAssignment
      ? String(editAssignment.round_id)
      : prefillAssignment
        ? String(prefillAssignment.round_id)
        : defaultRoundId,
  );
  const [evaluatorLevel, setEvaluatorLevel] = useState(
    editAssignment
      ? String(editAssignment.evaluator_level)
      : prefillAssignment
        ? String(prefillAssignment.evaluator_level)
        : "1",
  );
  const [roundEmployeeId, setRoundEmployeeId] = useState(
    editAssignment
      ? String(editAssignment.round_employee_id)
      : prefillAssignment
        ? String(prefillAssignment.round_employee_id)
        : "",
  );
  const [evaluatorPayrollNo, setEvaluatorPayrollNo] = useState(
    editAssignment ? editAssignment.evaluator_payroll_no : "",
  );

  const currentAssignmentId = editAssignment?.assignment_id || 0;

  const selectedRoundLabel =
    roundOptions.find((option) => option.value === roundId)?.label || "-";

  const selectedEvaluatorLevelLabel =
    evaluatorLevel === "1" ? "หัวหน้าใกล้ชิด" : "หัวหน้าใหญ่";

  const availableRoundEmployeeOptions = useMemo(() => {
    if (!roundId || !evaluatorLevel) return [];

    const usedRoundEmployeeSet = new Set(
      existingAssignmentRules
        .filter((rule) => Number(rule.assignment_id) !== Number(currentAssignmentId))
        .filter((rule) => String(rule.evaluator_level) === evaluatorLevel)
        .map((rule) => String(rule.round_employee_id)),
    );

    return roundEmployeeOptions
      .filter((option) => String(option.round_id) === roundId)
      .filter((option) => !usedRoundEmployeeSet.has(String(option.round_employee_id)))
      .map((option) => ({
        value: String(option.round_employee_id),
        label: option.employee_label,
      }));
  }, [
    currentAssignmentId,
    evaluatorLevel,
    existingAssignmentRules,
    roundEmployeeOptions,
    roundId,
  ]);

  const selectedRoundEmployee = useMemo(() => {
    return roundEmployeeOptions.find(
      (option) => String(option.round_employee_id) === roundEmployeeId,
    );
  }, [roundEmployeeId, roundEmployeeOptions]);

  const selectedRoundEmployeeLabel = selectedRoundEmployee?.employee_label || "-";

  const availableEvaluatorOptions = useMemo(() => {
    if (!selectedRoundEmployee) return [];

    const usedEvaluatorSet = new Set(
      existingAssignmentRules
        .filter((rule) => Number(rule.assignment_id) !== Number(currentAssignmentId))
        .filter(
          (rule) =>
            String(rule.round_employee_id) === String(selectedRoundEmployee.round_employee_id),
        )
        .map((rule) => String(rule.evaluator_payroll_no)),
    );

    return evaluatorOptions
      .filter((option) => option.payroll_no !== selectedRoundEmployee.payroll_no)
      .filter((option) => option.rank_order >= selectedRoundEmployee.rank_order)
      .filter((option) => !usedEvaluatorSet.has(option.payroll_no))
      .map((option) => ({
        value: option.payroll_no,
        label: option.evaluator_label,
      }));
  }, [
    currentAssignmentId,
    evaluatorOptions,
    existingAssignmentRules,
    selectedRoundEmployee,
  ]);

  const evaluatorOptionExists = availableEvaluatorOptions.some(
    (option) => option.value === evaluatorPayrollNo,
  );

  const disableSubmit =
    !roundId ||
    !evaluatorLevel ||
    !roundEmployeeId ||
    !selectedRoundEmployee ||
    !evaluatorPayrollNo ||
    !evaluatorOptionExists;

  function handleRoundChange(value: string) {
    setRoundId(value);

    if (!lockContext) {
      setRoundEmployeeId("");
      setEvaluatorPayrollNo("");
    }
  }

  function handleLevelChange(value: string) {
    setEvaluatorLevel(value);

    if (!lockContext) {
      setRoundEmployeeId("");
      setEvaluatorPayrollNo("");
    }
  }

  function handleRoundEmployeeChange(value: string) {
    setRoundEmployeeId(value);
    setEvaluatorPayrollNo("");
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
        {isEditMode ? "แก้ไขผู้ประเมิน" : isPrefillMode ? "เพิ่มผู้ประเมินจากรายการที่ต้องแก้ไข" : "เพิ่มผู้ประเมิน"}
      </h2>

      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        เลือกรอบ ผู้ถูกประเมิน และระดับผู้ประเมิน ระบบจะแสดงเฉพาะผู้ประเมินที่มีระดับเท่ากันหรือสูงกว่าผู้ถูกประเมิน
      </p>

      {isEditMode && (
        <div className="mb-4 rounded-lg border border-[#f8ac59]/30 bg-[#f8ac59]/10 px-3 py-2 text-xs leading-5 text-[#9a5b10] dark:text-[#f8ac59]">
          กำลังแก้ไขรายการผู้ประเมินเดิม หากไม่ต้องการแก้ไขให้กด “ยกเลิกแก้ไข”
        </div>
      )}

      {isPrefillMode && (
        <div className="mb-4 rounded-lg border border-[#23c6c8]/30 bg-[#23c6c8]/10 px-3 py-2 text-xs leading-5 text-[#167d80] dark:text-[#23c6c8]">
          เปิดจากรายการที่ต้องแก้ไข ระบบล็อกข้อมูลรอบ ผู้ถูกประเมิน และระดับผู้ประเมินไว้แล้ว กรุณาเลือกเฉพาะผู้ประเมินแล้วกดบันทึก
        </div>
      )}

      <form
        action={isEditMode ? updateAssignmentAction : saveAssignmentAction}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        {isEditMode && (
          <input type="hidden" name="assignment_id" value={currentAssignmentId} />
        )}

        <div className="lg:col-span-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            รอบประเมิน
          </label>

          {lockContext ? (
            <>
              <input type="hidden" name="round_id" value={roundId} />
              <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {selectedRoundLabel}
              </div>
            </>
          ) : (
            <select
              name="round_id"
              required
              value={roundId}
              onChange={(event) => handleRoundChange(event.target.value)}
              className={selectClassName}
            >
              <option value="">เลือกรอบประเมิน</option>
              {roundOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="lg:col-span-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ระดับผู้ประเมิน
          </label>

          {lockContext ? (
            <>
              <input type="hidden" name="evaluator_level" value={evaluatorLevel} />
              <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {selectedEvaluatorLevelLabel}
              </div>
            </>
          ) : (
            <select
              name="evaluator_level"
              required
              value={evaluatorLevel}
              onChange={(event) => handleLevelChange(event.target.value)}
              className={selectClassName}
            >
              <option value="1">หัวหน้าใกล้ชิด</option>
              <option value="2">หัวหน้าใหญ่</option>
            </select>
          )}
        </div>

        <div className="lg:col-span-6">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ผู้ถูกประเมิน
          </label>

          {lockContext ? (
            <>
              <input type="hidden" name="round_employee_id" value={roundEmployeeId} />
              <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {selectedRoundEmployeeLabel}
              </div>
            </>
          ) : (
            <SearchableSelect
              key={`employee-${roundId}-${evaluatorLevel}-${roundEmployeeId}-${availableRoundEmployeeOptions.length}`}
              name="round_employee_id"
              required
              defaultValue={roundEmployeeId}
              placeholder={roundId ? "ค้นหาผู้ถูกประเมิน" : "กรุณาเลือกรอบประเมินก่อน"}
              options={availableRoundEmployeeOptions}
              onValueChange={handleRoundEmployeeChange}
            />
          )}
        </div>

        {!lockContext && roundId && availableRoundEmployeeOptions.length === 0 && (
          <div className="lg:col-span-12">
            <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
              รอบและระดับผู้ประเมินนี้ไม่มีผู้ถูกประเมินให้เพิ่มแล้ว หรือถูกกำหนดผู้ประเมินครบแล้ว
            </p>
          </div>
        )}

        <div className="lg:col-span-12">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ผู้ประเมิน
          </label>
          <SearchableSelect
            key={`evaluator-${roundEmployeeId}-${evaluatorPayrollNo}-${availableEvaluatorOptions.length}`}
            name="evaluator_payroll_no"
            required
            defaultValue={evaluatorPayrollNo}
            placeholder={roundEmployeeId ? "ค้นหาผู้ประเมิน" : "กรุณาเลือกผู้ถูกประเมินก่อน"}
            options={availableEvaluatorOptions}
            onValueChange={(value) => setEvaluatorPayrollNo(value)}
          />
        </div>

        {roundEmployeeId && availableEvaluatorOptions.length === 0 && (
          <div className="lg:col-span-12">
            <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
              ไม่พบผู้ประเมินที่มีระดับเท่ากันหรือสูงกว่าผู้ถูกประเมิน หรือผู้ประเมินที่เข้าเงื่อนไขถูกใช้แล้ว
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 lg:col-span-12">
          {isEditMode && clearPrefillAction && (
            <button
              type="submit"
              formAction={clearPrefillAction}
              formNoValidate
              className={cancelButtonClassName}
            >
              ยกเลิกแก้ไข
            </button>
          )}

          {isPrefillMode && clearPrefillAction && (
            <button
              type="submit"
              formAction={clearPrefillAction}
              formNoValidate
              className={cancelButtonClassName}
            >
              ยกเลิก
            </button>
          )}

          <button
            type="submit"
            disabled={disableSubmit}
            className={disableSubmit ? disabledButtonClassName : saveButtonClassName}
          >
            {isEditMode ? "บันทึกการแก้ไข" : "บันทึกผู้ประเมิน"}
          </button>
        </div>
      </form>

      <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
        หน้านี้แก้ไขได้เฉพาะรอบสถานะร่าง และผู้ประเมินต้องมี sort_order ของกลุ่มระดับเท่ากันหรือสูงกว่าผู้ถูกประเมิน
      </p>
    </div>
  );
}
