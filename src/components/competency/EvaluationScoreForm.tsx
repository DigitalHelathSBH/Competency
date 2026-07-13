"use client";

import type {
  EvaluationFormData,
  EvaluationScoreTemplate,
} from "@/lib/competency";
import { useMemo, useState } from "react";

type EvaluationScoreFormProps = {
  data: EvaluationFormData;
  templates: EvaluationScoreTemplate[];
  submitForm: (formData: FormData) => void | Promise<void>;
};

const DEFAULT_SCORE = 3;
const DEFAULT_TEMPLATE_KEY = "__default__";

function statusText(value: number | null | undefined) {
  if (value === 0) return "ร่าง";
  if (value === 1) return "ส่งแล้ว";
  if (value === 9) return "ยกเลิก";
  return "ยังไม่เริ่ม";
}

function getDefaultScore(maxScore: number) {
  return String(
    Math.min(DEFAULT_SCORE, Math.max(0, Number(maxScore) || DEFAULT_SCORE)),
  );
}

function getInitialScore(score: number | null, maxScore: number) {
  if (score !== null && score !== undefined && Number.isFinite(Number(score))) {
    return String(Number(score));
  }

  return getDefaultScore(maxScore);
}

function getScoreOptions(maxScore: number) {
  const safeMaxScore = Math.max(0, Number(maxScore) || 0);
  const wholeMaxScore = Math.floor(safeMaxScore);
  const options = Array.from({ length: wholeMaxScore + 1 }, (_, index) =>
    String(index),
  );

  if (!Number.isInteger(safeMaxScore) && safeMaxScore > wholeMaxScore) {
    options.push(String(safeMaxScore));
  }

  return options;
}

function clampScore(score: number | null | undefined, maxScore: number) {
  if (
    score === null ||
    score === undefined ||
    !Number.isFinite(Number(score))
  ) {
    return getDefaultScore(maxScore);
  }

  const safeMaxScore = Math.max(0, Number(maxScore) || 0);
  const nextScore = Math.min(Math.max(Number(score), 0), safeMaxScore);
  return String(nextScore);
}

export default function EvaluationScoreForm({
  data,
  templates,
  submitForm,
}: EvaluationScoreFormProps) {
  const initialScores = useMemo(() => {
    return data.questions.reduce<Record<number, string>>((acc, question) => {
      acc[question.round_question_id] = getInitialScore(
        question.score,
        Number(question.max_score),
      );
      return acc;
    }, {});
  }, [data.questions]);

  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState(DEFAULT_TEMPLATE_KEY);
  const [scores, setScores] = useState<Record<number, string>>(initialScores);

  const isSubmitted = Number(data.assignment.evaluation_status_type || 0) === 1;

  function applyTemplateByKey(templateKey: string) {
    setSelectedTemplateKey(templateKey);

    if (templateKey === DEFAULT_TEMPLATE_KEY) {
      setScores(
        data.questions.reduce<Record<number, string>>((acc, question) => {
          acc[question.round_question_id] = getDefaultScore(
            Number(question.max_score),
          );
          return acc;
        }, {}),
      );
      return;
    }

    const template = templates.find(
      (item) => item.template_key === templateKey,
    );
    if (!template) return;

    setScores(
      data.questions.reduce<Record<number, string>>((acc, question) => {
        acc[question.round_question_id] = clampScore(
          template.scores[question.question_no],
          Number(question.max_score),
        );
        return acc;
      }, {}),
    );
  }

  return (
    <form action={submitForm} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03] lg:grid-cols-12">
        <div className="lg:col-span-2">
          <p className="text-xs text-gray-500">ผู้ถูกประเมิน</p>
          <p
            className="truncate font-medium text-gray-800 dark:text-white/90"
            title={data.assignment.employee_full_name}
          >
            {data.assignment.employee_full_name}
          </p>
          <p className="text-xs text-gray-500">
            {data.assignment.employee_payroll_no}
          </p>
        </div>

        <div className="lg:col-span-2">
          <p className="text-xs text-gray-500">รอบประเมิน</p>
          <p className="font-medium text-gray-800 dark:text-white/90">
            {data.assignment.round_code}
          </p>
        </div>

        <div className="lg:col-span-2">
          <p className="text-xs text-gray-500">หน่วยงาน</p>
          <p
            className="truncate font-medium text-gray-800 dark:text-white/90"
            title={
              data.assignment.section_name ||
              data.assignment.section_code ||
              "-"
            }
          >
            {data.assignment.section_name ||
              data.assignment.section_code ||
              "-"}
          </p>
        </div>

        <div className="lg:col-span-2">
          <p className="text-xs text-gray-500">สถานะ / คะแนนรวม</p>
          <p className="font-medium text-gray-800 dark:text-white/90">
            {statusText(data.assignment.evaluation_status_type)} /{" "}
            {data.assignment.total_score ?? "-"}
          </p>
        </div>

        <div className="lg:col-span-4">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            ประเมินเหมือนใคร
          </label>
          <select
            value={selectedTemplateKey}
            onChange={(event) => applyTemplateByKey(event.target.value)}
            disabled={!data.can_edit || data.questions.length === 0}
            className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
          >
            <option value={DEFAULT_TEMPLATE_KEY}>
              ค่าเริ่มต้น 3 คะแนนทุกข้อ
            </option>
            {templates.map((template) => (
              <option key={template.template_key} value={template.template_key}>
                {template.employee_full_name} ({template.employee_payroll_no})
                คะแนนรวม {template.total_score ?? "-"}
              </option>
            ))}
          </select>
          {data.can_edit &&
            templates.length === 0 &&
            data.questions.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                ยังไม่มีคะแนนของคนอื่นในรอบเดียวกันให้ใช้เป็นต้นแบบ
                สามารถใช้ค่าเริ่มต้น 3 คะแนนได้
              </p>
            )}
        </div>
      </div>

      {!data.can_edit && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          รอบประเมินไม่ได้อยู่ในสถานะเปิดประเมินแล้ว สามารถดูข้อมูลได้เท่านั้น
        </div>
      )}

      {data.questions.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          ยังไม่พบหัวข้อประเมินสำหรับรายการนี้ กรุณาแจ้งผู้ดูแลระบบตรวจสอบรอบประเมิน
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  <th className="w-[28%] px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    หัวข้อ
                  </th>
                  <th className="w-[42%] px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    คำอธิบาย
                  </th>
                  <th className="w-[90px] px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                    คะแนน
                  </th>
                  <th className="w-[22%] px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    ความเห็นรายข้อ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.questions.map((question) => (
                  <tr key={question.round_question_id} className="align-middle">
                    <td className="px-3 py-1.5 text-sm font-medium text-gray-800 dark:text-white/90">
                      {question.question_no}.{question.question_title}
                    </td>
                    <td className="px-3 py-1.5 text-xs leading-5 text-gray-600 dark:text-gray-400">
                      {question.description_text || "-"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <select
                        name={`score_${question.round_question_id}`}
                        value={
                          scores[question.round_question_id] ??
                          getDefaultScore(Number(question.max_score))
                        }
                        onChange={(event) =>
                          setScores((prev) => ({
                            ...prev,
                            [question.round_question_id]: event.target.value,
                          }))
                        }
                        disabled={!data.can_edit}
                        className="h-8 w-20 rounded-lg border border-gray-300 bg-transparent px-2 text-center text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
                      >
                        {getScoreOptions(Number(question.max_score)).map(
                          (option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        name={`comment_${question.round_question_id}`}
                        defaultValue={question.comment_text ?? ""}
                        disabled={!data.can_edit}
                        placeholder="ความเห็น"
                        className="h-8 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-xs text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.can_edit && data.questions.length > 0 && (
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="submit"
            name="action_type"
            value="submit"
            className="rounded-lg bg-[#1ab394] px-5 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-[#18a689]"
          >
            {isSubmitted ? "บันทึกการแก้ไข" : "ส่งผลประเมิน"}
          </button>
        </div>
      )}
    </form>
  );
}