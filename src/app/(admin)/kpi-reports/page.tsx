import KpiReportTable, {
  type KpiReportDetail,
  type KpiReportRow,
} from "@/components/competency/KpiReportTable";
import PageHeader from "@/components/competency/PageHeader";
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

const KPI_REPORT_ROUND_COOKIE =
  "kpi_report_round_id";

type KpiReportRound = {
  round_id: number;
  round_code: string;
  status_type: number;
};

type KpiReportRowRecord = Record<
  string,
  unknown
>;

type KpiReportDetailRecord = Record<
  string,
  unknown
>;

function ssbDb() {
  return quoteSqlName(
    getSsbDatabaseName(),
  );
}

function shouldUseSecureCookie() {
  const configuredValue = String(
    process.env.COOKIE_SECURE || "",
  )
    .trim()
    .toLowerCase();

  if (configuredValue === "true") {
    return true;
  }

  if (configuredValue === "false") {
    return false;
  }

  return process.env.NODE_ENV ===
    "production";
}

function roundStatusText(
  statusType: number,
) {
  if (statusType === 0) return "ร่าง";
  if (statusType === 1) {
    return "เปิดประเมิน";
  }
  if (statusType === 2) return "ปิดรอบ";
  return "ไม่ทราบสถานะ";
}

async function getReportRounds(
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
        r.round_code,
        r.status_type,
        r.round_year,
        r.round_no
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
        r.round_year DESC,
        r.round_no DESC,
        r.round_id DESC;
    `);

  return result.recordset.map((row) => ({
    round_id: Number(row.round_id),
    round_code: String(
      row.round_code || "",
    ).trim(),
    status_type: Number(
      row.status_type,
    ),
  })) as KpiReportRound[];
}

async function getReportRows(
  roundId: number,
  payrollNo: string,
  isAdmin: boolean,
) {
  if (!roundId) {
    return [] as KpiReportRow[];
  }

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
      SET NOCOUNT ON;

      CREATE TABLE #report_base
      (
        kpi_assignment_id bigint NOT NULL
          PRIMARY KEY,
        evaluation_id bigint NULL,
        form_version_id bigint NOT NULL,
        round_code varchar(100) NOT NULL,
        employee_payroll_no varchar(20) NOT NULL,
        employee_full_name nvarchar(500) NULL,
        division_code varchar(20) NULL,
        division_name nvarchar(500) NULL,
        section_code varchar(20) NULL,
        section_name nvarchar(500) NULL,
        form_code varchar(20) NOT NULL,
        form_name nvarchar(500) NOT NULL,
        evaluator_payroll_no varchar(20) NOT NULL,
        evaluator_full_name nvarchar(500) NULL,
        item_count int NOT NULL,
        completed_item_count int NOT NULL,
        evaluation_status_type tinyint NULL,
        total_kpi_score decimal(7,2) NULL,
        submitted_date varchar(19) NULL
      );

      INSERT INTO #report_base
      (
        kpi_assignment_id,
        evaluation_id,
        form_version_id,
        round_code,
        employee_payroll_no,
        employee_full_name,
        division_code,
        division_name,
        section_code,
        section_name,
        form_code,
        form_name,
        evaluator_payroll_no,
        evaluator_full_name,
        item_count,
        completed_item_count,
        evaluation_status_type,
        total_kpi_score,
        submitted_date
      )
      SELECT
        k.kpi_assignment_id,
        evaluation_summary.evaluation_id,
        fv.form_version_id,
        r.round_code,
        LTRIM(
          RTRIM(
            CAST(
              re.payroll_no AS varchar(20)
            )
          )
        ) AS employee_payroll_no,
        employee_name.full_name
          AS employee_full_name,
        NULLIF(
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
        ${ssbDb()}.dbo.GetSSBName(
          ISNULL(
            division_ref.thainame,
            division_ref.englishname
          )
        ) AS division_name,
        NULLIF(
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
        NULLIF(
          LTRIM(
            RTRIM(
              section_ref.ThaiName
            )
          ),
          N''
        ) AS section_name,
        f.form_code,
        f.form_name,
        LTRIM(
          RTRIM(
            k.evaluator_payroll_no
          )
        ) AS evaluator_payroll_no,
        evaluator_name.full_name
          AS evaluator_full_name,
        ISNULL(
          item_summary.item_count,
          0
        ) AS item_count,
        ISNULL(
          evaluation_summary
            .completed_item_count,
          0
        ) AS completed_item_count,
        evaluation_summary.status_type,
        evaluation_summary.total_kpi_score,
        CONVERT(
          varchar(19),
          evaluation_summary.submitted_date,
          120
        ) AS submitted_date
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
      OUTER APPLY
    (
      SELECT TOP (1)
        NULLIF(
          LTRIM(
            RTRIM(
              ISNULL(
                ${ssbDb()}.dbo.GetSSBName(
                  employee_pyrext.FIRSTTHAINAME
                ),
                N''
              )
              + N' '
              + ISNULL(
                  ${ssbDb()}.dbo.GetSSBName(
                    employee_pyrext.LASTTHAINAME
                  ),
                  N''
                )
            )
          ),
          N''
        )
          AS full_name
      FROM ${ssbDb()}.dbo.PYREXT employee_pyrext
      WHERE LTRIM(
              RTRIM(
                CAST(
                  employee_pyrext.PAYROLLNO
                  AS varchar(20)
                )
              )
            )
          =
            LTRIM(
              RTRIM(
                CAST(
                  re.payroll_no
                  AS varchar(20)
                )
              )
            )
      ORDER BY
        CASE
          WHEN employee_pyrext.TERMINATEDATE IS NULL
          THEN 0
          ELSE 1
        END
    ) employee_name
      OUTER APPLY
    (
      SELECT TOP (1)
        NULLIF(
          LTRIM(
            RTRIM(
              ISNULL(
                ${ssbDb()}.dbo.GetSSBName(
                  evaluator_pyrext.FIRSTTHAINAME
                ),
                N''
              )
              + N' '
              + ISNULL(
                  ${ssbDb()}.dbo.GetSSBName(
                    evaluator_pyrext.LASTTHAINAME
                  ),
                  N''
                )
            )
          ),
          N''
        )
          AS full_name
      FROM ${ssbDb()}.dbo.PYREXT evaluator_pyrext
      WHERE LTRIM(
              RTRIM(
                CAST(
                  evaluator_pyrext.PAYROLLNO
                  AS varchar(20)
                )
              )
            )
          =
            LTRIM(
              RTRIM(
                CAST(
                  k.evaluator_payroll_no
                  AS varchar(20)
                )
              )
            )
      ORDER BY
        CASE
          WHEN evaluator_pyrext.TERMINATEDATE IS NULL
          THEN 0
          ELSE 1
        END
    ) evaluator_name
      OUTER APPLY
      (
        SELECT
          COUNT(*) AS item_count
        FROM dbo.kpi_form_item fi
        WHERE fi.form_version_id =
              fv.form_version_id
      ) item_summary
      OUTER APPLY
      (
        SELECT TOP (1)
          ev.evaluation_id,
          ev.status_type,
          ev.total_kpi_score,
          ev.submitted_date,
          (
            SELECT COUNT(*)
            FROM dbo.kpi_evaluation_detail ed
            WHERE ed.evaluation_id =
                  ev.evaluation_id
              AND ed.actual_value
                  IS NOT NULL
              AND ed.achieved_level
                  IS NOT NULL
          ) AS completed_item_count
        FROM dbo.kpi_evaluation ev
        WHERE ev.employee_form_id =
              ef.employee_form_id
          AND ev.kpi_assignment_id =
              k.kpi_assignment_id
          AND ev.status_type <> 9
        ORDER BY ev.evaluation_id DESC
      ) evaluation_summary
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

      SELECT
        kpi_assignment_id,
        round_code,
        employee_payroll_no,
        employee_full_name,
        division_code,
        division_name,
        section_code,
        section_name,
        form_code,
        form_name,
        evaluator_payroll_no,
        evaluator_full_name,
        item_count,
        completed_item_count,
        evaluation_status_type,
        total_kpi_score,
        submitted_date
      FROM #report_base
      ORDER BY
        ISNULL(division_name, N''),
        ISNULL(section_name, N''),
        ISNULL(employee_full_name, N''),
        employee_payroll_no;

      SELECT
        base.kpi_assignment_id,
        fi.form_item_id,
        fi.item_order,
        indicator.indicator_code,
        indicator_version.indicator_name,
        fi.weight_percent,
        detail.actual_value,
        detail.achieved_level,
        detail.calculated_score,
        ISNULL(
          detail.evaluator_note,
          N''
        ) AS evaluator_note
      FROM #report_base base
      JOIN dbo.kpi_form_item fi
        ON fi.form_version_id =
           base.form_version_id
      JOIN dbo.kpi_indicator_version
        indicator_version
        ON indicator_version
             .indicator_version_id =
           fi.indicator_version_id
      JOIN dbo.kpi_indicator indicator
        ON indicator.indicator_id =
           indicator_version.indicator_id
      LEFT JOIN dbo.kpi_evaluation_detail
        detail
        ON detail.evaluation_id =
           base.evaluation_id
       AND detail.form_item_id =
           fi.form_item_id
      ORDER BY
        base.kpi_assignment_id,
        fi.item_order;
    `);

  /*
    mssql กำหนดชนิด result.recordsets ได้ทั้งแบบ Object และ Array
    จึงแปลงเป็น Tuple ให้ตรงกับ SELECT ทั้ง 2 ชุดของ Query นี้
  */
  const recordsets =
    result.recordsets as unknown as [
      KpiReportRowRecord[],
      KpiReportDetailRecord[],
    ];

  const rowRecordset =
    recordsets[0] ?? [];
  const detailRecordset =
    recordsets[1] ?? [];

  const detailMap = new Map<
    number,
    KpiReportDetail[]
  >();

  for (const detail of detailRecordset) {
    const assignmentId = Number(
      detail.kpi_assignment_id,
    );
    const current =
      detailMap.get(assignmentId) || [];

    current.push({
      form_item_id: Number(
        detail.form_item_id,
      ),
      item_order: Number(
        detail.item_order,
      ),
      indicator_code: String(
        detail.indicator_code || "",
      ).trim(),
      indicator_name: String(
        detail.indicator_name || "",
      ).trim(),
      weight_percent: Number(
        detail.weight_percent || 0,
      ),
      actual_value:
        detail.actual_value === null ||
        detail.actual_value === undefined
          ? null
          : Number(
              detail.actual_value,
            ),
      achieved_level:
        detail.achieved_level === null ||
        detail.achieved_level === undefined
          ? null
          : Number(
              detail.achieved_level,
            ),
      calculated_score:
        detail.calculated_score === null ||
        detail.calculated_score ===
          undefined
          ? null
          : Number(
              detail.calculated_score,
            ),
      evaluator_note: String(
        detail.evaluator_note || "",
      ).trim(),
    });

    detailMap.set(
      assignmentId,
      current,
    );
  }

  return rowRecordset.map((row) => {
    const assignmentId = Number(
      row.kpi_assignment_id,
    );

    return {
      kpi_assignment_id:
        assignmentId,
      round_code: String(
        row.round_code || "",
      ).trim(),
      employee_payroll_no: String(
        row.employee_payroll_no || "",
      ).trim(),
      employee_full_name: String(
        row.employee_full_name ||
          row.employee_payroll_no ||
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
      item_count: Number(
        row.item_count || 0,
      ),
      completed_item_count: Number(
        row.completed_item_count || 0,
      ),
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
      submitted_date: String(
        row.submitted_date || "",
      ).trim(),
      details:
        detailMap.get(assignmentId) || [],
    };
  }) as KpiReportRow[];
}

export default async function KpiReportsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();

  const rounds = await getReportRounds(
    session.emp_id,
    session.is_admin,
  );

  const cookieRoundId = Number(
    cookieStore.get(
      KPI_REPORT_ROUND_COOKIE,
    )?.value || 0,
  );

  const selectedRound =
    rounds.find(
      (round) =>
        round.round_id === cookieRoundId,
    ) ||
    rounds[0] ||
    null;

  const rows = selectedRound
    ? await getReportRows(
        selectedRound.round_id,
        session.emp_id,
        session.is_admin,
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

    const availableRounds =
      await getReportRounds(
        currentSession.emp_id,
        currentSession.is_admin,
      );

    const allowed = availableRounds.some(
      (round) =>
        round.round_id === roundId,
    );

    const currentCookieStore =
      await cookies();

    if (allowed) {
      currentCookieStore.set(
        KPI_REPORT_ROUND_COOKIE,
        String(roundId),
        {
          httpOnly: true,
          sameSite: "lax",
          secure:
            shouldUseSecureCookie(),
          maxAge: 60 * 60 * 8,
          path: "/",
        },
      );
    } else {
      currentCookieStore.delete(
        KPI_REPORT_ROUND_COOKIE,
      );
    }

    redirect("/kpi-reports");
  }

  return (
    <div>
      <PageHeader
        title={
          session.is_admin
            ? "รายงานผล KPI"
            : "ผล KPI ของคนที่ฉันประเมิน"
        }
        description={
          session.is_admin
            ? "ติดตามผลประเมิน KPI รายบุคคล หน่วยงาน แบบฟอร์ม และตัวชี้วัด"
            : "แสดงผล KPI เฉพาะผู้ถูกประเมินที่อยู่ในความรับผิดชอบของคุณ"
        }
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
                  ยังไม่มีข้อมูล KPI ที่เข้าถึงได้
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
        <KpiReportTable
          rows={rows}
          isAdmin={session.is_admin}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          ยังไม่มีรอบประเมินที่มีข้อมูล KPI
        </div>
      )}
    </div>
  );
}