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
    "/admin/rank-group-maps": "ระดับข้าราชการ",
    "/admin/tenure-rank-groups": "ช่วงอายุงาน",
    "/admin/site-percents": "เปอร์เซ็นต์ Competency",
    "/admin/assignments": "กำหนดผู้ประเมิน",
    "/admin/evaluator-weights": "น้ำหนักผู้ประเมิน",
    "/admin/questions": "หัวข้อประเมิน",
    "/admin/profession-questions": "หัวข้อประเมินตามวิชาชีพ",
  };

  return menuMap[path] || path;
}

function extractPayrollNo(text: string) {
  const match = text.match(/\(([A-Za-z0-9_-]+)\)/);
  return match?.[1] || "";
}

function getFixSearchKeyword(issue: IssueRow) {
  const payrollNo = extractPayrollNo(issue.person_text || "");

  if (
    issue.menu_path === "/admin/round-employees" ||
    issue.menu_path === "/admin/assignments"
  ) {
    return payrollNo || issue.issue_title;
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
    "/admin/rank-group-maps",
    "/admin/tenure-rank-groups",
    "/admin/site-percents",
    "/admin/assignments",
    "/admin/evaluator-weights",
    "/admin/questions",
    "/admin/profession-questions",
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
      search: String(parsed.search || "")
        .trim()
        .slice(0, 100),
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
    redirect(
      "/admin/round-issues?alert_type=error&alert_message=ไม่พบข้อมูลสำหรับเปิดฟอร์มกำหนดผู้ประเมิน",
    );
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
  const searchKeyword = String(formData.get("search_keyword") || "")
    .trim()
    .slice(0, 100);
  const roundId = String(formData.get("round_id") || "").trim();

  const allowedPaths = new Set([
    "/admin/rounds",
    "/admin/round-readiness",
    "/admin/round-issues",
    "/admin/round-employees",
    "/admin/rank-groups",
    "/admin/rank-group-maps",
    "/admin/tenure-rank-groups",
    "/admin/site-percents",
    "/admin/assignments",
    "/admin/evaluator-weights",
    "/admin/questions",
    "/admin/profession-questions",
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
    WITH RoundInfo AS (
      SELECT
        round_id,
        round_code,
        CAST(start_date AS date) AS start_date
      FROM dbo.competency_round
      WHERE round_id = @round_id
    ),
    ActiveEmployees AS (
      SELECT re.*
      FROM dbo.competency_round_employee re
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
    ),
    EvaluatorBase AS (
      SELECT
        a.assignment_id,
        a.round_employee_id,
        a.evaluator_payroll_no,
        a.evaluator_level,
        re.payroll_no AS employee_payroll_no,
        re.rank_group_id AS employee_rank_group_id,
        p.PAYROLLNO AS found_payroll_no,
        p.TERMINATEDATE,
        NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS evaluator_rank_code,
        NULLIF(LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))), '') AS evaluator_site_code,
        TRY_CONVERT(date, p.FIRSTEMPLOYEEDATE) AS evaluator_first_employee_date,
        ri.start_date
      FROM dbo.competency_evaluator_assignment a
      JOIN ActiveEmployees re
        ON re.round_employee_id = a.round_employee_id
      JOIN RoundInfo ri
        ON ri.round_id = re.round_id
      LEFT JOIN ${ssbDb()}.dbo.PYREXT p
        ON CAST(p.PAYROLLNO AS varchar(20)) = a.evaluator_payroll_no
      WHERE a.status_type <> 9
    ),
    EvaluatorCalc AS (
      SELECT
        b.*,
        CASE
          WHEN b.evaluator_first_employee_date IS NULL
            OR b.evaluator_first_employee_date > b.start_date
          THEN NULL
          ELSE
            DATEDIFF(YEAR, b.evaluator_first_employee_date, b.start_date)
            - CASE
                WHEN DATEADD(
                  YEAR,
                  DATEDIFF(YEAR, b.evaluator_first_employee_date, b.start_date),
                  b.evaluator_first_employee_date
                ) > b.start_date
                THEN 1
                ELSE 0
              END
        END AS evaluator_service_year,
        CASE
          WHEN ISNULL(b.evaluator_site_code, '') = '1' THEN 'RANK'
          ELSE 'TENURE'
        END AS evaluator_group_source
      FROM EvaluatorBase b
    ),
    EvaluatorResolved AS (
      SELECT
        c.*,
        CASE
          WHEN c.evaluator_group_source = 'RANK' THEN rank_map.rank_group_id
          ELSE tenure_map.rank_group_id
        END AS evaluator_rank_group_id
      FROM EvaluatorCalc c
      OUTER APPLY (
        SELECT TOP 1 rg.rank_group_id
        FROM dbo.competency_rank_group_map rgm
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = rgm.rank_group_id
         AND rg.active_status = 1
        WHERE rgm.active_status = 1
          AND rgm.rank_code = c.evaluator_rank_code
        ORDER BY rgm.rank_group_map_id DESC
      ) rank_map
      OUTER APPLY (
        SELECT TOP 1 rg.rank_group_id
        FROM dbo.competency_tenure_rank_group trg
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = trg.rank_group_id
         AND rg.active_status = 1
        WHERE trg.active_status = 1
          AND c.evaluator_service_year IS NOT NULL
          AND c.evaluator_service_year >= trg.min_service_year
          AND (
            trg.max_service_year IS NULL
            OR c.evaluator_service_year < trg.max_service_year
          )
        ORDER BY trg.min_service_year DESC, trg.tenure_rank_group_id DESC
      ) tenure_map
    ),
    RequiredWeightScopes AS (
      SELECT DISTINCT
        ISNULL(
          NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), ''),
          '__NO_DIVISION__'
        ) AS scope_value
      FROM ActiveEmployees re
      WHERE ISNULL(re.evaluator_required_type, 2) = 2
    ),
    WeightRules AS (
      SELECT
        ISNULL(
          NULLIF(LTRIM(RTRIM(CAST(w.division_code AS varchar(20)))), ''),
          '__DEFAULT__'
        ) AS scope_value,
        COUNT(CASE WHEN w.active_status = 1 THEN 1 END) AS active_row_count,
        SUM(
          CASE
            WHEN w.evaluator_level = 1 AND w.active_status = 1
            THEN CAST(w.weight_percent AS decimal(10,2))
            ELSE 0
          END
        ) AS level1_weight,
        SUM(
          CASE
            WHEN w.evaluator_level = 2 AND w.active_status = 1
            THEN CAST(w.weight_percent AS decimal(10,2))
            ELSE 0
          END
        ) AS level2_weight,
        SUM(
          CASE
            WHEN w.active_status = 1
            THEN CAST(w.weight_percent AS decimal(10,2))
            ELSE 0
          END
        ) AS total_weight,
        COUNT(
          DISTINCT CASE
            WHEN w.active_status = 1
              AND w.evaluator_level IN (1, 2)
            THEN w.evaluator_level
          END
        ) AS level_count
      FROM dbo.competency_evaluator_weight w
      WHERE w.round_id = @round_id
      GROUP BY ISNULL(
        NULLIF(LTRIM(RTRIM(CAST(w.division_code AS varchar(20)))), ''),
        '__DEFAULT__'
      )
    ),
    WeightIssues AS (
      SELECT
        required_scope.scope_value,
        CASE
          WHEN ISNULL(specific_rule.active_row_count, 0) > 0
            THEN 'SPECIFIC'
          ELSE 'DEFAULT'
        END AS selected_rule_type,
        CASE
          WHEN ISNULL(specific_rule.active_row_count, 0) > 0
            THEN ISNULL(specific_rule.level1_weight, 0)
          ELSE ISNULL(default_rule.level1_weight, 0)
        END AS level1_weight,
        CASE
          WHEN ISNULL(specific_rule.active_row_count, 0) > 0
            THEN ISNULL(specific_rule.level2_weight, 0)
          ELSE ISNULL(default_rule.level2_weight, 0)
        END AS level2_weight,
        CASE
          WHEN ISNULL(specific_rule.active_row_count, 0) > 0
            THEN ISNULL(specific_rule.total_weight, 0)
          ELSE ISNULL(default_rule.total_weight, 0)
        END AS total_weight,
        CASE
          WHEN ISNULL(specific_rule.active_row_count, 0) > 0
            THEN ISNULL(specific_rule.level_count, 0)
          ELSE ISNULL(default_rule.level_count, 0)
        END AS level_count,
        CASE
          WHEN ISNULL(specific_rule.active_row_count, 0) > 0
            THEN ISNULL(specific_rule.active_row_count, 0)
          ELSE ISNULL(default_rule.active_row_count, 0)
        END AS active_row_count
      FROM RequiredWeightScopes required_scope
      LEFT JOIN WeightRules specific_rule
        ON specific_rule.scope_value = required_scope.scope_value
      LEFT JOIN WeightRules default_rule
        ON default_rule.scope_value = '__DEFAULT__'
      WHERE
        (
          ISNULL(specific_rule.active_row_count, 0) > 0
          AND (
            ISNULL(specific_rule.level_count, 0) <> 2
            OR ABS(ISNULL(specific_rule.total_weight, 0) - 100) >= 0.01
          )
        )
        OR
        (
          ISNULL(specific_rule.active_row_count, 0) = 0
          AND (
            ISNULL(default_rule.level_count, 0) <> 2
            OR ABS(ISNULL(default_rule.total_weight, 0) - 100) >= 0.01
          )
        )
    ),
    CurrentQuestionVersion AS (
      SELECT
        q.question_id,
        q.question_scope,
        q.fixed_question_no,
        q.max_score,
        q.active_status,
        current_version.question_version_id,
        current_version.question_title
      FROM dbo.competency_question q
      OUTER APPLY (
        SELECT TOP 1
          qv.question_version_id,
          qv.question_title
        FROM dbo.competency_question_version qv
        WHERE qv.question_id = q.question_id
          AND qv.is_current = 1
          AND qv.active_status = 1
        ORDER BY qv.version_no DESC, qv.question_version_id DESC
      ) current_version
    ),
    RoundPositions AS (
      SELECT DISTINCT
        NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code
      FROM ActiveEmployees
      WHERE NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
    ),
    ProfessionMapSummary AS (
      SELECT
        rp.position_code,
        COUNT(DISTINCT CASE WHEN m.active_status = 1 THEN m.profession_question_map_id END) AS active_map_count,
        COUNT(
          DISTINCT CASE
            WHEN m.active_status = 1
              AND m.question_no BETWEEN 5 AND 7
              AND cq.question_scope = 'PROFESSION'
              AND cq.active_status = 1
              AND cq.question_version_id IS NOT NULL
            THEN m.profession_question_map_id
          END
        ) AS valid_map_count,
        COUNT(DISTINCT CASE WHEN m.active_status = 1 THEN m.question_no END) AS distinct_slot_count,
        COUNT(
          DISTINCT CASE
            WHEN m.active_status = 1
              AND cq.question_scope = 'PROFESSION'
              AND cq.active_status = 1
              AND cq.question_version_id IS NOT NULL
            THEN m.question_id
          END
        ) AS distinct_topic_count
      FROM RoundPositions rp
      LEFT JOIN dbo.competency_profession_question_map m
        ON m.position_code = rp.position_code
       AND m.active_status = 1
      LEFT JOIN CurrentQuestionVersion cq
        ON cq.question_id = m.question_id
      GROUP BY rp.position_code
    ),
    RequiredQuestions AS (
      SELECT DISTINCT
        ae.rank_group_id,
        cq.question_version_id,
        cq.fixed_question_no AS question_no,
        cq.question_title
      FROM ActiveEmployees ae
      CROSS JOIN CurrentQuestionVersion cq
      WHERE ae.rank_group_id IS NOT NULL
        AND cq.question_scope = 'COMMON'
        AND cq.active_status = 1
        AND cq.fixed_question_no BETWEEN 1 AND 4
        AND cq.question_version_id IS NOT NULL

      UNION

      SELECT DISTINCT
        ae.rank_group_id,
        cq.question_version_id,
        m.question_no,
        cq.question_title
      FROM ActiveEmployees ae
      JOIN dbo.competency_profession_question_map m
        ON m.position_code = ae.position_code
       AND m.active_status = 1
       AND m.question_no BETWEEN 5 AND 7
      JOIN CurrentQuestionVersion cq
        ON cq.question_id = m.question_id
       AND cq.question_scope = 'PROFESSION'
       AND cq.active_status = 1
       AND cq.question_version_id IS NOT NULL
      WHERE ae.rank_group_id IS NOT NULL
    ),
    RequiredDescriptionPairs AS (
      SELECT
        rq.rank_group_id,
        rq.question_version_id,
        MIN(rq.question_no) AS question_no,
        MAX(rq.question_title) AS question_title
      FROM RequiredQuestions rq
      GROUP BY rq.rank_group_id, rq.question_version_id
    ),
    IssueSource AS (
      SELECT
        N'ผู้ถูกประเมิน' AS issue_type,
        'error' AS issue_level,
        N'ยังไม่มีผู้ถูกประเมินในรอบ' AS issue_title,
        ri.round_code AS person_text,
        N'กรุณาเพิ่มผู้ถูกประเมินก่อนตรวจสอบและเปิดรอบประเมิน' AS detail_text,
        N'ยังไม่มีรายชื่อในรอบนี้' AS reference_text,
        '/admin/round-employees' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM RoundInfo ri
      WHERE NOT EXISTS (SELECT 1 FROM ActiveEmployees)

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน',
        'error',
        N'ยังไม่มีกลุ่มระดับ',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        CASE
          WHEN re.rank_group_source = 'RANK'
            THEN N'ยังไม่สามารถจัดกลุ่มระดับจากระดับข้าราชการได้'
          WHEN re.rank_group_source = 'TENURE'
            THEN N'ยังไม่สามารถจัดกลุ่มระดับจากอายุงานได้'
          ELSE N'ข้อมูลการจัดกลุ่มระดับยังไม่สมบูรณ์'
        END,
        N'ตรวจสอบข้อมูลบุคลากรและการตั้งค่ากลุ่มระดับ',
        '/admin/round-employees',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE re.rank_group_id IS NULL

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน',
        'error',
        N'ไม่มีข้อมูลวิชาชีพ',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        N'ระบบไม่สามารถเลือกชุดหัวข้อประเมินตามวิชาชีพให้บุคลากรรายนี้ได้',
        N'กรุณาตรวจสอบข้อมูลวิชาชีพของบุคลากร',
        '/admin/round-employees',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(re.position_code, ''))), '') IS NULL

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน',
        'error',
        N'ไม่มีกลุ่มภารกิจ',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        N'ระบบไม่สามารถเลือกชุดน้ำหนักผู้ประเมินตามกลุ่มภารกิจได้',
        N'กรุณาตรวจสอบข้อมูลกลุ่มภารกิจของบุคลากร',
        '/admin/round-employees',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(re.division_code, ''))), '') IS NULL

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน',
        'error',
        N'ข้อมูลอายุงานไม่สมบูรณ์',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        CASE
          WHEN re.first_employee_date IS NULL
            THEN N'ไม่พบวันเริ่มปฏิบัติงาน จึงไม่สามารถคำนวณอายุงานได้'
          WHEN re.first_employee_date > ri.start_date
            THEN N'วันเริ่มปฏิบัติงานอยู่หลังวันเริ่มรอบ บุคลากรรายนี้จึงยังไม่เข้าเงื่อนไขของรอบ'
          ELSE N'ไม่สามารถคำนวณอายุงานเต็มปี ณ วันเริ่มรอบได้'
        END,
        CASE
          WHEN re.first_employee_date IS NULL
            THEN N'ตรวจสอบวันเริ่มปฏิบัติงาน'
          WHEN re.first_employee_date > ri.start_date
            THEN N'ตรวจสอบว่าบุคลากรรายนี้ควรอยู่ในรอบหรือไม่'
          ELSE N'ตรวจสอบข้อมูลอายุงานและช่วงอายุงาน'
        END,
        '/admin/round-employees',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN RoundInfo ri
        ON ri.round_id = re.round_id
      WHERE re.rank_group_source = 'TENURE'
        AND (re.first_employee_date IS NULL OR re.service_year IS NULL)

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน',
        'error',
        N'ข้อมูลการจัดกลุ่มระดับไม่สมบูรณ์',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        N'ระบบไม่พบวิธีจัดกลุ่มระดับที่บันทึกไว้สำหรับบุคลากรรายนี้',
        N'นำเข้ารายชื่อใหม่เพื่อคำนวณข้อมูลอีกครั้ง',
        '/admin/round-employees',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE re.rank_group_source IS NULL
         OR re.rank_group_source NOT IN ('RANK', 'TENURE')

      UNION ALL

      SELECT
        N'ผู้ถูกประเมิน',
        'error',
        N'เปอร์เซ็นต์ Competency ไม่ถูกต้อง',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        N'สัดส่วนคะแนน Competency ต้องอยู่ระหว่าง 0 ถึง 100 เปอร์เซ็นต์',
        N'ตรวจสอบการตั้งค่าเปอร์เซ็นต์ตามประเภทบุคลากร',
        '/admin/site-percents',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE re.competency_percent IS NULL
         OR re.competency_percent < 0
         OR re.competency_percent > 100

      UNION ALL

      SELECT
        N'ผู้ประเมิน',
        'error',
        CASE
          WHEN lv.evaluator_level = 1 THEN N'ยังไม่มีหัวหน้าใกล้ชิด'
          ELSE N'ยังไม่มีหัวหน้าใหญ่'
        END,
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        CASE
          WHEN lv.evaluator_level = 1
            THEN N'ผู้ถูกประเมินรายนี้ยังไม่ได้กำหนดหัวหน้าใกล้ชิด'
          ELSE N'ผู้ถูกประเมินรายนี้ตั้งค่าให้ใช้ผู้ประเมินสองคน แต่ยังไม่ได้กำหนดหัวหน้าใหญ่'
        END,
        N'กดแก้ไขเพื่อเลือกผู้ประเมิน',
        '/admin/assignments',
        re.round_employee_id,
        lv.evaluator_level
      FROM ActiveEmployees re
      CROSS JOIN (VALUES (1), (2)) lv(evaluator_level)
      WHERE (lv.evaluator_level = 1 OR ISNULL(re.evaluator_required_type, 2) = 2)
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.competency_evaluator_assignment a
          WHERE a.round_employee_id = re.round_employee_id
            AND a.evaluator_level = lv.evaluator_level
            AND a.status_type <> 9
        )

      UNION ALL

      SELECT
        N'ผู้ประเมิน',
        'error',
        N'ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        N'ผู้ประเมินและผู้ถูกประเมินต้องเป็นคนละคนกัน',
        N'เปลี่ยนผู้ประเมินเป็นบุคคลอื่น',
        '/admin/assignments',
        re.round_employee_id,
        a.evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN ActiveEmployees re
        ON re.round_employee_id = a.round_employee_id
      WHERE a.status_type <> 9
        AND a.evaluator_payroll_no = re.payroll_no

      UNION ALL

      SELECT
        N'ผู้ประเมิน',
        'error',
        N'ผู้ประเมินไม่พร้อมใช้งาน',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(er.employee_payroll_no), er.employee_payroll_no) + N' (' + er.employee_payroll_no + N')',
        N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(er.evaluator_payroll_no), er.evaluator_payroll_no) + N' (' + er.evaluator_payroll_no + N') ไม่พบในข้อมูลบุคลากรหรือพ้นสภาพแล้ว',
        N'เลือกผู้ประเมินที่ยังปฏิบัติงานอยู่',
        '/admin/assignments',
        er.round_employee_id,
        er.evaluator_level
      FROM EvaluatorResolved er
      WHERE er.found_payroll_no IS NULL
         OR er.TERMINATEDATE IS NOT NULL

      UNION ALL

      SELECT
        N'ผู้ประเมิน',
        'error',
        N'ผู้ประเมินยังไม่มีกลุ่มระดับ',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(er.employee_payroll_no), er.employee_payroll_no) + N' (' + er.employee_payroll_no + N')',
        CASE
          WHEN er.evaluator_group_source = 'RANK'
            THEN N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(er.evaluator_payroll_no), er.evaluator_payroll_no) + N' ยังไม่สามารถจัดกลุ่มจากระดับข้าราชการได้'
          WHEN er.evaluator_first_employee_date IS NULL
            THEN N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(er.evaluator_payroll_no), er.evaluator_payroll_no) + N' ไม่มีวันเริ่มปฏิบัติงาน'
          WHEN er.evaluator_first_employee_date > er.start_date
            THEN N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(er.evaluator_payroll_no), er.evaluator_payroll_no) + N' เริ่มปฏิบัติงานหลังวันเริ่มรอบ'
          ELSE N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(er.evaluator_payroll_no), er.evaluator_payroll_no) + N' ยังไม่สามารถจัดกลุ่มจากช่วงอายุงานได้'
        END,
        CASE
          WHEN er.evaluator_group_source = 'RANK'
            THEN N'ตรวจสอบการตั้งค่าระดับข้าราชการ'
          ELSE N'ตรวจสอบวันเริ่มปฏิบัติงานและช่วงอายุงาน'
        END,
        CASE
          WHEN er.evaluator_group_source = 'RANK'
            THEN '/admin/rank-group-maps'
          ELSE '/admin/tenure-rank-groups'
        END,
        er.round_employee_id,
        er.evaluator_level
      FROM EvaluatorResolved er
      WHERE er.found_payroll_no IS NOT NULL
        AND er.TERMINATEDATE IS NULL
        AND er.evaluator_rank_group_id IS NULL

      UNION ALL

      SELECT
        N'ผู้ประเมิน',
        'error',
        N'กลุ่มระดับผู้ประเมินต่ำกว่าผู้ถูกประเมิน',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(er.employee_payroll_no), er.employee_payroll_no) + N' (' + er.employee_payroll_no + N')',
        N'ผู้ประเมิน ' + ISNULL(${ssbDb()}.dbo.GetUserFullName(er.evaluator_payroll_no), er.evaluator_payroll_no) + N' อยู่ในกลุ่มระดับต่ำกว่าผู้ถูกประเมิน',
        N'ผู้ประเมินต้องอยู่กลุ่มระดับเดียวกันหรือสูงกว่า',
        '/admin/assignments',
        er.round_employee_id,
        er.evaluator_level
      FROM EvaluatorResolved er
      JOIN dbo.competency_rank_group employee_group
        ON employee_group.rank_group_id = er.employee_rank_group_id
       AND employee_group.active_status = 1
      JOIN dbo.competency_rank_group evaluator_group
        ON evaluator_group.rank_group_id = er.evaluator_rank_group_id
       AND evaluator_group.active_status = 1
      WHERE evaluator_group.sort_order < employee_group.sort_order

      UNION ALL

      SELECT
        N'ผู้ประเมิน',
        'error',
        N'มีผู้ประเมินระดับเดียวกันซ้ำ',
        ISNULL(${ssbDb()}.dbo.GetUserFullName(re.payroll_no), re.payroll_no) + N' (' + re.payroll_no + N')',
        CASE
          WHEN a.evaluator_level = 1
            THEN N'พบหัวหน้าใกล้ชิดมากกว่า 1 รายการ'
          ELSE N'พบหัวหน้าใหญ่มากกว่า 1 รายการ'
        END,
        N'ยกเลิกรายการที่ซ้ำให้เหลือเพียงหนึ่งรายการ',
        '/admin/assignments',
        re.round_employee_id,
        a.evaluator_level
      FROM dbo.competency_evaluator_assignment a
      JOIN ActiveEmployees re
        ON re.round_employee_id = a.round_employee_id
      WHERE a.status_type <> 9
      GROUP BY re.round_employee_id, re.payroll_no, a.evaluator_level
      HAVING COUNT(*) > 1

      UNION ALL

      SELECT
        N'หัวข้อประเมิน',
        'error',
        N'หัวข้อส่วนกลางยังไม่ครบ',
        N'ข้อ ' + CAST(qn.question_no AS nvarchar(10)),
        N'ยังไม่มีหัวข้อส่วนกลางฉบับที่เปิดใช้งานสำหรับข้อนี้',
        N'หัวข้อส่วนกลางต้องครบข้อ 1 ถึงข้อ 4',
        '/admin/questions',
        CAST(NULL AS int),
        CAST(NULL AS int)
      FROM (VALUES (1), (2), (3), (4)) qn(question_no)
      WHERE NOT EXISTS (
        SELECT 1
        FROM CurrentQuestionVersion cq
        WHERE cq.question_scope = 'COMMON'
          AND cq.active_status = 1
          AND cq.fixed_question_no = qn.question_no
          AND cq.question_version_id IS NOT NULL
      )

      UNION ALL

      SELECT
        N'หัวข้อประเมิน',
        'error',
        N'หัวข้อตามวิชาชีพกำหนดไม่ครบ',
        ISNULL(NULLIF(LTRIM(RTRIM(pv.PositionName)), ''), pms.position_code),
        N'กำหนดหัวข้อเพิ่มเติมไว้ ' + CAST(pms.active_map_count AS nvarchar(10)) + N' จาก 3 ข้อ ต้องไม่กำหนดเลยหรือกำหนดให้ครบข้อ 5 ถึงข้อ 7',
        N'ตรวจสอบชุดหัวข้อตามวิชาชีพ',
        '/admin/profession-questions',
        CAST(NULL AS int),
        CAST(NULL AS int)
      FROM ProfessionMapSummary pms
      LEFT JOIN ${ssbDb()}.dbo.PositionView pv
        ON pv.PositionCode = pms.position_code
      WHERE pms.active_map_count NOT IN (0, 3)

      UNION ALL

      SELECT
        N'หัวข้อประเมิน',
        'error',
        N'หัวข้อตามวิชาชีพไม่พร้อมใช้งาน',
        ISNULL(NULLIF(LTRIM(RTRIM(pv.PositionName)), ''), pms.position_code),
        N'หัวข้อข้อ 5 ถึงข้อ 7 ต้องเป็นหัวข้อตามวิชาชีพที่เปิดใช้งานและมีฉบับปัจจุบันครบทุกข้อ',
        N'ตรวจสอบหัวข้อที่เลือกให้ครบและเปิดใช้งาน',
        '/admin/profession-questions',
        CAST(NULL AS int),
        CAST(NULL AS int)
      FROM ProfessionMapSummary pms
      LEFT JOIN ${ssbDb()}.dbo.PositionView pv
        ON pv.PositionCode = pms.position_code
      WHERE pms.active_map_count = 3
        AND (pms.valid_map_count <> 3 OR pms.distinct_slot_count <> 3)

      UNION ALL

      SELECT
        N'หัวข้อประเมิน',
        'error',
        N'หัวข้อตามวิชาชีพซ้ำกัน',
        ISNULL(NULLIF(LTRIM(RTRIM(pv.PositionName)), ''), pms.position_code),
        N'ข้อ 5 ข้อ 6 และข้อ 7 ต้องเลือกหัวข้อคนละหัวข้อกัน',
        N'แก้ไขให้ใช้หัวข้อที่แตกต่างกันทั้ง 3 ข้อ',
        '/admin/profession-questions',
        CAST(NULL AS int),
        CAST(NULL AS int)
      FROM ProfessionMapSummary pms
      LEFT JOIN ${ssbDb()}.dbo.PositionView pv
        ON pv.PositionCode = pms.position_code
      WHERE pms.active_map_count = 3
        AND pms.distinct_topic_count <> 3

      UNION ALL

      SELECT
        N'คำอธิบายหัวข้อ',
        'warning',
        N'คำอธิบายหัวข้อยังไม่ครบ',
        N'ข้อ ' + CAST(rdp.question_no AS nvarchar(10)) + N' - ' + ISNULL(rdp.question_title, N'-'),
        N'ยังไม่มีคำอธิบายสำหรับกลุ่มระดับ ' + ISNULL(rg.rank_group_name, N'-'),
        N'เพิ่มคำอธิบายให้ครบทุกกลุ่มระดับที่ใช้งานในรอบนี้',
        '/admin/questions',
        CAST(NULL AS int),
        CAST(NULL AS int)
      FROM RequiredDescriptionPairs rdp
      LEFT JOIN dbo.competency_rank_group rg
        ON rg.rank_group_id = rdp.rank_group_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.competency_question_description_version dv
        WHERE dv.question_version_id = rdp.question_version_id
          AND dv.rank_group_id = rdp.rank_group_id
          AND dv.active_status = 1
      )

      UNION ALL

      SELECT
        N'น้ำหนักผู้ประเมิน',
        'error',
        N'น้ำหนักผู้ประเมินยังไม่ครบ 100%',
        CASE
          WHEN wi.scope_value = '__NO_DIVISION__'
            THEN N'ไม่ระบุกลุ่มภารกิจ'
          ELSE
            ISNULL(
              ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)),
              wi.scope_value
            ) + N' (' + wi.scope_value + N')'
        END,
        CASE
          WHEN wi.active_row_count = 0
            THEN N'ยังไม่มีชุดน้ำหนักที่ใช้ได้สำหรับกลุ่มภารกิจนี้'
          WHEN wi.selected_rule_type = 'SPECIFIC'
            THEN
              N'ชุดเฉพาะกลุ่ม: หัวหน้าใกล้ชิด '
              + CONVERT(nvarchar(30), CAST(wi.level1_weight AS decimal(10,2)))
              + N'%, หัวหน้าใหญ่ '
              + CONVERT(nvarchar(30), CAST(wi.level2_weight AS decimal(10,2)))
              + N'%, รวม '
              + CONVERT(nvarchar(30), CAST(wi.total_weight AS decimal(10,2)))
              + N'%'
          ELSE
            N'ชุดค่าเริ่มต้น: หัวหน้าใกล้ชิด '
            + CONVERT(nvarchar(30), CAST(wi.level1_weight AS decimal(10,2)))
            + N'%, หัวหน้าใหญ่ '
            + CONVERT(nvarchar(30), CAST(wi.level2_weight AS decimal(10,2)))
            + N'%, รวม '
            + CONVERT(nvarchar(30), CAST(wi.total_weight AS decimal(10,2)))
            + N'%'
        END,
        N'กลุ่มนี้มีผู้ถูกประเมินที่ใช้หัวหน้าสองระดับ จึงต้องมีน้ำหนักครบทั้งสองระดับและรวมเท่ากับ 100%',
        '/admin/evaluator-weights',
        CAST(NULL AS int),
        CAST(NULL AS int)
      FROM WeightIssues wi
      LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
        ON ds.CODE = wi.scope_value
       AND ds.CTRLCODE = '10028'
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

function bindIssueFilterInputs(
  request: any,
  roundId: number,
  state: IssueTableState,
) {
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
  const result = await pool.request().input("round_id", sql.Int, roundId)
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
  const defaultRound =
    rounds.find((round) => round.status_type === 0) || rounds[0];

  const requestedRoundId = Number(
    nextState.roundId || defaultRound?.round_id || 0,
  );
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
    search: String(nextState.search || "")
      .trim()
      .slice(0, 100),
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

export default async function RoundIssuesPage({
  searchParams,
}: RoundIssuesPageProps) {
  await requireAdminSession();

  const params = await searchParams;
  const rounds = await getRounds();
  const defaultRound =
    rounds.find((round) => round.status_type === 0) || rounds[0];
  const tableState = await readTableState(Number(defaultRound?.round_id || 0));
  const selectedRoundId = Number(
    tableState.roundId || defaultRound?.round_id || 0,
  );
  const selectedRound = rounds.find(
    (round) => Number(round.round_id) === selectedRoundId,
  );
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
        type={
          params?.alert_type as
            "success" | "error" | "warning" | "info" | undefined
        }
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