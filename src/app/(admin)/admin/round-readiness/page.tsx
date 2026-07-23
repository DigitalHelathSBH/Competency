import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import {
  getDbPool,
  getSsbDatabaseName,
  quoteSqlName,
  sql,
} from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const READINESS_ROUND_COOKIE =
  "performance_round_readiness_round_id";

type RoundRow = {
  round_id: number;
  round_code: string;
  round_year: number;
  round_no: number;
  status_type: number;
  competency_status_type: number;
  kpi_status_type: number;
};

type IssueLevel =
  | "error"
  | "warning"
  | "info";

type IssueRow = {
  module_type: "COMPETENCY" | "KPI";
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

type ModuleSummary = {
  moduleType: "COMPETENCY" | "KPI";
  statusType: number;
  totalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  canOpen: boolean;
  problems: IssueRow[];
};

type ReadinessData = {
  round: RoundRow | null;
  totalEmployees: number;
  competency: ModuleSummary;
  kpi: ModuleSummary;
};

type ModuleSummaryRecord = {
  module_type?: string;
  total_count?: number;
  error_count?: number;
  warning_count?: number;
  info_count?: number;
};

type EmployeeCountRecord = {
  total_employees?: number;
};

function ssbDb() {
  return quoteSqlName(
    getSsbDatabaseName(),
  );
}

function moduleStatusText(
  statusType: number,
) {
  if (statusType === 0) {
    return "ยังไม่เปิด";
  }

  if (statusType === 1) {
    return "เปิดประเมิน";
  }

  if (statusType === 2) {
    return "ปิดประเมิน";
  }

  return `สถานะ ${statusType}`;
}

function roundStatusText(
  statusType: number,
) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) {
    return "กำลังประเมิน";
  }
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";

  return `สถานะ ${statusType}`;
}

function getMenuLabel(path: string) {
  const menuMap: Record<string, string> = {
    "/admin/rounds": "รอบประเมิน",
    "/admin/round-readiness":
      "ตรวจสอบความพร้อมเปิดรอบ",
    "/admin/round-issues":
      "รายการที่ต้องแก้ไข",
    "/admin/round-employees":
      "ผู้ถูกประเมิน",
    "/admin/rank-groups":
      "กลุ่มระดับ",
    "/admin/rank-group-maps":
      "ระดับข้าราชการ",
    "/admin/tenure-rank-groups":
      "ช่วงอายุงาน",
    "/admin/site-percents":
      "เปอร์เซ็นต์ Competency",
    "/admin/assignments":
      "กำหนดผู้ประเมิน",
    "/admin/evaluator-weights":
      "น้ำหนักผู้ประเมิน",
    "/admin/questions":
      "หัวข้อประเมิน",
    "/admin/profession-questions":
      "หัวข้อประเมินตามวิชาชีพ",
    "/admin/kpi-employee-forms":
      "กำหนดแบบฟอร์ม KPI",
    "/admin/kpi-assignments":
      "กำหนดผู้ประเมิน KPI",
    "/admin/kpi-forms":
      "แบบฟอร์ม KPI",
    "/admin/kpi-indicators":
      "ตัวชี้วัด KPI",
  };

  return menuMap[path] || path;
}

function emptyModuleSummary(
  moduleType: "COMPETENCY" | "KPI",
  statusType = 0,
): ModuleSummary {
  return {
    moduleType,
    statusType,
    totalCount: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    canOpen: false,
    problems: [],
  };
}

async function getRounds() {
  const pool = await getDbPool();

  const result =
    await pool.request().query(`
      SELECT
        r.round_id,
        r.round_year,
        r.round_no,
        r.round_code,
        r.status_type,

        ISNULL(
          MAX(
            CASE
              WHEN m.module_type =
                   'COMPETENCY'
              THEN m.status_type
            END
          ),
          0
        ) AS competency_status_type,

        ISNULL(
          MAX(
            CASE
              WHEN m.module_type = 'KPI'
              THEN m.status_type
            END
          ),
          0
        ) AS kpi_status_type

      FROM dbo.competency_round r

      LEFT JOIN
        dbo.performance_round_module m
        ON m.round_id = r.round_id

      WHERE r.status_type <> 9

      GROUP BY
        r.round_id,
        r.round_year,
        r.round_no,
        r.round_code,
        r.status_type

      ORDER BY
        CASE
          WHEN r.status_type = 0 THEN 0
          ELSE 1
        END,
        r.round_year DESC,
        r.round_no DESC,
        r.round_id DESC;
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
    RelevantPayroll AS (
      SELECT
        LTRIM(
          RTRIM(
            CAST(
              re.payroll_no AS varchar(20)
            )
          )
        ) AS payroll_no
      FROM ActiveEmployees re

      UNION

      SELECT
        LTRIM(
          RTRIM(
            a.evaluator_payroll_no
          )
        )
      FROM dbo.competency_evaluator_assignment a
      JOIN ActiveEmployees re
        ON re.round_employee_id =
           a.round_employee_id
      WHERE a.status_type <> 9
        AND a.evaluator_payroll_no
            IS NOT NULL

      UNION

      SELECT
        LTRIM(
          RTRIM(
            k.evaluator_payroll_no
          )
        )
      FROM dbo.kpi_evaluator_assignment k
      JOIN ActiveEmployees re
        ON re.round_employee_id =
           k.round_employee_id
      WHERE k.status_type = 0
        AND k.evaluator_payroll_no
            IS NOT NULL
    ),
    PyrextRanked AS (
      SELECT
        rp.payroll_no,
        p.PAYROLLNO,
        p.TERMINATEDATE,
        p.[RANK],
        p.SITECODE,
        p.FIRSTEMPLOYEEDATE,

        NULLIF(
          LTRIM(
            RTRIM(
              ISNULL(
                ${ssbDb()}.dbo.GetSSBName(
                  p.FIRSTTHAINAME
                ),
                N''
              )
              + N' '
              + ISNULL(
                  ${ssbDb()}.dbo.GetSSBName(
                    p.LASTTHAINAME
                  ),
                  N''
                )
            )
          ),
          N''
        ) AS full_name,

        ROW_NUMBER() OVER
        (
          PARTITION BY rp.payroll_no
          ORDER BY
            CASE
              WHEN p.TERMINATEDATE IS NULL
              THEN 0
              ELSE 1
            END,
            TRY_CONVERT(
              date,
              p.TERMINATEDATE
            ) DESC,
            TRY_CONVERT(
              date,
              p.FIRSTEMPLOYEEDATE
            ) DESC
        ) AS row_no

      FROM RelevantPayroll rp

      LEFT JOIN ${ssbDb()}.dbo.PYREXT p
        ON LTRIM(
             RTRIM(
               CAST(
                 p.PAYROLLNO
                 AS varchar(20)
               )
             )
           ) = rp.payroll_no
    ),
    PyrextResolved AS (
      SELECT
        payroll_no,
        PAYROLLNO,
        TERMINATEDATE,
        [RANK],
        SITECODE,
        FIRSTEMPLOYEEDATE,
        full_name
      FROM PyrextRanked
      WHERE row_no = 1
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
      LEFT JOIN PyrextResolved p
        ON p.payroll_no =
           LTRIM(
             RTRIM(
               a.evaluator_payroll_no
             )
           )
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
    CompetencyIssueSource AS (
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.employee_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.employee_payroll_no) + N' (' + er.employee_payroll_no + N')',
        N'ผู้ประเมิน ' + ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.evaluator_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.evaluator_payroll_no) + N' (' + er.evaluator_payroll_no + N') ไม่พบในข้อมูลบุคลากรหรือพ้นสภาพแล้ว',
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
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.employee_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.employee_payroll_no) + N' (' + er.employee_payroll_no + N')',
        CASE
          WHEN er.evaluator_group_source = 'RANK'
            THEN N'ผู้ประเมิน ' + ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.evaluator_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.evaluator_payroll_no) + N' ยังไม่สามารถจัดกลุ่มจากระดับข้าราชการได้'
          WHEN er.evaluator_first_employee_date IS NULL
            THEN N'ผู้ประเมิน ' + ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.evaluator_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.evaluator_payroll_no) + N' ไม่มีวันเริ่มปฏิบัติงาน'
          WHEN er.evaluator_first_employee_date > er.start_date
            THEN N'ผู้ประเมิน ' + ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.evaluator_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.evaluator_payroll_no) + N' เริ่มปฏิบัติงานหลังวันเริ่มรอบ'
          ELSE N'ผู้ประเมิน ' + ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      er.evaluator_payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), er.evaluator_payroll_no) + N' ยังไม่สามารถจัดกลุ่มจากช่วงอายุงานได้'
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
        N'มีผู้ประเมินระดับเดียวกันซ้ำ',
        ISNULL((
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ), re.payroll_no) + N' (' + re.payroll_no + N')',
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

    ),
    KpiIssueSource AS
    (
      SELECT
        N'ผู้ถูกประเมิน KPI' AS issue_type,
        'error' AS issue_level,
        N'ยังไม่มีผู้ถูกประเมินในรอบ' AS issue_title,
        N'รอบ ' + ISNULL(ri.round_code, N'-') AS person_text,
        N'ต้องมีผู้ถูกประเมินอย่างน้อย 1 คนก่อนเปิด KPI' AS detail_text,
        N'เพิ่มผู้ถูกประเมินในรอบนี้' AS reference_text,
        '/admin/round-employees' AS menu_path,
        CAST(NULL AS int) AS fix_round_employee_id,
        CAST(NULL AS int) AS fix_evaluator_level
      FROM RoundInfo ri
      WHERE NOT EXISTS
      (
        SELECT 1
        FROM ActiveEmployees
      )

      UNION ALL

      SELECT
        N'สัดส่วนคะแนน',
        'error',
        N'สัดส่วน Competency ไม่ถูกต้อง',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'ค่า Competency ต้องอยู่ระหว่าง 0 ถึง 100 และ KPI จะคำนวณจาก 100 ลบค่า Competency',
        N'competency_percent: '
          + ISNULL(
              CONVERT(
                nvarchar(30),
                CAST(re.competency_percent AS decimal(10,2))
              ),
              N'-'
            ),
        '/admin/site-percents',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE re.competency_percent IS NULL
         OR re.competency_percent < 0
         OR re.competency_percent > 100

      UNION ALL

      SELECT
        N'แบบฟอร์ม KPI',
        'error',
        N'ยังไม่ได้กำหนดแบบฟอร์ม KPI',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'ผู้ถูกประเมินยังไม่มีแบบฟอร์ม KPI ที่ใช้งานอยู่ในรอบนี้',
        N'กำหนดแบบฟอร์ม KPI ให้บุคลากรรายนี้',
        '/admin/kpi-employee-forms',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE NOT EXISTS
      (
        SELECT 1
        FROM dbo.kpi_employee_form ef
        WHERE ef.round_employee_id = re.round_employee_id
          AND ef.status_type = 0
      )

      UNION ALL

      SELECT
        N'แบบฟอร์ม KPI',
        'error',
        N'แบบฟอร์ม KPI ยังไม่พร้อมใช้งาน',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'แบบฟอร์มต้องเปิดใช้งาน มีตัวชี้วัดอย่างน้อย 1 รายการ และน้ำหนักรวมเท่ากับ 100%',
        ISNULL(f.form_code, N'-')
          + N' - '
          + ISNULL(f.form_name, N'-'),
        '/admin/kpi-forms',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_employee_form ef
        ON ef.round_employee_id = re.round_employee_id
       AND ef.status_type = 0
      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id = ef.form_version_id
      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id
      OUTER APPLY
      (
        SELECT
          COUNT(*) AS item_count,
          ISNULL(SUM(fi.weight_percent), 0) AS item_weight
        FROM dbo.kpi_form_item fi
        WHERE fi.form_version_id = fv.form_version_id
      ) form_item_summary
      WHERE f.active_status <> 1
         OR fv.status_type <> 1
         OR fv.total_weight_percent <> 100
         OR ISNULL(form_item_summary.item_count, 0) = 0
         OR ISNULL(form_item_summary.item_weight, 0) <> 100

      UNION ALL

      SELECT
        N'แบบฟอร์ม KPI',
        'error',
        N'แบบฟอร์ม KPI ไม่ครอบคลุมกลุ่มงาน',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'แบบฟอร์มนี้กำหนดให้ใช้เฉพาะบางกลุ่มงาน แต่ไม่พบกลุ่มงานของผู้ถูกประเมินในขอบเขตแบบฟอร์ม',
        ISNULL(f.form_code, N'-')
          + N' / division_code: '
          + ISNULL(re.division_code, N'-'),
        '/admin/kpi-forms',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_employee_form ef
        ON ef.round_employee_id = re.round_employee_id
       AND ef.status_type = 0
      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id = ef.form_version_id
      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id
      WHERE fv.scope_type = 2
        AND NOT EXISTS
        (
          SELECT 1
          FROM dbo.kpi_form_scope fs
          WHERE fs.form_version_id = fv.form_version_id
            AND LTRIM(RTRIM(fs.division_code))
                = LTRIM(RTRIM(ISNULL(re.division_code, '')))
        )

      UNION ALL

      SELECT
        N'ตัวชี้วัด KPI',
        'error',
        N'ตัวชี้วัดหรือเกณฑ์คะแนนยังไม่พร้อม',
        ISNULL(f.form_code, N'-')
          + N' - '
          + ISNULL(f.form_name, N'-'),
        N'พบตัวชี้วัดที่ไม่ได้เปิดใช้งาน หรือยังไม่มีเกณฑ์คะแนนอย่างน้อย 1 ระดับ',
        N'ตรวจตัวชี้วัดทุกข้อในแบบฟอร์ม',
        '/admin/kpi-indicators',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_employee_form ef
        ON ef.round_employee_id = re.round_employee_id
       AND ef.status_type = 0
      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id = ef.form_version_id
      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id
      WHERE EXISTS
      (
        SELECT 1
        FROM dbo.kpi_form_item fi
        JOIN dbo.kpi_indicator_version iv
          ON iv.indicator_version_id = fi.indicator_version_id
        JOIN dbo.kpi_indicator i
          ON i.indicator_id = iv.indicator_id
        WHERE fi.form_version_id = fv.form_version_id
          AND
          (
            iv.status_type <> 1
            OR i.active_status <> 1
            OR NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_indicator_rule ir
              WHERE ir.indicator_version_id = iv.indicator_version_id
            )
          )
      )

      UNION ALL

      SELECT
        N'ผู้ประเมิน KPI',
        'error',
        N'ยังไม่มีผู้ประเมิน KPI',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'ผู้ถูกประเมินยังไม่มีผู้ประเมิน KPI ที่ใช้งานอยู่',
        N'กำหนดผู้ประเมิน KPI น้ำหนัก 100%',
        '/admin/kpi-assignments',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      WHERE NOT EXISTS
      (
        SELECT 1
        FROM dbo.kpi_evaluator_assignment k
        WHERE k.round_employee_id = re.round_employee_id
          AND k.status_type = 0
      )

      UNION ALL

      SELECT
        N'ผู้ประเมิน KPI',
        'error',
        N'ผู้ประเมิน KPI เป็นคนเดียวกับผู้ถูกประเมิน',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'ไม่อนุญาตให้ประเมิน KPI ของตนเอง',
        N'evaluator: ' + ISNULL(k.evaluator_payroll_no, N'-'),
        '/admin/kpi-assignments',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_evaluator_assignment k
        ON k.round_employee_id = re.round_employee_id
       AND k.status_type = 0
      WHERE LTRIM(RTRIM(k.evaluator_payroll_no))
          = LTRIM(RTRIM(re.payroll_no))

      UNION ALL

      SELECT
        N'ผู้ประเมิน KPI',
        'error',
        N'ไม่พบผู้ประเมิน KPI ที่ยังปฏิบัติงาน',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'ผู้ประเมิน KPI พ้นสภาพหรือไม่พบข้อมูลบุคลากรปัจจุบัน',
        N'evaluator: ' + ISNULL(k.evaluator_payroll_no, N'-'),
        '/admin/kpi-assignments',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_evaluator_assignment k
        ON k.round_employee_id = re.round_employee_id
       AND k.status_type = 0
      LEFT JOIN ${ssbDb()}.dbo.PYREXT p
        ON CAST(p.PAYROLLNO AS varchar(20))
           = k.evaluator_payroll_no
      WHERE p.PAYROLLNO IS NULL
         OR p.TERMINATEDATE IS NOT NULL

      UNION ALL

      SELECT
        N'ผู้ประเมิน KPI',
        'error',
        N'น้ำหนักผู้ประเมิน KPI ไม่เท่ากับ 100%',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'ผู้ประเมิน KPI ต้องมีน้ำหนัก 100%',
        N'weight_percent: '
          + CONVERT(nvarchar(20), ISNULL(k.weight_percent, 0)),
        '/admin/kpi-assignments',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_evaluator_assignment k
        ON k.round_employee_id = re.round_employee_id
       AND k.status_type = 0
      WHERE ISNULL(k.weight_percent, 0) <> 100

      UNION ALL

      SELECT
        N'ผู้ประเมิน KPI',
        'error',
        N'ผู้ประเมิน KPI อัตโนมัติไม่ตรงกับหัวหน้าใกล้ชิด',
        ISNULL(
          (
          SELECT TOP (1)
            resolved_name.full_name
          FROM PyrextResolved
            resolved_name
          WHERE resolved_name.payroll_no =
                LTRIM(
                  RTRIM(
                    CAST(
                      re.payroll_no
                      AS varchar(20)
                    )
                  )
                )
        ),
          re.payroll_no
        ) + N' (' + re.payroll_no + N')',
        N'รายการที่สร้างอัตโนมัติต้องอ้างอิงหัวหน้าใกล้ชิด Competency ระดับ 1 คนเดียวกัน',
        N'evaluator: ' + ISNULL(k.evaluator_payroll_no, N'-'),
        '/admin/kpi-assignments',
        re.round_employee_id,
        CAST(NULL AS int)
      FROM ActiveEmployees re
      JOIN dbo.kpi_evaluator_assignment k
        ON k.round_employee_id = re.round_employee_id
       AND k.status_type = 0
       AND k.assignment_source_type = 'AUTO_COMPETENCY'
      WHERE k.source_competency_assignment_id IS NULL
         OR NOT EXISTS
         (
           SELECT 1
           FROM dbo.competency_evaluator_assignment ca
           WHERE ca.assignment_id = k.source_competency_assignment_id
             AND ca.round_employee_id = k.round_employee_id
             AND ca.evaluator_level = 1
             AND ca.status_type <> 9
             AND LTRIM(RTRIM(ca.evaluator_payroll_no))
                 = LTRIM(RTRIM(k.evaluator_payroll_no))
         )
    ),
    IssueSource AS
    (
      SELECT
        'COMPETENCY' AS module_type,
        issue_type,
        issue_level,
        issue_title,
        person_text,
        detail_text,
        reference_text,
        menu_path,
        fix_round_employee_id,
        fix_evaluator_level
      FROM CompetencyIssueSource

      UNION ALL

      SELECT
        'KPI' AS module_type,
        issue_type,
        issue_level,
        issue_title,
        person_text,
        detail_text,
        reference_text,
        menu_path,
        fix_round_employee_id,
        fix_evaluator_level
      FROM KpiIssueSource

    )
  `;
}

async function getReadinessData(
  round: RoundRow | null,
): Promise<ReadinessData> {
  if (!round) {
    return {
      round: null,
      totalEmployees: 0,
      competency:
        emptyModuleSummary(
          "COMPETENCY",
        ),
      kpi: emptyModuleSummary("KPI"),
    };
  }

  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "round_id",
      sql.Int,
      round.round_id,
    )
    .query(`
      DECLARE @IssueSource TABLE
      (
        module_type varchar(20) NOT NULL,
        issue_type nvarchar(100) NOT NULL,
        issue_level varchar(20) NOT NULL,
        issue_title nvarchar(500) NOT NULL,
        person_text nvarchar(1000) NULL,
        detail_text nvarchar(max) NULL,
        reference_text nvarchar(max) NULL,
        menu_path varchar(200) NULL,
        fix_round_employee_id int NULL,
        fix_evaluator_level int NULL
      );

      ${getIssueSourceSql()}

      INSERT INTO @IssueSource
      (
        module_type,
        issue_type,
        issue_level,
        issue_title,
        person_text,
        detail_text,
        reference_text,
        menu_path,
        fix_round_employee_id,
        fix_evaluator_level
      )
      SELECT
        module_type,
        issue_type,
        issue_level,
        issue_title,
        person_text,
        detail_text,
        reference_text,
        menu_path,
        fix_round_employee_id,
        fix_evaluator_level
      FROM IssueSource;

      SELECT
        module_type,
        COUNT(*) AS total_count,
        SUM(
          CASE
            WHEN issue_level = 'error'
            THEN 1
            ELSE 0
          END
        ) AS error_count,
        SUM(
          CASE
            WHEN issue_level = 'warning'
            THEN 1
            ELSE 0
          END
        ) AS warning_count,
        SUM(
          CASE
            WHEN issue_level = 'info'
            THEN 1
            ELSE 0
          END
        ) AS info_count
      FROM @IssueSource
      GROUP BY module_type;

      SELECT TOP (50)
        module_type,
        issue_type,
        issue_level,
        issue_title,
        person_text,
        detail_text,
        reference_text,
        menu_path,
        fix_round_employee_id,
        fix_evaluator_level
      FROM @IssueSource
      WHERE module_type = 'COMPETENCY'
      ORDER BY
        CASE issue_level
          WHEN 'error' THEN 1
          WHEN 'warning' THEN 2
          ELSE 3
        END,
        issue_type,
        issue_title,
        person_text;

      SELECT TOP (50)
        module_type,
        issue_type,
        issue_level,
        issue_title,
        person_text,
        detail_text,
        reference_text,
        menu_path,
        fix_round_employee_id,
        fix_evaluator_level
      FROM @IssueSource
      WHERE module_type = 'KPI'
      ORDER BY
        CASE issue_level
          WHEN 'error' THEN 1
          WHEN 'warning' THEN 2
          ELSE 3
        END,
        issue_type,
        issue_title,
        person_text;

      SELECT COUNT(*) AS total_employees
      FROM dbo.competency_round_employee
      WHERE round_id = @round_id
        AND status_type <> 9;
    `);

  /*
    mssql กำหนดชนิด result.recordsets ได้ทั้งแบบ Object และ Array
    จึงแปลงเป็น Tuple ให้ตรงกับ SELECT ทั้ง 4 ชุดของ Query นี้
  */
  const recordsets =
    result.recordsets as unknown as [
      ModuleSummaryRecord[],
      IssueRow[],
      IssueRow[],
      EmployeeCountRecord[],
    ];

  const summaryRows =
    recordsets[0] ?? [];
  const competencyProblems =
    recordsets[1] ?? [];
  const kpiProblems =
    recordsets[2] ?? [];
  const employeeRow =
    recordsets[3]?.[0] ?? {};

  function buildSummary(
    moduleType: "COMPETENCY" | "KPI",
    statusType: number,
    problems: IssueRow[],
  ): ModuleSummary {
    const summary = summaryRows.find(
      (row: Record<string, unknown>) =>
        String(row.module_type) ===
        moduleType,
    );

    const errorCount = Number(
      summary?.error_count || 0,
    );

    return {
      moduleType,
      statusType,
      totalCount: Number(
        summary?.total_count || 0,
      ),
      errorCount,
      warningCount: Number(
        summary?.warning_count || 0,
      ),
      infoCount: Number(
        summary?.info_count || 0,
      ),
      canOpen:
        statusType === 0 &&
        errorCount === 0,
      problems,
    };
  }

  return {
    round,
    totalEmployees: Number(
      employeeRow.total_employees || 0,
    ),
    competency: buildSummary(
      "COMPETENCY",
      Number(
        round.competency_status_type,
      ),
      competencyProblems,
    ),
    kpi: buildSummary(
      "KPI",
      Number(round.kpi_status_type),
      kpiProblems,
    ),
  };
}

function statusBadgeClass(
  statusType: number,
) {
  if (statusType === 1) {
    return "bg-[#1ab394]/10 text-[#1ab394]";
  }

  if (statusType === 2) {
    return "bg-[#23c6c8]/10 text-[#23c6c8]";
  }

  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
}

function issueBadgeClass(
  level: IssueLevel,
) {
  if (level === "error") {
    return "bg-[#ed5565]/10 text-[#ed5565]";
  }

  if (level === "warning") {
    return "bg-[#f8ac59]/10 text-[#f8ac59]";
  }

  return "bg-[#23c6c8]/10 text-[#23c6c8]";
}

function issueLevelText(
  level: IssueLevel,
) {
  if (level === "error") {
    return "ต้องแก้";
  }

  if (level === "warning") {
    return "ควรตรวจ";
  }

  return "ข้อมูล";
}

function ModuleReadinessCard({
  title,
  summary,
}: {
  title: string;
  summary: ModuleSummary;
}) {
  const alreadyOpened =
    summary.statusType === 1;
  const alreadyClosed =
    summary.statusType === 2;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h2>

          <span
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(
              summary.statusType,
            )}`}
          >
            {moduleStatusText(
              summary.statusType,
            )}
          </span>
        </div>

        {alreadyOpened ? (
          <span className="inline-flex rounded-full bg-[#1ab394]/10 px-4 py-2 text-sm font-medium text-[#1ab394]">
            เปิดใช้งานอยู่
          </span>
        ) : alreadyClosed ? (
          <span className="inline-flex rounded-full bg-[#23c6c8]/10 px-4 py-2 text-sm font-medium text-[#23c6c8]">
            ปิดประเมินแล้ว
          </span>
        ) : summary.canOpen ? (
          <span className="inline-flex rounded-full bg-[#1ab394]/10 px-4 py-2 text-sm font-medium text-[#1ab394]">
            พร้อมเปิด
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-[#ed5565]/10 px-4 py-2 text-sm font-medium text-[#ed5565]">
            ยังไม่พร้อมเปิด
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ทั้งหมด
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
            {summary.totalCount.toLocaleString(
              "th-TH",
            )}
          </p>
        </div>

        <div className="rounded-xl bg-[#ed5565]/5 p-3">
          <p className="text-xs text-[#ed5565]">
            ต้องแก้
          </p>
          <p className="mt-1 text-xl font-semibold text-[#ed5565]">
            {summary.errorCount.toLocaleString(
              "th-TH",
            )}
          </p>
        </div>

        <div className="rounded-xl bg-[#f8ac59]/5 p-3">
          <p className="text-xs text-[#f8ac59]">
            ควรตรวจ
          </p>
          <p className="mt-1 text-xl font-semibold text-[#f8ac59]">
            {summary.warningCount.toLocaleString(
              "th-TH",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProblemTable({
  title,
  moduleType,
  rows,
}: {
  title: string;
  moduleType: "COMPETENCY" | "KPI";
  rows: IssueRow[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h2>

          <span
            className={
              moduleType === "COMPETENCY"
                ? "rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                : "rounded-full bg-[#23c6c8]/10 px-3 py-1 text-xs font-medium text-[#23c6c8]"
            }
          >
            {moduleType ===
            "COMPETENCY"
              ? "Competency"
              : "KPI"}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[#1ab394]">
          ไม่พบรายการที่ต้องแก้ไข
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {[
                  "ระดับ",
                  "ประเภท",
                  "รายการ",
                  "รายละเอียด",
                  "จัดการ",
                ].map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map(
                (problem, index) => (
                  <tr
                    key={`${problem.issue_type}-${problem.issue_title}-${problem.person_text}-${index}`}
                    className="align-top"
                  >
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${issueBadgeClass(
                          problem.issue_level,
                        )}`}
                      >
                        {issueLevelText(
                          problem.issue_level,
                        )}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {problem.issue_type}
                    </td>

                    <td className="max-w-sm px-4 py-4">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {problem.issue_title}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {problem.person_text}
                      </p>
                    </td>

                    <td className="max-w-xl px-4 py-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
                      <p>
                        {problem.detail_text}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {problem.reference_text}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <Link
                        href={problem.menu_path}
                        className="inline-flex rounded-lg border border-brand-500 px-3 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-500/10"
                      >
                        ไปที่เมนู{" "}
                        {getMenuLabel(
                          problem.menu_path,
                        )}
                      </Link>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {rows.length >= 50 && (
        <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          แสดง 50 รายการแรก
          สามารถดูทั้งหมดได้ที่เมนูรายการที่ต้องแก้ไข
        </div>
      )}
    </div>
  );
}

export default async function RoundReadinessPage() {
  await requireAdminSession();

  const rounds = await getRounds();
  const cookieStore = await cookies();

  const cookieRoundId = Number(
    cookieStore.get(
      READINESS_ROUND_COOKIE,
    )?.value || 0,
  );

  const selectedRound =
    rounds.find(
      (round) =>
        round.round_id ===
        cookieRoundId,
    ) ||
    rounds.find(
      (round) =>
        round.status_type === 0,
    ) ||
    rounds[0] ||
    null;

  const readiness =
    await getReadinessData(
      selectedRound,
    );

  async function selectRoundAction(
    formData: FormData,
  ) {
    "use server";

    await requireAdminSession();

    const roundId = Number(
      formData.get("round_id") || 0,
    );

    const availableRounds =
      await getRounds();

    const allowed =
      availableRounds.some(
        (round) =>
          round.round_id === roundId,
      );

    const currentCookieStore =
      await cookies();

    if (allowed) {
      currentCookieStore.set(
        READINESS_ROUND_COOKIE,
        String(roundId),
        {
          httpOnly: true,
          sameSite: "lax",
          secure:
            process.env.NODE_ENV ===
            "production",
          maxAge: 60 * 60 * 8,
          path: "/",
        },
      );
    } else {
      currentCookieStore.delete(
        READINESS_ROUND_COOKIE,
      );
    }

    redirect(
      "/admin/round-readiness",
    );
  }

  return (
    <div>
      <PageHeader
        title="ตรวจสอบความพร้อมเปิดรอบ"
        description="ตรวจ Competency และ KPI แยกกันภายในรอบเดียว โดยไม่แก้ไขข้อมูลตั้งค่าที่มีอยู่"
      />

      <ActionAlert
        type="info"
        message="หน้านี้อ่านและตรวจสอบข้อมูลเท่านั้น การเปิด Competency หรือ KPI ให้ดำเนินการจากเมนูรอบประเมิน"
      />

      {rounds.length === 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-200">
          ยังไม่มีรอบประเมิน
          กรุณาสร้างรอบประเมินก่อน
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <form
              action={selectRoundAction}
              className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end"
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  รอบประเมิน
                </label>

                <select
                  name="round_id"
                  defaultValue={
                    selectedRound
                      ?.round_id || ""
                  }
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  {rounds.map(
                    (round) => (
                      <option
                        key={
                          round.round_id
                        }
                        value={
                          round.round_id
                        }
                      >
                        {round.round_code} (
                        {roundStatusText(
                          round.status_type,
                        )}
                        )
                      </option>
                    ),
                  )}
                </select>
              </div>

              <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
              >
                ตรวจสอบรอบนี้
              </button>
            </form>
          </div>

          <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  รอบ{" "}
                  {readiness.round
                    ?.round_code || "-"}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  สถานะรอบ:{" "}
                  {readiness.round
                    ? roundStatusText(
                        readiness.round
                          .status_type,
                      )
                    : "-"}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-900/50">
                <span className="text-gray-500 dark:text-gray-400">
                  ผู้ถูกประเมิน:
                </span>{" "}
                <span className="font-semibold text-gray-800 dark:text-white/90">
                  {readiness.totalEmployees.toLocaleString(
                    "th-TH",
                  )}{" "}
                  คน
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ModuleReadinessCard
              title="Competency"
              summary={
                readiness.competency
              }
            />

            <ModuleReadinessCard
              title="KPI"
              summary={readiness.kpi}
            />
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <Link
              href="/admin/rounds"
              className="inline-flex h-10 items-center rounded-lg bg-[#1ab394] px-4 text-sm font-medium text-white hover:bg-[#18a689]"
            >
              ไปเปิดหรือปิดโมดูล
            </Link>

            <Link
              href="/admin/round-issues"
              className="inline-flex h-10 items-center rounded-lg bg-[#23c6c8] px-4 text-sm font-medium text-white hover:bg-[#1fb5b7]"
            >
              ดูรายการที่ต้องแก้ไขทั้งหมด
            </Link>
          </div>

          <div className="space-y-6">
            <ProblemTable
              title="ปัญหาความพร้อม Competency"
              moduleType="COMPETENCY"
              rows={
                readiness.competency
                  .problems
              }
            />

            <ProblemTable
              title="ปัญหาความพร้อม KPI"
              moduleType="KPI"
              rows={
                readiness.kpi.problems
              }
            />
          </div>
        </>
      )}
    </div>
  );
}