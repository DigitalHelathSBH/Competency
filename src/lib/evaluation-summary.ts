import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "./db";
import type {
  EvaluationSummary,
  SummaryCompetencyRow,
  SummaryFormType,
  SummaryKpiRow,
} from "./evaluation-summary-types";

/*
  แบบสรุปผลการประเมินรายบุคคล — port จาก D:\Project\performance-report\make_report.py
  คะแนนรวม = Competency ดิบ × competency_percent/100 + KPI finalPercentage ดิบ × (100 - competency_percent)/100
  KPI ยังอ่านจากฐาน KPI เดิม (FinalResultByKPI / FinalResultByPeriodID) — ห้ามใช้ KPIPercentage (น้ำหนักแบบเก่า)
*/

// ประเภทแบบฟอร์มตาม competency_round_employee.site_code (SYSCONFIG CTRLCODE 10060)
const SITE_FORM: Record<string, SummaryFormType> = {
  "14": "ministry",
  "1": "civil",
  "2": "worker",
  "3": "temp",
  "23": "temp",
  "151": "gov",
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const GENERAL_RANK_KEYWORDS = ["ปฏิบัติงาน", "ชำนาญงาน", "อาวุโส"];

function ssb() {
  return quoteSqlName(getSsbDatabaseName());
}

/** ปัดครึ่งขึ้น 2 ตำแหน่ง (เหมือน Decimal ROUND_HALF_UP ใน Python) */
function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function num(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function thaiDate(value: unknown) {
  if (!value) return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function classifyPositionType(rankName: string) {
  if (!rankName) return "";
  return GENERAL_RANK_KEYWORDS.some((keyword) => rankName.includes(keyword)) ? "ทั่วไป" : "วิชาการ";
}

function gradeFor(total: number | null, form: SummaryFormType) {
  if (total === null) return null;
  if (form === "worker") {
    if (total >= 90) return "ดีเด่น";
    if (total >= 60) return "เป็นที่ยอมรับได้";
    return "ต้องปรับปรุง";
  }
  if (total >= 95) return "ดีเด่น";
  if (total >= 85) return "ดีมาก";
  if (total >= 75) return "ดี";
  if (total >= 65) return "พอใช้";
  return "ต้องปรับปรุง";
}

// ชื่อใน SYSCONFIG 40072 มีคำนำหน้า แต่บางรหัสบันทึกผิด/ไม่อัปเดต จึงใช้เฉพาะเมื่อลงท้ายด้วยชื่อเดียวกับ PYREXT
const PERSON_NAME_SQL = `
    CAST(CASE
      WHEN n.sys_name IS NOT NULL AND (
        n.hr_name IS NULL
        OR REPLACE(REPLACE(n.sys_name, N' ', N''), N'.', N'')
           LIKE N'%' + REPLACE(REPLACE(n.hr_name, N' ', N''), N'.', N'')
      ) THEN n.sys_name
      ELSE n.hr_name
    END AS nvarchar(500))`;

function personNameApply(payrollExpr: string, pyrextAlias: string) {
  return `
    LEFT JOIN ${ssb()}.dbo.SYSCONFIG nm
      ON nm.CTRLCODE = 40072
     AND nm.CODE = ${payrollExpr}
    CROSS APPLY (SELECT
      NULLIF(LTRIM(RTRIM(${ssb()}.dbo.GetSSBName(nm.thainame))), N'') AS sys_name,
      NULLIF(LTRIM(RTRIM(
        ISNULL(${ssb()}.dbo.GetSSBName(${pyrextAlias}.FIRSTTHAINAME), N'') + N' ' +
        ISNULL(${ssb()}.dbo.GetSSBName(${pyrextAlias}.LASTTHAINAME), N'')
      )), N'') AS hr_name
    ) n`;
}

export type SummaryRoundOption = {
  round_id: number;
  round_code: string;
  status_type: number;
};

/** รอบที่คนนี้อยู่ในรายชื่อผู้ถูกประเมิน (ล่าสุดก่อน) */
export async function getSummaryRounds(payrollNo: string): Promise<SummaryRoundOption[]> {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("payroll_no", sql.VarChar(20), payrollNo)
    .query(`
      SELECT r.round_id, r.round_code, r.status_type
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r ON r.round_id = re.round_id
      WHERE re.payroll_no = @payroll_no
        AND re.status_type <> 9
        AND r.status_type IN (1, 2)
      ORDER BY r.round_year DESC, r.round_no DESC, r.round_id DESC;
    `);

  return result.recordset.map((row) => ({
    round_id: Number(row.round_id),
    round_code: text(row.round_code),
    status_type: Number(row.status_type),
  }));
}

export type SummaryResult =
  | { status: "ok"; data: EvaluationSummary }
  | { status: "not_found" }
  | { status: "unsupported_site"; site_code: string };

export async function getEvaluationSummary(roundId: number, payrollNo: string): Promise<SummaryResult> {
  const pool = await getDbPool();

  const employeeResult = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .input("payroll_no", sql.VarChar(20), payrollNo)
    .query(`
      SELECT TOP 1
        re.round_employee_id,
        re.round_id,
        re.position_code,
        ISNULL(re.division_code, '') AS division_code,
        ISNULL(re.evaluator_required_type, 2) AS evaluator_required_type,
        ISNULL(re.competency_percent, 20) AS competency_percent,
        LTRIM(RTRIM(re.site_code)) AS site_code,
        r.round_code,
        ${PERSON_NAME_SQL} AS full_name,
        CAST(ISNULL(pv.PositionName, N'') AS nvarchar(500)) AS position_name,
        CAST(ISNULL(${ssb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)), N'') AS nvarchar(500)) AS division_name,
        CAST(ISNULL(${ssb()}.dbo.GetSSBName(rk.thainame), N'') AS nvarchar(500)) AS rank_name,
        px.JOINDATE AS join_date
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r ON r.round_id = re.round_id
      LEFT JOIN ${ssb()}.dbo.PYREXT px ON px.PAYROLLNO = re.payroll_no
      ${personNameApply("re.payroll_no", "px")}
      LEFT JOIN ${ssb()}.dbo.PositionView pv ON pv.PositionCode = re.position_code
      LEFT JOIN ${ssb()}.dbo.SYSCONFIG ds ON ds.CODE = re.division_code AND ds.CTRLCODE = '10028'
      LEFT JOIN ${ssb()}.dbo.SYSCONFIG rk ON rk.CODE = re.rank_code AND rk.CTRLCODE = '60010'
      WHERE re.round_id = @round_id
        AND re.payroll_no = @payroll_no
        AND re.status_type <> 9;
    `);

  const employee = employeeResult.recordset[0];
  if (!employee) return { status: "not_found" };

  const siteCode = text(employee.site_code);
  const form = SITE_FORM[siteCode];
  if (!form) return { status: "unsupported_site", site_code: siteCode };

  const roundCode = text(employee.round_code);
  const [roundYear, roundNoText] = roundCode.split("/");
  const roundNo = Number(roundNoText);

  const [competency, kpi, evaluator] = await Promise.all([
    buildCompetency(employee),
    buildKpi(roundCode, payrollNo),
    getEvaluator(Number(employee.round_employee_id)),
  ]);

  const competencyPercent = Number(employee.competency_percent);
  const competencyComponent =
    competency.raw_total === null ? null : round2((competency.raw_total * competencyPercent) / 100);
  const kpiPercent = round2(100 - competencyPercent);
  const kpiComponent = kpi.total === null ? null : round2((kpi.total * kpiPercent) / 100);
  const total =
    competencyComponent === null || kpiComponent === null ? null : round2(competencyComponent + kpiComponent);

  const year = Number(roundYear);
  let periodRange = "";
  if (form === "worker") {
    periodRange = roundNo === 1 ? "1 ต.ค. – 31 มี.ค. ของปีถัดไป" : "1 เม.ย. – 30 ก.ย.";
  } else if (form === "temp" || form === "gov") {
    // ปีงบประมาณ: ครั้งที่ 1 = 1 ต.ค. ปีก่อน – 31 มี.ค., ครั้งที่ 2 = 1 เม.ย. – 30 ก.ย.
    periodRange =
      roundNo === 1
        ? `1 ตุลาคม ${year - 1} ถึงวันที่ 31 มีนาคม ${year}`
        : `1 เมษายน ${year} ถึงวันที่ 30 กันยายน ${year}`;
  }

  // แบบพนักงานกระทรวงใช้ชื่อ/ตำแหน่ง/กลุ่มงานจาก PersonnelView ของฐาน KPI ก่อน (ตาม make_report.py)
  const personnel = form === "ministry" ? kpi.personnel : null;
  const rankName = text(employee.rank_name);

  return {
    status: "ok",
    data: {
      form,
      round_code: roundCode,
      round_no: roundNo,
      round_year: roundYear,
      period_label: kpi.period_name || `รอบที่ ${roundCode}`,
      period_range: periodRange,
      total,
      grade: gradeFor(total, form),
      salary: form === "worker" ? kpi.salary : null,
      employee: {
        payroll_no: payrollNo,
        full_name: text(personnel?.fullname) || text(employee.full_name) || payrollNo,
        position_name: text(personnel?.PositionCodeName) || text(employee.position_name),
        position_type: form === "civil" ? classifyPositionType(rankName) : "",
        rank_name: rankName,
        division_name: text(personnel?.DivisionName) || text(employee.division_name),
        work_group: form === "worker" || form === "gov" || form === "temp" ? rankName : "",
        join_date: form === "temp" || form === "gov" ? thaiDate(employee.join_date) : "",
      },
      evaluator: {
        full_name: evaluator ? text(evaluator.full_name) : "",
        position_name: evaluator ? text(evaluator.position_name) : "",
        position_type: evaluator ? classifyPositionType(text(evaluator.rank_name)) : "",
        rank_name: evaluator ? text(evaluator.rank_name) : "",
      },
      kpi: {
        rows: kpi.rows,
        total: kpi.total,
        weight_percent: kpiPercent,
        component: kpiComponent,
      },
      competency: {
        rows: competency.rows,
        raw_total: competency.raw_total,
        weight_percent: competencyPercent,
        component: competencyComponent,
      },
    },
  };
}

type EmployeeRow = {
  round_employee_id: number;
  round_id: number;
  position_code: string | null;
  division_code: string;
  evaluator_required_type: number;
};

async function buildCompetency(employee: EmployeeRow) {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("round_employee_id", sql.Int, Number(employee.round_employee_id))
    .input("round_id", sql.Int, Number(employee.round_id))
    .input("position_code", sql.VarChar(20), text(employee.position_code))
    .input("division_code", sql.VarChar(20), text(employee.division_code))
    .query(`
      WITH weights AS (
        SELECT
          (SELECT TOP 1 weight_percent FROM dbo.competency_evaluator_weight
            WHERE round_id = @round_id AND evaluator_level = 1 AND active_status = 1
              AND division_code IN (@division_code, '')
            ORDER BY CASE WHEN division_code = @division_code THEN 0 ELSE 1 END, evaluator_weight_id DESC) AS level1_weight,
          (SELECT TOP 1 weight_percent FROM dbo.competency_evaluator_weight
            WHERE round_id = @round_id AND evaluator_level = 2 AND active_status = 1
              AND division_code IN (@division_code, '')
            ORDER BY CASE WHEN division_code = @division_code THEN 0 ELSE 1 END, evaluator_weight_id DESC) AS level2_weight
      ),
      latest AS (
        SELECT a.evaluator_level, ev.evaluation_id,
               ROW_NUMBER() OVER (PARTITION BY a.evaluator_level ORDER BY ev.evaluation_id DESC) AS rn
        FROM dbo.competency_evaluator_assignment a
        JOIN dbo.competency_evaluation ev ON ev.assignment_id = a.assignment_id AND ev.status_type = 1
        WHERE a.round_employee_id = @round_employee_id
          AND a.status_type <> 9
          AND a.evaluator_level IN (1, 2)
      )
      SELECT
        crq.question_no,
        qv.question_title,
        CAST(crq.max_score AS decimal(8,2)) AS max_score,
        CAST(crq.weight_percent AS decimal(8,2)) AS weight_percent,
        CAST(d1.score AS decimal(8,2)) AS level1_score,
        CAST(d2.score AS decimal(8,2)) AS level2_score,
        w.level1_weight,
        w.level2_weight
      FROM dbo.competency_round_question crq
      JOIN dbo.competency_question_version qv ON qv.question_version_id = crq.question_version_id
      CROSS JOIN weights w
      LEFT JOIN latest l1 ON l1.evaluator_level = 1 AND l1.rn = 1
      LEFT JOIN dbo.competency_evaluation_detail d1
        ON d1.evaluation_id = l1.evaluation_id AND d1.round_question_id = crq.round_question_id
      LEFT JOIN latest l2 ON l2.evaluator_level = 2 AND l2.rn = 1
      LEFT JOIN dbo.competency_evaluation_detail d2
        ON d2.evaluation_id = l2.evaluation_id AND d2.round_question_id = crq.round_question_id
      WHERE crq.round_id = @round_id
        AND crq.active_status = 1
        AND (crq.position_code IS NULL OR crq.position_code = @position_code)
      ORDER BY crq.question_no;
    `);

  const rows = result.recordset;
  const requiredType = Number(employee.evaluator_required_type || 2);
  const maxTotal = rows.reduce((total, row) => total + Number(row.max_score || 0), 0);

  const items: SummaryCompetencyRow[] = rows.map((row) => {
    const score1 = Number(row.level1_score || 0);
    const score2 = Number(row.level2_score || 0);
    const value =
      requiredType === 1
        ? score1
        : (score1 * Number(row.level1_weight || 0)) / 100 + (score2 * Number(row.level2_weight || 0)) / 100;
    const maxScore = Number(row.max_score || 0);
    // น้ำหนักรายข้อตามที่ตั้งในระบบ ถ้าไม่ได้ตั้งจึงแบ่งตาม max_score
    const share =
      row.weight_percent !== null && row.weight_percent !== undefined
        ? Number(row.weight_percent)
        : maxTotal > 0
          ? (maxScore / maxTotal) * 100
          : 0;
    const points = maxScore > 0 ? (value / maxScore) * share : 0;

    return {
      title: text(row.question_title),
      value: round2(value),
      max_score: maxScore,
      share: round2(share),
      points: round2(points),
    };
  });

  return {
    rows: items,
    raw_total: maxTotal > 0 ? round2(items.reduce((total, item) => total + item.points, 0)) : null,
  };
}

async function buildKpi(roundCode: string, payrollNo: string) {
  const [yearText, noText] = roundCode.split("/");
  const pool = await getDbPool();

  // 4 result set ในรอบเดียว: รอบ, รายตัวชี้วัด, คะแนนรวม, ข้อมูลบุคลากรของรอบ
  const result = await pool
    .request()
    .input("period_like", sql.NVarChar(50), `%รอบที่ ${Number(noText)}/${Number(yearText)}%`)
    .input("payroll_no", sql.VarChar(20), payrollNo)
    .query(`
      DECLARE @period_id int, @period_name nvarchar(200);

      SELECT TOP 1 @period_id = PeriodID, @period_name = CAST(PeriodName AS nvarchar(200))
      FROM KPI.dbo.PeriodTbl
      WHERE PeriodName LIKE @period_like
      ORDER BY PeriodID DESC;

      SELECT @period_id AS period_id, @period_name AS period_name;

      SELECT
        LTRIM(RTRIM(KPI)) AS kpi_code,
        CAST(KPIName AS nvarchar(500)) AS kpi_name,
        ResultLevel AS level,
        Percentage AS weight,
        ResultPercentage AS score
      FROM KPI.dbo.FinalResultByKPI
      WHERE PeriodID = @period_id
        AND PayrollNo = @payroll_no
      ORDER BY KPI;

      SELECT TOP 1 finalPercentage
      FROM KPI.dbo.FinalResultByPeriodID(@period_id)
      WHERE @period_id IS NOT NULL
        AND PayrollNo = @payroll_no;

      SELECT TOP 1
        CAST(PositionCodeName AS nvarchar(500)) AS PositionCodeName,
        CAST(DivisionName AS nvarchar(500)) AS DivisionName,
        CAST(fullname AS nvarchar(500)) AS fullname,
        Salary
      FROM KPI.dbo.PersonnelView
      WHERE PeriodID = @period_id
        AND PayrollNo = @payroll_no;
    `);

  const sets = result.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const period = sets[0]?.[0];
  const totalRow = sets[2]?.[0];
  const personnel = sets[3]?.[0] || null;
  const total = num(totalRow?.finalPercentage);
  const salary = num(personnel?.Salary);

  const rows: SummaryKpiRow[] = (sets[1] || []).map((row) => {
    const score = num(row.score);
    return {
      kpi_code: text(row.kpi_code),
      kpi_name: text(row.kpi_name),
      level: num(row.level),
      weight: Number(row.weight || 0),
      score: score === null ? null : round2(score),
    };
  });

  return {
    period_name: period?.period_id ? text(period.period_name) : "",
    rows,
    total: total === null ? null : round2(total),
    salary: salary === null ? null : round2(salary),
    personnel: personnel as { PositionCodeName?: string; DivisionName?: string; fullname?: string } | null,
  };
}

/** ผู้ประเมินระดับ 1 คนล่าสุด พร้อมชื่อ/ตำแหน่ง/ระดับ */
async function getEvaluator(roundEmployeeId: number) {
  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .query(`
      SELECT TOP 1
        ${PERSON_NAME_SQL} AS full_name,
        CAST(ISNULL(pv.PositionName, N'') AS nvarchar(500)) AS position_name,
        CAST(ISNULL(${ssb()}.dbo.GetSSBName(rk.thainame), N'') AS nvarchar(500)) AS rank_name
      FROM dbo.competency_evaluator_assignment a
      JOIN ${ssb()}.dbo.PYREXT p ON p.PAYROLLNO = a.evaluator_payroll_no
      ${personNameApply("a.evaluator_payroll_no", "p")}
      LEFT JOIN ${ssb()}.dbo.PositionView pv ON pv.PositionCode = p.POSITIONCODE
      LEFT JOIN ${ssb()}.dbo.SYSCONFIG rk ON rk.CODE = p.RANK AND rk.CTRLCODE = '60010'
      WHERE a.round_employee_id = @round_employee_id
        AND a.evaluator_level = 1
        AND a.status_type <> 9
      ORDER BY a.assignment_id DESC;
    `);

  return result.recordset[0] || null;
}
