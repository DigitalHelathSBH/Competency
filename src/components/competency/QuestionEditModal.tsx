"use client";

import { useState } from "react";

type QuestionEditModalProps = {
  questionId: number;
  questionTitle: string;
  currentVersionNo: number | null;
  usedCount: number;
  saveEditAction: (formData: FormData) => void;
};

const orangeActionButtonClass =
  "rounded-lg border border-[#f8ac59] bg-[#f8ac59] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#f39b36]";

export default function QuestionEditModal({
  questionId,
  questionTitle,
  currentVersionNo,
  usedCount,
  saveEditAction,
}: QuestionEditModalProps) {
  const [open, setOpen] = useState(false);
  const [confirmCreateVersion, setConfirmCreateVersion] = useState(false);

  const isUsed = usedCount > 0;

  function closeModal() {
    setOpen(false);
    setConfirmCreateVersion(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={orangeActionButtonClass}
      >
        แก้ไข
      </button>

      {open && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  แก้ไขชื่อหัวข้อประเมิน
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Version ปัจจุบัน: {currentVersionNo ?? "-"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="text-2xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            <form action={saveEditAction}>
              <div className="space-y-4 p-5">
                <input type="hidden" name="question_id" value={questionId} />
                <input
                  type="hidden"
                  name="confirm_create_version"
                  value={confirmCreateVersion ? "1" : "0"}
                />

                {isUsed && !confirmCreateVersion && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm leading-6 text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
                    หัวข้อนี้ถูกนำไปใช้ในรอบประเมินแล้ว {usedCount} รายการ
                    <br />
                    หากต้องการแก้ไข ระบบจะสร้าง Version ใหม่และตั้งเป็น Version ปัจจุบันทันที
                  </div>
                )}

                {confirmCreateVersion && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-800 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-200">
                    ยืนยันแล้ว: ระบบจะสร้าง Version ใหม่จากข้อความที่แก้ไข
                  </div>
                )}

                {!isUsed && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-200">
                    Version นี้ยังไม่ถูกนำไปใช้ในรอบประเมิน สามารถแก้ข้อความเดิมได้โดยตรง
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    ชื่อหัวข้อประเมิน
                  </label>
                  <textarea
                    name="question_title"
                    required
                    defaultValue={questionTitle}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  ยกเลิก
                </button>

                {isUsed && !confirmCreateVersion ? (
                  <button
                    type="button"
                    onClick={() => setConfirmCreateVersion(true)}
                    className="h-10 rounded-lg bg-yellow-500 px-4 text-sm font-medium text-white hover:bg-yellow-600"
                  >
                    ยืนยันสร้าง Version ใหม่
                  </button>
                ) : (
                  <button className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
                    บันทึก
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}