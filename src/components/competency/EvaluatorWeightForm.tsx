"use client";

import { FormEvent, useRef, useState } from "react";
import SearchableSelect from "@/components/competency/SearchableSelect";

type SelectOption = {
  value: string;
  label: string;
};

type ExistingWeightRule = {
  round_id: number;
  scope_value: string;
};

type ConfirmDetail = {
  roundLabel: string;
  scopeLabel: string;
  level1Weight: string;
  level2Weight: string;
};

type EvaluatorWeightFormProps = {
  roundOptions: SelectOption[];
  scopeOptions: SelectOption[];
  existingWeightRules: ExistingWeightRule[];
  saveWeightSetAction: (formData: FormData) => void;
};

function getOptionLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label || value;
}

function normalizeScopeValue(value: FormDataEntryValue | string | null) {
  const scopeValue = String(value || "").trim();
  return scopeValue || "__DEFAULT__";
}

export default function EvaluatorWeightForm({
  roundOptions,
  scopeOptions,
  existingWeightRules,
  saveWeightSetAction,
}: EvaluatorWeightFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const allowSubmitRef = useRef(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDetail, setConfirmDetail] = useState<ConfirmDetail | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowSubmitRef.current) {
      allowSubmitRef.current = false;
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const roundId = Number(formData.get("round_id") || 0);
    const scopeValue = normalizeScopeValue(formData.get("scope_value"));

    const matched = existingWeightRules.find((rule) => {
      return (
        Number(rule.round_id) === roundId &&
        normalizeScopeValue(rule.scope_value) === scopeValue
      );
    });

    if (!matched) {
      return;
    }

    event.preventDefault();

    setConfirmDetail({
      roundLabel: getOptionLabel(roundOptions, String(roundId)),
      scopeLabel: getOptionLabel(scopeOptions, scopeValue),
      level1Weight: String(formData.get("level_1_weight") || "0"),
      level2Weight: String(formData.get("level_2_weight") || "0"),
    });

    setConfirmOpen(true);
  }

  function confirmOverwrite() {
    const form = formRef.current;
    if (!form) return;

    const confirmInput = form.querySelector<HTMLInputElement>(
      'input[name="overwrite_confirmed"]',
    );

    if (confirmInput) {
      confirmInput.value = "1";
    }

    setConfirmOpen(false);
    allowSubmitRef.current = true;
    form.requestSubmit();
  }

  return (
    <>
      <form
        ref={formRef}
        action={saveWeightSetAction}
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 lg:grid-cols-6"
      >
        <input type="hidden" name="overwrite_confirmed" value="0" />

        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            รอบประเมิน
          </label>
          <SearchableSelect
            name="round_id"
            required
            defaultValue={roundOptions[0]?.value || ""}
            placeholder="เลือกรอบประเมิน"
            options={roundOptions}
          />
        </div>

        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            ขอบเขตการใช้น้ำหนัก
          </label>
          <SearchableSelect
            name="scope_value"
            required
            defaultValue="__DEFAULT__"
            placeholder="เลือกค่า default หรือกลุ่มภารกิจ"
            options={scopeOptions}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            หัวหน้าใกล้ชิด (%)
          </label>
          <input
            name="level_1_weight"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            defaultValue="70"
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            หัวหน้าใหญ่ (%)
          </label>
          <input
            name="level_2_weight"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            defaultValue="30"
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="flex justify-end lg:col-span-6">
            <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
            >
                บันทึกน้ำหนัก
            </button>
        </div>
      </form>

      {confirmOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-2xl font-bold text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300">
                !
              </div>

              <h3 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                ยืนยันการบันทึกทับ
              </h3>

              <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-300">
                รอบและขอบเขตนี้มีน้ำหนักผู้ประเมินอยู่แล้ว
                <br />
                {confirmDetail && (
                  <>
                    <span className="font-semibold text-gray-800 dark:text-white/90">
                      {confirmDetail.roundLabel}
                    </span>
                    <br />
                    <span className="font-semibold text-gray-800 dark:text-white/90">
                      {confirmDetail.scopeLabel}
                    </span>
                    <br />
                    ต้องการบันทึกทับเป็นหัวหน้าใกล้ชิด {confirmDetail.level1Weight}% และหัวหน้าใหญ่ {confirmDetail.level2Weight}% หรือไม่?
                  </>
                )}
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="h-11 min-w-28 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={confirmOverwrite}
                  className="h-11 min-w-28 rounded-lg bg-[#1ab394] px-5 text-sm font-medium text-white hover:bg-[#18a689]"
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
