"use client";

import type {
  EvaluationFormData,
  EvaluationScoreTemplate,
} from "@/lib/competency";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SaveDetail = {
  round_question_id: number;
  score: number | null;
  comment_text: string | null;
};

type SaveResult = {
  ok: boolean;
  submitted: boolean;
  message?: string;
};

type SavePersonEvaluation = (
  assignmentId: number,
  details: SaveDetail[],
  actionType: "draft" | "submit",
) => Promise<SaveResult>;

type DepartmentEvaluationFormProps = {
  forms: EvaluationFormData[];
  templates: EvaluationScoreTemplate[];
  canEdit: boolean;
  savePersonEvaluation: SavePersonEvaluation;
};

const DEFAULT_SCORE = 3;
const DEFAULT_TEMPLATE_KEY = "__default__";

function getDisplayScore(
  score: number | null,
  maxScore: number,
) {
  if (
    score !== null &&
    score !== undefined &&
    Number.isFinite(Number(score))
  ) {
    return String(score);
  }

  return String(
    Math.min(
      DEFAULT_SCORE,
      Math.max(
        0,
        Number(maxScore) ||
          DEFAULT_SCORE,
      ),
    ),
  );
}

function getScoreOptions(
  maxScore: number,
) {
  const safeMax = Math.max(
    0,
    Number(maxScore) || 0,
  );

  const wholeMax = Math.floor(
    safeMax,
  );

  const options = Array.from(
    {
      length: wholeMax + 1,
    },
    (_, index) => String(index),
  );

  if (
    !Number.isInteger(safeMax) &&
    safeMax > wholeMax
  ) {
    options.push(String(safeMax));
  }

  return options;
}

function getPhotoUrl(
  payrollNo: string,
) {
  return `http://10.0.255.1/pic/${encodeURIComponent(
    payrollNo.trim(),
  )}.jpg`;
}

function getStatusText(
  submitted: boolean,
  saving: boolean,
) {
  if (saving) return "กำลังบันทึก...";
  if (submitted) return "ประเมินแล้ว";
  return "ยังไม่ครบ / บันทึกแล้ว";
}

function getStatusClass(
  submitted: boolean,
  saving: boolean,
) {
  if (saving) {
    return "bg-blue-50 text-blue-600";
  }

  if (submitted) {
    return "bg-emerald-50 text-emerald-600";
  }

  return "bg-amber-50 text-amber-700";
}

function EmployeeEvaluationBlock({
  form,
  templates,
  canEdit,
  savePersonEvaluation,
  onTemplateUpdate,
}: {
  form: EvaluationFormData;
  templates: EvaluationScoreTemplate[];
  canEdit: boolean;
  savePersonEvaluation: SavePersonEvaluation;
  onTemplateUpdate: (
    assignmentId: number,
    details: SaveDetail[],
  ) => void;
}) {
  const initialScores = useMemo(() => {
    const result: Record<
      number,
      string
    > = {};

    for (const question of form.questions) {
      result[
        question.round_question_id
      ] = getDisplayScore(
        question.score,
        Number(
          question.max_score,
        ),
      );
    }

    return result;
  }, [form.questions]);

  const initialTouched = useMemo(() => {
    const result: Record<
      number,
      boolean
    > = {};

    for (const question of form.questions) {
      result[
        question.round_question_id
      ] =
        question.score !== null &&
        question.score !== undefined &&
        Number.isFinite(
          Number(question.score),
        );
    }

    return result;
  }, [form.questions]);

  const initialComments = useMemo(() => {
    const result: Record<
      number,
      string
    > = {};

    for (const question of form.questions) {
      result[
        question.round_question_id
      ] =
        question.comment_text ||
        "";
    }

    return result;
  }, [form.questions]);

  const [scores, setScores] =
    useState(initialScores);

  const [touched, setTouched] =
    useState(initialTouched);

  const [comments, setComments] =
    useState(initialComments);

  const [saving, setSaving] =
    useState(false);

  const [lastError, setLastError] =
    useState("");

  const [submitted, setSubmitted] =
    useState(
      Number(
        form.assignment
          .evaluation_status_type ||
          0,
      ) === 1,
    );

  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState(
      DEFAULT_TEMPLATE_KEY,
    );

  const saveQueueRef = useRef<
    Promise<unknown>
  >(Promise.resolve());

  useEffect(() => {
    setScores(initialScores);
    setTouched(initialTouched);
    setComments(initialComments);
    setSubmitted(
      Number(
        form.assignment
          .evaluation_status_type ||
          0,
      ) === 1,
    );
  }, [
    form.assignment.assignment_id,
    form.assignment.evaluation_status_type,
    initialScores,
    initialTouched,
    initialComments,
  ]);

  const questionCount =
    form.questions.length;

  const completedCount =
    form.questions.filter(
      (question) =>
        Boolean(
          touched[
            question
              .round_question_id
          ],
        ),
    ).length;

  const localTotal =
    form.questions.reduce(
      (sum, question) => {
        const score = Number(
          scores[
            question
              .round_question_id
          ],
        );

        return Number.isFinite(score)
          ? sum + score
          : sum;
      },
      0,
    );

  const enqueueSave = (
    nextScores: Record<
      number,
      string
    >,
    nextTouched: Record<
      number,
      boolean
    >,
    nextComments: Record<
      number,
      string
    >,
  ) => {
    if (!canEdit) return;

    // เมื่อมีการแก้ไขคะแนน/ความเห็นเพียง 1 ข้อ
    // ให้ถือว่าบุคคลนั้น "ประเมินแล้ว" ทันที
    // และบันทึกคะแนนทุกข้อพร้อมกัน โดยข้อที่ยังไม่ได้แก้
    // จะใช้ค่าที่แสดงอยู่ในหน้าจอ (ค่าเริ่มต้น 3 คะแนน)
    const complete =
      form.questions.length > 0;

    // การบันทึกครั้งแรกถือว่าประเมินบุคคลนั้นครบแล้ว
    // เพื่อให้สถานะและตัวนับในหน้าจอเป็น "ประเมินแล้ว" ทันที
    const allTouched: Record<number, boolean> = {};
    for (const question of form.questions) {
      allTouched[question.round_question_id] = true;
    }
    setTouched(allTouched);

    const details: SaveDetail[] =
      form.questions.map(
        (question) => {
          const questionId =
            question.round_question_id;

          const rawScore =
            nextScores[questionId];

          const fallbackScore =
            getDisplayScore(
              null,
              Number(question.max_score),
            );

          const score = Number(
            rawScore ?? fallbackScore,
          );

          if (
            score !== null &&
            (!Number.isFinite(score) ||
              score < 0 ||
              score >
                Number(
                  question.max_score,
                ))
          ) {
            throw new Error(
              `คะแนนข้อ ${question.question_no} ไม่ถูกต้อง`,
            );
          }

          return {
            round_question_id:
              questionId,
            score,
            comment_text:
              nextComments[
                questionId
              ]?.trim() || null,
          };
        },
      );

    setLastError("");
    setSaving(true);

    saveQueueRef.current =
      saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const result =
            await savePersonEvaluation(
              form.assignment
                .assignment_id,
              details,
              complete
                ? "submit"
                : "draft",
            );

          if (!result.ok) {
            setLastError(
              result.message ||
                "ไม่สามารถบันทึกคะแนนได้",
            );
            return;
          }

          setSubmitted(
            result.submitted,
          );

          onTemplateUpdate(
            form.assignment.assignment_id,
            details,
          );
        })
        .catch((error) => {
          setLastError(
            error instanceof Error
              ? error.message
              : "ไม่สามารถบันทึกคะแนนได้",
          );
        })
        .finally(() => {
          setSaving(false);
        });
  };

  function handleScoreChange(
    questionId: number,
    value: string,
  ) {
    if (!canEdit) return;

    const nextScores = {
      ...scores,
      [questionId]: value,
    };

    const nextTouched = {
      ...touched,
      [questionId]: true,
    };

    setScores(nextScores);
    setTouched(nextTouched);

    try {
      enqueueSave(
        nextScores,
        nextTouched,
        comments,
      );
    } catch (error) {
      setLastError(
        error instanceof Error
          ? error.message
          : "คะแนนไม่ถูกต้อง",
      );
    }
  }

  function handleCommentBlur(
    questionId: number,
  ) {
    if (!canEdit) return;

    try {
      enqueueSave(
        scores,
        touched,
        comments,
      );
    } catch (error) {
      setLastError(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกความเห็นได้",
      );
    }
  }

  function applyTemplate(
    templateKey: string,
  ) {
    if (!canEdit) return;

    setSelectedTemplateKey(
      templateKey,
    );

    const nextScores: Record<
      number,
      string
    > = {};

    const nextTouched: Record<
      number,
      boolean
    > = {};

    if (
      templateKey ===
      DEFAULT_TEMPLATE_KEY
    ) {
      for (const question of form.questions) {
        const questionId =
          question.round_question_id;

        nextScores[questionId] =
          getDisplayScore(
            null,
            Number(
              question.max_score,
            ),
          );

        nextTouched[
          questionId
        ] = true;
      }
    } else {
      const template =
        templates.find(
          (item) =>
            item.template_key ===
            templateKey,
        );

      if (!template) return;

      for (const question of form.questions) {
        const questionId =
          question.round_question_id;

        const templateScore =
          template.scores[
            question.question_no
          ];

        if (
          templateScore !==
            null &&
          templateScore !==
            undefined &&
          Number.isFinite(
            Number(templateScore),
          )
        ) {
          nextScores[
            questionId
          ] = String(
            Math.min(
              Math.max(
                Number(
                  templateScore,
                ),
                0,
              ),
              Number(
                question.max_score,
              ),
            ),
          );

          nextTouched[
            questionId
          ] = true;
        } else {
          nextScores[
            questionId
          ] = getDisplayScore(
            null,
            Number(
              question.max_score,
            ),
          );

          nextTouched[
            questionId
          ] = false;
        }
      }
    }

    setScores(nextScores);
    setTouched(nextTouched);

    try {
      enqueueSave(
        nextScores,
        nextTouched,
        comments,
      );
    } catch (error) {
      setLastError(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกต้นแบบคะแนนได้",
      );
    }
  }

  const photoUrl = getPhotoUrl(
    form.assignment
      .employee_payroll_no,
  );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
              <img
                src={photoUrl}
                alt={`รูป ${form.assignment.employee_payroll_no}`}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display =
                    "none";
                }}
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
                  {
                    form.assignment
                      .employee_full_name
                  }
                </h2>

                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(
                    submitted,
                    saving,
                  )}`}
                >
                  {getStatusText(
                    submitted,
                    saving,
                  )}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  รหัสพนักงาน:{" "}
                  {
                    form.assignment
                      .employee_payroll_no
                  }
                </span>
                <span>
                  ระดับผู้ประเมิน:{" "}
                  {
                    form.assignment
                      .evaluator_level
                  }
                </span>
                <span>
                  คะแนนรวม:{" "}
                  {localTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full lg:max-w-md">
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              ประเมินเหมือนใคร
            </label>

            <select
              value={
                selectedTemplateKey
              }
              onChange={(event) =>
                applyTemplate(
                  event.target.value,
                )
              }
              disabled={
                !canEdit ||
                questionCount ===
                  0
              }
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value={DEFAULT_TEMPLATE_KEY}>
                ค่าเริ่มต้น 3 คะแนนทุกข้อ
              </option>

              {templates
                .filter(
                  (template) =>
                    template.employee_payroll_no.trim() !==
                    form.assignment.employee_payroll_no.trim(),
                )
                .map((template) => (
                  <option
                    key={template.template_key}
                    value={template.template_key}
                  >
                    {template.employee_full_name} (
                    {template.employee_payroll_no}
                    ) คะแนนรวม {template.total_score ?? "-"}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            เลือกคะแนนแล้วระบบจะบันทึกอัตโนมัติทันที
            ไม่ต้องกดปุ่มบันทึก
          </span>

          <span className="font-medium text-gray-600 dark:text-gray-300">
            เลือกแล้ว {completedCount}/
            {questionCount} ข้อ
          </span>
        </div>

        {lastError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {lastError}
          </div>
        )}
      </div>

      {questionCount === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">
          ยังไม่พบหัวข้อประเมินสำหรับเจ้าหน้าที่คนนี้
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className="w-8 px-3 py-2 text-left text-xs font-medium text-gray-500">
                  ข้อ
                </th>
                <th className="min-w-[240px] px-3 py-2 text-left text-xs font-medium text-gray-500">
                  หัวข้อ
                </th>
                <th className="min-w-[300px] px-3 py-2 text-left text-xs font-medium text-gray-500">
                  คำอธิบาย
                </th>
                <th className="w-28 px-3 py-2 text-center text-xs font-medium text-gray-500">
                  คะแนน
                </th>
                <th className="min-w-[220px] px-3 py-2 text-left text-xs font-medium text-gray-500">
                  ความเห็น
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {form.questions.map(
                (question) => {
                  const questionId =
                    question.round_question_id;

                  return (
                    <tr
                      key={questionId}
                      className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-3 align-top text-sm font-medium text-gray-700 dark:text-gray-300">
                        {
                          question.question_no
                        }
                      </td>

                      <td className="px-3 py-3 align-top text-sm text-gray-800 dark:text-white/90">
                        {
                          question.question_title
                        }
                      </td>

                      <td className="px-3 py-3 align-top text-sm leading-6 text-gray-600 dark:text-gray-400">
                        {
                          question.description_text ||
                          "-"
                        }
                      </td>

                      <td className="px-3 py-3 align-top">
                        <select
                          value={
                            scores[
                              questionId
                            ] ??
                            getDisplayScore(
                              null,
                              Number(
                                question.max_score,
                              ),
                            )
                          }
                          onChange={(
                            event,
                          ) =>
                            handleScoreChange(
                              questionId,
                              event.target
                                .value,
                            )
                          }
                          disabled={
                            !canEdit
                          }
                          className="h-9 w-24 rounded-lg border border-gray-300 bg-white px-2 text-center text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                        >
                          {getScoreOptions(
                            Number(
                              question.max_score,
                            ),
                          ).map(
                            (option) => (
                              <option
                                key={
                                  option
                                }
                                value={
                                  option
                                }
                              >
                                {option}
                              </option>
                            ),
                          )}
                        </select>

                        <div className="mt-1 text-[10px] text-gray-400">
                          เต็ม{" "}
                          {
                            question.max_score
                          }
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <input
                          value={
                            comments[
                              questionId
                            ] || ""
                          }
                          onChange={(
                            event,
                          ) =>
                            setComments(
                              (current) => ({
                                ...current,
                                [questionId]:
                                  event.target
                                    .value,
                              }),
                            )
                          }
                          onBlur={() =>
                            handleCommentBlur(
                              questionId,
                            )
                          }
                          disabled={
                            !canEdit
                          }
                          placeholder="ความเห็น"
                          className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                        />
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DepartmentEvaluationForm({
  forms,
  templates,
  canEdit,
  savePersonEvaluation,
}: DepartmentEvaluationFormProps) {
  const [currentTemplates, setCurrentTemplates] =
    useState<EvaluationScoreTemplate[]>(templates);

  useEffect(() => {
    setCurrentTemplates(templates);
  }, [templates]);

  const handleTemplateUpdate = (
    assignmentId: number,
    details: SaveDetail[],
  ) => {
    setCurrentTemplates((current) =>
      current.map((template) => {
        if (
          template.template_assignment_id !==
          assignmentId
        ) {
          return template;
        }

        const targetForm = forms.find(
          (item) =>
            item.assignment.assignment_id ===
            assignmentId,
        );

        if (!targetForm) {
          return template;
        }

        const scores = {
          ...template.scores,
        };

        for (const detail of details) {
          const question =
            targetForm.questions.find(
              (item) =>
                item.round_question_id ===
                detail.round_question_id,
            );

          if (!question) continue;

          scores[question.question_no] =
            detail.score;
        }

        const totalScore =
        Object.values(scores).reduce<number>(
          (sum, score) => {
            const value = Number(score);

            return Number.isFinite(value)
              ? sum + value
              : sum;
          },
          0,
        );

        return {
          ...template,
          scores,
          total_score: totalScore,
          evaluation_status_type: 1,
        };
      }),
    );
  };

  return (
    <div className="space-y-4">
      {forms.map((form) => (
        <EmployeeEvaluationBlock
          key={
            form.assignment.assignment_id
          }
          form={form}
          templates={currentTemplates}
          canEdit={canEdit}
          savePersonEvaluation={
            savePersonEvaluation
          }
          onTemplateUpdate={
            handleTemplateUpdate
          }
        />
      ))}
    </div>
  );
}
