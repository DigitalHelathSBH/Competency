"use client";

import { useState } from "react";

type RoundTemplateOption = {
  value: string;
  label: string;
  description?: string;
};

type RoundTemplateCopyFormProps = {
  targetRoundOptions: RoundTemplateOption[];
  sourceRoundOptions: RoundTemplateOption[];
  copyRoundTemplateAction: (formData: FormData) => void;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function RoundTemplateCopyForm({
  targetRoundOptions,
  sourceRoundOptions,
  copyRoundTemplateAction,
}: RoundTemplateCopyFormProps) {
  const [open, setOpen] = useState(false);
  const [targetRoundId, setTargetRoundId] = useState(targetRoundOptions[0]?.value || "");
  const [sourceRoundId, setSourceRoundId] = useState(sourceRoundOptions[0]?.value || "");

  const canCopy = targetRoundOptions.length > 0 && sourceRoundOptions.length > 0;

  return (
    <>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              คัดลอกจากรอบก่อน
            </h2>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              คัดลอกผู้ถูกประเมิน ผู้ประเมิน และน้ำหนักผู้ประเมินจากรอบเดิมเข้าสู่รอบร่าง โดยระบบจะข้ามข้อมูลที่มีอยู่แล้ว ไม่ลบทับข้อมูลเดิม
            </p>
          </div>

          <button
            type="button"
            disabled={!canCopy}
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
          >
            คัดลอกจากรอบก่อน
          </button>
        </div>

        {!targetRoundOptions.length && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            ต้องมีรอบประเมินสถานะร่างก่อน จึงจะคัดลอกจากรอบก่อนได้
          </div>
        )}

        {targetRoundOptions.length > 0 && !sourceRoundOptions.length && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            ยังไม่มีรอบต้นทางให้คัดลอก กรุณาใช้งานตั้งค่ารอบแรกด้วยวิธีปกติก่อน
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-5">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                คัดลอกจากรอบก่อน
              </h3>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                เลือกรอบต้นทางและรายการที่ต้องการคัดลอก ระบบจะคัดลอกเฉพาะข้อมูลที่ยังไม่มีในรอบร่าง และตรวจเงื่อนไขเจ้าหน้าที่ปัจจุบันให้อัตโนมัติ
              </p>
            </div>

            <form action={copyRoundTemplateAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    รอบปลายทาง
                  </label>
                  <select
                    name="target_round_id"
                    required
                    value={targetRoundId}
                    onChange={(event) => setTargetRoundId(event.target.value)}
                    className={selectClassName}
                  >
                    {targetRoundOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    รอบต้นทาง
                  </label>
                  <select
                    name="source_round_id"
                    required
                    value={sourceRoundId}
                    onChange={(event) => setSourceRoundId(event.target.value)}
                    className={selectClassName}
                  >
                    {sourceRoundOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  รายการที่ต้องการคัดลอก
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                    <input
                      type="checkbox"
                      name="copy_employees"
                      value="1"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span>
                      <span className="block font-medium">ผู้ถูกประเมิน</span>
                      <span className="text-xs text-gray-500">snapshot ข้อมูลจาก PYREXT ปัจจุบัน</span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                    <input
                      type="checkbox"
                      name="copy_assignments"
                      value="1"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span>
                      <span className="block font-medium">ผู้ประเมิน</span>
                      <span className="text-xs text-gray-500">คัดลอกตาม payroll_no ที่ยังเข้าเงื่อนไข</span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                    <input
                      type="checkbox"
                      name="copy_weights"
                      value="1"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span>
                      <span className="block font-medium">น้ำหนักผู้ประเมิน</span>
                      <span className="text-xs text-gray-500">default และแยกตามกลุ่มภารกิจ</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
                ระบบจะไม่ลบหรือเขียนทับข้อมูลเดิมในรอบปลายทาง ถ้ามีข้อมูลอยู่แล้วจะข้ามรายการนั้น และคัดลอกเฉพาะรายการที่ยังไม่มีเท่านั้น
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-11 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]"
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  className="h-11 rounded-lg bg-[#1ab394] px-5 text-sm font-medium text-white hover:bg-[#18a689]"
                >
                  ยืนยันคัดลอก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
