"use client";

import { useMemo, useState } from "react";

export type QuestionVersionItem = {
  question_version_id: number;
  question_id: number;
  question_no: number;
  question_title: string;
  version_no: number;
  is_current: boolean;
  active_status: boolean;
  used_count: number;
};

type QuestionVersionModalProps = {
  questionId: number;
  questionNo: number;
  questionTitle: string;
  versions: QuestionVersionItem[];
  setCurrentVersionAction: (formData: FormData) => void;
};

const orangeActionButtonClass =
  "rounded-lg border border-[#f8ac59] bg-[#f8ac59] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#f39b36]";

function CurrentBadge() {
  return (
    <span className="inline-flex rounded-full bg-[#23c6c8]/10 px-2.5 py-1 text-xs font-medium text-[#23c6c8]">
      Current
    </span>
  );
}

function UsedBadge({ usedCount }: { usedCount: number }) {
  if (usedCount > 0) {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
        ถูกใช้แล้ว {usedCount} รอบ
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      ยังไม่ถูกใช้
    </span>
  );
}

export default function QuestionVersionModal({
  questionId,
  questionNo,
  questionTitle,
  versions,
  setCurrentVersionAction,
}: QuestionVersionModalProps) {
  const [open, setOpen] = useState(false);

  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => b.version_no - a.version_no);
  }, [versions]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
      >
        ข้อ {questionNo}
      </button>

      {open && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  เลือก Version หัวข้อประเมิน
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  ข้อ {questionNo}: {questionTitle || "-"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-2xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {sortedVersions.length === 0 ? (
                <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-800">
                  ยังไม่มี Version ของหัวข้อนี้
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedVersions.map((version) => (
                    <div
                      key={version.question_version_id}
                      className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                              Version {version.version_no}
                            </span>

                            {version.is_current && <CurrentBadge />}

                            <UsedBadge usedCount={version.used_count} />
                          </div>

                          <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                            {version.question_title}
                          </p>
                        </div>

                        <div className="shrink-0">
                          {version.is_current ? (
                            <button
                              type="button"
                              disabled
                              className="rounded-lg border border-[#23c6c8]/30 bg-[#23c6c8]/10 px-3 py-1.5 text-xs font-medium text-[#23c6c8]"
                            >
                              ใช้อยู่
                            </button>
                          ) : (
                            <form action={setCurrentVersionAction}>
                              <input
                                type="hidden"
                                name="question_id"
                                value={questionId}
                              />
                              <input
                                type="hidden"
                                name="question_version_id"
                                value={version.question_version_id}
                              />

                              <button className={orangeActionButtonClass}>
                                ตั้งเป็น Current
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}