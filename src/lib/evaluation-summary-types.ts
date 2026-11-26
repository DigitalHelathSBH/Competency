// ข้อมูลแบบสรุปผลการประเมินรายบุคคล (port จาก D:\Project\performance-report\make_report.py)
// ใช้ร่วมกันทั้ง 5 แบบฟอร์ม; ช่องที่แบบฟอร์มนั้นไม่ใช้จะเป็น "" หรือ null

export type SummaryFormType = "ministry" | "civil" | "worker" | "temp" | "gov";

export const SUMMARY_FORM_LABELS: Record<SummaryFormType, string> = {
  ministry: "พนักงานกระทรวงสาธารณสุข",
  civil: "ข้าราชการ",
  worker: "ลูกจ้างประจำ",
  temp: "ลูกจ้างชั่วคราว",
  gov: "พนักงานราชการ",
};

export type SummaryKpiRow = {
  kpi_code: string;
  kpi_name: string;
  level: number | null;
  weight: number;
  score: number | null;
};

export type SummaryCompetencyRow = {
  title: string;
  value: number;
  max_score: number;
  share: number;
  points: number;
};

export type EvaluationSummary = {
  form: SummaryFormType;
  round_code: string; // "2569/2"
  round_no: number; // 2
  round_year: string; // "2569"
  period_label: string; // ชื่อรอบจากฐาน KPI เช่น "รอบที่ 2/2569" (ministry)
  period_range: string; // ช่วงเวลารอบ (worker/temp/gov) ว่างได้
  total: number | null; // คะแนนรวมสุดท้าย
  grade: string | null; // ระดับผล (worker ใช้ 3 ระดับ)
  salary: number | null; // worker เท่านั้น
  employee: {
    payroll_no: string;
    full_name: string;
    position_name: string;
    position_type: string; // civil: "ทั่วไป" | "วิชาการ"
    rank_name: string; // civil: ระดับตำแหน่ง
    division_name: string;
    work_group: string; // worker/gov: กลุ่มงาน
    join_date: string; // temp: วันที่เริ่มจ้าง (ภาษาไทย)
  };
  evaluator: {
    full_name: string;
    position_name: string;
    position_type: string;
    rank_name: string;
  };
  kpi: {
    rows: SummaryKpiRow[];
    total: number | null; // ผลสัมฤทธิ์ดิบ 0-100
    weight_percent: number; // 100 - competency_percent
    component: number | null; // total × weight_percent / 100
  };
  competency: {
    rows: SummaryCompetencyRow[];
    raw_total: number | null; // พฤติกรรมดิบ 0-100
    weight_percent: number; // competency_percent
    component: number | null;
  };
};

export const FIVE_LEVEL_GRADES = ["ดีเด่น", "ดีมาก", "ดี", "พอใช้", "ต้องปรับปรุง"] as const;
export const WORKER_GRADES = ["ดีเด่น", "เป็นที่ยอมรับได้", "ต้องปรับปรุง"] as const;

/** แสดงตัวเลข 2 ตำแหน่งแบบมีคอมมา; null → "-" (เหมือน filter fmt ใน Python) */
export function fmt(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
