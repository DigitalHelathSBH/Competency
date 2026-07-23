import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import DateInput from "@/components/competency/DateInput";
import RoundTemplateCopyForm from "@/components/competency/RoundTemplateCopyForm";
import { getRounds, safeFetch, statusText } from "@/lib/competency";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { formatThaiDate } from "@/lib/date-format";

export const dynamic = "force-dynamic";

type AdminRoundsPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function getCurrentFiscalYearBE(date = new Date()) {
  const adYear = date.getFullYear();
  const month = date.getMonth() + 1;

  // ปีงบไทย: ต.ค. - ธ.ค. ให้นับเป็นปีงบถัดไป
  if (month >= 10) {
    return adYear + 544;
  }

  return adYear + 543;
}

function getDefaultRoundDates(roundYearBE: number, roundNo: number) {
  const fiscalEndYearAD = roundYearBE - 543;
  const fiscalStartYearAD = fiscalEndYearAD - 1;

  if (roundNo === 1) {
    return {
      startDate: `${fiscalStartYearAD}-10-01`,
      endDate: `${fiscalEndYearAD}-03-31`,
    };
  }

  return {
    startDate: `${fiscalEndYearAD}-04-01`,
    endDate: `${fiscalEndYearAD}-09-30`,
  };
}

function redirectWithAlert(
  type: "success" | "error" | "warning" | "info",
  message: string,
): never {
  const params = new URLSearchParams({
    alert_type: type,
    alert_message: message,
  });

  redirect(`/admin/rounds?${params.toString()}`);
}

function getRoundStatusBadge(statusType: number) {
  if (statusType === 0) {
    return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }

  if (statusType === 1) {
    return "inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]";
  }

  if (statusType === 2) {
    return "inline-flex rounded-full bg-[#23c6c8]/10 px-2.5 py-1 text-xs font-medium text-[#23c6c8]";
  }

  return "inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]";
}

const ROUND_EDIT_COOKIE = "competency_round_edit_id";


type RoundModuleStatusRow = {
  round_id: number;
  competency_status_type: number;
  kpi_status_type: number;
};

type RoundWithModuleStatus = Awaited<ReturnType<typeof getRounds>>[number] & {
  competency_status_type: number;
  kpi_status_type: number;
};

function moduleStatusText(statusType: number) {
  if (statusType === 0) return "ยังไม่เปิด";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดประเมิน";
  return "ไม่ทราบสถานะ";
}

function getModuleStatusBadge(statusType: number) {
  if (statusType === 0) {
    return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }

  if (statusType === 1) {
    return "inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]";
  }

  if (statusType === 2) {
    return "inline-flex rounded-full bg-[#23c6c8]/10 px-2.5 py-1 text-xs font-medium text-[#23c6c8]";
  }

  return "inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]";
}

async function getRoundModuleStatuses(): Promise<RoundModuleStatusRow[]> {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      r.round_id,
      ISNULL(
        MAX(
          CASE
            WHEN m.module_type = 'COMPETENCY'
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
    LEFT JOIN dbo.performance_round_module m
      ON m.round_id = r.round_id
    WHERE r.status_type <> 9
    GROUP BY r.round_id;
  `);

  return result.recordset.map((row) => ({
    round_id: Number(row.round_id),
    competency_status_type: Number(row.competency_status_type || 0),
    kpi_status_type: Number(row.kpi_status_type || 0),
  }));
}

function getRoundOptionLabel(round: {
  round_code: string;
  status_type: number;
}) {
  return `${round.round_code} (${statusText(round.status_type, "round")})`;
}

export default async function AdminRoundsPage({
  searchParams,
}: AdminRoundsPageProps) {
  await requireAdminSession();
  const params = await searchParams;

  async function submitCreateRound(formData: FormData) {
    "use server";

    const currentSession = await requireAdminSession();

    const roundYear = Number(formData.get("round_year"));
    const roundNo = Number(formData.get("round_no"));
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim();

    if (!Number.isInteger(roundYear) || roundYear < 2500) {
      redirectWithAlert("error", "ปีงบประมาณไม่ถูกต้อง");
    }

    if (!Number.isInteger(roundNo) || roundNo < 1 || roundNo > 2) {
      redirectWithAlert("error", "รอบประเมินต้องเป็นรอบ 1 หรือ 2 เท่านั้น");
    }

    if (!startDate || !endDate) {
      redirectWithAlert("error", "กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด");
    }

    if (startDate > endDate) {
      redirectWithAlert("error", "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    let failureMessage = "";

    try {
      await transaction.begin();

      const draftCheck = await new sql.Request(transaction).query(`
        SELECT COUNT(*) AS draft_count
        FROM dbo.competency_round WITH (UPDLOCK, HOLDLOCK)
        WHERE status_type = 0;
      `);

      const draftCount = Number(draftCheck.recordset[0]?.draft_count || 0);
      if (draftCount > 0) {
        failureMessage =
          "มีรอบประเมินสถานะร่างอยู่แล้ว กรุณาแก้ไขหรือเปิดรอบเดิมก่อนสร้างรอบใหม่";
        await transaction.rollback();
      } else {
        const checkResult = await new sql.Request(transaction).input(
          "round_year",
          sql.SmallInt,
          roundYear,
        ).query(`
            SELECT ISNULL(MAX(round_no), 0) AS max_round_no
            FROM dbo.competency_round WITH (UPDLOCK, HOLDLOCK)
            WHERE round_year = @round_year
              AND status_type <> 9;
          `);

        const maxRoundNo = Number(checkResult.recordset[0]?.max_round_no ?? 0);
        const expectedRoundNo = maxRoundNo + 1;

        if (expectedRoundNo > 2) {
          failureMessage = `ปีงบ ${roundYear} มีรอบประเมินครบ 2 รอบแล้ว`;
          await transaction.rollback();
        } else if (roundNo !== expectedRoundNo) {
          failureMessage = `ปีงบ ${roundYear} ต้องสร้างรอบ ${expectedRoundNo} เป็นลำดับถัดไปเท่านั้น`;
          await transaction.rollback();
        } else {
          const roundCode = `${roundYear}/${roundNo}`;

          await new sql.Request(transaction)
            .input("round_year", sql.SmallInt, roundYear)
            .input("round_no", sql.TinyInt, roundNo)
            .input("round_code", sql.VarChar(20), roundCode)
            .input("start_date", sql.Date, startDate)
            .input("end_date", sql.Date, endDate)
            .input("created_by", sql.VarChar(20), currentSession.emp_id).query(`
              INSERT INTO dbo.competency_round
                (
                  round_year,
                  round_no,
                  round_code,
                  start_date,
                  end_date,
                  status_type,
                  created_by
                )
              VALUES
                (
                  @round_year,
                  @round_no,
                  @round_code,
                  @start_date,
                  @end_date,
                  0,
                  @created_by
                );
            `);

          await transaction.commit();
        }
      }
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback error
      }

      console.error(error);
      redirectWithAlert("error", "ไม่สามารถสร้างรอบประเมินได้");
    }

    if (failureMessage) {
      redirectWithAlert("warning", failureMessage);
    }

    revalidatePath("/admin/rounds");
    redirectWithAlert("success", "สร้างรอบประเมินเรียบร้อยแล้ว");
  }

  async function startEditRound(formData: FormData) {
    "use server";

    await requireAdminSession();

    const roundId = Number(formData.get("round_id") || 0);
    if (!Number.isInteger(roundId) || roundId <= 0) {
      redirectWithAlert("error", "ข้อมูลรอบประเมินไม่ถูกต้อง");
    }

    const cookieStore = await cookies();
    cookieStore.set(ROUND_EDIT_COOKIE, String(roundId), {
      httpOnly: true,
      sameSite: "lax",
      path: "/admin/rounds",
      maxAge: 5 * 60,
    });

    redirect("/admin/rounds");
  }

  async function clearEditRound() {
    "use server";

    await requireAdminSession();

    const cookieStore = await cookies();
    cookieStore.delete(ROUND_EDIT_COOKIE);

    redirect("/admin/rounds");
  }

  async function updateDraftRound(formData: FormData) {
    "use server";

    await requireAdminSession();

    const roundId = Number(formData.get("round_id"));
    const roundCode = String(formData.get("round_code") || "").trim();
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim();

    if (!Number.isInteger(roundId) || roundId <= 0) {
      redirectWithAlert("error", "ข้อมูลรอบประเมินไม่ถูกต้อง");
    }

    if (!roundCode) {
      redirectWithAlert("error", "กรุณาระบุชื่อรอบประเมิน");
    }

    if (!startDate || !endDate) {
      redirectWithAlert("error", "กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด");
    }

    if (startDate > endDate) {
      redirectWithAlert("error", "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    let updated = false;

    try {
      await transaction.begin();

      const result = await new sql.Request(transaction)
        .input("round_id", sql.Int, roundId)
        .input("round_code", sql.VarChar(20), roundCode)
        .input("start_date", sql.Date, startDate)
        .input("end_date", sql.Date, endDate).query(`
          UPDATE dbo.competency_round
          SET round_code = @round_code,
              start_date = @start_date,
              end_date = @end_date
          WHERE round_id = @round_id
            AND status_type = 0
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.competency_round other_round
              WHERE other_round.round_code = @round_code
                AND other_round.round_id <> @round_id
                AND other_round.status_type <> 9
            );

          SELECT @@ROWCOUNT AS affected_rows;
        `);

      updated = Number(result.recordset[0]?.affected_rows || 0) > 0;

      if (!updated) {
        await transaction.rollback();
      } else {
        await new sql.Request(transaction)
          .input("round_id", sql.Int, roundId)
          .input("start_date", sql.Date, startDate).query(`
            WITH employee_base AS (
              SELECT
                re.round_employee_id,
                NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code,
                NULLIF(LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))), '') AS site_code,
                TRY_CONVERT(date, p.FIRSTEMPLOYEEDATE) AS first_employee_date
              FROM dbo.competency_round_employee re
              JOIN ${ssbDb()}.dbo.PYREXT p
                ON CAST(p.PAYROLLNO AS varchar(20)) = re.payroll_no
               AND p.TERMINATEDATE IS NULL
              WHERE re.round_id = @round_id
            ),
            employee_calc AS (
              SELECT
                b.*,
                CASE
                  WHEN b.first_employee_date IS NULL
                    OR b.first_employee_date > @start_date
                  THEN NULL
                  ELSE
                    DATEDIFF(YEAR, b.first_employee_date, @start_date)
                    - CASE
                        WHEN DATEADD(
                          YEAR,
                          DATEDIFF(YEAR, b.first_employee_date, @start_date),
                          b.first_employee_date
                        ) > @start_date
                        THEN 1
                        ELSE 0
                      END
                END AS service_year,
                CASE WHEN ISNULL(b.site_code, '') = '1' THEN 'RANK' ELSE 'TENURE' END AS rank_group_source
              FROM employee_base b
            ),
            employee_resolved AS (
              SELECT
                c.*,
                CASE
                  WHEN c.rank_group_source = 'RANK' THEN rank_map.rank_group_id
                  ELSE tenure_map.rank_group_id
                END AS rank_group_id,
                CAST(ISNULL(site_percent.competency_percent, 20) AS decimal(5,2)) AS competency_percent
              FROM employee_calc c
              OUTER APPLY (
                SELECT TOP 1 rg.rank_group_id
                FROM dbo.competency_rank_group_map rgm
                JOIN dbo.competency_rank_group rg
                  ON rg.rank_group_id = rgm.rank_group_id
                 AND rg.active_status = 1
                WHERE rgm.active_status = 1
                  AND rgm.rank_code = c.rank_code
                ORDER BY rgm.rank_group_map_id DESC
              ) rank_map
              OUTER APPLY (
                SELECT TOP 1 rg.rank_group_id
                FROM dbo.competency_tenure_rank_group trg
                JOIN dbo.competency_rank_group rg
                  ON rg.rank_group_id = trg.rank_group_id
                 AND rg.active_status = 1
                WHERE trg.active_status = 1
                  AND c.service_year IS NOT NULL
                  AND c.service_year >= trg.min_service_year
                  AND (trg.max_service_year IS NULL OR c.service_year < trg.max_service_year)
                ORDER BY trg.min_service_year DESC, trg.tenure_rank_group_id DESC
              ) tenure_map
              OUTER APPLY (
                SELECT TOP 1 sp.competency_percent
                FROM dbo.competency_site_percent sp
                WHERE sp.active_status = 1
                  AND sp.site_code = c.site_code
                ORDER BY sp.site_percent_id DESC
              ) site_percent
            )
            UPDATE re
            SET position_code = src.position_code,
                rank_code = src.rank_code,
                rank_group_id = src.rank_group_id,
                division_code = src.division_code,
                dept_code = src.dept_code,
                section_code = src.section_code,
                site_code = src.site_code,
                first_employee_date = src.first_employee_date,
                service_year = src.service_year,
                rank_group_source = src.rank_group_source,
                competency_percent = src.competency_percent
            FROM dbo.competency_round_employee re
            JOIN employee_resolved src
              ON src.round_employee_id = re.round_employee_id
            WHERE re.round_id = @round_id;
          `);

        await transaction.commit();
      }
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback error
      }

      console.error(error);
      redirectWithAlert("error", "ไม่สามารถแก้ไขรอบประเมินได้");
    }

    if (!updated) {
      redirectWithAlert(
        "warning",
        "ไม่สามารถแก้ไขได้ อาจไม่ใช่สถานะร่าง หรือชื่อรอบซ้ำกับรอบอื่น",
      );
    }

    const cookieStore = await cookies();
    cookieStore.delete(ROUND_EDIT_COOKIE);

    revalidatePath("/admin/rounds");
    revalidatePath("/admin/round-employees");
    redirectWithAlert("success", "แก้ไขรอบประเมินเรียบร้อยแล้ว");
  }

  async function copyRoundTemplate(formData: FormData) {
    "use server";

    const currentSession = await requireAdminSession();

    const targetRoundId = Number(formData.get("target_round_id") || 0);
    const sourceRoundId = Number(formData.get("source_round_id") || 0);
    const copyEmployees = formData.get("copy_employees") === "1";
    const copyAssignments = formData.get("copy_assignments") === "1";
    const copyWeights = formData.get("copy_weights") === "1";

    if (!targetRoundId || !sourceRoundId) {
      redirectWithAlert("error", "กรุณาเลือกรอบต้นทางและรอบปลายทาง");
    }

    if (targetRoundId === sourceRoundId) {
      redirectWithAlert(
        "warning",
        "รอบต้นทางและรอบปลายทางต้องไม่ใช่รอบเดียวกัน",
      );
    }

    if (!copyEmployees && !copyAssignments && !copyWeights) {
      redirectWithAlert(
        "warning",
        "กรุณาเลือกรายการที่ต้องการคัดลอกอย่างน้อย 1 รายการ",
      );
    }

    const pool = await getDbPool();

    const targetResult = await pool
      .request()
      .input("target_round_id", sql.Int, targetRoundId).query(`
        SELECT TOP 1 round_id, round_code, status_type
        FROM dbo.competency_round
        WHERE round_id = @target_round_id;
      `);

    const targetRound = targetResult.recordset[0];
    if (!targetRound) {
      redirectWithAlert("error", "ไม่พบรอบปลายทาง");
    }

    if (Number(targetRound.status_type) !== 0) {
      redirectWithAlert(
        "warning",
        "คัดลอกได้เฉพาะรอบปลายทางที่ยังเป็นสถานะร่างเท่านั้น",
      );
    }

    const sourceResult = await pool
      .request()
      .input("source_round_id", sql.Int, sourceRoundId).query(`
        SELECT TOP 1 round_id, round_code, status_type
        FROM dbo.competency_round
        WHERE round_id = @source_round_id
          AND status_type <> 9;
      `);

    const sourceRound = sourceResult.recordset[0];
    if (!sourceRound) {
      redirectWithAlert("error", "ไม่พบรอบต้นทาง หรือรอบต้นทางถูกยกเลิกแล้ว");
    }

    const transaction = new sql.Transaction(pool);
    let employeeInsertedCount = 0;
    let assignmentInsertedCount = 0;
    let weightInsertedCount = 0;

    try {
      await transaction.begin();

      if (copyWeights) {
        const weightResult = await new sql.Request(transaction)
          .input("source_round_id", sql.Int, sourceRoundId)
          .input("target_round_id", sql.Int, targetRoundId)
          .input("created_by", sql.VarChar(20), currentSession.emp_id).query(`
            DECLARE @inserted int;

            INSERT INTO dbo.competency_evaluator_weight
              (round_id, division_code, evaluator_level, weight_percent, active_status, created_by)
            SELECT
              @target_round_id,
              w.division_code,
              w.evaluator_level,
              w.weight_percent,
              1,
              @created_by
            FROM dbo.competency_evaluator_weight w
            WHERE w.round_id = @source_round_id
              AND w.active_status = 1
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_evaluator_weight tw
                WHERE tw.round_id = @target_round_id
                  AND ISNULL(LTRIM(RTRIM(tw.division_code)), '') = ISNULL(LTRIM(RTRIM(w.division_code)), '')
                  AND tw.evaluator_level = w.evaluator_level
                  AND tw.active_status = 1
              );

            SET @inserted = @@ROWCOUNT;
            SELECT @inserted AS inserted_count;
          `);

        weightInsertedCount = Number(
          weightResult.recordset[0]?.inserted_count || 0,
        );
      }

      if (copyEmployees) {
        const employeeResult = await new sql.Request(transaction)
          .input("source_round_id", sql.Int, sourceRoundId)
          .input("target_round_id", sql.Int, targetRoundId).query(`
            WITH employee_base_raw AS (
              SELECT
                CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
                NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
                NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code,
                NULLIF(LTRIM(RTRIM(CAST(p.SITECODE AS varchar(20)))), '') AS site_code,
                TRY_CONVERT(date, p.FIRSTEMPLOYEEDATE) AS first_employee_date,
                target_round.start_date,
                ROW_NUMBER() OVER (
                  PARTITION BY CAST(p.PAYROLLNO AS varchar(20))
                  ORDER BY src_re.round_employee_id DESC
                ) AS row_no
              FROM dbo.competency_round_employee src_re
              JOIN ${ssbDb()}.dbo.PYREXT p
                ON CAST(p.PAYROLLNO AS varchar(20)) = src_re.payroll_no
               AND p.TERMINATEDATE IS NULL
              JOIN dbo.competency_round target_round
                ON target_round.round_id = @target_round_id
              WHERE src_re.round_id = @source_round_id
                AND src_re.status_type <> 9
                AND p.PAYROLLNO IS NOT NULL
            ),
            employee_base AS (
              SELECT *
              FROM employee_base_raw
              WHERE row_no = 1
            ),
            employee_calc AS (
              SELECT
                b.*,
                CASE
                  WHEN b.first_employee_date IS NULL
                    OR b.first_employee_date > b.start_date
                  THEN NULL
                  ELSE
                    DATEDIFF(YEAR, b.first_employee_date, b.start_date)
                    - CASE
                        WHEN DATEADD(
                          YEAR,
                          DATEDIFF(YEAR, b.first_employee_date, b.start_date),
                          b.first_employee_date
                        ) > b.start_date
                        THEN 1
                        ELSE 0
                      END
                END AS service_year,
                CASE WHEN ISNULL(b.site_code, '') = '1' THEN 'RANK' ELSE 'TENURE' END AS rank_group_source
              FROM employee_base b
            ),
            employee_resolved AS (
              SELECT
                c.*,
                CASE
                  WHEN c.rank_group_source = 'RANK' THEN rank_map.rank_group_id
                  ELSE tenure_map.rank_group_id
                END AS rank_group_id,
                CAST(ISNULL(site_percent.competency_percent, 20) AS decimal(5,2)) AS competency_percent
              FROM employee_calc c
              OUTER APPLY (
                SELECT TOP 1 rg.rank_group_id
                FROM dbo.competency_rank_group_map rgm
                JOIN dbo.competency_rank_group rg
                  ON rg.rank_group_id = rgm.rank_group_id
                 AND rg.active_status = 1
                WHERE rgm.active_status = 1
                  AND rgm.rank_code = c.rank_code
                ORDER BY rgm.rank_group_map_id DESC
              ) rank_map
              OUTER APPLY (
                SELECT TOP 1 rg.rank_group_id
                FROM dbo.competency_tenure_rank_group trg
                JOIN dbo.competency_rank_group rg
                  ON rg.rank_group_id = trg.rank_group_id
                 AND rg.active_status = 1
                WHERE trg.active_status = 1
                  AND c.service_year IS NOT NULL
                  AND c.service_year >= trg.min_service_year
                  AND (trg.max_service_year IS NULL OR c.service_year < trg.max_service_year)
                ORDER BY trg.min_service_year DESC, trg.tenure_rank_group_id DESC
              ) tenure_map
              OUTER APPLY (
                SELECT TOP 1 sp.competency_percent
                FROM dbo.competency_site_percent sp
                WHERE sp.active_status = 1
                  AND sp.site_code = c.site_code
                ORDER BY sp.site_percent_id DESC
              ) site_percent
            )
            INSERT INTO dbo.competency_round_employee
              (
                round_id,
                payroll_no,
                position_code,
                rank_code,
                rank_group_id,
                division_code,
                dept_code,
                section_code,
                site_code,
                first_employee_date,
                service_year,
                rank_group_source,
                competency_percent,
                status_type
              )
            SELECT
              @target_round_id,
              e.payroll_no,
              e.position_code,
              e.rank_code,
              e.rank_group_id,
              e.division_code,
              e.dept_code,
              e.section_code,
              e.site_code,
              e.first_employee_date,
              e.service_year,
              e.rank_group_source,
              e.competency_percent,
              0
            FROM employee_resolved e
            WHERE e.position_code IS NOT NULL
              AND e.division_code IS NOT NULL
              AND e.rank_group_id IS NOT NULL
              AND NOT (
                e.rank_group_source = 'TENURE'
                AND (e.first_employee_date IS NULL OR e.service_year IS NULL)
              )
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_excluded_section x
                WHERE x.active_status = 1
                  AND LTRIM(RTRIM(CAST(x.section_code AS varchar(20)))) = ISNULL(e.section_code, '')
              )
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_round_employee target_re
                WHERE target_re.round_id = @target_round_id
                  AND target_re.payroll_no = e.payroll_no
              );

            SELECT @@ROWCOUNT AS inserted_count;
          `);

        employeeInsertedCount = Number(
          employeeResult.recordset[0]?.inserted_count || 0,
        );
      }

      if (copyAssignments) {
        const assignmentResult = await new sql.Request(transaction)
          .input("source_round_id", sql.Int, sourceRoundId)
          .input("target_round_id", sql.Int, targetRoundId).query(`
            WITH evaluator_base AS (
              SELECT
                target_re.round_employee_id,
                target_re.payroll_no AS employee_payroll_no,
                target_re.rank_group_id AS employee_rank_group_id,
                src_a.evaluator_level,
                CAST(ev.PAYROLLNO AS varchar(20)) AS evaluator_payroll_no,
                NULLIF(LTRIM(RTRIM(CAST(ev.[RANK] AS varchar(20)))), '') AS evaluator_rank_code,
                NULLIF(LTRIM(RTRIM(CAST(ev.SITECODE AS varchar(20)))), '') AS evaluator_site_code,
                TRY_CONVERT(date, ev.FIRSTEMPLOYEEDATE) AS evaluator_first_employee_date,
                target_round.start_date
              FROM dbo.competency_evaluator_assignment src_a
              JOIN dbo.competency_round_employee src_re
                ON src_re.round_employee_id = src_a.round_employee_id
               AND src_re.round_id = @source_round_id
               AND src_re.status_type <> 9
              JOIN dbo.competency_round_employee target_re
                ON target_re.round_id = @target_round_id
               AND target_re.payroll_no = src_re.payroll_no
               AND target_re.status_type <> 9
              JOIN ${ssbDb()}.dbo.PYREXT ev
                ON CAST(ev.PAYROLLNO AS varchar(20)) = src_a.evaluator_payroll_no
               AND ev.TERMINATEDATE IS NULL
              JOIN dbo.competency_round target_round
                ON target_round.round_id = @target_round_id
              WHERE src_a.status_type <> 9
            ),
            evaluator_calc AS (
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
                CASE WHEN ISNULL(b.evaluator_site_code, '') = '1' THEN 'RANK' ELSE 'TENURE' END AS evaluator_rank_group_source
              FROM evaluator_base b
            ),
            evaluator_resolved AS (
              SELECT
                c.*,
                CASE
                  WHEN c.evaluator_rank_group_source = 'RANK' THEN rank_map.rank_group_id
                  ELSE tenure_map.rank_group_id
                END AS evaluator_rank_group_id
              FROM evaluator_calc c
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
                  AND (trg.max_service_year IS NULL OR c.evaluator_service_year < trg.max_service_year)
                ORDER BY trg.min_service_year DESC, trg.tenure_rank_group_id DESC
              ) tenure_map
            )
            INSERT INTO dbo.competency_evaluator_assignment
              (round_employee_id, evaluator_payroll_no, evaluator_level, status_type, submitted_date)
            SELECT DISTINCT
              e.round_employee_id,
              e.evaluator_payroll_no,
              e.evaluator_level,
              0,
              NULL
            FROM evaluator_resolved e
            JOIN dbo.competency_rank_group evaluator_group
              ON evaluator_group.rank_group_id = e.evaluator_rank_group_id
             AND evaluator_group.active_status = 1
            JOIN dbo.competency_rank_group employee_group
              ON employee_group.rank_group_id = e.employee_rank_group_id
             AND employee_group.active_status = 1
            WHERE e.employee_payroll_no <> e.evaluator_payroll_no
              AND evaluator_group.sort_order >= employee_group.sort_order
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_evaluator_assignment target_a
                WHERE target_a.round_employee_id = e.round_employee_id
                  AND target_a.evaluator_level = e.evaluator_level
                  AND target_a.status_type <> 9
              )
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_evaluator_assignment target_a
                WHERE target_a.round_employee_id = e.round_employee_id
                  AND target_a.evaluator_payroll_no = e.evaluator_payroll_no
                  AND target_a.status_type <> 9
              );

            SELECT @@ROWCOUNT AS inserted_count;
          `);

        assignmentInsertedCount = Number(
          assignmentResult.recordset[0]?.inserted_count || 0,
        );
      }

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback error
      }

      console.error(error);
      redirectWithAlert("error", "คัดลอกจากรอบก่อนไม่สำเร็จ");
    }

    revalidatePath("/admin/rounds");
    revalidatePath("/admin/round-employees");
    revalidatePath("/admin/assignments");
    revalidatePath("/admin/evaluator-weights");
    revalidatePath("/admin/round-readiness");

    const totalInserted =
      employeeInsertedCount + assignmentInsertedCount + weightInsertedCount;
    const summary = `ผู้ถูกประเมิน ${employeeInsertedCount.toLocaleString()} คน, ผู้ประเมิน ${assignmentInsertedCount.toLocaleString()} รายการ, น้ำหนัก ${weightInsertedCount.toLocaleString()} รายการ`;

    if (totalInserted === 0) {
      redirectWithAlert("warning", `ไม่พบข้อมูลใหม่ที่ต้องคัดลอก (${summary})`);
    }

    redirectWithAlert("success", `คัดลอกจากรอบก่อนเรียบร้อยแล้ว (${summary})`);
  }

  async function openCompetencyModule(formData: FormData) {
    "use server";

    const currentSession = await requireAdminSession();

    const roundId = Number(formData.get("round_id") || 0);
    if (!Number.isInteger(roundId) || roundId <= 0) {
      redirectWithAlert("error", "ข้อมูลรอบประเมินไม่ถูกต้อง");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    let alertType: "success" | "error" | "warning" | "info" = "success";
    let alertMessage = "เปิดรอบประเมินเรียบร้อยแล้ว";

    try {
      await transaction.begin();

      const request = () =>
        new sql.Request(transaction).input("round_id", sql.Int, roundId);

      const roundResult = await request().query(`
        SELECT TOP (1)
          r.round_id,
          r.round_code,
          r.start_date,
          r.status_type AS round_status_type,
          m.status_type AS module_status_type
        FROM dbo.competency_round r WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.performance_round_module m WITH (UPDLOCK, HOLDLOCK)
          ON m.round_id = r.round_id
         AND m.module_type = 'COMPETENCY'
        WHERE r.round_id = @round_id
          AND r.status_type <> 9;
      `);

      const round = roundResult.recordset[0];

      if (!round) {
        alertType = "error";
        alertMessage = "ไม่พบรอบประเมิน";
        await transaction.rollback();
      } else if (Number(round.module_status_type) !== 0) {
        alertType = "warning";
        alertMessage = "Competency ของรอบนี้ไม่ได้อยู่ในสถานะยังไม่เปิด";
        await transaction.rollback();
      } else {
        const problems: string[] = [];

        const employeeResult = await request().query(`
          SELECT
            COUNT(*) AS total_employee,
            SUM(CASE WHEN rank_group_id IS NULL THEN 1 ELSE 0 END) AS missing_rank_group,
            SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(position_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_position_code,
            SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(division_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_division_code,
            SUM(
              CASE
                WHEN rank_group_source = 'TENURE'
                  AND (first_employee_date IS NULL OR service_year IS NULL)
                THEN 1
                ELSE 0
              END
            ) AS missing_tenure_data,
            SUM(
              CASE
                WHEN rank_group_source IS NULL
                  OR rank_group_source NOT IN ('RANK', 'TENURE')
                THEN 1
                ELSE 0
              END
            ) AS invalid_group_source,
            SUM(
              CASE
                WHEN competency_percent IS NULL
                  OR competency_percent < 0
                  OR competency_percent > 100
                THEN 1
                ELSE 0
              END
            ) AS invalid_competency_percent
          FROM dbo.competency_round_employee
          WHERE round_id = @round_id
            AND status_type <> 9;
        `);

        const employeeCheck = employeeResult.recordset[0] || {};
        const totalEmployee = Number(employeeCheck.total_employee || 0);

        if (totalEmployee === 0) {
          problems.push("ยังไม่มีผู้ถูกประเมินในรอบ");
        }
        if (Number(employeeCheck.missing_rank_group || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่ยังไม่มีกลุ่มระดับ ${Number(employeeCheck.missing_rank_group).toLocaleString()} คน`,
          );
        }
        if (Number(employeeCheck.missing_position_code || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่ยังไม่มีข้อมูลวิชาชีพ ${Number(employeeCheck.missing_position_code).toLocaleString()} คน`,
          );
        }
        if (Number(employeeCheck.missing_division_code || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่ยังไม่มีกลุ่มภารกิจ ${Number(employeeCheck.missing_division_code).toLocaleString()} คน`,
          );
        }
        if (Number(employeeCheck.missing_tenure_data || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่ไม่สามารถคำนวณอายุงาน ณ วันเริ่มรอบได้ ${Number(employeeCheck.missing_tenure_data).toLocaleString()} คน`,
          );
        }
        if (Number(employeeCheck.invalid_group_source || 0) > 0) {
          problems.push("มีผู้ถูกประเมินที่ข้อมูลการจัดกลุ่มระดับไม่สมบูรณ์");
        }
        if (Number(employeeCheck.invalid_competency_percent || 0) > 0) {
          problems.push("มีผู้ถูกประเมินที่สัดส่วน Competency ไม่ถูกต้อง");
        }

        const assignmentResult = await request().query(`
          SELECT
            SUM(CASE WHEN ISNULL(a1.assignment_count, 0) = 0 THEN 1 ELSE 0 END) AS missing_level_1,
            SUM(
              CASE
                WHEN ISNULL(re.evaluator_required_type, 2) = 2
                  AND ISNULL(a2.assignment_count, 0) = 0
                THEN 1
                ELSE 0
              END
            ) AS missing_level_2
          FROM dbo.competency_round_employee re
          LEFT JOIN (
            SELECT round_employee_id, COUNT(*) AS assignment_count
            FROM dbo.competency_evaluator_assignment
            WHERE evaluator_level = 1
              AND status_type <> 9
            GROUP BY round_employee_id
          ) a1
            ON a1.round_employee_id = re.round_employee_id
          LEFT JOIN (
            SELECT round_employee_id, COUNT(*) AS assignment_count
            FROM dbo.competency_evaluator_assignment
            WHERE evaluator_level = 2
              AND status_type <> 9
            GROUP BY round_employee_id
          ) a2
            ON a2.round_employee_id = re.round_employee_id
          WHERE re.round_id = @round_id
            AND re.status_type <> 9;
        `);

        const assignmentCheck = assignmentResult.recordset[0] || {};
        if (Number(assignmentCheck.missing_level_1 || 0) > 0) {
          problems.push(
            `ยังไม่มีหัวหน้าใกล้ชิด ${Number(assignmentCheck.missing_level_1).toLocaleString()} คน`,
          );
        }
        if (Number(assignmentCheck.missing_level_2 || 0) > 0) {
          problems.push(
            `ยังไม่มีหัวหน้าใหญ่ ${Number(assignmentCheck.missing_level_2).toLocaleString()} คน`,
          );
        }

        const invalidAssignmentResult = await request().query(`
          WITH evaluator_base AS (
            SELECT
              ea.evaluator_payroll_no,
              re.payroll_no AS employee_payroll_no,
              re.rank_group_id AS employee_rank_group_id,
              ev.PAYROLLNO AS found_payroll_no,
              ev.TERMINATEDATE,
              NULLIF(LTRIM(RTRIM(CAST(ev.[RANK] AS varchar(20)))), '') AS evaluator_rank_code,
              NULLIF(LTRIM(RTRIM(CAST(ev.SITECODE AS varchar(20)))), '') AS evaluator_site_code,
              TRY_CONVERT(date, ev.FIRSTEMPLOYEEDATE) AS evaluator_first_employee_date,
              r.start_date
            FROM dbo.competency_evaluator_assignment ea
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id = ea.round_employee_id
             AND re.round_id = @round_id
             AND re.status_type <> 9
            JOIN dbo.competency_round r
              ON r.round_id = re.round_id
            LEFT JOIN ${ssbDb()}.dbo.PYREXT ev
              ON CAST(ev.PAYROLLNO AS varchar(20)) = ea.evaluator_payroll_no
            WHERE ea.status_type <> 9
          ),
          evaluator_calc AS (
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
              END AS evaluator_rank_group_source
            FROM evaluator_base b
          ),
          evaluator_resolved AS (
            SELECT
              c.*,
              CASE
                WHEN c.evaluator_rank_group_source = 'RANK' THEN rank_map.rank_group_id
                ELSE tenure_map.rank_group_id
              END AS evaluator_rank_group_id
            FROM evaluator_calc c
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
                AND (trg.max_service_year IS NULL OR c.evaluator_service_year < trg.max_service_year)
              ORDER BY trg.min_service_year DESC, trg.tenure_rank_group_id DESC
            ) tenure_map
          )
          SELECT
            SUM(
              CASE
                WHEN evaluator_payroll_no = employee_payroll_no THEN 1
                ELSE 0
              END
            ) AS self_assignment_count,
            SUM(
              CASE
                WHEN found_payroll_no IS NULL OR TERMINATEDATE IS NOT NULL THEN 1
                ELSE 0
              END
            ) AS invalid_evaluator_count,
            SUM(
              CASE
                WHEN found_payroll_no IS NOT NULL
                  AND TERMINATEDATE IS NULL
                  AND evaluator_rank_group_id IS NULL
                THEN 1
                ELSE 0
              END
            ) AS evaluator_missing_rank_group_count,
            SUM(
              CASE
                WHEN evaluator_group.rank_group_id IS NOT NULL
                  AND employee_group.rank_group_id IS NOT NULL
                  AND evaluator_group.sort_order < employee_group.sort_order
                THEN 1
                ELSE 0
              END
            ) AS evaluator_lower_rank_count
          FROM evaluator_resolved resolved
          LEFT JOIN dbo.competency_rank_group evaluator_group
            ON evaluator_group.rank_group_id = resolved.evaluator_rank_group_id
           AND evaluator_group.active_status = 1
          LEFT JOIN dbo.competency_rank_group employee_group
            ON employee_group.rank_group_id = resolved.employee_rank_group_id
           AND employee_group.active_status = 1;
        `);

        const invalidAssignmentCheck =
          invalidAssignmentResult.recordset[0] || {};
        if (Number(invalidAssignmentCheck.self_assignment_count || 0) > 0) {
          problems.push("มีรายการที่ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน");
        }
        if (Number(invalidAssignmentCheck.invalid_evaluator_count || 0) > 0) {
          problems.push("มีผู้ประเมินที่พ้นสภาพหรือไม่พบข้อมูลบุคลากร");
        }
        if (
          Number(
            invalidAssignmentCheck.evaluator_missing_rank_group_count || 0,
          ) > 0
        ) {
          problems.push("มีผู้ประเมินที่ยังไม่มีกลุ่มระดับ");
        }
        if (
          Number(invalidAssignmentCheck.evaluator_lower_rank_count || 0) > 0
        ) {
          problems.push("มีผู้ประเมินที่กลุ่มระดับต่ำกว่าผู้ถูกประเมิน");
        }

        const duplicateAssignmentResult = await request().query(`
          SELECT COUNT(*) AS duplicate_count
          FROM (
            SELECT ea.round_employee_id, ea.evaluator_level
            FROM dbo.competency_evaluator_assignment ea
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id = ea.round_employee_id
             AND re.round_id = @round_id
             AND re.status_type <> 9
            WHERE ea.status_type <> 9
            GROUP BY ea.round_employee_id, ea.evaluator_level
            HAVING COUNT(*) > 1
          ) x;
        `);

        if (
          Number(duplicateAssignmentResult.recordset[0]?.duplicate_count || 0) >
          0
        ) {
          problems.push("มีรายการผู้ประเมินซ้ำในระดับเดียวกัน");
        }

        const invalidWeightScopeResult = await request().query(`
          WITH RequiredScopes AS (
            SELECT DISTINCT
              ISNULL(
                NULLIF(LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))), ''),
                '__NO_DIVISION__'
              ) AS scope_value
            FROM dbo.competency_round_employee re
            WHERE re.round_id = @round_id
              AND re.status_type <> 9
              AND ISNULL(re.evaluator_required_type, 2) = 2
          ),
          WeightRules AS (
            SELECT
              ISNULL(
                NULLIF(LTRIM(RTRIM(CAST(w.division_code AS varchar(20)))), ''),
                '__DEFAULT__'
              ) AS scope_value,
              COUNT(CASE WHEN w.active_status = 1 THEN 1 END) AS active_row_count,
              COUNT(
                DISTINCT CASE
                  WHEN w.active_status = 1
                    AND w.evaluator_level IN (1, 2)
                  THEN w.evaluator_level
                END
              ) AS level_count,
              SUM(
                CASE
                  WHEN w.active_status = 1
                  THEN CAST(w.weight_percent AS decimal(10,2))
                  ELSE 0
                END
              ) AS total_weight
            FROM dbo.competency_evaluator_weight w
            WHERE w.round_id = @round_id
            GROUP BY ISNULL(
              NULLIF(LTRIM(RTRIM(CAST(w.division_code AS varchar(20)))), ''),
              '__DEFAULT__'
            )
          )
          SELECT COUNT(*) AS invalid_scope_count
          FROM RequiredScopes required_scope
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
            );
        `);

        const invalidWeightScopeCount = Number(
          invalidWeightScopeResult.recordset[0]?.invalid_scope_count || 0,
        );

        if (invalidWeightScopeCount > 0) {
          problems.push(
            `มีผู้ถูกประเมินแบบสองระดับที่ยังไม่มีชุดน้ำหนักครบ 100% จำนวน ${invalidWeightScopeCount.toLocaleString()} กลุ่มภารกิจ`,
          );
        }

        const commonQuestionResult = await request().query(`
          SELECT COUNT(DISTINCT q.fixed_question_no) AS common_count
          FROM dbo.competency_question q
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE q.active_status = 1
            AND q.question_scope = 'COMMON'
            AND q.fixed_question_no BETWEEN 1 AND 4;
        `);

        if (Number(commonQuestionResult.recordset[0]?.common_count || 0) < 4) {
          problems.push("หัวข้อประเมินส่วนกลางข้อ 1-4 ยังไม่ครบ");
        }

        const professionQuestionResult = await request().query(`
          WITH round_positions AS (
            SELECT DISTINCT NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code
            FROM dbo.competency_round_employee
            WHERE round_id = @round_id
              AND status_type <> 9
              AND NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
          ),
          map_summary AS (
            SELECT
              rp.position_code,
              COUNT(DISTINCT CASE WHEN m.active_status = 1 THEN m.question_no END) AS active_map_count,
              COUNT(
                DISTINCT CASE
                  WHEN m.active_status = 1
                    AND q.question_scope = 'PROFESSION'
                    AND q.active_status = 1
                    AND qv.question_version_id IS NOT NULL
                  THEN m.question_no
                END
              ) AS valid_map_count,
              COUNT(
                DISTINCT CASE
                  WHEN m.active_status = 1
                    AND q.question_scope = 'PROFESSION'
                    AND q.active_status = 1
                    AND qv.question_version_id IS NOT NULL
                  THEN m.question_id
                END
              ) AS distinct_topic_count
            FROM round_positions rp
            LEFT JOIN dbo.competency_profession_question_map m
              ON m.position_code = rp.position_code
             AND m.active_status = 1
            LEFT JOIN dbo.competency_question q
              ON q.question_id = m.question_id
            LEFT JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1
            GROUP BY rp.position_code
          )
          SELECT
            SUM(CASE WHEN active_map_count NOT IN (0, 3) THEN 1 ELSE 0 END) AS partial_count,
            SUM(CASE WHEN active_map_count = 3 AND valid_map_count <> 3 THEN 1 ELSE 0 END) AS invalid_topic_count,
            SUM(CASE WHEN active_map_count = 3 AND distinct_topic_count <> 3 THEN 1 ELSE 0 END) AS duplicate_topic_count
          FROM map_summary;
        `);

        const professionQuestionCheck =
          professionQuestionResult.recordset[0] || {};
        if (Number(professionQuestionCheck.partial_count || 0) > 0) {
          problems.push("มีวิชาชีพที่กำหนดหัวข้อเพิ่มเติมไม่ครบข้อ 5-7");
        }
        if (Number(professionQuestionCheck.invalid_topic_count || 0) > 0) {
          problems.push("มีวิชาชีพที่เลือกหัวข้อเพิ่มเติมซึ่งไม่พร้อมใช้งาน");
        }
        if (Number(professionQuestionCheck.duplicate_topic_count || 0) > 0) {
          problems.push("มีวิชาชีพที่เลือกหัวข้อเพิ่มเติมซ้ำกัน");
        }

        const descriptionResult = await request().query(`
          WITH active_employees AS (
            SELECT DISTINCT
              NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code,
              rank_group_id
            FROM dbo.competency_round_employee
            WHERE round_id = @round_id
              AND status_type <> 9
              AND rank_group_id IS NOT NULL
              AND NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
          ),
          common_questions AS (
            SELECT qv.question_version_id
            FROM dbo.competency_question q
            JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1
            WHERE q.active_status = 1
              AND q.question_scope = 'COMMON'
              AND q.fixed_question_no BETWEEN 1 AND 4
          ),
          profession_questions AS (
            SELECT
              m.position_code,
              qv.question_version_id
            FROM dbo.competency_profession_question_map m
            JOIN dbo.competency_question q
              ON q.question_id = m.question_id
             AND q.question_scope = 'PROFESSION'
             AND q.active_status = 1
            JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1
            WHERE m.active_status = 1
          ),
          required_pairs AS (
            SELECT DISTINCT
              ae.rank_group_id,
              cq.question_version_id
            FROM active_employees ae
            CROSS JOIN common_questions cq

            UNION

            SELECT DISTINCT
              ae.rank_group_id,
              pq.question_version_id
            FROM active_employees ae
            JOIN profession_questions pq
              ON pq.position_code = ae.position_code
          )
          SELECT COUNT(*) AS missing_description_count
          FROM required_pairs rp
          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.competency_question_description_version dv
            WHERE dv.question_version_id = rp.question_version_id
              AND dv.rank_group_id = rp.rank_group_id
              AND dv.active_status = 1
          );
        `);

        if (
          Number(
            descriptionResult.recordset[0]?.missing_description_count || 0,
          ) > 0
        ) {
          problems.push(
            `คำอธิบายหัวข้อยังไม่ครบ ${Number(descriptionResult.recordset[0]?.missing_description_count || 0).toLocaleString()} รายการ`,
          );
        }

        if (problems.length > 0) {
          alertType = "warning";
          alertMessage = `ยังเปิดรอบไม่ได้: ${problems.slice(0, 5).join(" / ")}${problems.length > 5 ? " ..." : ""}`;
          await transaction.rollback();
        } else {
          const copyResult = await request().query(`
            DECLARE @snapshot_source TABLE
            (
              position_code varchar(20) NULL,
              question_no int NOT NULL,
              question_version_id int NOT NULL,
              max_score decimal(8,2) NOT NULL,
              weight_percent decimal(5,2) NOT NULL
            );

            WITH round_positions AS (
              SELECT DISTINCT
                NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code
              FROM dbo.competency_round_employee
              WHERE round_id = @round_id
                AND status_type <> 9
                AND NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
            ),
            profession_counts AS (
              SELECT
                rp.position_code,
                COUNT(DISTINCT m.question_no) AS profession_count
              FROM round_positions rp
              LEFT JOIN dbo.competency_profession_question_map m
                ON m.position_code = rp.position_code
               AND m.active_status = 1
              GROUP BY rp.position_code
            ),
            common_current AS (
              SELECT
                q.fixed_question_no AS question_no,
                qv.question_version_id,
                q.max_score
              FROM dbo.competency_question q
              JOIN dbo.competency_question_version qv
                ON qv.question_id = q.question_id
               AND qv.is_current = 1
               AND qv.active_status = 1
              WHERE q.active_status = 1
                AND q.question_scope = 'COMMON'
                AND q.fixed_question_no BETWEEN 1 AND 4
            ),
            profession_current AS (
              SELECT
                m.position_code,
                m.question_no,
                qv.question_version_id,
                q.max_score
              FROM dbo.competency_profession_question_map m
              JOIN dbo.competency_question q
                ON q.question_id = m.question_id
               AND q.question_scope = 'PROFESSION'
               AND q.active_status = 1
              JOIN dbo.competency_question_version qv
                ON qv.question_id = q.question_id
               AND qv.is_current = 1
               AND qv.active_status = 1
              WHERE m.active_status = 1
            )
            INSERT INTO @snapshot_source
            (
              position_code,
              question_no,
              question_version_id,
              max_score,
              weight_percent
            )
            SELECT
              rp.position_code,
              cq.question_no,
              cq.question_version_id,
              cq.max_score,
              CAST(
                CASE
                  WHEN ISNULL(pc.profession_count, 0) = 3
                    THEN 15
                  ELSE 25
                END
                AS decimal(5,2)
              )
            FROM round_positions rp
            JOIN profession_counts pc
              ON pc.position_code = rp.position_code
            CROSS JOIN common_current cq

            UNION ALL

            SELECT
              rp.position_code,
              pq.question_no,
              pq.question_version_id,
              pq.max_score,
              CAST(
                CASE
                  WHEN pq.question_no = 7
                    THEN 10
                  ELSE 15
                END
                AS decimal(5,2)
              )
            FROM round_positions rp
            JOIN profession_counts pc
              ON pc.position_code = rp.position_code
             AND pc.profession_count = 3
            JOIN profession_current pq
              ON pq.position_code = rp.position_code;

            /*
              ป้องกันข้อมูลจริงเดิม:
              ถ้ามี Snapshot เดิมแต่รายละเอียดไม่ตรง จะหยุดเปิดรอบ
              โดยไม่ลบและไม่เขียนทับข้อมูลเดิม
            */
            IF EXISTS
            (
              SELECT 1
              FROM @snapshot_source src
              JOIN dbo.competency_round_question existing
                ON existing.round_id = @round_id
               AND ISNULL(LTRIM(RTRIM(existing.position_code)), '')
                   = ISNULL(LTRIM(RTRIM(src.position_code)), '')
               AND existing.question_no = src.question_no
              WHERE existing.active_status <> 1
                 OR existing.question_version_id <> src.question_version_id
                 OR ABS(CAST(existing.max_score AS decimal(10,2)) - src.max_score) >= 0.01
                 OR ABS(CAST(existing.weight_percent AS decimal(10,2)) - src.weight_percent) >= 0.01
            )
            BEGIN
              THROW 52800,
                    N'พบ Snapshot หัวข้อของรอบเดิมที่ไม่ตรงกับการตั้งค่าปัจจุบัน ระบบไม่ได้ลบหรือเขียนทับข้อมูลเดิม',
                    1;
            END;

            INSERT INTO dbo.competency_round_question
            (
              round_id,
              position_code,
              question_no,
              question_version_id,
              max_score,
              weight_percent,
              active_status,
              created_by
            )
            SELECT
              @round_id,
              src.position_code,
              src.question_no,
              src.question_version_id,
              src.max_score,
              src.weight_percent,
              1,
              NULL
            FROM @snapshot_source src
            WHERE NOT EXISTS
            (
              SELECT 1
              FROM dbo.competency_round_question existing
              WHERE existing.round_id = @round_id
                AND ISNULL(LTRIM(RTRIM(existing.position_code)), '')
                    = ISNULL(LTRIM(RTRIM(src.position_code)), '')
                AND existing.question_no = src.question_no
            );

            DECLARE @inserted_question_count int = @@ROWCOUNT;

            IF EXISTS
            (
              SELECT 1
              FROM @snapshot_source src
              WHERE NOT EXISTS
              (
                SELECT 1
                FROM dbo.competency_round_question existing
                WHERE existing.round_id = @round_id
                  AND ISNULL(LTRIM(RTRIM(existing.position_code)), '')
                      = ISNULL(LTRIM(RTRIM(src.position_code)), '')
                  AND existing.question_no = src.question_no
                  AND existing.active_status = 1
              )
            )
            BEGIN
              THROW 52801,
                    N'ไม่สามารถสร้าง Snapshot หัวข้อ Competency ได้ครบ โดยข้อมูลเดิมยังคงอยู่ทั้งหมด',
                    1;
            END;

            SELECT
              @inserted_question_count AS inserted_question_count,
              COUNT(*) AS total_question_count
            FROM dbo.competency_round_question
            WHERE round_id = @round_id
              AND active_status = 1;
          `);

          const insertedQuestionCount = Number(
            copyResult.recordset[0]?.inserted_question_count || 0,
          );
          const totalQuestionCount = Number(
            copyResult.recordset[0]?.total_question_count || 0,
          );

          await new sql.Request(transaction)
            .input("round_id", sql.Int, roundId)
            .input("changed_by", sql.VarChar(20), currentSession.emp_id)
            .query(`
              EXEC dbo.sp_performance_set_module_status
                   @round_id = @round_id,
                   @module_type = 'COMPETENCY',
                   @new_status_type = 1,
                   @changed_by = @changed_by;
            `);

          await transaction.commit();
          alertMessage = `เปิด Competency เรียบร้อยแล้ว มี Snapshot หัวข้อ ${totalQuestionCount.toLocaleString()} รายการ และเพิ่มเฉพาะรายการใหม่ ${insertedQuestionCount.toLocaleString()} รายการ`;
        }
      }
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback error
      }

      console.error(error);
      alertType = "error";
      alertMessage = "ไม่สามารถเปิด Competency ได้";
    }

    revalidatePath("/admin/rounds");
    revalidatePath("/admin/round-readiness");
    revalidatePath("/admin/round-issues");
    revalidatePath("/admin/questions");
    revalidatePath("/admin/profession-questions");
    revalidatePath("/evaluations");

    redirectWithAlert(alertType, alertMessage);
  }



  async function openKpiModule(formData: FormData) {
    "use server";

    const currentSession = await requireAdminSession();
    const roundId = Number(formData.get("round_id") || 0);

    if (!Number.isInteger(roundId) || roundId <= 0) {
      redirectWithAlert("error", "ข้อมูลรอบประเมินไม่ถูกต้อง");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    let alertType: "success" | "error" | "warning" | "info" = "success";
    let alertMessage = "เปิด KPI เรียบร้อยแล้ว";

    try {
      await transaction.begin();

      const roundResult = await new sql.Request(transaction)
        .input("round_id", sql.Int, roundId)
        .query(`
          SELECT TOP (1)
            r.round_id,
            r.round_code,
            r.status_type AS round_status_type,
            m.status_type AS module_status_type
          FROM dbo.competency_round r WITH (UPDLOCK, HOLDLOCK)
          JOIN dbo.performance_round_module m WITH (UPDLOCK, HOLDLOCK)
            ON m.round_id = r.round_id
           AND m.module_type = 'KPI'
          WHERE r.round_id = @round_id
            AND r.status_type <> 9;
        `);

      const round = roundResult.recordset[0];

      if (!round) {
        alertType = "error";
        alertMessage = "ไม่พบรอบประเมินหรือสถานะ KPI";
        await transaction.rollback();
      } else if (Number(round.module_status_type) !== 0) {
        alertType = "warning";
        alertMessage = "KPI ของรอบนี้ไม่ได้อยู่ในสถานะยังไม่เปิด";
        await transaction.rollback();
      } else {
        const problems: string[] = [];
        const request = () =>
          new sql.Request(transaction).input("round_id", sql.Int, roundId);

        const employeeFormResult = await request().query(`
          SELECT
            COUNT(*) AS total_employee,
            SUM(
              CASE
                WHEN re.competency_percent IS NULL
                  OR re.competency_percent < 0
                  OR re.competency_percent > 100
                THEN 1
                ELSE 0
              END
            ) AS invalid_percent_count,
            SUM(CASE WHEN ef.employee_form_id IS NULL THEN 1 ELSE 0 END)
              AS missing_form_count,
            SUM(
              CASE
                WHEN ef.employee_form_id IS NOT NULL
                 AND (
                   f.active_status <> 1
                   OR fv.status_type <> 1
                   OR fv.total_weight_percent <> 100
                   OR ISNULL(item_summary.item_count, 0) = 0
                   OR ISNULL(item_summary.item_weight_total, 0) <> 100
                 )
                THEN 1
                ELSE 0
              END
            ) AS invalid_form_count,
            SUM(
              CASE
                WHEN ef.employee_form_id IS NOT NULL
                 AND fv.scope_type = 2
                 AND NOT EXISTS
                 (
                   SELECT 1
                   FROM dbo.kpi_form_scope fs
                   WHERE fs.form_version_id = fv.form_version_id
                     AND LTRIM(RTRIM(fs.division_code))
                         = LTRIM(RTRIM(ISNULL(re.division_code, '')))
                 )
                THEN 1
                ELSE 0
              END
            ) AS scope_mismatch_count
          FROM dbo.competency_round_employee re
          LEFT JOIN dbo.kpi_employee_form ef
            ON ef.round_employee_id = re.round_employee_id
           AND ef.status_type = 0
          LEFT JOIN dbo.kpi_form_version fv
            ON fv.form_version_id = ef.form_version_id
          LEFT JOIN dbo.kpi_form f
            ON f.form_id = fv.form_id
          OUTER APPLY
          (
            SELECT
              COUNT(*) AS item_count,
              SUM(fi.weight_percent) AS item_weight_total
            FROM dbo.kpi_form_item fi
            WHERE fi.form_version_id = fv.form_version_id
          ) item_summary
          WHERE re.round_id = @round_id
            AND re.status_type <> 9;
        `);

        const employeeFormCheck = employeeFormResult.recordset[0] || {};
        const totalEmployee = Number(employeeFormCheck.total_employee || 0);

        if (totalEmployee === 0) {
          problems.push("ยังไม่มีผู้ถูกประเมินในรอบ");
        }
        if (Number(employeeFormCheck.invalid_percent_count || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่สัดส่วน Competency ไม่ถูกต้อง ${Number(
              employeeFormCheck.invalid_percent_count,
            ).toLocaleString()} คน`,
          );
        }
        if (Number(employeeFormCheck.missing_form_count || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่ยังไม่มีแบบฟอร์ม KPI ${Number(
              employeeFormCheck.missing_form_count,
            ).toLocaleString()} คน`,
          );
        }
        if (Number(employeeFormCheck.invalid_form_count || 0) > 0) {
          problems.push(
            `มีแบบฟอร์ม KPI ที่ยังไม่พร้อมใช้งานหรือน้ำหนักไม่ครบ 100% ${Number(
              employeeFormCheck.invalid_form_count,
            ).toLocaleString()} คน`,
          );
        }
        if (Number(employeeFormCheck.scope_mismatch_count || 0) > 0) {
          problems.push(
            `มีแบบฟอร์ม KPI ที่ไม่ครอบคลุมกลุ่มงานของผู้ถูกประเมิน ${Number(
              employeeFormCheck.scope_mismatch_count,
            ).toLocaleString()} คน`,
          );
        }

        const indicatorResult = await request().query(`
          SELECT COUNT(DISTINCT fi.form_item_id) AS invalid_item_count
          FROM dbo.competency_round_employee re
          JOIN dbo.kpi_employee_form ef
            ON ef.round_employee_id = re.round_employee_id
           AND ef.status_type = 0
          JOIN dbo.kpi_form_item fi
            ON fi.form_version_id = ef.form_version_id
          JOIN dbo.kpi_indicator_version iv
            ON iv.indicator_version_id = fi.indicator_version_id
          JOIN dbo.kpi_indicator i
            ON i.indicator_id = iv.indicator_id
          OUTER APPLY
          (
            SELECT COUNT(*) AS rule_count
            FROM dbo.kpi_indicator_rule rule_item
            WHERE rule_item.indicator_version_id = iv.indicator_version_id
          ) rule_summary
          WHERE re.round_id = @round_id
            AND re.status_type <> 9
            AND (
              i.active_status <> 1
              OR iv.status_type <> 1
              OR ISNULL(rule_summary.rule_count, 0) = 0
            );
        `);

        if (Number(indicatorResult.recordset[0]?.invalid_item_count || 0) > 0) {
          problems.push("มีตัวชี้วัด KPI ที่ยังไม่พร้อมใช้งานหรือยังไม่มีเกณฑ์คะแนน");
        }

        const evaluatorResult = await request().query(`
          SELECT
            SUM(CASE WHEN k.kpi_assignment_id IS NULL THEN 1 ELSE 0 END)
              AS missing_evaluator_count,
            SUM(
              CASE
                WHEN k.kpi_assignment_id IS NOT NULL
                 AND LTRIM(RTRIM(k.evaluator_payroll_no))
                     = LTRIM(RTRIM(re.payroll_no))
                THEN 1
                ELSE 0
              END
            ) AS self_assignment_count,
            SUM(
              CASE
                WHEN k.kpi_assignment_id IS NOT NULL
                 AND (ev.PAYROLLNO IS NULL OR ev.TERMINATEDATE IS NOT NULL)
                THEN 1
                ELSE 0
              END
            ) AS invalid_evaluator_count,
            SUM(
              CASE
                WHEN k.kpi_assignment_id IS NOT NULL
                 AND k.weight_percent <> 100
                THEN 1
                ELSE 0
              END
            ) AS invalid_weight_count,
            SUM(
              CASE
                WHEN k.assignment_source_type = 'AUTO_COMPETENCY'
                 AND (
                   source_assignment.assignment_id IS NULL
                   OR source_assignment.evaluator_level <> 1
                   OR source_assignment.status_type = 9
                   OR LTRIM(RTRIM(source_assignment.evaluator_payroll_no))
                      <> LTRIM(RTRIM(k.evaluator_payroll_no))
                 )
                THEN 1
                ELSE 0
              END
            ) AS invalid_auto_source_count
          FROM dbo.competency_round_employee re
          LEFT JOIN dbo.kpi_evaluator_assignment k
            ON k.round_employee_id = re.round_employee_id
           AND k.status_type = 0
          LEFT JOIN dbo.competency_evaluator_assignment source_assignment
            ON source_assignment.assignment_id = k.source_competency_assignment_id
          LEFT JOIN ${ssbDb()}.dbo.PYREXT ev
            ON LTRIM(RTRIM(CAST(ev.PAYROLLNO AS varchar(20))))
               = LTRIM(RTRIM(k.evaluator_payroll_no))
          WHERE re.round_id = @round_id
            AND re.status_type <> 9;
        `);

        const evaluatorCheck = evaluatorResult.recordset[0] || {};
        if (Number(evaluatorCheck.missing_evaluator_count || 0) > 0) {
          problems.push(
            `มีผู้ถูกประเมินที่ยังไม่มีผู้ประเมิน KPI ${Number(
              evaluatorCheck.missing_evaluator_count,
            ).toLocaleString()} คน`,
          );
        }
        if (Number(evaluatorCheck.self_assignment_count || 0) > 0) {
          problems.push("มีรายการ KPI ที่ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน");
        }
        if (Number(evaluatorCheck.invalid_evaluator_count || 0) > 0) {
          problems.push("มีผู้ประเมิน KPI ที่พ้นสภาพหรือไม่พบข้อมูลบุคลากร");
        }
        if (Number(evaluatorCheck.invalid_weight_count || 0) > 0) {
          problems.push("มีผู้ประเมิน KPI ที่น้ำหนักไม่เท่ากับ 100%");
        }
        if (Number(evaluatorCheck.invalid_auto_source_count || 0) > 0) {
          problems.push("มีผู้ประเมิน KPI อัตโนมัติที่ไม่ตรงกับหัวหน้าใกล้ชิด Competency");
        }

        if (problems.length > 0) {
          alertType = "warning";
          alertMessage = `ยังเปิด KPI ไม่ได้: ${problems.slice(0, 5).join(" / ")}${
            problems.length > 5 ? " ..." : ""
          }`;
          await transaction.rollback();
        } else {
          await new sql.Request(transaction)
            .input("round_id", sql.Int, roundId)
            .input("changed_by", sql.VarChar(20), currentSession.emp_id)
            .query(`
              EXEC dbo.sp_performance_set_module_status
                   @round_id = @round_id,
                   @module_type = 'KPI',
                   @new_status_type = 1,
                   @changed_by = @changed_by;
            `);

          await transaction.commit();
        }
      }
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback error
      }

      console.error(error);
      alertType = "error";
      alertMessage = "ไม่สามารถเปิด KPI ได้";
    }

    revalidatePath("/admin/rounds");
    revalidatePath("/admin/kpi-employee-forms");
    revalidatePath("/admin/kpi-assignments");
    revalidatePath("/kpi-evaluations");
    revalidatePath("/kpi-reports");
    revalidatePath("/performance-reports");

    redirectWithAlert(alertType, alertMessage);
  }

  async function closeRoundModule(formData: FormData) {
    "use server";

    const currentSession = await requireAdminSession();
    const roundId = Number(formData.get("round_id") || 0);
    const moduleType = String(formData.get("module_type") || "")
      .trim()
      .toUpperCase();

    if (!Number.isInteger(roundId) || roundId <= 0) {
      redirectWithAlert("error", "ข้อมูลรอบประเมินไม่ถูกต้อง");
    }

    if (moduleType !== "COMPETENCY" && moduleType !== "KPI") {
      redirectWithAlert("error", "ประเภทการประเมินไม่ถูกต้อง");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    let alertType: "success" | "error" | "warning" | "info" = "success";
    let alertMessage =
      moduleType === "COMPETENCY"
        ? "ปิด Competency เรียบร้อยแล้ว"
        : "ปิด KPI เรียบร้อยแล้ว";

    try {
      await transaction.begin();

      const moduleResult = await new sql.Request(transaction)
        .input("round_id", sql.Int, roundId)
        .input("module_type", sql.VarChar(20), moduleType)
        .query(`
          SELECT TOP (1)
            m.status_type
          FROM dbo.performance_round_module m WITH (UPDLOCK, HOLDLOCK)
          JOIN dbo.competency_round r
            ON r.round_id = m.round_id
           AND r.status_type <> 9
          WHERE m.round_id = @round_id
            AND m.module_type = @module_type;
        `);

      const moduleRow = moduleResult.recordset[0];

      if (!moduleRow) {
        alertType = "error";
        alertMessage = "ไม่พบสถานะการประเมินของรอบนี้";
        await transaction.rollback();
      } else if (Number(moduleRow.status_type) !== 1) {
        alertType = "warning";
        alertMessage = "ปิดได้เฉพาะส่วนที่กำลังเปิดประเมินอยู่เท่านั้น";
        await transaction.rollback();
      } else {
        let pendingCount = 0;

        if (moduleType === "COMPETENCY") {
          const pendingResult = await new sql.Request(transaction)
            .input("round_id", sql.Int, roundId)
            .query(`
              SELECT COUNT(*) AS pending_count
              FROM dbo.competency_evaluator_assignment a
              JOIN dbo.competency_round_employee re
                ON re.round_employee_id = a.round_employee_id
               AND re.round_id = @round_id
               AND re.status_type <> 9
              WHERE a.status_type <> 9
                AND NOT EXISTS
                (
                  SELECT 1
                  FROM dbo.competency_evaluation ev
                  WHERE ev.assignment_id = a.assignment_id
                    AND ev.status_type = 1
                );
            `);

          pendingCount = Number(pendingResult.recordset[0]?.pending_count || 0);
        } else {
          const pendingResult = await new sql.Request(transaction)
            .input("round_id", sql.Int, roundId)
            .query(`
              SELECT COUNT(*) AS pending_count
              FROM dbo.kpi_evaluator_assignment k
              JOIN dbo.competency_round_employee re
                ON re.round_employee_id = k.round_employee_id
               AND re.round_id = @round_id
               AND re.status_type <> 9
              JOIN dbo.kpi_employee_form ef
                ON ef.round_employee_id = re.round_employee_id
               AND ef.status_type = 0
              WHERE k.status_type = 0
                AND NOT EXISTS
                (
                  SELECT 1
                  FROM dbo.kpi_evaluation ev
                  WHERE ev.employee_form_id = ef.employee_form_id
                    AND ev.kpi_assignment_id = k.kpi_assignment_id
                    AND ev.status_type = 1
                );
            `);

          pendingCount = Number(pendingResult.recordset[0]?.pending_count || 0);
        }

        if (pendingCount > 0) {
          alertType = "warning";
          alertMessage = `ยังปิดไม่ได้ มีรายการที่ยังไม่ส่งผล ${pendingCount.toLocaleString()} รายการ`;
          await transaction.rollback();
        } else {
          await new sql.Request(transaction)
            .input("round_id", sql.Int, roundId)
            .input("module_type", sql.VarChar(20), moduleType)
            .input("changed_by", sql.VarChar(20), currentSession.emp_id)
            .query(`
              EXEC dbo.sp_performance_set_module_status
                   @round_id = @round_id,
                   @module_type = @module_type,
                   @new_status_type = 2,
                   @changed_by = @changed_by;
            `);

          await transaction.commit();
        }
      }
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback error
      }

      console.error(error);
      alertType = "error";
      alertMessage = "ไม่สามารถปิดการประเมินได้";
    }

    revalidatePath("/admin/rounds");
    revalidatePath("/evaluations");
    revalidatePath("/kpi-evaluations");
    revalidatePath("/reports");
    revalidatePath("/kpi-reports");
    revalidatePath("/performance-reports");

    redirectWithAlert(alertType, alertMessage);
  }
  const [baseRounds, moduleStatuses] = await Promise.all([
    safeFetch(() => getRounds(), []),
    safeFetch(() => getRoundModuleStatuses(), []),
  ]);

  const moduleStatusMap = new Map(
    moduleStatuses.map((item) => [item.round_id, item]),
  );

  const rounds: RoundWithModuleStatus[] = baseRounds.map((round) => {
    const moduleStatus = moduleStatusMap.get(Number(round.round_id));

    return {
      ...round,
      competency_status_type: Number(
        moduleStatus?.competency_status_type || 0,
      ),
      kpi_status_type: Number(moduleStatus?.kpi_status_type || 0),
    };
  });

  const defaultRoundYear = getCurrentFiscalYearBE();
  const draftRounds = rounds.filter((round) => Number(round.status_type) === 0);
  const hasDraftRound = draftRounds.length > 0;

  const maxRoundNoInCurrentYear = rounds
    .filter(
      (round) =>
        Number(round.round_year) === defaultRoundYear &&
        Number(round.status_type) !== 9,
    )
    .reduce((max, round) => Math.max(max, Number(round.round_no)), 0);

  const nextRoundNo = maxRoundNoInCurrentYear + 1;
  const hasTwoRoundsInCurrentYear = nextRoundNo > 2;
  const canCreateRound = !hasDraftRound && !hasTwoRoundsInCurrentYear;

  const defaultDates = getDefaultRoundDates(
    defaultRoundYear,
    nextRoundNo <= 2 ? nextRoundNo : 2,
  );
  const defaultRoundCode = `${defaultRoundYear}/${nextRoundNo}`;

  const cookieStore = await cookies();
  const editRoundId = Number(cookieStore.get(ROUND_EDIT_COOKIE)?.value || 0);
  const editRound = rounds.find(
    (round) =>
      Number(round.round_id) === editRoundId && Number(round.status_type) === 0,
  );

  const templateTargetRoundOptions = draftRounds.map((round) => ({
    value: String(round.round_id),
    label: getRoundOptionLabel(round),
  }));

  const templateSourceRoundOptions = rounds
    .filter(
      (round) =>
        Number(round.status_type) !== 9 && Number(round.status_type) !== 0,
    )
    .sort((a, b) => {
      const yearDiff = Number(b.round_year) - Number(a.round_year);
      if (yearDiff !== 0) return yearDiff;
      const noDiff = Number(b.round_no) - Number(a.round_no);
      if (noDiff !== 0) return noDiff;
      return Number(b.round_id) - Number(a.round_id);
    })
    .map((round) => ({
      value: String(round.round_id),
      label: getRoundOptionLabel(round),
    }));

  return (
    <div>
      <ActionAlert type={params?.alert_type} message={params?.alert_message} />

      <PageHeader
        title="จัดการรอบประเมิน"
        description="แต่ละรอบเปิดและปิด Competency กับ KPI แยกกันได้ โดยยังคงปีละ 2 รอบ"
      />


      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
        การเปิด Competency จะไม่ลบหรือเขียนทับข้อมูลตั้งค่าจริงเดิม ระบบจะเพิ่ม Snapshot
        เฉพาะหัวข้อที่ยังไม่มีเท่านั้น ส่วน KPI จะตรวจความพร้อมของแบบฟอร์ม ตัวชี้วัด
        และผู้ประเมินก่อนเปิด
      </div>

      <RoundTemplateCopyForm
        targetRoundOptions={templateTargetRoundOptions}
        sourceRoundOptions={templateSourceRoundOptions}
        copyRoundTemplateAction={copyRoundTemplate}
      />

      {editRound && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            แก้ไขรอบประเมิน
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            แก้ไขได้เฉพาะรอบที่ยังเป็นสถานะร่างเท่านั้น
          </p>

          <form
            action={updateDraftRound}
            className="grid grid-cols-1 gap-4 md:grid-cols-4"
          >
            <input type="hidden" name="round_id" value={editRound.round_id} />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ชื่อรอบ
              </label>
              <input
                name="round_code"
                type="text"
                required
                defaultValue={editRound.round_code}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                วันที่เริ่ม
              </label>
              <DateInput
                id="edit_start_date"
                name="start_date"
                required
                defaultValue={editRound.start_date || ""}
                className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                วันที่สิ้นสุด
              </label>
              <DateInput
                id="edit_end_date"
                name="end_date"
                required
                defaultValue={editRound.end_date || ""}
                className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
            </div>

            <div className="flex items-end justify-end gap-3">
              <button
                type="submit"
                formAction={clearEditRound}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253]"
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
              >
                บันทึกการแก้ไข
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          สร้างรอบประเมินใหม่
        </h2>

        {hasDraftRound ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            มีรอบประเมินสถานะร่างอยู่แล้ว คือ{" "}
            {draftRounds.map((round) => round.round_code).join(", ")}{" "}
            กรุณาแก้ไขหรือเปิดรอบเดิมก่อนสร้างรอบใหม่
          </div>
        ) : hasTwoRoundsInCurrentYear ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            ปีงบ {defaultRoundYear} มีรอบประเมินครบ 2 รอบแล้ว
            ไม่สามารถสร้างรอบเพิ่มได้
          </div>
        ) : (
          <form
            action={submitCreateRound}
            className="grid grid-cols-1 gap-4 md:grid-cols-5"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ปี พ.ศ.
              </label>
              <input
                name="round_year"
                type="number"
                required
                readOnly
                value={defaultRoundYear}
                className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                รอบ
              </label>
              <input
                name="round_no"
                type="number"
                min="1"
                max="2"
                required
                readOnly
                value={nextRoundNo}
                className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                วันที่เริ่ม
              </label>
              <DateInput
                id="start_date"
                name="start_date"
                required
                defaultValue={defaultDates.startDate}
                className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                วันที่สิ้นสุด
              </label>
              <DateInput
                id="end_date"
                name="end_date"
                required
                defaultValue={defaultDates.endDate}
                className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
            </div>

            <div className="flex items-end justify-end">
              <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
              >
                สร้างรอบ {defaultRoundCode}
              </button>
            </div>
          </form>
        )}

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          ระบบจะกำหนดปีงบและรอบให้อัตโนมัติ และไม่อนุญาตให้สร้างรอบร่างซ้อนกัน
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {[
                  "รอบ",
                  "วันที่เริ่ม",
                  "วันที่สิ้นสุด",
                  "สถานะรอบ",
                  "Competency",
                  "KPI",
                  "จัดการ",
                ].map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rounds.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-gray-500"
                  >
                    ยังไม่มีรอบประเมิน
                  </td>
                </tr>
              ) : (
                rounds.map((round) => {
                  const competencyStatus = Number(
                    round.competency_status_type,
                  );
                  const kpiStatus = Number(round.kpi_status_type);
                  const canEditRound =
                    competencyStatus === 0 && kpiStatus === 0;

                  return (
                    <tr key={round.round_id}>
                      <td className="px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {round.round_code}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {formatThaiDate(round.start_date, "full")}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {formatThaiDate(round.end_date, "full")}
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <span
                          className={getRoundStatusBadge(
                            Number(round.status_type),
                          )}
                        >
                          {statusText(round.status_type, "round")}
                        </span>
                      </td>

                      <td className="min-w-52 px-5 py-4 align-top">
                        <div className="mb-2">
                          <span className={getModuleStatusBadge(competencyStatus)}>
                            {moduleStatusText(competencyStatus)}
                          </span>
                        </div>

                        {competencyStatus === 0 ? (
                          <form action={openCompetencyModule}>
                            <input
                              type="hidden"
                              name="round_id"
                              value={round.round_id}
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#1ab394] px-4 text-sm font-medium text-white hover:bg-[#18a689]"
                            >
                              เปิด Competency
                            </button>
                          </form>
                        ) : competencyStatus === 1 ? (
                          <form action={closeRoundModule}>
                            <input
                              type="hidden"
                              name="round_id"
                              value={round.round_id}
                            />
                            <input
                              type="hidden"
                              name="module_type"
                              value="COMPETENCY"
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#ed5565] px-4 text-sm font-medium text-white hover:bg-[#e64253]"
                            >
                              ปิด Competency
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ปิดผลแล้วและไม่สามารถย้อนกลับได้
                          </span>
                        )}
                      </td>

                      <td className="min-w-52 px-5 py-4 align-top">
                        <div className="mb-2">
                          <span className={getModuleStatusBadge(kpiStatus)}>
                            {moduleStatusText(kpiStatus)}
                          </span>
                        </div>

                        {kpiStatus === 0 ? (
                          <form action={openKpiModule}>
                            <input
                              type="hidden"
                              name="round_id"
                              value={round.round_id}
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#23c6c8] px-4 text-sm font-medium text-white hover:bg-[#1fb5b7]"
                            >
                              เปิด KPI
                            </button>
                          </form>
                        ) : kpiStatus === 1 ? (
                          <form action={closeRoundModule}>
                            <input
                              type="hidden"
                              name="round_id"
                              value={round.round_id}
                            />
                            <input
                              type="hidden"
                              name="module_type"
                              value="KPI"
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#ed5565] px-4 text-sm font-medium text-white hover:bg-[#e64253]"
                            >
                              ปิด KPI
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ปิดผลแล้วและไม่สามารถย้อนกลับได้
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                        {canEditRound ? (
                          <form action={startEditRound}>
                            <input
                              type="hidden"
                              name="round_id"
                              value={round.round_id}
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#f8ac59] px-4 text-sm font-medium text-white hover:bg-[#f7a142]"
                            >
                              แก้ไข
                            </button>
                          </form>
                        ) : (
                          <span className="inline-flex h-9 items-center justify-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            ล็อกแล้ว
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}