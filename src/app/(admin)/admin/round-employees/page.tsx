import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import RoundEmployeeForm from "@/components/competency/RoundEmployeeForm";
import RoundEmployeesTableClient from "@/components/competency/RoundEmployeesTableClient";
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

type DivisionRow = {
  division_code: string;
  division_name: string;
};

type EmployeeOptionRow = {
  payroll_no: string;
  full_name: string;
  position_code: string | null;
  position_name: string | null;
  rank_code: string | null;
  rank_name: string | null;
  rank_group_id: number | null;
  rank_group_name: string | null;
  division_code: string | null;
  division_name: string | null;
  dept_code: string | null;
  section_code: string | null;
};

type RoundEmployeeRow = {
  round_employee_id: number;
  round_id: number;
  round_code: string;
  round_status_type: number;
  payroll_no: string;
  employee_full_name: string;
  position_code: string | null;
  position_name: string | null;
  rank_code: string | null;
  rank_name: string | null;
  rank_group_id: number | null;
  rank_group_name: string | null;
  division_code: string | null;
  division_name: string | null;
  dept_code: string | null;
  section_code: string | null;
  status_type: number;
};


type ExistingEmployeeRuleRow = {
  round_id: number;
  payroll_no: string;
  division_code: string | null;
};

type RankGroupOptionRow = {
  rank_group_id: number;
  rank_group_name: string;
};

type RoundEmployeesTableState = {
  page: number;
  pageSize: number;
  search: string;
  roundId: string;
  divisionCode: string;
  rankGroupId: string;
  status: string;
};

type RoundEmployeesPageResult = {
  rows: RoundEmployeeRow[];
  totalRows: number;
};

type RoundEmployeesTablePayload = {
  rows: RoundEmployeeRow[];
  totalRows: number;
  state: RoundEmployeesTableState;
};

type RoundEmployeesTableActionResult = {
  ok: boolean;
  type: "success" | "error" | "warning" | "info";
  message: string;
  table: RoundEmployeesTablePayload;
};


const ROUND_EMPLOYEES_TABLE_COOKIE = "competency_round_employees_table";

const DEFAULT_TABLE_STATE: RoundEmployeesTableState = {
  page: 1,
  pageSize: 25,
  search: "",
  roundId: "",
  divisionCode: "",
  rankGroupId: "",
  status: "",
};

type RoundEmployeesPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
    round_id?: string;
  }>;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}


function normalizeTableState(value: Partial<RoundEmployeesTableState> | null | undefined) {
  const pageSize = [25, 50, 100].includes(Number(value?.pageSize))
    ? Number(value?.pageSize)
    : DEFAULT_TABLE_STATE.pageSize;

  return {
    page: Math.max(1, Number(value?.page || DEFAULT_TABLE_STATE.page)),
    pageSize,
    search: String(value?.search || "").trim().slice(0, 100),
    roundId: String(value?.roundId || "").trim(),
    divisionCode: String(value?.divisionCode || "").trim(),
    rankGroupId: String(value?.rankGroupId || "").trim(),
    status: String(value?.status || "").trim(),
  };
}

async function getRoundEmployeesTableState() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(ROUND_EMPLOYEES_TABLE_COOKIE)?.value;

  if (!rawValue) {
    return DEFAULT_TABLE_STATE;
  }

  try {
    return normalizeTableState(JSON.parse(rawValue));
  } catch {
    return DEFAULT_TABLE_STATE;
  }
}

async function setRoundEmployeesTableState(state: RoundEmployeesTableState) {
  const cookieStore = await cookies();
  cookieStore.set(ROUND_EMPLOYEES_TABLE_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
}

function redirectWithAlert(
  type: "success" | "error" | "warning" | "info",
  message: string,
): never {
  const params = new URLSearchParams({
    alert_type: type,
    alert_message: message,
  });

  redirect(`/admin/round-employees?${params.toString()}`);
}

function roundStatusText(statusType: number) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";
  return `สถานะ ${statusType}`;
}

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

async function getDivisions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(CAST(s.code AS varchar(20)))) AS division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(s.thainame, s.englishname)) AS division_name
    FROM ${ssbDb()}.dbo.sysconfig s
    WHERE s.ctrlcode = '10028'
      AND LTRIM(RTRIM(CAST(s.code AS varchar(20)))) IN (
        SELECT DISTINCT LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20))))
        FROM ${ssbDb()}.dbo.PYREXT p
        WHERE p.terminatedate IS NULL
          AND p.[DIVISION] IS NOT NULL
          AND LEN(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20))))) = 3
      )
    ORDER BY division_name;
  `);

  return result.recordset as DivisionRow[];
}

async function getEmployeeOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT TOP 3000
      CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(p.PAYROLLNO) AS full_name,
      NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
      pv.PositionName AS position_name,
      NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
      ${ssbDb()}.dbo.GetSSBName(rs.thainame) AS rank_name,
      rg.rank_group_id,
      rg.rank_group_name,
      NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) AS division_name,
      NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
      NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code
    FROM ${ssbDb()}.dbo.PYREXT p
    JOIN dbo.competency_rank_group_map rgm
      ON rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
     AND rgm.active_status = 1
    JOIN dbo.competency_rank_group rg
      ON rg.rank_group_id = rgm.rank_group_id
     AND rg.active_status = 1
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
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.competency_excluded_section x
        WHERE x.active_status = 1
          AND LTRIM(RTRIM(CAST(x.section_code AS varchar(20)))) = LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20))))
      )
    ORDER BY ${ssbDb()}.dbo.GetUserFullName(p.PAYROLLNO);
  `);

  return result.recordset as EmployeeOptionRow[];
}

async function getExistingEmployeeRules() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      round_id,
      payroll_no,
      division_code
    FROM dbo.competency_round_employee;
  `);

  return result.recordset as ExistingEmployeeRuleRow[];
}

async function getRankGroupOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      rank_group_id,
      rank_group_name
    FROM dbo.competency_rank_group
    WHERE active_status = 1
    ORDER BY sort_order, rank_group_name;
  `);

  return result.recordset as RankGroupOptionRow[];
}

function buildRoundEmployeeWhereClause(state: RoundEmployeesTableState) {
  const whereParts = ["1 = 1"];

  if (state.search) {
    whereParts.push(`
      (
        re.payroll_no LIKE @search_like
        OR ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) LIKE @search_like
        OR ISNULL(pv.PositionName, '') LIKE @search_like
        OR ISNULL(re.position_code, '') LIKE @search_like
        OR ISNULL(${ssbDb()}.dbo.GetSSBName(rs.thainame), '') LIKE @search_like
        OR ISNULL(re.rank_code, '') LIKE @search_like
        OR ISNULL(rg.rank_group_name, '') LIKE @search_like
        OR ISNULL(${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)), '') LIKE @search_like
        OR ISNULL(re.division_code, '') LIKE @search_like
        OR ISNULL(re.dept_code, '') LIKE @search_like
        OR ISNULL(re.section_code, '') LIKE @search_like
      )
    `);
  }

  if (state.roundId) {
    whereParts.push("re.round_id = @filter_round_id");
  }

  if (state.divisionCode) {
    whereParts.push("LTRIM(RTRIM(ISNULL(re.division_code, ''))) = @filter_division_code");
  }

  if (state.rankGroupId) {
    whereParts.push("re.rank_group_id = @filter_rank_group_id");
  }

  if (state.status) {
    whereParts.push("re.status_type = @filter_status");
  }

  return whereParts.join(" AND ");
}

function applyRoundEmployeeTableInputs(request: any, state: RoundEmployeesTableState) {
  if (state.search) {
    request.input("search_like", sql.NVarChar(150), `%${state.search}%`);
  }

  if (state.roundId) {
    request.input("filter_round_id", sql.Int, Number(state.roundId));
  }

  if (state.divisionCode) {
    request.input("filter_division_code", sql.VarChar(20), state.divisionCode);
  }

  if (state.rankGroupId) {
    request.input("filter_rank_group_id", sql.Int, Number(state.rankGroupId));
  }

  if (state.status) {
    request.input("filter_status", sql.Int, Number(state.status));
  }

  return request;
}

async function getRoundEmployeesPage(state: RoundEmployeesTableState) {
  const pool = await getDbPool();
  const whereClause = buildRoundEmployeeWhereClause(state);
  const baseFrom = `
    FROM dbo.competency_round_employee re
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
    LEFT JOIN dbo.competency_rank_group rg
      ON rg.rank_group_id = re.rank_group_id
    LEFT JOIN ${ssbDb()}.dbo.PositionView pv
      ON pv.PositionCode = re.position_code
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG rs
      ON rs.CODE = re.rank_code
     AND rs.CTRLCODE = '60010'
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = re.division_code
     AND ds.CTRLCODE = '10028'
    WHERE ${whereClause}
  `;

  const countRequest = applyRoundEmployeeTableInputs(pool.request(), state);
  const countResult = await countRequest.query(`
    SELECT COUNT(1) AS total_rows
    ${baseFrom};
  `);

  const totalRows = Number(countResult.recordset[0]?.total_rows || 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
  const safePage = Math.min(state.page, totalPages);
  const safeOffset = totalRows === 0 ? 0 : (safePage - 1) * state.pageSize;

  const rowsRequest = applyRoundEmployeeTableInputs(pool.request(), state)
    .input("offset", sql.Int, safeOffset)
    .input("page_size", sql.Int, state.pageSize);

  const rowsResult = await rowsRequest.query(`
    SELECT
      re.round_employee_id,
      re.round_id,
      r.round_code,
      r.status_type AS round_status_type,
      re.payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(re.payroll_no) AS employee_full_name,
      re.position_code,
      pv.PositionName AS position_name,
      re.rank_code,
      ${ssbDb()}.dbo.GetSSBName(rs.thainame) AS rank_name,
      re.rank_group_id,
      rg.rank_group_name,
      re.division_code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(ds.thainame, ds.englishname)) AS division_name,
      re.dept_code,
      re.section_code,
      re.status_type
    ${baseFrom}
    ORDER BY r.round_year DESC, r.round_no DESC, re.division_code, re.payroll_no
    OFFSET @offset ROWS
    FETCH NEXT @page_size ROWS ONLY;
  `);

  return {
    rows: rowsResult.recordset as RoundEmployeeRow[],
    totalRows,
  } satisfies RoundEmployeesPageResult;
}

async function getRoundDraftInfo(roundId: number) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .query(`
      SELECT TOP 1 round_id, round_code, status_type
      FROM dbo.competency_round
      WHERE round_id = @round_id;
    `);

  const round = result.recordset[0] as RoundRow | undefined;

  if (!round) {
    redirectWithAlert("error", "ไม่พบรอบประเมินที่เลือก");
  }

  if (Number(round.status_type) !== 0) {
    redirectWithAlert(
      "error",
      `รอบ ${round.round_code} อยู่สถานะ ${roundStatusText(Number(round.status_type))} ไม่สามารถแก้ไขผู้ถูกประเมินได้`,
    );
  }

  return round;
}

async function getEmployeeSnapshot(payrollNo: string) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input("payroll_no", sql.VarChar(20), payrollNo)
    .query(`
      SELECT TOP 1
        CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
        NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
        NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
        rg.rank_group_id,
        NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
        NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
        NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code,
        CASE WHEN x.excluded_section_id IS NULL THEN 0 ELSE 1 END AS is_section_excluded
      FROM ${ssbDb()}.dbo.PYREXT p
      JOIN dbo.competency_rank_group_map rgm
        ON rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
       AND rgm.active_status = 1
      JOIN dbo.competency_rank_group rg
        ON rg.rank_group_id = rgm.rank_group_id
       AND rg.active_status = 1
      LEFT JOIN dbo.competency_excluded_section x
        ON x.active_status = 1
       AND LTRIM(RTRIM(CAST(x.section_code AS varchar(20)))) = LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20))))
      WHERE p.TERMINATEDATE IS NULL
        AND CAST(p.PAYROLLNO AS varchar(20)) = @payroll_no;
    `);

  return result.recordset[0] as
    | {
        payroll_no: string;
        position_code: string | null;
        rank_code: string | null;
        rank_group_id: number;
        division_code: string | null;
        dept_code: string | null;
        section_code: string | null;
        is_section_excluded: number;
      }
    | undefined;
}


async function getRoundEmployeesTablePayload(
  inputState: Partial<RoundEmployeesTableState> | RoundEmployeesTableState,
): Promise<RoundEmployeesTablePayload> {
  const state = normalizeTableState(inputState);
  const pageResult = await getRoundEmployeesPage(state);
  const totalPages = Math.max(1, Math.ceil(pageResult.totalRows / state.pageSize));
  const safePage = Math.min(state.page, totalPages);
  const safeState = { ...state, page: safePage };

  await setRoundEmployeesTableState(safeState);

  return {
    rows: pageResult.rows,
    totalRows: pageResult.totalRows,
    state: safeState,
  };
}

async function loadRoundEmployeesTableClient(
  inputState: RoundEmployeesTableState,
): Promise<RoundEmployeesTableActionResult> {
  "use server";

  await requireAdminSession();

  const table = await getRoundEmployeesTablePayload(inputState);

  return {
    ok: true,
    type: "info",
    message: "",
    table,
  };
}

async function toggleRoundEmployeeStatusClient(
  roundEmployeeId: number,
  nextStatusType: number,
  inputState: RoundEmployeesTableState,
): Promise<RoundEmployeesTableActionResult> {
  "use server";

  await requireAdminSession();

  const tableBefore = await getRoundEmployeesTablePayload(inputState);

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
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .query(`
      SELECT TOP 1
        re.round_employee_id,
        re.status_type,
        r.round_code,
        r.status_type AS round_status_type
      FROM dbo.competency_round_employee re
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      WHERE re.round_employee_id = @round_employee_id;
    `);

  const checkedRow = checkResult.recordset[0] as
    | {
        round_employee_id: number;
        status_type: number;
        round_code: string;
        round_status_type: number;
      }
    | undefined;

  if (!checkedRow) {
    return {
      ok: false,
      type: "error",
      message: "ไม่พบข้อมูลผู้ถูกประเมิน",
      table: tableBefore,
    };
  }

  if (Number(checkedRow.round_status_type) !== 0) {
    return {
      ok: false,
      type: "warning",
      message: `รอบ ${checkedRow.round_code} อยู่สถานะ ${roundStatusText(Number(checkedRow.round_status_type))} ไม่สามารถแก้ไขผู้ถูกประเมินได้`,
      table: tableBefore,
    };
  }

  const statusType = Number(nextStatusType) === 9 ? 9 : 0;

  await pool
    .request()
    .input("round_employee_id", sql.Int, roundEmployeeId)
    .input("status_type", sql.Int, statusType)
    .query(`
      UPDATE dbo.competency_round_employee
      SET status_type = @status_type
      WHERE round_employee_id = @round_employee_id;
    `);

  revalidatePath("/admin/round-employees");

  const table = await getRoundEmployeesTablePayload(inputState);

  return {
    ok: true,
    type: "success",
    message: statusType === 9 ? "ยกเลิกผู้ถูกประเมินเรียบร้อยแล้ว" : "เปิดใช้งานผู้ถูกประเมินเรียบร้อยแล้ว",
    table,
  };
}

export default async function RoundEmployeesPage({
  searchParams,
}: RoundEmployeesPageProps) {
  await requireAdminSession();

  const alertParams = await searchParams;

  async function addRoundEmployee(formData: FormData) {
    "use server";

    await requireAdminSession();

    const roundId = Number(formData.get("round_id") || 0);
    const payrollNo = String(formData.get("payroll_no") || "").trim();

    if (!roundId) {
      redirectWithAlert("error", "กรุณาเลือกรอบประเมิน");
    }

    if (!payrollNo) {
      redirectWithAlert("error", "กรุณาเลือกผู้ถูกประเมิน");
    }

    await getRoundDraftInfo(roundId);

    const employee = await getEmployeeSnapshot(payrollNo);

    if (!employee) {
      redirectWithAlert(
        "error",
        "ไม่พบข้อมูลเจ้าหน้าที่ หรือยังไม่ได้ map ระดับเข้ากับกลุ่มระดับการถูกประเมิน",
      );
    }

    if (Number(employee.is_section_excluded || 0) === 1) {
      redirectWithAlert(
        "warning",
        "เจ้าหน้าที่คนนี้อยู่ในหน่วยเบิกที่ตั้งค่าไม่ต้องประเมิน จึงไม่สามารถเพิ่มเข้ารอบได้",
      );
    }

    const pool = await getDbPool();

    const duplicateResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .input("payroll_no", sql.VarChar(20), employee.payroll_no)
      .query(`
        SELECT TOP 1 round_employee_id, status_type
        FROM dbo.competency_round_employee
        WHERE round_id = @round_id
          AND payroll_no = @payroll_no;
      `);

    if (duplicateResult.recordset.length > 0) {
      redirectWithAlert(
        "warning",
        "เจ้าหน้าที่คนนี้ถูกเพิ่มเข้ารอบประเมินนี้แล้ว ถ้าถูกยกเลิกให้เปิดใช้งานกลับจากตารางด้านล่าง",
      );
    }

    await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .input("payroll_no", sql.VarChar(20), employee.payroll_no)
      .input("position_code", sql.VarChar(20), employee.position_code)
      .input("rank_code", sql.VarChar(20), employee.rank_code)
      .input("rank_group_id", sql.Int, employee.rank_group_id)
      .input("division_code", sql.VarChar(20), employee.division_code)
      .input("dept_code", sql.VarChar(20), employee.dept_code)
      .input("section_code", sql.VarChar(20), employee.section_code)
      .query(`
        INSERT INTO dbo.competency_round_employee
          (round_id, payroll_no, position_code, rank_code, rank_group_id, division_code, dept_code, section_code, status_type)
        VALUES
          (@round_id, @payroll_no, @position_code, @rank_code, @rank_group_id, @division_code, @dept_code, @section_code, 0);
      `);

    revalidatePath("/admin/round-employees");
    redirectWithAlert("success", "เพิ่มผู้ถูกประเมินเข้ารอบเรียบร้อยแล้ว");
  }

  async function importDivisionEmployees(formData: FormData) {
    "use server";

    await requireAdminSession();

    const roundId = Number(formData.get("round_id") || 0);
    const divisionCode = String(formData.get("division_code") || "").trim();

    if (!roundId) {
      redirectWithAlert("error", "กรุณาเลือกรอบประเมิน");
    }

    if (!divisionCode) {
      redirectWithAlert("error", "กรุณาเลือกกลุ่มภารกิจ");
    }

    await getRoundDraftInfo(roundId);

    const pool = await getDbPool();

    const existingDivisionResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .input("division_code", sql.VarChar(20), divisionCode)
      .query(`
        SELECT TOP 1 round_employee_id
        FROM dbo.competency_round_employee
        WHERE round_id = @round_id
          AND LTRIM(RTRIM(ISNULL(division_code, ''))) = @division_code;
      `);

    if (existingDivisionResult.recordset.length > 0) {
      redirectWithAlert(
        "warning",
        "กลุ่มภารกิจนี้มีผู้ถูกประเมินอยู่ในรอบนี้แล้ว ถ้าต้องการแก้ไขรายชื่อให้จัดการจากตารางด้านล่าง",
      );
    }

    const insertResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .input("division_code", sql.VarChar(20), divisionCode)
      .query(`
        INSERT INTO dbo.competency_round_employee
          (round_id, payroll_no, position_code, rank_code, rank_group_id, division_code, dept_code, section_code, status_type)
        SELECT
          @round_id,
          CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
          NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
          NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
          rg.rank_group_id,
          NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
          NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
          NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code,
          0 AS status_type
        FROM ${ssbDb()}.dbo.PYREXT p
        JOIN dbo.competency_rank_group_map rgm
          ON rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
         AND rgm.active_status = 1
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = rgm.rank_group_id
         AND rg.active_status = 1
        WHERE p.TERMINATEDATE IS NULL
          AND p.PAYROLLNO IS NOT NULL
          AND LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))) = @division_code
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_excluded_section x
            WHERE x.active_status = 1
              AND LTRIM(RTRIM(CAST(x.section_code AS varchar(20)))) = LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20))))
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_round_employee re
            WHERE re.round_id = @round_id
              AND re.payroll_no = CAST(p.PAYROLLNO AS varchar(20))
          );
      `);

    const insertedCount = insertResult.rowsAffected.reduce(
      (sum, count) => sum + count,
      0,
    );

    if (insertedCount === 0) {
      redirectWithAlert(
        "warning",
        "ไม่พบเจ้าหน้าที่ในกลุ่มภารกิจนี้ที่สามารถนำเข้าได้ หรือเจ้าหน้าที่ถูกเพิ่มเข้ารอบแล้ว",
      );
    }

    revalidatePath("/admin/round-employees");
    redirectWithAlert(
      "success",
      `นำเข้าผู้ถูกประเมินตามกลุ่มภารกิจเรียบร้อยแล้ว ${insertedCount} รายการ`,
    );
  }

  async function importAllEmployees(formData: FormData) {
    "use server";

    await requireAdminSession();

    const roundId = Number(formData.get("round_id") || 0);

    if (!roundId) {
      redirectWithAlert("error", "กรุณาเลือกรอบประเมิน");
    }

    await getRoundDraftInfo(roundId);

    const pool = await getDbPool();

    const insertResult = await pool
      .request()
      .input("round_id", sql.Int, roundId)
      .query(`
        INSERT INTO dbo.competency_round_employee
          (round_id, payroll_no, position_code, rank_code, rank_group_id, division_code, dept_code, section_code, status_type)
        SELECT
          @round_id,
          CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
          NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
          NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
          rg.rank_group_id,
          NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
          NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
          NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code,
          0 AS status_type
        FROM ${ssbDb()}.dbo.PYREXT p
        JOIN dbo.competency_rank_group_map rgm
          ON rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
         AND rgm.active_status = 1
        JOIN dbo.competency_rank_group rg
          ON rg.rank_group_id = rgm.rank_group_id
         AND rg.active_status = 1
        WHERE p.TERMINATEDATE IS NULL
          AND p.PAYROLLNO IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_excluded_section x
            WHERE x.active_status = 1
              AND LTRIM(RTRIM(CAST(x.section_code AS varchar(20)))) = LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20))))
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_round_employee re
            WHERE re.round_id = @round_id
              AND re.payroll_no = CAST(p.PAYROLLNO AS varchar(20))
          );
      `);

    const insertedCount = insertResult.rowsAffected.reduce(
      (sum, count) => sum + count,
      0,
    );

    if (insertedCount === 0) {
      redirectWithAlert(
        "warning",
        "ไม่พบเจ้าหน้าที่ที่สามารถนำเข้าเพิ่มได้ หรือเจ้าหน้าที่ที่เข้าเงื่อนไขถูกเพิ่มเข้ารอบครบแล้ว",
      );
    }

    revalidatePath("/admin/round-employees");
    redirectWithAlert(
      "success",
      `นำเข้าผู้ถูกประเมินทั้งโรงพยาบาลเรียบร้อยแล้ว ${insertedCount} รายการ`,
    );
  }

  const tableState = await getRoundEmployeesTableState();

  const [
    rounds,
    divisions,
    employeeOptions,
    existingEmployeeRuleRows,
    rankGroups,
    roundEmployeesPage,
  ] = await Promise.all([
    getRounds(),
    getDivisions(),
    getEmployeeOptions(),
    getExistingEmployeeRules(),
    getRankGroupOptions(),
    getRoundEmployeesPage(tableState),
  ]);

  const roundEmployees = roundEmployeesPage.rows;
  const totalRows = roundEmployeesPage.totalRows;
  const totalPages = Math.max(1, Math.ceil(totalRows / tableState.pageSize));
  const currentPage = Math.min(tableState.page, totalPages);

  const draftRounds = rounds.filter((round) => Number(round.status_type) === 0);

  const roundOptions = draftRounds.map((round) => ({
    value: String(round.round_id),
    label: `${round.round_code} - ${roundStatusText(Number(round.status_type))}`,
  }));

  const employeeSelectOptions = employeeOptions.map((employee) => ({
    value: employee.payroll_no,
    label: `${employee.full_name} (${employee.payroll_no}) - ${employee.position_name ?? employee.position_code ?? "ไม่ระบุวิชาชีพ"} / ${employee.rank_group_name ?? "ยังไม่มีกลุ่มระดับ"}`,
  }));

  const divisionOptions = divisions.map((division) => ({
    value: division.division_code,
    label: `${division.division_name} (${division.division_code})`,
  }));

  const existingEmployeeRules = existingEmployeeRuleRows.map((row) => ({
    round_id: row.round_id,
    payroll_no: row.payroll_no,
    division_code: row.division_code ?? "",
  }));

  const roundFilterOptions = rounds.map((round) => ({
    value: String(round.round_id),
    label: `${round.round_code} - ${roundStatusText(Number(round.status_type))}`,
  }));

  const divisionFilterOptions = divisions.map((division) => ({
    value: division.division_code,
    label: division.division_name,
  }));

  const rankGroupFilterOptions = rankGroups.map((rankGroup) => ({
    value: String(rankGroup.rank_group_id),
    label: rankGroup.rank_group_name,
  }));

  return (
    <div>
      <ActionAlert
        type={alertParams?.alert_type}
        message={alertParams?.alert_message}
      />

      <PageHeader
        title="จัดผู้ถูกประเมินเข้ารอบประเมิน"
        description=""
      />

      {draftRounds.length === 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
          ไม่มีรอบสถานะร่างสำหรับเพิ่มผู้ถูกประเมิน ถ้ารอบเปิดประเมินแล้วจะไม่สามารถแก้ไขรายชื่อได้
        </div>
      )}

      <RoundEmployeeForm
        roundOptions={roundOptions}
        employeeOptions={employeeSelectOptions}
        divisionOptions={divisionOptions}
        existingEmployeeRules={existingEmployeeRules}
        addRoundEmployeeAction={addRoundEmployee}
        importDivisionEmployeesAction={importDivisionEmployees}
        importAllEmployeesAction={importAllEmployees}
      />

      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          รายชื่อผู้ถูกประเมินในรอบ
        </h2>
      </div>

      <RoundEmployeesTableClient
        initialRows={roundEmployees}
        initialTotalRows={totalRows}
        initialState={{ ...tableState, page: currentPage }}
        roundOptions={roundFilterOptions}
        divisionOptions={divisionFilterOptions}
        rankGroupOptions={rankGroupFilterOptions}
        loadTableAction={loadRoundEmployeesTableClient}
        toggleStatusAction={toggleRoundEmployeeStatusClient}
      />
    </div>
  );
}
