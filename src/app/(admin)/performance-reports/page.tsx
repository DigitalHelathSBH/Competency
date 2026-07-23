import PerformanceReportTable, {
  type PerformanceReportRow,
  type PerformanceReportStatus,
} from "@/components/competency/PerformanceReportTable";
import PageHeader from "@/components/competency/PageHeader";
import {
  type CompetencyReportData,
  type CompetencyReportRound,
  getWeightedReport,
} from "@/lib/competency";
import {
  getDbPool,
  getSsbDatabaseName,
  quoteSqlName,
  sql,
} from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PERFORMANCE_REPORT_ROUND_COOKIE =
  "performance_report_round_id";

type RoundOption = CompetencyReportRound;

type RoundEmployeeInfo = {
  payroll_no: string;
  employee_full_name: string;
  round_code: string;
  division_code: string;
  division_name: string;
  section_code: string;
  section_name: string;
  competency_percent: number | null;
};

type KpiPerformanceRow = {
  payroll_no: string;
  form_code: string;
  form_name: string;
  evaluator_payroll_no: string;
  evaluator_full_name: string;
  evaluation_status_type: number | null;
  total_kpi_score: number | null;
};

function ssbDb() {
  return quoteSqlName(
    getSsbDatabaseName(),
  );
}

function useSecureCookie() {
  const configured = String(
    process.env.COOKIE_SECURE || "",
  )
    .trim()
    .toLowerCase();

  if (configured === "true") return true;
  if (configured === "false") return false;

  return process.env.NODE_ENV ===
    "production";
}

function emptyCompetencyReport(
  rounds: RoundOption[] = [],
  selectedRound: RoundOption | null = null,
): CompetencyReportData {
  return {
    rounds,
    selected_round: selectedRound,
    summary: {
      total_employee_count: 0,
      completed_employee_count: 0,
      pending_employee_count: 0,
      weight_issue_count: 0,
      average_final_score: null,
      average_competency_score: null,
    },
    division_summary: [],
    rows: [],
  };
}

function roundStatusText(
  statusType: number,
) {
  if (statusType === 1) {
    return "กำลังประเมิน";
  }

  if (statusType === 2) {
    return "ปิดรอบ";
  }

  return "ร่าง";
}

async function getKpiRounds(
  payrollNo: string,
  isAdmin: boolean,
) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "payroll_no",
      sql.VarChar(20),
      payrollNo,
    )
    .input(
      "is_admin",
      sql.Bit,
      isAdmin,
    )
    .query(`
      SELECT DISTINCT
        r.round_id,
        r.round_year,
        r.round_no,
        r.round_code,
        r.status_type,
        CASE
          WHEN r.status_type = 1 THEN 0
          ELSE 1
        END AS status_sort,
        CONVERT(
          varchar(10),
          r.start_date,
          120
        ) AS start_date,
        CONVERT(
          varchar(10),
          r.end_date,
          120
        ) AS end_date
      FROM dbo.kpi_evaluator_assignment k
      JOIN dbo.competency_round_employee re
        ON re.round_employee_id =
           k.round_employee_id
       AND re.status_type <> 9
      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
       AND r.status_type IN (1, 2)
      WHERE k.status_type = 0
        AND
        (
          @is_admin = 1
          OR LTRIM(
               RTRIM(
                 k.evaluator_payroll_no
               )
             ) = @payroll_no
        )
      ORDER BY
        status_sort,
        r.round_year DESC,
        r.round_no DESC,
        r.round_id DESC;
    `);

  return result.recordset.map((row) => ({
    round_id: Number(row.round_id),
    round_year: Number(
      row.round_year,
    ),
    round_no: Number(row.round_no),
    round_code: String(
      row.round_code || "",
    ).trim(),
    status_type: Number(
      row.status_type,
    ),
    start_date:
      String(
        row.start_date || "",
      ).trim() || null,
    end_date:
      String(
        row.end_date || "",
      ).trim() || null,
  })) as RoundOption[];
}

function mergeRounds(
  competencyRounds: RoundOption[],
  kpiRounds: RoundOption[],
) {
  const map = new Map<
    number,
    RoundOption
  >();

  for (const round of [
    ...competencyRounds,
    ...kpiRounds,
  ]) {
    map.set(round.round_id, round);
  }

  return Array.from(map.values()).sort(
    (first, second) => {
      const firstOpen =
        first.status_type === 1 ? 0 : 1;
      const secondOpen =
        second.status_type === 1 ? 0 : 1;

      return (
        firstOpen -
          secondOpen ||
        second.round_year -
          first.round_year ||
        second.round_no -
          first.round_no ||
        second.round_id -
          first.round_id
      );
    },
  );
}

async function getRoundEmployeeInfo(
  roundId: number,
  payrollNo: string,
  isAdmin: boolean,
) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "round_id",
      sql.Int,
      roundId,
    )
    .input(
      "payroll_no",
      sql.VarChar(20),
      payrollNo,
    )
    .input(
      "is_admin",
      sql.Bit,
      isAdmin,
    )
    .query(`
      SELECT
        LTRIM(
          RTRIM(
            CAST(
              re.payroll_no
              AS varchar(20)
            )
          )
        ) AS payroll_no,

        ${ssbDb()}.dbo.GetUserFullName(
          re.payroll_no
        ) AS employee_full_name,

        r.round_code,

        ISNULL(
          LTRIM(
            RTRIM(
              CAST(
                re.division_code
                AS varchar(20)
              )
            )
          ),
          ''
        ) AS division_code,

        ISNULL(
          ${ssbDb()}.dbo.GetSSBName(
            ISNULL(
              division_ref.thainame,
              division_ref.englishname
            )
          ),
          N''
        ) AS division_name,

        ISNULL(
          LTRIM(
            RTRIM(
              CAST(
                re.section_code
                AS varchar(20)
              )
            )
          ),
          ''
        ) AS section_code,

        ISNULL(
          NULLIF(
            LTRIM(
              RTRIM(
                section_ref.ThaiName
              )
            ),
            N''
          ),
          N''
        ) AS section_name,

        CAST(
          re.competency_percent
          AS decimal(5,2)
        ) AS competency_percent

      FROM dbo.competency_round_employee re

      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
       AND r.status_type <> 9

      LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG
        division_ref
        ON division_ref.CODE =
           re.division_code
       AND division_ref.CTRLCODE =
           '10028'

      LEFT JOIN ${ssbDb()}.dbo.sectioncode
        section_ref
        ON LTRIM(
             RTRIM(
               CAST(
                 section_ref.Code
                 AS varchar(20)
               )
             )
           )
         =
           LTRIM(
             RTRIM(
               CAST(
                 re.section_code
                 AS varchar(20)
               )
             )
           )

      WHERE re.round_id = @round_id
        AND re.status_type <> 9
        AND
        (
          @is_admin = 1

          OR EXISTS
          (
            SELECT 1
            FROM dbo.competency_evaluator_assignment
              competency_assignment
            WHERE competency_assignment
                    .round_employee_id =
                  re.round_employee_id
              AND competency_assignment
                    .status_type <> 9
              AND LTRIM(
                    RTRIM(
                      competency_assignment
                        .evaluator_payroll_no
                    )
                  ) = @payroll_no
          )

          OR EXISTS
          (
            SELECT 1
            FROM dbo.kpi_evaluator_assignment
              kpi_assignment
            WHERE kpi_assignment
                    .round_employee_id =
                  re.round_employee_id
              AND kpi_assignment
                    .status_type = 0
              AND LTRIM(
                    RTRIM(
                      kpi_assignment
                        .evaluator_payroll_no
                    )
                  ) = @payroll_no
          )
        )

      ORDER BY
        division_name,
        section_name,
        employee_full_name,
        payroll_no;
    `);

  return result.recordset.map((row) => ({
    payroll_no: String(
      row.payroll_no || "",
    ).trim(),
    employee_full_name: String(
      row.employee_full_name ||
        row.payroll_no ||
        "",
    ).trim(),
    round_code: String(
      row.round_code || "",
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
    competency_percent:
      row.competency_percent === null ||
      row.competency_percent ===
        undefined
        ? null
        : Number(
            row.competency_percent,
          ),
  })) as RoundEmployeeInfo[];
}

async function getKpiRows(
  roundId: number,
  payrollNo: string,
  isAdmin: boolean,
) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "round_id",
      sql.Int,
      roundId,
    )
    .input(
      "payroll_no",
      sql.VarChar(20),
      payrollNo,
    )
    .input(
      "is_admin",
      sql.Bit,
      isAdmin,
    )
    .query(`
      SELECT
        LTRIM(
          RTRIM(
            CAST(
              re.payroll_no
              AS varchar(20)
            )
          )
        ) AS payroll_no,

        f.form_code,
        f.form_name,

        LTRIM(
          RTRIM(
            k.evaluator_payroll_no
          )
        ) AS evaluator_payroll_no,

        ${ssbDb()}.dbo.GetUserFullName(
          k.evaluator_payroll_no
        ) AS evaluator_full_name,

        latest_evaluation.status_type
          AS evaluation_status_type,

        latest_evaluation
          .total_kpi_score

      FROM dbo.kpi_evaluator_assignment k

      JOIN dbo.competency_round_employee re
        ON re.round_employee_id =
           k.round_employee_id
       AND re.status_type <> 9

      JOIN dbo.competency_round r
        ON r.round_id = re.round_id
       AND r.status_type <> 9

      JOIN dbo.kpi_employee_form ef
        ON ef.round_employee_id =
           re.round_employee_id
       AND ef.status_type = 0

      JOIN dbo.kpi_form_version fv
        ON fv.form_version_id =
           ef.form_version_id

      JOIN dbo.kpi_form f
        ON f.form_id = fv.form_id

      OUTER APPLY
      (
        SELECT TOP (1)
          ev.status_type,
          ev.total_kpi_score
        FROM dbo.kpi_evaluation ev
        WHERE ev.employee_form_id =
              ef.employee_form_id
          AND ev.kpi_assignment_id =
              k.kpi_assignment_id
          AND ev.status_type <> 9
        ORDER BY
          ev.evaluation_id DESC
      ) latest_evaluation

      WHERE re.round_id = @round_id
        AND k.status_type = 0
        AND
        (
          @is_admin = 1
          OR LTRIM(
               RTRIM(
                 k.evaluator_payroll_no
               )
             ) = @payroll_no
        );
    `);

  return result.recordset.map((row) => ({
    payroll_no: String(
      row.payroll_no || "",
    ).trim(),
    form_code: String(
      row.form_code || "",
    ).trim(),
    form_name: String(
      row.form_name || "",
    ).trim(),
    evaluator_payroll_no: String(
      row.evaluator_payroll_no || "",
    ).trim(),
    evaluator_full_name: String(
      row.evaluator_full_name ||
        row.evaluator_payroll_no ||
        "",
    ).trim(),
    evaluation_status_type:
      row.evaluation_status_type ===
        null ||
      row.evaluation_status_type ===
        undefined
        ? null
        : Number(
            row.evaluation_status_type,
          ),
    total_kpi_score:
      row.total_kpi_score === null ||
      row.total_kpi_score ===
        undefined
        ? null
        : Number(
            row.total_kpi_score,
          ),
  })) as KpiPerformanceRow[];
}

function round2(value: number) {
  return (
    Math.round(
      (value + Number.EPSILON) * 100,
    ) / 100
  );
}

function mergeReportRows(
  employeeRows: RoundEmployeeInfo[],
  competencyReport: CompetencyReportData,
  kpiRows: KpiPerformanceRow[],
) {
  const employeeMap = new Map(
    employeeRows.map((row) => [
      row.payroll_no,
      row,
    ]),
  );

  const competencyMap = new Map(
    competencyReport.rows.map((row) => [
      String(
        row.payroll_no || "",
      ).trim(),
      row,
    ]),
  );

  const kpiMap = new Map(
    kpiRows.map((row) => [
      row.payroll_no,
      row,
    ]),
  );

  const payrollNos = new Set([
    ...employeeMap.keys(),
    ...competencyMap.keys(),
    ...kpiMap.keys(),
  ]);

  const rows: PerformanceReportRow[] = [];

  for (const payrollNo of payrollNos) {
    const employee =
      employeeMap.get(payrollNo);
    const competency =
      competencyMap.get(payrollNo);
    const kpi = kpiMap.get(payrollNo);

    const competencyPercent =
      employee?.competency_percent ??
      (competency?.competency_percent ===
        null ||
      competency?.competency_percent ===
        undefined
        ? null
        : Number(
            competency.competency_percent,
          ));

    const percentIsValid =
      competencyPercent !== null &&
      Number.isFinite(
        competencyPercent,
      ) &&
      competencyPercent >= 0 &&
      competencyPercent <= 100;

    const kpiPercent =
      percentIsValid
        ? round2(
            100 -
              Number(
                competencyPercent,
              ),
          )
        : null;

    const competencyCompleted =
      competency?.report_status ===
      "ประเมินครบ";

    const competencyWeightIssue =
      competency?.report_status ===
      "น้ำหนักไม่ครบ 100%";

    const finalScore =
      competency?.final_score === null ||
      competency?.final_score ===
        undefined
        ? null
        : Number(
            competency.final_score,
          );

    const maxPossibleScore =
      competency?.max_possible_score ===
        null ||
      competency?.max_possible_score ===
        undefined
        ? null
        : Number(
            competency.max_possible_score,
          );

    const competencyRawScore =
      competencyCompleted &&
      finalScore !== null &&
      maxPossibleScore !== null &&
      maxPossibleScore > 0
        ? round2(
            (finalScore /
              maxPossibleScore) *
              100,
          )
        : null;

    const competencyReady =
      percentIsValid &&
      (
        Number(
          competencyPercent,
        ) === 0 ||
        competencyCompleted
      );

    const kpiReady =
      percentIsValid &&
      (
        Number(kpiPercent) === 0 ||
        kpi?.evaluation_status_type === 1
      );

    const competencyComponent =
      percentIsValid &&
      Number(
        competencyPercent,
      ) === 0
        ? 0
        : competencyReady &&
            competencyRawScore !== null
          ? round2(
              competencyRawScore *
                Number(
                  competencyPercent,
                ) /
                100,
            )
          : null;

    const kpiRawScore =
      kpi?.total_kpi_score === null ||
      kpi?.total_kpi_score ===
        undefined
        ? null
        : Number(
            kpi.total_kpi_score,
          );

    const kpiComponent =
      percentIsValid &&
      Number(kpiPercent) === 0
        ? 0
        : kpiReady &&
            kpiRawScore !== null
          ? round2(
              kpiRawScore *
                Number(kpiPercent) /
                100,
            )
          : null;

    let reportStatus: PerformanceReportStatus;

    if (!percentIsValid) {
      reportStatus =
        "invalid_percent";
    } else if (
      Number(
        competencyPercent,
      ) > 0 &&
      competencyWeightIssue
    ) {
      reportStatus =
        "competency_weight_issue";
    } else if (
      competencyReady &&
      kpiReady
    ) {
      reportStatus = "complete";
    } else if (
      !competencyReady &&
      !kpiReady
    ) {
      reportStatus = "pending_both";
    } else if (!competencyReady) {
      reportStatus =
        "pending_competency";
    } else {
      reportStatus = "pending_kpi";
    }

    const totalScore =
      reportStatus === "complete" &&
      competencyComponent !== null &&
      kpiComponent !== null
        ? round2(
            competencyComponent +
              kpiComponent,
          )
        : null;

    rows.push({
      payroll_no: payrollNo,
      employee_full_name:
        employee?.employee_full_name ||
        competency
          ?.employee_full_name ||
        payrollNo,
      round_code:
        employee?.round_code ||
        competency?.round_code ||
        "",
      division_code:
        employee?.division_code ||
        String(
          competency?.division_code ||
            "",
        ).trim(),
      division_name:
        employee?.division_name ||
        String(
          competency?.division_name ||
            "",
        ).trim(),
      section_code:
        employee?.section_code ||
        String(
          competency?.section_code ||
            "",
        ).trim(),
      section_name:
        employee?.section_name ||
        String(
          competency?.section_name ||
            "",
        ).trim(),

      competency_percent:
        percentIsValid
          ? Number(
              competencyPercent,
            )
          : null,
      kpi_percent: kpiPercent,

      competency_report_status:
        Number(
          competencyPercent,
        ) === 0
          ? "ไม่ใช้คะแนนส่วนนี้"
          : competency?.report_status ||
            "ยังไม่มีผล Competency",

      competency_expected_count:
        Number(
          competency
            ?.expected_evaluator_count ||
            0,
        ),

      competency_submitted_count:
        Number(
          competency
            ?.submitted_evaluator_count ||
            0,
        ),

      competency_evaluator_weight_total:
        competency?.weight_total ===
          null ||
        competency?.weight_total ===
          undefined
          ? null
          : Number(
              competency.weight_total,
            ),

      competency_raw_score:
        competencyRawScore,

      competency_component_score:
        competencyComponent,

      kpi_evaluation_status_type:
        kpi?.evaluation_status_type ??
        null,

      kpi_raw_score: kpiRawScore,
      kpi_component_score:
        kpiComponent,

      kpi_form_code:
        kpi?.form_code || "",
      kpi_form_name:
        kpi?.form_name || "",

      kpi_evaluator_payroll_no:
        kpi?.evaluator_payroll_no ||
        "",

      kpi_evaluator_full_name:
        kpi?.evaluator_full_name ||
        "",

      total_score: totalScore,
      report_status: reportStatus,
    });
  }

  return rows.sort(
    (first, second) =>
      first.division_name.localeCompare(
        second.division_name,
        "th",
      ) ||
      first.employee_full_name.localeCompare(
        second.employee_full_name,
        "th",
      ),
  );
}

export default async function PerformanceReportsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();

  const requestedRoundId = Number(
    cookieStore.get(
      PERFORMANCE_REPORT_ROUND_COOKIE,
    )?.value || 0,
  );

  const evaluatorFilter =
    session.is_admin
      ? null
      : session.emp_id;

  const [competencySeed, kpiRounds] =
    await Promise.all([
      getWeightedReport(
        requestedRoundId > 0
          ? requestedRoundId
          : null,
        evaluatorFilter,
      ),
      getKpiRounds(
        session.emp_id,
        session.is_admin,
      ),
    ]);

  const rounds = mergeRounds(
    competencySeed.rounds,
    kpiRounds,
  );

  const selectedRound =
    rounds.find(
      (round) =>
        round.round_id ===
        requestedRoundId,
    ) ||
    rounds[0] ||
    null;

  let competencyReport =
    emptyCompetencyReport();

  if (
    selectedRound &&
    competencySeed.rounds.some(
      (round) =>
        round.round_id ===
        selectedRound.round_id,
    )
  ) {
    if (
      competencySeed.selected_round
        ?.round_id ===
      selectedRound.round_id
    ) {
      competencyReport =
        competencySeed;
    } else {
      competencyReport =
        await getWeightedReport(
          selectedRound.round_id,
          evaluatorFilter,
        );
    }
  }

  const [employeeRows, kpiRows] =
    selectedRound
      ? await Promise.all([
          getRoundEmployeeInfo(
            selectedRound.round_id,
            session.emp_id,
            session.is_admin,
          ),
          getKpiRows(
            selectedRound.round_id,
            session.emp_id,
            session.is_admin,
          ),
        ])
      : [
          [] as RoundEmployeeInfo[],
          [] as KpiPerformanceRow[],
        ];

  const rows = selectedRound
    ? mergeReportRows(
        employeeRows,
        competencyReport,
        kpiRows,
      )
    : [];

  async function selectRoundAction(
    formData: FormData,
  ) {
    "use server";

    const currentSession =
      await requireSession();

    const roundId = Number(
      formData.get("round_id") || 0,
    );

    const [
      currentCompetency,
      currentKpiRounds,
    ] = await Promise.all([
      getWeightedReport(
        null,
        currentSession.is_admin
          ? null
          : currentSession.emp_id,
      ),
      getKpiRounds(
        currentSession.emp_id,
        currentSession.is_admin,
      ),
    ]);

    const allowedRounds = mergeRounds(
      currentCompetency.rounds,
      currentKpiRounds,
    );

    const allowed =
      allowedRounds.some(
        (round) =>
          round.round_id === roundId,
      );

    const currentCookieStore =
      await cookies();

    if (allowed) {
      currentCookieStore.set(
        PERFORMANCE_REPORT_ROUND_COOKIE,
        String(roundId),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: useSecureCookie(),
          maxAge: 60 * 60 * 8,
          path: "/",
        },
      );
    } else {
      currentCookieStore.delete(
        PERFORMANCE_REPORT_ROUND_COOKIE,
      );
    }

    redirect("/performance-reports");
  }

  return (
    <div>
      <PageHeader
        title={
          session.is_admin
            ? "ผลรวมการประเมิน"
            : "ผลรวมของคนที่ฉันประเมิน"
        }
        description="รวมคะแนน Competency และ KPI โดยใช้สัดส่วนรายบุคคลที่บันทึกไว้ในรอบประเมิน"
      />

      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <form
          action={selectRoundAction}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              รอบประเมิน
            </label>

            <select
              name="round_id"
              defaultValue={
                selectedRound?.round_id ||
                ""
              }
              disabled={
                rounds.length === 0
              }
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
            >
              {rounds.length === 0 ? (
                <option value="">
                  ยังไม่มีข้อมูลที่เข้าถึงได้
                </option>
              ) : (
                rounds.map((round) => (
                  <option
                    key={round.round_id}
                    value={round.round_id}
                  >
                    {round.round_code} (
                    {roundStatusText(
                      round.status_type,
                    )}
                    )
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="submit"
            disabled={
              rounds.length === 0
            }
            className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            แสดงรายงาน
          </button>
        </form>
      </div>

      {selectedRound ? (
        <PerformanceReportTable
          rows={rows}
          isAdmin={session.is_admin}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          ยังไม่มีรอบประเมินที่มีข้อมูล Competency หรือ KPI
        </div>
      )}
    </div>
  );
}