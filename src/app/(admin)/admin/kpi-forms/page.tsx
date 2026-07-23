import KpiFormTemplateFormTable, {
  type KpiDivisionOption,
  type KpiFormActionState,
  type KpiFormItemOption,
  type KpiFormOption,
  type KpiIndicatorOption,
} from "@/components/competency/KpiFormTemplateFormTable";
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

const PAGE_PATH = "/admin/kpi-forms";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function actionResult(
  ok: boolean,
  type: KpiFormActionState["type"],
  message: string,
  entityId = 0,
  entityCode = "",
): KpiFormActionState {
  return {
    ok,
    type,
    message,
    result_id: Date.now(),
    entity_id: entityId,
    entity_code: entityCode,
  };
}

function adminErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message.replace(/^RequestError:\s*/i, "").trim()
      : "";

  if (!rawMessage) {
    return "ไม่สามารถบันทึกแบบฟอร์มได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
  }

  if (/[ก-๙]/.test(rawMessage)) {
    return rawMessage;
  }

  if (
    rawMessage.includes("duplicate key") ||
    rawMessage.includes("UNIQUE")
  ) {
    return "พบข้อมูลซ้ำในแบบฟอร์ม กรุณาตรวจสอบตัวชี้วัดและหน่วยงานที่เลือก";
  }

  if (
    rawMessage.includes("FOREIGN KEY") ||
    rawMessage.includes("CHECK constraint") ||
    rawMessage.includes("PRIMARY KEY")
  ) {
    return "ไม่สามารถบันทึกแบบฟอร์มได้ เนื่องจากข้อมูลบางรายการไม่ถูกต้องหรือถูกเปลี่ยนแปลงแล้ว";
  }

  return "ไม่สามารถบันทึกแบบฟอร์มได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
}

async function getDivisions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(CAST(s.Code AS varchar(20))))
        AS division_code,
      LTRIM(RTRIM(s.ThaiName))
        AS division_name
    FROM ${ssbDb()}.dbo.sectioncode s
    WHERE s.ThaiName LIKE N'%ใหม่%'
      AND NULLIF(
            LTRIM(RTRIM(CAST(s.Code AS varchar(20)))),
            ''
          ) IS NOT NULL
      AND NULLIF(
            LTRIM(RTRIM(s.ThaiName)),
            N''
          ) IS NOT NULL
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
                  CAST(s.Code AS varchar(20))
                )
              )
      )
    ORDER BY
      LTRIM(RTRIM(s.ThaiName)),
      LTRIM(RTRIM(CAST(s.Code AS varchar(20))));
  `);

  return result.recordset.map((row) => ({
    division_code: String(
      row.division_code || "",
    ).trim(),
    division_name: String(
      row.division_name ||
        row.division_code ||
        "",
    ).trim(),
  })) as KpiDivisionOption[];
}

async function getIndicators() {
  const pool = await getDbPool();

  const [indicatorResult, scopeResult] = await Promise.all([
    pool.request().query(`
      SELECT
        iv.indicator_version_id,
        i.indicator_code,
        iv.indicator_name,
        iv.scope_type
      FROM dbo.kpi_indicator i
      JOIN dbo.kpi_indicator_version iv
        ON iv.indicator_id = i.indicator_id
       AND iv.status_type = 1
      WHERE i.active_status = 1
      ORDER BY
        i.indicator_code,
        iv.indicator_name;
    `),
    pool.request().query(`
      SELECT
        s.indicator_version_id,
        LTRIM(RTRIM(s.division_code))
          AS division_code
      FROM dbo.kpi_indicator_scope s
      JOIN dbo.kpi_indicator_version iv
        ON iv.indicator_version_id =
           s.indicator_version_id
       AND iv.status_type = 1
      JOIN dbo.kpi_indicator i
        ON i.indicator_id = iv.indicator_id
       AND i.active_status = 1
      ORDER BY
        s.indicator_version_id,
        s.division_code;
    `),
  ]);

  const scopeMap = new Map<number, string[]>();

  for (const row of scopeResult.recordset) {
    const indicatorVersionId = Number(
      row.indicator_version_id,
    );
    const current = scopeMap.get(indicatorVersionId) || [];

    current.push(String(row.division_code || "").trim());
    scopeMap.set(indicatorVersionId, current);
  }

  return indicatorResult.recordset.map((row) => {
    const indicatorVersionId = Number(
      row.indicator_version_id,
    );

    return {
      indicator_version_id: indicatorVersionId,
      indicator_code: String(
        row.indicator_code || "",
      ).trim(),
      indicator_name: String(
        row.indicator_name || "",
      ).trim(),
      scope_type: Number(row.scope_type),
      division_codes:
        scopeMap.get(indicatorVersionId) || [],
    };
  }) as KpiIndicatorOption[];
}

async function getForms() {
  const pool = await getDbPool();

  const [
    formResult,
    itemResult,
    scopeResult,
  ] = await Promise.all([
    pool.request().query(`
      WITH latest_version AS
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
      )
      SELECT
        f.form_id,
        lv.form_version_id,
        f.form_code,
        f.form_name,
        lv.version_no,
        lv.scope_type,
        lv.total_weight_percent,
        f.active_status
      FROM dbo.kpi_form f
      JOIN latest_version lv
        ON lv.form_id = f.form_id
       AND lv.row_no = 1
      ORDER BY
        f.active_status DESC,
        f.form_code;
    `),
    pool.request().query(`
      WITH latest_version AS
      (
        SELECT
          fv.form_id,
          fv.form_version_id,
          ROW_NUMBER() OVER
          (
            PARTITION BY fv.form_id
            ORDER BY
              fv.version_no DESC,
              fv.form_version_id DESC
          ) AS row_no
        FROM dbo.kpi_form_version fv
      )
      SELECT
        lv.form_id,
        fi.indicator_version_id,
        i.indicator_code,
        iv.indicator_name,
        fi.weight_percent,
        fi.item_order
      FROM latest_version lv
      JOIN dbo.kpi_form_item fi
        ON fi.form_version_id =
           lv.form_version_id
      JOIN dbo.kpi_indicator_version iv
        ON iv.indicator_version_id =
           fi.indicator_version_id
      JOIN dbo.kpi_indicator i
        ON i.indicator_id = iv.indicator_id
      WHERE lv.row_no = 1
      ORDER BY
        lv.form_id,
        fi.item_order;
    `),
    pool.request().query(`
      WITH latest_version AS
      (
        SELECT
          fv.form_id,
          fv.form_version_id,
          ROW_NUMBER() OVER
          (
            PARTITION BY fv.form_id
            ORDER BY
              fv.version_no DESC,
              fv.form_version_id DESC
          ) AS row_no
        FROM dbo.kpi_form_version fv
      )
      SELECT
        lv.form_id,
        LTRIM(RTRIM(fs.division_code))
          AS division_code,
        ISNULL(
          LTRIM(RTRIM(sc.ThaiName)),
          LTRIM(RTRIM(fs.division_code))
        ) AS division_name
      FROM latest_version lv
      JOIN dbo.kpi_form_scope fs
        ON fs.form_version_id =
           lv.form_version_id
      LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
        ON LTRIM(RTRIM(CAST(sc.Code AS varchar(20))))
         = LTRIM(RTRIM(fs.division_code))
       AND sc.ThaiName LIKE N'%ใหม่%'
      WHERE lv.row_no = 1
      ORDER BY
        lv.form_id,
        division_name,
        fs.division_code;
    `),
  ]);

  const itemMap = new Map<
    number,
    KpiFormItemOption[]
  >();
  const divisionCodeMap = new Map<
    number,
    string[]
  >();
  const divisionNameMap = new Map<
    number,
    string[]
  >();

  for (const row of itemResult.recordset) {
    const formId = Number(row.form_id);
    const current = itemMap.get(formId) || [];

    current.push({
      indicator_version_id: Number(
        row.indicator_version_id,
      ),
      indicator_code: String(
        row.indicator_code || "",
      ).trim(),
      indicator_name: String(
        row.indicator_name || "",
      ).trim(),
      weight_percent: Number(
        row.weight_percent,
      ),
      item_order: Number(row.item_order),
    });

    itemMap.set(formId, current);
  }

  for (const row of scopeResult.recordset) {
    const formId = Number(row.form_id);
    const codes = divisionCodeMap.get(formId) || [];
    const names = divisionNameMap.get(formId) || [];

    codes.push(String(row.division_code || "").trim());
    names.push(String(row.division_name || "").trim());

    divisionCodeMap.set(formId, codes);
    divisionNameMap.set(formId, names);
  }

  return formResult.recordset.map((row) => {
    const formId = Number(row.form_id);

    return {
      form_id: formId,
      form_version_id: Number(
        row.form_version_id,
      ),
      form_code: String(
        row.form_code || "",
      ).trim(),
      form_name: String(
        row.form_name || "",
      ).trim(),
      version_no: Number(row.version_no),
      scope_type: Number(row.scope_type),
      division_codes:
        divisionCodeMap.get(formId) || [],
      division_names:
        divisionNameMap.get(formId) || [],
      total_weight_percent: Number(
        row.total_weight_percent,
      ),
      active_status: Boolean(
        row.active_status,
      ),
      items: itemMap.get(formId) || [],
    };
  }) as KpiFormOption[];
}

export default async function KpiFormsPage() {
  await requireAdminSession();

  async function saveForm(
    _previousState: KpiFormActionState,
    formData: FormData,
  ): Promise<KpiFormActionState> {
    "use server";

    try {
      const session = await requireAdminSession();

      const formName = String(
        formData.get("form_name") || "",
      ).trim();
      const scopeType = Number(
        formData.get("scope_type") || 0,
      );
      const sourceFormVersionId = Number(
        formData.get("source_form_version_id") || 0,
      );

      const divisionCodes = Array.from(
        new Set(
          formData
            .getAll("division_code")
            .map((value) =>
              String(value || "").trim(),
            )
            .filter(Boolean),
        ),
      );

      const indicatorVersionIds = Array.from(
        new Set(
          formData
            .getAll("indicator_version_id")
            .map((value) => Number(value))
            .filter(
              (value) =>
                Number.isSafeInteger(value) &&
                value > 0,
            ),
        ),
      );

      if (!formName) {
        return actionResult(
          false,
          "warning",
          "กรุณาระบุชื่อแบบฟอร์ม KPI",
        );
      }

      if (![1, 2].includes(scopeType)) {
        return actionResult(
          false,
          "warning",
          "ขอบเขตหน่วยงานไม่ถูกต้อง",
        );
      }

      if (
        scopeType === 2 &&
        divisionCodes.length === 0
      ) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกอย่างน้อย 1 หน่วยงาน",
        );
      }

      if (indicatorVersionIds.length === 0) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกอย่างน้อย 1 ตัวชี้วัด",
        );
      }

      const items = indicatorVersionIds.map(
        (indicatorVersionId, index) => {
          const weightText = String(
            formData.get(
              `weight_${indicatorVersionId}`,
            ) || "",
          ).trim();
          const weight = Number(weightText);

          if (
            weightText === "" ||
            !Number.isInteger(weight) ||
            weight < 1 ||
            weight > 100
          ) {
            throw new Error(
              `น้ำหนักของตัวชี้วัดลำดับที่ ${
                index + 1
              } ต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 100`,
            );
          }

          return {
            indicatorVersionId,
            weight,
            itemOrder: index + 1,
          };
        },
      );

      const totalWeight = items.reduce(
        (sum, item) => sum + item.weight,
        0,
      );

      if (totalWeight !== 100) {
        return actionResult(
          false,
          "warning",
          totalWeight < 100
            ? `น้ำหนักรวมต้องเท่ากับ 100 ปัจจุบันรวมได้ ${totalWeight} และยังขาด ${
                100 - totalWeight
              }`
            : `น้ำหนักรวมต้องเท่ากับ 100 ปัจจุบันรวมได้ ${totalWeight} และเกิน ${
                totalWeight - 100
              }`,
        );
      }

      const pool = await getDbPool();
      const request = pool
        .request()
        .input(
          "form_name",
          sql.NVarChar(500),
          formName,
        )
        .input(
          "scope_type",
          sql.TinyInt,
          scopeType,
        )
        .input(
          "source_form_version_id",
          sql.BigInt,
          sourceFormVersionId || null,
        )
        .input(
          "created_by",
          sql.VarChar(20),
          session.emp_id,
        );

      items.forEach((item, index) => {
        request
          .input(
            `indicator_${index}`,
            sql.BigInt,
            item.indicatorVersionId,
          )
          .input(
            `weight_${index}`,
            sql.Int,
            item.weight,
          );
      });

      divisionCodes.forEach((code, index) => {
        request.input(
          `division_${index}`,
          sql.VarChar(20),
          code,
        );
      });

      const itemSql = items
        .map(
          (_item, index) => `
            INSERT INTO dbo.kpi_form_item
            (
              form_version_id,
              item_order,
              indicator_version_id,
              weight_percent,
              created_date,
              created_by
            )
            VALUES
            (
              @form_version_id,
              ${index + 1},
              @indicator_${index},
              @weight_${index},
              SYSDATETIME(),
              @created_by
            );
          `,
        )
        .join("\n");

      const divisionSql =
        scopeType === 2
          ? divisionCodes
              .map(
                (_code, index) => `
                  IF NOT EXISTS
                  (
                    SELECT 1
                    FROM ${ssbDb()}.dbo.sectioncode s
                    WHERE LTRIM(
                            RTRIM(
                              CAST(
                                s.Code AS varchar(20)
                              )
                            )
                          ) = @division_${index}
                      AND s.ThaiName LIKE N'%ใหม่%'
                  )
                  BEGIN
                    THROW 52200,
                          N'ไม่พบหน่วยงานที่เลือก',
                          1;
                  END;

                  IF EXISTS
                    (
                    SELECT 1
                    FROM dbo.competency_excluded_section x
                    WHERE x.active_status = 1
                        AND LTRIM(RTRIM(CAST(x.section_code AS varchar(20))))
                            = @division_${index}
                    )
                    BEGIN
                    THROW 52202,
                            N'หน่วยงานที่เลือกเป็นหน่วยเบิกที่ไม่ต้องประเมิน',
                            1;
                    END;

                  INSERT INTO dbo.kpi_form_scope
                  (
                    form_version_id,
                    division_code,
                    created_date,
                    created_by
                  )
                  VALUES
                  (
                    @form_version_id,
                    @division_${index},
                    SYSDATETIME(),
                    @created_by
                  );
                `,
              )
              .join("\n")
          : "";

      const result = await request.query(`
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        BEGIN TRY
          BEGIN TRANSACTION;

          IF @source_form_version_id IS NOT NULL
             AND NOT EXISTS
             (
               SELECT 1
               FROM dbo.kpi_form_version
               WHERE form_version_id =
                     @source_form_version_id
             )
          BEGIN
            THROW 52201,
                  N'ไม่พบแบบฟอร์มต้นแบบที่เลือก',
                  1;
          END;

          DECLARE @form_id bigint;
          DECLARE @form_version_id bigint;
          DECLARE @form_code varchar(20);

          EXEC dbo.sp_kpi_create_form_draft
               @form_name = @form_name,
               @owner_division_code = NULL,
               @source_form_version_id =
                 @source_form_version_id,
               @created_by = @created_by,
               @form_id = @form_id OUTPUT,
               @form_version_id =
                 @form_version_id OUTPUT,
               @form_code = @form_code OUTPUT;

          UPDATE dbo.kpi_form_version
          SET scope_type = @scope_type,
              updated_date = SYSDATETIME(),
              updated_by = @created_by
          WHERE form_version_id =
                @form_version_id;

          ${divisionSql}
          ${itemSql}

          EXEC dbo.sp_kpi_validate_form_version
               @form_version_id =
                 @form_version_id;

          UPDATE dbo.kpi_form_version
          SET status_type = 1,
              updated_date = SYSDATETIME(),
              updated_by = @created_by
          WHERE form_version_id =
                @form_version_id;

          COMMIT TRANSACTION;

          SELECT
            @form_id AS form_id,
            @form_code AS form_code;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

          THROW;
        END CATCH;
      `);

      const formId = Number(
        result.recordset[0]?.form_id || 0,
      );
      const formCode = String(
        result.recordset[0]?.form_code || "",
      ).trim();

      revalidatePath(PAGE_PATH);

      return actionResult(
        true,
        "success",
        `สร้างแบบฟอร์ม ${formCode} เรียบร้อยแล้ว`,
        formId,
        formCode,
      );
    } catch (error) {
      console.error(
        "save KPI form error:",
        error,
      );

      return actionResult(
        false,
        "error",
        adminErrorMessage(error),
      );
    }
  }

  async function toggleForm(
    _previousState: KpiFormActionState,
    formData: FormData,
  ): Promise<KpiFormActionState> {
    "use server";

    try {
      const session = await requireAdminSession();
      const formId = Number(
        formData.get("form_id") || 0,
      );
      const activeStatus =
        Number(
          formData.get("active_status"),
        ) === 1;

      if (!formId) {
        return actionResult(
          false,
          "warning",
          "ไม่พบแบบฟอร์มที่ต้องการเปลี่ยนสถานะ",
        );
      }

      const pool = await getDbPool();

      await pool
        .request()
        .input(
          "form_id",
          sql.BigInt,
          formId,
        )
        .input(
          "active_status",
          sql.Bit,
          activeStatus,
        )
        .input(
          "updated_by",
          sql.VarChar(20),
          session.emp_id,
        )
        .query(`
          IF NOT EXISTS
          (
            SELECT 1
            FROM dbo.kpi_form
            WHERE form_id = @form_id
          )
          BEGIN
            THROW 52210,
                  N'ไม่พบแบบฟอร์มที่ต้องการเปลี่ยนสถานะ',
                  1;
          END;

          UPDATE dbo.kpi_form
          SET active_status = @active_status,
              updated_date = SYSDATETIME(),
              updated_by = @updated_by
          WHERE form_id = @form_id;
        `);

      revalidatePath(PAGE_PATH);

      return actionResult(
        true,
        "success",
        activeStatus
          ? "เปิดใช้งานแบบฟอร์มเรียบร้อยแล้ว"
          : "ปิดใช้งานแบบฟอร์มเรียบร้อยแล้ว",
        formId,
      );
    } catch (error) {
      console.error(
        "toggle KPI form error:",
        error,
      );

      return actionResult(
        false,
        "error",
        adminErrorMessage(error),
      );
    }
  }

  const [divisions, indicators, forms] =
    await Promise.all([
      getDivisions(),
      getIndicators(),
      getForms(),
    ]);

  return (
    <div>
      <PageHeader
        title="แบบฟอร์ม KPI"
        description="สร้างแบบฟอร์มครั้งเดียว เลือกใช้ได้หลายหน่วยงาน และกำหนดน้ำหนักตัวชี้วัดรวมให้ครบ 100"
      />

      <KpiFormTemplateFormTable
        divisions={divisions}
        indicators={indicators}
        forms={forms}
        saveAction={saveForm}
        toggleAction={toggleForm}
      />
    </div>
  );
}