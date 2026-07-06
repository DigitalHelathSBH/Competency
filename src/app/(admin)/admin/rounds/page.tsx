import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import DateInput from "@/components/competency/DateInput";
import RoundTemplateCopyForm from "@/components/competency/RoundTemplateCopyForm";
import { getRounds, safeFetch, statusText } from "@/lib/competency";
import { getDbPool, sql } from "@/lib/db";
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

function getRoundOptionLabel(round: { round_code: string; status_type: number }) {
  return `${round.round_code} (${statusText(round.status_type, "round")})`;
}


export default async function AdminRoundsPage({ searchParams }: AdminRoundsPageProps) {
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

    try {
      await transaction.begin();

      const draftCheck = await new sql.Request(transaction).query(`
        SELECT COUNT(*) AS draft_count
        FROM dbo.competency_round WITH (UPDLOCK, HOLDLOCK)
        WHERE status_type = 0;
      `);

      const draftCount = Number(draftCheck.recordset[0]?.draft_count || 0);
      if (draftCount > 0) {
        await transaction.rollback();
        redirectWithAlert("warning", "มีรอบประเมินสถานะร่างอยู่แล้ว กรุณาแก้ไขหรือเปิดรอบเดิมก่อนสร้างรอบใหม่");
      }

      const checkResult = await new sql.Request(transaction)
        .input("round_year", sql.SmallInt, roundYear)
        .query(`
          SELECT ISNULL(MAX(round_no), 0) AS max_round_no
          FROM dbo.competency_round WITH (UPDLOCK, HOLDLOCK)
          WHERE round_year = @round_year
            AND status_type <> 9;
        `);

      const maxRoundNo = Number(checkResult.recordset[0]?.max_round_no ?? 0);
      const expectedRoundNo = maxRoundNo + 1;

      if (expectedRoundNo > 2) {
        await transaction.rollback();
        redirectWithAlert("warning", `ปีงบ ${roundYear} มีรอบประเมินครบ 2 รอบแล้ว`);
      }

      if (roundNo !== expectedRoundNo) {
        await transaction.rollback();
        redirectWithAlert("warning", `ปีงบ ${roundYear} ต้องสร้างรอบ ${expectedRoundNo} เป็นลำดับถัดไปเท่านั้น`);
      }

      const roundCode = `${roundYear}/${roundNo}`;

      await new sql.Request(transaction)
        .input("round_year", sql.SmallInt, roundYear)
        .input("round_no", sql.TinyInt, roundNo)
        .input("round_code", sql.VarChar(20), roundCode)
        .input("start_date", sql.Date, startDate)
        .input("end_date", sql.Date, endDate)
        .input("created_by", sql.VarChar(20), currentSession.emp_id)
        .query(`
          INSERT INTO dbo.competency_round
              (round_year, round_no, round_code, start_date, end_date, status_type, created_by)
          VALUES
              (@round_year, @round_no, @round_code, @start_date, @end_date, 0, @created_by);
        `);

      await transaction.commit();
    } catch (error) {
      if (transaction.active) {
        await transaction.rollback();
      }

      console.error(error);
      redirectWithAlert("error", "ไม่สามารถสร้างรอบประเมินได้");
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

    try {
      const result = await pool
        .request()
        .input("round_id", sql.Int, roundId)
        .input("round_code", sql.VarChar(20), roundCode)
        .input("start_date", sql.Date, startDate)
        .input("end_date", sql.Date, endDate)
        .query(`
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

      const affectedRows = Number(result.recordset[0]?.affected_rows || 0);

      if (affectedRows === 0) {
        redirectWithAlert("warning", "ไม่สามารถแก้ไขได้ อาจไม่ใช่สถานะร่าง หรือชื่อรอบซ้ำกับรอบอื่น");
      }
    } catch (error) {
      console.error(error);
      redirectWithAlert("error", "ไม่สามารถแก้ไขรอบประเมินได้");
    }

    const cookieStore = await cookies();
    cookieStore.delete(ROUND_EDIT_COOKIE);

    revalidatePath("/admin/rounds");
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
      redirectWithAlert("warning", "รอบต้นทางและรอบปลายทางต้องไม่ใช่รอบเดียวกัน");
    }

    if (!copyEmployees && !copyAssignments && !copyWeights) {
      redirectWithAlert("warning", "กรุณาเลือกรายการที่ต้องการคัดลอกอย่างน้อย 1 รายการ");
    }

    const pool = await getDbPool();

    const targetResult = await pool
      .request()
      .input("target_round_id", sql.Int, targetRoundId)
      .query(`
        SELECT TOP 1 round_id, round_code, status_type
        FROM dbo.competency_round
        WHERE round_id = @target_round_id;
      `);

    const targetRound = targetResult.recordset[0];
    if (!targetRound) {
      redirectWithAlert("error", "ไม่พบรอบปลายทาง");
    }

    if (Number(targetRound.status_type) !== 0) {
      redirectWithAlert("warning", "คัดลอกได้เฉพาะรอบปลายทางที่ยังเป็นสถานะร่างเท่านั้น");
    }

    const sourceResult = await pool
      .request()
      .input("source_round_id", sql.Int, sourceRoundId)
      .query(`
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
          .input("created_by", sql.VarChar(20), currentSession.emp_id)
          .query(`
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

        weightInsertedCount = Number(weightResult.recordset[0]?.inserted_count || 0);
      }

      if (copyEmployees) {
        const employeeResult = await new sql.Request(transaction)
          .input("source_round_id", sql.Int, sourceRoundId)
          .input("target_round_id", sql.Int, targetRoundId)
          .query(`
            DECLARE @inserted int;

            INSERT INTO dbo.competency_round_employee
              (round_id, payroll_no, position_code, rank_code, rank_group_id, division_code, dept_code, section_code, status_type)
            SELECT DISTINCT
              @target_round_id,
              CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
              NULLIF(LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))), '') AS position_code,
              NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '') AS rank_code,
              rg.rank_group_id,
              NULLIF(LTRIM(RTRIM(CAST(p.[DIVISION] AS varchar(20)))), '') AS division_code,
              NULLIF(LTRIM(RTRIM(CAST(p.[DEPT] AS varchar(20)))), '') AS dept_code,
              NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') AS section_code,
              0 AS status_type
            FROM dbo.competency_round_employee src_re
            JOIN SSBDatabase.dbo.PYREXT p
              ON CAST(p.PAYROLLNO AS varchar(20)) = src_re.payroll_no
            JOIN dbo.competency_rank_group_map rgm
              ON rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(p.[RANK] AS varchar(20)))), '')
             AND rgm.active_status = 1
            JOIN dbo.competency_rank_group rg
              ON rg.rank_group_id = rgm.rank_group_id
             AND rg.active_status = 1
            WHERE src_re.round_id = @source_round_id
              AND src_re.status_type <> 9
              AND p.TERMINATEDATE IS NULL
              AND p.PAYROLLNO IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_round_employee target_re
                WHERE target_re.round_id = @target_round_id
                  AND target_re.payroll_no = CAST(p.PAYROLLNO AS varchar(20))
              );

            SET @inserted = @@ROWCOUNT;
            SELECT @inserted AS inserted_count;
          `);

        employeeInsertedCount = Number(employeeResult.recordset[0]?.inserted_count || 0);
      }

      if (copyAssignments) {
        const assignmentResult = await new sql.Request(transaction)
          .input("source_round_id", sql.Int, sourceRoundId)
          .input("target_round_id", sql.Int, targetRoundId)
          .query(`
            DECLARE @inserted int;

            INSERT INTO dbo.competency_evaluator_assignment
              (round_employee_id, evaluator_payroll_no, evaluator_level, status_type, submitted_date)
            SELECT DISTINCT
              target_re.round_employee_id,
              CAST(ev.PAYROLLNO AS varchar(20)) AS evaluator_payroll_no,
              src_a.evaluator_level,
              0 AS status_type,
              NULL AS submitted_date
            FROM dbo.competency_evaluator_assignment src_a
            JOIN dbo.competency_round_employee src_re
              ON src_re.round_employee_id = src_a.round_employee_id
             AND src_re.round_id = @source_round_id
             AND src_re.status_type <> 9
            JOIN dbo.competency_round_employee target_re
              ON target_re.round_id = @target_round_id
             AND target_re.payroll_no = src_re.payroll_no
             AND target_re.status_type <> 9
            JOIN SSBDatabase.dbo.PYREXT ev
              ON CAST(ev.PAYROLLNO AS varchar(20)) = src_a.evaluator_payroll_no
             AND ev.TERMINATEDATE IS NULL
            JOIN dbo.competency_rank_group_map eval_rgm
              ON eval_rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(ev.[RANK] AS varchar(20)))), '')
             AND eval_rgm.active_status = 1
            JOIN dbo.competency_rank_group eval_rg
              ON eval_rg.rank_group_id = eval_rgm.rank_group_id
             AND eval_rg.active_status = 1
            JOIN dbo.competency_rank_group target_rg
              ON target_rg.rank_group_id = target_re.rank_group_id
             AND target_rg.active_status = 1
            WHERE src_a.status_type <> 9
              AND target_re.payroll_no <> CAST(ev.PAYROLLNO AS varchar(20))
              AND eval_rg.sort_order >= target_rg.sort_order
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_evaluator_assignment target_a
                WHERE target_a.round_employee_id = target_re.round_employee_id
                  AND target_a.evaluator_level = src_a.evaluator_level
                  AND target_a.status_type <> 9
              )
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.competency_evaluator_assignment target_a
                WHERE target_a.round_employee_id = target_re.round_employee_id
                  AND target_a.evaluator_payroll_no = CAST(ev.PAYROLLNO AS varchar(20))
                  AND target_a.status_type <> 9
              );

            SET @inserted = @@ROWCOUNT;
            SELECT @inserted AS inserted_count;
          `);

        assignmentInsertedCount = Number(assignmentResult.recordset[0]?.inserted_count || 0);
      }

      await transaction.commit();
    } catch (error) {
      if (transaction.active) {
        await transaction.rollback();
      }

      console.error(error);
      redirectWithAlert("error", "คัดลอกจากรอบก่อนไม่สำเร็จ");
    }

    revalidatePath("/admin/rounds");
    revalidatePath("/admin/round-employees");
    revalidatePath("/admin/assignments");
    revalidatePath("/admin/evaluator-weights");
    revalidatePath("/admin/round-readiness");

    const totalInserted = employeeInsertedCount + assignmentInsertedCount + weightInsertedCount;
    const summary = `ผู้ถูกประเมิน ${employeeInsertedCount.toLocaleString()} คน, ผู้ประเมิน ${assignmentInsertedCount.toLocaleString()} รายการ, น้ำหนัก ${weightInsertedCount.toLocaleString()} รายการ`;

    if (totalInserted === 0) {
      redirectWithAlert("warning", `ไม่พบข้อมูลใหม่ที่ต้องคัดลอก (${summary})`);
    }

    redirectWithAlert("success", `คัดลอกจากรอบก่อนเรียบร้อยแล้ว (${summary})`);
  }

  async function openDraftRound(formData: FormData) {
    "use server";

    await requireAdminSession();

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

      const request = () => new sql.Request(transaction).input("round_id", sql.Int, roundId);

      const roundResult = await request().query(`
        SELECT TOP 1 round_id, round_code, status_type
        FROM dbo.competency_round WITH (UPDLOCK, HOLDLOCK)
        WHERE round_id = @round_id;
      `);

      const round = roundResult.recordset[0];
      if (!round) {
        alertType = "error";
        alertMessage = "ไม่พบรอบประเมิน";
        await transaction.rollback();
      } else if (Number(round.status_type) !== 0) {
        alertType = "warning";
        alertMessage = "เปิดได้เฉพาะรอบที่ยังเป็นสถานะร่างเท่านั้น";
        await transaction.rollback();
      } else {
        const problems: string[] = [];

        const employeeResult = await request().query(`
          SELECT
            COUNT(*) AS total_employee,
            SUM(CASE WHEN rank_group_id IS NULL THEN 1 ELSE 0 END) AS missing_rank_group,
            SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(position_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_position_code,
            SUM(CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(division_code, ''))), '') IS NULL THEN 1 ELSE 0 END) AS missing_division_code
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
          problems.push(`มีผู้ถูกประเมินที่ยังไม่มี rank_group ${Number(employeeCheck.missing_rank_group).toLocaleString()} คน`);
        }
        if (Number(employeeCheck.missing_position_code || 0) > 0) {
          problems.push(`มีผู้ถูกประเมินที่ยังไม่มีรหัสวิชาชีพ ${Number(employeeCheck.missing_position_code).toLocaleString()} คน`);
        }
        if (Number(employeeCheck.missing_division_code || 0) > 0) {
          problems.push(`มีผู้ถูกประเมินที่ยังไม่มีกลุ่มภารกิจ ${Number(employeeCheck.missing_division_code).toLocaleString()} คน`);
        }

        const assignmentResult = await request().query(`
          SELECT
            SUM(CASE WHEN ISNULL(a1.assignment_count, 0) = 0 THEN 1 ELSE 0 END) AS missing_level_1,
            SUM(CASE WHEN ISNULL(re.evaluator_required_type, 2) = 2 AND ISNULL(a2.assignment_count, 0) = 0 THEN 1 ELSE 0 END) AS missing_level_2
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
          problems.push(`ยังไม่มีหัวหน้าใกล้ชิด ${Number(assignmentCheck.missing_level_1).toLocaleString()} คน`);
        }
        if (Number(assignmentCheck.missing_level_2 || 0) > 0) {
          problems.push(`ยังไม่มีหัวหน้าใหญ่ ${Number(assignmentCheck.missing_level_2).toLocaleString()} คน`);
        }

        const invalidAssignmentResult = await request().query(`
          SELECT
            SUM(CASE WHEN ea.evaluator_payroll_no = re.payroll_no THEN 1 ELSE 0 END) AS self_assignment_count,
            SUM(CASE WHEN ev.PAYROLLNO IS NULL OR ev.TERMINATEDATE IS NOT NULL THEN 1 ELSE 0 END) AS invalid_evaluator_count,
            SUM(CASE WHEN eval_rg.rank_group_id IS NULL THEN 1 ELSE 0 END) AS evaluator_missing_rank_group_count,
            SUM(CASE WHEN eval_rg.rank_group_id IS NOT NULL AND emp_rg.rank_group_id IS NOT NULL AND eval_rg.sort_order < emp_rg.sort_order THEN 1 ELSE 0 END) AS evaluator_lower_rank_count
          FROM dbo.competency_evaluator_assignment ea
          JOIN dbo.competency_round_employee re
            ON re.round_employee_id = ea.round_employee_id
           AND re.round_id = @round_id
           AND re.status_type <> 9
          LEFT JOIN dbo.competency_rank_group emp_rg
            ON emp_rg.rank_group_id = re.rank_group_id
           AND emp_rg.active_status = 1
          LEFT JOIN SSBDatabase.dbo.PYREXT ev
            ON CAST(ev.PAYROLLNO AS varchar(20)) = ea.evaluator_payroll_no
          LEFT JOIN dbo.competency_rank_group_map eval_rgm
            ON eval_rgm.rank_code = NULLIF(LTRIM(RTRIM(CAST(ev.[RANK] AS varchar(20)))), '')
           AND eval_rgm.active_status = 1
          LEFT JOIN dbo.competency_rank_group eval_rg
            ON eval_rg.rank_group_id = eval_rgm.rank_group_id
           AND eval_rg.active_status = 1
          WHERE ea.status_type <> 9;
        `);

        const invalidAssignmentCheck = invalidAssignmentResult.recordset[0] || {};
        if (Number(invalidAssignmentCheck.self_assignment_count || 0) > 0) {
          problems.push("มีรายการที่ผู้ประเมินเป็นคนเดียวกับผู้ถูกประเมิน");
        }
        if (Number(invalidAssignmentCheck.invalid_evaluator_count || 0) > 0) {
          problems.push("มีผู้ประเมินที่ไม่พบใน PYREXT หรือพ้นสภาพแล้ว");
        }
        if (Number(invalidAssignmentCheck.evaluator_missing_rank_group_count || 0) > 0) {
          problems.push("มีผู้ประเมินที่ยังไม่ได้ map RANK เข้ากลุ่มระดับ");
        }
        if (Number(invalidAssignmentCheck.evaluator_lower_rank_count || 0) > 0) {
          problems.push("มีผู้ประเมินที่ระดับต่ำกว่าผู้ถูกประเมิน");
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

        if (Number(duplicateAssignmentResult.recordset[0]?.duplicate_count || 0) > 0) {
          problems.push("มีรายการผู้ประเมินซ้ำในระดับเดียวกัน");
        }

        const defaultWeightResult = await request().query(`
          SELECT
            COUNT(DISTINCT evaluator_level) AS level_count,
            ISNULL(SUM(CAST(weight_percent AS decimal(10,2))), 0) AS total_weight
          FROM dbo.competency_evaluator_weight
          WHERE round_id = @round_id
            AND active_status = 1
            AND ISNULL(LTRIM(RTRIM(division_code)), '') = '';
        `);

        const defaultWeight = defaultWeightResult.recordset[0] || {};
        if (Number(defaultWeight.level_count || 0) < 2 || Math.abs(Number(defaultWeight.total_weight || 0) - 100) > 0.01) {
          problems.push("ยังไม่ได้กำหนดน้ำหนัก default ให้ครบ 100%");
        }

        const invalidWeightScopeResult = await request().query(`
          SELECT COUNT(*) AS invalid_scope_count
          FROM (
            SELECT
              ISNULL(LTRIM(RTRIM(division_code)), '') AS division_code,
              COUNT(DISTINCT evaluator_level) AS level_count,
              SUM(CAST(weight_percent AS decimal(10,2))) AS total_weight
            FROM dbo.competency_evaluator_weight
            WHERE round_id = @round_id
              AND active_status = 1
            GROUP BY ISNULL(LTRIM(RTRIM(division_code)), '')
            HAVING COUNT(DISTINCT evaluator_level) <> 2
                OR ABS(SUM(CAST(weight_percent AS decimal(10,2))) - 100) > 0.01
          ) x;
        `);

        if (Number(invalidWeightScopeResult.recordset[0]?.invalid_scope_count || 0) > 0) {
          problems.push("มีชุดน้ำหนักผู้ประเมินที่รวมไม่ครบ 100%");
        }

        const commonQuestionResult = await request().query(`
          SELECT COUNT(DISTINCT q.question_no) AS common_count
          FROM dbo.competency_question q
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE q.active_status = 1
            AND q.question_scope = 'COMMON'
            AND q.question_no BETWEEN 1 AND 4;
        `);

        if (Number(commonQuestionResult.recordset[0]?.common_count || 0) < 4) {
          problems.push("หัวข้อ COMMON ข้อ 1-4 ยังไม่ครบ");
        }

        const professionQuestionResult = await request().query(`
          WITH round_positions AS (
            SELECT DISTINCT NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code
            FROM dbo.competency_round_employee
            WHERE round_id = @round_id
              AND status_type <> 9
              AND NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
          ), required_numbers AS (
            SELECT 5 AS question_no UNION ALL SELECT 6 UNION ALL SELECT 7
          )
          SELECT COUNT(*) AS missing_profession_count
          FROM round_positions rp
          CROSS JOIN required_numbers rn
          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.competency_question q
            JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1
            WHERE q.active_status = 1
              AND q.question_scope = 'PROFESSION'
              AND q.question_no = rn.question_no
              AND q.position_code = rp.position_code
          );
        `);

        if (Number(professionQuestionResult.recordset[0]?.missing_profession_count || 0) > 0) {
          problems.push(`หัวข้อ PROFESSION ข้อ 5-7 ยังไม่ครบ ${Number(professionQuestionResult.recordset[0]?.missing_profession_count || 0).toLocaleString()} รายการ`);
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
          ), required_pairs AS (
            SELECT DISTINCT
              q.question_no,
              ae.rank_group_id
            FROM active_employees ae
            JOIN dbo.competency_question q
              ON q.active_status = 1
             AND q.question_scope = 'COMMON'
             AND q.question_no BETWEEN 1 AND 4
            JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1

            UNION

            SELECT DISTINCT
              q.question_no,
              ae.rank_group_id
            FROM active_employees ae
            JOIN dbo.competency_question q
              ON q.active_status = 1
             AND q.question_scope = 'PROFESSION'
             AND q.question_no BETWEEN 5 AND 7
             AND q.position_code = ae.position_code
            JOIN dbo.competency_question_version qv
              ON qv.question_id = q.question_id
             AND qv.is_current = 1
             AND qv.active_status = 1
          )
          SELECT COUNT(*) AS missing_description_count
          FROM required_pairs rp
          WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.competency_question_description_version dv
            WHERE dv.question_no = rp.question_no
              AND dv.rank_group_id = rp.rank_group_id
              AND dv.is_current = 1
              AND dv.active_status = 1
          );
        `);

        if (Number(descriptionResult.recordset[0]?.missing_description_count || 0) > 0) {
          problems.push(`คำอธิบายหัวข้อยังไม่ครบ ${Number(descriptionResult.recordset[0]?.missing_description_count || 0).toLocaleString()} รายการ`);
        }

        if (problems.length > 0) {
          alertType = "warning";
          alertMessage = `ยังเปิดรอบไม่ได้: ${problems.slice(0, 5).join(" / ")}${problems.length > 5 ? " ..." : ""}`;
          await transaction.rollback();
        } else {
          const copyResult = await request().query(`
            DELETE FROM dbo.competency_round_question
            WHERE round_id = @round_id;

            WITH round_positions AS (
              SELECT DISTINCT NULLIF(LTRIM(RTRIM(position_code)), '') AS position_code
              FROM dbo.competency_round_employee
              WHERE round_id = @round_id
                AND status_type <> 9
                AND NULLIF(LTRIM(RTRIM(position_code)), '') IS NOT NULL
            ), current_questions AS (
              SELECT
                q.question_no,
                qv.question_version_id,
                CAST(NULL AS varchar(20)) AS position_code,
                q.max_score
              FROM dbo.competency_question q
              JOIN dbo.competency_question_version qv
                ON qv.question_id = q.question_id
               AND qv.is_current = 1
               AND qv.active_status = 1
              WHERE q.active_status = 1
                AND q.question_scope = 'COMMON'
                AND q.question_no BETWEEN 1 AND 4

              UNION ALL

              SELECT
                q.question_no,
                qv.question_version_id,
                q.position_code,
                q.max_score
              FROM dbo.competency_question q
              JOIN dbo.competency_question_version qv
                ON qv.question_id = q.question_id
               AND qv.is_current = 1
               AND qv.active_status = 1
              JOIN round_positions rp
                ON rp.position_code = q.position_code
              WHERE q.active_status = 1
                AND q.question_scope = 'PROFESSION'
                AND q.question_no BETWEEN 5 AND 7
            )
            INSERT INTO dbo.competency_round_question
              (round_id, question_no, question_version_id, position_code, max_score, active_status)
            SELECT DISTINCT
              @round_id,
              question_no,
              question_version_id,
              position_code,
              max_score,
              1
            FROM current_questions;

            SELECT @@ROWCOUNT AS copied_question_count;
          `);

          const copiedQuestionCount = Number(copyResult.recordset[0]?.copied_question_count || 0);

          await request().query(`
            UPDATE dbo.competency_round
            SET status_type = 1
            WHERE round_id = @round_id
              AND status_type = 0;
          `);

          await transaction.commit();
          alertMessage = `เปิดรอบประเมินเรียบร้อยแล้ว และล็อกหัวข้อประเมิน ${copiedQuestionCount.toLocaleString()} รายการ`;
        }
      }
    } catch (error) {
      if (transaction.active) {
        await transaction.rollback();
      }

      console.error(error);
      alertType = "error";
      alertMessage = "ไม่สามารถเปิดรอบประเมินได้";
    }

    revalidatePath("/admin/rounds");
    revalidatePath("/admin/round-readiness");
    revalidatePath("/admin/round-issues");
    revalidatePath("/admin/questions");
    revalidatePath("/admin/question-descriptions");

    redirectWithAlert(alertType, alertMessage);
  }

  const rounds = await safeFetch(() => getRounds(), []);

  const defaultRoundYear = getCurrentFiscalYearBE();
  const draftRounds = rounds.filter((round) => Number(round.status_type) === 0);
  const hasDraftRound = draftRounds.length > 0;

  const maxRoundNoInCurrentYear = rounds
    .filter((round) => Number(round.round_year) === defaultRoundYear && Number(round.status_type) !== 9)
    .reduce((max, round) => Math.max(max, Number(round.round_no)), 0);

  const nextRoundNo = maxRoundNoInCurrentYear + 1;
  const hasTwoRoundsInCurrentYear = nextRoundNo > 2;
  const canCreateRound = !hasDraftRound && !hasTwoRoundsInCurrentYear;

  const defaultDates = getDefaultRoundDates(defaultRoundYear, nextRoundNo <= 2 ? nextRoundNo : 2);
  const defaultRoundCode = `${defaultRoundYear}/${nextRoundNo}`;

  const cookieStore = await cookies();
  const editRoundId = Number(cookieStore.get(ROUND_EDIT_COOKIE)?.value || 0);
  const editRound = rounds.find(
    (round) => Number(round.round_id) === editRoundId && Number(round.status_type) === 0,
  );

  const templateTargetRoundOptions = draftRounds.map((round) => ({
    value: String(round.round_id),
    label: getRoundOptionLabel(round),
  }));

  const templateSourceRoundOptions = rounds
    .filter((round) => Number(round.status_type) !== 9 && Number(round.status_type) !== 0)
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

      <PageHeader title="จัดการรอบประเมิน" description="สร้างและแก้ไขรอบประเมิน เช่น 2569/1, 2569/2" />

      <RoundTemplateCopyForm
        targetRoundOptions={templateTargetRoundOptions}
        sourceRoundOptions={templateSourceRoundOptions}
        copyRoundTemplateAction={copyRoundTemplate}
      />

      {editRound && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">แก้ไขรอบประเมิน</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            แก้ไขได้เฉพาะรอบที่ยังเป็นสถานะร่างเท่านั้น
          </p>

          <form action={updateDraftRound} className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <input type="hidden" name="round_id" value={editRound.round_id} />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">ชื่อรอบ</label>
              <input
                name="round_code"
                type="text"
                required
                defaultValue={editRound.round_code}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">วันที่เริ่ม</label>
              <DateInput
                id="edit_start_date"
                name="start_date"
                required
                defaultValue={editRound.start_date || ""}
                className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">วันที่สิ้นสุด</label>
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
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">สร้างรอบประเมินใหม่</h2>

        {hasDraftRound ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            มีรอบประเมินสถานะร่างอยู่แล้ว คือ {draftRounds.map((round) => round.round_code).join(", ")} กรุณาแก้ไขหรือเปิดรอบเดิมก่อนสร้างรอบใหม่
          </div>
        ) : hasTwoRoundsInCurrentYear ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            ปีงบ {defaultRoundYear} มีรอบประเมินครบ 2 รอบแล้ว ไม่สามารถสร้างรอบเพิ่มได้
          </div>
        ) : (
          <form action={submitCreateRound} className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">ปี พ.ศ.</label>
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">รอบ</label>
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">วันที่เริ่ม</label>
              <DateInput
                id="start_date"
                name="start_date"
                required
                defaultValue={defaultDates.startDate}
                className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">วันที่สิ้นสุด</label>
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
                {["รอบ", "วันที่เริ่ม", "วันที่สิ้นสุด", "สถานะ", "จัดการ"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rounds.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">
                    ยังไม่มีรอบประเมิน
                  </td>
                </tr>
              ) : (
                rounds.map((round) => {
                  const isDraft = Number(round.status_type) === 0;

                  return (
                    <tr key={round.round_id}>
                      <td className="px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">{round.round_code}</td>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{formatThaiDate(round.start_date, "full")}</td>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{formatThaiDate(round.end_date, "full")}</td>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        <span className={getRoundStatusBadge(Number(round.status_type))}>
                          {statusText(round.status_type, "round")}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {isDraft ? (
                          <div className="flex flex-wrap gap-2">
                            <form action={startEditRound}>
                              <input type="hidden" name="round_id" value={round.round_id} />
                              <button
                                type="submit"
                                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#f8ac59] px-4 text-sm font-medium text-white hover:bg-[#f7a142]"
                              >
                                แก้ไข
                              </button>
                            </form>

                            <form action={openDraftRound}>
                              <input type="hidden" name="round_id" value={round.round_id} />
                              <button
                                type="submit"
                                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#1ab394] px-4 text-sm font-medium text-white hover:bg-[#18a689]"
                              >
                                เปิดรอบ
                              </button>
                            </form>
                          </div>
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
