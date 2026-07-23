import KpiEmployeeFormAssignment, {
  type KpiAssignableFormOption,
  type KpiEmployeeFormActionState,
  type KpiEmployeeOption,
  type KpiRoundOption,
  type KpiSectionOption,
} from "@/components/competency/KpiEmployeeFormAssignment";
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

const PAGE_PATH = "/admin/kpi-employee-forms";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function actionResult(
  ok: boolean,
  type: KpiEmployeeFormActionState["type"],
  message: string,
): KpiEmployeeFormActionState {
  return {
    ok,
    type,
    message,
    result_id: Date.now(),
  };
}

function adminErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message.replace(/^RequestError:\s*/i, "").trim()
      : "";

  if (!rawMessage) {
    return "ไม่สามารถกำหนดแบบฟอร์มได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
  }

  if (/[ก-๙]/.test(rawMessage)) {
    return rawMessage;
  }

  if (
    rawMessage.includes("duplicate key") ||
    rawMessage.includes("UNIQUE")
  ) {
    return "มีบุคลากรบางคนได้รับแบบฟอร์มอยู่แล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  }

  return "ไม่สามารถกำหนดแบบฟอร์มได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
}

async function getRounds() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      round_id,
      round_code
    FROM dbo.competency_round
    WHERE status_type = 0
    ORDER BY
      round_year DESC,
      round_no DESC,
      round_id DESC;
  `);

  return result.recordset.map((row) => ({
    round_id: Number(row.round_id),
    round_code: String(row.round_code || "").trim(),
  })) as KpiRoundOption[];
}

async function getSections() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT DISTINCT
      re.round_id,
      LTRIM(RTRIM(CAST(re.section_code AS varchar(20))))
        AS section_code,
      ISNULL(
        NULLIF(LTRIM(RTRIM(sc.ThaiName)), N''),
        LTRIM(RTRIM(CAST(re.section_code AS varchar(20))))
      ) AS section_name,
      NULLIF(
        LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))),
        ''
      ) AS division_code
    FROM dbo.competency_round_employee re
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
     AND r.status_type = 0
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON LTRIM(RTRIM(CAST(sc.Code AS varchar(20))))
       = LTRIM(RTRIM(CAST(re.section_code AS varchar(20))))
    WHERE re.status_type <> 9
      AND LEN(
            LTRIM(
              RTRIM(
                CAST(re.section_code AS varchar(20))
              )
            )
          ) = 5
      AND NOT EXISTS
      (
        SELECT 1
        FROM dbo.competency_excluded_section x
        WHERE x.active_status = 1
          AND LTRIM(
                RTRIM(
                  CAST(x.section_code AS varchar(20))
                )
              )
              =
              LTRIM(
                RTRIM(
                  CAST(re.section_code AS varchar(20))
                )
              )
      )
    ORDER BY
      re.round_id,
      section_name,
      section_code;
  `);

  const sectionMap = new Map<
    string,
    KpiSectionOption
  >();

  for (const row of result.recordset) {
    const roundId = Number(row.round_id);
    const sectionCode = String(
      row.section_code || "",
    ).trim();
    const key = `${roundId}:${sectionCode}`;

    const current =
      sectionMap.get(key) ||
      {
        round_id: roundId,
        section_code: sectionCode,
        section_name: String(
          row.section_name || sectionCode,
        ).trim(),
        division_codes: [],
      };

    const divisionCode = String(
      row.division_code || "",
    ).trim();

    if (
      divisionCode &&
      !current.division_codes.includes(divisionCode)
    ) {
      current.division_codes.push(divisionCode);
    }

    sectionMap.set(key, current);
  }

  return Array.from(sectionMap.values());
}

async function getEmployees() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      re.round_employee_id,
      re.round_id,
      LTRIM(RTRIM(CAST(re.payroll_no AS varchar(20))))
        AS payroll_no,
      ${ssbDb()}.dbo.GetUserFullName(re.payroll_no)
        AS employee_full_name,
      NULLIF(
        LTRIM(RTRIM(CAST(re.division_code AS varchar(20)))),
        ''
      ) AS division_code,
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(ds.thainame, ds.englishname)
      ) AS division_name,
      LTRIM(RTRIM(CAST(re.section_code AS varchar(20))))
        AS section_code,
      ISNULL(
        NULLIF(LTRIM(RTRIM(sc.ThaiName)), N''),
        LTRIM(RTRIM(CAST(re.section_code AS varchar(20))))
      ) AS section_name,
      current_form.form_version_id
        AS current_form_version_id,
      current_form.form_code
        AS current_form_code,
      current_form.form_name
        AS current_form_name,
      CASE
        WHEN current_form.has_evaluation = 1
          THEN 1
        ELSE 0
      END AS evaluation_started
    FROM dbo.competency_round_employee re
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
     AND r.status_type = 0
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = re.division_code
     AND ds.CTRLCODE = '10028'
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON LTRIM(RTRIM(CAST(sc.Code AS varchar(20))))
       = LTRIM(RTRIM(CAST(re.section_code AS varchar(20))))
    OUTER APPLY
    (
      SELECT TOP (1)
        ef.form_version_id,
        f.form_code,
        f.form_name,
        CASE
          WHEN EXISTS
          (
            SELECT 1
            FROM dbo.kpi_evaluation ev
            WHERE ev.employee_form_id =
                  ef.employee_form_id
              AND ev.status_type <> 9
          )
          THEN 1
          ELSE 0
        END AS has_evaluation
      FROM dbo.kpi_employee_form ef
      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id =
           ef.form_version_id
      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id
      WHERE ef.round_employee_id =
            re.round_employee_id
        AND ef.status_type = 0
      ORDER BY ef.employee_form_id DESC
    ) current_form
    WHERE re.status_type <> 9
      AND LEN(
            LTRIM(
              RTRIM(
                CAST(re.section_code AS varchar(20))
              )
            )
          ) = 5
      AND NOT EXISTS
      (
        SELECT 1
        FROM dbo.competency_excluded_section x
        WHERE x.active_status = 1
          AND LTRIM(
                RTRIM(
                  CAST(x.section_code AS varchar(20))
                )
              )
              =
              LTRIM(
                RTRIM(
                  CAST(re.section_code AS varchar(20))
                )
              )
      )
    ORDER BY
      re.round_id,
      re.section_code,
      ${ssbDb()}.dbo.GetUserFullName(re.payroll_no);
  `);

  return result.recordset.map((row) => ({
    round_employee_id: Number(
      row.round_employee_id,
    ),
    round_id: Number(row.round_id),
    payroll_no: String(
      row.payroll_no || "",
    ).trim(),
    employee_full_name: String(
      row.employee_full_name ||
        row.payroll_no ||
        "",
    ).trim(),
    division_code: String(
      row.division_code || "",
    ).trim(),
    division_name: String(
      row.division_name ||
        row.division_code ||
        "",
    ).trim(),
    section_code: String(
      row.section_code || "",
    ).trim(),
    section_name: String(
      row.section_name ||
        row.section_code ||
        "",
    ).trim(),
    current_form_code: String(
      row.current_form_code || "",
    ).trim(),
    current_form_name: String(
      row.current_form_name || "",
    ).trim(),
    current_form_version_id: Number(
      row.current_form_version_id || 0,
    ),
    evaluation_started: Boolean(
      row.evaluation_started,
    ),
  })) as KpiEmployeeOption[];
}

async function getForms() {
  const pool = await getDbPool();

  const [
    formResult,
    scopeResult,
    itemResult,
  ] = await Promise.all([
    pool.request().query(`
      WITH active_version AS
      (
        SELECT
          fv.*,
          ROW_NUMBER() OVER
          (
            PARTITION BY fv.form_id
            ORDER BY
              fv.version_no DESC,
              fv.form_version_id DESC
          ) AS row_no
        FROM dbo.kpi_form_version fv
        WHERE fv.status_type = 1
      )
      SELECT
        f.form_id,
        av.form_version_id,
        f.form_code,
        f.form_name,
        av.version_no,
        av.scope_type,
        av.total_weight_percent
      FROM dbo.kpi_form f
      JOIN active_version av
        ON av.form_id = f.form_id
       AND av.row_no = 1
      WHERE f.active_status = 1
      ORDER BY
        f.form_code,
        f.form_name;
    `),
    pool.request().query(`
      SELECT
        fs.form_version_id,
        LTRIM(RTRIM(fs.division_code))
          AS division_code
      FROM dbo.kpi_form_scope fs
      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id =
           fs.form_version_id
       AND fv.status_type = 1
      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id
       AND f.active_status = 1
      ORDER BY
        fs.form_version_id,
        fs.division_code;
    `),
    pool.request().query(`
      SELECT
        fi.form_version_id,
        COUNT(*) AS item_count
      FROM dbo.kpi_form_item fi
      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id =
           fi.form_version_id
       AND fv.status_type = 1
      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id
       AND f.active_status = 1
      GROUP BY fi.form_version_id;
    `),
  ]);

  const scopeMap = new Map<number, string[]>();
  const itemCountMap = new Map<number, number>();

  for (const row of scopeResult.recordset) {
    const formVersionId = Number(
      row.form_version_id,
    );
    const current =
      scopeMap.get(formVersionId) || [];

    current.push(String(row.division_code || "").trim());
    scopeMap.set(formVersionId, current);
  }

  for (const row of itemResult.recordset) {
    itemCountMap.set(
      Number(row.form_version_id),
      Number(row.item_count || 0),
    );
  }

  return formResult.recordset.map((row) => {
    const formVersionId = Number(
      row.form_version_id,
    );

    return {
      form_id: Number(row.form_id),
      form_version_id: formVersionId,
      form_code: String(
        row.form_code || "",
      ).trim(),
      form_name: String(
        row.form_name || "",
      ).trim(),
      version_no: Number(row.version_no),
      scope_type: Number(row.scope_type),
      division_codes:
        scopeMap.get(formVersionId) || [],
      item_count:
        itemCountMap.get(formVersionId) || 0,
      total_weight_percent: Number(
        row.total_weight_percent || 0,
      ),
    };
  }) as KpiAssignableFormOption[];
}

export default async function KpiEmployeeFormsPage() {
  await requireAdminSession();

  async function assignForm(
    _previousState: KpiEmployeeFormActionState,
    formData: FormData,
  ): Promise<KpiEmployeeFormActionState> {
    "use server";

    try {
      const session = await requireAdminSession();

      const roundId = Number(
        formData.get("round_id") || 0,
      );
      const sectionCode = String(
        formData.get("section_code") || "",
      ).trim();
      const formVersionId = Number(
        formData.get("form_version_id") || 0,
      );
      const roundEmployeeIds = Array.from(
        new Set(
          formData
            .getAll("round_employee_id")
            .map((value) => Number(value))
            .filter(
              (value) =>
                Number.isSafeInteger(value) &&
                value > 0,
            ),
        ),
      );

      if (!roundId) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกรอบประเมิน",
        );
      }

      if (
        sectionCode.length !== 5
      ) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกหน่วยเบิก 5 หลัก",
        );
      }

      if (!formVersionId) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกแบบฟอร์ม KPI",
        );
      }

      if (roundEmployeeIds.length === 0) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกบุคลากรอย่างน้อย 1 คน",
        );
      }

      const pool = await getDbPool();
      const selectedJson = JSON.stringify(
        roundEmployeeIds,
      );

      const result = await pool
        .request()
        .input("round_id", sql.Int, roundId)
        .input(
          "section_code",
          sql.VarChar(20),
          sectionCode,
        )
        .input(
          "form_version_id",
          sql.BigInt,
          formVersionId,
        )
        .input(
          "selected_json",
          sql.NVarChar(sql.MAX),
          selectedJson,
        )
        .input(
          "assigned_by",
          sql.VarChar(20),
          session.emp_id,
        )
        .query(`
          SET NOCOUNT ON;
          SET XACT_ABORT ON;

          BEGIN TRY
            BEGIN TRANSACTION;

            IF NOT EXISTS
            (
              SELECT 1
              FROM dbo.competency_round
              WHERE round_id = @round_id
                AND status_type = 0
            )
            BEGIN
              THROW 52300,
                    N'รอบประเมินนี้ไม่อยู่ในสถานะที่กำหนดแบบฟอร์มได้',
                    1;
            END;

            IF EXISTS
            (
              SELECT 1
              FROM dbo.competency_excluded_section x
              WHERE x.active_status = 1
                AND LTRIM(
                      RTRIM(
                        CAST(
                          x.section_code AS varchar(20)
                        )
                      )
                    ) = @section_code
            )
            BEGIN
              THROW 52301,
                    N'หน่วยเบิกนี้ถูกกำหนดเป็นหน่วยเบิกที่ไม่ต้องประเมิน',
                    1;
            END;

            IF NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_form_version fv
              JOIN dbo.kpi_form f
                ON f.form_id = fv.form_id
              WHERE fv.form_version_id =
                    @form_version_id
                AND fv.status_type = 1
                AND f.active_status = 1
                AND fv.total_weight_percent = 100
            )
            BEGIN
              THROW 52302,
                    N'แบบฟอร์ม KPI ที่เลือกไม่พร้อมใช้งาน',
                    1;
            END;

            DECLARE @selected TABLE
            (
              round_employee_id int NOT NULL
                PRIMARY KEY
            );

            INSERT INTO @selected(round_employee_id)
            SELECT DISTINCT
              TRY_CONVERT(int, [value])
            FROM OPENJSON(@selected_json)
            WHERE TRY_CONVERT(int, [value]) IS NOT NULL;

            IF NOT EXISTS (SELECT 1 FROM @selected)
            BEGIN
              THROW 52303,
                    N'ไม่พบรายชื่อบุคลากรที่เลือก',
                    1;
            END;

            IF EXISTS
            (
              SELECT 1
              FROM @selected s
              LEFT JOIN dbo.competency_round_employee re
                ON re.round_employee_id =
                   s.round_employee_id
               AND re.round_id = @round_id
               AND re.status_type <> 9
               AND LTRIM(
                     RTRIM(
                       CAST(
                         re.section_code AS varchar(20)
                       )
                     )
                   ) = @section_code
              WHERE re.round_employee_id IS NULL
            )
            BEGIN
              THROW 52304,
                    N'มีบุคลากรบางคนไม่อยู่ในรอบหรือหน่วยเบิกที่เลือก',
                    1;
            END;

            IF EXISTS
            (
              SELECT 1
              FROM @selected s
              JOIN dbo.competency_round_employee re
                ON re.round_employee_id =
                   s.round_employee_id
              JOIN dbo.kpi_form_version fv
                ON fv.form_version_id =
                   @form_version_id
              WHERE fv.scope_type = 2
                AND NOT EXISTS
                (
                  SELECT 1
                  FROM dbo.kpi_form_scope fs
                  WHERE fs.form_version_id =
                        fv.form_version_id
                    AND LTRIM(
                          RTRIM(fs.division_code)
                        )
                        =
                        LTRIM(
                          RTRIM(
                            CAST(
                              re.division_code AS varchar(20)
                            )
                          )
                        )
                )
            )
            BEGIN
              THROW 52305,
                    N'แบบฟอร์มที่เลือกไม่ครอบคลุมกลุ่มงานของบุคลากรทั้งหมด',
                    1;
            END;

            DECLARE @same_count int = 0;
            DECLARE @blocked_count int = 0;
            DECLARE @changed_count int = 0;
            DECLARE @new_count int = 0;

            SELECT
              @same_count = COUNT(*)
            FROM @selected s
            JOIN dbo.kpi_employee_form ef
              ON ef.round_employee_id =
                 s.round_employee_id
             AND ef.status_type = 0
             AND ef.form_version_id =
                 @form_version_id;

            SELECT
              @blocked_count = COUNT(*)
            FROM @selected s
            JOIN dbo.kpi_employee_form ef
              ON ef.round_employee_id =
                 s.round_employee_id
             AND ef.status_type = 0
             AND ef.form_version_id <>
                 @form_version_id
            WHERE EXISTS
            (
              SELECT 1
              FROM dbo.kpi_evaluation ev
              WHERE ev.employee_form_id =
                    ef.employee_form_id
                AND ev.status_type <> 9
            );

            SELECT
              @changed_count = COUNT(*)
            FROM @selected s
            JOIN dbo.kpi_employee_form ef
              ON ef.round_employee_id =
                 s.round_employee_id
             AND ef.status_type = 0
             AND ef.form_version_id <>
                 @form_version_id
            WHERE NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_evaluation ev
              WHERE ev.employee_form_id =
                    ef.employee_form_id
                AND ev.status_type <> 9
            );

            SELECT
              @new_count = COUNT(*)
            FROM @selected s
            WHERE NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_employee_form ef
              WHERE ef.round_employee_id =
                    s.round_employee_id
                AND ef.status_type = 0
            );

            UPDATE ef
            SET status_type = 9,
                cancelled_date = SYSDATETIME(),
                cancelled_by = @assigned_by
            FROM dbo.kpi_employee_form ef
            JOIN @selected s
              ON s.round_employee_id =
                 ef.round_employee_id
            WHERE ef.status_type = 0
              AND ef.form_version_id <>
                  @form_version_id
              AND NOT EXISTS
              (
                SELECT 1
                FROM dbo.kpi_evaluation ev
                WHERE ev.employee_form_id =
                      ef.employee_form_id
                  AND ev.status_type <> 9
              );

            INSERT INTO dbo.kpi_employee_form
            (
              round_employee_id,
              form_version_id,
              division_code,
              section_code,
              status_type,
              assigned_date,
              assigned_by
            )
            SELECT
              re.round_employee_id,
              @form_version_id,
              NULLIF(
                LTRIM(
                  RTRIM(
                    CAST(
                      re.division_code AS varchar(20)
                    )
                  )
                ),
                ''
              ),
              NULLIF(
                LTRIM(
                  RTRIM(
                    CAST(
                      re.section_code AS varchar(20)
                    )
                  )
                ),
                ''
              ),
              0,
              SYSDATETIME(),
              @assigned_by
            FROM @selected s
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id =
                 s.round_employee_id
            WHERE NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_employee_form ef
              WHERE ef.round_employee_id =
                    re.round_employee_id
                AND ef.status_type = 0
            );

            COMMIT TRANSACTION;

            SELECT
              @new_count AS new_count,
              @changed_count AS changed_count,
              @same_count AS same_count,
              @blocked_count AS blocked_count;
          END TRY
          BEGIN CATCH
            IF @@TRANCOUNT > 0
              ROLLBACK TRANSACTION;

            THROW;
          END CATCH;
        `);

      const row = result.recordset[0] || {};
      const newCount = Number(row.new_count || 0);
      const changedCount = Number(
        row.changed_count || 0,
      );
      const sameCount = Number(row.same_count || 0);
      const blockedCount = Number(
        row.blocked_count || 0,
      );

      revalidatePath(PAGE_PATH);

      const messageParts = [
        `กำหนดแบบฟอร์มใหม่ ${newCount.toLocaleString()} คน`,
        `เปลี่ยนแบบฟอร์ม ${changedCount.toLocaleString()} คน`,
      ];

      if (sameCount > 0) {
        messageParts.push(
          `ใช้แบบฟอร์มนี้อยู่แล้ว ${sameCount.toLocaleString()} คน`,
        );
      }

      if (blockedCount > 0) {
        messageParts.push(
          `ข้าม ${blockedCount.toLocaleString()} คน เนื่องจากเริ่มประเมินแล้ว`,
        );
      }

      return actionResult(
        true,
        blockedCount > 0 ? "warning" : "success",
        messageParts.join(" • "),
      );
    } catch (error) {
      console.error(
        "assign KPI employee form error:",
        error,
      );

      return actionResult(
        false,
        "error",
        adminErrorMessage(error),
      );
    }
  }

  const [rounds, sections, employees, forms] =
    await Promise.all([
      getRounds(),
      getSections(),
      getEmployees(),
      getForms(),
    ]);

  return (
    <div>
      <PageHeader
        title="กำหนดแบบฟอร์ม KPI"
        description="เลือกหน่วยเบิก 5 หลักและกำหนดแบบฟอร์ม KPI ให้บุคลากรหลายคนพร้อมกัน"
      />

      <KpiEmployeeFormAssignment
        rounds={rounds}
        sections={sections}
        employees={employees}
        forms={forms}
        assignAction={assignForm}
      />
    </div>
  );
}