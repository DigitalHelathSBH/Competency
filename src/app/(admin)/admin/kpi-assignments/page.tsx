import KpiEvaluatorAssignment, {
  type KpiEvaluatorActionState,
  type KpiEvaluatorRoundOption,
  type KpiEvaluatorRow,
  type KpiEvaluatorSectionOption,
  type KpiEvaluatorStaffOption,
} from "@/components/competency/KpiEvaluatorAssignment";
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

const PAGE_PATH = "/admin/kpi-assignments";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

function actionResult(
  ok: boolean,
  type: KpiEvaluatorActionState["type"],
  message: string,
): KpiEvaluatorActionState {
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
      ? error.message
          .replace(/^RequestError:\s*/i, "")
          .trim()
      : "";

  if (!rawMessage) {
    return "ไม่สามารถกำหนดผู้ประเมิน KPI ได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
  }

  if (/[ก-๙]/.test(rawMessage)) {
    return rawMessage;
  }

  if (
    rawMessage.includes("duplicate key") ||
    rawMessage.includes("UNIQUE")
  ) {
    return "มีการกำหนดผู้ประเมินซ้ำ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  }

  if (
    rawMessage.includes("FOREIGN KEY") ||
    rawMessage.includes("CHECK constraint") ||
    rawMessage.includes("PRIMARY KEY")
  ) {
    return "ไม่สามารถกำหนดผู้ประเมินได้ เนื่องจากข้อมูลบางรายการถูกเปลี่ยนแปลงแล้ว";
  }

  return "ไม่สามารถกำหนดผู้ประเมิน KPI ได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
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
    round_code: String(
      row.round_code || "",
    ).trim(),
  })) as KpiEvaluatorRoundOption[];
}

async function getSections() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT DISTINCT
      re.round_id,
      LTRIM(
        RTRIM(
          CAST(re.section_code AS varchar(20))
        )
      ) AS section_code,
      ISNULL(
        NULLIF(
          LTRIM(RTRIM(sc.ThaiName)),
          N''
        ),
        LTRIM(
          RTRIM(
            CAST(re.section_code AS varchar(20))
          )
        )
      ) AS section_name
    FROM dbo.kpi_employee_form ef
    JOIN dbo.competency_round_employee re
      ON re.round_employee_id =
         ef.round_employee_id
     AND re.status_type <> 9
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
     AND r.status_type = 0
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON LTRIM(
           RTRIM(
             CAST(sc.Code AS varchar(20))
           )
         )
       =
         LTRIM(
           RTRIM(
             CAST(re.section_code AS varchar(20))
           )
         )
    WHERE ef.status_type = 0
      AND LEN(
            LTRIM(
              RTRIM(
                CAST(
                  re.section_code AS varchar(20)
                )
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
                  CAST(
                    x.section_code AS varchar(20)
                  )
                )
              )
              =
              LTRIM(
                RTRIM(
                  CAST(
                    re.section_code AS varchar(20)
                  )
                )
              )
      )
    ORDER BY
      re.round_id,
      section_name,
      section_code;
  `);

  return result.recordset.map((row) => ({
    round_id: Number(row.round_id),
    section_code: String(
      row.section_code || "",
    ).trim(),
    section_name: String(
      row.section_name ||
        row.section_code ||
        "",
    ).trim(),
  })) as KpiEvaluatorSectionOption[];
}

async function getEvaluators() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT TOP (3000)
      LTRIM(
        RTRIM(
          CAST(p.PAYROLLNO AS varchar(20))
        )
      ) AS payroll_no,
      NULLIF(
        LTRIM(
          RTRIM(
            ISNULL(
              ${ssbDb()}.dbo.GetSSBName(
                p.FIRSTTHAINAME
              ),
              N''
            )
            + N' '
            + ISNULL(
                ${ssbDb()}.dbo.GetSSBName(
                  p.LASTTHAINAME
                ),
                N''
              )
          )
        ),
        N''
      ) AS evaluator_full_name,
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(ds.thainame, ds.englishname)
      ) AS division_name
    FROM ${ssbDb()}.dbo.PYREXT p
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = p.DIVISION
     AND ds.CTRLCODE = '10028'
    WHERE p.TERMINATEDATE IS NULL
      AND NULLIF(
            LTRIM(
              RTRIM(
                CAST(
                  p.PAYROLLNO AS varchar(20)
                )
              )
            ),
            ''
          ) IS NOT NULL
    ORDER BY
      evaluator_full_name,
      p.PAYROLLNO;
  `);

  return result.recordset.map((row) => ({
    payroll_no: String(
      row.payroll_no || "",
    ).trim(),
    evaluator_full_name: String(
      row.evaluator_full_name ||
        row.payroll_no ||
        "",
    ).trim(),
    division_name: String(
      row.division_name || "",
    ).trim(),
  })) as KpiEvaluatorStaffOption[];
}

async function getRows() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      re.round_employee_id,
      re.round_id,
      LTRIM(
        RTRIM(
          CAST(re.payroll_no AS varchar(20))
        )
      ) AS payroll_no,
      employee_name.full_name
        AS employee_full_name,
      ISNULL(
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
        ''
      ) AS division_code,
      ${ssbDb()}.dbo.GetSSBName(
        ISNULL(ds.thainame, ds.englishname)
      ) AS division_name,
      LTRIM(
        RTRIM(
          CAST(re.section_code AS varchar(20))
        )
      ) AS section_code,
      ISNULL(
        NULLIF(
          LTRIM(RTRIM(sc.ThaiName)),
          N''
        ),
        LTRIM(
          RTRIM(
            CAST(re.section_code AS varchar(20))
          )
        )
      ) AS section_name,
      f.form_code,
      f.form_name,
      ISNULL(
        competency_assignment.evaluator_payroll_no,
        ''
      ) AS competency_evaluator_payroll_no,
      ISNULL(
        competency_evaluator_name.full_name,
        ''
      ) AS competency_evaluator_full_name,
      ISNULL(
        kpi_assignment.kpi_assignment_id,
        0
      ) AS kpi_assignment_id,
      ISNULL(
        kpi_assignment.evaluator_payroll_no,
        ''
      ) AS kpi_evaluator_payroll_no,
      ISNULL(
        kpi_evaluator_name.full_name,
        ''
      ) AS kpi_evaluator_full_name,
      ISNULL(
        kpi_assignment.assignment_source_type,
        ''
      ) AS assignment_source_type,
      ISNULL(
        kpi_assignment.evaluation_started,
        0
      ) AS evaluation_started
    FROM dbo.kpi_employee_form ef
    JOIN dbo.competency_round_employee re
      ON re.round_employee_id =
         ef.round_employee_id
     AND re.status_type <> 9
    JOIN dbo.competency_round r
      ON r.round_id = re.round_id
     AND r.status_type = 0
    JOIN dbo.kpi_form_version fv
      ON fv.form_version_id =
         ef.form_version_id
    JOIN dbo.kpi_form f
      ON f.form_id = fv.form_id
    LEFT JOIN ${ssbDb()}.dbo.SYSCONFIG ds
      ON ds.CODE = re.division_code
     AND ds.CTRLCODE = '10028'
    LEFT JOIN ${ssbDb()}.dbo.sectioncode sc
      ON LTRIM(
           RTRIM(
             CAST(sc.Code AS varchar(20))
           )
         )
       =
         LTRIM(
           RTRIM(
             CAST(re.section_code AS varchar(20))
           )
         )
    OUTER APPLY
    (
      SELECT TOP (1)
        a.assignment_id,
        LTRIM(
          RTRIM(a.evaluator_payroll_no)
        ) AS evaluator_payroll_no
      FROM dbo.competency_evaluator_assignment a
      WHERE a.round_employee_id =
            re.round_employee_id
        AND a.evaluator_level = 1
        AND a.status_type <> 9
      ORDER BY a.assignment_id DESC
    ) competency_assignment
    OUTER APPLY
    (
      SELECT TOP (1)
        k.kpi_assignment_id,
        LTRIM(
          RTRIM(k.evaluator_payroll_no)
        ) AS evaluator_payroll_no,
        k.assignment_source_type,
        CASE
          WHEN EXISTS
          (
            SELECT 1
            FROM dbo.kpi_evaluation ev
            WHERE ev.kpi_assignment_id =
                  k.kpi_assignment_id
              AND ev.status_type <> 9
          )
          THEN 1
          ELSE 0
        END AS evaluation_started
      FROM dbo.kpi_evaluator_assignment k
      WHERE k.round_employee_id =
            re.round_employee_id
        AND k.status_type = 0
      ORDER BY k.kpi_assignment_id DESC
    ) kpi_assignment
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
                  competency_evaluator_pyrext.FIRSTTHAINAME
                ),
                N''
              )
              + N' '
              + ISNULL(
                  ${ssbDb()}.dbo.GetSSBName(
                    competency_evaluator_pyrext.LASTTHAINAME
                  ),
                  N''
                )
            )
          ),
          N''
        )
          AS full_name
      FROM ${ssbDb()}.dbo.PYREXT competency_evaluator_pyrext
      WHERE LTRIM(
              RTRIM(
                CAST(
                  competency_evaluator_pyrext.PAYROLLNO
                  AS varchar(20)
                )
              )
            )
          =
            LTRIM(
              RTRIM(
                CAST(
                  competency_assignment.evaluator_payroll_no
                  AS varchar(20)
                )
              )
            )
      ORDER BY
        CASE
          WHEN competency_evaluator_pyrext.TERMINATEDATE IS NULL
          THEN 0
          ELSE 1
        END
    ) competency_evaluator_name
    OUTER APPLY
    (
      SELECT TOP (1)
        NULLIF(
          LTRIM(
            RTRIM(
              ISNULL(
                ${ssbDb()}.dbo.GetSSBName(
                  kpi_evaluator_pyrext.FIRSTTHAINAME
                ),
                N''
              )
              + N' '
              + ISNULL(
                  ${ssbDb()}.dbo.GetSSBName(
                    kpi_evaluator_pyrext.LASTTHAINAME
                  ),
                  N''
                )
            )
          ),
          N''
        )
          AS full_name
      FROM ${ssbDb()}.dbo.PYREXT kpi_evaluator_pyrext
      WHERE LTRIM(
              RTRIM(
                CAST(
                  kpi_evaluator_pyrext.PAYROLLNO
                  AS varchar(20)
                )
              )
            )
          =
            LTRIM(
              RTRIM(
                CAST(
                  kpi_assignment.evaluator_payroll_no
                  AS varchar(20)
                )
              )
            )
      ORDER BY
        CASE
          WHEN kpi_evaluator_pyrext.TERMINATEDATE IS NULL
          THEN 0
          ELSE 1
        END
    ) kpi_evaluator_name
    WHERE ef.status_type = 0
      AND LEN(
            LTRIM(
              RTRIM(
                CAST(
                  re.section_code AS varchar(20)
                )
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
                  CAST(
                    x.section_code AS varchar(20)
                  )
                )
              )
              =
              LTRIM(
                RTRIM(
                  CAST(
                    re.section_code AS varchar(20)
                  )
                )
              )
      )
    ORDER BY
      re.round_id,
      re.section_code,
      employee_name.full_name,
      re.payroll_no;
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
    form_code: String(
      row.form_code || "",
    ).trim(),
    form_name: String(
      row.form_name || "",
    ).trim(),
    competency_evaluator_payroll_no:
      String(
        row.competency_evaluator_payroll_no ||
          "",
      ).trim(),
    competency_evaluator_full_name:
      String(
        row.competency_evaluator_full_name ||
          "",
      ).trim(),
    kpi_assignment_id: Number(
      row.kpi_assignment_id || 0,
    ),
    kpi_evaluator_payroll_no: String(
      row.kpi_evaluator_payroll_no || "",
    ).trim(),
    kpi_evaluator_full_name: String(
      row.kpi_evaluator_full_name || "",
    ).trim(),
    assignment_source_type: String(
      row.assignment_source_type || "",
    ).trim(),
    evaluation_started: Boolean(
      row.evaluation_started,
    ),
  })) as KpiEvaluatorRow[];
}

export default async function KpiAssignmentsPage() {
  await requireAdminSession();

  async function saveAssignments(
    _previousState: KpiEvaluatorActionState,
    formData: FormData,
  ): Promise<KpiEvaluatorActionState> {
    "use server";

    try {
      const session =
        await requireAdminSession();

      const actionType = String(
        formData.get("action_type") || "",
      ).trim();
      const roundId = Number(
        formData.get("round_id") || 0,
      );
      const sectionCode = String(
        formData.get("section_code") || "",
      ).trim();
      const manualEvaluatorPayrollNo =
        String(
          formData.get(
            "manual_evaluator_payroll_no",
          ) || "",
        ).trim();

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

      if (
        !["sync", "manual"].includes(
          actionType,
        )
      ) {
        return actionResult(
          false,
          "warning",
          "รูปแบบการกำหนดผู้ประเมินไม่ถูกต้อง",
        );
      }

      if (!roundId) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกรอบประเมิน",
        );
      }

      if (sectionCode.length !== 5) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกหน่วยเบิก 5 หลัก",
        );
      }

      if (roundEmployeeIds.length === 0) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกบุคลากรอย่างน้อย 1 คน",
        );
      }

      if (
        actionType === "manual" &&
        !manualEvaluatorPayrollNo
      ) {
        return actionResult(
          false,
          "warning",
          "กรุณาเลือกผู้ประเมินแบบกำหนดเอง",
        );
      }

      const pool = await getDbPool();
      const selectedJson = JSON.stringify(
        roundEmployeeIds,
      );

      if (actionType === "sync") {
        const result = await pool
          .request()
          .input(
            "round_id",
            sql.Int,
            roundId,
          )
          .input(
            "section_code",
            sql.VarChar(20),
            sectionCode,
          )
          .input(
            "selected_json",
            sql.NVarChar(sql.MAX),
            selectedJson,
          )
          .input(
            "changed_by",
            sql.VarChar(20),
            session.emp_id,
          )
          .query(`
            SET NOCOUNT ON;
            SET XACT_ABORT ON;

            IF NOT EXISTS
            (
              SELECT 1
              FROM dbo.competency_round
              WHERE round_id = @round_id
                AND status_type = 0
            )
            BEGIN
              THROW 52400,
                    N'รอบประเมินนี้ไม่อยู่ในสถานะที่แก้ไขผู้ประเมินได้',
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
              THROW 52401,
                    N'หน่วยเบิกนี้เป็นหน่วยเบิกที่ไม่ต้องประเมิน',
                    1;
            END;

            DECLARE @selected TABLE
            (
              round_employee_id int NOT NULL
                PRIMARY KEY
            );

            INSERT INTO @selected
            (
              round_employee_id
            )
            SELECT DISTINCT
              TRY_CONVERT(int, [value])
            FROM OPENJSON(@selected_json)
            WHERE TRY_CONVERT(int, [value])
                  IS NOT NULL;

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
              LEFT JOIN dbo.kpi_employee_form ef
                ON ef.round_employee_id =
                   re.round_employee_id
               AND ef.status_type = 0
              WHERE re.round_employee_id IS NULL
                 OR ef.employee_form_id IS NULL
            )
            BEGIN
              THROW 52402,
                    N'มีบุคลากรบางคนไม่อยู่ในรอบ หน่วยเบิก หรือยังไม่มีแบบฟอร์ม KPI',
                    1;
            END;

            DECLARE @results TABLE
            (
              round_employee_id int NOT NULL,
              sync_status int NOT NULL,
              sync_message nvarchar(2048)
            );

            DECLARE @round_employee_id int;

            DECLARE sync_cursor CURSOR LOCAL FAST_FORWARD
            FOR
                SELECT round_employee_id
                FROM @selected
                ORDER BY round_employee_id;

            OPEN sync_cursor;

            FETCH NEXT FROM sync_cursor
            INTO @round_employee_id;

            WHILE @@FETCH_STATUS = 0
            BEGIN
              DECLARE @one_result TABLE
              (
                sync_status int,
                sync_message nvarchar(2048)
              );

              INSERT INTO @one_result
              (
                sync_status,
                sync_message
              )
              EXEC dbo.sp_kpi_sync_evaluator_from_competency
                   @round_employee_id =
                       @round_employee_id,
                   @changed_by =
                       @changed_by;

              INSERT INTO @results
              (
                round_employee_id,
                sync_status,
                sync_message
              )
              SELECT
                @round_employee_id,
                sync_status,
                sync_message
              FROM @one_result;

              FETCH NEXT FROM sync_cursor
              INTO @round_employee_id;
            END;

            CLOSE sync_cursor;
            DEALLOCATE sync_cursor;

            SELECT
              SUM(
                CASE
                  WHEN sync_status = 3
                    THEN 1
                  ELSE 0
                END
              ) AS created_count,
              SUM(
                CASE
                  WHEN sync_status = 2
                    THEN 1
                  ELSE 0
                END
              ) AS updated_count,
              SUM(
                CASE
                  WHEN sync_status = 1
                    THEN 1
                  ELSE 0
                END
              ) AS no_supervisor_count,
              SUM(
                CASE
                  WHEN sync_status = 0
                    THEN 1
                  ELSE 0
                END
              ) AS manual_count,
              SUM(
                CASE
                  WHEN sync_status = 4
                    THEN 1
                  ELSE 0
                END
              ) AS blocked_count
            FROM @results;
          `);

        const row = result.recordset[0] || {};
        const createdCount = Number(
          row.created_count || 0,
        );
        const updatedCount = Number(
          row.updated_count || 0,
        );
        const noSupervisorCount = Number(
          row.no_supervisor_count || 0,
        );
        const manualCount = Number(
          row.manual_count || 0,
        );
        const blockedCount = Number(
          row.blocked_count || 0,
        );

        revalidatePath(PAGE_PATH);

        const parts = [
          `สร้างอัตโนมัติ ${createdCount.toLocaleString()} คน`,
          `ปรับตามหัวหน้าใกล้ชิด ${updatedCount.toLocaleString()} คน`,
        ];

        if (noSupervisorCount > 0) {
          parts.push(
            `ไม่มีหัวหน้าใกล้ชิดหรือยกเลิกอัตโนมัติ ${noSupervisorCount.toLocaleString()} คน`,
          );
        }

        if (manualCount > 0) {
          parts.push(
            `คงผู้ประเมินที่กำหนดเอง ${manualCount.toLocaleString()} คน`,
          );
        }

        if (blockedCount > 0) {
          parts.push(
            `ข้ามผู้เริ่มประเมินแล้ว ${blockedCount.toLocaleString()} คน`,
          );
        }

        return actionResult(
          true,
          noSupervisorCount +
              manualCount +
              blockedCount >
            0
            ? "warning"
            : "success",
          parts.join(" • "),
        );
      }

      const result = await pool
        .request()
        .input(
          "round_id",
          sql.Int,
          roundId,
        )
        .input(
          "section_code",
          sql.VarChar(20),
          sectionCode,
        )
        .input(
          "selected_json",
          sql.NVarChar(sql.MAX),
          selectedJson,
        )
        .input(
          "evaluator_payroll_no",
          sql.VarChar(20),
          manualEvaluatorPayrollNo,
        )
        .input(
          "changed_by",
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
              THROW 52410,
                    N'รอบประเมินนี้ไม่อยู่ในสถานะที่แก้ไขผู้ประเมินได้',
                    1;
            END;

            IF NOT EXISTS
            (
              SELECT 1
              FROM ${ssbDb()}.dbo.PYREXT p
              WHERE p.TERMINATEDATE IS NULL
                AND LTRIM(
                      RTRIM(
                        CAST(
                          p.PAYROLLNO AS varchar(20)
                        )
                      )
                    ) =
                    @evaluator_payroll_no
            )
            BEGIN
              THROW 52411,
                    N'ไม่พบผู้ประเมินที่เลือก หรือบุคลากรพ้นสภาพแล้ว',
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
              THROW 52412,
                    N'หน่วยเบิกนี้เป็นหน่วยเบิกที่ไม่ต้องประเมิน',
                    1;
            END;

            DECLARE @selected TABLE
            (
              round_employee_id int NOT NULL
                PRIMARY KEY
            );

            INSERT INTO @selected
            (
              round_employee_id
            )
            SELECT DISTINCT
              TRY_CONVERT(int, [value])
            FROM OPENJSON(@selected_json)
            WHERE TRY_CONVERT(int, [value])
                  IS NOT NULL;

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
              LEFT JOIN dbo.kpi_employee_form ef
                ON ef.round_employee_id =
                   re.round_employee_id
               AND ef.status_type = 0
              WHERE re.round_employee_id IS NULL
                 OR ef.employee_form_id IS NULL
            )
            BEGIN
              THROW 52413,
                    N'มีบุคลากรบางคนไม่อยู่ในรอบ หน่วยเบิก หรือยังไม่มีแบบฟอร์ม KPI',
                    1;
            END;

            DECLARE @self_count int;
            DECLARE @blocked_count int;
            DECLARE @same_count int;
            DECLARE @assigned_count int;

            SELECT
              @self_count = COUNT(*)
            FROM @selected s
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id =
                 s.round_employee_id
            WHERE LTRIM(
                    RTRIM(
                      CAST(
                        re.payroll_no AS varchar(20)
                      )
                    )
                  ) = @evaluator_payroll_no;

            SELECT
              @blocked_count = COUNT(*)
            FROM @selected s
            JOIN dbo.kpi_evaluator_assignment k
              ON k.round_employee_id =
                 s.round_employee_id
             AND k.status_type = 0
            WHERE EXISTS
            (
              SELECT 1
              FROM dbo.kpi_evaluation ev
              WHERE ev.kpi_assignment_id =
                    k.kpi_assignment_id
                AND ev.status_type <> 9
            );

            SELECT
              @same_count = COUNT(*)
            FROM @selected s
            JOIN dbo.kpi_evaluator_assignment k
              ON k.round_employee_id =
                 s.round_employee_id
             AND k.status_type = 0
             AND k.assignment_source_type =
                 'MANUAL'
             AND LTRIM(
                   RTRIM(
                     k.evaluator_payroll_no
                   )
                 ) = @evaluator_payroll_no
            WHERE NOT EXISTS
            (
              SELECT 1
              FROM dbo.kpi_evaluation ev
              WHERE ev.kpi_assignment_id =
                    k.kpi_assignment_id
                AND ev.status_type <> 9
            );

            UPDATE k
            SET status_type = 9,
                cancelled_date =
                    SYSDATETIME(),
                cancelled_by = @changed_by,
                updated_date =
                    SYSDATETIME(),
                updated_by = @changed_by
            FROM dbo.kpi_evaluator_assignment k
            JOIN @selected s
              ON s.round_employee_id =
                 k.round_employee_id
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id =
                 s.round_employee_id
            WHERE k.status_type = 0
              AND LTRIM(
                    RTRIM(
                      CAST(
                        re.payroll_no AS varchar(20)
                      )
                    )
                  ) <> @evaluator_payroll_no
              AND NOT
              (
                k.assignment_source_type =
                  'MANUAL'
                AND LTRIM(
                      RTRIM(
                        k.evaluator_payroll_no
                      )
                    ) =
                    @evaluator_payroll_no
              )
              AND NOT EXISTS
              (
                SELECT 1
                FROM dbo.kpi_evaluation ev
                WHERE ev.kpi_assignment_id =
                      k.kpi_assignment_id
                  AND ev.status_type <> 9
              );

            INSERT INTO dbo.kpi_evaluator_assignment
            (
              round_employee_id,
              evaluator_payroll_no,
              weight_percent,
              assignment_source_type,
              source_competency_assignment_id,
              status_type,
              created_by
            )
            SELECT
              s.round_employee_id,
              @evaluator_payroll_no,
              100,
              'MANUAL',
              NULL,
              0,
              @changed_by
            FROM @selected s
            JOIN dbo.competency_round_employee re
              ON re.round_employee_id =
                 s.round_employee_id
            WHERE LTRIM(
                    RTRIM(
                      CAST(
                        re.payroll_no AS varchar(20)
                      )
                    )
                  ) <> @evaluator_payroll_no
              AND NOT EXISTS
              (
                SELECT 1
                FROM dbo.kpi_evaluator_assignment k
                WHERE k.round_employee_id =
                      s.round_employee_id
                  AND k.status_type = 0
              );

            SET @assigned_count = @@ROWCOUNT;

            IF EXISTS
            (
              SELECT 1
              FROM dbo.competency_admin_user
              WHERE emp_id =
                    @evaluator_payroll_no
                AND admin_role_type = 0
            )
            BEGIN
              UPDATE dbo.competency_admin_user
              SET active_status = 1
              WHERE emp_id =
                    @evaluator_payroll_no
                AND admin_role_type = 0;
            END
            ELSE IF NOT EXISTS
            (
              SELECT 1
              FROM dbo.competency_admin_user
              WHERE emp_id =
                    @evaluator_payroll_no
            )
            BEGIN
              INSERT INTO dbo.competency_admin_user
              (
                emp_id,
                admin_role_type,
                active_status,
                created_date,
                created_by
              )
              VALUES
              (
                @evaluator_payroll_no,
                0,
                1,
                SYSDATETIME(),
                @changed_by
              );
            END;

            COMMIT TRANSACTION;

            SELECT
              @assigned_count AS assigned_count,
              @same_count AS same_count,
              @self_count AS self_count,
              @blocked_count AS blocked_count;
          END TRY
          BEGIN CATCH
            IF @@TRANCOUNT > 0
              ROLLBACK TRANSACTION;

            THROW;
          END CATCH;
        `);

      const row = result.recordset[0] || {};
      const assignedCount = Number(
        row.assigned_count || 0,
      );
      const sameCount = Number(
        row.same_count || 0,
      );
      const selfCount = Number(
        row.self_count || 0,
      );
      const blockedCount = Number(
        row.blocked_count || 0,
      );

      revalidatePath(PAGE_PATH);

      const parts = [
        `กำหนดผู้ประเมินสำเร็จ ${assignedCount.toLocaleString()} คน`,
      ];

      if (sameCount > 0) {
        parts.push(
          `ใช้ผู้ประเมินคนนี้อยู่แล้ว ${sameCount.toLocaleString()} คน`,
        );
      }

      if (selfCount > 0) {
        parts.push(
          `ข้ามการประเมินตนเอง ${selfCount.toLocaleString()} คน`,
        );
      }

      if (blockedCount > 0) {
        parts.push(
          `ข้ามผู้เริ่มประเมินแล้ว ${blockedCount.toLocaleString()} คน`,
        );
      }

      return actionResult(
        true,
        selfCount + blockedCount > 0
          ? "warning"
          : "success",
        parts.join(" • "),
      );
    } catch (error) {
      console.error(
        "save KPI evaluator assignment error:",
        error,
      );

      return actionResult(
        false,
        "error",
        adminErrorMessage(error),
      );
    }
  }

  const [
    rounds,
    sections,
    evaluators,
    rows,
  ] = await Promise.all([
    getRounds(),
    getSections(),
    getEvaluators(),
    getRows(),
  ]);

  return (
    <div>
      <PageHeader
        title="ผู้ประเมิน KPI"
        description="เชื่อมผู้ประเมินระดับ 1 จาก Competency อัตโนมัติ หรือกำหนดผู้ประเมิน KPI คนอื่นด้วยน้ำหนัก 100%"
      />

      <KpiEvaluatorAssignment
        rounds={rounds}
        sections={sections}
        evaluators={evaluators}
        rows={rows}
        saveAction={saveAssignments}
      />
    </div>
  );
}