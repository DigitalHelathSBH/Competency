import ActionAlert from "@/components/competency/ActionAlert";
import KpiEvaluationScoreForm, {
  type KpiEvaluationFormData,
  type KpiEvaluationItem,
  type KpiEvaluationRule,
} from "@/components/competency/KpiEvaluationScoreForm";
import PageHeader from "@/components/competency/PageHeader";
import {
  getDbPool,
  getSsbDatabaseName,
  quoteSqlName,
  sql,
} from "@/lib/db";
import { requireSession } from "@/lib/session";
import { cookies } from "next/headers";
import Link from "next/link";
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

function adminErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
          .replace(
            /^RequestError:\s*/i,
            "",
          )
          .trim()
      : "";

  if (!rawMessage) {
    return "ไม่สามารถบันทึกผลประเมิน KPI ได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
  }

  if (/[ก-๙]/.test(rawMessage)) {
    return rawMessage;
  }

  return "ไม่สามารถบันทึกผลประเมิน KPI ได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
}

async function getKpiEvaluationFormData(
  kpiAssignmentId: number,
  evaluatorPayrollNo: string,
): Promise<KpiEvaluationFormData | null> {
  const pool = await getDbPool();

  const assignmentResult = await pool
    .request()
    .input(
      "kpi_assignment_id",
      sql.BigInt,
      kpiAssignmentId,
    )
    .input(
      "evaluator_payroll_no",
      sql.VarChar(20),
      evaluatorPayrollNo,
    )
    .query(`
      SELECT TOP (1)
        k.kpi_assignment_id,
        r.round_code,
        module_status.status_type AS round_status_type,
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
          ${ssbDb()}.dbo.GetSSBName(
            ISNULL(
              division_ref.thainame,
              division_ref.englishname
            )
          ),
          N''
        ) AS division_name,
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
        ef.employee_form_id,
        fv.form_version_id,
        f.form_code,
        f.form_name,
        evaluation_summary.evaluation_id,
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
        SELECT TOP (1)
          ev.evaluation_id,
          ev.status_type,
          ev.total_kpi_score,
          ev.submitted_date
        FROM dbo.kpi_evaluation ev
        WHERE ev.employee_form_id =
              ef.employee_form_id
          AND ev.kpi_assignment_id =
              k.kpi_assignment_id
          AND ev.status_type <> 9
        ORDER BY ev.evaluation_id DESC
      ) evaluation_summary
      WHERE k.kpi_assignment_id =
            @kpi_assignment_id
        AND k.evaluator_payroll_no =
            @evaluator_payroll_no
        AND k.status_type = 0;
    `);

  const assignmentRow =
    assignmentResult.recordset[0];

  if (!assignmentRow) {
    return null;
  }

  const formVersionId = Number(
    assignmentRow.form_version_id,
  );
  const evaluationId = Number(
    assignmentRow.evaluation_id || 0,
  );

  const [itemResult, ruleResult] =
    await Promise.all([
      pool
        .request()
        .input(
          "form_version_id",
          sql.BigInt,
          formVersionId,
        )
        .input(
          "evaluation_id",
          sql.BigInt,
          evaluationId || null,
        )
        .query(`
          SELECT
            fi.form_item_id,
            fi.item_order,
            i.indicator_code,
            iv.indicator_name,
            ISNULL(iv.note, N'')
              AS indicator_note,
            fi.weight_percent,
            ed.actual_value,
            ed.achieved_level,
            ed.calculated_score,
            ISNULL(
              ed.evaluator_note,
              N''
            ) AS evaluator_note
          FROM dbo.kpi_form_item fi
          JOIN dbo.kpi_indicator_version iv
            ON iv.indicator_version_id =
               fi.indicator_version_id
          JOIN dbo.kpi_indicator i
            ON i.indicator_id =
               iv.indicator_id
          LEFT JOIN dbo.kpi_evaluation_detail ed
            ON ed.evaluation_id =
               @evaluation_id
           AND ed.form_item_id =
               fi.form_item_id
          WHERE fi.form_version_id =
                @form_version_id
          ORDER BY fi.item_order;
        `),
      pool
        .request()
        .input(
          "form_version_id",
          sql.BigInt,
          formVersionId,
        )
        .query(`
          SELECT
            fi.form_item_id,
            r.score_level,
            r.operator_type,
            r.compare_value,
            r.evaluation_order
          FROM dbo.kpi_form_item fi
          JOIN dbo.kpi_indicator_rule r
            ON r.indicator_version_id =
               fi.indicator_version_id
          WHERE fi.form_version_id =
                @form_version_id
          ORDER BY
            fi.item_order,
            r.evaluation_order,
            r.score_level;
        `),
    ]);

  const ruleMap = new Map<
    number,
    KpiEvaluationRule[]
  >();

  for (const row of ruleResult.recordset) {
    const formItemId = Number(
      row.form_item_id,
    );
    const current =
      ruleMap.get(formItemId) || [];

    current.push({
      score_level: Number(
        row.score_level,
      ),
      operator_type: String(
        row.operator_type || "",
      ).trim(),
      compare_value: Number(
        row.compare_value,
      ),
      evaluation_order: Number(
        row.evaluation_order,
      ),
    });

    ruleMap.set(formItemId, current);
  }

  const items = itemResult.recordset.map(
    (row) => {
      const formItemId = Number(
        row.form_item_id,
      );

      return {
        form_item_id: formItemId,
        item_order: Number(
          row.item_order,
        ),
        indicator_code: String(
          row.indicator_code || "",
        ).trim(),
        indicator_name: String(
          row.indicator_name || "",
        ).trim(),
        indicator_note: String(
          row.indicator_note || "",
        ).trim(),
        weight_percent: Number(
          row.weight_percent,
        ),
        actual_value:
          row.actual_value === null ||
          row.actual_value === undefined
            ? null
            : Number(row.actual_value),
        achieved_level:
          row.achieved_level === null ||
          row.achieved_level === undefined
            ? null
            : Number(
                row.achieved_level,
              ),
        calculated_score:
          row.calculated_score === null ||
          row.calculated_score === undefined
            ? null
            : Number(
                row.calculated_score,
              ),
        evaluator_note: String(
          row.evaluator_note || "",
        ),
        rules:
          ruleMap.get(formItemId) || [],
      };
    },
  ) as KpiEvaluationItem[];

  return {
    assignment: {
      kpi_assignment_id: Number(
        assignmentRow.kpi_assignment_id,
      ),
      round_code: String(
        assignmentRow.round_code || "",
      ).trim(),
      round_status_type: Number(
        assignmentRow.round_status_type,
      ),
      employee_payroll_no: String(
        assignmentRow.employee_payroll_no ||
          "",
      ).trim(),
      employee_full_name: String(
        assignmentRow.employee_full_name ||
          assignmentRow.employee_payroll_no ||
          "",
      ).trim(),
      division_name: String(
        assignmentRow.division_name || "",
      ).trim(),
      section_name: String(
        assignmentRow.section_name || "",
      ).trim(),
      form_code: String(
        assignmentRow.form_code || "",
      ).trim(),
      form_name: String(
        assignmentRow.form_name || "",
      ).trim(),
      evaluation_status_type:
        assignmentRow.evaluation_status_type ===
          null ||
        assignmentRow.evaluation_status_type ===
          undefined
          ? null
          : Number(
              assignmentRow
                .evaluation_status_type,
            ),
      total_kpi_score:
        assignmentRow.total_kpi_score ===
          null ||
        assignmentRow.total_kpi_score ===
          undefined
          ? null
          : Number(
              assignmentRow.total_kpi_score,
            ),
      submitted_date: String(
        assignmentRow.submitted_date || "",
      ).trim(),
    },
    items,
    can_edit:
      Number(
        assignmentRow.round_status_type,
      ) === 1,
  };
}

export default async function KpiEvaluationFormPage() {
  const session = await requireSession();
  const cookieStore = await cookies();

  const kpiAssignmentId = Number(
    cookieStore.get(
      KPI_EVALUATION_ASSIGNMENT_COOKIE,
    )?.value || 0,
  );

  const notice = parseNotice(
    cookieStore.get(
      KPI_EVALUATION_NOTICE_COOKIE,
    )?.value,
  );

  async function submitEvaluation(
    formData: FormData,
  ) {
    "use server";

    const currentSession =
      await requireSession();
    const currentCookieStore =
      await cookies();

    const currentAssignmentId = Number(
      currentCookieStore.get(
        KPI_EVALUATION_ASSIGNMENT_COOKIE,
      )?.value || 0,
    );

    let redirectPath =
      "/kpi-evaluations/form";

    try {
      if (
        !Number.isSafeInteger(
          currentAssignmentId,
        ) ||
        currentAssignmentId <= 0
      ) {
        throw new Error(
          "ไม่พบรายการประเมิน KPI กรุณาเปิดรายการจากหน้ารายการประเมินอีกครั้ง",
        );
      }

      const actionType = String(
        formData.get("action_type") || "",
      ).trim();

      if (
        actionType !== "draft" &&
        actionType !== "submit"
      ) {
        throw new Error(
          "รูปแบบการบันทึกไม่ถูกต้อง",
        );
      }

      const data =
        await getKpiEvaluationFormData(
          currentAssignmentId,
          currentSession.emp_id,
        );

      if (!data) {
        throw new Error(
          "รายการนี้อาจไม่ใช่ของผู้ใช้งานที่เข้าสู่ระบบ หรือถูกยกเลิกแล้ว",
        );
      }

      if (!data.can_edit) {
        throw new Error(
          "รอบประเมินไม่ได้อยู่ในสถานะเปิดประเมิน จึงไม่สามารถบันทึกผลได้",
        );
      }

      if (data.items.length === 0) {
        throw new Error(
          "แบบฟอร์ม KPI นี้ไม่มีตัวชี้วัด",
        );
      }

      const details = data.items.map(
        (item, index) => {
          const actualText = String(
            formData.get(
              `actual_${item.form_item_id}`,
            ) || "",
          ).trim();

          const note = String(
            formData.get(
              `note_${item.form_item_id}`,
            ) || "",
          )
            .trim()
            .slice(0, 2000);

          if (actualText === "") {
            return {
              form_item_id:
                item.form_item_id,
              actual_value: null,
              evaluator_note:
                note || null,
            };
          }

          const actualValue =
            Number(actualText);

          if (
            !Number.isInteger(
              actualValue,
            ) ||
            actualValue < 0
          ) {
            throw new Error(
              `ค่าผลงานจริงข้อ ${
                index + 1
              } ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`,
            );
          }

          return {
            form_item_id:
              item.form_item_id,
            actual_value:
              actualValue,
            evaluator_note:
              note || null,
          };
        },
      );

      if (
        actionType === "submit" &&
        details.some(
          (detail) =>
            detail.actual_value === null,
        )
      ) {
        throw new Error(
          "กรุณากรอกค่าผลงานจริงให้ครบทุกข้อก่อนส่งผลประเมิน",
        );
      }

      const pool = await getDbPool();
      const detailsJson =
        JSON.stringify(details);

      await pool
        .request()
        .input(
          "kpi_assignment_id",
          sql.BigInt,
          currentAssignmentId,
        )
        .input(
          "evaluator_payroll_no",
          sql.VarChar(20),
          currentSession.emp_id,
        )
        .input(
          "action_type",
          sql.VarChar(10),
          actionType,
        )
        .input(
          "details_json",
          sql.NVarChar(sql.MAX),
          detailsJson,
        )
        .query(`
          SET NOCOUNT ON;
          SET XACT_ABORT ON;

          BEGIN TRY
            BEGIN TRANSACTION;

            DECLARE @employee_form_id bigint;
            DECLARE @form_version_id bigint;
            DECLARE @round_status_type tinyint;
            DECLARE @evaluation_id bigint;
            DECLARE @existing_status_type tinyint;
            DECLARE @requested_status_type tinyint =
              CASE
                WHEN @action_type = 'submit'
                  THEN 1
                ELSE 0
              END;

            SELECT TOP (1)
              @employee_form_id =
                ef.employee_form_id,
              @form_version_id =
                ef.form_version_id,
              @round_status_type =
                module_status.status_type
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
            JOIN dbo.kpi_employee_form ef
              ON ef.round_employee_id =
                 re.round_employee_id
             AND ef.status_type = 0
            WHERE k.kpi_assignment_id =
                  @kpi_assignment_id
              AND k.evaluator_payroll_no =
                  @evaluator_payroll_no
              AND k.status_type = 0;

            IF @employee_form_id IS NULL
            BEGIN
              THROW 52500,
                    N'ไม่พบรายการประเมิน KPI หรือไม่มีสิทธิ์เข้าถึง',
                    1;
            END;

            IF @round_status_type <> 1
            BEGIN
              THROW 52501,
                    N'รอบประเมินไม่ได้อยู่ในสถานะเปิดประเมิน',
                    1;
            END;

            DECLARE @details TABLE
            (
              form_item_id bigint NOT NULL
                PRIMARY KEY,
              actual_value int NULL,
              evaluator_note nvarchar(2000) NULL,
              achieved_level tinyint NULL,
              calculated_score decimal(7,2) NULL
            );

            INSERT INTO @details
            (
              form_item_id,
              actual_value,
              evaluator_note,
              achieved_level,
              calculated_score
            )
            SELECT
              json_detail.form_item_id,
              json_detail.actual_value,
              NULLIF(
                LTRIM(
                  RTRIM(
                    json_detail.evaluator_note
                  )
                ),
                N''
              ),
              calculated.achieved_level,
              CASE
                WHEN calculated.achieved_level
                     IS NULL
                  THEN NULL
                ELSE
                  CAST(
                    (
                      fi.weight_percent *
                      calculated.achieved_level
                    ) / 5.0
                    AS decimal(7,2)
                  )
              END
            FROM OPENJSON(@details_json)
            WITH
            (
              form_item_id bigint
                '$.form_item_id',
              actual_value int
                '$.actual_value',
              evaluator_note nvarchar(2000)
                '$.evaluator_note'
            ) json_detail
            JOIN dbo.kpi_form_item fi
              ON fi.form_item_id =
                 json_detail.form_item_id
             AND fi.form_version_id =
                 @form_version_id
            OUTER APPLY
            (
              SELECT
                CASE
                  WHEN json_detail.actual_value
                       IS NULL
                    THEN NULL
                  ELSE
                    dbo.fn_kpi_get_level
                    (
                      fi.indicator_version_id,
                      json_detail.actual_value
                    )
                END AS achieved_level
            ) calculated;

            IF
            (
              SELECT COUNT(*)
              FROM @details
            )
            <>
            (
              SELECT COUNT(*)
              FROM dbo.kpi_form_item
              WHERE form_version_id =
                    @form_version_id
            )
            BEGIN
              THROW 52502,
                    N'ข้อมูลตัวชี้วัดไม่ครบหรือไม่ตรงกับแบบฟอร์ม',
                    1;
            END;

            IF EXISTS
            (
              SELECT 1
              FROM @details
              WHERE actual_value < 0
            )
            BEGIN
              THROW 52503,
                    N'ค่าผลงานจริงต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป',
                    1;
            END;

            IF EXISTS
            (
              SELECT 1
              FROM @details
              WHERE actual_value IS NOT NULL
                AND achieved_level IS NULL
            )
            BEGIN
              THROW 52504,
                    N'มีค่าผลงานจริงที่ไม่เข้าเกณฑ์ระดับคะแนน กรุณาแจ้งผู้ดูแลระบบ',
                    1;
            END;

            IF @requested_status_type = 1
               AND EXISTS
               (
                 SELECT 1
                 FROM @details
                 WHERE actual_value IS NULL
               )
            BEGIN
              THROW 52505,
                    N'กรุณากรอกค่าผลงานจริงให้ครบทุกข้อก่อนส่งผลประเมิน',
                    1;
            END;

            SELECT TOP (1)
              @evaluation_id =
                ev.evaluation_id,
              @existing_status_type =
                ev.status_type
            FROM dbo.kpi_evaluation ev
              WITH (UPDLOCK, HOLDLOCK)
            WHERE ev.employee_form_id =
                  @employee_form_id
              AND ev.kpi_assignment_id =
                  @kpi_assignment_id
              AND ev.status_type <> 9
            ORDER BY ev.evaluation_id DESC;

            IF @evaluation_id IS NULL
            BEGIN
              INSERT INTO dbo.kpi_evaluation
              (
                employee_form_id,
                kpi_assignment_id,
                status_type,
                total_kpi_score,
                submitted_date,
                created_date,
                created_by
              )
              VALUES
              (
                @employee_form_id,
                @kpi_assignment_id,
                @requested_status_type,
                NULL,
                CASE
                  WHEN @requested_status_type = 1
                    THEN SYSDATETIME()
                  ELSE NULL
                END,
                SYSDATETIME(),
                @evaluator_payroll_no
              );

              SET @evaluation_id =
                CONVERT(
                  bigint,
                  SCOPE_IDENTITY()
                );

              SET @existing_status_type =
                @requested_status_type;
            END;

            UPDATE ed
            SET actual_value =
                  detail.actual_value,
                achieved_level =
                  detail.achieved_level,
                calculated_score =
                  detail.calculated_score,
                evaluator_note =
                  detail.evaluator_note,
                updated_date =
                  SYSDATETIME(),
                updated_by =
                  @evaluator_payroll_no
            FROM dbo.kpi_evaluation_detail ed
            JOIN @details detail
              ON detail.form_item_id =
                 ed.form_item_id
            WHERE ed.evaluation_id =
                  @evaluation_id;

            INSERT INTO dbo.kpi_evaluation_detail
            (
              evaluation_id,
              form_item_id,
              actual_value,
              achieved_level,
              calculated_score,
              evaluator_note,
              updated_date,
              updated_by
            )
            SELECT
              @evaluation_id,
              detail.form_item_id,
              detail.actual_value,
              detail.achieved_level,
              detail.calculated_score,
              detail.evaluator_note,
              SYSDATETIME(),
              @evaluator_payroll_no
            FROM @details detail
            WHERE NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_evaluation_detail ed
              WHERE ed.evaluation_id =
                    @evaluation_id
                AND ed.form_item_id =
                    detail.form_item_id
            );

            DECLARE @completed_count int;
            DECLARE @item_count int;
            DECLARE @total_score decimal(7,2);
            DECLARE @next_status_type tinyint;

            SELECT
              @completed_count =
                SUM(
                  CASE
                    WHEN actual_value IS NOT NULL
                     AND achieved_level IS NOT NULL
                      THEN 1
                    ELSE 0
                  END
                ),
              @item_count = COUNT(*),
              @total_score =
                CAST(
                  SUM(
                    ISNULL(
                      calculated_score,
                      0
                    )
                  )
                  AS decimal(7,2)
                )
            FROM @details;

            SET @next_status_type =
              CASE
                WHEN @existing_status_type = 1
                  THEN 1
                ELSE @requested_status_type
              END;

            UPDATE dbo.kpi_evaluation
            SET status_type =
                  @next_status_type,
                total_kpi_score =
                  CASE
                    WHEN @completed_count =
                         @item_count
                      THEN @total_score
                    ELSE NULL
                  END,
                submitted_date =
                  CASE
                    WHEN @next_status_type = 1
                      THEN SYSDATETIME()
                    ELSE NULL
                  END,
                updated_date =
                  SYSDATETIME(),
                updated_by =
                  @evaluator_payroll_no
            WHERE evaluation_id =
                  @evaluation_id;

            COMMIT TRANSACTION;
          END TRY
          BEGIN CATCH
            IF @@TRANCOUNT > 0
              ROLLBACK TRANSACTION;

            THROW;
          END CATCH;
        `);

      if (actionType === "draft") {
        await setNoticeCookie(
          "success",
          "บันทึกร่างผลประเมิน KPI เรียบร้อยแล้ว",
        );

        redirectPath =
          "/kpi-evaluations/form";
      } else {
        const wasSubmitted =
          Number(
            data.assignment
              .evaluation_status_type || 0,
          ) === 1;

        await setNoticeCookie(
          "success",
          wasSubmitted
            ? "บันทึกการแก้ไขผลประเมิน KPI เรียบร้อยแล้ว"
            : "ส่งผลประเมิน KPI เรียบร้อยแล้ว",
        );

        currentCookieStore.set(
          KPI_EVALUATION_ASSIGNMENT_COOKIE,
          "",
          {
            httpOnly: true,
            sameSite: "lax",
            secure: isSecureCookie(),
            maxAge: 0,
            path: "/",
          },
        );

        redirectPath =
          "/kpi-evaluations";
      }
    } catch (error) {
      console.error(
        "save KPI evaluation error:",
        error,
      );

      await setNoticeCookie(
        "error",
        adminErrorMessage(error),
      );
    }

    redirect(redirectPath);
  }

  if (
    !Number.isSafeInteger(
      kpiAssignmentId,
    ) ||
    kpiAssignmentId <= 0
  ) {
    return (
      <div>
        <PageHeader
          title="ยังไม่ได้เลือกรายการประเมิน KPI"
          description="กรุณาเปิดแบบประเมินจากหน้ารายการประเมิน KPI"
        />

        {notice && (
          <ActionAlert
            type={notice.type}
            message={notice.message}
          />
        )}

        <Link
          href="/kpi-evaluations"
          className="inline-flex rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white hover:bg-brand-600"
        >
          กลับไปรายการประเมิน KPI
        </Link>
      </div>
    );
  }

  const data =
    await getKpiEvaluationFormData(
      kpiAssignmentId,
      session.emp_id,
    );

  if (!data) {
    return (
      <div>
        <PageHeader
          title="ไม่พบรายการประเมิน KPI"
          description="รายการนี้อาจไม่ใช่ของผู้ใช้งานที่เข้าสู่ระบบ หรือถูกยกเลิกแล้ว"
        />

        <Link
          href="/kpi-evaluations"
          className="inline-flex rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white hover:bg-brand-600"
        >
          กลับไปรายการประเมิน KPI
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="แบบประเมิน KPI"
        description="กรอกค่าผลงานจริง ระบบจะคำนวณระดับและคะแนนตามเกณฑ์ของตัวชี้วัด"
      />

      {notice && (
        <ActionAlert
          type={notice.type}
          message={notice.message}
        />
      )}

      {!data.can_edit && (
        <ActionAlert
          type="warning"
          message="รอบประเมินไม่ได้อยู่ในสถานะเปิดประเมิน ข้อมูลจะแสดงแบบอ่านอย่างเดียว"
        />
      )}

      <KpiEvaluationScoreForm
        data={data}
        submitAction={submitEvaluation}
      />
    </div>
  );
}