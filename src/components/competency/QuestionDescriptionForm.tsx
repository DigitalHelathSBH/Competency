"use client";

import { FormEvent, useRef, useState } from "react";
import SearchableSelect from "@/components/competency/SearchableSelect";

type SelectOption = {
  value: string;
  label: string;
};

type CurrentDescriptionRule = {
  question_no: number;
  rank_group_id: number;
  question_used_count: number;
};

type QuestionDescriptionFormProps = {
  questionOptions: SelectOption[];
  rankGroupOptions: SelectOption[];
  currentDescriptionRules: CurrentDescriptionRule[];
  saveDescriptionAction: (formData: FormData) => void;
};

export default function QuestionDescriptionForm({
  questionOptions,
  rankGroupOptions,
  currentDescriptionRules,
  saveDescriptionAction,
}: QuestionDescriptionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const allowSubmitRef = useRef(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowSubmitRef.current) {
      allowSubmitRef.current = false;
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const questionNo = Number(formData.get("question_no") || 0);
    const rankGroupId = Number(formData.get("rank_group_id") || 0);

    const matched = currentDescriptionRules.find((rule) => {
      return (
        Number(rule.question_no) === questionNo &&
        Number(rule.rank_group_id) === rankGroupId &&
        Number(rule.question_used_count || 0) === 0
      );
    });

    if (!matched) {
      return;
    }

    event.preventDefault();
    setConfirmOpen(true);
  }

  function confirmOverwrite() {
    const form = formRef.current;
    if (!form) return;

    const confirmInput = form.querySelector<HTMLInputElement>(
      'input[name="confirm_overwrite"]'
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
        action={saveDescriptionAction}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <input type="hidden" name="confirm_overwrite" value="0" />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              หัวข้อประเมิน
            </label>
            <SearchableSelect
              name="question_no"
              required
              placeholder="เลือกหัวข้อประเมิน"
              options={questionOptions}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              กลุ่มระดับการถูกประเมิน
            </label>
            <SearchableSelect
              name="rank_group_id"
              required
              placeholder="เลือกกลุ่มระดับการถูกประเมิน"
              options={rankGroupOptions}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            คำอธิบาย
          </label>
          <textarea
            name="description_text"
            required
            rows={5}
            placeholder="ระบุคำอธิบายหัวข้อประเมิน..."
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div className="flex justify-end">
          <button type="submit"
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">
            บันทึกคำอธิบาย
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
                ยืนยันการแก้ไข
              </h3>

              <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-300">
                หัวข้อและกลุ่มระดับนี้มีคำอธิบายอยู่แล้ว
                และยังไม่เคยถูกนำไปใช้ในการประเมิน
                <br />
                ต้องการแก้ไขคำอธิบายเดิมหรือไม่?
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