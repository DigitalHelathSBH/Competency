import ProfessionQuestionMapFormTable, {
  type ProfessionQuestionOption,
  type PositionOption,
  type ProfessionQuestionMapItem,
} from "@/components/competency/ProfessionQuestionMapFormTable";
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

const PAGE_PATH = "/admin/profession-questions";

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
}

async function getPositions() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))) AS position_code,
      ISNULL(
        NULLIF(LTRIM(RTRIM(pv.PositionName)), ''),
        LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20))))
      ) AS position_name
    FROM ${ssbDb()}.dbo.PYREXT p
    LEFT JOIN ${ssbDb()}.dbo.PositionView pv
      ON pv.PositionCode = p.POSITIONCODE
    WHERE p.TERMINATEDATE IS NULL
      AND NULLIF(
        LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))),
        ''
      ) IS NOT NULL
      AND NOT EXISTS
      (
        SELECT 1
        FROM dbo.competency_excluded_section e
        WHERE e.section_code =
              LTRIM(RTRIM(CAST(p.SECTION AS varchar(20))))
          AND e.active_status = 1
      )
    GROUP BY
      LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))),
      pv.PositionName
    ORDER BY
      position_name,
      position_code;
  `);

  return result.recordset.map((row) => ({
    position_code: String(row.position_code || "").trim(),
    position_name: String(row.position_name || row.position_code || "").trim(),
  })) as PositionOption[];
}

async function getProfessionQuestions() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      q.question_id,
      qv.question_title,
      qv.version_no
    FROM dbo.competency_question q
    JOIN dbo.competency_question_version qv
      ON qv.question_id = q.question_id
     AND qv.is_current = 1
     AND qv.active_status = 1
    WHERE q.question_scope = 'PROFESSION'
      AND q.active_status = 1
    ORDER BY qv.question_title, q.question_id;
  `);

  return result.recordset.map((row) => ({
    question_id: Number(row.question_id),
    question_title: String(row.question_title || "").trim(),
    version_no: Number(row.version_no || 0),
  })) as ProfessionQuestionOption[];
}

async function getProfessionQuestionMaps() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      m.position_code,
      ISNULL(
        NULLIF(LTRIM(RTRIM(pv.PositionName)), ''),
        m.position_code
      ) AS position_name,

      MAX(CASE WHEN m.question_no = 5 THEN m.question_id END) AS question_5_id,
      MAX(CASE WHEN m.question_no = 5 THEN qv.question_title END) AS question_5_title,

      MAX(CASE WHEN m.question_no = 6 THEN m.question_id END) AS question_6_id,
      MAX(CASE WHEN m.question_no = 6 THEN qv.question_title END) AS question_6_title,

      MAX(CASE WHEN m.question_no = 7 THEN m.question_id END) AS question_7_id,
      MAX(CASE WHEN m.question_no = 7 THEN qv.question_title END) AS question_7_title,

      CASE
        WHEN COUNT(DISTINCT m.question_no) = 3
         AND SUM(CASE WHEN m.active_status = 1 THEN 1 ELSE 0 END) = 3
        THEN CAST(1 AS bit)
        ELSE CAST(0 AS bit)
      END AS active_status
    FROM dbo.competency_profession_question_map m
    LEFT JOIN ${ssbDb()}.dbo.PositionView pv
      ON pv.PositionCode = m.position_code
    LEFT JOIN dbo.competency_question q
      ON q.question_id = m.question_id
    OUTER APPLY
    (
      SELECT TOP (1)
        v.question_title
      FROM dbo.competency_question_version v
      WHERE v.question_id = q.question_id
        AND v.is_current = 1
        AND v.active_status = 1
      ORDER BY v.version_no DESC, v.question_version_id DESC
    ) qv
    GROUP BY
      m.position_code,
      pv.PositionName
    ORDER BY
      position_name,
      m.position_code;
  `);

  return result.recordset.map((row) => ({
    position_code: String(row.position_code || "").trim(),
    position_name: String(row.position_name || row.position_code || "").trim(),
    question_5_id: Number(row.question_5_id || 0),
    question_5_title: String(row.question_5_title || "").trim(),
    question_6_id: Number(row.question_6_id || 0),
    question_6_title: String(row.question_6_title || "").trim(),
    question_7_id: Number(row.question_7_id || 0),
    question_7_title: String(row.question_7_title || "").trim(),
    active_status: Boolean(row.active_status),
  })) as ProfessionQuestionMapItem[];
}

function parsePositionCode(formData: FormData) {
  const positionCode = String(formData.get("position_code") || "").trim();

  if (!positionCode) {
    throw new Error("กรุณาเลือกวิชาชีพ");
  }

  if (positionCode.length > 20) {
    throw new Error("รหัสวิชาชีพไม่ถูกต้อง");
  }

  return positionCode;
}

function parseQuestionIds(formData: FormData) {
  const question5Id = Number(formData.get("question_5_id"));
  const question6Id = Number(formData.get("question_6_id"));
  const question7Id = Number(formData.get("question_7_id"));

  if (!question5Id || !question6Id || !question7Id) {
    throw new Error("กรุณาเลือกหัวข้อประเมินให้ครบข้อ 5 ถึงข้อ 7");
  }

  const uniqueQuestionIds = new Set([
    question5Id,
    question6Id,
    question7Id,
  ]);

  if (uniqueQuestionIds.size !== 3) {
    throw new Error("หัวข้อข้อ 5 ถึงข้อ 7 ต้องไม่ซ้ำกัน");
  }

  return {
    question5Id,
    question6Id,
    question7Id,
  };
}

async function validatePositionAndQuestions(
  transaction: InstanceType<typeof sql.Transaction>,
  positionCode: string,
  questionIds: number[],
) {
  const positionRequest = new sql.Request(transaction);
  const positionResult = await positionRequest
    .input("position_code", sql.VarChar(20), positionCode)
    .query(`
      SELECT TOP (1) 1 AS found
      FROM ${ssbDb()}.dbo.PYREXT p
      WHERE LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))) = @position_code
        AND p.TERMINATEDATE IS NULL
        AND NOT EXISTS
        (
          SELECT 1
          FROM dbo.competency_excluded_section e
          WHERE e.section_code =
                LTRIM(RTRIM(CAST(p.SECTION AS varchar(20))))
            AND e.active_status = 1
        );
    `);

  if (positionResult.recordset.length === 0) {
    throw new Error("ไม่พบวิชาชีพที่เลือก หรือวิชาชีพนี้ไม่อยู่ในรายการประเมิน");
  }

  for (const questionId of questionIds) {
    const questionRequest = new sql.Request(transaction);
    const questionResult = await questionRequest
      .input("question_id", sql.Int, questionId)
      .query(`
        SELECT TOP (1) 1 AS found
        FROM dbo.competency_question q
        JOIN dbo.competency_question_version qv
          ON qv.question_id = q.question_id
         AND qv.is_current = 1
         AND qv.active_status = 1
        WHERE q.question_id = @question_id
          AND q.question_scope = 'PROFESSION'
          AND q.active_status = 1;
      `);

    if (questionResult.recordset.length === 0) {
      throw new Error("มีหัวข้อประเมินบางรายการที่ไม่พร้อมใช้งาน กรุณาเลือกใหม่");
    }
  }
}

export default async function ProfessionQuestionsPage() {
  await requireAdminSession();

  async function createProfessionQuestionMap(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const positionCode = parsePositionCode(formData);
    const { question5Id, question6Id, question7Id } =
      parseQuestionIds(formData);

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await validatePositionAndQuestions(transaction, positionCode, [
        question5Id,
        question6Id,
        question7Id,
      ]);

      const duplicateRequest = new sql.Request(transaction);
      const duplicateResult = await duplicateRequest
        .input("position_code", sql.VarChar(20), positionCode)
        .query(`
          SELECT TOP (1) profession_question_map_id
          FROM dbo.competency_profession_question_map
          WHERE position_code = @position_code;
        `);

      if (duplicateResult.recordset.length > 0) {
        throw new Error("วิชาชีพนี้ถูกกำหนดหัวข้อไว้แล้ว กรุณาแก้ไขรายการเดิม");
      }

      const items = [
        { questionNo: 5, questionId: question5Id },
        { questionNo: 6, questionId: question6Id },
        { questionNo: 7, questionId: question7Id },
      ];

      for (const item of items) {
        const insertRequest = new sql.Request(transaction);
        await insertRequest
          .input("position_code", sql.VarChar(20), positionCode)
          .input("question_no", sql.TinyInt, item.questionNo)
          .input("question_id", sql.Int, item.questionId)
          .input("created_by", sql.VarChar(20), session.emp_id)
          .query(`
            INSERT INTO dbo.competency_profession_question_map
            (
              position_code,
              question_no,
              question_id,
              active_status,
              created_date,
              created_by
            )
            VALUES
            (
              @position_code,
              @question_no,
              @question_id,
              1,
              SYSDATETIME(),
              @created_by
            );
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }

    revalidatePath(PAGE_PATH);
    revalidatePath("/admin/round-readiness");
    revalidatePath("/admin/round-issues");
  }

  async function updateProfessionQuestionMap(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const positionCode = parsePositionCode(formData);
    const { question5Id, question6Id, question7Id } =
      parseQuestionIds(formData);

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await validatePositionAndQuestions(transaction, positionCode, [
        question5Id,
        question6Id,
        question7Id,
      ]);

      const existingRequest = new sql.Request(transaction);
      const existingResult = await existingRequest
        .input("position_code", sql.VarChar(20), positionCode)
        .query(`
          SELECT
            COUNT(*) AS row_count,
            COUNT(DISTINCT question_no) AS question_count
          FROM dbo.competency_profession_question_map
          WHERE position_code = @position_code;
        `);

      const existing = existingResult.recordset[0];

      if (
        !existing ||
        Number(existing.row_count) !== 3 ||
        Number(existing.question_count) !== 3
      ) {
        throw new Error("ข้อมูลหัวข้อของวิชาชีพนี้ไม่ครบ กรุณาตรวจสอบข้อมูลก่อนแก้ไข");
      }

      const items = [
        { questionNo: 5, questionId: question5Id },
        { questionNo: 6, questionId: question6Id },
        { questionNo: 7, questionId: question7Id },
      ];

      for (const item of items) {
        const updateRequest = new sql.Request(transaction);
        await updateRequest
          .input("position_code", sql.VarChar(20), positionCode)
          .input("question_no", sql.TinyInt, item.questionNo)
          .input("question_id", sql.Int, item.questionId)
          .input("updated_by", sql.VarChar(20), session.emp_id)
          .query(`
            UPDATE dbo.competency_profession_question_map
            SET question_id = @question_id,
                updated_date = SYSDATETIME(),
                updated_by = @updated_by
            WHERE position_code = @position_code
              AND question_no = @question_no;
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }

    revalidatePath(PAGE_PATH);
    revalidatePath("/admin/round-readiness");
    revalidatePath("/admin/round-issues");
  }

  async function toggleProfessionQuestionMapStatus(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const positionCode = parsePositionCode(formData);
    const activeStatus = Number(formData.get("active_status")) === 1;

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const mapRequest = new sql.Request(transaction);
      const mapResult = await mapRequest
        .input("position_code", sql.VarChar(20), positionCode)
        .query(`
          SELECT
            m.question_no,
            m.question_id,
            q.question_scope,
            q.active_status AS question_active_status,
            CASE WHEN qv.question_version_id IS NULL THEN 0 ELSE 1 END AS has_current_version
          FROM dbo.competency_profession_question_map m
          LEFT JOIN dbo.competency_question q
            ON q.question_id = m.question_id
          OUTER APPLY
          (
            SELECT TOP (1) v.question_version_id
            FROM dbo.competency_question_version v
            WHERE v.question_id = q.question_id
              AND v.is_current = 1
              AND v.active_status = 1
            ORDER BY v.version_no DESC, v.question_version_id DESC
          ) qv
          WHERE m.position_code = @position_code
          ORDER BY m.question_no;
        `);

      if (mapResult.recordset.length !== 3) {
        throw new Error("ข้อมูลหัวข้อของวิชาชีพนี้ไม่ครบ ไม่สามารถเปลี่ยนสถานะได้");
      }

      if (activeStatus) {
        const questionNos = new Set(
          mapResult.recordset.map((row) => Number(row.question_no)),
        );
        const questionIds = new Set(
          mapResult.recordset.map((row) => Number(row.question_id)),
        );
        const allQuestionsReady = mapResult.recordset.every(
          (row) =>
            String(row.question_scope || "") === "PROFESSION" &&
            Boolean(row.question_active_status) &&
            Boolean(row.has_current_version),
        );

        if (
          questionNos.size !== 3 ||
          !questionNos.has(5) ||
          !questionNos.has(6) ||
          !questionNos.has(7) ||
          questionIds.size !== 3 ||
          !allQuestionsReady
        ) {
          throw new Error("กรุณาแก้ไขหัวข้อให้ครบและพร้อมใช้งานก่อนเปิดใช้งาน");
        }

        const positionRequest = new sql.Request(transaction);
        const positionResult = await positionRequest
          .input("position_code", sql.VarChar(20), positionCode)
          .query(`
            SELECT TOP (1) 1 AS found
            FROM ${ssbDb()}.dbo.PYREXT p
            WHERE LTRIM(RTRIM(CAST(p.POSITIONCODE AS varchar(20)))) = @position_code
              AND p.TERMINATEDATE IS NULL
              AND NOT EXISTS
              (
                SELECT 1
                FROM dbo.competency_excluded_section e
                WHERE e.section_code =
                      LTRIM(RTRIM(CAST(p.SECTION AS varchar(20))))
                  AND e.active_status = 1
              );
          `);

        if (positionResult.recordset.length === 0) {
          throw new Error("ไม่สามารถเปิดใช้งานได้ เนื่องจากวิชาชีพนี้ไม่อยู่ในรายการประเมิน");
        }
      }

      const updateRequest = new sql.Request(transaction);
      await updateRequest
        .input("position_code", sql.VarChar(20), positionCode)
        .input("active_status", sql.Bit, activeStatus)
        .input("updated_by", sql.VarChar(20), session.emp_id)
        .query(`
          UPDATE dbo.competency_profession_question_map
          SET active_status = @active_status,
              updated_date = SYSDATETIME(),
              updated_by = @updated_by
          WHERE position_code = @position_code;
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }

    revalidatePath(PAGE_PATH);
    revalidatePath("/admin/round-readiness");
    revalidatePath("/admin/round-issues");
  }

  const [positions, professionQuestions, professionQuestionMaps] =
    await Promise.all([
      getPositions(),
      getProfessionQuestions(),
      getProfessionQuestionMaps(),
    ]);

  return (
    <div>
      <PageHeader
        title="หัวข้อประเมินตามวิชาชีพ"
        description="กำหนดหัวข้อเพิ่มเติมข้อ 5 ถึงข้อ 7 ให้เหมาะกับการปฏิบัติงานของแต่ละวิชาชีพ"
      />

      <ProfessionQuestionMapFormTable
        positions={positions}
        professionQuestions={professionQuestions}
        professionQuestionMaps={professionQuestionMaps}
        createAction={createProfessionQuestionMap}
        updateAction={updateProfessionQuestionMap}
        toggleAction={toggleProfessionQuestionMapStatus}
      />
    </div>
  );
}