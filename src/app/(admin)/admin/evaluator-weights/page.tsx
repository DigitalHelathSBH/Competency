import ActionAlert from "@/components/competency/ActionAlert";
import DataTable from "@/components/competency/DataTable";
import EvaluatorWeightForm from "@/components/competency/EvaluatorWeightForm";
import PageHeader from "@/components/competency/PageHeader";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type RoundOptionRow = {
  round_id: number;
  round_code: string;
  status_type: number;
};

type DivisionOptionRow = {
  code: string;
  divisionname: string;
};

type EvaluatorWeightRow = {
  evaluator_weight_id: number;
  round_id: number;
  round_code: string;
  round_status_type: number;
  division_code: string | null;
  division_name: string | null;
  evaluator_level: number;
  weight_percent: number;
  active_status: boolean;
  created_date: string | null;
  created_by: string | null;
};

type EvaluatorWeightsPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

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

  redirect(`/admin/evaluator-weights?${params.toString()}`);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "เกิดข้อผิดพลาด ไม่สามารถดำเนินการได้";
}

function roundStatusText(statusType: number) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) return "เปิดประเมิน";
  if (statusType === 2) return "ปิดรอบ";
  if (statusType === 9) return "ยกเลิก";
  return `สถานะ ${statusType}`;
}

function roundCannotEditMessage(roundCode: string, statusType: number) {
  if (statusType === 1) {
    return `รอบ ${roundCode} เปิดใช้งานแล้ว ไม่สามารถแก้ไขน้ำหนักผู้ประเมินได้`;
  }

  if (statusType === 2) {
    return `รอบ ${roundCode} ถูกปิดแล้ว ไม่สามารถแก้ไขน้ำหนักผู้ประเมินได้`;
  }

  if (statusType === 9) {
    return `รอบ ${roundCode} ถูกยกเลิกแล้ว ไม่สามารถแก้ไขน้ำหนักผู้ประเมินได้`;
  }

  return `รอบ ${roundCode} ไม่อยู่ในสถานะร่าง ไม่สามารถแก้ไขน้ำหนักผู้ประเมินได้`;
}

function evaluatorLevelText(level: number) {
  if (level === 1) return "หัวหน้าใกล้ชิด";
  if (level === 2) return "หัวหน้าใหญ่";
  return `ระดับ ${level}`;
}

function normalizeDivisionCode(divisionCode: string | null | undefined) {
  return String(divisionCode || "").trim();
}

function divisionDisplayText(
  divisionCode: string | null | undefined,
  divisionName?: string | null,
) {
  const normalized = normalizeDivisionCode(divisionCode);

  if (!normalized) {
    return "ค่า default ทุกกลุ่มภารกิจ";
  }

  if (divisionName) {
    return `${divisionName} (${normalized})`;
  }

  return `กลุ่มภารกิจ ${normalized}`;
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

function RoundStatusBadge({ statusType }: { statusType: number }) {
  if (statusType === 1) {
    return (
      <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
        {roundStatusText(statusType)}
      </span>
    );
  }

  if (statusType === 2 || statusType === 9) {
    return (
      <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
        {roundStatusText(statusType)}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {roundStatusText(statusType)}
    </span>
  );
}

function WeightTotalBadge({ total }: { total: number }) {
  if (Math.abs(total - 100) < 0.01) {
    return (
      <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
        ครบ {total.toFixed(2)}%
      </span>
    );
  }

  if (total > 100) {
    return (
      <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
        เกิน {total.toFixed(2)}%
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
      ยังไม่ครบ {total.toFixed(2)}%
    </span>
  );
}

async function getRoundOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      round_id,
      round_code,
      status_type
    FROM dbo.competency_round
    WHERE status_type <> 9
    ORDER BY round_year DESC, round_no DESC, round_id DESC;
  `);

  return result.recordset as RoundOptionRow[];
}

async function getDivisionOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(code)) AS code,
      ${ssbDb()}.dbo.GetSSBName(ISNULL(thainame, englishname)) AS divisionname
    FROM ${ssbDb()}.dbo.sysconfig
    WHERE ctrlcode = 10028
      AND code IN (
        SELECT division
        FROM ${ssbDb()}.dbo.PYREXT
        WHERE terminatedate IS NULL
          AND LEN(division) = 3
      )
    ORDER BY ${ssbDb()}.dbo.GetSSBName(ISNULL(thainame, englishname));
  `);

  return result.recordset as DivisionOptionRow[];
}

async function validateDivisionCode(divisionCode: string) {
  if (!divisionCode) return;

  const pool = await getDbPool();

  const result = await pool
    .request()
    .input("division_code", sql.VarChar(20), divisionCode).query(`
      SELECT TOP 1
        LTRIM(RTRIM(code)) AS code
      FROM ${ssbDb()}.dbo.sysconfig
      WHERE ctrlcode = 10028
        AND LTRIM(RTRIM(code)) COLLATE DATABASE_DEFAULT = @division_code
        AND code IN (
          SELECT division
          FROM ${ssbDb()}.dbo.PYREXT
          WHERE terminatedate IS NULL
            AND LEN(division) = 3
        );
    `);

  if (!result.recordset[0]) {
    redirectWithAlert(
      "error",
      "ไม่พบกลุ่มภารกิจที่เลือก หรือกลุ่มภารกิจนี้ไม่มีเจ้าหน้าที่ที่ยังปฏิบัติงานอยู่",
    );
  }
}

async function getEvaluatorWeights() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      w.evaluator_weight_id,
      w.round_id,
      r.round_code,
      r.status_type AS round_status_type,
      ISNULL(w.division_code, '') AS division_code,
      d.divisionname AS division_name,
      w.evaluator_level,
      CAST(w.weight_percent AS decimal(5, 2)) AS weight_percent,
      w.active_status,
      CONVERT(varchar(19), w.created_date, 120) AS created_date,
      w.created_by
    FROM dbo.competency_evaluator_weight w
    JOIN dbo.competency_round r
      ON r.round_id = w.round_id
    LEFT JOIN (
      SELECT
        LTRIM(RTRIM(code)) AS code,
        ${ssbDb()}.dbo.GetSSBName(ISNULL(thainame, englishname)) AS divisionname
      FROM ${ssbDb()}.dbo.sysconfig
      WHERE ctrlcode = 10028
        AND code IN (
          SELECT division
          FROM ${ssbDb()}.dbo.PYREXT
          WHERE terminatedate IS NULL
            AND LEN(division) = 3
        )
    ) d
      ON ISNULL(LTRIM(RTRIM(w.division_code)), '') = d.code COLLATE DATABASE_DEFAULT
    ORDER BY
      r.round_year DESC,
      r.round_no DESC,
      NULLIF(LTRIM(RTRIM(ISNULL(w.division_code, ''))), ''),
      w.evaluator_level,
      w.active_status DESC,
      w.evaluator_weight_id DESC;
  `);

  return result.recordset as EvaluatorWeightRow[];
}

async function validateRoundCanEdit(roundId: number) {
  const pool = await getDbPool();

  const result = await pool.request().input("round_id", sql.Int, roundId)
    .query(`
      SELECT TOP 1
        round_id,
        round_code,
        status_type
      FROM dbo.competency_round
      WHERE round_id = @round_id;
    `);

  const round = result.recordset[0] as RoundOptionRow | undefined;

  if (!round) {
    redirectWithAlert("error", "ไม่พบรอบประเมินที่เลือก");
  }

  if (Number(round.status_type) !== 0) {
    redirectWithAlert(
      "error",
      roundCannotEditMessage(round.round_code, Number(round.status_type)),
    );
  }

  return round;
}

async function hasExistingWeightSet(roundId: number, divisionCode: string) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input("round_id", sql.Int, roundId)
    .input("division_code", sql.VarChar(20), divisionCode).query(`
      SELECT COUNT(1) AS existing_count
      FROM dbo.competency_evaluator_weight
      WHERE round_id = @round_id
        AND ISNULL(LTRIM(RTRIM(division_code)), '') = @division_code;
    `);

  return Number(result.recordset[0]?.existing_count || 0) > 0;
}

function parseScopeValue(formData: FormData) {
  const scopeValue = String(formData.get("scope_value") || "").trim();

  if (!scopeValue) {
    redirectWithAlert("error", "กรุณาเลือกขอบเขตการใช้น้ำหนัก");
  }

  if (scopeValue === "__DEFAULT__") {
    return "";
  }

  return scopeValue;
}

function parseWeight(value: FormDataEntryValue | null, label: string) {
  const weight = Number(value);

  if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
    redirectWithAlert("error", `${label} ต้องอยู่ระหว่าง 0 ถึง 100`);
  }

  return Number(weight.toFixed(2));
}

async function upsertEvaluatorWeight(
  transaction: sql.Transaction,
  params: {
    roundId: number;
    divisionCode: string;
    evaluatorLevel: 1 | 2;
    weightPercent: number;
    createdBy: string;
  },
) {
  await new sql.Request(transaction)
    .input("round_id", sql.Int, params.roundId)
    .input("division_code", sql.VarChar(20), params.divisionCode)
    .input("evaluator_level", sql.TinyInt, params.evaluatorLevel)
    .input("weight_percent", sql.Decimal(5, 2), params.weightPercent)
    .input("created_by", sql.VarChar(20), params.createdBy).query(`
      DECLARE @target_id int;

      SELECT TOP 1
        @target_id = evaluator_weight_id
      FROM dbo.competency_evaluator_weight WITH (UPDLOCK, HOLDLOCK)
      WHERE round_id = @round_id
        AND ISNULL(LTRIM(RTRIM(division_code)), '') = @division_code
        AND evaluator_level = @evaluator_level
      ORDER BY active_status DESC, evaluator_weight_id DESC;

      IF @target_id IS NULL
      BEGIN
        INSERT INTO dbo.competency_evaluator_weight
          (round_id, division_code, evaluator_level, weight_percent, active_status, created_by)
        VALUES
          (@round_id, @division_code, @evaluator_level, @weight_percent, 1, @created_by);
      END
      ELSE
      BEGIN
        UPDATE dbo.competency_evaluator_weight
        SET weight_percent = @weight_percent,
            active_status = 1
        WHERE evaluator_weight_id = @target_id;

        UPDATE dbo.competency_evaluator_weight
        SET active_status = 0
        WHERE round_id = @round_id
          AND ISNULL(LTRIM(RTRIM(division_code)), '') = @division_code
          AND evaluator_level = @evaluator_level
          AND evaluator_weight_id <> @target_id;
      END
    `);
}

export default async function EvaluatorWeightsPage({
  searchParams,
}: EvaluatorWeightsPageProps) {
  await requireAdminSession();

  const alertParams = await searchParams;

  async function saveWeightSet(formData: FormData) {
    "use server";

    const session = await requireAdminSession();

    const roundId = Number(formData.get("round_id"));
    const divisionCode = parseScopeValue(formData);
    const level1Weight = parseWeight(
      formData.get("level_1_weight"),
      "น้ำหนักหัวหน้าใกล้ชิด",
    );
    const level2Weight = parseWeight(
      formData.get("level_2_weight"),
      "น้ำหนักหัวหน้าใหญ่",
    );
    const totalWeight = Number((level1Weight + level2Weight).toFixed(2));
    const overwriteConfirmed =
      String(formData.get("overwrite_confirmed") || "") === "1";

    if (!Number.isInteger(roundId) || roundId <= 0) {
      redirectWithAlert("error", "กรุณาเลือกรอบประเมิน");
    }

    if (Math.abs(totalWeight - 100) >= 0.01) {
      redirectWithAlert(
        "error",
        `น้ำหนักรวมต้องเท่ากับ 100% ตอนนี้รวมได้ ${totalWeight.toFixed(2)}%`,
      );
    }

    const round = await validateRoundCanEdit(roundId);
    await validateDivisionCode(divisionCode);

    const pool = await getDbPool();
    const existingWeightSet = await hasExistingWeightSet(roundId, divisionCode);

    if (existingWeightSet && !overwriteConfirmed) {
      redirectWithAlert(
        "warning",
        "พบข้อมูลน้ำหนักผู้ประเมินเดิม กรุณากดยืนยันก่อนบันทึกทับ",
      );
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      await upsertEvaluatorWeight(transaction, {
        roundId,
        divisionCode,
        evaluatorLevel: 1,
        weightPercent: level1Weight,
        createdBy: session.emp_id,
      });

      await upsertEvaluatorWeight(transaction, {
        roundId,
        divisionCode,
        evaluatorLevel: 2,
        weightPercent: level2Weight,
        createdBy: session.emp_id,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      redirectWithAlert("error", getErrorMessage(error));
    }

    revalidatePath("/admin/evaluator-weights");
    redirectWithAlert(
      "success",
      existingWeightSet
        ? `บันทึกทับน้ำหนักผู้ประเมินของรอบ ${round.round_code} เรียบร้อยแล้ว`
        : "บันทึกน้ำหนักผู้ประเมินเรียบร้อยแล้ว",
    );
  }

  async function toggleWeightStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const evaluatorWeightId = Number(formData.get("evaluator_weight_id"));
    const nextActiveStatus = Number(formData.get("active_status"));

    if (!Number.isInteger(evaluatorWeightId) || evaluatorWeightId <= 0) {
      redirectWithAlert("error", "ไม่พบรายการน้ำหนักผู้ประเมินที่ต้องการแก้ไข");
    }

    if (nextActiveStatus !== 0 && nextActiveStatus !== 1) {
      redirectWithAlert("error", "สถานะที่ต้องการเปลี่ยนไม่ถูกต้อง");
    }

    const pool = await getDbPool();

    const rowResult = await pool
      .request()
      .input("evaluator_weight_id", sql.Int, evaluatorWeightId).query(`
        SELECT TOP 1
          w.evaluator_weight_id,
          w.round_id,
          r.round_code,
          r.status_type AS round_status_type,
          ISNULL(w.division_code, '') AS division_code,
          w.evaluator_level,
          CAST(w.weight_percent AS decimal(5, 2)) AS weight_percent
        FROM dbo.competency_evaluator_weight w
        JOIN dbo.competency_round r
          ON r.round_id = w.round_id
        WHERE w.evaluator_weight_id = @evaluator_weight_id;
      `);

    const weightRow = rowResult.recordset[0] as EvaluatorWeightRow | undefined;

    if (!weightRow) {
      redirectWithAlert("error", "ไม่พบรายการน้ำหนักผู้ประเมินที่ต้องการแก้ไข");
    }

    if (Number(weightRow.round_status_type) !== 0) {
      redirectWithAlert(
        "error",
        roundCannotEditMessage(
          weightRow.round_code,
          Number(weightRow.round_status_type),
        ),
      );
    }

    if (nextActiveStatus === 1) {
      const totalResult = await pool
        .request()
        .input("round_id", sql.Int, weightRow.round_id)
        .input(
          "division_code",
          sql.VarChar(20),
          normalizeDivisionCode(weightRow.division_code),
        )
        .input("evaluator_level", sql.TinyInt, weightRow.evaluator_level)
        .query(`
          SELECT
            CAST(ISNULL(SUM(weight_percent), 0) AS decimal(6, 2)) AS total_other_weight
          FROM dbo.competency_evaluator_weight
          WHERE round_id = @round_id
            AND ISNULL(LTRIM(RTRIM(division_code)), '') = @division_code
            AND evaluator_level <> @evaluator_level
            AND active_status = 1;
        `);

      const totalOtherWeight = Number(
        totalResult.recordset[0]?.total_other_weight || 0,
      );
      const nextTotalWeight =
        totalOtherWeight + Number(weightRow.weight_percent || 0);

      if (nextTotalWeight > 100.01) {
        redirectWithAlert(
          "error",
          `ไม่สามารถเปิดใช้งานได้ เพราะน้ำหนักรวมจะเกิน 100% รวมแล้ว ${nextTotalWeight.toFixed(2)}%`,
        );
      }
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      if (nextActiveStatus === 1) {
        await new sql.Request(transaction)
          .input("round_id", sql.Int, weightRow.round_id)
          .input(
            "division_code",
            sql.VarChar(20),
            normalizeDivisionCode(weightRow.division_code),
          )
          .input("evaluator_level", sql.TinyInt, weightRow.evaluator_level)
          .input("evaluator_weight_id", sql.Int, evaluatorWeightId).query(`
            UPDATE dbo.competency_evaluator_weight
            SET active_status = 0
            WHERE round_id = @round_id
              AND ISNULL(LTRIM(RTRIM(division_code)), '') = @division_code
              AND evaluator_level = @evaluator_level
              AND evaluator_weight_id <> @evaluator_weight_id;
          `);
      }

      await new sql.Request(transaction)
        .input("evaluator_weight_id", sql.Int, evaluatorWeightId)
        .input("active_status", sql.Bit, nextActiveStatus === 1).query(`
          UPDATE dbo.competency_evaluator_weight
          SET active_status = @active_status
          WHERE evaluator_weight_id = @evaluator_weight_id;
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      redirectWithAlert("error", getErrorMessage(error));
    }

    revalidatePath("/admin/evaluator-weights");
    redirectWithAlert(
      "success",
      nextActiveStatus === 1
        ? "เปิดใช้งานน้ำหนักผู้ประเมินเรียบร้อยแล้ว"
        : "ปิดใช้งานน้ำหนักผู้ประเมินเรียบร้อยแล้ว",
    );
  }

  const [rounds, divisions, weights] = await Promise.all([
    getRoundOptions(),
    getDivisionOptions(),
    getEvaluatorWeights(),
  ]);

  const draftRounds = rounds.filter((round) => Number(round.status_type) === 0);

  const roundSelectOptions = draftRounds.map((round) => ({
    value: String(round.round_id),
    label: `${round.round_code} - ${roundStatusText(round.status_type)}`,
  }));

  const scopeSelectOptions = [
    { value: "__DEFAULT__", label: "ค่า default ทุกกลุ่มภารกิจ" },
    ...divisions.map((division) => ({
      value: division.code,
      label: `${division.divisionname} (${division.code})`,
    })),
  ];

  const existingWeightRules = Array.from(
    new Map(
      weights.map((weight) => {
        const scopeValue = normalizeDivisionCode(weight.division_code) || "__DEFAULT__";
        const key = `${weight.round_id}|${scopeValue}`;

        return [
          key,
          {
            round_id: weight.round_id,
            scope_value: scopeValue,
          },
        ];
      }),
    ).values(),
  );

  const rowRoundFilterOptions = Array.from(
    new Map(
      weights.map((weight) => [
        String(weight.round_id),
        {
          value: String(weight.round_id),
          label: weight.round_code,
        },
      ]),
    ).values(),
  );

  const rowDivisionFilterOptions = Array.from(
    new Map(
      weights.map((weight) => {
        const normalizedDivisionCode = normalizeDivisionCode(
          weight.division_code,
        );
        const filterValue = normalizedDivisionCode || "__DEFAULT__";

        return [
          filterValue,
          {
            value: filterValue,
            label: divisionDisplayText(
              weight.division_code,
              weight.division_name,
            ),
          },
        ];
      }),
    ).values(),
  );

  const activeGroupTotals = weights.reduce<Record<string, number>>(
    (result, weight) => {
      if (!weight.active_status) return result;

      const key = `${weight.round_id}|${normalizeDivisionCode(weight.division_code)}`;
      result[key] = Number(
        ((result[key] || 0) + Number(weight.weight_percent || 0)).toFixed(2),
      );

      return result;
    },
    {},
  );

  return (
    <div>
      <ActionAlert
        type={alertParams?.alert_type}
        message={alertParams?.alert_message}
      />

      <PageHeader
        title="กำหนดน้ำหนักผู้ประเมิน"
        description="กำหนดสัดส่วนคะแนนของหัวหน้าใกล้ชิดและหัวหน้าใหญ่ แก้ไขได้เฉพาะรอบที่ยังเป็นร่าง"
      />

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            บันทึกน้ำหนักผู้ประเมิน
          </h2>
        </div>

        <EvaluatorWeightForm
          roundOptions={roundSelectOptions}
          scopeOptions={scopeSelectOptions}
          existingWeightRules={existingWeightRules}
          saveWeightSetAction={saveWeightSet}
        />

        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
          เลือกขอบเขตจาก dropdown เดียวได้เลย ถ้าเลือกค่า default จะใช้เป็นน้ำหนักกลางของรอบประเมิน
          แต่ถ้าเลือกกลุ่มภารกิจ ระบบจะใช้เป็นน้ำหนักเฉพาะกลุ่มภารกิจนั้น และการแก้ไขทำได้เฉพาะรอบสถานะร่างเท่านั้น
        </div>
      </div>

      <DataTable
        headers={[
          "รอบประเมิน",
          "ขอบเขต",
          "ผู้ประเมิน",
          "น้ำหนัก",
          "รวมขอบเขต",
          "สถานะ",
          "จัดการ",
        ]}
        searchPlaceholder="ค้นหารอบ / กลุ่มภารกิจ / ระดับผู้ประเมิน..."
        emptyText="ยังไม่มีข้อมูลน้ำหนักผู้ประเมิน"
        filters={[
          {
            key: "round",
            label: "รอบประเมิน",
            options: rowRoundFilterOptions,
          },
          {
            key: "division",
            label: "ขอบเขต",
            options: rowDivisionFilterOptions,
          },
          {
            key: "level",
            label: "ผู้ประเมิน",
            options: [
              { value: "1", label: "หัวหน้าใกล้ชิด" },
              { value: "2", label: "หัวหน้าใหญ่" },
            ],
          },
          {
            key: "status",
            label: "สถานะ",
            options: [
              { value: "1", label: "ใช้งาน" },
              { value: "0", label: "ปิดใช้งาน" },
            ],
          },
        ]}
      >
        {weights.map((weight) => {
          const normalizedDivisionCode = normalizeDivisionCode(
            weight.division_code,
          );
          const divisionFilterValue = normalizedDivisionCode || "__DEFAULT__";
          const groupTotalKey = `${weight.round_id}|${normalizedDivisionCode}`;
          const groupTotal = activeGroupTotals[groupTotalKey] || 0;

          return (
            <tr
              key={weight.evaluator_weight_id}
              data-search={`${weight.round_code} ${divisionDisplayText(weight.division_code, weight.division_name)} ${evaluatorLevelText(weight.evaluator_level)} ${weight.weight_percent} ${weight.active_status ? "ใช้งาน" : "ปิดใช้งาน"}`}
              data-filter-round={String(weight.round_id)}
              data-filter-division={divisionFilterValue}
              data-filter-level={String(weight.evaluator_level)}
              data-filter-status={weight.active_status ? "1" : "0"}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {weight.round_code}
                  </span>
                  <RoundStatusBadge
                    statusType={Number(weight.round_status_type)}
                  />
                </div>
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {divisionDisplayText(weight.division_code, weight.division_name)}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex flex-col gap-1">
                  <span>{evaluatorLevelText(weight.evaluator_level)}</span>
                  <span className="text-xs text-gray-400">
                    level {weight.evaluator_level}
                  </span>
                </div>
              </td>

              <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                {Number(weight.weight_percent || 0).toFixed(2)}%
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <WeightTotalBadge total={groupTotal} />
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <ActiveStatusBadge active={Boolean(weight.active_status)} />
              </td>

              <td className="px-5 py-4 text-sm">
                {Number(weight.round_status_type) !== 0 ? (
                  <span className="inline-flex rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    ล็อกแล้ว
                  </span>
                ) : (
                  <form action={toggleWeightStatus}>
                    <input
                      type="hidden"
                      name="evaluator_weight_id"
                      value={weight.evaluator_weight_id}
                    />
                    <input
                      type="hidden"
                      name="active_status"
                      value={weight.active_status ? 0 : 1}
                    />

                    <button
                      className={
                        weight.active_status
                          ? redActionButtonClass
                          : greenActionButtonClass
                      }
                    >
                      {weight.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
