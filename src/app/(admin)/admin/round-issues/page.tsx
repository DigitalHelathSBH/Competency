import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import RoundIssuesTableClient from "@/components/competency/RoundIssuesTableClient";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type RoundIssuesPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

type RoundRow = {
  round_id: number;
  round_code: string;
  round_year: number;
  round_no: number;
  status_type: number;
};

type IssueLevel = "error" | "warning" | "info";

type IssueRow = {
  issue_type: string;
  issue_level: IssueLevel;
  issue_title: string;
  person_text: string;
  detail_text: string;
  reference_text: string;
  menu_path: string;
  fix_round_employee_id?: number | null;
  fix_evaluator_level?: number | null;
};

type IssueSummary = {
  total_count: number;
  error_count: number;
  warning_count: number;
  info_count: number;
};

type IssueTableState = {
  roundId: string;
  page: number;
  pageSize: number;
  search: string;
  level: string;
  type: string;
  menu: string;
};

type IssueTablePayload = {
  rows: IssueRow[];
  totalCount: number;
  summary: IssueSummary;
  state: IssueTableState;
  selectedRound: RoundRow | null;
};

type IssueTableActionResult = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  table: IssueTablePayload;
};

const ROUND_ISSUES_TABLE_COOKIE = "competency_round_issues_table_v2";
const ROUND_EMPLOYEES_TABLE_COOKIE = "competency_round_employees_table";
const ASSIGNMENT_PREFILL_COOKIE = "competency_assignment_prefill";

const DEFAULT_TABLE_STATE: IssueTableState = {
  roundId: "",
  page: 1,
  pageSize: 25,
  search: "",
  level: "",
  type: "",
  menu: "",
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function toInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function roundStatusText(statusType: number) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";
  return `สถานะ ${statusType}`;
}

function getMenuLabel(path: string) {
  const menuMap: Record<string, string> = {
    "/admin/rounds": "รอบประเมิน",
    "/admin/round-readiness": "ตรวจสอบความพร้อมเปิดรอบ",
    "/admin/round-issues": "รายการที่ต้องแก้ไข",
    "/admin/round-employees": "ผู้ถูกประเมิน",
    "/admin/rank-groups": "กลุ่มระดับ",
    "/admin/assignments": "กำหนดผู้ประเมิน",
    "/admin/evaluator-weights": "น้ำหนักคะแนน",
    "/admin/questions": "หัวข้อประเมิน",
    "/admin/question-descriptions": "คำอธิบายหัวข้อ",
  };

  return menuMap[path] || path;
}

function extractPayrollNo(text: string) {
  const match = text.match(/\(([A-Za-z0-9_-]+)\)/);
  return match?.[1] || "";
}

function getFixSearchKeyword(issue: IssueRow) {
  const payrollNo = extractPayrollNo(issue.person_text || "");

  if (issue.menu_path === "/admin/round-employees" && payrollNo) {
    return payrollNo;
  }

  if (issue.menu_path === "/admin/assignments" && payrollNo) {
    return payrollNo;
  }

  if (issue.menu_path === "/admin/rank-groups") {
    return issue.reference_text.replace("rank_code:", "").trim();
  }

  return payrollNo || issue.issue_title;
}

function getRoundLabel(round: RoundRow) {
  return `${round.round_code} - ${roundStatusText(round.status_type)}`;
}

function getIssueTypeOptions() {
  return [
    { value: "ผู้ถูกประเมิน", label: "ผู้ถูกประเมิน" },
    { value: "ผู้ประเมิน", label: "ผู้ประเมิน" },
    { value: "น้ำหนักผู้ประเมิน", label: "น้ำหนักผู้ประเมิน" },
    { value: "หัวข้อประเมิน", label: "หัวข้อประเมิน" },
    { value: "คำอธิบายหัวข้อ", label: "คำอธิบายหัวข้อ" },
  ];
}

function getIssueMenuOptions() {
  return [
    "/admin/round-employees",
    "/admin/rank-groups",
    "/admin/assignments",
    "/admin/evaluator-weights",
    "/admin/questions",
    "/admin/question-descriptions",
  ].map((path) => ({
    value: path,
    label: getMenuLabel(path),
  }));
}

async function readTableState(defaultRoundId: number) {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(ROUND_ISSUES_TABLE_COOKIE)?.value;

  if (!rawValue) {
    return {
      ...DEFAULT_TABLE_STATE,
      roundId: defaultRoundId ? String(defaultRoundId) : "",
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<IssueTableState>;

    return {
      roundId: String(parsed.roundId || defaultRoundId || ""),
      page: toInt(parsed.page, 1),
      pageSize: [10, 25, 50, 100].includes(Number(parsed.pageSize))
        ? Number(parsed.pageSize)
        : 25,
      search: String(parsed.search || "").trim().slice(0, 100),
      level: String(parsed.level || ""),
      type: String(parsed.type || ""),
      menu: String(parsed.menu || ""),
    };
  } catch {
    return {
      ...DEFAULT_TABLE_STATE,
      roundId: defaultRoundId ? String(defaultRoundId) : "",
    };
  }
}

async function openAssignmentPrefill(formData: FormData) {
  "use server";

  await requireAdminSession();

  const roundEmployeeId = Number(formData.get("round_employee_id") || 0);
  const evaluatorLevel = Number(formData.get("evaluator_level") || 0);

  if (!roundEmployeeId || ![1, 2].includes(evaluatorLevel)) {
    redirect("/admin/round-issues?alert_type=error&alert_message=ไม่พบข้อมูลสำหรับเปิดฟอร์มกำหนดผู้ประเมิน");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ASSIGNMENT_PREFILL_COOKIE,
    JSON.stringify({
      round_employee_id: roundEmployeeId,
      evaluator_level: evaluatorLevel,
      created_at: Date.now(),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60,
    },
  );

  redirect("/admin/assignments");
}

async function openGenericFixMenu(formData: FormData) {
  "use server";

  await requireAdminSession();

  const menuPath = String(formData.get("menu_path") || "").trim();
  const searchKeyword = String(formData.get("search_keyword") || "").trim().slice(0, 100);
  const roundId = String(formData.get("round_id") || "").trim();

  const allowedPaths = new Set([
    "/admin/rounds",
    "/admin/round-readiness",
    "/admin/round-issues",
    "/admin/round-employees",
    "/admin/rank-groups",
    "/admin/assignments",
    "/admin/evaluator-weights",
    "/admin/questions",
    "/admin/question-descriptions",
  ]);

  if (!allowedPaths.has(menuPath)) {
    redirect("/admin/round-issues");
  }

  if (menuPath === "/admin/round-employees") {
    const cookieStore = await cookies();
    cookieStore.set(
      ROUND_EMPLOYEES_TABLE_COOKIE,
      JSON.stringify({
        page: 1,
        pageSize: 25,
        search: searchKeyword,
        roundId,
        divisionCode: "",
        rankGroupId: "",
        status: "",
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      },
    );
  }

  redirect(menuPath);
}

async function getRounds() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      round_id,
      round_year,
      round_no,
      round_code,
      status_type
    FROM dbo.competency_round
    WHERE status_type <> 9
    ORDER BY
      CASE WHEN status_type = 0 THEN 0 ELSE 1 END,
      round_year DESC,
      round_no DESC,
      round_id DESC;
  `);

  return result.recordset as RoundRow[];
}

function getIssueSourceSql() {
  return `
    WITH WeightScopes AS (
      SELECT DISTINCT
        '__DEFAULT__' AS scope_value,
        N'ค่า default ทุกกลุ่มภารกิจ' AS scope_label
      UNION ALL
      SELECT DISTINCT
        NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') AS scope_value,
        ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) + N' (' + NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') + N')' AS scope_label
      FROM dbo.competency_round_employee re
      LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
        ON ds.CODE = re.division_code
       AND ds.CTRLCODE = '10028'
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') IS NOT NULL
    ),
    WeightRules AS (
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(CAST(division_code AS varchar(20)))), ''), '__DEFAULT__') AS scope_value,
        SUM(CASE WHEN evaluator_level = 1 AND active_status = 1 THEN CAST(weight_percent AS decimal(10,2)) ELSE 0 END) AS level1_weight,
        SUM(CASE WHEN evaluator_level = 2 AND active_status = 1 THEN CAST(weight_percent AS decimal(10,2)) ELSE 0 END) AS level2_weight,
        SUM(CASE WHEN active_status = 1 THEN CAST(weight_percent AS decimal(10,2)) ELSE 0 END) AS total_weight,
        COUNT(DISTINCT CASE WHEN active_status = 1 THEN evaluator_level END) AS level_count
      FROM dbo.competency_evaluator_weight
      WHERE round_id = @round_id
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(CAST(division_code AS varchar(20)))), ''), '__DEFAULT__')
    ),
    DefaultWeight AS (
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM WeightRules
            WHERE scope_value = '__DEFAULT__'
              AND level_count >= 2
              AND ABS(total_weight - 100) < 0.01
          ) THEN 1
          ELSE 0
        END AS default_complete
    ),
    IssueSource AS (
      SELECT
        N'ผู้ถูกประเมิน' AS issue_type,
        'error' AS issue_level,
        N'ยังไม่มี rank_group' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'RANK ของผู้ถูกประเมินยังไม่ได้ map เข้ากลุ่มระดับ' AS detail_text,
        N'rank_code: ' + ISNULL(re.rank_code, N'-') AS reference_text,
        '/admin/rank-groups' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_round_employee re
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND re.rank_group_id IS NULL

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน' AS issue_type,
        'warning' AS issue_level,
        N'ไม่มีรหัสวิชาชีพ' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'ไม่มี position_code อาจทำให้หัวข้อ PROFESSION ไม่ครบ' AS detail_text,
        N'position_code ว่าง' AS reference_text,
        '/admin/round-employees' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_round_employee re
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND NULLIF(LTRIM(RTRIM(ISNULL(re.position_code, ''))), '') IS NULL

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน' AS issue_type,
        'warning' AS issue_level,
        N'ไม่มีกลุ่มภารกิจ' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'ไม่มี division_code อาจกระทบการใช้น้ำหนักตามกลุ่มภารกิจ' AS detail_text,
        N'division_code ว่าง' AS reference_text,
        '/admin/round-employees' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_round_employee re
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND NULLIF(LTRIM(RTRIM(ISNULL(re.division_code, ''))), '') IS NULL

      UNION ALL

      SELECT
        N'ผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        CASE WHEN lv.evaluator_level = 1 THEN N'ยังไม่มีหัวหน้าใกล้ชิด' ELSE N'ยังไม่มีหัวหน้าใหญ่' END AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'ผู้ถูกประเมินยังไม่มีผู้ประเมิน level ' + CAST(lv.evaluator_level AS nvarchar(10)) AS detail_text,
        N'evaluator_level = ' + CAST(lv.evaluator_level AS nvarchar(10)) AS reference_text,
        '/admin/assignments' AS menu_path,
        re.round_employee_id AS fix_round_employee_id,
        lv.evaluator_level AS fix_evaluator_level
      FROM dbo.competency_round_employee re
      CROSS JOIN (VALUES (1), (2)) lv(evaluator_level)
      WHERE re.round_id = @round_id
        AND (lv.evaluator_level = 1 OR ISNULL(re.evaluator_required_type, 2) = 2)
        AND re.status_type <> 9
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.competency_evaluator_assignment a
          WHERE a.round_employee_id = re.round_employee_id
            AND a.evaluator_level = lv.evaluator_level
            AND a.status_type <> 9
        )

      UNION ALL

      SELECT
        N'ผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        N'ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'รายการนี้ห้ามใช้ เพราะผู้ประเมินและผู้ถูกประเมินเป็นคนเดียวกัน' AS detail_text,
        N'assignment_id: ' + CAST(a.assignment_id AS nvarchar(20)) AS reference_text,
        '/admin/assignments' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND a.status_type <> 9
        AND a.evaluator_payroll_no = re.payroll_no

      UNION ALL

      SELECT
        N'ผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        N'ผู้ประเมินไม่พบใน PYREXT หรือพ้นสภาพแล้ว' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'ผู้ประเมิน ' + ISNULL(a.evaluator_payroll_no, N'-') + N' ไม่พร้อมใช้งาน' AS detail_text,
        N'assignment_id: ' + CAST(a.assignment_id AS nvarchar(20)) AS reference_text,
        '/admin/assignments' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      LEFT JOIN ${ssbDb()}.dbo.PYREXT p
        ON p.PAYROLLNO = a.evaluator_payroll_no
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND a.status_type <> 9
        AND (p.PAYROLLNO IS NULL OR p.TERMINATEDATE IS NOT NULL)

      UNION ALL

      SELECT
        N'ผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        N'RANK ผู้ประเมินยังไม่ได้ map' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(a.evaluator_payroll_no), a.evaluator_payroll_no) + N' (' + a.evaluator_payroll_no + N') ยังไม่มี rank_group' AS detail_text,
        N'rank_code: ' + ISNULL(CAST(p.[RANK] AS nvarchar(20)), N'-') AS reference_text,
        '/admin/rank-groups' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      JOIN ${ssbDb()}.dbo.PYREXT p
        ON p.PAYROLLNO = a.evaluator_payroll_no
       AND p.TERMINATEDATE IS NULL
      LEFT JOIN dbo.competency_rank_group_map eval_rgm
        ON eval_rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
       AND eval_rgm.active_status = 1
      LEFT JOIN dbo.competency_rank_group eval_rg
        ON eval_rg.rank_group_id = eval_rgm.rank_group_id
       AND eval_rg.active_status = 1
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND a.status_type <> 9
        AND eval_rg.rank_group_id IS NULL

      UNION ALL

      SELECT
        N'ผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        N'ระดับผู้ประเมินต่ำกว่าผู้ถูกประเมิน' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(a.evaluator_payroll_no), a.evaluator_payroll_no) + N' (' + a.evaluator_payroll_no + N') มี sort_order ต่ำกว่า' AS detail_text,
        N'ผู้ถูกประเมิน sort_order ' + CAST(emp_rg.sort_order AS nvarchar(10)) + N', ผู้ประเมิน sort_order ' + CAST(eval_rg.sort_order AS nvarchar(10)) AS reference_text,
        '/admin/assignments' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_rank_group emp_rg
        ON emp_rg.rank_group_id = re.rank_group_id
      JOIN ${ssbDb()}.dbo.PYREXT p
        ON p.PAYROLLNO = a.evaluator_payroll_no
       AND p.TERMINATEDATE IS NULL
      JOIN dbo.competency_rank_group_map eval_rgm
        ON eval_rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
       AND eval_rgm.active_status = 1
      JOIN dbo.competency_rank_group eval_rg
        ON eval_rg.rank_group_id = eval_rgm.rank_group_id
       AND eval_rg.active_status = 1
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND a.status_type <> 9
        AND eval_rg.sort_order < emp_rg.sort_order

      UNION ALL

      SELECT
        N'ผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        N'มีผู้ประเมินระดับเดียวกันซ้ำ' AS issue_title,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')' AS person_text,
        N'มีผู้ประเมิน level ' + CAST(a.evaluator_level AS nvarchar(10)) + N' จำนวน ' + CAST(COUNT(*) AS nvarchar(10)) + N' รายการ' AS detail_text,
        N'round_employee_id: ' + CAST(a.round_employee_id AS nvarchar(20)) AS reference_text,
        '/admin/assignments' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND a.status_type <> 9
      GROUP BY re.payroll_no, a.round_employee_id, a.evaluator_level
      HAVING COUNT(*) > 1

      UNION ALL

      SELECT
        N'หัวข้อประเมิน' AS issue_type,
        'error' AS issue_level,
        N'หัวข้อ COMMON ยังไม่ครบ' AS issue_title,
        N'ข้อ ' + CAST(qn.question_no AS nvarchar(10)) AS person_text,
        N'ข้อ 1-4 ต้องมี current version และ active' AS detail_text,
        N'question_scope = COMMON' AS reference_text,
        '/admin/questions' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM (VALUES (1), (2), (3), (4)) qn(question_no)
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.competency_question q
        JOIN dbo.competency_question_version qv
          ON qv.question_id = q.question_id
         AND qv.is_current = 1
         AND qv.active_status = 1
        WHERE q.question_no = qn.question_no
          AND q.question_scope = 'COMMON'
          AND q.active_status = 1
      )

      UNION ALL

      SELECT
        N'หัวข้อประเมิน' AS issue_type,
        'error' AS issue_level,
        N'หัวข้อ PROFESSION ยังไม่ครบ' AS issue_title,
        N'ข้อ ' + CAST(x.question_no AS nvarchar(10)) + N' - ' + ISNULL(pv.PositionName, x.position_code) AS person_text,
        N'วิชาชีพนี้มีผู้ถูกประเมินในรอบ แต่ยังไม่มีหัวข้อ current version' AS detail_text,
        N'position_code: ' + x.position_code AS reference_text,
        '/admin/questions' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM (
        SELECT DISTINCT
          re.position_code,
          qn.question_no
        FROM dbo.competency_round_employee re
        CROSS JOIN (VALUES (5), (6), (7)) qn(question_no)
        WHERE re.round_id = @round_id
          AND re.status_type <> 9
          AND NULLIF(LTRIM(RTRIM(ISNULL(re.position_code, ''))), '') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_question q
            JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1
            WHERE q.question_no = qn.question_no
              AND q.question_scope = 'PROFESSION'
              AND q.position_code = re.position_code
              AND q.active_status = 1
          )
      ) x
      LEFT JOIN ${ssbDb()}.dbo.PositionView pv
        ON pv.PositionCode = x.position_code

      UNION ALL

      SELECT
        N'คำอธิบายหัวข้อ' AS issue_type,
        'warning' AS issue_level,
        N'ยังไม่มีคำอธิบาย current' AS issue_title,
        N'ข้อ ' + CAST(x.question_no AS nvarchar(10)) + N' - ' + x.question_title AS person_text,
        N'ยังไม่มีคำอธิบายสำหรับกลุ่มระดับ ' + x.rank_group_name AS detail_text,
        N'question_no: ' + CAST(x.question_no AS nvarchar(20)) + N', rank_group_id: ' + CAST(x.rank_group_id AS nvarchar(20)) AS reference_text,
        '/admin/question-descriptions' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM (
        SELECT DISTINCT
          q.question_no,
          CASE
            WHEN q.question_no BETWEEN 5 AND 7 THEN N'ใช้ร่วมทุกวิชาชีพ'
            ELSE qv.question_title
          END AS question_title,
          re.rank_group_id,
          rg.rank_group_name
        FROM dbo.competency_round_employee re
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = re.rank_group_id
        JOIN dbo.competency_question q
          ON q.active_status = 1
         AND (
              (q.question_scope = 'COMMON' AND q.question_no BETWEEN 1 AND 4)
              OR
              (q.question_scope = 'PROFESSION' AND q.question_no BETWEEN 5 AND 7 AND q.position_code = re.position_code)
         )
        JOIN dbo.competency_question_version qv
          ON qv.question_id = q.question_id
         AND qv.is_current = 1
         AND qv.active_status = 1
        WHERE re.round_id = @round_id
          AND re.status_type <> 9
          AND re.rank_group_id IS NOT NULL
      ) x
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.competency_question_description_version qdv
        WHERE qdv.question_no = x.question_no
          AND qdv.rank_group_id = x.rank_group_id
          AND qdv.is_current = 1
          AND qdv.active_status = 1
      )

      UNION ALL

      SELECT
        N'น้ำหนักผู้ประเมิน' AS issue_type,
        'error' AS issue_level,
        N'น้ำหนักยังไม่ครบ 100%' AS issue_title,
        ws.scope_label AS person_text,
        CASE
          WHEN wr.scope_value IS NULL THEN N'ยังไม่ได้กำหนดน้ำหนักสำหรับขอบเขตนี้ และไม่มี default ที่ใช้แทนได้'
          ELSE N'หัวหน้าใกล้ชิด ' + FORMAT(ISNULL(wr.level1_weight, 0), 'N2') + N'%, หัวหน้าใหญ่ ' + FORMAT(ISNULL(wr.level2_weight, 0), 'N2') + N'%, รวม ' + FORMAT(ISNULL(wr.total_weight, 0), 'N2') + N'%'
        END AS detail_text,
        N'scope: ' + ws.scope_value AS reference_text,
        '/admin/evaluator-weights' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM WeightScopes ws
      CROSS JOIN DefaultWeight dw
      LEFT JOIN WeightRules wr
        ON wr.scope_value = ws.scope_value
      WHERE
        (
          ws.scope_value = '__DEFAULT__'
          AND (
            ISNULL(wr.level_count, 0) < 2
            OR ABS(ISNULL(wr.total_weight, 0) - 100) >= 0.01
          )
        )
        OR
        (
          ws.scope_value <> '__DEFAULT__'
          AND dw.default_complete = 0
          AND (
            ISNULL(wr.level_count, 0) < 2
            OR ABS(ISNULL(wr.total_weight, 0) - 100) >= 0.01
          )
        )
    )
  `;
}

function getFilteredWhereSql() {
  return `
    WHERE
      (@search = N'' OR
        ISNULL(issue_type, N'') LIKE N'%' + @search + N'%' OR
        ISNULL(issue_title, N'') LIKE N'%' + @search + N'%' OR
        ISNULL(person_text, N'') LIKE N'%' + @search + N'%' OR
        ISNULL(detail_text, N'') LIKE N'%' + @search + N'%' OR
        ISNULL(reference_text, N'') LIKE N'%' + @search + N'%' OR
        ISNULL(menu_path, N'') LIKE N'%' + @search + N'%'
      )
      AND (@level = N'' OR issue_level = @level)
      AND (@type = N'' OR issue_type = @type)
      AND (@menu = N'' OR menu_path = @menu)
  `;
}

function bindIssueFilterInputs(request: any, roundId: number, state: IssueTableState) {
  request
    .input("round_id", sql.Int, roundId)
    .input("search", sql.NVarChar(100), state.search || "")
    .input("level", sql.NVarChar(20), state.level || "")
    .input("type", sql.NVarChar(100), state.type || "")
    .input("menu", sql.NVarChar(100), state.menu || "");
}

async function getIssueSummary(roundId: number) {
  if (!roundId) {
    return {
      total_count: 0,
      error_count: 0,
      warning_count: 0,
      info_count: 0,
    } as IssueSummary;
  }

  const pool = await getDbPool();
  const result = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .query(`
      ${getIssueSourceSql()}
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN issue_level = 'error' THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN issue_level = 'warning' THEN 1 ELSE 0 END) AS warning_count,
        SUM(CASE WHEN issue_level = 'info' THEN 1 ELSE 0 END) AS info_count
      FROM IssueSource;
    `);

  const row = result.recordset[0] || {};

  return {
    total_count: Number(row.total_count || 0),
    error_count: Number(row.error_count || 0),
    warning_count: Number(row.warning_count || 0),
    info_count: Number(row.info_count || 0),
  };
}

async function getPagedIssues(roundId: number, state: IssueTableState) {
  if (!roundId) {
    return {
      rows: [] as IssueRow[],
      totalCount: 0,
    };
  }

  const pool = await getDbPool();
  const offset = (state.page - 1) * state.pageSize;

  const countRequest = pool.request();
  bindIssueFilterInputs(countRequest, roundId, state);
  const countResult = await countRequest.query(`
    ${getIssueSourceSql()}
    SELECT COUNT(*) AS total_count
    FROM IssueSource
    ${getFilteredWhereSql()};
  `);

  const totalCount = Number(countResult.recordset[0]?.total_count || 0);
  const maxPage = Math.max(1, Math.ceil(totalCount / state.pageSize));
  const safePage = Math.min(state.page, maxPage);
  const safeOffset = (safePage - 1) * state.pageSize;

  const dataRequest = pool.request();
  bindIssueFilterInputs(dataRequest, roundId, state);
  dataRequest
    .input("offset", sql.Int, safeOffset)
    .input("page_size", sql.Int, state.pageSize);

  const dataResult = await dataRequest.query(`
    ${getIssueSourceSql()}
    SELECT
      issue_type,
      issue_level,
      issue_title,
      person_text,
      detail_text,
      reference_text,
      menu_path,
      fix_round_employee_id,
      fix_evaluator_level
    FROM IssueSource
    ${getFilteredWhereSql()}
    ORDER BY
      CASE issue_level WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      issue_type,
      issue_title,
      person_text
    OFFSET @offset ROWS
    FETCH NEXT @page_size ROWS ONLY;
  `);

  return {
    rows: dataResult.recordset as IssueRow[],
    totalCount,
    safePage,
  };
}

async function loadIssueTableClient(
  nextState: IssueTableState,
): Promise<IssueTableActionResult> {
  "use server";

  await requireAdminSession();

  const rounds = await getRounds();
  const defaultRound = rounds.find((round) => round.status_type === 0) || rounds[0];

  const requestedRoundId = Number(nextState.roundId || defaultRound?.round_id || 0);
  const selectedRound =
    rounds.find((round) => Number(round.round_id) === requestedRoundId) ||
    defaultRound ||
    null;

  const selectedRoundId = Number(selectedRound?.round_id || 0);

  const normalizedState: IssueTableState = {
    roundId: selectedRoundId ? String(selectedRoundId) : "",
    page: toInt(nextState.page, 1),
    pageSize: [10, 25, 50, 100].includes(Number(nextState.pageSize))
      ? Number(nextState.pageSize)
      : 25,
    search: String(nextState.search || "").trim().slice(0, 100),
    level: String(nextState.level || ""),
    type: String(nextState.type || ""),
    menu: String(nextState.menu || ""),
  };

  const pageResult = await getPagedIssues(selectedRoundId, normalizedState);
  const safePage = Number(pageResult.safePage || normalizedState.page || 1);

  const finalState: IssueTableState = {
    ...normalizedState,
    page: safePage,
  };

  const summary = await getIssueSummary(selectedRoundId);

  const cookieStore = await cookies();
  cookieStore.set(ROUND_ISSUES_TABLE_COOKIE, JSON.stringify(finalState), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  return {
    ok: true,
    type: "success",
    message: "",
    table: {
      rows: pageResult.rows,
      totalCount: pageResult.totalCount,
      summary,
      state: finalState,
      selectedRound,
    },
  };
}

export default async function RoundIssuesPage({ searchParams }: RoundIssuesPageProps) {
  await requireAdminSession();

  const params = await searchParams;
  const rounds = await getRounds();
  const defaultRound = rounds.find((round) => round.status_type === 0) || rounds[0];
  const tableState = await readTableState(Number(defaultRound?.round_id || 0));
  const selectedRoundId = Number(tableState.roundId || defaultRound?.round_id || 0);
  const selectedRound = rounds.find((round) => Number(round.round_id) === selectedRoundId);
  const summary = await getIssueSummary(selectedRoundId);
  const pageResult = await getPagedIssues(selectedRoundId, tableState);
  const issues = pageResult.rows;
  const filteredTotalCount = pageResult.totalCount;
  const safePage = pageResult.safePage || tableState.page;
  const roundOptions = rounds.map((round) => ({
    value: String(round.round_id),
    label: getRoundLabel(round),
  }));

  const levelOptions = [
    { value: "", label: "ระดับ: ทั้งหมด" },
    { value: "error", label: "ต้องแก้" },
    { value: "warning", label: "ควรตรวจ" },
    { value: "info", label: "ข้อมูล" },
  ];

  const typeOptions = [
    { value: "", label: "ประเภท: ทั้งหมด" },
    ...getIssueTypeOptions(),
  ];

  const menuOptions = [
    { value: "", label: "เมนู: ทั้งหมด" },
    ...getIssueMenuOptions(),
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="รายการที่ต้องแก้ไข"
        description="แสดงรายละเอียดรายการที่ต้องแก้หรือควรตรวจสอบ แยกเป็นรายคน/รายหัวข้อ เพื่อให้ admin เข้าไปจัดการได้ง่ายก่อนเปิดรอบ"
      />

      <ActionAlert
        type={params?.alert_type as "success" | "error" | "warning" | "info" | undefined}
        message={params?.alert_message}
      />

      <RoundIssuesTableClient
        initialRows={issues}
        initialTotalCount={filteredTotalCount}
        initialSummary={summary}
        initialState={{ ...tableState, page: safePage }}
        initialSelectedRound={selectedRound || null}
        roundOptions={roundOptions}
        levelOptions={levelOptions}
        typeOptions={typeOptions}
        menuOptions={menuOptions}
        loadTableAction={loadIssueTableClient}
        openAssignmentPrefillAction={openAssignmentPrefill}
        openGenericFixMenuAction={openGenericFixMenu}
      />
    </div>
  );
}
