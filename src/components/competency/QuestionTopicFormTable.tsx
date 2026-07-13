"use client";

import DataTable from "@/components/competency/DataTable";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

export type RankGroupOption = {
  rank_group_id: number;
  rank_group_name: string;
  sort_order: number;
};

export type QuestionDescriptionItem = {
  rank_group_id: number;
  description_text: string;
};

export type QuestionTopicItem = {
  question_id: number;
  question_scope: "COMMON" | "PROFESSION";
  fixed_question_no: number | null;
  max_score: number;
  active_status: boolean;
  question_version_id: number;
  version_no: number;
  question_title: string;
  descriptions: QuestionDescriptionItem[];
};

type QuestionTopicFormTableProps = {
  rankGroups: RankGroupOption[];
  questions: QuestionTopicItem[];
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
};

type DescriptionState = Record<number, string>;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

const textareaClass =
  "min-h-28 w-full resize-y rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253] disabled:cursor-not-allowed disabled:opacity-60";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689] disabled:cursor-not-allowed disabled:opacity-60";

function ActiveStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
      เปิดใช้งาน
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
      ปิดใช้งาน
    </span>
  );
}

function QuestionScopeBadge({ scope }: { scope: "COMMON" | "PROFESSION" }) {
  return scope === "COMMON" ? (
    <span className="inline-flex rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-400">
      ส่วนกลาง
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#f8ac59]/10 px-2.5 py-1 text-xs font-medium text-[#f8ac59]">
      ตามวิชาชีพ
    </span>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง";
}

function formatNumber(value: number) {
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function buildEmptyDescriptions(rankGroups: RankGroupOption[]) {
  return rankGroups.reduce<DescriptionState>((result, rankGroup) => {
    result[rankGroup.rank_group_id] = "";
    return result;
  }, {});
}

export default function QuestionTopicFormTable({
  rankGroups,
  questions,
  createAction,
  updateAction,
  toggleAction,
}: QuestionTopicFormTableProps) {
  const activeCommonNumbers = useMemo(
    () =>
      new Set(
        questions
          .filter(
            (item) => item.question_scope === "COMMON" && item.active_status,
          )
          .map((item) => Number(item.fixed_question_no)),
      ),
    [questions],
  );

  const availableCommonNumbers = useMemo(
    () => [1, 2, 3, 4].filter((item) => !activeCommonNumbers.has(item)),
    [activeCommonNumbers],
  );

  const [editingItem, setEditingItem] = useState<QuestionTopicItem | null>(
    null,
  );
  const [questionScope, setQuestionScope] = useState<"COMMON" | "PROFESSION">(
    "COMMON",
  );
  const [fixedQuestionNo, setFixedQuestionNo] = useState("");
  const [questionTitle, setQuestionTitle] = useState("");
  const [maxScore, setMaxScore] = useState("5");
  const [descriptions, setDescriptions] = useState<DescriptionState>(() =>
    buildEmptyDescriptions(rankGroups),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingItem) return;

    setDescriptions((current) => {
      const next = buildEmptyDescriptions(rankGroups);

      for (const rankGroup of rankGroups) {
        next[rankGroup.rank_group_id] = current[rankGroup.rank_group_id] || "";
      }

      return next;
    });
  }, [editingItem, rankGroups]);

  useEffect(() => {
    if (editingItem || questionScope !== "COMMON") return;

    if (
      !fixedQuestionNo ||
      !availableCommonNumbers.includes(Number(fixedQuestionNo))
    ) {
      setFixedQuestionNo(
        availableCommonNumbers.length > 0
          ? String(availableCommonNumbers[0])
          : "",
      );
    }
  }, [availableCommonNumbers, editingItem, fixedQuestionNo, questionScope]);

  function resetForm() {
    setEditingItem(null);
    setQuestionScope("COMMON");
    setFixedQuestionNo(
      availableCommonNumbers.length > 0
        ? String(availableCommonNumbers[0])
        : "",
    );
    setQuestionTitle("");
    setMaxScore("5");
    setDescriptions(buildEmptyDescriptions(rankGroups));
    setErrorMessage("");
  }

  function handleEdit(item: QuestionTopicItem) {
    const descriptionState = buildEmptyDescriptions(rankGroups);

    for (const description of item.descriptions) {
      descriptionState[description.rank_group_id] =
        description.description_text;
    }

    setErrorMessage("");
    setEditingItem(item);
    setQuestionScope(item.question_scope);
    setFixedQuestionNo(
      item.fixed_question_no === null ? "" : String(item.fixed_question_no),
    );
    setQuestionTitle(item.question_title);
    setMaxScore(String(item.max_score));
    setDescriptions(descriptionState);

    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function handleScopeChange(value: "COMMON" | "PROFESSION") {
    setQuestionScope(value);

    if (value === "COMMON") {
      setFixedQuestionNo(
        availableCommonNumbers.length > 0
          ? String(availableCommonNumbers[0])
          : "",
      );
    } else {
      setFixedQuestionNo("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const action = editingItem ? updateAction : createAction;

    startTransition(async () => {
      try {
        await action(formData);
        resetForm();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    });
  }

  function handleToggle(
    event: FormEvent<HTMLFormElement>,
    item: QuestionTopicItem,
  ) {
    event.preventDefault();
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await toggleAction(formData);

        if (editingItem?.question_id === item.question_id) {
          resetForm();
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
        formSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }

  const commonNumberUnavailable =
    !editingItem &&
    questionScope === "COMMON" &&
    availableCommonNumbers.length === 0;

  const formIsIncomplete =
    !questionTitle.trim() ||
    !maxScore ||
    (questionScope === "COMMON" && !fixedQuestionNo) ||
    rankGroups.some(
      (rankGroup) =>
        !String(descriptions[rankGroup.rank_group_id] || "").trim(),
    );

  return (
    <>
      <div
        ref={formSectionRef}
        className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {editingItem ? "แก้ไขหัวข้อประเมิน" : "เพิ่มหัวข้อประเมิน"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            หัวข้อส่วนกลางใช้เป็นข้อ 1-4 ส่วนหัวข้อตามวิชาชีพจะนำไปเลือกเป็นข้อ
            5-7 ให้แต่ละหน่วยงาน
          </p>
          {editingItem ? (
            <p className="mt-1 text-sm font-medium text-[#f8ac59]">
              กำลังแก้ไข: {editingItem.question_title}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-[#ed5565]/30 bg-[#ed5565]/10 px-4 py-3 text-sm text-[#ed5565]">
            {errorMessage}
          </div>
        ) : null}

        {rankGroups.length === 0 ? (
          <div className="rounded-lg border border-[#f8ac59]/30 bg-[#f8ac59]/10 px-4 py-3 text-sm text-[#c77d20] dark:text-[#f8ac59]">
            กรุณาเพิ่มและเปิดใช้งานกลุ่มระดับก่อนสร้างหัวข้อประเมิน
          </div>
        ) : (
          <form
            key={editingItem?.question_id ?? "create"}
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-12"
          >
            {editingItem ? (
              <input
                type="hidden"
                name="question_id"
                value={editingItem.question_id}
              />
            ) : null}

            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ประเภทหัวข้อ
              </label>
              <select
                name="question_scope"
                value={questionScope}
                onChange={(event) =>
                  handleScopeChange(
                    event.target.value as "COMMON" | "PROFESSION",
                  )
                }
                disabled={isPending || Boolean(editingItem)}
                className={inputClass}
              >
                <option value="COMMON">หัวข้อส่วนกลาง</option>
                <option value="PROFESSION">หัวข้อตามวิชาชีพ</option>
              </select>
            </div>

            {questionScope === "COMMON" ? (
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  เลขข้อ
                </label>
                <select
                  name="fixed_question_no"
                  value={fixedQuestionNo}
                  onChange={(event) => setFixedQuestionNo(event.target.value)}
                  required
                  disabled={isPending || Boolean(editingItem)}
                  className={inputClass}
                >
                  {editingItem?.fixed_question_no ? (
                    <option value={editingItem.fixed_question_no}>
                      ข้อ {editingItem.fixed_question_no}
                    </option>
                  ) : availableCommonNumbers.length > 0 ? (
                    availableCommonNumbers.map((questionNo) => (
                      <option key={questionNo} value={questionNo}>
                        ข้อ {questionNo}
                      </option>
                    ))
                  ) : (
                    <option value="">ไม่มีเลขข้อว่าง</option>
                  )}
                </select>
              </div>
            ) : null}

            <div
              className={
                questionScope === "COMMON" ? "md:col-span-4" : "md:col-span-6"
              }
            >
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ชื่อหัวข้อประเมิน
              </label>
              <input
                type="text"
                name="question_title"
                required
                maxLength={500}
                value={questionTitle}
                onChange={(event) => setQuestionTitle(event.target.value)}
                disabled={isPending}
                placeholder="ระบุชื่อหัวข้อประเมิน"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                คะแนนเต็ม
              </label>
              <input
                type="number"
                name="max_score"
                min="0.01"
                max="100"
                step="0.01"
                required
                value={maxScore}
                onChange={(event) => setMaxScore(event.target.value)}
                disabled={isPending}
                className={inputClass}
              />
            </div>

            {commonNumberUnavailable ? (
              <div className="md:col-span-12 rounded-lg border border-[#f8ac59]/30 bg-[#f8ac59]/10 px-4 py-3 text-sm text-[#c77d20] dark:text-[#f8ac59]">
                หัวข้อส่วนกลางข้อ 1-4 ถูกกำหนดครบแล้ว
                สามารถแก้ไขจากรายการด้านล่างหรือเลือกเพิ่มหัวข้อตามวิชาชีพ
              </div>
            ) : null}

            <div className="md:col-span-12">
              <div className="mb-3 border-t border-gray-200 pt-4 dark:border-gray-800">
                <h3 className="font-semibold text-gray-800 dark:text-white/90">
                  คำอธิบายตามกลุ่มระดับ
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  ระบุรายละเอียดที่ผู้ประเมินต้องใช้พิจารณาให้ครบทุกกลุ่มระดับ
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {rankGroups.map((rankGroup) => (
                  <div
                    key={rankGroup.rank_group_id}
                    className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                  >
                    <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-white/90">
                      {rankGroup.rank_group_name}
                    </label>
                    <textarea
                      name={`description_${rankGroup.rank_group_id}`}
                      required
                      value={descriptions[rankGroup.rank_group_id] || ""}
                      onChange={(event) =>
                        setDescriptions((current) => ({
                          ...current,
                          [rankGroup.rank_group_id]: event.target.value,
                        }))
                      }
                      disabled={isPending}
                      placeholder="ระบุคำอธิบายสำหรับกลุ่มระดับนี้"
                      className={textareaClass}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 md:col-span-12">
              {editingItem ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isPending}
                  className="h-11 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ยกเลิกการแก้ไข
                </button>
              ) : null}

              <button
                type="submit"
                disabled={
                  isPending || formIsIncomplete || commonNumberUnavailable
                }
                className={
                  editingItem
                    ? "h-11 rounded-lg bg-[#f8ac59] px-5 text-sm font-medium text-white hover:bg-[#f6a23c] disabled:cursor-not-allowed disabled:opacity-60"
                    : "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                }
              >
                {isPending
                  ? "กำลังบันทึก..."
                  : editingItem
                    ? "บันทึกการแก้ไข"
                    : "บันทึกหัวข้อประเมิน"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">
          รายการหัวข้อประเมิน
        </h2>

        <DataTable
          headers={[
            "ประเภท",
            "เลขข้อ",
            "ชื่อหัวข้อประเมิน",
            "คะแนนเต็ม",
            "คำอธิบาย",
            "ฉบับ",
            "สถานะ",
            "จัดการ",
          ]}
          emptyText="ยังไม่มีหัวข้อประเมิน"
        >
          {questions.map((item) => {
            const descriptionCount = rankGroups.filter((rankGroup) =>
              item.descriptions.some(
                (description) =>
                  description.rank_group_id === rankGroup.rank_group_id &&
                  description.description_text.trim(),
              ),
            ).length;
            const descriptionComplete =
              rankGroups.length > 0 && descriptionCount === rankGroups.length;

            return (
              <tr
                key={item.question_id}
                data-search={`${item.question_scope === "COMMON" ? "ส่วนกลาง" : "ตามวิชาชีพ"} ${item.fixed_question_no || ""} ${item.question_title} ${item.max_score} ${item.active_status ? "เปิดใช้งาน" : "ปิดใช้งาน"}`}
              >
                <td className="px-5 py-4 text-sm">
                  <QuestionScopeBadge scope={item.question_scope} />
                </td>
                <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                  {item.fixed_question_no
                    ? `ข้อ ${item.fixed_question_no}`
                    : "กำหนดภายหลัง"}
                </td>
                <td className="min-w-72 px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {item.question_title || "-"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {formatNumber(item.max_score)}
                </td>
                <td className="px-5 py-4 text-sm">
                  <span
                    className={
                      descriptionComplete
                        ? "inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]"
                        : "inline-flex rounded-full bg-[#f8ac59]/10 px-2.5 py-1 text-xs font-medium text-[#c77d20] dark:text-[#f8ac59]"
                    }
                  >
                    {descriptionCount}/{rankGroups.length} กลุ่ม
                  </span>
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {item.version_no > 0 ? `v${item.version_no}` : "-"}
                </td>
                <td className="px-5 py-4 text-sm">
                  <ActiveStatusBadge active={item.active_status} />
                </td>
                <td className="px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      disabled={isPending}
                      className="rounded-lg bg-[#f8ac59] px-4 py-2 text-xs font-medium text-white hover:bg-[#f6a23c] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      แก้ไข
                    </button>

                    <form onSubmit={(event) => handleToggle(event, item)}>
                      <input
                        type="hidden"
                        name="question_id"
                        value={item.question_id}
                      />
                      <input
                        type="hidden"
                        name="active_status"
                        value={item.active_status ? 0 : 1}
                      />
                      <button
                        type="submit"
                        disabled={isPending}
                        className={
                          item.active_status
                            ? redActionButtonClass
                            : greenActionButtonClass
                        }
                      >
                        {item.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    </>
  );
}