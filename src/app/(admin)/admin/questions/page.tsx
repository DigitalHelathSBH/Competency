import QuestionTopicFormTable, {
  type QuestionTopicItem,
  type RankGroupOption,
} from "@/components/competency/QuestionTopicFormTable";
import PageHeader from "@/components/competency/PageHeader";
import { getDbPool, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/questions";

type DescriptionInput = {
  rankGroupId: number;
  descriptionText: string;
};

async function getRankGroups() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT
      rank_group_id,
      rank_group_name,
      sort_order
    FROM dbo.competency_rank_group
    WHERE active_status = 1
    ORDER BY sort_order, rank_group_id;
  `);

  return result.recordset.map((row) => ({
    rank_group_id: Number(row.rank_group_id),
    rank_group_name: String(row.rank_group_name || "").trim(),
    sort_order: Number(row.sort_order || 0),
  })) as RankGroupOption[];
}

async function getQuestions() {
  const pool = await getDbPool();

  const questionResult = await pool.request().query(`
    SELECT
      q.question_id,
      q.question_scope,
      q.fixed_question_no,
      q.max_score,
      q.active_status,
      v.question_version_id,
      v.version_no,
      v.question_title
    FROM dbo.competency_question q
    OUTER APPLY
    (
      SELECT TOP (1)
        qv.question_version_id,
        qv.version_no,
        qv.question_title
      FROM dbo.competency_question_version qv
      WHERE qv.question_id = q.question_id
        AND qv.is_current = 1
        AND qv.active_status = 1
      ORDER BY qv.version_no DESC, qv.question_version_id DESC
    ) v
    ORDER BY
      CASE WHEN q.question_scope = 'COMMON' THEN 0 ELSE 1 END,
      ISNULL(q.fixed_question_no, 99),
      v.question_title,
      q.question_id;
  `);

  const descriptionResult = await pool.request().query(`
    SELECT
      d.question_version_id,
      d.rank_group_id,
      d.description_text
    FROM dbo.competency_question_description_version d
    WHERE d.active_status = 1
    ORDER BY d.question_version_id, d.rank_group_id;
  `);

  const descriptionMap = new Map<
    number,
    { rank_group_id: number; description_text: string }[]
  >();

  for (const row of descriptionResult.recordset) {
    const questionVersionId = Number(row.question_version_id);
    const items = descriptionMap.get(questionVersionId) || [];

    items.push({
      rank_group_id: Number(row.rank_group_id),
      description_text: String(row.description_text || "").trim(),
    });

    descriptionMap.set(questionVersionId, items);
  }

  return questionResult.recordset.map((row) => {
    const questionVersionId = Number(row.question_version_id || 0);

    return {
      question_id: Number(row.question_id),
      question_scope:
        String(row.question_scope || "PROFESSION") === "COMMON"
          ? "COMMON"
          : "PROFESSION",
      fixed_question_no:
        row.fixed_question_no === null || row.fixed_question_no === undefined
          ? null
          : Number(row.fixed_question_no),
      max_score: Number(row.max_score || 0),
      active_status: Boolean(row.active_status),
      question_version_id: questionVersionId,
      version_no: Number(row.version_no || 0),
      question_title: String(row.question_title || "").trim(),
      descriptions: descriptionMap.get(questionVersionId) || [],
    };
  }) as QuestionTopicItem[];
}

function parseQuestionScope(formData: FormData) {
  const questionScope = String(formData.get("question_scope") || "").trim();

  if (questionScope !== "COMMON" && questionScope !== "PROFESSION") {
    throw new Error("กรุณาเลือกประเภทหัวข้อประเมิน");
  }

  return questionScope;
}

function parseFixedQuestionNo(
  formData: FormData,
  questionScope: "COMMON" | "PROFESSION",
) {
  if (questionScope === "PROFESSION") return null;

  const fixedQuestionNo = Number(formData.get("fixed_question_no"));

  if (![1, 2, 3, 4].includes(fixedQuestionNo)) {
    throw new Error("กรุณาเลือกเลขข้อส่วนกลางตั้งแต่ข้อ 1 ถึงข้อ 4");
  }

  return fixedQuestionNo;
}

function parseMaxScore(formData: FormData) {
  const maxScoreText = String(formData.get("max_score") || "").trim();
  const maxScore = Number(maxScoreText);

  if (
    maxScoreText === "" ||
    !Number.isFinite(maxScore) ||
    maxScore <= 0 ||
    maxScore > 100
  ) {
    throw new Error("กรุณาระบุคะแนนเต็มมากกว่า 0 และไม่เกิน 100");
  }

  return Number(maxScore.toFixed(2));
}

function parseQuestionTitle(formData: FormData) {
  const questionTitle = String(formData.get("question_title") || "").trim();

  if (!questionTitle) {
    throw new Error("กรุณาระบุชื่อหัวข้อประเมิน");
  }

  if (questionTitle.length > 500) {
    throw new Error("ชื่อหัวข้อประเมินต้องไม่เกิน 500 ตัวอักษร");
  }

  return questionTitle;
}

async function getActiveRankGroupIds() {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT rank_group_id
    FROM dbo.competency_rank_group
    WHERE active_status = 1
    ORDER BY sort_order, rank_group_id;
  `);

  return result.recordset.map((row) => Number(row.rank_group_id));
}

function parseDescriptions(
  formData: FormData,
  activeRankGroupIds: number[],
): DescriptionInput[] {
  if (activeRankGroupIds.length === 0) {
    throw new Error("กรุณาสร้างกลุ่มระดับที่เปิดใช้งานก่อนเพิ่มหัวข้อประเมิน");
  }

  return activeRankGroupIds.map((rankGroupId) => {
    const descriptionText = String(
      formData.get(`description_${rankGroupId}`) || "",
    ).trim();

    if (!descriptionText) {
      throw new Error("กรุณาระบุคำอธิบายให้ครบทุกกลุ่มระดับ");
    }

    return {
      rankGroupId,
      descriptionText,
    };
  });
}

export default async function QuestionsPage() {
  await requireAdminSession();

  async function createQuestion(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const questionScope = parseQuestionScope(formData);
    const fixedQuestionNo = parseFixedQuestionNo(formData, questionScope);
    const maxScore = parseMaxScore(formData);
    const questionTitle = parseQuestionTitle(formData);
    const activeRankGroupIds = await getActiveRankGroupIds();
    const descriptions = parseDescriptions(formData, activeRankGroupIds);

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      if (questionScope === "COMMON") {
        const duplicateRequest = new sql.Request(transaction);
        const duplicateResult = await duplicateRequest.input(
          "fixed_question_no",
          sql.TinyInt,
          fixedQuestionNo,
        ).query(`
            SELECT TOP (1) question_id
            FROM dbo.competency_question
            WHERE question_scope = 'COMMON'
              AND fixed_question_no = @fixed_question_no
              AND active_status = 1;
          `);

        if (duplicateResult.recordset.length > 0) {
          throw new Error(
            `ข้อ ${fixedQuestionNo} มีหัวข้อที่เปิดใช้งานอยู่แล้ว`,
          );
        }
      }

      const questionRequest = new sql.Request(transaction);
      const questionResult = await questionRequest
        .input("question_scope", sql.VarChar(20), questionScope)
        .input("fixed_question_no", sql.TinyInt, fixedQuestionNo)
        .input("max_score", sql.Decimal(5, 2), maxScore)
        .input("created_by", sql.VarChar(20), session.emp_id).query(`
          INSERT INTO dbo.competency_question
          (
            question_scope,
            fixed_question_no,
            max_score,
            active_status,
            created_date,
            created_by
          )
          OUTPUT INSERTED.question_id
          VALUES
          (
            @question_scope,
            @fixed_question_no,
            @max_score,
            1,
            SYSDATETIME(),
            @created_by
          );
        `);

      const questionId = Number(questionResult.recordset[0].question_id);

      const versionRequest = new sql.Request(transaction);
      const versionResult = await versionRequest
        .input("question_id", sql.Int, questionId)
        .input("question_title", sql.NVarChar(500), questionTitle)
        .input("created_by", sql.VarChar(20), session.emp_id).query(`
          INSERT INTO dbo.competency_question_version
          (
            question_id,
            version_no,
            question_title,
            is_current,
            active_status,
            created_date,
            created_by
          )
          OUTPUT INSERTED.question_version_id
          VALUES
          (
            @question_id,
            1,
            @question_title,
            1,
            1,
            SYSDATETIME(),
            @created_by
          );
        `);

      const questionVersionId = Number(
        versionResult.recordset[0].question_version_id,
      );

      for (const description of descriptions) {
        const descriptionRequest = new sql.Request(transaction);
        await descriptionRequest
          .input("question_version_id", sql.Int, questionVersionId)
          .input("rank_group_id", sql.Int, description.rankGroupId)
          .input(
            "description_text",
            sql.NVarChar(sql.MAX),
            description.descriptionText,
          )
          .input("created_by", sql.VarChar(20), session.emp_id).query(`
            INSERT INTO dbo.competency_question_description_version
            (
              question_version_id,
              rank_group_id,
              description_text,
              active_status,
              created_date,
              created_by
            )
            VALUES
            (
              @question_version_id,
              @rank_group_id,
              @description_text,
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
  }

  async function updateQuestion(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const questionId = Number(formData.get("question_id"));
    const maxScore = parseMaxScore(formData);
    const questionTitle = parseQuestionTitle(formData);
    const activeRankGroupIds = await getActiveRankGroupIds();
    const descriptions = parseDescriptions(formData, activeRankGroupIds);

    if (!questionId) {
      throw new Error("ไม่พบหัวข้อที่ต้องการแก้ไข");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const currentRequest = new sql.Request(transaction);
      const currentResult = await currentRequest.input(
        "question_id",
        sql.Int,
        questionId,
      ).query(`
          SELECT TOP (1)
            q.question_id,
            qv.question_version_id,
            qv.version_no,
            CASE WHEN EXISTS
            (
              SELECT 1
              FROM dbo.competency_round_question rq
              WHERE rq.question_version_id = qv.question_version_id
            ) THEN 1 ELSE 0 END AS is_used
          FROM dbo.competency_question q
          JOIN dbo.competency_question_version qv
            ON qv.question_id = q.question_id
           AND qv.is_current = 1
           AND qv.active_status = 1
          WHERE q.question_id = @question_id
          ORDER BY qv.version_no DESC, qv.question_version_id DESC;
        `);

      const current = currentResult.recordset[0];

      if (!current) {
        throw new Error("ไม่พบหัวข้อที่ต้องการแก้ไข");
      }

      const currentVersionId = Number(current.question_version_id);
      const currentVersionNo = Number(current.version_no);
      const isUsed = Boolean(current.is_used);

      const questionRequest = new sql.Request(transaction);
      await questionRequest
        .input("question_id", sql.Int, questionId)
        .input("max_score", sql.Decimal(5, 2), maxScore)
        .input("updated_by", sql.VarChar(20), session.emp_id).query(`
          UPDATE dbo.competency_question
          SET max_score = @max_score,
              updated_date = SYSDATETIME(),
              updated_by = @updated_by
          WHERE question_id = @question_id;
        `);

      let targetVersionId = currentVersionId;

      if (isUsed) {
        const closeVersionRequest = new sql.Request(transaction);
        await closeVersionRequest
          .input("question_version_id", sql.Int, currentVersionId)
          .input("updated_by", sql.VarChar(20), session.emp_id).query(`
            UPDATE dbo.competency_question_version
            SET is_current = 0,
                updated_date = SYSDATETIME(),
                updated_by = @updated_by
            WHERE question_version_id = @question_version_id;
          `);

        const newVersionRequest = new sql.Request(transaction);
        const newVersionResult = await newVersionRequest
          .input("question_id", sql.Int, questionId)
          .input("version_no", sql.Int, currentVersionNo + 1)
          .input("question_title", sql.NVarChar(500), questionTitle)
          .input("created_by", sql.VarChar(20), session.emp_id).query(`
            INSERT INTO dbo.competency_question_version
            (
              question_id,
              version_no,
              question_title,
              is_current,
              active_status,
              created_date,
              created_by
            )
            OUTPUT INSERTED.question_version_id
            VALUES
            (
              @question_id,
              @version_no,
              @question_title,
              1,
              1,
              SYSDATETIME(),
              @created_by
            );
          `);

        targetVersionId = Number(
          newVersionResult.recordset[0].question_version_id,
        );
      } else {
        const updateVersionRequest = new sql.Request(transaction);
        await updateVersionRequest
          .input("question_version_id", sql.Int, currentVersionId)
          .input("question_title", sql.NVarChar(500), questionTitle)
          .input("updated_by", sql.VarChar(20), session.emp_id).query(`
            UPDATE dbo.competency_question_version
            SET question_title = @question_title,
                updated_date = SYSDATETIME(),
                updated_by = @updated_by
            WHERE question_version_id = @question_version_id;
          `);
      }

      for (const description of descriptions) {
        const descriptionRequest = new sql.Request(transaction);
        await descriptionRequest
          .input("question_version_id", sql.Int, targetVersionId)
          .input("rank_group_id", sql.Int, description.rankGroupId)
          .input(
            "description_text",
            sql.NVarChar(sql.MAX),
            description.descriptionText,
          )
          .input("changed_by", sql.VarChar(20), session.emp_id).query(`
            IF EXISTS
            (
              SELECT 1
              FROM dbo.competency_question_description_version
              WHERE question_version_id = @question_version_id
                AND rank_group_id = @rank_group_id
            )
            BEGIN
              UPDATE dbo.competency_question_description_version
              SET description_text = @description_text,
                  active_status = 1,
                  updated_date = SYSDATETIME(),
                  updated_by = @changed_by
              WHERE question_version_id = @question_version_id
                AND rank_group_id = @rank_group_id;
            END
            ELSE
            BEGIN
              INSERT INTO dbo.competency_question_description_version
              (
                question_version_id,
                rank_group_id,
                description_text,
                active_status,
                created_date,
                created_by
              )
              VALUES
              (
                @question_version_id,
                @rank_group_id,
                @description_text,
                1,
                SYSDATETIME(),
                @changed_by
              );
            END;
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }

    revalidatePath(PAGE_PATH);
  }

  async function toggleQuestionStatus(formData: FormData) {
    "use server";

    const session = await requireAdminSession();
    const questionId = Number(formData.get("question_id"));
    const activeStatus = Number(formData.get("active_status")) === 1;

    if (!questionId) {
      throw new Error("ไม่พบหัวข้อที่ต้องการเปลี่ยนสถานะ");
    }

    const pool = await getDbPool();
    await pool
      .request()
      .input("question_id", sql.Int, questionId)
      .input("active_status", sql.Bit, activeStatus)
      .input("updated_by", sql.VarChar(20), session.emp_id).query(`
        DECLARE @question_scope VARCHAR(20);
        DECLARE @fixed_question_no TINYINT;
        DECLARE @question_version_id INT;

        SELECT
          @question_scope = q.question_scope,
          @fixed_question_no = q.fixed_question_no,
          @question_version_id = qv.question_version_id
        FROM dbo.competency_question q
        OUTER APPLY
        (
          SELECT TOP (1) question_version_id
          FROM dbo.competency_question_version
          WHERE question_id = q.question_id
            AND is_current = 1
            AND active_status = 1
          ORDER BY version_no DESC, question_version_id DESC
        ) qv
        WHERE q.question_id = @question_id;

        IF @question_scope IS NULL
        BEGIN
          THROW 50070, N'ไม่พบหัวข้อที่ต้องการเปลี่ยนสถานะ', 1;
        END;

        IF @active_status = 1
           AND @question_scope = 'COMMON'
           AND EXISTS
           (
             SELECT 1
             FROM dbo.competency_question
             WHERE question_scope = 'COMMON'
               AND fixed_question_no = @fixed_question_no
               AND active_status = 1
               AND question_id <> @question_id
           )
        BEGIN
          THROW 50071, N'เลขข้อนี้มีหัวข้อที่เปิดใช้งานอยู่แล้ว', 1;
        END;

        IF @active_status = 1
           AND @question_version_id IS NULL
        BEGIN
          THROW 50072, N'หัวข้อนี้ยังไม่มีข้อมูลฉบับปัจจุบัน', 1;
        END;

        IF @active_status = 1
           AND EXISTS
           (
             SELECT 1
             FROM dbo.competency_rank_group rg
             WHERE rg.active_status = 1
               AND NOT EXISTS
               (
                 SELECT 1
                 FROM dbo.competency_question_description_version d
                 WHERE d.question_version_id = @question_version_id
                   AND d.rank_group_id = rg.rank_group_id
                   AND d.active_status = 1
                   AND NULLIF(LTRIM(RTRIM(d.description_text)), '') IS NOT NULL
               )
           )
        BEGIN
          THROW 50073, N'กรุณาระบุคำอธิบายให้ครบทุกกลุ่มระดับก่อนเปิดใช้งาน', 1;
        END;

        UPDATE dbo.competency_question
        SET active_status = @active_status,
            updated_date = SYSDATETIME(),
            updated_by = @updated_by
        WHERE question_id = @question_id;

        IF @active_status = 0
        BEGIN
          UPDATE dbo.competency_section_question_map
          SET active_status = 0,
              updated_date = SYSDATETIME(),
              updated_by = @updated_by
          WHERE question_id = @question_id
            AND active_status = 1;
        END;
      `);

    revalidatePath(PAGE_PATH);
  }

  const [rankGroups, questions] = await Promise.all([
    getRankGroups(),
    getQuestions(),
  ]);

  return (
    <div>
      <PageHeader
        title="หัวข้อประเมิน"
        description="จัดการหัวข้อส่วนกลางและหัวข้อตามวิชาชีพ พร้อมคำอธิบายสำหรับแต่ละกลุ่มระดับ"
      />

      <QuestionTopicFormTable
        rankGroups={rankGroups}
        questions={questions}
        createAction={createQuestion}
        updateAction={updateQuestion}
        toggleAction={toggleQuestionStatus}
      />
    </div>
  );
}