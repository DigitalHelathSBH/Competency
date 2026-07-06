import DataTable from "@/components/competency/DataTable";
import PageHeader from "@/components/competency/PageHeader";
import QuestionEditModal from "@/components/competency/QuestionEditModal";
import SearchableSelect from "@/components/competency/SearchableSelect";
import ActionAlert from "@/components/competency/ActionAlert";
import QuestionVersionModal, {
  QuestionVersionItem,
} from "@/components/competency/QuestionVersionModal";
import { redirect } from "next/navigation";
import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type QuestionRow = {
  question_id: number;
  question_no: number;
  question_scope: string;
  position_code: string | null;
  position_name: string | null;
  max_score: number;
  active_status: boolean;
  question_version_id: number | null;
  version_no: number | null;
  question_title: string | null;
  current_version_used_count: number;
};

type PositionRow = {
  position_code: string;
  position_name: string;
};

function ssbDb() {
  return quoteSqlName(getSsbDatabaseName());
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

const orangeActionButtonClass =
  "rounded-lg border border-[#f8ac59] bg-[#f8ac59] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#f39b36]";

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

function questionScopeText(scope: string) {
  if (scope === "COMMON") return "ใช้ทั้งโรงพยาบาล";
  if (scope === "PROFESSION") return "แยกตามวิชาชีพ";
  return scope;
}

async function getQuestions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      q.question_id,
      q.question_no,
      q.question_scope,
      q.position_code,
      p.PositionName AS position_name,
      q.max_score,
      q.active_status,
      v.question_version_id,
      v.version_no,
      v.question_title,
      ISNULL(u.current_version_used_count, 0) AS current_version_used_count
    FROM dbo.competency_question q
    LEFT JOIN ${ssbDb()}.dbo.PositionView p
      ON q.position_code = p.PositionCode
    OUTER APPLY (
      SELECT TOP 1
        qv.question_version_id,
        qv.version_no,
        qv.question_title
      FROM dbo.competency_question_version qv
      WHERE qv.question_id = q.question_id
        AND qv.active_status = 1
      ORDER BY qv.is_current DESC, qv.version_no DESC, qv.question_version_id DESC
    ) v
    OUTER APPLY (
      SELECT COUNT(1) AS current_version_used_count
      FROM dbo.competency_round_question rq
      WHERE rq.question_version_id = v.question_version_id
    ) u
    ORDER BY q.question_no, q.question_scope, q.position_code, q.question_id;
  `);

  return result.recordset as QuestionRow[];
}

async function getPositionCodes() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
      SELECT DISTINCT
          LTRIM(RTRIM(CAST(PYREXT.POSITIONCODE AS varchar(20)))) AS position_code
        ,PositionName as position_name
      FROM ${ssbDb()}.dbo.PYREXT
      JOIN ${ssbDb()}.dbo.PositionView ON PYREXT.POSITIONCODE = PositionView.PositionCode
      WHERE TERMINATEDATE IS NULL
          AND PYREXT.POSITIONCODE IS NOT NULL
          AND LTRIM(RTRIM(CAST(PYREXT.POSITIONCODE AS varchar(20)))) <> ''
      ORDER BY PositionName;
  `);

  return result.recordset as PositionRow[];
}

function redirectWithAlert(type: "success" | "error" | "warning" | "info", message: string): never {
  const params = new URLSearchParams({
    alert_type: type,
    alert_message: message,
  });

  redirect(`/admin/questions?${params.toString()}`);
}

type QuestionsPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

async function getQuestionVersions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      qv.question_version_id,
      qv.question_id,
      q.question_no,
      qv.question_title,
      qv.version_no,
      qv.is_current,
      qv.active_status,
      COUNT(rq.round_question_id) AS used_count
    FROM dbo.competency_question_version qv
    JOIN dbo.competency_question q
      ON q.question_id = qv.question_id
    LEFT JOIN dbo.competency_round_question rq
      ON rq.question_version_id = qv.question_version_id
    WHERE qv.active_status = 1
    GROUP BY
      qv.question_version_id,
      qv.question_id,
      q.question_no,
      qv.question_title,
      qv.version_no,
      qv.is_current,
      qv.active_status
    ORDER BY q.question_no, qv.version_no DESC;
  `);

  return result.recordset as QuestionVersionItem[];
}

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  await requireAdminSession();

  const alertParams = await searchParams;

  async function saveQuestion(formData: FormData) {
    "use server";

    const session = await requireAdminSession();

    const questionNo = Number(formData.get("question_no"));
    const questionScope = String(formData.get("question_scope") || "").trim();
    const rawPositionCode = String(formData.get("position_code") || "").trim();
    const questionTitle = String(formData.get("question_title") || "").trim();
    const maxScore = Number(formData.get("max_score") || 5);

    let positionCode: string | null = rawPositionCode || null;

    if (!Number.isInteger(questionNo) || questionNo < 1 || questionNo > 7) {
      redirectWithAlert("error", "ข้อประเมินต้องอยู่ระหว่าง 1 ถึง 7");
    }

    if (questionScope !== "COMMON" && questionScope !== "PROFESSION") {
      redirectWithAlert("error", "ประเภทหัวข้อไม่ถูกต้อง");
    }

    if (questionNo <= 4 && questionScope !== "COMMON") {
      redirectWithAlert("error", "ข้อ 1-4 ต้องเป็นหัวข้อใช้ทั้งโรงพยาบาล");
    }

    if (questionNo >= 5 && questionScope !== "PROFESSION") {
      redirectWithAlert("error", "ข้อ 5-7 ต้องเป็นหัวข้อแยกตามวิชาชีพ");
    }

    if (questionScope === "COMMON") {
      positionCode = null;
    }

    if (questionScope === "PROFESSION" && !positionCode) {
      redirectWithAlert("error", "กรุณาเลือกวิชาชีพสำหรับข้อ 5-7");
    }

    if (!questionTitle) {
      redirectWithAlert("error", "กรุณาระบุชื่อหัวข้อประเมิน");
    }

    if (!maxScore || maxScore <= 0) {
      redirectWithAlert("error", "คะแนนเต็มไม่ถูกต้อง");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const findRequest = new sql.Request(transaction);

      const findResult = await findRequest
        .input("question_no", sql.TinyInt, questionNo)
        .input("question_scope", sql.VarChar(20), questionScope)
        .input("position_code", sql.VarChar(20), positionCode)
        .query(`
          SELECT TOP 1 question_id
          FROM dbo.competency_question WITH (UPDLOCK, HOLDLOCK)
          WHERE question_no = @question_no
            AND question_scope = @question_scope
            AND (
              (@position_code IS NULL AND position_code IS NULL)
              OR position_code = @position_code
            )
          ORDER BY question_id;
        `);

      let questionId = Number(findResult.recordset[0]?.question_id || 0);

      if (questionId) {
        const updateQuestionRequest = new sql.Request(transaction);

        await updateQuestionRequest
          .input("question_id", sql.Int, questionId)
          .input("max_score", sql.Decimal(4, 2), maxScore)
          .query(`
            UPDATE dbo.competency_question
            SET max_score = @max_score,
                active_status = 1
            WHERE question_id = @question_id;
          `);

        const clearCurrentRequest = new sql.Request(transaction);

        await clearCurrentRequest.input("question_id", sql.Int, questionId).query(`
          UPDATE dbo.competency_question_version
          SET is_current = 0
          WHERE question_id = @question_id;
        `);
      } else {
        const insertQuestionRequest = new sql.Request(transaction);

        const insertQuestionResult = await insertQuestionRequest
          .input("question_no", sql.TinyInt, questionNo)
          .input("question_scope", sql.VarChar(20), questionScope)
          .input("position_code", sql.VarChar(20), positionCode)
          .input("max_score", sql.Decimal(4, 2), maxScore)
          .input("created_by", sql.VarChar(20), session.emp_id)
          .query(`
            INSERT INTO dbo.competency_question
              (question_no, question_scope, position_code, max_score, active_status, created_by)
            OUTPUT INSERTED.question_id
            VALUES
              (@question_no, @question_scope, @position_code, @max_score, 1, @created_by);
          `);

        questionId = Number(insertQuestionResult.recordset[0]?.question_id || 0);
      }

      const versionRequest = new sql.Request(transaction);

      const versionResult = await versionRequest
        .input("question_id", sql.Int, questionId)
        .query(`
          SELECT ISNULL(MAX(version_no), 0) + 1 AS next_version_no
          FROM dbo.competency_question_version
          WHERE question_id = @question_id;
        `);

      const nextVersionNo = Number(versionResult.recordset[0]?.next_version_no || 1);

      const insertVersionRequest = new sql.Request(transaction);

      await insertVersionRequest
        .input("question_id", sql.Int, questionId)
        .input("version_no", sql.Int, nextVersionNo)
        .input("question_title", sql.NVarChar(500), questionTitle)
        .input("created_by", sql.VarChar(20), session.emp_id)
        .query(`
          INSERT INTO dbo.competency_question_version
            (question_id, version_no, question_title, is_current, active_status, created_by)
          VALUES
            (@question_id, @version_no, @question_title, 1, 1, @created_by);
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    revalidatePath("/admin/questions");
    redirectWithAlert("success", "บันทึกหัวข้อประเมินเรียบร้อยแล้ว");
  }

  async function toggleQuestionStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const questionId = Number(formData.get("question_id"));
    const activeStatus = Number(formData.get("active_status"));

    const pool = await getDbPool();

    await pool
      .request()
      .input("question_id", sql.Int, questionId)
      .input("active_status", sql.Bit, activeStatus === 1)
      .query(`
        UPDATE dbo.competency_question
        SET active_status = @active_status
        WHERE question_id = @question_id;
      `);

    revalidatePath("/admin/questions");
  }

  async function setCurrentQuestionVersion(formData: FormData) {
    "use server";

    await requireAdminSession();

    const questionId = Number(formData.get("question_id"));
    const questionVersionId = Number(formData.get("question_version_id"));

    if (!questionId || !questionVersionId) {
      redirectWithAlert("error", "ข้อมูล Version ไม่ถูกต้อง");
    }

    const pool = await getDbPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const checkRequest = new sql.Request(transaction);

      const checkResult = await checkRequest
        .input("question_id", sql.Int, questionId)
        .input("question_version_id", sql.Int, questionVersionId)
        .query(`
          SELECT TOP 1 question_version_id
          FROM dbo.competency_question_version
          WHERE question_id = @question_id
            AND question_version_id = @question_version_id
            AND active_status = 1;
        `);

      if (checkResult.recordset.length === 0) {
        throw new Error("ไม่พบ Version ที่ต้องการตั้งค่า");
      }

      const clearRequest = new sql.Request(transaction);

      await clearRequest.input("question_id", sql.Int, questionId).query(`
        UPDATE dbo.competency_question_version
        SET is_current = 0
        WHERE question_id = @question_id;
      `);

      const updateRequest = new sql.Request(transaction);

      await updateRequest
        .input("question_id", sql.Int, questionId)
        .input("question_version_id", sql.Int, questionVersionId)
        .query(`
          UPDATE dbo.competency_question_version
          SET is_current = 1
          WHERE question_id = @question_id
            AND question_version_id = @question_version_id;
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error) {
        redirectWithAlert("error", error.message);
      }

      redirectWithAlert("error", "ไม่สามารถตั้ง Version ปัจจุบันได้");
    }

    revalidatePath("/admin/questions");
    redirectWithAlert("success", "ตั้งค่า Version ปัจจุบันเรียบร้อยแล้ว");
  }

  async function saveQuestionEdit(formData: FormData) {
    "use server";

    const session = await requireAdminSession();

    const questionId = Number(formData.get("question_id"));
    const questionTitle = String(formData.get("question_title") || "").trim();
    const confirmCreateVersion = String(formData.get("confirm_create_version") || "0") === "1";

    if (!questionId) {
      redirectWithAlert("error", "ไม่พบข้อมูลหัวข้อประเมิน");
    }

    if (!questionTitle) {
      redirectWithAlert("error", "กรุณาระบุชื่อหัวข้อประเมิน");
    }

    const pool = await getDbPool();

    const currentVersionResult = await pool
      .request()
      .input("question_id", sql.Int, questionId)
      .query(`
        SELECT TOP 1
          qv.question_version_id,
          qv.version_no,
          (
            SELECT COUNT(1)
            FROM dbo.competency_round_question rq
            WHERE rq.question_version_id = qv.question_version_id
          ) AS used_count
        FROM dbo.competency_question_version qv
        WHERE qv.question_id = @question_id
          AND qv.active_status = 1
        ORDER BY qv.is_current DESC, qv.version_no DESC, qv.question_version_id DESC;
      `);

    const currentVersion = currentVersionResult.recordset[0];

    if (!currentVersion) {
      redirectWithAlert("error", "ไม่พบ Version ปัจจุบันของหัวข้อนี้");
    }

    const currentVersionId = Number(currentVersion.question_version_id);
    const usedCount = Number(currentVersion.used_count || 0);

    if (usedCount > 0 && !confirmCreateVersion) {
      redirectWithAlert(
        "warning",
        "หัวข้อนี้ถูกนำไปใช้ในรอบประเมินแล้ว หากต้องการแก้ไข ต้องยืนยันเพื่อสร้าง Version ใหม่"
      );
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      if (usedCount === 0) {
        const updateRequest = new sql.Request(transaction);

        await updateRequest
          .input("question_version_id", sql.Int, currentVersionId)
          .input("question_title", sql.NVarChar(500), questionTitle)
          .query(`
            UPDATE dbo.competency_question_version
            SET question_title = @question_title
            WHERE question_version_id = @question_version_id;
          `);
      } else {
        const clearCurrentRequest = new sql.Request(transaction);

        await clearCurrentRequest.input("question_id", sql.Int, questionId).query(`
          UPDATE dbo.competency_question_version
          SET is_current = 0
          WHERE question_id = @question_id;
        `);

        const nextVersionRequest = new sql.Request(transaction);

        const nextVersionResult = await nextVersionRequest
          .input("question_id", sql.Int, questionId)
          .query(`
            SELECT ISNULL(MAX(version_no), 0) + 1 AS next_version_no
            FROM dbo.competency_question_version
            WHERE question_id = @question_id;
          `);

        const nextVersionNo = Number(nextVersionResult.recordset[0]?.next_version_no || 1);

        const insertVersionRequest = new sql.Request(transaction);

        await insertVersionRequest
          .input("question_id", sql.Int, questionId)
          .input("version_no", sql.Int, nextVersionNo)
          .input("question_title", sql.NVarChar(500), questionTitle)
          .input("created_by", sql.VarChar(20), session.emp_id)
          .query(`
            INSERT INTO dbo.competency_question_version
              (question_id, version_no, question_title, is_current, active_status, created_by)
            VALUES
              (@question_id, @version_no, @question_title, 1, 1, @created_by);
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error) {
        redirectWithAlert("error", error.message);
      }

      redirectWithAlert("error", "ไม่สามารถบันทึกการแก้ไขหัวข้อประเมินได้");
    }

    revalidatePath("/admin/questions");

    if (usedCount === 0) {
      redirectWithAlert("success", "แก้ไขชื่อหัวข้อประเมินเรียบร้อยแล้ว");
    }

    redirectWithAlert("success", "สร้าง Version ใหม่และตั้งเป็น Version ปัจจุบันเรียบร้อยแล้ว");
  }

  const [questions, positions, questionVersions] = await Promise.all([
    getQuestions(),
    getPositionCodes(),
    getQuestionVersions(),
  ]);

  const questionNoOptions = [1, 2, 3, 4, 5, 6, 7].map((no) => ({
    value: String(no),
    label: `ข้อ ${no}`,
  }));

  const questionScopeOptions = [
    {
      value: "COMMON",
      label: "COMMON - ใช้ทั้งโรงพยาบาล",
    },
    {
      value: "PROFESSION",
      label: "PROFESSION - แยกตามวิชาชีพ",
    },
  ];

  const positionOptions = positions.map((position) => ({
    value: position.position_code,
    label: position.position_name,
  }));

  const positionFilterOptions = positions.map((position) => ({
    value: position.position_code,
    label: position.position_name,
  }));

  const versionsByQuestionId = questionVersions.reduce<
    Record<number, QuestionVersionItem[]>
  >((result, version) => {
    if (!result[version.question_id]) {
      result[version.question_id] = [];
    }

    result[version.question_id].push(version);

    return result;
  }, {});

  return (
    <div>
      <ActionAlert
        type={alertParams?.alert_type}
        message={alertParams?.alert_message}
      />

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          เพิ่ม / ปรับหัวข้อประเมิน
        </h2>

        <form action={saveQuestion} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ข้อ
            </label>
            <SearchableSelect
              name="question_no"
              required
              placeholder="เลือกข้อ"
              options={questionNoOptions}
            />
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ประเภทหัวข้อ
            </label>
            <SearchableSelect
              name="question_scope"
              required
              placeholder="เลือกประเภท"
              options={questionScopeOptions}
            />
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              วิชาชีพ / POSITIONCODE
            </label>
            <SearchableSelect
              name="position_code"
              placeholder="เลือกเฉพาะข้อ 5-7"
              options={positionOptions}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              คะแนนเต็ม
            </label>
            <input
              name="max_score"
              type="number"
              step="0.01"
              defaultValue="5.00"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div className="lg:col-span-12">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ชื่อหัวข้อประเมิน
            </label>
            <input
              name="question_title"
              required
              placeholder="เช่น ความคิดริเริ่มในการพัฒนางาน"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div className="flex justify-end lg:col-span-12">
            <button
              type="submit"
              className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
            >
              บันทึกหัวข้อ / เพิ่ม Version ใหม่
            </button>
          </div>
        </form>

        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
          ข้อ 1-4 ต้องเป็น COMMON และไม่ต้องเลือกวิชาชีพ ส่วนข้อ 5-7 ต้องเป็น PROFESSION
          และต้องเลือกวิชาชีพ ถ้าบันทึกหัวข้อเดิมซ้ำ ระบบจะเพิ่ม Version ใหม่แทนการแก้ข้อความเดิม
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            รายการหัวข้อประเมิน
          </h2>
        </div>

        <DataTable
          headers={[
            "ข้อ",
            "ชื่อหัวข้อปัจจุบัน",
            "ประเภท",
            "วิชาชีพ",
            "Version",
            "คะแนนเต็ม",
            "สถานะ",
            "จัดการ",
          ]}
          emptyText="ยังไม่มีข้อมูลหัวข้อประเมิน"
          filters={[
            {
              key: "position",
              label: "วิชาชีพ",
              options: positionFilterOptions,
            },
          ]}
        >
          {questions.map((question) => (
            <tr
              key={question.question_id}
              data-filter-position={question.position_code ?? ""}
              data-search={`${question.question_no} ${question.question_scope} ${
                question.position_code ?? ""
              } ${question.question_title ?? ""} ${
                question.active_status ? "ใช้งาน" : "ปิดใช้งาน"
              }`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <QuestionVersionModal
                  questionId={question.question_id}
                  questionNo={question.question_no}
                  questionTitle={question.question_title ?? ""}
                  versions={versionsByQuestionId[question.question_id] ?? []}
                  setCurrentVersionAction={setCurrentQuestionVersion}
                />
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {question.question_title ?? "-"}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {questionScopeText(question.question_scope)}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {question.position_name ?? "-"}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {question.version_no ?? "-"}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {Number(question.max_score).toFixed(2)}
              </td>

              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                <ActiveStatusBadge active={Boolean(question.active_status)} />
              </td>

              <td className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <QuestionEditModal
                    questionId={question.question_id}
                    questionTitle={question.question_title ?? ""}
                    currentVersionNo={question.version_no}
                    usedCount={Number(question.current_version_used_count || 0)}
                    saveEditAction={saveQuestionEdit}
                  />

                  <form action={toggleQuestionStatus}>
                    <input type="hidden" name="question_id" value={question.question_id} />
                    <input
                      type="hidden"
                      name="active_status"
                      value={question.active_status ? 0 : 1}
                    />

                    <button
                      className={
                        question.active_status ? redActionButtonClass : greenActionButtonClass
                      }
                    >
                      {question.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  );
}