import ActionAlert from "@/components/competency/ActionAlert";
import PageHeader from "@/components/competency/PageHeader";
import SearchableSelect from "@/components/competency/SearchableSelect";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SectionOptionRow = {
  section_code: string;
  section_name: string | null;
};

type ExcludedSectionRow = {
  excluded_section_id: number;
  section_code: string;
  section_name: string | null;
  note_text: string | null;
  active_status: number;
  created_date: Date | string | null;
  created_by: string | null;
  updated_date: Date | string | null;
  updated_by: string | null;
};

type SectionExclusionsPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
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

  redirect(`/admin/section-exclusions?${params.toString()}`);
}

function formatThaiDateTime(value: Date | string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function getSectionOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT DISTINCT
      LTRIM(RTRIM(CAST(sc.Code AS varchar(20)))) AS section_code,
      ${ssbDb()}.dbo.GetSSBName(sc.ThaiName) AS section_name
    FROM ${ssbDb()}.dbo.sectioncode sc
    WHERE sc.Code IS NOT NULL
      AND LTRIM(RTRIM(CAST(sc.Code AS varchar(20)))) <> ''
      AND LTRIM(RTRIM(CAST(sc.Code AS varchar(20)))) IN (
        SELECT DISTINCT LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20))))
        FROM ${ssbDb()}.dbo.PYREXT p
        WHERE p.TERMINATEDATE IS NULL
          AND p.[SECTION] IS NOT NULL
          AND LTRIM(RTRIM(CAST(p.[SECTION] AS varchar(20)))) <> ''
      )
    ORDER BY section_name, section_code;
  `);

  return result.recordset as SectionOptionRow[];
}

async function getExcludedSections() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      x.excluded_section_id,
      x.section_code,
      ${ssbDb()}.dbo.GetSSBName(sc.ThaiName) AS section_name,
      x.note_text,
      x.active_status,
      x.created_date,
      x.created_by,
      x.updated_date,
      x.updated_by
    FROM dbo.competency_excluded_section x
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON LTRIM(RTRIM(CAST(sc.Code AS varchar(20)))) = LTRIM(RTRIM(CAST(x.section_code AS varchar(20))))
    ORDER BY x.active_status DESC, section_name, x.section_code;
  `);

  return result.recordset as ExcludedSectionRow[];
}

async function saveExcludedSection(formData: FormData) {
  "use server";

  const session = await requireAdminSession();

  const sectionCode = String(formData.get("section_code") || "").trim();
  const noteText = String(formData.get("note_text") || "").trim().slice(0, 500);

  if (!sectionCode) {
    redirectWithAlert("error", "กรุณาเลือกหน่วยเบิกที่ไม่ต้องนำไปประเมิน");
  }

  const pool = await getDbPool();

  await pool
    .request()
    .input("section_code", sql.VarChar(20), sectionCode)
    .input("note_text", sql.NVarChar(500), noteText || null)
    .input("updated_by", sql.VarChar(20), session.emp_id)
    .input("created_by", sql.VarChar(20), session.emp_id)
    .query(`
      IF EXISTS (
        SELECT 1
        FROM dbo.competency_excluded_section
        WHERE LTRIM(RTRIM(CAST(section_code AS varchar(20)))) = @section_code
      )
      BEGIN
        UPDATE dbo.competency_excluded_section
        SET active_status = 1,
            note_text = @note_text,
            updated_date = SYSDATETIME(),
            updated_by = @updated_by
        WHERE LTRIM(RTRIM(CAST(section_code AS varchar(20)))) = @section_code;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.competency_excluded_section
          (section_code, note_text, active_status, created_date, created_by)
        VALUES
          (@section_code, @note_text, 1, SYSDATETIME(), @created_by);
      END;
    `);

  revalidatePath("/admin/section-exclusions");
  revalidatePath("/admin/round-employees");
  redirectWithAlert("success", "บันทึกหน่วยเบิกที่ไม่ต้องประเมินเรียบร้อยแล้ว");
}

async function toggleExcludedSection(formData: FormData) {
  "use server";

  const session = await requireAdminSession();

  const excludedSectionId = Number(formData.get("excluded_section_id") || 0);
  const nextStatus = Number(formData.get("next_status") || 0) === 1 ? 1 : 0;

  if (!excludedSectionId) {
    redirectWithAlert("error", "ข้อมูลหน่วยเบิกไม่ถูกต้อง");
  }

  const pool = await getDbPool();

  await pool
    .request()
    .input("excluded_section_id", sql.Int, excludedSectionId)
    .input("active_status", sql.Int, nextStatus)
    .input("updated_by", sql.VarChar(20), session.emp_id)
    .query(`
      UPDATE dbo.competency_excluded_section
      SET active_status = @active_status,
          updated_date = SYSDATETIME(),
          updated_by = @updated_by
      WHERE excluded_section_id = @excluded_section_id;
    `);

  revalidatePath("/admin/section-exclusions");
  revalidatePath("/admin/round-employees");
  redirectWithAlert(
    "success",
    nextStatus === 1
      ? "เปิดใช้งานหน่วยเบิกที่ไม่ต้องประเมินเรียบร้อยแล้ว"
      : "ยกเลิกหน่วยเบิกที่ไม่ต้องประเมินเรียบร้อยแล้ว",
  );
}

export default async function SectionExclusionsPage({
  searchParams,
}: SectionExclusionsPageProps) {
  await requireAdminSession();

  const alertParams = await searchParams;
  const [sectionOptionsRows, excludedSections] = await Promise.all([
    getSectionOptions(),
    getExcludedSections(),
  ]);

  const sectionOptions = sectionOptionsRows.map((section) => ({
    value: section.section_code,
    label: `${section.section_name || section.section_code} (${section.section_code})`,
  }));

  const activeCount = excludedSections.filter(
    (row) => Number(row.active_status) === 1,
  ).length;

  return (
    <div>
      <ActionAlert
        type={alertParams?.alert_type}
        message={alertParams?.alert_message}
      />

      <PageHeader
        title="หน่วยเบิกที่ไม่ต้องประเมิน"
        description="กำหนดรหัสหน่วยเบิก/section ที่ไม่ต้องนำเข้าเป็นผู้ถูกประเมินในระบบ Competency"
      />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            เพิ่มหน่วยเบิกที่ไม่ต้องประเมิน
          </h2>

          <form
            action={saveExcludedSection}
            className="grid grid-cols-1 gap-4 md:grid-cols-12"
          >
            <div className="md:col-span-5">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                หน่วยเบิก
              </label>
              <SearchableSelect
                name="section_code"
                required
                placeholder="เลือกหน่วยเบิก"
                options={sectionOptions}
              />
            </div>

            <div className="md:col-span-7">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                หมายเหตุ
              </label>
              <input
                name="note_text"
                maxLength={500}
                placeholder="เช่น ไม่อยู่ในกลุ่มที่ต้องประเมิน Competency"
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <div className="flex justify-end md:col-span-12">
              <button
                type="submit"
                className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
              >
                บันทึกหน่วยเบิก
              </button>
            </div>
          </form>

          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            รายการที่เปิดใช้งานจะถูกตัดออกจากการเพิ่มผู้ถูกประเมินรายคน การนำเข้าตามกลุ่มภารกิจ และการนำเข้าทั้งโรงพยาบาล
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            หน่วยเบิกที่ไม่ต้องประเมินที่ใช้งานอยู่
          </div>
          <div className="mt-3 text-3xl font-semibold text-gray-900 dark:text-white">
            {activeCount.toLocaleString("th-TH")}
          </div>
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
            การตั้งค่านี้มีผลกับการนำเข้าครั้งถัดไป ไม่ลบผู้ถูกประเมินที่ถูกเพิ่มเข้ารอบไปแล้วโดยอัตโนมัติ
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการหน่วยเบิกที่ไม่ต้องประเมิน
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  หน่วยเบิก
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  หมายเหตุ
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  สถานะ
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  ปรับปรุงล่าสุด
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {excludedSections.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ยังไม่มีรายการหน่วยเบิกที่ไม่ต้องประเมิน
                  </td>
                </tr>
              ) : (
                excludedSections.map((row) => {
                  const isActive = Number(row.active_status) === 1;
                  return (
                    <tr key={row.excluded_section_id}>
                      <td className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
                        <div className="font-medium">
                          {row.section_name || "ไม่พบชื่อหน่วยเบิก"}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {row.section_code}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {row.note_text || "-"}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            isActive
                              ? "bg-emerald-50 text-[#1ab394] dark:bg-emerald-500/10"
                              : "bg-red-50 text-[#ed5565] dark:bg-red-500/10"
                          }`}
                        >
                          {isActive ? "ใช้งาน" : "ยกเลิก"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <div>{formatThaiDateTime(row.updated_date || row.created_date)}</div>
                        <div className="text-xs text-gray-400">
                          โดย {row.updated_by || row.created_by || "-"}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <form action={toggleExcludedSection}>
                          <input
                            type="hidden"
                            name="excluded_section_id"
                            value={row.excluded_section_id}
                          />
                          <input
                            type="hidden"
                            name="next_status"
                            value={isActive ? 0 : 1}
                          />
                          <button
                            type="submit"
                            className={`h-9 rounded-lg px-4 text-xs font-medium text-white ${
                              isActive
                                ? "bg-[#ed5565] hover:opacity-90"
                                : "bg-[#1ab394] hover:opacity-90"
                            }`}
                          >
                            {isActive ? "ยกเลิก" : "เปิดใช้งาน"}
                          </button>
                        </form>
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
