import ActionAlert from "@/components/competency/ActionAlert";
import DataTable from "@/components/competency/DataTable";
import PageHeader from "@/components/competency/PageHeader";
import SearchableSelect from "@/components/competency/SearchableSelect";
import { formatThaiDate } from "@/lib/date-format";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AdminUsersPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

type StaffOptionRow = {
  emp_id: string;
  full_name: string;
  section_name: string | null;
};

type AdminUserRow = {
  admin_user_id: number;
  emp_id: string;
  full_name: string | null;
  section_name: string | null;
  admin_role_type: number;
  active_status: boolean;
  created_date: string | null;
  created_by: string | null;
  active_assignment_count: number;
  latest_round_code: string | null;
};

type UserSummaryRow = {
  admin_count: number;
  evaluator_count: number;
  inactive_count: number;
  active_assignment_evaluator_count: number;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function redirectWithAlert(
  type: "success" | "error" | "warning" | "info",
  message: string,
): never {
  const params = new URLSearchParams({
    alert_type: type,
    alert_message: message,
  });

  redirect(`/admin/admin-users?${params.toString()}`);
}

function roleText(roleType: number) {
  if (roleType === 1) return "ผู้ดูแลระบบ";
  return "ผู้ประเมิน";
}

function RoleBadge({ roleType }: { roleType: number }) {
  if (roleType === 1) {
    return (
      <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        ผู้ดูแลระบบ
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      ผู้ประเมิน
    </span>
  );
}

function ActiveStatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
        ใช้งาน
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
      ปิดใช้งาน
    </span>
  );
}

async function getStaffOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT TOP 5000
      CAST(e.EmpID AS varchar(20)) AS emp_id,
      CAST(
        CASE
          WHEN p.PAYROLLNO IS NULL THEN e.EmpID
          ELSE NULLIF(
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
          )
        END AS nvarchar(255)
      ) AS full_name,
      sc.ThaiName AS section_name
    FROM dbo.Emp e
    LEFT JOIN ${ssbDb()}.dbo.PYREXT p
      ON CAST(e.EmpID AS varchar(20)) = CAST(p.PAYROLLNO AS varchar(20))
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') = sc.Code
    WHERE p.PAYROLLNO IS NULL
       OR p.TERMINATEDATE IS NULL
    ORDER BY
      CASE WHEN p.PAYROLLNO IS NULL THEN 1 ELSE 0 END,
      full_name,
      emp_id;
  `);

  return result.recordset as StaffOptionRow[];
}

async function getAdminUsers() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      au.admin_user_id,
      CAST(au.emp_id AS varchar(20)) AS emp_id,
      CAST(
        CASE
          WHEN p.PAYROLLNO IS NULL THEN au.emp_id
          ELSE NULLIF(
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
          )
        END AS nvarchar(255)
      ) AS full_name,
      sc.ThaiName AS section_name,
      au.admin_role_type,
      au.active_status,
      CONVERT(varchar(19), au.created_date, 120) AS created_date,
      au.created_by,
      ISNULL(active_assignment.active_assignment_count, 0) AS active_assignment_count,
      active_assignment.latest_round_code
    FROM dbo.competency_admin_user au
    LEFT JOIN ${ssbDb()}.dbo.PYREXT p
      ON CAST(au.emp_id AS varchar(20)) = CAST(p.PAYROLLNO AS varchar(20))
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON NULLIF(LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))), '') = sc.Code
    OUTER APPLY (
      SELECT
        COUNT(*) AS active_assignment_count,
        MAX(r.round_code) AS latest_round_code
      FROM dbo.competency_evaluator_assignment a
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id = a.round_employee_id
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
      WHERE a.evaluator_payroll_no = au.emp_id
        AND a.status_type <> 9
        AND re.status_type <> 9
        AND r.status_type IN (0, 1)
    ) active_assignment
    ORDER BY
      au.active_status DESC,
      au.admin_role_type DESC,
      full_name,
      au.emp_id;
  `);

  return result.recordset as AdminUserRow[];
}

async function getUserSummary() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      SUM(CASE WHEN active_status = 1 AND admin_role_type = 1 THEN 1 ELSE 0 END) AS admin_count,
      SUM(CASE WHEN active_status = 1 AND admin_role_type = 0 THEN 1 ELSE 0 END) AS evaluator_count,
      SUM(CASE WHEN active_status = 0 THEN 1 ELSE 0 END) AS inactive_count,
      (
        SELECT COUNT(DISTINCT a.evaluator_payroll_no)
        FROM dbo.competency_evaluator_assignment a
        JOIN dbo.competency_round_employee re
          ON re.round_employee_id = a.round_employee_id
        JOIN dbo.competency_round r
          ON r.round_id = re.round_id
        WHERE a.status_type <> 9
          AND re.status_type <> 9
          AND r.status_type IN (0, 1)
      ) AS active_assignment_evaluator_count
    FROM dbo.competency_admin_user;
  `);

  return result.recordset[0] as UserSummaryRow;
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  await requireAdminSession();
  const params = await searchParams;

  async function saveAdminUser(formData: FormData) {
    "use server";

    const currentSession = await requireAdminSession();
    const empId = String(formData.get("emp_id") || "").trim();
    const adminRoleType = Number(formData.get("admin_role_type") || 0);
    const activeStatus = Number(formData.get("active_status") || 1);

    if (!empId) {
      redirectWithAlert("error", "กรุณาเลือกเจ้าหน้าที่");
    }

    if (![0, 1].includes(adminRoleType)) {
      redirectWithAlert("error", "ประเภทสิทธิ์ไม่ถูกต้อง");
    }

    const pool = await getDbPool();

    const staffResult = await pool
      .request()
      .input("emp_id", sql.VarChar(20), empId).query(`
        SELECT TOP 1 CAST(EmpID AS varchar(20)) AS emp_id
        FROM dbo.Emp
        WHERE CAST(EmpID AS varchar(20)) = @emp_id;
      `);

    if (!staffResult.recordset[0]) {
      redirectWithAlert(
        "error",
        "ไม่พบรหัสนี้ในตาราง Emp จึงยังใช้ login ไม่ได้",
      );
    }

    await pool
      .request()
      .input("emp_id", sql.VarChar(20), empId)
      .input("admin_role_type", sql.Int, adminRoleType)
      .input("active_status", sql.Bit, activeStatus === 1)
      .input("created_by", sql.VarChar(20), currentSession.emp_id).query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.competency_admin_user
          WHERE emp_id = @emp_id
        )
        BEGIN
          UPDATE dbo.competency_admin_user
          SET admin_role_type = @admin_role_type,
              active_status = @active_status
          WHERE emp_id = @emp_id;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.competency_admin_user
            (emp_id, admin_role_type, active_status, created_date, created_by)
          VALUES
            (@emp_id, @admin_role_type, @active_status, SYSDATETIME(), @created_by);
        END;
      `);

    revalidatePath("/admin/admin-users");
    redirectWithAlert("success", "บันทึกสิทธิ์ผู้ใช้งานเรียบร้อยแล้ว");
  }

  async function setUserActiveStatus(formData: FormData) {
    "use server";

    await requireAdminSession();
    const adminUserId = Number(formData.get("admin_user_id") || 0);
    const activeStatus = Number(formData.get("active_status") || 0);

    if (!adminUserId) {
      redirectWithAlert("error", "ไม่พบรายการผู้ใช้งาน");
    }

    const pool = await getDbPool();

    await pool
      .request()
      .input("admin_user_id", sql.Int, adminUserId)
      .input("active_status", sql.Bit, activeStatus === 1).query(`
        UPDATE dbo.competency_admin_user
        SET active_status = @active_status
        WHERE admin_user_id = @admin_user_id;
      `);

    revalidatePath("/admin/admin-users");
    redirectWithAlert(
      "success",
      activeStatus === 1
        ? "เปิดใช้งานผู้ใช้งานเรียบร้อยแล้ว"
        : "ปิดใช้งานผู้ใช้งานเรียบร้อยแล้ว",
    );
  }

  async function setUserRole(formData: FormData) {
    "use server";

    await requireAdminSession();
    const adminUserId = Number(formData.get("admin_user_id") || 0);
    const adminRoleType = Number(formData.get("admin_role_type") || 0);

    if (!adminUserId || ![0, 1].includes(adminRoleType)) {
      redirectWithAlert("error", "ข้อมูลสิทธิ์ไม่ถูกต้อง");
    }

    const pool = await getDbPool();

    await pool
      .request()
      .input("admin_user_id", sql.Int, adminUserId)
      .input("admin_role_type", sql.Int, adminRoleType).query(`
        UPDATE dbo.competency_admin_user
        SET admin_role_type = @admin_role_type,
            active_status = 1
        WHERE admin_user_id = @admin_user_id;
      `);

    revalidatePath("/admin/admin-users");
    redirectWithAlert("success", "เปลี่ยนประเภทสิทธิ์เรียบร้อยแล้ว");
  }

  async function syncEvaluatorUsers() {
    "use server";

    const currentSession = await requireAdminSession();
    const pool = await getDbPool();

    const result = await pool
      .request()
      .input("created_by", sql.VarChar(20), currentSession.emp_id).query(`
        DECLARE @inserted_count int = 0;
        DECLARE @reactivated_count int = 0;
        DECLARE @deactivated_count int = 0;

        ;WITH active_evaluator AS (
          SELECT DISTINCT CAST(a.evaluator_payroll_no AS varchar(20)) AS emp_id
          FROM dbo.competency_evaluator_assignment a
          JOIN dbo.competency_round_employee re
            ON re.round_employee_id = a.round_employee_id
          JOIN dbo.competency_round r
            ON r.round_id = re.round_id
          JOIN dbo.Emp e
            ON CAST(e.EmpID AS varchar(20)) = CAST(a.evaluator_payroll_no AS varchar(20))
          WHERE a.status_type <> 9
            AND re.status_type <> 9
            AND r.status_type IN (0, 1)
        )
        INSERT INTO dbo.competency_admin_user
          (emp_id, admin_role_type, active_status, created_date, created_by)
        SELECT
          ae.emp_id,
          0,
          1,
          SYSDATETIME(),
          @created_by
        FROM active_evaluator ae
        WHERE NOT EXISTS (
          SELECT 1
          FROM dbo.competency_admin_user au
          WHERE au.emp_id = ae.emp_id
        );

        SET @inserted_count = @@ROWCOUNT;

        ;WITH active_evaluator AS (
          SELECT DISTINCT CAST(a.evaluator_payroll_no AS varchar(20)) AS emp_id
          FROM dbo.competency_evaluator_assignment a
          JOIN dbo.competency_round_employee re
            ON re.round_employee_id = a.round_employee_id
          JOIN dbo.competency_round r
            ON r.round_id = re.round_id
          JOIN dbo.Emp e
            ON CAST(e.EmpID AS varchar(20)) = CAST(a.evaluator_payroll_no AS varchar(20))
          WHERE a.status_type <> 9
            AND re.status_type <> 9
            AND r.status_type IN (0, 1)
        )
        UPDATE au
        SET active_status = 1
        FROM dbo.competency_admin_user au
        JOIN active_evaluator ae
          ON ae.emp_id = au.emp_id
        WHERE au.admin_role_type = 0
          AND au.active_status = 0
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_admin_user admin_au
            WHERE admin_au.emp_id = au.emp_id
              AND admin_au.admin_role_type = 1
          );

        SET @reactivated_count = @@ROWCOUNT;

        UPDATE au
        SET active_status = 0
        FROM dbo.competency_admin_user au
        WHERE au.admin_role_type = 0
          AND au.active_status = 1
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.competency_evaluator_assignment a
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id = a.round_employee_id
            JOIN dbo.competency_round r
              ON r.round_id = re.round_id
            WHERE a.evaluator_payroll_no = au.emp_id
              AND a.status_type <> 9
              AND re.status_type <> 9
              AND r.status_type IN (0, 1)
          );

        SET @deactivated_count = @@ROWCOUNT;

        SELECT
          @inserted_count AS inserted_count,
          @reactivated_count AS reactivated_count,
          @deactivated_count AS deactivated_count;
      `);

    const row = result.recordset[0] as
      | {
          inserted_count: number;
          reactivated_count: number;
          deactivated_count: number;
        }
      | undefined;

    revalidatePath("/admin/admin-users");
    revalidatePath("/admin/assignments");

    redirectWithAlert(
      "success",
      `ซิงค์สิทธิ์ผู้ประเมินเรียบร้อยแล้ว เพิ่มใหม่ ${Number(row?.inserted_count || 0).toLocaleString()} คน / เปิดใช้งานใหม่ ${Number(row?.reactivated_count || 0).toLocaleString()} คน / ปิดใช้งาน ${Number(row?.deactivated_count || 0).toLocaleString()} คน`,
    );
  }

  const [staffOptions, adminUsers, summary] = await Promise.all([
    getStaffOptions(),
    getAdminUsers(),
    getUserSummary(),
  ]);

  const searchableStaffOptions = staffOptions.map((staff) => ({
    value: staff.emp_id,
    label: `${staff.full_name || staff.emp_id} [${staff.emp_id}]${staff.section_name ? ` - ${staff.section_name}` : ""}`,
  }));

  return (
    <div>
      <ActionAlert type={params?.alert_type} message={params?.alert_message} />

      <PageHeader
        title="ผู้ใช้งานระบบ"
        description="เพิ่มสิทธิ์ผู้ดูแลระบบ และซิงค์สิทธิ์ผู้ประเมินสำหรับเข้าใช้งานเว็บ Competency Assessment"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ผู้ดูแลระบบที่ใช้งาน
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">
            {Number(summary?.admin_count || 0).toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ผู้ประเมินที่ใช้งาน
          </p>
          <p className="mt-2 text-3xl font-semibold text-[#1ab394]">
            {Number(summary?.evaluator_count || 0).toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">ปิดใช้งาน</p>
          <p className="mt-2 text-3xl font-semibold text-[#ed5565]">
            {Number(summary?.inactive_count || 0).toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ผู้ประเมินจากรอบร่าง/เปิด
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">
            {Number(
              summary?.active_assignment_evaluator_count || 0,
            ).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-8">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            เพิ่ม / อัปเดตสิทธิ์เข้าเว็บ
          </h2>
          <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            ใช้สำหรับเพิ่มผู้ดูแลระบบ หรือเปิดสิทธิ์ผู้ประเมินรายคน
            โดยต้องมีรหัสอยู่ในตาราง Emp จึงจะ login ได้
          </p>

          <form
            action={saveAdminUser}
            className="grid grid-cols-1 gap-4 lg:grid-cols-12"
          >
            <div className="lg:col-span-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                เจ้าหน้าที่
              </label>
              <SearchableSelect
                name="emp_id"
                required
                placeholder="เลือกเจ้าหน้าที่"
                options={searchableStaffOptions}
              />
            </div>

            <div className="lg:col-span-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ประเภทสิทธิ์
              </label>
              <select
                name="admin_role_type"
                defaultValue="1"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="1">ผู้ดูแลระบบ</option>
                <option value="0">ผู้ประเมิน</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                สถานะ
              </label>
              <select
                name="active_status"
                defaultValue="1"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="1">เปิดใช้งาน</option>
                <option value="0">ปิดใช้งาน</option>
              </select>
            </div>

            <div className="flex justify-end lg:col-span-12">
              <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
              >
                บันทึกสิทธิ์ผู้ใช้งาน
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-4">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            ซิงค์ผู้ประเมินจาก assignment
          </h2>
          <p className="mb-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
            เพิ่มผู้ประเมินที่ยังไม่มีสิทธิ์เข้าเว็บเป็น role ผู้ประเมิน
            และเปิดใช้งาน role ผู้ประเมินที่ถูกใช้ในรอบร่าง/รอบเปิด
            ถ้าคนนั้นเป็น admin อยู่แล้ว ระบบจะไม่เปลี่ยน role ของเขา
          </p>

          <form action={syncEvaluatorUsers}>
            <button
              type="submit"
              className="h-11 w-full rounded-lg bg-[#1ab394] px-5 text-sm font-medium text-white hover:bg-[#18a689]"
            >
              ซิงค์สิทธิ์ผู้ประเมิน
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            เมื่อไม่มี assignment ในรอบร่าง/รอบเปิดแล้ว role
            ผู้ประเมินจะถูกปิดใช้งานจากปุ่มซิงค์นี้
            และรอบใหม่ค่อยเปิดใช้งานใหม่อัตโนมัติ
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              รายการผู้ใช้งานระบบ
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ผู้ใช้งานปัจจุบันที่มีสิทธิ์เข้าเว็บ Competency Assessment
            </p>
          </div>
        </div>

        <DataTable
          headers={[
            "เจ้าหน้าที่",
            "หน่วยงาน",
            "ประเภท",
            "สถานะ",
            "Assignment รอบปัจจุบัน",
            "สร้างเมื่อ",
            "จัดการ",
          ]}
          emptyText="ยังไม่มีผู้ใช้งานระบบ"
          searchPlaceholder="ค้นหาชื่อ รหัส หน่วยงาน หรือประเภทสิทธิ์"
          filters={[
            {
              key: "role",
              label: "ประเภทสิทธิ์",
              options: [
                { value: "1", label: "ผู้ดูแลระบบ" },
                { value: "0", label: "ผู้ประเมิน" },
              ],
            },
            {
              key: "active",
              label: "สถานะ",
              options: [
                { value: "1", label: "ใช้งาน" },
                { value: "0", label: "ปิดใช้งาน" },
              ],
            },
          ]}
        >
          {adminUsers.map((user) => (
            <tr
              key={user.admin_user_id}
              data-filter-role={String(user.admin_role_type)}
              data-filter-active={user.active_status ? "1" : "0"}
              data-search={`${user.emp_id} ${user.full_name || ""} ${user.section_name || ""} ${roleText(Number(user.admin_role_type))} ${user.active_status ? "ใช้งาน" : "ปิดใช้งาน"}`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <div className="font-medium text-gray-800 dark:text-white/90">
                  {user.full_name || user.emp_id}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {user.emp_id}
                </div>
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {user.section_name || "-"}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <RoleBadge roleType={Number(user.admin_role_type)} />
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <ActiveStatusBadge active={Boolean(user.active_status)} />
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <div>
                  {Number(user.active_assignment_count || 0).toLocaleString()}{" "}
                  รายการ
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {user.latest_round_code || "-"}
                </div>
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {formatThaiDate(user.created_date, "short")}
                {user.created_by ? (
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    โดย {user.created_by}
                  </div>
                ) : null}
              </td>

              <td className="px-5 py-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <form action={setUserRole}>
                    <input
                      type="hidden"
                      name="admin_user_id"
                      value={user.admin_user_id}
                    />
                    <input
                      type="hidden"
                      name="admin_role_type"
                      value={Number(user.admin_role_type) === 1 ? 0 : 1}
                    />
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-[#f8ac59] px-3 text-xs font-medium text-white hover:bg-[#f7a142]"
                    >
                      {Number(user.admin_role_type) === 1
                        ? "เปลี่ยนเป็นผู้ประเมิน"
                        : "ตั้งเป็น admin"}
                    </button>
                  </form>

                  <form action={setUserActiveStatus}>
                    <input
                      type="hidden"
                      name="admin_user_id"
                      value={user.admin_user_id}
                    />
                    <input
                      type="hidden"
                      name="active_status"
                      value={user.active_status ? 0 : 1}
                    />
                    <button
                      type="submit"
                      className={
                        user.active_status
                          ? "inline-flex h-9 items-center justify-center rounded-lg bg-[#ed5565] px-3 text-xs font-medium text-white hover:bg-[#e64253]"
                          : "inline-flex h-9 items-center justify-center rounded-lg bg-[#1ab394] px-3 text-xs font-medium text-white hover:bg-[#18a689]"
                      }
                    >
                      {user.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  );
}