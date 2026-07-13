import ActionAlert from "@/components/competency/ActionAlert";
import AssignmentBulkForm from "@/components/competency/AssignmentBulkForm";
import AssignmentForm from "@/components/competency/AssignmentForm";
import AssignmentsTableClient from "@/components/competency/AssignmentsTableClient";
import PageHeader from "@/components/competency/PageHeader";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type RoundRow = {
  round_id: number;
  round_code: string;
  status_type: number;
};

type RoundEmployeeOptionRow = {
  round_employee_id: number;
  round_id: number;
  payroll_no: string;
  employee_full_name: string;
  position_code: string | null;
  position_name: string | null;
  rank_code: string | null;
  rank_name: string | null;
  rank_group_name: string | null;
  rank_order: number;
  division_code: string | null;
  division_name: string | null;
};

type EvaluatorOptionRow = {
  payroll_no: string;
  evaluator_full_name: string;
  position_code: string | null;
  position_name: string | null;
  rank_code: string | null;
  rank_name: string | null;
  rank_group_name: string | null;
  rank_order: number;
  division_code: string | null;
  division_name: string | null;
};

type AssignmentsPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

type AssignmentPrefillCookie = {
  round_employee_id?: number;
  evaluator_level?: number;
  created_at?: number;
};

type AssignmentEditCookie = {
  assignment_id?: number;
  created_at?: number;
};

type ExistingAssignmentRule = {
  assignment_id: number;
  round_employee_id: number;
  evaluator_payroll_no: string;
  evaluator_level: number;
};

type AssignmentTableState = {
  page: number;
  pageSize: number;
  search: string;
  roundId: string;
  divisionCode: string;
  level: string;
  status: string;
};

type AssignmentTableRow = {
  round_employee_id: number;
  round_id: number;
  round_code: string;
  round_status_type: number;
  employee_payroll_no: string;
  employee_full_name: string;
  employee_division_code: string | null;
  employee_division_name: string | null;
  level1_assignment_id: number | null;
  level1_evaluator_payroll_no: string | null;
  level1_evaluator_full_name: string | null;
  level1_evaluation_status_type: number | null;
  level2_assignment_id: number | null;
  level2_evaluator_payroll_no: string | null;
  level2_evaluator_full_name: string | null;
  level2_evaluation_status_type: number | null;
  evaluator_required_type: number;
  has_cancelled_assignment: number;
};

type AssignmentTablePageResult = {
  rows: AssignmentTableRow[];
  totalRows: number;
};

type DivisionOptionRow = {
  division_code: string;
  division_name: string;
};

const ASSIGNMENTS_TABLE_COOKIE = "competency_assignments_table_v2";

const DEFAULT_TABLE_STATE: AssignmentTableState = {
  page: 1,
  pageSize: 25,
  search: "",
  roundId: "",
  divisionCode: "",
  level: "",
  status: "active",
};

function normalizeTableState(
  value: Partial<AssignmentTableState> | null | undefined,
) {
  const pageSize = [25, 50, 100].includes(Number(value?.pageSize))
    ? Number(value?.pageSize)
    : DEFAULT_TABLE_STATE.pageSize;

  const level = String(value?.level || "").trim();
  const status = String(value?.status || "").trim();

  return {
    page: Math.max(1, Number(value?.page || DEFAULT_TABLE_STATE.page)),
    pageSize,
    search: String(value?.search || "")
      .trim()
      .slice(0, 100),
    roundId: String(value?.roundId || "").trim(),
    divisionCode: String(value?.divisionCode || "").trim(),
    level: ["1", "2", "missing1", "missing2"].includes(level) ? level : "",
    status: ["active", "inactive"].includes(status)
      ? status
      : DEFAULT_TABLE_STATE.status,
  };
}

async function getAssignmentsTableState() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(ASSIGNMENTS_TABLE_COOKIE)?.value;

  if (!rawValue) {
    return DEFAULT_TABLE_STATE;
  }

  try {
    return normalizeTableState(JSON.parse(rawValue));
  } catch {
    return DEFAULT_TABLE_STATE;
  }
}

async function setAssignmentsTableState(state: AssignmentTableState) {
  const cookieStore = await cookies();
  cookieStore.set(ASSIGNMENTS_TABLE_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
}

function readAssignmentPrefillCookie(rawValue?: string) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as AssignmentPrefillCookie;
    const roundEmployeeId = Number(parsed.round_employee_id || 0);
    const evaluatorLevel = Number(parsed.evaluator_level || 0);

    if (!roundEmployeeId || ![1, 2].includes(evaluatorLevel)) {
      return null;
    }

    if (
      parsed.created_at &&
      Date.now() - Number(parsed.created_at) > 5 * 60 * 1000
    ) {
      return null;
    }

    return {
      round_employee_id: roundEmployeeId,
      evaluator_level: evaluatorLevel,
    };
  } catch {
    return null;
  }
}

function readAssignmentEditCookie(rawValue?: string) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as AssignmentEditCookie;
    const assignmentId = Number(parsed.assignment_id || 0);

    if (!assignmentId) {
      return null;
    }

    if (
      parsed.created_at &&
      Date.now() - Number(parsed.created_at) > 5 * 60 * 1000
    ) {
      return null;
    }

    return { assignment_id: assignmentId };
  } catch {
    return null;
  }
}
function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

async function ensureEvaluatorLoginUser(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  evaluatorPayrollNo: string,
  createdBy: string,
) {
  await pool
    .request()
    .input("emp_id", sql.VarChar(20), evaluatorPayrollNo)
    .input("created_by", sql.VarChar(20), createdBy).query(`
      IF EXISTS (
        SELECT 1
        FROM dbo.competency_admin_user
        WHERE emp_id = @emp_id
          AND admin_role_type = 1
      )
      BEGIN
        SELECT 0 AS sync_status;
      END
      ELSE IF EXISTS (
        SELECT 1
        FROM dbo.competency_admin_user
        WHERE emp_id = @emp_id
          AND admin_role_type = 0
      )
      BEGIN
        UPDATE dbo.competency_admin_user
        SET active_status = 1
        WHERE emp_id = @emp_id
          AND admin_role_type = 0;

        SELECT 1 AS sync_status;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.competency_admin_user
          (emp_id, admin_role_type, active_status, created_date, created_by)
        VALUES
          (@emp_id, 0, 1, SYSDATETIME(), @created_by);

        SELECT 2 AS sync_status;
      END;
    `);
}

function redirectWithAlert(
  type: "success" | "error" | "warning" | "info",
  message: string,
): never {
  const params = new URLSearchParams({
    alert_type: type,
    alert_message: message,
  });

  redirect(`/admin/assignments?${params.toString()}`);
}

function roundStatusText(statusType: number) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";
  return `สถานะ ${statusType}`;
}

async function setEvaluatorRequiredType(formData: FormData) {
  "use server";

  const roundEmployeeId = Number(formData.get("round_employee_id") || 0);
  const evaluatorRequiredType = Number(
    formData.get("evaluator_required_type") || 2,
  );

  if (!roundEmployeeId || ![1, 2].includes(evaluatorRequiredType)) {
    redirectWithAlert("warning", "ข้อมูลไม่ถูกต้อง");
  }

  const pool = await getDbPool();

  const checkResult = await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId).query(`
      SELECT
        re.round_employee_id,
        r.status_type AS round_status
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      WHERE re.round_employee_id = @round_employee_id;
    `);

  const row = checkResult.recordset[0];

  if (!row) {
    redirectWithAlert("warning", "ไม่พบข้อมูลผู้ถูกประเมิน");
  }

  if (Number(row.round_status) !== 0) {
    redirectWithAlert("warning", "แก้ไขได้เฉพาะรอบสถานะร่างเท่านั้น");
  }

  await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .input("evaluator_required_type", sql.TinyInt, evaluatorRequiredType)
    .query(`
      UPDATE dbo.competency_round_employee
      SET evaluator_required_type = @evaluator_required_type
      WHERE round_employee_id = @round_employee_id;
    `);

  revalidatePath("/admin/assignments");

  redirectWithAlert(
    "success",
    evaluatorRequiredType === 1
      ? "ตั้งค่าให้ประเมินแค่หัวหน้าใกล้ชิดเรียบร้อยแล้ว"
      : "ตั้งค่าให้ต้องมีผู้ประเมิน 2 คนเรียบร้อยแล้ว",
  );
}

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const lockedButtonClass =
  "rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400";

async function getRounds() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      round_id,
      round_code,
      status_type
    FROM dbo.competency_round
    WHERE status_type <> 9
    ORDER BY round_year DESC, round_no DESC, round_id DESC;
  `);

  return result.recordset as RoundRow[];
}

async function getRoundEmployeeOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      re.round_employee_id,
      re.round_id,
      re.payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
      re.position_code,
      pv.PositionName AS position_name,
      re.rank_code,
      ${ssbDb()}.dbo.GetSSBName(rs.thainame) AS rank_name,
      rg.rank_group_name,
      ISNULL(rg.sort_order, 0) AS rank_order,
      re.division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) AS division_name
    FROM dbo.competency_round_employee re
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
     AND r.status_type = 0
    JOIN dbo.competency_rank_group rg
      ON rg.rank_group_id = re.rank_group_id
     AND rg.active_status = 1
    LEFT JOIN ${ssbDb()}.dbo.PositionView pv
      ON pv.PositionCode = re.position_code
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG rs
      ON rs.CODE = re.rank_code
     AND rs.CTRLCODE = '60010'
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = re.division_code
     AND ds.CTRLCODE = '10028'
    WHERE re.status_type <> 9
    ORDER BY r.round_year DESC, r.round_no DESC, ${ssbDb()}.dbo.GetUserFullName(re.payroll_no);
  `);

  return result.recordset as RoundEmployeeOptionRow[];
}

async function getEvaluatorOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    WITH draft_round AS (
      SELECT TOP 1
        round_id,
        CAST(start_date AS date) AS start_date
      FROM dbo.competency_round
      WHERE status_type = 0
      ORDER BY round_year DESC, round_no DESC, round_id DESC
    )
    SELECT TOP 3000
      CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(p.PAYROLLNO) AS evaluator_full_name,
      NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
      pv.PositionName AS position_name,
      NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
      ${ssbDb()}.dbo.GetSSBName(rs.thainame) AS rank_name,
      evaluator_group.rank_group_name,
      ISNULL(evaluator_group.sort_order, 0) AS rank_order,
      NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) AS division_name
    FROM ${ssbDb()}.dbo.PYREXT p
    CROSS JOIN draft_round dr
    OUTER APPLY (
      SELECT
        CASE
          WHEN p.FIRSTEMPLOYEEDATE IS NULL THEN NULL
          WHEN CAST(p.FIRSTEMPLOYEEDATE AS date) > dr.start_date THEN NULL
          ELSE
            DATEDIFF(
              YEAR,
              CAST(p.FIRSTEMPLOYEEDATE AS date),
              dr.start_date
            )
            - CASE
                WHEN DATEADD(
                  YEAR,
                  DATEDIFF(
                    YEAR,
                    CAST(p.FIRSTEMPLOYEEDATE AS date),
                    dr.start_date
                  ),
                  CAST(p.FIRSTEMPLOYEEDATE AS date)
                ) > dr.start_date
                THEN 1
                ELSE 0
              END
        END AS service_year
    ) service_info
    OUTER APPLY (
      SELECT TOP 1
        mapped_group.rank_group_id,
        mapped_group.rank_group_name,
        mapped_group.sort_order
      FROM (
        SELECT
          rg.rank_group_id,
          rg.rank_group_name,
          rg.sort_order
        FROM dbo.competency_rank_group_map rgm
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = rgm.rank_group_id
         AND rg.active_status = 1
        WHERE NULLIF(LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))), '') = '1'
          AND rgm.active_status = 1
          AND rgm.rank_code =
              NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')

        UNION ALL

        SELECT
          rg.rank_group_id,
          rg.rank_group_name,
          rg.sort_order
        FROM dbo.competency_tenure_rank_group trg
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = trg.rank_group_id
         AND rg.active_status = 1
        WHERE ISNULL(
                NULLIF(LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))), ''),
                ''
              ) <> '1'
          AND trg.active_status = 1
          AND service_info.service_year IS NOT NULL
          AND service_info.service_year >= trg.min_service_year
          AND (
            trg.max_service_year IS NULL
            OR service_info.service_year < trg.max_service_year
          )
      ) mapped_group
      ORDER BY mapped_group.sort_order, mapped_group.rank_group_id
    ) evaluator_group
    LEFT JOIN ${ssbDb()}.dbo.PositionView pv
      ON pv.PositionCode = p.POSITIONCODE
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG rs
      ON rs.CODE = p.[RANK]
     AND rs.CTRLCODE = '60010'
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = p.[DIVISION]
     AND ds.CTRLCODE = '10028'
    WHERE p.TERMINATEDATE IS NULL
      AND p.PAYROLLNO IS NOT NULL
      AND evaluator_group.rank_group_id IS NOT NULL
    ORDER BY ${ssbDb()}.dbo.GetUserFullName(p.PAYROLLNO);
  `);

  return result.recordset as EvaluatorOptionRow[];
}

type EvaluatorRankSnapshot = {
  payroll_no: string;
  rank_group_id: number;
  evaluator_rank_order: number;
};

async function getEvaluatorRankSnapshot(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  evaluatorPayrollNo: string,
  roundId: number,
): Promise<EvaluatorRankSnapshot | undefined> {
  const result = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo).query(`
      SELECT TOP 1
        CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
        evaluator_group.rank_group_id,
        ISNULL(evaluator_group.sort_order, 0) AS evaluator_rank_order
      FROM ${ssbDb()}.dbo.PYREXT p
      JOIN dbo.competency_round r
        ON r.round_id = @round_id
      OUTER APPLY (
        SELECT
          CASE
            WHEN p.FIRSTEMPLOYEEDATE IS NULL THEN NULL
            WHEN CAST(p.FIRSTEMPLOYEEDATE AS date) > CAST(r.start_date AS date)
              THEN NULL
            ELSE
              DATEDIFF(
                YEAR,
                CAST(p.FIRSTEMPLOYEEDATE AS date),
                CAST(r.start_date AS date)
              )
              - CASE
                  WHEN DATEADD(
                    YEAR,
                    DATEDIFF(
                      YEAR,
                      CAST(p.FIRSTEMPLOYEEDATE AS date),
                      CAST(r.start_date AS date)
                    ),
                    CAST(p.FIRSTEMPLOYEEDATE AS date)
                  ) > CAST(r.start_date AS date)
                  THEN 1
                  ELSE 0
                END
          END AS service_year
      ) service_info
      OUTER APPLY (
        SELECT TOP 1
          mapped_group.rank_group_id,
          mapped_group.sort_order
        FROM (
          SELECT
            rg.rank_group_id,
            rg.sort_order
          FROM dbo.competency_rank_group_map rgm
          JOIN dbo.competency_rank_group rg
            ON rg.rank_group_id = rgm.rank_group_id
           AND rg.active_status = 1
          WHERE NULLIF(
                  LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))),
                  ''
                ) = '1'
            AND rgm.active_status = 1
            AND rgm.rank_code =
                NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')

          UNION ALL

          SELECT
            rg.rank_group_id,
            rg.sort_order
          FROM dbo.competency_tenure_rank_group trg
          JOIN dbo.competency_rank_group rg
            ON rg.rank_group_id = trg.rank_group_id
           AND rg.active_status = 1
          WHERE ISNULL(
                  NULLIF(LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))), ''),
                  ''
                ) <> '1'
            AND trg.active_status = 1
            AND service_info.service_year IS NOT NULL
            AND service_info.service_year >= trg.min_service_year
            AND (
              trg.max_service_year IS NULL
              OR service_info.service_year < trg.max_service_year
            )
        ) mapped_group
        ORDER BY mapped_group.sort_order, mapped_group.rank_group_id
      ) evaluator_group
      WHERE p.TERMINATEDATE IS NULL
        AND CAST(p.PAYROLLNO AS varchar(20)) = @evaluator_payroll_no
        AND evaluator_group.rank_group_id IS NOT NULL;
    `);

  return result.recordset[0] as EvaluatorRankSnapshot | undefined;
}

async function getExistingAssignmentRules() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      assignment_id,
      round_employee_id,
      evaluator_payroll_no,
      evaluator_level
    FROM dbo.competency_evaluator_assignment
    WHERE status_type <> 9;
  `);

  return result.recordset as ExistingAssignmentRule[];
}

async function getTableDivisionOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT DISTINCT
      NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') AS division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) AS division_name
    FROM dbo.competency_round_employee re
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = re.division_code
     AND ds.CTRLCODE = '10028'
    WHERE re.status_type <> 9
      AND NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), '') IS NOT NULL
    ORDER BY division_name;
  `);

  return result.recordset as DivisionOptionRow[];
}

function buildAssignmentTableWhereClause(state: AssignmentTableState) {
  const whereParts = ["r.status_type <> 9", "re.status_type <> 9"];

  if (state.search) {
    whereParts.push(`
      (
        r.round_code LIKE @search_like
        OR re.payroll_no LIKE @search_like
        OR ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) LIKE @search_like
        OR re.division_code LIKE @search_like
        OR ${ssbDb()}.dbo.GetSSBName(ISNULL(eds.thainame, eds.englishname)) LIKE @search_like
        OR l1.evaluator_payroll_no LIKE @search_like
        OR ${ssbDb()}.dbo.GetUserFullName(l1.evaluator_payroll_no) LIKE @search_like
        OR l2.evaluator_payroll_no LIKE @search_like
        OR ${ssbDb()}.dbo.GetUserFullName(l2.evaluator_payroll_no) LIKE @search_like
      )
    `);
  }

  if (state.roundId) {
    whereParts.push("re.round_id = @filter_round_id");
  }

  if (state.divisionCode) {
    whereParts.push("re.division_code = @filter_division_code");
  }

  if (state.level === "1") {
    whereParts.push("l1.assignment_id IS NOT NULL");
  }

  if (state.level === "2") {
    whereParts.push("l2.assignment_id IS NOT NULL");
  }

  if (state.level === "missing1") {
    whereParts.push("l1.assignment_id IS NULL");
  }

  if (state.level === "missing2") {
    whereParts.push("l2.assignment_id IS NULL");
  }

  if (state.status === "active") {
    whereParts.push(
      "(l1.assignment_id IS NOT NULL OR l2.assignment_id IS NOT NULL)",
    );
  }

  if (state.status === "inactive") {
    whereParts.push("cx.assignment_id IS NOT NULL");
  }

  return whereParts.join(" AND ");
}

function applyAssignmentTableInputs(request: any, state: AssignmentTableState) {
  if (state.search) {
    request.input("search_like", sql.NVarChar(150), `%${state.search}%`);
  }

  if (state.roundId) {
    request.input("filter_round_id", sql.Int, Number(state.roundId));
  }

  if (state.divisionCode) {
    request.input("filter_division_code", sql.VarChar(20), state.divisionCode);
  }

  return request;
}

async function getAssignmentsPage(state: AssignmentTableState) {
  const pool = await getDbPool();
  const whereClause = buildAssignmentTableWhereClause(state);
  const offset = (state.page - 1) * state.pageSize;

  const baseFrom = `
    FROM dbo.competency_round_employee re
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG eds
      ON eds.CODE = re.division_code
     AND eds.CTRLCODE = '10028'
    OUTER APPLY (
      SELECT TOP 1
        a.assignment_id,
        a.evaluator_payroll_no,
        a.status_type,
        ev.status_type AS evaluation_status_type
      FROM dbo.competency_evaluator_assignment a
      LEFT JOIN dbo.competency_evaluation ev
        ON ev.assignment_id = a.assignment_id
      WHERE a.round_employee_id = re.round_employee_id
        AND a.evaluator_level = 1
        AND a.status_type <> 9
      ORDER BY a.assignment_id DESC
    ) l1
    OUTER APPLY (
      SELECT TOP 1
        a.assignment_id,
        a.evaluator_payroll_no,
        a.status_type,
        ev.status_type AS evaluation_status_type
      FROM dbo.competency_evaluator_assignment a
      LEFT JOIN dbo.competency_evaluation ev
        ON ev.assignment_id = a.assignment_id
      WHERE a.round_employee_id = re.round_employee_id
        AND a.evaluator_level = 2
        AND a.status_type <> 9
      ORDER BY a.assignment_id DESC
    ) l2
    OUTER APPLY (
      SELECT TOP 1 a.assignment_id
      FROM dbo.competency_evaluator_assignment a
      WHERE a.round_employee_id = re.round_employee_id
        AND a.status_type = 9
      ORDER BY a.assignment_id DESC
    ) cx
    WHERE ${whereClause}
  `;

  const countRequest = applyAssignmentTableInputs(pool.request(), state);
  const countResult = await countRequest.query(`
    SELECT COUNT(1) AS total_rows
    ${baseFrom};
  `);

  const totalRows = Number(countResult.recordset[0]?.total_rows || 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
  const safePage = Math.min(state.page, totalPages);
  const safeOffset = totalRows === 0 ? 0 : (safePage - 1) * state.pageSize;

  const rowsRequest = applyAssignmentTableInputs(pool.request(), state)
    .input("offset", sql.Int, safeOffset)
    .input("page_size", sql.Int, state.pageSize);

  const rowsResult = await rowsRequest.query(`
    SELECT
      re.round_employee_id,
      re.round_id,
      r.round_code,
      r.status_type AS round_status_type,
      re.payroll_no AS employee_payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
      re.division_code AS employee_division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(eds.thainame, eds.englishname)) AS employee_division_name,
      l1.assignment_id AS level1_assignment_id,
      l1.evaluator_payroll_no AS level1_evaluator_payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(l1.evaluator_payroll_no) AS level1_evaluator_full_name,
      l1.evaluation_status_type AS level1_evaluation_status_type,
      l2.assignment_id AS level2_assignment_id,
      l2.evaluator_payroll_no AS level2_evaluator_payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(l2.evaluator_payroll_no) AS level2_evaluator_full_name,
      l2.evaluation_status_type AS level2_evaluation_status_type,
      ISNULL(re.evaluator_required_type, 2) AS evaluator_required_type,
      CASE WHEN cx.assignment_id IS NULL THEN 0 ELSE 1 END AS has_cancelled_assignment
    ${baseFrom}
    ORDER BY r.round_year DESC, r.round_no DESC, re.division_code, re.payroll_no
    OFFSET @offset ROWS
    FETCH NEXT @page_size ROWS ONLY;
  `);

  return {
    rows: rowsResult.recordset as AssignmentTableRow[],
    totalRows,
  } satisfies AssignmentTablePageResult;
}

async function getAssignmentForEdit(assignmentId: number) {
  if (!assignmentId) return null;

  const pool = await getDbPool();

  const result = await pool
    .request()
    .input("assignment_id", sql.Int, assignmentId).query(`
      SELECT TOP 1
        a.assignment_id,
        re.round_id,
        a.round_employee_id,
        a.evaluator_payroll_no,
        a.evaluator_level,
        r.status_type AS round_status_type
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      WHERE a.assignment_id = @assignment_id
        AND a.status_type <> 9;
    `);

  const row = result.recordset[0] as
    | {
        assignment_id: number;
        round_id: number;
        round_employee_id: number;
        evaluator_payroll_no: string;
        evaluator_level: number;
        round_status_type: number;
      }
    | undefined;

  if (!row || Number(row.round_status_type) !== 0) return null;

  return {
    assignment_id: row.assignment_id,
    round_id: row.round_id,
    round_employee_id: row.round_employee_id,
    evaluator_payroll_no: row.evaluator_payroll_no,
    evaluator_level: row.evaluator_level,
  };
}

async function selectAssignmentForEdit(formData: FormData) {
  "use server";

  await requireAdminSession();

  const assignmentId = Number(formData.get("assignment_id") || 0);

  if (!assignmentId) {
    redirectWithAlert("error", "ข้อมูลรายการผู้ประเมินไม่ถูกต้อง");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    "competency_assignment_edit",
    JSON.stringify({ assignment_id: assignmentId, created_at: Date.now() }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60,
    },
  );
  cookieStore.set("competency_assignment_prefill", "", {
    path: "/",
    maxAge: 0,
  });

  redirect("/admin/assignments");
}

async function clearAssignmentContext() {
  "use server";

  const cookieStore = await cookies();
  cookieStore.set("competency_assignment_prefill", "", {
    path: "/",
    maxAge: 0,
  });
  cookieStore.set("competency_assignment_edit", "", { path: "/", maxAge: 0 });

  redirect("/admin/assignments");
}
async function saveAssignment(formData: FormData) {
  "use server";

  const session = await requireAdminSession();

  const roundId = Number(formData.get("round_id") || 0);
  const roundEmployeeId = Number(formData.get("round_employee_id") || 0);
  const evaluatorPayrollNo = String(
    formData.get("evaluator_payroll_no") || "",
  ).trim();
  const evaluatorLevel = Number(formData.get("evaluator_level") || 0);

  if (
    !roundId ||
    !roundEmployeeId ||
    !evaluatorPayrollNo ||
    ![1, 2].includes(evaluatorLevel)
  ) {
    redirectWithAlert("error", "กรุณากรอกข้อมูลให้ครบถ้วน");
  }

  const pool = await getDbPool();

  const checkResult = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo)
    .input("evaluator_level", sql.Int, evaluatorLevel).query(`
      SELECT TOP 1
        re.round_employee_id,
        re.round_id,
        re.payroll_no,
        re.rank_group_id,
        ISNULL(erg.sort_order, 0) AS employee_rank_order,
        r.status_type AS round_status_type,
        (
          SELECT COUNT(*)
          FROM dbo.competency_evaluator_assignment a
          WHERE a.round_employee_id = @round_employee_id
            AND a.evaluator_level = @evaluator_level
            AND a.status_type <> 9
        ) AS active_same_level_count,
        (
          SELECT COUNT(*)
          FROM dbo.competency_evaluator_assignment a
          WHERE a.round_employee_id = @round_employee_id
            AND a.evaluator_payroll_no = @evaluator_payroll_no
            AND a.status_type <> 9
        ) AS active_same_evaluator_count,
        old_a.assignment_id AS cancelled_assignment_id
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      JOIN dbo.competency_rank_group erg
        ON erg.rank_group_id = re.rank_group_id
      OUTER APPLY (
        SELECT TOP 1 a.assignment_id
        FROM dbo.competency_evaluator_assignment a
        WHERE a.round_employee_id = re.round_employee_id
          AND a.evaluator_payroll_no = @evaluator_payroll_no
          AND a.evaluator_level = @evaluator_level
          AND a.status_type = 9
        ORDER BY a.assignment_id DESC
      ) old_a
      WHERE re.round_employee_id = @round_employee_id
        AND re.round_id = @round_id
        AND re.status_type <> 9;
    `);

  const roundEmployee = checkResult.recordset[0] as
    | {
        payroll_no: string;
        employee_rank_order: number;
        round_status_type: number;
        active_same_level_count: number;
        active_same_evaluator_count: number;
        cancelled_assignment_id: number | null;
      }
    | undefined;

  if (!roundEmployee) {
    redirectWithAlert("error", "ไม่พบผู้ถูกประเมินในรอบที่เลือก");
  }

  if (roundEmployee.round_status_type !== 0) {
    redirectWithAlert(
      "warning",
      "รอบนี้ไม่ใช่สถานะร่าง ไม่สามารถกำหนดผู้ประเมินได้",
    );
  }

  if (String(roundEmployee.payroll_no) === evaluatorPayrollNo) {
    redirectWithAlert(
      "error",
      "ผู้ถูกประเมินและผู้ประเมินต้องไม่ใช่คนเดียวกัน",
    );
  }

  if (Number(roundEmployee.active_same_level_count) > 0) {
    redirectWithAlert(
      "warning",
      "ผู้ถูกประเมินคนนี้มีผู้ประเมินในระดับนี้แล้ว หากต้องการเปลี่ยนให้กดแก้ไขรายการเดิม",
    );
  }

  if (Number(roundEmployee.active_same_evaluator_count) > 0) {
    redirectWithAlert(
      "warning",
      "ผู้ประเมินคนนี้ถูกกำหนดให้ผู้ถูกประเมินรายนี้แล้ว ไม่สามารถกำหนดซ้ำอีกระดับได้",
    );
  }

  const evaluator = await getEvaluatorRankSnapshot(
    pool,
    evaluatorPayrollNo,
    roundId,
  );

  if (!evaluator) {
    redirectWithAlert(
      "error",
      "ไม่พบผู้ประเมิน หรือยังไม่สามารถจัดกลุ่มระดับของผู้ประเมินได้",
    );
  }

  if (
    Number(evaluator.evaluator_rank_order) <
    Number(roundEmployee.employee_rank_order)
  ) {
    redirectWithAlert(
      "warning",
      "ผู้ประเมินต้องมีกลุ่มระดับเท่ากันหรือสูงกว่าผู้ถูกประเมิน",
    );
  }

  try {
    if (roundEmployee.cancelled_assignment_id) {
      await pool
        .request()
        .input("assignment_id", sql.Int, roundEmployee.cancelled_assignment_id)
        .query(`
          UPDATE dbo.competency_evaluator_assignment
          SET status_type = 0,
              submitted_date = NULL
          WHERE assignment_id = @assignment_id;
        `);
    } else {
      await pool
        .request()
        .input("round_employee_id", sql.Int, roundEmployeeId)
        .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo)
        .input("evaluator_level", sql.Int, evaluatorLevel).query(`
          INSERT INTO dbo.competency_evaluator_assignment
          (
            round_employee_id,
            evaluator_payroll_no,
            evaluator_level,
            status_type,
            submitted_date
          )
          VALUES
          (
            @round_employee_id,
            @evaluator_payroll_no,
            @evaluator_level,
            0,
            NULL
          );
        `);
    }

    await ensureEvaluatorLoginUser(pool, evaluatorPayrollNo, session.emp_id);
  } catch (error) {
    console.error(error);
    redirectWithAlert("error", "บันทึกผู้ประเมินไม่สำเร็จ");
  }

  const cookieStore = await cookies();
  cookieStore.set("competency_assignment_prefill", "", {
    path: "/",
    maxAge: 0,
  });
  cookieStore.set("competency_assignment_edit", "", { path: "/", maxAge: 0 });

  revalidatePath("/admin/assignments");
  revalidatePath("/admin/admin-users");
  redirectWithAlert("success", "บันทึกผู้ประเมินเรียบร้อยแล้ว");
}

async function updateAssignment(formData: FormData) {
  "use server";

  const session = await requireAdminSession();

  const assignmentId = Number(formData.get("assignment_id") || 0);
  const roundId = Number(formData.get("round_id") || 0);
  const roundEmployeeId = Number(formData.get("round_employee_id") || 0);
  const evaluatorPayrollNo = String(
    formData.get("evaluator_payroll_no") || "",
  ).trim();
  const evaluatorLevel = Number(formData.get("evaluator_level") || 0);

  if (
    !assignmentId ||
    !roundId ||
    !roundEmployeeId ||
    !evaluatorPayrollNo ||
    ![1, 2].includes(evaluatorLevel)
  ) {
    redirectWithAlert("error", "กรุณากรอกข้อมูลให้ครบถ้วน");
  }

  const pool = await getDbPool();

  const checkResult = await pool
    .request()
    .input("assignment_id", sql.Int, assignmentId)
    .input("round_id", sql.Int, roundId)
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo)
    .input("evaluator_level", sql.Int, evaluatorLevel).query(`
      SELECT TOP 1
        a.assignment_id,
        a.status_type AS assignment_status_type,
        re.round_employee_id,
        re.round_id,
        re.payroll_no,
        re.rank_group_id,
        ISNULL(erg.sort_order, 0) AS employee_rank_order,
        r.status_type AS round_status_type,
        ev.status_type AS evaluation_status_type,
        (
          SELECT COUNT(*)
          FROM dbo.competency_evaluator_assignment other_a
          WHERE other_a.round_employee_id = @round_employee_id
            AND other_a.evaluator_level = @evaluator_level
            AND other_a.status_type <> 9
            AND other_a.assignment_id <> @assignment_id
        ) AS active_same_level_count,
        (
          SELECT COUNT(*)
          FROM dbo.competency_evaluator_assignment other_a
          WHERE other_a.round_employee_id = @round_employee_id
            AND other_a.evaluator_payroll_no = @evaluator_payroll_no
            AND other_a.status_type <> 9
            AND other_a.assignment_id <> @assignment_id
        ) AS active_same_evaluator_count
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = @round_employee_id
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      JOIN dbo.competency_rank_group erg
        ON erg.rank_group_id = re.rank_group_id
      LEFT JOIN dbo.competency_evaluation ev
        ON ev.assignment_id = a.assignment_id
      WHERE a.assignment_id = @assignment_id
        AND re.round_id = @round_id
        AND re.status_type <> 9;
    `);

  const roundEmployee = checkResult.recordset[0] as
    | {
        payroll_no: string;
        employee_rank_order: number;
        round_status_type: number;
        evaluation_status_type: number | null;
        active_same_level_count: number;
        active_same_evaluator_count: number;
      }
    | undefined;

  if (!roundEmployee) {
    redirectWithAlert(
      "error",
      "ไม่พบรายการผู้ประเมิน หรือไม่พบผู้ถูกประเมินในรอบที่เลือก",
    );
  }

  if (roundEmployee.round_status_type !== 0) {
    redirectWithAlert(
      "warning",
      "รอบนี้ไม่ใช่สถานะร่าง ไม่สามารถแก้ไขผู้ประเมินได้",
    );
  }

  if (roundEmployee.evaluation_status_type === 1) {
    redirectWithAlert("warning", "รายการนี้ส่งผลประเมินแล้ว ไม่สามารถแก้ไขได้");
  }

  if (String(roundEmployee.payroll_no) === evaluatorPayrollNo) {
    redirectWithAlert(
      "error",
      "ผู้ถูกประเมินและผู้ประเมินต้องไม่ใช่คนเดียวกัน",
    );
  }

  if (Number(roundEmployee.active_same_level_count) > 0) {
    redirectWithAlert(
      "warning",
      "ผู้ถูกประเมินคนนี้มีผู้ประเมินในระดับนี้แล้ว ไม่สามารถแก้ไขซ้ำได้",
    );
  }

  if (Number(roundEmployee.active_same_evaluator_count) > 0) {
    redirectWithAlert(
      "warning",
      "ผู้ประเมินคนนี้ถูกกำหนดให้ผู้ถูกประเมินรายนี้แล้ว ไม่สามารถกำหนดซ้ำอีกระดับได้",
    );
  }

  const evaluator = await getEvaluatorRankSnapshot(
    pool,
    evaluatorPayrollNo,
    roundId,
  );

  if (!evaluator) {
    redirectWithAlert(
      "error",
      "ไม่พบผู้ประเมิน หรือยังไม่สามารถจัดกลุ่มระดับของผู้ประเมินได้",
    );
  }

  if (
    Number(evaluator.evaluator_rank_order) <
    Number(roundEmployee.employee_rank_order)
  ) {
    redirectWithAlert(
      "warning",
      "ผู้ประเมินต้องมีกลุ่มระดับเท่ากันหรือสูงกว่าผู้ถูกประเมิน",
    );
  }

  try {
    await pool
      .request()
      .input("assignment_id", sql.Int, assignmentId)
      .input("round_employee_id", sql.Int, roundEmployeeId)
      .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo)
      .input("evaluator_level", sql.Int, evaluatorLevel).query(`
        UPDATE dbo.competency_evaluator_assignment
        SET round_employee_id = @round_employee_id,
            evaluator_payroll_no = @evaluator_payroll_no,
            evaluator_level = @evaluator_level,
            status_type = 0,
            submitted_date = NULL
        WHERE assignment_id = @assignment_id;
      `);

    await ensureEvaluatorLoginUser(pool, evaluatorPayrollNo, session.emp_id);
  } catch (error) {
    console.error(error);
    redirectWithAlert("error", "แก้ไขผู้ประเมินไม่สำเร็จ");
  }

  const cookieStore = await cookies();
  cookieStore.set("competency_assignment_edit", "", { path: "/", maxAge: 0 });

  revalidatePath("/admin/assignments");
  revalidatePath("/admin/admin-users");
  redirectWithAlert("success", "แก้ไขผู้ประเมินเรียบร้อยแล้ว");
}

async function toggleAssignmentStatus(formData: FormData) {
  "use server";

  const assignmentId = Number(formData.get("assignment_id") || 0);
  const nextStatus = Number(formData.get("next_status") || 0);

  if (!assignmentId || ![0, 9].includes(nextStatus)) {
    redirectWithAlert("error", "ข้อมูลรายการไม่ถูกต้อง");
  }

  const pool = await getDbPool();

  const checkResult = await pool
    .request()
    .input("assignment_id", sql.Int, assignmentId).query(`
      SELECT TOP 1
        a.assignment_id,
        a.round_employee_id,
        a.evaluator_payroll_no,
        a.evaluator_level,
        a.status_type,
        r.status_type AS round_status_type,
        ev.status_type AS evaluation_status_type,
        (
          SELECT COUNT(*)
          FROM dbo.competency_evaluator_assignment other_a
          WHERE other_a.round_employee_id = a.round_employee_id
            AND other_a.evaluator_level = a.evaluator_level
            AND other_a.status_type <> 9
            AND other_a.assignment_id <> a.assignment_id
        ) AS active_same_level_count,
        (
          SELECT COUNT(*)
          FROM dbo.competency_evaluator_assignment other_a
          WHERE other_a.round_employee_id = a.round_employee_id
            AND other_a.evaluator_payroll_no = a.evaluator_payroll_no
            AND other_a.status_type <> 9
            AND other_a.assignment_id <> a.assignment_id
        ) AS active_same_evaluator_count
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      LEFT JOIN dbo.competency_evaluation ev
        ON ev.assignment_id = a.assignment_id
      WHERE a.assignment_id = @assignment_id;
    `);

  const assignment = checkResult.recordset[0] as
    | {
        round_status_type: number;
        evaluation_status_type: number | null;
        active_same_level_count: number;
        active_same_evaluator_count: number;
      }
    | undefined;

  if (!assignment) {
    redirectWithAlert("error", "ไม่พบรายการผู้ประเมิน");
  }

  if (assignment.round_status_type !== 0) {
    redirectWithAlert(
      "warning",
      "รอบนี้ไม่ใช่สถานะร่าง ไม่สามารถแก้ไขผู้ประเมินได้",
    );
  }

  if (nextStatus === 9 && assignment.evaluation_status_type === 1) {
    redirectWithAlert(
      "warning",
      "รายการนี้ส่งผลประเมินแล้ว ไม่สามารถยกเลิกได้",
    );
  }

  if (nextStatus === 0 && Number(assignment.active_same_level_count) > 0) {
    redirectWithAlert(
      "warning",
      "มีผู้ประเมินระดับเดียวกันที่เปิดใช้งานอยู่แล้ว ไม่สามารถเปิดใช้งานรายการนี้ได้",
    );
  }

  if (nextStatus === 0 && Number(assignment.active_same_evaluator_count) > 0) {
    redirectWithAlert(
      "warning",
      "ผู้ประเมินคนนี้ถูกกำหนดให้ผู้ถูกประเมินรายนี้อยู่แล้ว ไม่สามารถเปิดใช้งานซ้ำได้",
    );
  }

  try {
    await pool
      .request()
      .input("assignment_id", sql.Int, assignmentId)
      .input("next_status", sql.Int, nextStatus).query(`
        UPDATE dbo.competency_evaluator_assignment
        SET status_type = @next_status,
            submitted_date = CASE WHEN @next_status = 9 THEN submitted_date ELSE NULL END
        WHERE assignment_id = @assignment_id;
      `);
  } catch (error) {
    console.error(error);
    redirectWithAlert("error", "ปรับสถานะผู้ประเมินไม่สำเร็จ");
  }

  revalidatePath("/admin/assignments");
  redirectWithAlert(
    "success",
    nextStatus === 9
      ? "ยกเลิกผู้ประเมินเรียบร้อยแล้ว"
      : "เปิดใช้งานผู้ประเมินเรียบร้อยแล้ว",
  );
}

async function toggleEvaluatorRequiredType(formData: FormData) {
  "use server";

  await requireAdminSession();

  const roundEmployeeId = Number(formData.get("round_employee_id") || 0);
  const nextType = Number(formData.get("next_type") || 2);

  if (!roundEmployeeId || ![1, 2].includes(nextType)) {
    redirectWithAlert("warning", "ข้อมูลไม่ครบถ้วน");
  }

  const pool = await getDbPool();

  const rowResult = await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId).query(`
      SELECT TOP 1
        re.round_employee_id,
        re.evaluator_required_type,
        r.status_type AS round_status_type
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      WHERE re.round_employee_id = @round_employee_id
        AND re.status_type <> 9;
    `);

  const row = rowResult.recordset[0] as
    { round_status_type: number; evaluator_required_type: number } | undefined;

  if (!row) {
    redirectWithAlert("warning", "ไม่พบผู้ถูกประเมินในรอบ");
  }

  if (Number(row.round_status_type) !== 0) {
    redirectWithAlert("warning", "แก้ไขได้เฉพาะรอบสถานะร่างเท่านั้น");
  }

  await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .input("next_type", sql.TinyInt, nextType).query(`
      UPDATE dbo.competency_round_employee
      SET evaluator_required_type = @next_type
      WHERE round_employee_id = @round_employee_id;
    `);

  revalidatePath("/admin/assignments");
  redirectWithAlert(
    "success",
    nextType === 1
      ? "ตั้งค่าให้ใช้ผู้ประเมินคนเดียวเรียบร้อยแล้ว"
      : "ตั้งค่าให้ต้องมีผู้ประเมิน 2 คนเรียบร้อยแล้ว",
  );
}

async function cancelEmployeeAssignments(formData: FormData) {
  "use server";

  const roundEmployeeId = Number(formData.get("round_employee_id") || 0);

  if (!roundEmployeeId) {
    redirectWithAlert("error", "ข้อมูลผู้ถูกประเมินไม่ถูกต้อง");
  }

  const pool = await getDbPool();

  const checkResult = await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId).query(`
      SELECT
        re.round_employee_id,
        r.status_type AS round_status_type,
        SUM(CASE WHEN a.status_type <> 9 THEN 1 ELSE 0 END) AS active_assignment_count,
        SUM(CASE WHEN a.status_type <> 9 AND ev.status_type = 1 THEN 1 ELSE 0 END) AS submitted_evaluation_count
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      LEFT JOIN dbo.competency_evaluator_assignment a
        ON a.round_employee_id = re.round_employee_id
      LEFT JOIN dbo.competency_evaluation ev
        ON ev.assignment_id = a.assignment_id
      WHERE re.round_employee_id = @round_employee_id
      GROUP BY
        re.round_employee_id,
        r.status_type;
    `);

  const row = checkResult.recordset[0] as
    | {
        round_status_type: number;
        active_assignment_count: number | null;
        submitted_evaluation_count: number | null;
      }
    | undefined;

  if (!row) {
    redirectWithAlert("error", "ไม่พบผู้ถูกประเมินในรอบนี้");
  }

  if (row.round_status_type !== 0) {
    redirectWithAlert(
      "warning",
      "รอบนี้ไม่ใช่สถานะร่าง ไม่สามารถยกเลิกผู้ประเมินได้",
    );
  }

  if (Number(row.active_assignment_count || 0) === 0) {
    redirectWithAlert(
      "warning",
      "ผู้ถูกประเมินรายนี้ยังไม่มีผู้ประเมินที่เปิดใช้งาน",
    );
  }

  if (Number(row.submitted_evaluation_count || 0) > 0) {
    redirectWithAlert(
      "warning",
      "มีรายการที่ส่งผลประเมินแล้ว ไม่สามารถยกเลิกได้",
    );
  }

  try {
    await pool.request().input("round_employee_id", sql.Int, roundEmployeeId)
      .query(`
        UPDATE dbo.competency_evaluator_assignment
        SET status_type = 9
        WHERE round_employee_id = @round_employee_id
          AND status_type <> 9;
      `);
  } catch (error) {
    console.error(error);
    redirectWithAlert("error", "ยกเลิกผู้ประเมินไม่สำเร็จ");
  }

  revalidatePath("/admin/assignments");
  redirectWithAlert("success", "ยกเลิกผู้ประเมินของรายการนี้เรียบร้อยแล้ว");
}

async function bulkAssignDivision(formData: FormData) {
  "use server";

  const session = await requireAdminSession();

  const roundId = Number(formData.get("round_id") || 0);
  const divisionCode = String(formData.get("division_code") || "").trim();
  const evaluatorPayrollNo = String(
    formData.get("evaluator_payroll_no") || "",
  ).trim();
  const evaluatorLevel = Number(formData.get("evaluator_level") || 0);

  if (
    !roundId ||
    !divisionCode ||
    !evaluatorPayrollNo ||
    ![1, 2].includes(evaluatorLevel)
  ) {
    redirectWithAlert("error", "กรุณากรอกข้อมูลให้ครบถ้วน");
  }

  const pool = await getDbPool();

  const roundResult = await pool.request().input("round_id", sql.Int, roundId)
    .query(`
      SELECT TOP 1 round_id, status_type
      FROM dbo.competency_round
      WHERE round_id = @round_id;
    `);

  const round = roundResult.recordset[0] as { status_type: number } | undefined;

  if (!round) {
    redirectWithAlert("error", "ไม่พบรอบประเมินที่เลือก");
  }

  if (round.status_type !== 0) {
    redirectWithAlert(
      "warning",
      "รอบนี้ไม่ใช่สถานะร่าง ไม่สามารถกำหนดผู้ประเมินแบบกลุ่มได้",
    );
  }

  const evaluator = await getEvaluatorRankSnapshot(
    pool,
    evaluatorPayrollNo,
    roundId,
  );

  if (!evaluator) {
    redirectWithAlert(
      "error",
      "ไม่พบผู้ประเมิน หรือยังไม่สามารถจัดกลุ่มระดับของผู้ประเมินได้",
    );
  }

  const targetResult = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .input("division_code", sql.VarChar(20), divisionCode)
    .input("evaluator_level", sql.Int, evaluatorLevel)
    .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo)
    .input(
      "evaluator_rank_order",
      sql.Int,
      Number(evaluator.evaluator_rank_order),
    ).query(`
      SELECT COUNT(*) AS target_count
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_rank_group erg
        ON erg.rank_group_id = re.rank_group_id
       AND erg.active_status = 1
      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND re.division_code = @division_code
        AND re.payroll_no <> @evaluator_payroll_no
        AND @evaluator_rank_order >= ISNULL(erg.sort_order, 0)
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.competency_evaluator_assignment a
          WHERE a.round_employee_id = re.round_employee_id
            AND a.evaluator_level = @evaluator_level
            AND a.status_type <> 9
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.competency_evaluator_assignment a
          WHERE a.round_employee_id = re.round_employee_id
            AND a.evaluator_payroll_no = @evaluator_payroll_no
            AND a.status_type <> 9
        );
    `);

  const targetCount = Number(targetResult.recordset[0]?.target_count || 0);

  if (targetCount === 0) {
    redirectWithAlert(
      "warning",
      "ไม่พบผู้ถูกประเมินที่สามารถกำหนดผู้ประเมินแบบกลุ่มได้ อาจถูกกำหนดครบแล้ว หรือระดับผู้ประเมินไม่เข้าเงื่อนไข",
    );
  }

  let insertedCount = 0;

  try {
    const insertResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .input("division_code", sql.VarChar(20), divisionCode)
      .input("evaluator_level", sql.Int, evaluatorLevel)
      .input("evaluator_payroll_no", sql.VarChar(20), evaluatorPayrollNo)
      .input(
        "evaluator_rank_order",
        sql.Int,
        Number(evaluator.evaluator_rank_order),
      ).query(`
        INSERT INTO dbo.competency_evaluator_assignment
        (
          round_employee_id,
          evaluator_payroll_no,
          evaluator_level,
          status_type,
          submitted_date
        )
        SELECT
          re.round_employee_id,
          @evaluator_payroll_no,
          @evaluator_level,
          0,
          NULL
        FROM dbo.competency_round_employee re
        JOIN dbo.competency_rank_group erg
          ON erg.rank_group_id = re.rank_group_id
         AND erg.active_status = 1
        WHERE re.round_id = @round_id
          AND re.status_type <> 9
          AND re.division_code = @division_code
          AND re.payroll_no <> @evaluator_payroll_no
          AND @evaluator_rank_order >= ISNULL(erg.sort_order, 0)
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_evaluator_assignment a
            WHERE a.round_employee_id = re.round_employee_id
              AND a.evaluator_level = @evaluator_level
              AND a.status_type <> 9
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_evaluator_assignment a
            WHERE a.round_employee_id = re.round_employee_id
              AND a.evaluator_payroll_no = @evaluator_payroll_no
              AND a.status_type <> 9
          );
      `);

    insertedCount = Number(insertResult.rowsAffected?.[0] || 0);

    await ensureEvaluatorLoginUser(pool, evaluatorPayrollNo, session.emp_id);
  } catch (error) {
    console.error(error);
    redirectWithAlert("error", "กำหนดผู้ประเมินแบบกลุ่มไม่สำเร็จ");
  }

  if (insertedCount === 0) {
    redirectWithAlert("warning", "ไม่พบรายการที่นำเข้าได้");
  }

  revalidatePath("/admin/assignments");
  redirectWithAlert(
    "success",
    `กำหนดผู้ประเมินแบบกลุ่มเรียบร้อยแล้ว ${insertedCount.toLocaleString()} รายการ`,
  );
}

type AssignmentTablePayload = {
  rows: AssignmentTableRow[];
  totalRows: number;
  state: AssignmentTableState;
};

type AssignmentTableActionResult = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  table: AssignmentTablePayload;
};

async function getAssignmentsTablePayload(
  inputState: Partial<AssignmentTableState> | AssignmentTableState,
): Promise<AssignmentTablePayload> {
  const state = normalizeTableState(inputState);
  const pageResult = await getAssignmentsPage(state);
  const totalPages = Math.max(
    1,
    Math.ceil(pageResult.totalRows / state.pageSize),
  );
  const safePage = Math.min(state.page, totalPages);
  const safeState = { ...state, page: safePage };

  await setAssignmentsTableState(safeState);

  return {
    rows: pageResult.rows,
    totalRows: pageResult.totalRows,
    state: safeState,
  };
}

async function loadAssignmentsTableClient(
  inputState: AssignmentTableState,
): Promise<AssignmentTableActionResult> {
  "use server";

  await requireAdminSession();

  const table = await getAssignmentsTablePayload(inputState);

  return {
    ok: true,
    type: "info",
    message: "",
    table,
  };
}

async function toggleEvaluatorRequiredTypeClient(
  roundEmployeeId: number,
  nextType: number,
  inputState: AssignmentTableState,
): Promise<AssignmentTableActionResult> {
  "use server";

  await requireAdminSession();

  const tableBefore = await getAssignmentsTablePayload(inputState);

  if (!roundEmployeeId || ![1, 2].includes(Number(nextType))) {
    return {
      ok: false,
      type: "warning",
      message: "ข้อมูลไม่ครบถ้วน",
      table: tableBefore,
    };
  }

  const pool = await getDbPool();

  const rowResult = await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId).query(`
      SELECT TOP 1
        re.round_employee_id,
        re.evaluator_required_type,
        r.status_type AS round_status_type
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      WHERE re.round_employee_id = @round_employee_id
        AND re.status_type <> 9;
    `);

  const row = rowResult.recordset[0] as
    { round_status_type: number; evaluator_required_type: number } | undefined;

  if (!row) {
    return {
      ok: false,
      type: "warning",
      message: "ไม่พบผู้ถูกประเมินในรอบ",
      table: tableBefore,
    };
  }

  if (Number(row.round_status_type) !== 0) {
    return {
      ok: false,
      type: "warning",
      message: "แก้ไขได้เฉพาะรอบสถานะร่างเท่านั้น",
      table: tableBefore,
    };
  }

  await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .input("next_type", sql.TinyInt, nextType).query(`
      UPDATE dbo.competency_round_employee
      SET evaluator_required_type = @next_type
      WHERE round_employee_id = @round_employee_id;
    `);

  revalidatePath("/admin/assignments");

  const table = await getAssignmentsTablePayload(inputState);

  return {
    ok: true,
    type: "success",
    message:
      Number(nextType) === 1
        ? "ตั้งค่าให้ใช้หัวหน้าใกล้ชิด 100% เรียบร้อยแล้ว"
        : "ตั้งค่าให้ต้องมีผู้ประเมิน 2 คนเรียบร้อยแล้ว",
    table,
  };
}

async function cancelEmployeeAssignmentsClient(
  roundEmployeeId: number,
  inputState: AssignmentTableState,
): Promise<AssignmentTableActionResult> {
  "use server";

  await requireAdminSession();

  const tableBefore = await getAssignmentsTablePayload(inputState);

  if (!roundEmployeeId) {
    return {
      ok: false,
      type: "error",
      message: "ข้อมูลผู้ถูกประเมินไม่ถูกต้อง",
      table: tableBefore,
    };
  }

  const pool = await getDbPool();

  const checkResult = await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId).query(`
      SELECT
        re.round_employee_id,
        r.status_type AS round_status_type,
        SUM(CASE WHEN a.status_type <> 9 THEN 1 ELSE 0 END) AS active_assignment_count,
        SUM(CASE WHEN a.status_type <> 9 AND ev.status_type = 1 THEN 1 ELSE 0 END) AS submitted_evaluation_count
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      LEFT JOIN dbo.competency_evaluator_assignment a
        ON a.round_employee_id = re.round_employee_id
      LEFT JOIN dbo.competency_evaluation ev
        ON ev.assignment_id = a.assignment_id
      WHERE re.round_employee_id = @round_employee_id
      GROUP BY
        re.round_employee_id,
        r.status_type;
    `);

  const row = checkResult.recordset[0] as
    | {
        round_status_type: number;
        active_assignment_count: number | null;
        submitted_evaluation_count: number | null;
      }
    | undefined;

  if (!row) {
    return {
      ok: false,
      type: "error",
      message: "ไม่พบผู้ถูกประเมินในรอบนี้",
      table: tableBefore,
    };
  }

  if (Number(row.round_status_type) !== 0) {
    return {
      ok: false,
      type: "warning",
      message: "รอบนี้ไม่ใช่สถานะร่าง ไม่สามารถยกเลิกผู้ประเมินได้",
      table: tableBefore,
    };
  }

  if (Number(row.active_assignment_count || 0) === 0) {
    return {
      ok: false,
      type: "warning",
      message: "ผู้ถูกประเมินรายนี้ยังไม่มีผู้ประเมินที่เปิดใช้งาน",
      table: tableBefore,
    };
  }

  if (Number(row.submitted_evaluation_count || 0) > 0) {
    return {
      ok: false,
      type: "warning",
      message: "มีรายการที่ส่งผลประเมินแล้ว ไม่สามารถยกเลิกได้",
      table: tableBefore,
    };
  }

  await pool.request().input("round_employee_id", sql.Int, roundEmployeeId)
    .query(`
      UPDATE dbo.competency_evaluator_assignment
      SET status_type = 9
      WHERE round_employee_id = @round_employee_id
        AND status_type <> 9;
    `);

  revalidatePath("/admin/assignments");

  const table = await getAssignmentsTablePayload(inputState);

  return {
    ok: true,
    type: "success",
    message: "ยกเลิกผู้ประเมินของรายการนี้เรียบร้อยแล้ว",
    table,
  };
}

export default async function AssignmentsPage({
  searchParams,
}: AssignmentsPageProps) {
  await requireAdminSession();

  const params = (await searchParams) || {};
  const tableState = await getAssignmentsTableState();

  const cookieStore = await cookies();
  const rawPrefill = cookieStore.get("competency_assignment_prefill")?.value;
  const rawEdit = cookieStore.get("competency_assignment_edit")?.value;
  const assignmentEditFromCookie = readAssignmentEditCookie(rawEdit);
  const assignmentPrefillFromCookie = assignmentEditFromCookie
    ? null
    : readAssignmentPrefillCookie(rawPrefill);

  async function updateAssignmentsTableState(formData: FormData) {
    "use server";

    await requireAdminSession();

    const nextState = normalizeTableState({
      page: Number(formData.get("page") || 1),
      pageSize: Number(formData.get("page_size") || 25),
      search: String(formData.get("search") || ""),
      roundId: String(formData.get("round_id") || ""),
      divisionCode: String(formData.get("division_code") || ""),
      level: String(formData.get("level") || ""),
      status: String(formData.get("status") || ""),
    });

    await setAssignmentsTableState(nextState);
    redirect("/admin/assignments");
  }

  async function clearAssignmentsTableState() {
    "use server";

    await requireAdminSession();

    const cookieStore = await cookies();
    cookieStore.delete(ASSIGNMENTS_TABLE_COOKIE);
    redirect("/admin/assignments");
  }

  const [
    rounds,
    roundEmployeeOptions,
    evaluatorOptions,
    existingAssignmentRules,
    tableDivisionRows,
    assignmentPage,
    editAssignment,
  ] = await Promise.all([
    getRounds(),
    getRoundEmployeeOptions(),
    getEvaluatorOptions(),
    getExistingAssignmentRules(),
    getTableDivisionOptions(),
    getAssignmentsPage(tableState),
    getAssignmentForEdit(assignmentEditFromCookie?.assignment_id || 0),
  ]);

  const draftRoundOptions = rounds
    .filter((round) => round.status_type === 0)
    .map((round) => ({
      value: String(round.round_id),
      label: `${round.round_code} (${roundStatusText(round.status_type)})`,
    }));

  const assignmentRoundOptions = rounds.map((round) => ({
    value: String(round.round_id),
    label: `${round.round_code} (${roundStatusText(round.status_type)})`,
  }));

  const tableRoundOptions = assignmentRoundOptions.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  const divisionOptions = tableDivisionRows.map((row) => ({
    value: row.division_code,
    label: row.division_name || row.division_code,
  }));

  const roundEmployeeFormOptions = roundEmployeeOptions.map((row) => ({
    round_employee_id: row.round_employee_id,
    round_id: row.round_id,
    payroll_no: row.payroll_no,
    rank_order: row.rank_order,
    division_code: String(row.division_code || "").trim(),
    employee_label: `${row.employee_full_name} (${row.payroll_no}) • ${row.rank_group_name || row.rank_name || "ไม่ระบุกลุ่มระดับ"} • ${row.division_name || row.division_code || "ไม่ระบุกลุ่มงาน"}`,
  }));

  const roundEmployeeDivisionOptions = Array.from(
    new Map(
      roundEmployeeOptions
        .map((row) => {
          const code = String(row.division_code || "").trim();
          if (!code) return null;

          return [
            code,
            {
              value: code,
              label: `${row.division_name || code} (${code})`,
            },
          ] as const;
        })
        .filter(Boolean) as [string, { value: string; label: string }][],
    ).values(),
  );

  const evaluatorFormOptions = evaluatorOptions.map((row) => ({
    payroll_no: row.payroll_no,
    rank_order: row.rank_order,
    division_code: String(row.division_code || "").trim(),
    evaluator_label: `${row.evaluator_full_name} (${row.payroll_no}) • ${row.rank_group_name || row.rank_name || "ไม่ระบุกลุ่มระดับ"} • ${row.division_name || row.division_code || "ไม่ระบุกลุ่มงาน"}`,
  }));

  const prefillRoundEmployee = assignmentPrefillFromCookie
    ? roundEmployeeOptions.find(
        (row) =>
          row.round_employee_id ===
            assignmentPrefillFromCookie.round_employee_id &&
          rounds.find((round) => round.round_id === row.round_id)
            ?.status_type === 0,
      )
    : null;

  const prefillAssignment = prefillRoundEmployee
    ? {
        round_id: prefillRoundEmployee.round_id,
        round_employee_id: prefillRoundEmployee.round_employee_id,
        evaluator_level: assignmentPrefillFromCookie?.evaluator_level || 1,
      }
    : null;

  const assignments = assignmentPage.rows;
  const totalRows = assignmentPage.totalRows;
  const totalPages = Math.max(1, Math.ceil(totalRows / tableState.pageSize));
  const currentPage = Math.min(tableState.page, totalPages);
  const startItem =
    totalRows === 0 ? 0 : (currentPage - 1) * tableState.pageSize + 1;
  const endItem = Math.min(currentPage * tableState.pageSize, totalRows);

  function renderEvaluatorCell(
    assignmentId: number | null,
    evaluatorName: string | null,
    roundStatusType: number,
    colorClassName: string,
  ) {
    if (!assignmentId || !evaluatorName) {
      return (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ยังไม่ได้กำหนด
        </span>
      );
    }

    const nameClassName = `font-medium ${colorClassName}`;

    if (roundStatusType !== 0) {
      return <div className={`${nameClassName} text-sm`}>{evaluatorName}</div>;
    }

    return (
      <form action={selectAssignmentForEdit}>
        <input type="hidden" name="assignment_id" value={assignmentId} />
        <button
          type="submit"
          className={`${nameClassName} text-left text-sm hover:underline`}
          title="กดเพื่อแก้ไขผู้ประเมิน"
        >
          {evaluatorName}
        </button>
      </form>
    );
  }

  function renderEvaluatorRequiredType(row: AssignmentTableRow) {
    const isSingleEvaluator = Number(row.evaluator_required_type || 2) === 1;
    const isDraftRound = Number(row.round_status_type) === 0;
    const nextType = isSingleEvaluator ? 2 : 1;

    const switchButton = (
      <button
        type={isDraftRound ? "submit" : "button"}
        disabled={!isDraftRound}
        title={
          isSingleEvaluator
            ? "เปิดอยู่: ประเมินแค่หัวหน้าใกล้ชิด"
            : "ปิดอยู่: ต้องมีหัวหน้าใกล้ชิดและหัวหน้าใหญ่"
        }
        className={[
          "relative inline-flex h-6 w-14 items-center rounded-full border transition",
          isDraftRound ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          isSingleEvaluator
            ? "border-[#1ab394] bg-[#1ab394]"
            : "border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-800",
        ].join(" ")}
      >
        <span
          className={[
            "absolute text-[10px] font-bold uppercase leading-none text-white transition",
            isSingleEvaluator ? "left-2 opacity-100" : "left-2 opacity-0",
          ].join(" ")}
        >
          ON
        </span>

        <span
          className={[
            "absolute text-[10px] font-bold uppercase leading-none transition",
            isSingleEvaluator
              ? "right-2 opacity-0"
              : "right-2 text-gray-500 opacity-100 dark:text-gray-300",
          ].join(" ")}
        >
          OFF
        </span>

        <span
          className={[
            "absolute h-5 w-5 rounded-full bg-white shadow transition",
            isSingleEvaluator ? "translate-x-8" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    );

    return (
      <div className="flex flex-col gap-1">
        {isDraftRound ? (
          <form action={toggleEvaluatorRequiredType}>
            <input
              type="hidden"
              name="round_employee_id"
              value={row.round_employee_id}
            />
            <input type="hidden" name="next_type" value={nextType} />
            {switchButton}
          </form>
        ) : (
          switchButton
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400">
          {isSingleEvaluator ? "ใช้หัวหน้าใกล้ชิด 100%" : "ต้องมี 2 คน"}
        </div>
      </div>
    );
  }

  function renderCancelActions(row: AssignmentTableRow) {
    const activeAssignmentCount =
      Number(row.level1_assignment_id ? 1 : 0) +
      Number(row.level2_assignment_id ? 1 : 0);

    if (activeAssignmentCount === 0) {
      return (
        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
      );
    }

    if (row.round_status_type !== 0) {
      return <span className={lockedButtonClass}>ล็อกแล้ว</span>;
    }

    return (
      <form action={cancelEmployeeAssignments}>
        <input
          type="hidden"
          name="round_employee_id"
          value={row.round_employee_id}
        />
        <button className={redActionButtonClass}>ยกเลิก</button>
      </form>
    );
  }

  return (
    <>
      <ActionAlert type={params.alert_type} message={params.alert_message} />

      <PageHeader
        title="กำหนดผู้ประเมิน"
        description="กำหนดหัวหน้าใกล้ชิดและหัวหน้าใหญ่ให้ผู้ถูกประเมินในแต่ละรอบ"
      />

      <AssignmentBulkForm
        roundOptions={draftRoundOptions}
        divisionOptions={roundEmployeeDivisionOptions}
        roundEmployeeOptions={roundEmployeeFormOptions}
        evaluatorOptions={evaluatorFormOptions}
        existingAssignmentRules={existingAssignmentRules}
        bulkAssignDivisionAction={bulkAssignDivision}
      />

      <AssignmentForm
        roundOptions={draftRoundOptions}
        roundEmployeeOptions={roundEmployeeFormOptions}
        evaluatorOptions={evaluatorFormOptions}
        existingAssignmentRules={existingAssignmentRules}
        editAssignment={editAssignment}
        prefillAssignment={prefillAssignment}
        saveAssignmentAction={saveAssignment}
        updateAssignmentAction={updateAssignment}
        clearPrefillAction={clearAssignmentContext}
      />

      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          รายการผู้ประเมินที่กำหนดแล้ว
        </h2>
      </div>

      <AssignmentsTableClient
        initialRows={assignments}
        initialTotalRows={totalRows}
        initialState={{ ...tableState, page: currentPage }}
        roundOptions={tableRoundOptions}
        divisionOptions={divisionOptions}
        loadTableAction={loadAssignmentsTableClient}
        toggleEvaluatorRequiredTypeAction={toggleEvaluatorRequiredTypeClient}
        cancelEmployeeAssignmentsAction={cancelEmployeeAssignmentsClient}
        selectAssignmentForEditAction={selectAssignmentForEdit}
      />
    </>
  );
}