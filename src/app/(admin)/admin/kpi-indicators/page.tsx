import KpiIndicatorFormTable, {
  type DivisionOption,
  type KpiActionState,
  type KpiCategoryOption,
  type KpiIndicatorItem,
  type KpiRuleItem,
} from "@/components/competency/KpiIndicatorFormTable";
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

const PAGE_PATH = "/admin/kpi-indicators";
const INT_MAX = 2147483647;

type ParsedRule = {
  level: number;
  operator: "GT" | "GE" | "LT" | "LE" | "EQ";
  value: number;
  min: number;
  max: number;
  evaluationOrder: number;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function actionResult(
  ok: boolean,
  type: KpiActionState["type"],
  message: string,
  entityId = 0,
  entityCode = "",
): KpiActionState {
  return {
    ok,
    type,
    message,
    result_id: Date.now(),
    entity_id: entityId,
    entity_code: entityCode,
  };
}

function errorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message.replace(/^RequestError:\s*/i, "").trim()
      : "";

  if (!rawMessage) {
    return "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
  }

  if (
    rawMessage.includes("@candidate") ||
    rawMessage.includes("PRIMARY KEY constraint")
  ) {
    return "ไม่สามารถตรวจสอบช่วงคะแนนได้ เนื่องจากมีค่าขอบเขตซ้ำกัน กรุณาตรวจสอบเกณฑ์ระดับ 5–1 แล้วลองบันทึกอีกครั้ง";
  }

  if (
    rawMessage.includes("duplicate key") ||
    rawMessage.includes("UNIQUE KEY constraint") ||
    rawMessage.includes("UNIQUE INDEX")
  ) {
    return "พบข้อมูลซ้ำกับรายการที่มีอยู่แล้ว กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
  }

  if (rawMessage.includes("FOREIGN KEY constraint")) {
    return "ไม่สามารถบันทึกได้ เนื่องจากข้อมูลที่เลือกไม่สัมพันธ์กับข้อมูลในระบบ";
  }

  if (rawMessage.includes("CHECK constraint")) {
    return "ข้อมูลบางรายการไม่เป็นไปตามเงื่อนไขของระบบ กรุณาตรวจสอบค่าที่กรอก";
  }

  if (/[ก-๙]/.test(rawMessage)) {
    return rawMessage;
  }

  return "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
}

function normalizeCategoryCode(value: FormDataEntryValue | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

function intervalForRule(
  operator: ParsedRule["operator"],
  value: number,
) {
  if (operator === "GT") {
    if (value >= INT_MAX) {
      throw new Error(
        "เงื่อนไข > 2147483647 ไม่มีค่าจำนวนเต็มที่เข้าเงื่อนไข",
      );
    }

    return { min: value + 1, max: INT_MAX };
  }

  if (operator === "GE") {
    return { min: value, max: INT_MAX };
  }

  if (operator === "LT") {
    if (value <= 0) {
      throw new Error(
        "เงื่อนไข < 0 ไม่มีค่าผลงานที่เข้าเงื่อนไข เพราะค่าผลงานต้องเริ่มตั้งแต่ 0",
      );
    }

    return { min: 0, max: value - 1 };
  }

  if (operator === "LE") {
    return { min: 0, max: value };
  }

  return { min: value, max: value };
}

function intervalsOverlap(first: ParsedRule, second: ParsedRule) {
  return (
    Math.max(first.min, second.min) <=
    Math.min(first.max, second.max)
  );
}

function intervalIsSubset(first: ParsedRule, second: ParsedRule) {
  return first.min >= second.min && first.max <= second.max;
}

function sameInterval(first: ParsedRule, second: ParsedRule) {
  return first.min === second.min && first.max === second.max;
}

function parseAndOrderRules(formData: FormData): ParsedRule[] {
  const validOperators = new Set(["GT", "GE", "LT", "LE", "EQ"]);
  const enabledLevels = [5, 4, 3, 2, 1].filter(
    (level) =>
      String(formData.get(`enabled_level_${level}`) || "") === "1",
  );

  if (enabledLevels.length === 0) {
    throw new Error("กรุณาเปิดใช้งานอย่างน้อย 1 ระดับคะแนน");
  }

  const rules: ParsedRule[] = enabledLevels.map((level) => {
    const operatorText = String(
      formData.get(`operator_${level}`) || "",
    ).trim();

    if (!validOperators.has(operatorText)) {
      throw new Error(`เครื่องหมายของระดับ ${level} ไม่ถูกต้อง`);
    }

    const valueText = String(
      formData.get(`value_${level}`) || "",
    ).trim();
    const value = Number(valueText);

    if (
      valueText === "" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > INT_MAX
    ) {
      throw new Error(
        `ค่าของระดับ ${level} ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`,
      );
    }

    const operator = operatorText as ParsedRule["operator"];
    const interval = intervalForRule(operator, value);

    return {
      level,
      operator,
      value,
      min: interval.min,
      max: interval.max,
      evaluationOrder: 0,
    };
  });

  const edges = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();

  for (const rule of rules) {
    edges.set(rule.level, new Set());
    indegree.set(rule.level, 0);
  }

  function addEdge(fromLevel: number, toLevel: number) {
    const set = edges.get(fromLevel);
    if (!set || set.has(toLevel)) return;

    set.add(toLevel);
    indegree.set(toLevel, Number(indegree.get(toLevel) || 0) + 1);
  }

  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const first = rules[i];
      const second = rules[j];

      if (!intervalsOverlap(first, second)) continue;

      if (sameInterval(first, second)) {
        throw new Error(
          `ระดับ ${first.level} และระดับ ${second.level} ใช้เงื่อนไขเดียวกัน กรุณาปิดระดับที่ไม่ใช้ หรือแก้เครื่องหมายและค่าไม่ให้ซ้ำกัน`,
        );
      }

      const firstSubset = intervalIsSubset(first, second);
      const secondSubset = intervalIsSubset(second, first);

      if (firstSubset && !secondSubset) {
        addEdge(first.level, second.level);
        continue;
      }

      if (secondSubset && !firstSubset) {
        addEdge(second.level, first.level);
        continue;
      }

      throw new Error(
        `เงื่อนไขระดับ ${first.level} และระดับ ${second.level} ซ้อนกันจนไม่สามารถตัดสินระดับได้ กรุณาปรับช่วงค่า`,
      );
    }
  }

  const remaining = new Map(rules.map((rule) => [rule.level, rule]));
  const ordered: ParsedRule[] = [];

  while (remaining.size > 0) {
    const available = Array.from(remaining.values())
      .filter((rule) => Number(indegree.get(rule.level) || 0) === 0)
      .sort((first, second) => {
        const firstWidth = first.max - first.min;
        const secondWidth = second.max - second.min;

        if (firstWidth !== secondWidth) {
          return firstWidth - secondWidth;
        }

        return second.level - first.level;
      });

    const next = available[0];

    if (!next) {
      throw new Error(
        "ไม่สามารถจัดลำดับตรวจเงื่อนไขได้ กรุณาตรวจสอบเกณฑ์ระดับคะแนน",
      );
    }

    ordered.push(next);
    remaining.delete(next.level);

    for (const target of edges.get(next.level) || []) {
      indegree.set(target, Number(indegree.get(target) || 0) - 1);
    }
  }

  return ordered.map((rule, index) => ({
    ...rule,
    evaluationOrder: index + 1,
  }));
}

async function getCategories() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      category_id,
      category_code,
      category_name,
      running_digits,
      next_running_no,
      active_status
    FROM dbo.kpi_indicator_category
    ORDER BY active_status DESC, category_code;
  `);

  return result.recordset.map((row) => ({
    category_id: Number(row.category_id),
    category_code: String(row.category_code || "").trim(),
    category_name: String(row.category_name || "").trim(),
    running_digits: Number(row.running_digits || 3),
    next_running_no: Number(row.next_running_no || 1),
    active_status: Boolean(row.active_status),
  })) as KpiCategoryOption[];
}

async function getDivisions() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(CAST(s.Code AS varchar(20)))) AS division_code,
      LTRIM(RTRIM(s.ThaiName)) AS division_name
    FROM ${ssbDb()}.dbo.sectioncode s
    WHERE s.ThaiName LIKE N'%ใหม่%'
      AND NULLIF(
            LTRIM(RTRIM(CAST(s.Code AS varchar(20)))),
            ''
          ) IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(s.ThaiName)), N'') IS NOT NULL
    ORDER BY
      LTRIM(RTRIM(s.ThaiName)),
      LTRIM(RTRIM(CAST(s.Code AS varchar(20))));
  `);

  return result.recordset.map((row) => ({
    division_code: String(row.division_code || "").trim(),
    division_name: String(
      row.division_name || row.division_code || "",
    ).trim(),
  })) as DivisionOption[];
}

async function getIndicators() {
  const pool = await getDbPool();

  const [indicatorResult, ruleResult, scopeResult] = await Promise.all([
    pool.request().query(`
      WITH latest_version AS
      (
        SELECT
          iv.*,
          ROW_NUMBER() OVER
          (
            PARTITION BY iv.indicator_id
            ORDER BY
              iv.version_no DESC,
              iv.indicator_version_id DESC
          ) AS row_no
        FROM dbo.kpi_indicator_version iv
      )
      SELECT
        i.indicator_id,
        i.indicator_code,
        i.category_id,
        c.category_code,
        c.category_name,
        lv.indicator_version_id,
        lv.version_no,
        lv.indicator_name,
        lv.scope_type,
        lv.score_direction_type,
        ISNULL(lv.note, N'') AS note,
        i.active_status
      FROM dbo.kpi_indicator i
      JOIN dbo.kpi_indicator_category c
        ON c.category_id = i.category_id
      JOIN latest_version lv
        ON lv.indicator_id = i.indicator_id
       AND lv.row_no = 1
      ORDER BY i.active_status DESC, i.indicator_code;
    `),
    pool.request().query(`
      WITH latest_version AS
      (
        SELECT
          iv.indicator_version_id,
          iv.indicator_id,
          ROW_NUMBER() OVER
          (
            PARTITION BY iv.indicator_id
            ORDER BY
              iv.version_no DESC,
              iv.indicator_version_id DESC
          ) AS row_no
        FROM dbo.kpi_indicator_version iv
      )
      SELECT
        lv.indicator_id,
        r.score_level,
        r.operator_type,
        r.compare_value,
        r.evaluation_order
      FROM latest_version lv
      JOIN dbo.kpi_indicator_rule r
        ON r.indicator_version_id = lv.indicator_version_id
      WHERE lv.row_no = 1
      ORDER BY lv.indicator_id, r.score_level DESC;
    `),
    pool.request().query(`
      WITH latest_version AS
      (
        SELECT
          iv.indicator_version_id,
          iv.indicator_id,
          ROW_NUMBER() OVER
          (
            PARTITION BY iv.indicator_id
            ORDER BY
              iv.version_no DESC,
              iv.indicator_version_id DESC
          ) AS row_no
        FROM dbo.kpi_indicator_version iv
      )
      SELECT
        lv.indicator_id,
        s.division_code
      FROM latest_version lv
      JOIN dbo.kpi_indicator_scope s
        ON s.indicator_version_id = lv.indicator_version_id
      WHERE lv.row_no = 1
      ORDER BY lv.indicator_id, s.division_code;
    `),
  ]);

  const ruleMap = new Map<number, KpiRuleItem[]>();
  const scopeMap = new Map<number, string[]>();

  for (const row of ruleResult.recordset) {
    const indicatorId = Number(row.indicator_id);
    const current = ruleMap.get(indicatorId) || [];

    current.push({
      score_level: Number(row.score_level),
      operator_type: String(row.operator_type || "").trim(),
      compare_value: Number(row.compare_value),
      evaluation_order: Number(row.evaluation_order),
    });
    ruleMap.set(indicatorId, current);
  }

  for (const row of scopeResult.recordset) {
    const indicatorId = Number(row.indicator_id);
    const current = scopeMap.get(indicatorId) || [];

    current.push(String(row.division_code || "").trim());
    scopeMap.set(indicatorId, current);
  }

  return indicatorResult.recordset.map((row) => {
    const indicatorId = Number(row.indicator_id);

    return {
      indicator_id: indicatorId,
      indicator_code: String(row.indicator_code || "").trim(),
      category_id: Number(row.category_id),
      category_code: String(row.category_code || "").trim(),
      category_name: String(row.category_name || "").trim(),
      version_no: Number(row.version_no),
      indicator_name: String(row.indicator_name || "").trim(),
      scope_type: Number(row.scope_type),
      score_direction_type: Number(row.score_direction_type),
      note: String(row.note || "").trim(),
      active_status: Boolean(row.active_status),
      rules: ruleMap.get(indicatorId) || [],
      division_codes: scopeMap.get(indicatorId) || [],
    };
  }) as KpiIndicatorItem[];
}

export default async function KpiIndicatorsPage() {
  await requireAdminSession();

  async function createCategory(
    _previousState: KpiActionState,
    formData: FormData,
  ): Promise<KpiActionState> {
    "use server";

    try {
      const session = await requireAdminSession();
      const categoryCode = normalizeCategoryCode(
        formData.get("category_code"),
      );
      const categoryName = String(
        formData.get("category_name") || "",
      ).trim();

      if (categoryCode.length < 2 || categoryCode.length > 10) {
        return actionResult(
          false,
          "warning",
          "รหัสหมวดต้องมี 2–10 ตัว และใช้เฉพาะภาษาอังกฤษหรือตัวเลข",
        );
      }

      if (!categoryName) {
        return actionResult(false, "warning", "กรุณาระบุชื่อหมวด");
      }

      const pool = await getDbPool();
      const result = await pool
        .request()
        .input("category_code", sql.VarChar(10), categoryCode)
        .input("category_name", sql.NVarChar(200), categoryName)
        .input("created_by", sql.VarChar(20), session.emp_id)
        .query(`
          IF EXISTS (
            SELECT 1
            FROM dbo.kpi_indicator_category
            WHERE category_code = @category_code
          )
          BEGIN
            THROW 52020, N'รหัสหมวดนี้ถูกใช้งานแล้ว', 1;
          END;

          INSERT INTO dbo.kpi_indicator_category
          (
            category_code,
            category_name,
            running_digits,
            next_running_no,
            active_status,
            created_date,
            created_by
          )
          VALUES
          (
            @category_code,
            @category_name,
            3,
            1,
            1,
            SYSDATETIME(),
            @created_by
          );

          SELECT CONVERT(int, SCOPE_IDENTITY()) AS category_id;
        `);

      const categoryId = Number(
        result.recordset[0]?.category_id || 0,
      );

      revalidatePath(PAGE_PATH);

      return actionResult(
        true,
        "success",
        `เพิ่มหมวด ${categoryCode} และเลือกให้แล้ว`,
        categoryId,
        categoryCode,
      );
    } catch (error) {
      console.error(error);
      return actionResult(false, "error", errorMessage(error));
    }
  }

  async function saveIndicator(
    _previousState: KpiActionState,
    formData: FormData,
  ): Promise<KpiActionState> {
    "use server";

    try {
      const session = await requireAdminSession();

      const indicatorId = Number(formData.get("indicator_id") || 0);
      const categoryId = Number(formData.get("category_id") || 0);
      const indicatorName = String(
        formData.get("indicator_name") || "",
      ).trim();
      const scopeType = Number(formData.get("scope_type") || 0);
      const directionType = Number(
        formData.get("score_direction_type") || 0,
      );
      const note = String(formData.get("note") || "").trim();
      const divisionCodes = Array.from(
        new Set(
          formData
            .getAll("division_code")
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      );

      if (!categoryId) {
        return actionResult(false, "warning", "กรุณาเลือกหมวดรหัส");
      }

      if (!indicatorName) {
        return actionResult(false, "warning", "กรุณาระบุชื่อตัวชี้วัด");
      }

      if (![1, 2].includes(scopeType)) {
        return actionResult(false, "warning", "ประเภทการใช้งานไม่ถูกต้อง");
      }

      if (![1, 2].includes(directionType)) {
        return actionResult(false, "warning", "แนวโน้มคะแนนไม่ถูกต้อง");
      }

      if (scopeType === 2 && divisionCodes.length === 0) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกอย่างน้อย 1 กลุ่มงาน",
        );
      }

      const rules = parseAndOrderRules(formData);
      const pool = await getDbPool();
      const request = pool
        .request()
        .input("indicator_id", sql.BigInt, indicatorId || null)
        .input("category_id", sql.Int, categoryId)
        .input("indicator_name", sql.NVarChar(1000), indicatorName)
        .input("scope_type", sql.TinyInt, scopeType)
        .input("direction_type", sql.TinyInt, directionType)
        .input("note", sql.NVarChar(2000), note || null)
        .input("changed_by", sql.VarChar(20), session.emp_id);

      for (const rule of rules) {
        request
          .input(
            `operator_${rule.level}`,
            sql.VarChar(2),
            rule.operator,
          )
          .input(`value_${rule.level}`, sql.Int, rule.value)
          .input(
            `order_${rule.level}`,
            sql.TinyInt,
            rule.evaluationOrder,
          );
      }

      divisionCodes.forEach((code, index) => {
        request.input(`division_${index}`, sql.VarChar(20), code);
      });

      const scopeSql =
        scopeType === 2
          ? divisionCodes
              .map(
                (_code, index) => `
                  INSERT INTO dbo.kpi_indicator_scope
                  (
                    indicator_version_id,
                    division_code,
                    created_date,
                    created_by
                  )
                  VALUES
                  (
                    @indicator_version_id,
                    @division_${index},
                    SYSDATETIME(),
                    @changed_by
                  );
                `,
              )
              .join("\n")
          : "";

      const ruleSql = rules
        .map(
          (rule) => `
            INSERT INTO dbo.kpi_indicator_rule
            (
              indicator_version_id,
              score_level,
              operator_type,
              compare_value,
              evaluation_order,
              created_date,
              created_by
            )
            VALUES
            (
              @indicator_version_id,
              ${rule.level},
              @operator_${rule.level},
              @value_${rule.level},
              @order_${rule.level},
              SYSDATETIME(),
              @changed_by
            );
          `,
        )
        .join("\n");

      const sqlText =
        indicatorId > 0
          ? `
            SET NOCOUNT ON;
            SET XACT_ABORT ON;

            BEGIN TRY
              BEGIN TRANSACTION;

              DECLARE @indicator_version_id bigint;
              DECLARE @indicator_code varchar(30);
              DECLARE @next_version_no int;

              SELECT @indicator_code = indicator_code
              FROM dbo.kpi_indicator WITH (UPDLOCK, HOLDLOCK)
              WHERE indicator_id = @indicator_id;

              IF @indicator_code IS NULL
                THROW 52030, N'ไม่พบตัวชี้วัดที่ต้องการแก้ไข', 1;

              SELECT
                @next_version_no = ISNULL(MAX(version_no), 0) + 1
              FROM dbo.kpi_indicator_version
              WHERE indicator_id = @indicator_id;

              INSERT INTO dbo.kpi_indicator_version
              (
                indicator_id,
                version_no,
                indicator_name,
                scope_type,
                score_direction_type,
                note,
                status_type,
                created_date,
                created_by
              )
              VALUES
              (
                @indicator_id,
                @next_version_no,
                @indicator_name,
                @scope_type,
                @direction_type,
                @note,
                0,
                SYSDATETIME(),
                @changed_by
              );

              SET @indicator_version_id =
                CONVERT(bigint, SCOPE_IDENTITY());

              ${ruleSql}
              ${scopeSql}

              EXEC dbo.sp_kpi_validate_indicator_version
                   @indicator_version_id = @indicator_version_id;

              UPDATE dbo.kpi_indicator_version
              SET status_type = 9,
                  updated_date = SYSDATETIME(),
                  updated_by = @changed_by
              WHERE indicator_id = @indicator_id
                AND indicator_version_id <> @indicator_version_id
                AND status_type = 1;

              UPDATE dbo.kpi_indicator_version
              SET status_type = 1,
                  updated_date = SYSDATETIME(),
                  updated_by = @changed_by
              WHERE indicator_version_id = @indicator_version_id;

              UPDATE dbo.kpi_indicator
              SET active_status = 1,
                  updated_date = SYSDATETIME(),
                  updated_by = @changed_by
              WHERE indicator_id = @indicator_id;

              COMMIT TRANSACTION;

              SELECT
                @indicator_id AS indicator_id,
                @indicator_code AS indicator_code;
            END TRY
            BEGIN CATCH
              IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
              THROW;
            END CATCH;
          `
          : `
            SET NOCOUNT ON;
            SET XACT_ABORT ON;

            BEGIN TRY
              BEGIN TRANSACTION;

              DECLARE @new_indicator_id bigint;
              DECLARE @indicator_version_id bigint;
              DECLARE @indicator_code varchar(30);

              EXEC dbo.sp_kpi_create_indicator_draft
                   @category_id = @category_id,
                   @indicator_name = @indicator_name,
                   @scope_type = @scope_type,
                   @score_direction_type = @direction_type,
                   @note = @note,
                   @created_by = @changed_by,
                   @indicator_id = @new_indicator_id OUTPUT,
                   @indicator_version_id = @indicator_version_id OUTPUT,
                   @indicator_code = @indicator_code OUTPUT;

              ${ruleSql}
              ${scopeSql}

              EXEC dbo.sp_kpi_validate_indicator_version
                   @indicator_version_id = @indicator_version_id;

              UPDATE dbo.kpi_indicator_version
              SET status_type = 1,
                  updated_date = SYSDATETIME(),
                  updated_by = @changed_by
              WHERE indicator_version_id = @indicator_version_id;

              COMMIT TRANSACTION;

              SELECT
                @new_indicator_id AS indicator_id,
                @indicator_code AS indicator_code;
            END TRY
            BEGIN CATCH
              IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
              THROW;
            END CATCH;
          `;

      const result = await request.query(sqlText);
      const savedIndicatorId = Number(
        result.recordset[0]?.indicator_id || 0,
      );
      const savedCode = String(
        result.recordset[0]?.indicator_code || "",
      ).trim();

      revalidatePath(PAGE_PATH);

      return actionResult(
        true,
        "success",
        indicatorId > 0
          ? `บันทึก ${savedCode} เป็น Version ใหม่เรียบร้อยแล้ว`
          : `เพิ่มตัวชี้วัด ${savedCode} เรียบร้อยแล้ว`,
        savedIndicatorId,
        savedCode,
      );
    } catch (error) {
      console.error(error);
      return actionResult(false, "error", errorMessage(error));
    }
  }

  async function toggleIndicator(
    _previousState: KpiActionState,
    formData: FormData,
  ): Promise<KpiActionState> {
    "use server";

    try {
      const session = await requireAdminSession();
      const indicatorId = Number(formData.get("indicator_id") || 0);
      const activeStatus =
        Number(formData.get("active_status")) === 1;

      if (!indicatorId) {
        return actionResult(
          false,
          "warning",
          "ไม่พบตัวชี้วัดที่ต้องการเปลี่ยนสถานะ",
        );
      }

      const pool = await getDbPool();

      await pool
        .request()
        .input("indicator_id", sql.BigInt, indicatorId)
        .input("active_status", sql.Bit, activeStatus)
        .input("updated_by", sql.VarChar(20), session.emp_id)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.kpi_indicator
            WHERE indicator_id = @indicator_id
          )
          BEGIN
            THROW 52040, N'ไม่พบตัวชี้วัดที่ต้องการเปลี่ยนสถานะ', 1;
          END;

          UPDATE dbo.kpi_indicator
          SET active_status = @active_status,
              updated_date = SYSDATETIME(),
              updated_by = @updated_by
          WHERE indicator_id = @indicator_id;
        `);

      revalidatePath(PAGE_PATH);

      return actionResult(
        true,
        "success",
        activeStatus
          ? "เปิดใช้งานตัวชี้วัดเรียบร้อยแล้ว"
          : "ปิดใช้งานตัวชี้วัดเรียบร้อยแล้ว",
        indicatorId,
      );
    } catch (error) {
      console.error(error);
      return actionResult(false, "error", errorMessage(error));
    }
  }

  const [categories, divisions, indicators] = await Promise.all([
    getCategories(),
    getDivisions(),
    getIndicators(),
  ]);

  return (
    <div>
      <PageHeader
        title="หัวข้อตัวชี้วัด KPI"
        description="สร้างตัวชี้วัด กำหนดเกณฑ์ระดับคะแนน และเลือกขอบเขตการใช้งาน"
      />

      <KpiIndicatorFormTable
        categories={categories}
        divisions={divisions}
        indicators={indicators}
        saveIndicatorAction={saveIndicator}
        createCategoryAction={createCategory}
        toggleIndicatorAction={toggleIndicator}
      />
    </div>
  );
}