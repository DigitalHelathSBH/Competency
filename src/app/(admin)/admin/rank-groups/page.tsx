import RankGroupFormTable, {
  type RankGroupItem,
} from "@/components/competency/RankGroupFormTable";
import PageHeader from "@/components/competency/PageHeader";
import { getDbPool, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/rank-groups";

async function getRankGroups() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      rank_group_id,
      rank_group_name,
      sort_order,
      active_status
    FROM dbo.competency_rank_group
    ORDER BY active_status DESC, sort_order, rank_group_id;
  `);

  return result.recordset.map((row) => ({
    rank_group_id: Number(row.rank_group_id),
    rank_group_name: String(row.rank_group_name || ""),
    sort_order: Number(row.sort_order || 0),
    active_status: Boolean(row.active_status),
  })) as RankGroupItem[];
}

export default async function RankGroupsPage() {
  await requireAdminSession();

  async function createRankGroup(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const rankGroupName = String(formData.get("rank_group_name") || "").trim();
    const sortOrder = Number(formData.get("sort_order") || 0);

    if (!rankGroupName) {
      throw new Error("กรุณาระบุชื่อกลุ่มระดับ");
    }

    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("ลำดับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("rank_group_name", sql.NVarChar(100), rankGroupName)
      .input("sort_order", sql.Int, sortOrder)
      .input("created_by", sql.VarChar(20), session.emp_id).query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group
          WHERE LTRIM(RTRIM(rank_group_name)) = @rank_group_name
        )
        BEGIN
          THROW 50010, N'ชื่อกลุ่มระดับนี้มีอยู่แล้ว', 1;
        END;

        INSERT INTO dbo.competency_rank_group
          (
            rank_group_name,
            sort_order,
            active_status,
            created_date,
            created_by
          )
        VALUES
          (
            @rank_group_name,
            @sort_order,
            1,
            SYSDATETIME(),
            @created_by
          );
      `);

    revalidatePath(PAGE_PATH);
  }

  async function updateRankGroup(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupId = Number(formData.get("rank_group_id"));
    const rankGroupName = String(formData.get("rank_group_name") || "").trim();
    const sortOrder = Number(formData.get("sort_order"));

    if (!rankGroupId) {
      throw new Error("ไม่พบกลุ่มระดับที่ต้องการแก้ไข");
    }

    if (!rankGroupName) {
      throw new Error("กรุณาระบุชื่อกลุ่มระดับ");
    }

    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("ลำดับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("rank_group_name", sql.NVarChar(100), rankGroupName)
      .input("sort_order", sql.Int, sortOrder).query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group
          WHERE LTRIM(RTRIM(rank_group_name)) = @rank_group_name
            AND rank_group_id <> @rank_group_id
        )
        BEGIN
          THROW 50011, N'ชื่อกลุ่มระดับนี้มีอยู่แล้ว', 1;
        END;

        UPDATE dbo.competency_rank_group
        SET rank_group_name = @rank_group_name,
            sort_order = @sort_order
        WHERE rank_group_id = @rank_group_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  async function toggleRankGroupStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupId = Number(formData.get("rank_group_id"));
    const activeStatus = Number(formData.get("active_status")) === 1;

    if (!rankGroupId) {
      throw new Error("ไม่พบกลุ่มระดับที่ต้องการเปลี่ยนสถานะ");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("active_status", sql.Bit, activeStatus).query(`
        UPDATE dbo.competency_rank_group
        SET active_status = @active_status
        WHERE rank_group_id = @rank_group_id;

        IF @active_status = 0
        BEGIN
          UPDATE dbo.competency_rank_group_map
          SET active_status = 0
          WHERE rank_group_id = @rank_group_id;

          UPDATE dbo.competency_tenure_rank_group
          SET active_status = 0,
              updated_date = SYSDATETIME()
          WHERE rank_group_id = @rank_group_id;
        END;
      `);

    revalidatePath(PAGE_PATH);
    revalidatePath("/admin/rank-group-maps");
    revalidatePath("/admin/tenure-rank-groups");
  }

  const rankGroups = await getRankGroups();

  return (
    <div>
      <PageHeader
        title="กลุ่มระดับการถูกประเมิน"
        description="จัดการชื่อกลุ่มระดับ ลำดับ และสถานะสำหรับใช้กับการประเมิน"
      />

      <RankGroupFormTable
        rankGroups={rankGroups}
        createAction={createRankGroup}
        updateAction={updateRankGroup}
        toggleAction={toggleRankGroupStatus}
      />
    </div>
  );
}