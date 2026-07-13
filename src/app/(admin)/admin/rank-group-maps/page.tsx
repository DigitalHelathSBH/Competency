import GovernmentRankMapFormTable, {
  type GovernmentRankMapItem,
  type GovernmentRankOption,
  type RankGroupOption,
} from "@/components/competency/GovernmentRankMapFormTable";
import PageHeader from "@/components/competency/PageHeader";
import {
  getDbPool,
  getSsbDatabaseName,
  quoteSqlName,
  sql,
} from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/rank-group-maps";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

async function getGovernmentRanks() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      p.RANK AS rank_code,
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(NULLIF(LTRIM(RTRIM(s.THainame)), ''), s.ENGLISHNAME)
      ) AS rank_name
    FROM ${ssbDb()}.dbo.PYREXT p
    JOIN ${ssbDb()}.dbo.SYSCONFIG s
      ON s.CODE = p.RANK
     AND s.CTRLCODE = '60010'
    WHERE p.SITECODE = '1'
      AND p.TERMINATEDATE IS NULL
      AND NULLIF(LTRIM(RTRIM(p.RANK)), '') IS NOT NULL
    GROUP BY
      p.RANK,
      s.THainame,
      s.ENGLISHNAME
    ORDER BY
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(NULLIF(LTRIM(RTRIM(s.THainame)), ''), s.ENGLISHNAME)
      ),
      p.RANK;
  `);

  return result.recordset.map((row) => ({
    rank_code: String(row.rank_code || "").trim(),
    rank_name: String(row.rank_name || row.rank_code || "").trim(),
  })) as GovernmentRankOption[];
}

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

async function getRankGroupMaps() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      m.rank_group_map_id,
      m.rank_code,
      ISNULL(
        ${ssbDb()}.dbo.GetSSBName(
          ISNULL(NULLIF(LTRIM(RTRIM(s.THainame)), ''), s.ENGLISHNAME)
        ),
        m.rank_code
      ) AS rank_name,
      m.rank_group_id,
      ISNULL(g.rank_group_name, N'-') AS rank_group_name,
      m.active_status
    FROM dbo.competency_rank_group_map m
    LEFT JOIN dbo.competency_rank_group g
      ON g.rank_group_id = m.rank_group_id
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG s
      ON s.CODE = m.rank_code
     AND s.CTRLCODE = '60010'
    ORDER BY
      m.active_status DESC,
      g.sort_order,
      rank_name,
      m.rank_code;
  `);

  return result.recordset.map((row) => ({
    rank_group_map_id: Number(row.rank_group_map_id),
    rank_code: String(row.rank_code || "").trim(),
    rank_name: String(row.rank_name || row.rank_code || "").trim(),
    rank_group_id: Number(row.rank_group_id),
    rank_group_name: String(row.rank_group_name || "-"),
    active_status: Boolean(row.active_status),
  })) as GovernmentRankMapItem[];
}

export default async function GovernmentRankMapsPage() {
  await requireAdminSession();

  async function createRankGroupMap(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const rankCode = String(formData.get("rank_code") || "").trim();
    const rankGroupId = Number(formData.get("rank_group_id"));

    if (!rankCode) {
      throw new Error("กรุณาเลือกระดับข้าราชการ");
    }

    if (!rankGroupId) {
      throw new Error("กรุณาเลือกกลุ่มระดับการถูกประเมิน");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("rank_code", sql.VarChar(20), rankCode)
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("created_by", sql.VarChar(20), session.emp_id).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM ${ssbDb()}.dbo.PYREXT
          WHERE RANK = @rank_code
            AND SITECODE = '1'
            AND TERMINATEDATE IS NULL
        )
        BEGIN
          THROW 50020,
                N'ระดับที่เลือกไม่พบในข้าราชการที่ยังปฏิบัติงานอยู่',
                1;
        END;

        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group
          WHERE rank_group_id = @rank_group_id
            AND active_status = 1
        )
        BEGIN
          THROW 50021, N'กลุ่มระดับที่เลือกไม่พร้อมใช้งาน', 1;
        END;

        IF EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group_map
          WHERE rank_code = @rank_code
        )
        BEGIN
          THROW 50022, N'ระดับข้าราชการนี้ถูกกำหนดไว้แล้ว', 1;
        END;

        INSERT INTO dbo.competency_rank_group_map
          (
            rank_code,
            rank_group_id,
            active_status,
            created_date,
            created_by
          )
        VALUES
          (
            @rank_code,
            @rank_group_id,
            1,
            SYSDATETIME(),
            @created_by
          );
      `);

    revalidatePath(PAGE_PATH);
  }

  async function updateRankGroupMap(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupMapId = Number(formData.get("rank_group_map_id"));
    const rankCode = String(formData.get("rank_code") || "").trim();
    const rankGroupId = Number(formData.get("rank_group_id"));

    if (!rankGroupMapId) {
      throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
    }

    if (!rankCode) {
      throw new Error("กรุณาเลือกระดับข้าราชการ");
    }

    if (!rankGroupId) {
      throw new Error("กรุณาเลือกกลุ่มระดับการถูกประเมิน");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("rank_group_map_id", sql.Int, rankGroupMapId)
      .input("rank_code", sql.VarChar(20), rankCode)
      .input("rank_group_id", sql.Int, rankGroupId).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group_map
          WHERE rank_group_map_id = @rank_group_map_id
        )
        BEGIN
          THROW 50023, N'ไม่พบรายการที่ต้องการแก้ไข', 1;
        END;

        IF NOT EXISTS (
          SELECT 1
          FROM ${ssbDb()}.dbo.PYREXT
          WHERE RANK = @rank_code
            AND SITECODE = '1'
            AND TERMINATEDATE IS NULL
        )
        BEGIN
          THROW 50024,
                N'ระดับที่เลือกไม่พบในข้าราชการที่ยังปฏิบัติงานอยู่',
                1;
        END;

        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group
          WHERE rank_group_id = @rank_group_id
            AND active_status = 1
        )
        BEGIN
          THROW 50025, N'กลุ่มระดับที่เลือกไม่พร้อมใช้งาน', 1;
        END;

        IF EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group_map
          WHERE rank_code = @rank_code
            AND rank_group_map_id <> @rank_group_map_id
        )
        BEGIN
          THROW 50026, N'ระดับข้าราชการนี้ถูกกำหนดไว้แล้ว', 1;
        END;

        UPDATE dbo.competency_rank_group_map
        SET rank_code = @rank_code,
            rank_group_id = @rank_group_id
        WHERE rank_group_map_id = @rank_group_map_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  async function toggleRankGroupMapStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupMapId = Number(formData.get("rank_group_map_id"));
    const activeStatus = Number(formData.get("active_status")) === 1;

    if (!rankGroupMapId) {
      throw new Error("ไม่พบรายการที่ต้องการเปลี่ยนสถานะ");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("rank_group_map_id", sql.Int, rankGroupMapId)
      .input("active_status", sql.Bit, activeStatus).query(`
        IF @active_status = 1
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.competency_rank_group_map m
            JOIN dbo.competency_rank_group g
              ON g.rank_group_id = m.rank_group_id
            WHERE m.rank_group_map_id = @rank_group_map_id
              AND g.active_status = 1
          )
          BEGIN
            THROW 50027,
                  N'ไม่สามารถเปิดใช้งานได้ เนื่องจากกลุ่มระดับถูกปิดใช้งาน',
                  1;
          END;

          IF NOT EXISTS (
            SELECT 1
            FROM dbo.competency_rank_group_map m
            JOIN ${ssbDb()}.dbo.PYREXT p
              ON p.RANK = m.rank_code
             AND p.SITECODE = '1'
             AND p.TERMINATEDATE IS NULL
            WHERE m.rank_group_map_id = @rank_group_map_id
          )
          BEGIN
            THROW 50028,
                  N'ไม่สามารถเปิดใช้งานได้ เนื่องจากไม่พบข้าราชการที่ใช้ระดับนี้',
                  1;
          END;
        END;

        UPDATE dbo.competency_rank_group_map
        SET active_status = @active_status
        WHERE rank_group_map_id = @rank_group_map_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  const [governmentRanks, rankGroups, rankGroupMaps] = await Promise.all([
    getGovernmentRanks(),
    getActiveRankGroups(),
    getRankGroupMaps(),
  ]);

  return (
    <div>
      <PageHeader
        title="ระดับข้าราชการ"
        description="กำหนดกลุ่มระดับการถูกประเมินจาก"
      />

      <GovernmentRankMapFormTable
        governmentRanks={governmentRanks}
        rankGroups={rankGroups}
        rankGroupMaps={rankGroupMaps}
        createAction={createRankGroupMap}
        updateAction={updateRankGroupMap}
        toggleAction={toggleRankGroupMapStatus}
      />
    </div>
  );
}