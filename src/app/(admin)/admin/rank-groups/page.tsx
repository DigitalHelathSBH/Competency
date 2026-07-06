import PageHeader from "@/components/competency/PageHeader";
import SearchableSelect from "@/components/competency/SearchableSelect";
import DataTable from "@/components/competency/DataTable";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type RankGroupRow = {
  rank_group_id: number;
  rank_group_name: string;
  sort_order: number;
  active_status: boolean;
};

type RankMapRow = {
  rank_group_map_id: number;
  rank_code: string;
  rank_group_id: number;
  rank_group_name: string | null;
  competency_percent: number;
  active_status: boolean;
  rank_name: string;
};

type PyrextRankRow = {
  rank_code: string;
  rank_name: string;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

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

  return result.recordset as RankGroupRow[];
}

async function getRankGroupMaps() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
        m.rank_group_map_id,
        m.rank_code,
        ${ssbDb()}.dbo.GetSSBName(THAINAME) as rank_name,
        m.rank_group_id,
        g.rank_group_name,
        CAST(ISNULL(m.competency_percent, 30) AS decimal(5,2)) AS competency_percent,
        m.active_status
    FROM dbo.competency_rank_group_map m
    LEFT JOIN dbo.competency_rank_group g
        ON g.rank_group_id = m.rank_group_id
    JOIN ${ssbDb()}.dbo.SYSCONFIG s ON m.rank_code = s.CODE and CTRLCODE = '60010'
    ORDER BY m.active_status DESC, m.rank_group_id, m.rank_group_map_id;
  `);

  return result.recordset as RankMapRow[];
}

async function getPyrextRanks() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
        RANK as rank_code,
        ${ssbDb()}.dbo.GetSSBName(ISNULL(THAINAME,ENGLISHNAME)) as rank_name
    FROM ${ssbDb()}.dbo.PYREXT p
    JOIN ${ssbDb()}.dbo.SYSCONFIG s
        ON RANK = s.CODE
        AND CTRLCODE = '60010'
    WHERE TERMINATEDATE is null
    GROUP BY RANK, THAINAME,ENGLISHNAME
    order by ISNULL(THAINAME,ENGLISHNAME);
  `);

  return result.recordset as PyrextRankRow[];
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

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

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

    const pool = await getDbPool();

    await pool
      .request()
      .input("rank_group_name", sql.NVarChar(100), rankGroupName)
      .input("sort_order", sql.Int, sortOrder)
      .input("created_by", sql.VarChar(20), session.emp_id).query(`
        INSERT INTO dbo.competency_rank_group
          (rank_group_name, sort_order, active_status, created_by)
        VALUES
          (@rank_group_name, @sort_order, 1, @created_by);
      `);

    revalidatePath("/admin/rank-groups");
  }

  async function saveRankGroupMap(formData: FormData) {
    "use server";

    const session = await requireAdminSession();

    const rankCode = String(formData.get("rank_code") || "").trim();
    const rankGroupId = Number(formData.get("rank_group_id"));
    const competencyPercent = Number(formData.get("competency_percent") || 30);

    if (!rankCode) {
      throw new Error("กรุณาเลือก RANK");
    }

    if (!rankGroupId) {
      throw new Error("กรุณาเลือกกลุ่มระดับ");
    }

    if (
      !Number.isFinite(competencyPercent) ||
      competencyPercent < 0 ||
      competencyPercent > 100
    ) {
      throw new Error("กรุณาระบุเปอร์เซ็นต์ Competency ระหว่าง 0-100");
    }

    const pool = await getDbPool();

    await pool
      .request()
      .input("rank_code", sql.VarChar(20), rankCode)
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("competency_percent", sql.Decimal(5, 2), competencyPercent)
      .input("created_by", sql.VarChar(20), session.emp_id).query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.competency_rank_group_map
          WHERE rank_code = @rank_code
            AND active_status = 1
        )
        BEGIN
          UPDATE dbo.competency_rank_group_map
          SET rank_group_id = @rank_group_id,
              competency_percent = @competency_percent
          WHERE rank_code = @rank_code
            AND active_status = 1;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.competency_rank_group_map
            (rank_code, rank_group_id, competency_percent, active_status, created_by)
          VALUES
            (@rank_code, @rank_group_id, @competency_percent, 1, @created_by);
        END
      `);

    revalidatePath("/admin/rank-groups");
  }

  async function updateRankGroupMapCompetencyPercent(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupMapId = Number(formData.get("rank_group_map_id"));
    const competencyPercent = Number(formData.get("competency_percent") || 30);

    if (!rankGroupMapId) {
      throw new Error("ไม่พบรายการระดับที่ต้องการแก้ไข");
    }

    if (
      !Number.isFinite(competencyPercent) ||
      competencyPercent < 0 ||
      competencyPercent > 100
    ) {
      throw new Error("กรุณาระบุเปอร์เซ็นต์ Competency ระหว่าง 0-100");
    }

    const pool = await getDbPool();

    await pool
      .request()
      .input("rank_group_map_id", sql.Int, rankGroupMapId)
      .input("competency_percent", sql.Decimal(5, 2), competencyPercent).query(`
        UPDATE dbo.competency_rank_group_map
        SET competency_percent = @competency_percent
        WHERE rank_group_map_id = @rank_group_map_id;
      `);

    revalidatePath("/admin/rank-groups");
  }

  async function toggleRankGroupStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupId = Number(formData.get("rank_group_id"));
    const activeStatus = Number(formData.get("active_status"));

    const pool = await getDbPool();

    await pool
      .request()
      .input("rank_group_id", sql.Int, rankGroupId)
      .input("active_status", sql.Bit, activeStatus === 1).query(`
        UPDATE dbo.competency_rank_group
        SET active_status = @active_status
        WHERE rank_group_id = @rank_group_id;

        IF @active_status = 0
        BEGIN
          UPDATE dbo.competency_rank_group_map
          SET active_status = 0
          WHERE rank_group_id = @rank_group_id;
        END
      `);

    revalidatePath("/admin/rank-groups");
  }

  async function toggleRankGroupMapStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const rankGroupMapId = Number(formData.get("rank_group_map_id"));
    const activeStatus = Number(formData.get("active_status"));

    const pool = await getDbPool();

    await pool
      .request()
      .input("rank_group_map_id", sql.Int, rankGroupMapId)
      .input("active_status", sql.Bit, activeStatus === 1).query(`
        UPDATE dbo.competency_rank_group_map
        SET active_status = @active_status
        WHERE rank_group_map_id = @rank_group_map_id;
      `);

    revalidatePath("/admin/rank-groups");
  }

  const [rankGroups, rankGroupMaps, pyrextRanks] = await Promise.all([
    getRankGroups(),
    getRankGroupMaps(),
    getPyrextRanks(),
  ]);

  const activeRankGroups = rankGroups.filter((group) =>
    Boolean(group.active_status),
  );

  const rankOptions = pyrextRanks.map((rank) => ({
    value: rank.rank_code,
    label: `${rank.rank_name} [ ${rank.rank_code} ]`,
  }));

  const rankGroupOptions = activeRankGroups.map((group) => ({
    value: String(group.rank_group_id),
    label: group.rank_group_name,
  }));

  return (
    <div>
      <PageHeader
        title="กลุ่มระดับการถูกประเมิน"
        description="จัดการกลุ่มระดับการถูกประเมิน"
      />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            เพิ่มกลุ่มระดับ
          </h2>

          <form
            action={createRankGroup}
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ชื่อกลุ่มระดับ
              </label>
              <input
                name="rank_group_name"
                required
                placeholder="เช่น กลุ่มปฏิบัติการ"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ลำดับ
              </label>
              <input
                name="sort_order"
                type="number"
                defaultValue={0}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div className="flex justify-end md:col-span-3">
              <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
              >
                บันทึกกลุ่มระดับ
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            Map ระดับการถูกประเมิน
          </h2>

          <form
            action={saveRankGroupMap}
            className="grid grid-cols-1 gap-4 md:grid-cols-4"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                ระดับ
              </label>
              <SearchableSelect
                name="rank_code"
                required
                placeholder="เลือกระดับ"
                options={rankOptions}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                กลุ่มระดับ
              </label>
              <SearchableSelect
                name="rank_group_id"
                required
                placeholder="เลือกกลุ่มระดับ"
                options={rankGroupOptions}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Competency (%)
              </label>
              <input
                name="competency_percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={30}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div className="flex items-end">
              <button className="h-11 w-full rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
                บันทึก Map
              </button>
            </div>
          </form>
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            ถ้า ระดับ เดิมมี map อยู่แล้ว ระบบจะ update กลุ่มระดับและ Competency (%) ให้ใหม่
            ไม่สร้างข้อมูลซ้ำ
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการ Map ระดับการถูกประเมิน
          </h2>
        </div>

        <DataTable
          headers={["ระดับ", "กลุ่มระดับ", "Competency (%)", "สถานะ", "จัดการ"]}
          emptyText="ยังไม่มีข้อมูล map RANK"
        >
          {rankGroupMaps.map((map) => (
            <tr
              key={map.rank_group_map_id}
              data-search={`${map.rank_code} ${map.rank_group_name ?? ""} ${
                map.active_status ? "ใช้งาน" : "ปิดใช้งาน"
              } ${map.competency_percent}`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {map.rank_name} [ {map.rank_code} ]
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {map.rank_group_name ?? "-"}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <form
                  action={updateRankGroupMapCompetencyPercent}
                  className="flex items-center gap-2"
                >
                  <input
                    type="hidden"
                    name="rank_group_map_id"
                    value={map.rank_group_map_id}
                  />
                  <input
                    name="competency_percent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={Number(
                      map.competency_percent || 30,
                    ).toFixed(2)}
                    className="h-9 w-24 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                  <button
                    type="submit"
                    className="h-9 rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 text-xs font-medium text-white hover:bg-[#18a689]"
                  >
                    บันทึก %
                  </button>
                </form>
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <ActiveStatusBadge active={Boolean(map.active_status)} />
              </td>

              <td className="px-5 py-4 text-sm">
                <form action={toggleRankGroupMapStatus}>
                  <input
                    type="hidden"
                    name="rank_group_map_id"
                    value={map.rank_group_map_id}
                  />
                  <input
                    type="hidden"
                    name="active_status"
                    value={map.active_status ? 0 : 1}
                  />

                  <button
                    className={
                      map.active_status
                        ? redActionButtonClass
                        : greenActionButtonClass
                    }
                  >
                    {map.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการกลุ่มระดับ
          </h2>
        </div>

        <DataTable
          headers={["ชื่อกลุ่มระดับ", "ลำดับ", "สถานะ", "จัดการ"]}
          emptyText="ยังไม่มีข้อมูลกลุ่มระดับ"
        >
          {rankGroups.map((group) => (
            <tr
              key={group.rank_group_id}
              data-search={`${group.rank_group_name} ${group.sort_order} ${
                group.active_status ? "ใช้งาน" : "ปิดใช้งาน"
              }`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {group.rank_group_name}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {group.sort_order}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <ActiveStatusBadge active={Boolean(group.active_status)} />
              </td>

              <td className="px-5 py-4 text-sm">
                <form action={toggleRankGroupStatus}>
                  <input
                    type="hidden"
                    name="rank_group_id"
                    value={group.rank_group_id}
                  />
                  <input
                    type="hidden"
                    name="active_status"
                    value={group.active_status ? 0 : 1}
                  />

                  <button
                    className={
                      group.active_status
                        ? redActionButtonClass
                        : greenActionButtonClass
                    }
                  >
                    {group.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
