import TenureRankGroupFormTable, {
  type RankGroupOption,
  type TenureRankGroupItem,
} from "@/components/competency/TenureRankGroupFormTable";
import PageHeader from "@/components/competency/PageHeader";
import { getDbPool, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/tenure-rank-groups";

async function getActiveRankGroups() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      rank_group_id,
      rank_group_name
    FROM dbo.competency_rank_group
    WHERE active_status = 1
    ORDER BY sort_order, rank_group_id;
  `);

  return result.recordset.map((row) => ({
    rank_group_id: Number(row.rank_group_id),
    rank_group_name: String(row.rank_group_name || ""),
  })) as RankGroupOption[];
}

async function getTenureRankGroups() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      t.tenure_rank_group_id,
      t.min_service_year,
      t.max_service_year,
      t.rank_group_id,
      ISNULL(g.rank_group_name, N'-') AS rank_group_name,
      t.active_status
    FROM dbo.competency_tenure_rank_group t
    LEFT JOIN dbo.competency_rank_group g
      ON g.rank_group_id = t.rank_group_id
    ORDER BY
      t.active_status DESC,
      t.min_service_year,
      ISNULL(t.max_service_year, 2147483647),
      t.tenure_rank_group_id;
  `);

  return result.recordset.map((row) => ({
    tenure_rank_group_id: Number(row.tenure_rank_group_id),
    min_service_year: Number(row.min_service_year),
    max_service_year:
      row.max_service_year === null || row.max_service_year === undefined
        ? null
        : Number(row.max_service_year),
    rank_group_id: Number(row.rank_group_id),
    rank_group_name: String(row.rank_group_name || "-"),
    active_status: Boolean(row.active_status),
  })) as TenureRankGroupItem[];
}

function parseYearRange(formData: FormData) {
  const minText = String(formData.get("min_service_year") || "").trim();
  const maxText = String(formData.get("max_service_year") || "").trim();
  const minServiceYear = Number(minText);
  const maxServiceYear = maxText === "" ? null : Number(maxText);

  if (
    minText === "" ||
    !Number.isInteger(minServiceYear) ||
    minServiceYear < 0
  ) {
    throw new Error("กรุณาระบุปีเริ่มต้นเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  }

  if (
    maxServiceYear !== null &&
    (!Number.isInteger(maxServiceYear) || maxServiceYear <= minServiceYear)
  ) {
    throw new Error("ปีสิ้นสุดต้องเป็นจำนวนเต็มและมากกว่าปีเริ่มต้น");
  }

  return { minServiceYear, maxServiceYear };
}

export default async function TenureRankGroupsPage() {
  await requireAdminSession();

  async function createTenureRankGroup(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const { minServiceYear, maxServiceYear } = parseYearRange(formData);
    const rankGroupId = Number(formData.get("rank_group_id"));

    if (!rankGroupId) {
      throw new Error("กรุณาเลือกกลุ่มระดับการถูกประเมิน");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("min_service_year", sql.Int, minServiceYear)
      .input("max_service_year", sql.Int, maxServiceYear)
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("created_by", sql.VarChar(20), session.emp_id).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group
          WHERE rank_group_id = @rank_group_id
            AND active_status = 1
        )
        BEGIN
          THROW 50040, N'กลุ่มระดับที่เลือกไม่พร้อมใช้งาน', 1;
        END;

        IF EXISTS (
          SELECT 1
          FROM dbo.competency_tenure_rank_group t
          WHERE t.active_status = 1
            AND @min_service_year < ISNULL(t.max_service_year, 2147483647)
            AND t.min_service_year < ISNULL(@max_service_year, 2147483647)
        )
        BEGIN
          THROW 50041, N'ช่วงอายุงานซ้อนทับกับรายการที่เปิดใช้งานอยู่', 1;
        END;

        INSERT INTO dbo.competency_tenure_rank_group
          (
            min_service_year,
            max_service_year,
            rank_group_id,
            active_status,
            created_date,
            created_by
          )
        VALUES
          (
            @min_service_year,
            @max_service_year,
            @rank_group_id,
            1,
            SYSDATETIME(),
            @created_by
          );
      `);

    revalidatePath(PAGE_PATH);
  }

  async function updateTenureRankGroup(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const tenureRankGroupId = Number(formData.get("tenure_rank_group_id"));
    const { minServiceYear, maxServiceYear } = parseYearRange(formData);
    const rankGroupId = Number(formData.get("rank_group_id"));

    if (!tenureRankGroupId) {
      throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
    }

    if (!rankGroupId) {
      throw new Error("กรุณาเลือกกลุ่มระดับการถูกประเมิน");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("tenure_rank_group_id", sql.Int, tenureRankGroupId)
      .input("min_service_year", sql.Int, minServiceYear)
      .input("max_service_year", sql.Int, maxServiceYear)
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("updated_by", sql.VarChar(20), session.emp_id).query(`
        DECLARE @current_active_status BIT;

        SELECT @current_active_status = active_status
        FROM dbo.competency_tenure_rank_group
        WHERE tenure_rank_group_id = @tenure_rank_group_id;

        IF @current_active_status IS NULL
        BEGIN
          THROW 50042, N'ไม่พบรายการที่ต้องการแก้ไข', 1;
        END;

        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group
          WHERE rank_group_id = @rank_group_id
            AND active_status = 1
        )
        BEGIN
          THROW 50043, N'กลุ่มระดับที่เลือกไม่พร้อมใช้งาน', 1;
        END;

        IF @current_active_status = 1
           AND EXISTS (
             SELECT 1
             FROM dbo.competency_tenure_rank_group t
             WHERE t.tenure_rank_group_id <> @tenure_rank_group_id
               AND t.active_status = 1
               AND @min_service_year < ISNULL(t.max_service_year, 2147483647)
               AND t.min_service_year < ISNULL(@max_service_year, 2147483647)
           )
        BEGIN
          THROW 50044, N'ช่วงอายุงานซ้อนทับกับรายการที่เปิดใช้งานอยู่', 1;
        END;

        UPDATE dbo.competency_tenure_rank_group
        SET min_service_year = @min_service_year,
            max_service_year = @max_service_year,
            rank_group_id = @rank_group_id,
            updated_date = SYSDATETIME(),
            updated_by = @updated_by
        WHERE tenure_rank_group_id = @tenure_rank_group_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  async function toggleTenureRankGroupStatus(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const tenureRankGroupId = Number(formData.get("tenure_rank_group_id"));
    const activeStatus = Number(formData.get("active_status")) === 1;

    if (!tenureRankGroupId) {
      throw new Error("ไม่พบรายการที่ต้องการเปลี่ยนสถานะ");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("tenure_rank_group_id", sql.Int, tenureRankGroupId)
      .input("active_status", sql.Bit, activeStatus)
      .input("updated_by", sql.VarChar(20), session.emp_id).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_tenure_rank_group
          WHERE tenure_rank_group_id = @tenure_rank_group_id
        )
        BEGIN
          THROW 50045, N'ไม่พบรายการที่ต้องการเปลี่ยนสถานะ', 1;
        END;

        IF @active_status = 1
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.competency_tenure_rank_group t
            JOIN dbo.competency_rank_group g
              ON g.rank_group_id = t.rank_group_id
            WHERE t.tenure_rank_group_id = @tenure_rank_group_id
              AND g.active_status = 1
          )
          BEGIN
            THROW 50046,
                  N'ไม่สามารถเปิดใช้งานได้ เนื่องจากกลุ่มระดับถูกปิดใช้งาน',
                  1;
          END;

          IF EXISTS (
            SELECT 1
            FROM dbo.competency_tenure_rank_group current_row
            JOIN dbo.competency_tenure_rank_group other_row
              ON other_row.tenure_rank_group_id <> current_row.tenure_rank_group_id
             AND other_row.active_status = 1
             AND current_row.min_service_year <
                 ISNULL(other_row.max_service_year, 2147483647)
             AND other_row.min_service_year <
                 ISNULL(current_row.max_service_year, 2147483647)
            WHERE current_row.tenure_rank_group_id = @tenure_rank_group_id
          )
          BEGIN
            THROW 50047, N'ไม่สามารถเปิดใช้งานได้ เนื่องจากช่วงอายุงานซ้อนทับกัน', 1;
          END;
        END;

        UPDATE dbo.competency_tenure_rank_group
        SET active_status = @active_status,
            updated_date = SYSDATETIME(),
            updated_by = @updated_by
        WHERE tenure_rank_group_id = @tenure_rank_group_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  const [rankGroups, tenureRankGroups] = await Promise.all([
    getActiveRankGroups(),
    getTenureRankGroups(),
  ]);

  return (
    <div>
      <PageHeader
        title="ช่วงอายุงาน"
        description="กำหนดกลุ่มระดับการถูกประเมินตามจำนวนปีที่ปฏิบัติงาน"
      />

      <TenureRankGroupFormTable
        rankGroups={rankGroups}
        tenureRankGroups={tenureRankGroups}
        createAction={createTenureRankGroup}
        updateAction={updateTenureRankGroup}
        toggleAction={toggleTenureRankGroupStatus}
      />
    </div>
  );
}