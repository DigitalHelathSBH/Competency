"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
} from "react";

export type KpiEvaluationRule = {
  score_level: number;
  operator_type: string;
  compare_value: number;
  evaluation_order: number;
};

export type KpiEvaluationItem = {
  form_item_id: number;
  item_order: number;
  indicator_code: string;
  indicator_name: string;
  indicator_note: string;
  weight_percent: number;
  actual_value: number | null;
  achieved_level: number | null;
  calculated_score: number | null;
  evaluator_note: string;
  rules: KpiEvaluationRule[];
};

export type KpiEvaluationFormData = {
  assignment: {
    kpi_assignment_id: number;
    round_code: string;
    round_status_type: number;
    employee_payroll_no: string;
    employee_full_name: string;
    division_name: string;
    section_name: string;
    form_code: string;
    form_name: string;
    evaluation_status_type: number | null;
    total_kpi_score: number | null;
    submitted_date: string;
  };
  items: KpiEvaluationItem[];
  can_edit: boolean;
};

type Props = {
  data: KpiEvaluationFormData;
  submitAction: (formData: FormData) => Promise<void>;
};

type ItemState = {
  actualValue: string;
  note: string;
};

const operatorLabel: Record<string, string> = {
  GT: ">",
  GE: ">=",
  LT: "<",
  LE: "<=",
  EQ: "=",
};

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";

function ruleMatches(
  operatorType: string,
  actualValue: number,
  compareValue: number,
) {
  if (operatorType === "GT") {
    return actualValue > compareValue;
  }

  if (operatorType === "GE") {
    return actualValue >= compareValue;
  }

  if (operatorType === "LT") {
    return actualValue < compareValue;
  }

  if (operatorType === "LE") {
    return actualValue <= compareValue;
  }

  if (operatorType === "EQ") {
    return actualValue === compareValue;
  }

  return false;
}

function calculateLevel(
  rules: KpiEvaluationRule[],
  actualValueText: string,
) {
  const trimmedValue = actualValueText.trim();

  if (trimmedValue === "") {
    return null;
  }

  const actualValue = Number(trimmedValue);

  if (
    !Number.isInteger(actualValue) ||
    actualValue < 0
  ) {
    return null;
  }

  const sortedRules = [...rules].sort(
    (first, second) =>
      first.evaluation_order -
        second.evaluation_order ||
      first.score_level - second.score_level,
  );

  const matchedRule = sortedRules.find((rule) =>
    ruleMatches(
      rule.operator_type,
      actualValue,
      rule.compare_value,
    ),
  );

  return matchedRule
    ? matchedRule.score_level
    : null;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

export default function KpiEvaluationScoreForm({
  data,
  submitAction,
}: Props) {
  const initialItemState = Object.fromEntries(
    data.items.map((item) => [
      item.form_item_id,
      {
        actualValue:
          item.actual_value === null ||
          item.actual_value === undefined
            ? ""
            : String(item.actual_value),
        note: item.evaluator_note || "",
      },
    ]),
  ) as Record<number, ItemState>;

  const [itemState, setItemState] =
    useState<Record<number, ItemState>>(
      initialItemState,
    );

  const calculatedRows = useMemo(() => {
    return data.items.map((item) => {
      const state = itemState[item.form_item_id] || {
        actualValue: "",
        note: "",
      };

      const actualValueText =
        state.actualValue.trim();
      const actualValue =
        actualValueText === ""
          ? null
          : Number(actualValueText);

      const validActual =
        actualValue !== null &&
        Number.isInteger(actualValue) &&
        actualValue >= 0;

      const level = calculateLevel(
        item.rules,
        state.actualValue,
      );

      const score =
        level === null
          ? null
          : roundScore(
              (item.weight_percent * level) / 5,
            );

      return {
        ...item,
        actualValueText: state.actualValue,
        note: state.note,
        actualValue,
        validActual,
        level,
        score,
      };
    });
  }, [data.items, itemState]);

  const completedCount = calculatedRows.filter(
    (item) =>
      item.validActual &&
      item.level !== null,
  ).length;

  const totalScore = roundScore(
    calculatedRows.reduce(
      (sum, item) => sum + (item.score || 0),
      0,
    ),
  );

  const allComplete =
    calculatedRows.length > 0 &&
    completedCount === calculatedRows.length;

  const wasSubmitted =
    Number(
      data.assignment.evaluation_status_type || 0,
    ) === 1;

  function updateActualValue(
    formItemId: number,
    value: string,
  ) {
    setItemState((current) => ({
      ...current,
      [formItemId]: {
        ...(current[formItemId] || {
          actualValue: "",
          note: "",
        }),
        actualValue: value,
      },
    }));
  }

  function updateNote(
    formItemId: number,
    value: string,
  ) {
    setItemState((current) => ({
      ...current,
      [formItemId]: {
        ...(current[formItemId] || {
          actualValue: "",
          note: "",
        }),
        note: value,
      },
    }));
  }

  return (
    <form action={submitAction}>
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ผู้ถูกประเมิน
              </p>
              <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                {
                  data.assignment
                    .employee_full_name
                }
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {
                  data.assignment
                    .employee_payroll_no
                }
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                รอบประเมิน
              </p>
              <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                {data.assignment.round_code}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                แบบฟอร์ม KPI
              </p>
              <p className="mt-1 font-semibold text-[#23c6c8]">
                {data.assignment.form_code}
              </p>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                {data.assignment.form_name}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                หน่วยงาน
              </p>
              <p className="mt-1 text-sm text-gray-800 dark:text-white/90">
                {data.assignment.division_name ||
                  "-"}
              </p>
              {data.assignment.section_name && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {
                    data.assignment
                      .section_name
                  }
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ความคืบหน้า
          </p>

          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {completedCount.toLocaleString()} /{" "}
            {calculatedRows.length.toLocaleString()} ข้อ
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-[#1ab394] transition-all"
              style={{
                width:
                  calculatedRows.length > 0
                    ? `${
                        (completedCount /
                          calculatedRows.length) *
                        100
                      }%`
                    : "0%",
              }}
            />
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            คะแนน KPI ปัจจุบัน
          </p>

          <p className="mt-1 text-3xl font-semibold text-[#1ab394]">
            {totalScore.toLocaleString(
              "th-TH",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}
          </p>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            คะแนนเต็ม 100
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {calculatedRows.map((item) => {
          const actualHasValue =
            item.actualValueText.trim() !== "";
          const actualInvalid =
            actualHasValue &&
            !item.validActual;
          const levelMissing =
            item.validActual &&
            item.level === null;

          return (
            <div
              key={item.form_item_id}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <input
                type="hidden"
                name="form_item_id"
                value={item.form_item_id}
              />

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                <div className="xl:col-span-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-brand-50 px-2 text-sm font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      {item.item_order}
                    </span>

                    <span className="text-sm font-semibold text-[#23c6c8]">
                      {item.indicator_code}
                    </span>

                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      น้ำหนัก{" "}
                      {item.weight_percent.toLocaleString()}
                      %
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-semibold leading-7 text-gray-800 dark:text-white/90">
                    {item.indicator_name}
                  </h3>

                  {item.indicator_note && (
                    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {item.indicator_note}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {[...item.rules]
                      .sort(
                        (first, second) =>
                          second.score_level -
                          first.score_level,
                      )
                      .map((rule) => (
                        <span
                          key={`${item.form_item_id}-${rule.score_level}`}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                        >
                          ระดับ{" "}
                          {rule.score_level}:{" "}
                          {operatorLabel[
                            rule.operator_type
                          ] || "-"}{" "}
                          {rule.compare_value}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="xl:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    ค่าผลงานจริง
                  </label>

                  <input
                    name={`actual_${item.form_item_id}`}
                    type="number"
                    min="0"
                    step="1"
                    disabled={!data.can_edit}
                    value={item.actualValueText}
                    onChange={(event) =>
                      updateActualValue(
                        item.form_item_id,
                        event.target.value,
                      )
                    }
                    placeholder="กรอกจำนวนเต็ม"
                    className={inputClassName}
                  />

                  {actualInvalid && (
                    <p className="mt-1.5 text-xs text-[#ed5565]">
                      กรุณากรอกจำนวนเต็มตั้งแต่
                      0 ขึ้นไป
                    </p>
                  )}

                  {levelMissing && (
                    <p className="mt-1.5 text-xs text-[#ed5565]">
                      ค่านี้ไม่เข้าเกณฑ์ระดับใด
                      กรุณาแจ้งผู้ดูแลระบบ
                    </p>
                  )}
                </div>

                <div className="xl:col-span-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
                    ผลการคำนวณ
                  </p>

                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        ระดับ
                      </p>
                      <p className="mt-1 text-xl font-semibold text-[#f8ac59]">
                        {item.level ?? "-"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        คะแนน
                      </p>
                      <p className="mt-1 text-xl font-semibold text-[#1ab394]">
                        {item.score === null
                          ? "-"
                          : item.score.toLocaleString(
                              "th-TH",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="xl:col-span-12">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    หมายเหตุของผู้ประเมิน
                  </label>

                  <textarea
                    name={`note_${item.form_item_id}`}
                    rows={2}
                    maxLength={2000}
                    disabled={!data.can_edit}
                    value={item.note}
                    onChange={(event) =>
                      updateNote(
                        item.form_item_id,
                        event.target.value,
                      )
                    }
                    placeholder="ระบุรายละเอียดเพิ่มเติมได้"
                    className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-20 mt-5 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            กรอกครบ{" "}
            {completedCount.toLocaleString()} จาก{" "}
            {calculatedRows.length.toLocaleString()}{" "}
            ข้อ
            {" • "}
            คะแนนรวม{" "}
            <span className="font-semibold text-[#1ab394]">
              {totalScore.toLocaleString(
                "th-TH",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )}
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/kpi-evaluations"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              กลับไปรายการประเมิน
            </Link>

            {data.can_edit &&
              !wasSubmitted && (
                <button
                  type="submit"
                  name="action_type"
                  value="draft"
                  className="h-11 rounded-lg border border-[#23c6c8] bg-[#23c6c8] px-5 text-sm font-medium text-white hover:bg-[#1fb5b7]"
                >
                  บันทึกร่าง
                </button>
              )}

            {data.can_edit && (
              <button
                type="submit"
                name="action_type"
                value="submit"
                disabled={!allComplete}
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {wasSubmitted
                  ? "บันทึกการแก้ไข"
                  : "ส่งผลประเมิน KPI"}
              </button>
            )}
          </div>
        </div>

        {data.can_edit &&
          !allComplete && (
            <p className="mt-2 text-right text-xs text-[#ed5565]">
              ต้องกรอกค่าผลงานจริงให้ครบทุกข้อก่อนส่งผลประเมิน
            </p>
          )}
      </div>
    </form>
  );
}