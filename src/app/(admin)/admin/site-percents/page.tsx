import SitePercentFormTable, {
  type SitePercentItem,
  type StaffTypeOption,
} from "@/components/competency/SitePercentFormTable";
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

const PAGE_PATH = "/admin/site-percents";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

async function getStaffTypes() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(p.SITECODE)) AS site_code,
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(NULLIF(LTRIM(RTRIM(s.THainame)), ''), s.ENGLISHNAME)
      ) AS staff_type_name
    FROM ${ssbDb()}.dbo.PYREXT p
    JOIN ${ssbDb()}.dbo.SYSCONFIG s
      ON s.CODE = p.SITECODE
     AND s.CTRLCODE = '60048'
    WHERE p.TERMINATEDATE IS NULL
      AND NULLIF(LTRIM(RTRIM(p.SITECODE)), '') IS NOT NULL
    GROUP BY
      LTRIM(RTRIM(p.SITECODE)),
      s.THainame,
      s.ENGLISHNAME
    ORDER BY
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(NULLIF(LTRIM(RTRIM(s.THainame)), ''), s.ENGLISHNAME)
      ),
      LTRIM(RTRIM(p.SITECODE));
  `);

  return result.recordset.map((row) => ({
    site_code: String(row.site_code || "").trim(),
    staff_type_name: String(
      row.staff_type_name || row.site_code || "",
    ).trim(),
  })) as StaffTypeOption[];
}

async function getSitePercents() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      p.site_percent_id,
      p.site_code,
      ISNULL(
        ${ssbDb()}.dbo.GetSSBName(
          ISNULL(NULLIF(LTRIM(RTRIM(s.THainame)), ''), s.ENGLISHNAME)
        ),
        p.site_code
      ) AS staff_type_name,
      p.competency_percent,
      p.active_status
    FROM dbo.competency_site_percent p
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG s
      ON s.CODE = p.site_code
     AND s.CTRLCODE = '60048'
    ORDER BY
      p.active_status DESC,
      staff_type_name,
      p.site_code;
  `);

  return result.recordset.map((row) => ({
    site_percent_id: Number(row.site_percent_id),
    site_code: String(row.site_code || "").trim(),
    staff_type_name: String(
      row.staff_type_name || row.site_code || "-",
    ).trim(),
    competency_percent: Number(row.competency_percent),
    active_status: Boolean(row.active_status),
  })) as SitePercentItem[];
}

function parsePercent(formData: FormData) {
  const percentText = String(formData.get("competency_percent") || "").trim();
  const competencyPercent = Number(percentText);

  if (
    percentText === "" ||
    !Number.isFinite(competencyPercent) ||
    competencyPercent < 0 ||
    competencyPercent > 100
  ) {
    throw new Error("กรุณาระบุเปอร์เซ็นต์ตั้งแต่ 0 ถึง 100");
  }

  return Number(competencyPercent.toFixed(2));
}

export default async function SitePercentsPage() {
  await requireAdminSession();

  async function createSitePercent(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const siteCode = String(formData.get("site_code") || "").trim();
    const competencyPercent = parsePercent(formData);

    if (!siteCode) {
      throw new Error("กรุณาเลือกประเภทบุคลากร");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("site_code", sql.VarChar(20), siteCode)
      .input("competency_percent", sql.Decimal(5, 2), competencyPercent)
      .input("created_by", sql.VarChar(20), session.emp_id).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM ${ssbDb()}.dbo.PYREXT
          WHERE SITECODE = @site_code
            AND TERMINATEDATE IS NULL
        )
        BEGIN
          THROW 50060, N'ไม่พบประเภทบุคลากรที่เลือก', 1;
        END;

        IF EXISTS (
          SELECT 1
          FROM dbo.competency_site_percent
          WHERE site_code = @site_code
        )
        BEGIN
          THROW 50061, N'ประเภทบุคลากรนี้ถูกกำหนดไว้แล้ว', 1;
        END;

        INSERT INTO dbo.competency_site_percent
          (
            site_code,
            competency_percent,
            active_status,
            created_date,
            created_by
          )
        VALUES
          (
            @site_code,
            @competency_percent,
            1,
            SYSDATETIME(),
            @created_by
          );
      `);

    revalidatePath(PAGE_PATH);
  }

  async function updateSitePercent(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const sitePercentId = Number(formData.get("site_percent_id"));
    const competencyPercent = parsePercent(formData);

    if (!sitePercentId) {
      throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("site_percent_id", sql.Int, sitePercentId)
      .input("competency_percent", sql.Decimal(5, 2), competencyPercent)
      .input("updated_by", sql.VarChar(20), session.emp_id).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_site_percent
          WHERE site_percent_id = @site_percent_id
        )
        BEGIN
          THROW 50062, N'ไม่พบรายการที่ต้องการแก้ไข', 1;
        END;

        UPDATE dbo.competency_site_percent
        SET competency_percent = @competency_percent,
            updated_date = SYSDATETIME(),
            updated_by = @updated_by
        WHERE site_percent_id = @site_percent_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  async function toggleSitePercentStatus(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const sitePercentId = Number(formData.get("site_percent_id"));
    const activeStatus = Number(formData.get("active_status")) === 1;

    if (!sitePercentId) {
      throw new Error("ไม่พบรายการที่ต้องการเปลี่ยนสถานะ");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("site_percent_id", sql.Int, sitePercentId)
      .input("active_status", sql.Bit, activeStatus)
      .input("updated_by", sql.VarChar(20), session.emp_id).query(`
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.competency_site_percent
          WHERE site_percent_id = @site_percent_id
        )
        BEGIN
          THROW 50063, N'ไม่พบรายการที่ต้องการเปลี่ยนสถานะ', 1;
        END;

        IF @active_status = 1
           AND NOT EXISTS (
             SELECT 1
             FROM dbo.competency_site_percent p
             JOIN ${ssbDb()}.dbo.PYREXT e
               ON e.SITECODE = p.site_code
              AND e.TERMINATEDATE IS NULL
             WHERE p.site_percent_id = @site_percent_id
           )
        BEGIN
          THROW 50064,
                N'ไม่สามารถเปิดใช้งานได้ เนื่องจากไม่พบประเภทบุคลากรนี้',
                1;
        END;

        UPDATE dbo.competency_site_percent
        SET active_status = @active_status,
            updated_date = SYSDATETIME(),
            updated_by = @updated_by
        WHERE site_percent_id = @site_percent_id;
      `);

    revalidatePath(PAGE_PATH);
  }

  const [staffTypes, sitePercents] = await Promise.all([
    getStaffTypes(),
    getSitePercents(),
  ]);

  return (
    <div>
      <PageHeader
        title="เปอร์เซ็นต์ Competency"
        description="กำหนดสัดส่วนคะแนนสมรรถนะสำหรับบุคลากรแต่ละประเภท"
      />

      <SitePercentFormTable
        staffTypes={staffTypes}
        sitePercents={sitePercents}
        createAction={createSitePercent}
        updateAction={updateSitePercent}
        toggleAction={toggleSitePercentStatus}
      />
    </div>
  );
}