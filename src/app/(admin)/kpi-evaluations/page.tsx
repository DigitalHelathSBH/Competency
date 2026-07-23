import ActionAlert from "@/components/competency/ActionAlert";
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

const KPI_EVALUATION_ASSIGNMENT_COOKIE =
  "kpi_evaluation_assignment_id";
const KPI_EVALUATION_NOTICE_COOKIE =
  "kpi_evaluation_notice";

type Notice = {
  type: "success" | "error";
  message: string;
};

type KpiEvaluationListRow = {
  kpi_assignment_id: number;
  round_code: string;
  employee_payroll_no: string;
  employee_full_name: string;
  division_code: string;
  division_name: string;
  section_code: string;
  section_name: string;
  form_code: string;
  form_name: string;
  item_count: number;
  completed_item_count: number;
  evaluation_status_type: number | null;
  total_kpi_score: number | null;
  submitted_date: string;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function isSecureCookie() {
  return (
    String(
      process.env.COOKIE_SECURE || "",
    ).toLowerCase() === "true"
  );
}

function parseNotice(
  value: string | undefined,
): Notice | null {
  if (!value) return null;

  const separatorIndex = value.indexOf(":");

  if (separatorIndex <= 0) {
    return null;
  }

  const type = value.slice(0, separatorIndex);
  const encodedMessage = value.slice(
    separatorIndex + 1,
  );

  if (
    type !== "success" &&
    type !== "error"
  ) {
    return null;
  }

  try {
    return {
      type,
      message: decodeURIComponent(
        encodedMessage,
      ),
    };
  } catch {
    return null;
  }
}

async function setNoticeCookie(
  type: "success" | "error",
  message: string,
) {
  const cookieStore = await cookies();

  cookieStore.set(
    KPI_EVALUATION_NOTICE_COOKIE,
    `${type}:${encodeURIComponent(message)}`,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie(),
      maxAge: type === "success" ? 8 : 30,
      path: "/",
    },
  );
}

function formatThaiDateTime(
  value: string | null | undefined,
) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "-";

  const normalized = rawValue.replace(" ", "T");
  const date = new Date(
    normalized.endsWith("Z")
      ? normalized
      : `${normalized}+07:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function statusBadge(
  row: KpiEvaluationListRow,
) {
  const status = Number(
    row.evaluation_status_type ?? -1,
  );

  if (status === 1) {
    return (
      <span className="rounded-full bg-[#1ab394] px-2.5 py-1 text-xs font-medium text-white">
        ส่งผลแล้ว
      </span>
    );
  }

  if (status === 0) {
    return (
      <span className="rounded-full bg-[#f8ac59] px-2.5 py-1 text-xs font-medium text-white">
        บันทึกร่าง
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      ยังไม่เริ่ม
    </span>
  );
}

async function getMyKpiEvaluations(
  evaluatorPayrollNo: string,
) {
  const pool = await getDbPool();

  const result = await pool
    .request()
    .input(
      "evaluator_payroll_no",
      sql.VarChar(20),
      evaluatorPayrollNo,
    )
    .query(`
      SELECT
        k.kpi_assignment_id,
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
        ISNULL(
          LTRIM(
            RTRIM(
              CAST(
                re.division_code AS varchar(20)
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
                re.section_code AS varchar(20)
              )
            )
          ),
          ''
        ) AS section_code,
        ISNULL(
          NULLIF(
            LTRIM(RTRIM(section_ref.ThaiName)),
            N''
          ),
          N''
        ) AS section_name,
        f.form_code,
        f.form_name,
        ISNULL(
          item_summary.item_count,
          0
        ) AS item_count,
        ISNULL(
          evaluation_summary.completed_item_count,
          0
        ) AS completed_item_count,
        evaluation_summary.status_type
          AS evaluation_status_type,
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
      JOIN dbo.performance_round_module module_status
        ON module_status.round_id = r.round_id
       AND module_status.module_type = 'KPI'
       AND module_status.status_type = 1
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
       AND division_ref.CTRLCODE = '10028'
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
              AND ed.actual_value IS NOT NULL
              AND ed.achieved_level IS NOT NULL
          ) AS completed_item_count
        FROM dbo.kpi_evaluation ev
        WHERE ev.employee_form_id =
              ef.employee_form_id
          AND ev.kpi_assignment_id =
              k.kpi_assignment_id
          AND ev.status_type <> 9
        ORDER BY ev.evaluation_id DESC
      ) evaluation_summary
      WHERE k.evaluator_payroll_no =
            @evaluator_payroll_no
        AND k.status_type = 0
      ORDER BY
        r.round_year DESC,
        r.round_no DESC,
        ISNULL(
          ${ssbDb()}.dbo.GetSSBName(
            ISNULL(
              division_ref.thainame,
              division_ref.englishname
            )
          ),
          N''
        ),
        employee_full_name;
    `);

  return result.recordset.map((row) => ({
    kpi_assignment_id: Number(
      row.kpi_assignment_id,
    ),
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
    item_count: Number(
      row.item_count || 0,
    ),
    completed_item_count: Number(
      row.completed_item_count || 0,
    ),
    evaluation_status_type:
      row.evaluation_status_type === null ||
      row.evaluation_status_type === undefined
        ? null
        : Number(
            row.evaluation_status_type,
          ),
    total_kpi_score:
      row.total_kpi_score === null ||
      row.total_kpi_score === undefined
        ? null
        : Number(row.total_kpi_score),
    submitted_date: String(
      row.submitted_date || "",
    ).trim(),
  })) as KpiEvaluationListRow[];
}

export default async function KpiEvaluationsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();

  const notice = parseNotice(
    cookieStore.get(
      KPI_EVALUATION_NOTICE_COOKIE,
    )?.value,
  );

  const rows = await getMyKpiEvaluations(
    session.emp_id,
  );

  async function openEvaluation(
    formData: FormData,
  ) {
    "use server";

    const currentSession =
      await requireSession();

    const kpiAssignmentId = Number(
      formData.get(
        "kpi_assignment_id",
      ) || 0,
    );

    if (
      !Number.isSafeInteger(
        kpiAssignmentId,
      ) ||
      kpiAssignmentId <= 0
    ) {
      await setNoticeCookie(
        "error",
        "ไม่พบรายการประเมิน KPI ที่ต้องการเปิด",
      );

      redirect("/kpi-evaluations");
    }

    const pool = await getDbPool();

    const checkResult = await pool
      .request()
      .input(
        "kpi_assignment_id",
        sql.BigInt,
        kpiAssignmentId,
      )
      .input(
        "evaluator_payroll_no",
        sql.VarChar(20),
        currentSession.emp_id,
      )
      .query(`
        SELECT TOP (1)
          k.kpi_assignment_id
        FROM dbo.kpi_evaluator_assignment k
        JOIN dbo.competency_round_employee re
          ON re.round_employee_id =
             k.round_employee_id
         AND re.status_type <> 9
        JOIN dbo.competency_round r
          ON r.round_id = re.round_id
         AND r.status_type <> 9
        JOIN dbo.performance_round_module module_status
          ON module_status.round_id = r.round_id
         AND module_status.module_type = 'KPI'
         AND module_status.status_type = 1
        JOIN dbo.kpi_employee_form ef
          ON ef.round_employee_id =
             re.round_employee_id
         AND ef.status_type = 0
        WHERE k.kpi_assignment_id =
              @kpi_assignment_id
          AND k.evaluator_payroll_no =
              @evaluator_payroll_no
          AND k.status_type = 0;
      `);

    if (!checkResult.recordset[0]) {
      await setNoticeCookie(
        "error",
        "รายการนี้อาจไม่ใช่ของผู้ใช้งานที่เข้าสู่ระบบ หรือรอบประเมินปิดแล้ว",
      );

      redirect("/kpi-evaluations");
    }

    const currentCookieStore =
      await cookies();

    currentCookieStore.set(
      KPI_EVALUATION_ASSIGNMENT_COOKIE,
      String(kpiAssignmentId),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie(),
        maxAge: 30 * 60,
        path: "/",
      },
    );

    currentCookieStore.set(
      KPI_EVALUATION_NOTICE_COOKIE,
      "",
      {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie(),
        maxAge: 0,
        path: "/",
      },
    );

    redirect("/kpi-evaluations/form");
  }

  const totalCount = rows.length;
  const submittedCount = rows.filter(
    (row) =>
      Number(
        row.evaluation_status_type ?? -1,
      ) === 1,
  ).length;
  const draftCount = rows.filter(
    (row) =>
      Number(
        row.evaluation_status_type ?? -1,
      ) === 0,
  ).length;
  const notStartedCount =
    totalCount -
    submittedCount -
    draftCount;

  return (
    <div>
      <PageHeader
        title="ประเมิน KPI"
        description="รายการบุคลากรที่ได้รับมอบหมายให้ประเมิน KPI ในรอบที่เปิดอยู่"
      />

      {notice && (
        <ActionAlert
          type={notice.type}
          message={notice.message}
        />
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ทั้งหมด
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {totalCount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ส่งผลแล้ว
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#1ab394]">
            {submittedCount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            บันทึกร่าง
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#f8ac59]">
            {draftCount.toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ยังไม่เริ่ม
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#ed5565]">
            {notStartedCount.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการที่ต้องประเมิน
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            แสดงเฉพาะรอบที่อยู่ในสถานะเปิดประเมิน
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {[
                  "ผู้ถูกประเมิน",
                  "หน่วยงาน",
                  "แบบฟอร์ม",
                  "ความคืบหน้า",
                  "สถานะ",
                  "คะแนน KPI",
                  "วันที่ส่ง",
                  "จัดการ",
                ].map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-transparent">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    ไม่พบรายการประเมิน KPI ในรอบที่เปิดอยู่
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSubmitted =
                    Number(
                      row.evaluation_status_type ??
                        -1,
                    ) === 1;

                  return (
                    <tr
                      key={
                        row.kpi_assignment_id
                      }
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {
                            row.employee_full_name
                          }
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {
                            row.employee_payroll_no
                          }
                          {" • "}
                          {row.round_code}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {row.division_name ||
                            "-"}
                        </div>
                        {row.section_name && (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {row.section_name}
                          </div>
                        )}
                      </td>

                      <td className="max-w-sm px-4 py-4 align-top">
                        <div className="text-sm font-semibold text-[#23c6c8]">
                          {row.form_code}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                          {row.form_name}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                        {
                          row.completed_item_count
                        }{" "}
                        / {row.item_count} ข้อ
                      </td>

                      <td className="px-4 py-4 align-top">
                        {statusBadge(row)}
                      </td>

                      <td className="px-4 py-4 align-top">
                        {row.total_kpi_score ===
                        null ? (
                          <span className="text-sm text-gray-400">
                            -
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-[#1ab394]">
                            {row.total_kpi_score.toLocaleString(
                              "th-TH",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-gray-600 dark:text-gray-300">
                        {formatThaiDateTime(
                          row.submitted_date,
                        )}
                      </td>

                      <td className="px-4 py-4 align-top">
                        <form
                          action={
                            openEvaluation
                          }
                        >
                          <input
                            type="hidden"
                            name="kpi_assignment_id"
                            value={
                              row.kpi_assignment_id
                            }
                          />

                          <button
                            type="submit"
                            className={[
                              "rounded-lg px-4 py-2 text-sm font-medium text-white",
                              isSubmitted
                                ? "bg-[#f8ac59] hover:bg-[#f7a23b]"
                                : "bg-brand-500 hover:bg-brand-600",
                            ].join(" ")}
                          >
                            {isSubmitted
                              ? "แก้ไขผล"
                              : "ประเมิน"}
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