import ActionAlert from "@/components/competency/ActionAlert";
import DataTable from "@/components/competency/DataTable";
import PageHeader from "@/components/competency/PageHeader";
import QuestionDescriptionForm from "@/components/competency/QuestionDescriptionForm";
import { getDbPool, sql } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type QuestionOptionRow = {
  question_no: number;
  question_scope: string;
  question_title: string;
};

type RankGroupRow = {
  rank_group_id: number;
  rank_group_name: string;
};

type DescriptionRow = {
  description_version_id: number;
  question_no: number;
  rank_group_id: number;
  description_text: string;
  is_current: boolean;
  active_status: boolean;
  question_used_count: number;
  question_scope: string;
  question_title: string;
  rank_group_name: string;
};

type QuestionDescriptionsPageProps = {
  searchParams?: Promise<{
    alert_type?: string;
    alert_message?: string;
  }>;
};

function redirectWithAlert(
  type: "success" | "error" | "warning" | "info",
  message: string,
): never {
  const params = new URLSearchParams({
    alert_type: type,
    alert_message: message,
  });

  redirect(`/admin/question-descriptions?${params.toString()}`);
}

function questionScopeText(scope: string) {
  if (scope === "COMMON") return "ใช้ทั้งโรงพยาบาล";
  if (scope === "PROFESSION") return "แยกตามวิชาชีพ";
  return scope;
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

function CurrentBadge({ current }: { current: boolean }) {
  if (current) {
    return (
      <span className="inline-flex rounded-full bg-[#23c6c8]/10 px-2.5 py-1 text-xs font-medium text-[#23c6c8]">
        ปัจจุบัน
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      เก่า
    </span>
  );
}

function UsedBadge({ usedCount }: { usedCount: number }) {
  if (usedCount > 0) {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
        เคยใช้แล้ว
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
      ยังไม่เคยใช้
    </span>
  );
}

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

async function getQuestionOptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      q.question_no,
      CASE
        WHEN q.question_no BETWEEN 1 AND 4 THEN 'COMMON'
        ELSE 'PROFESSION'
      END AS question_scope,
      CASE
        WHEN q.question_no BETWEEN 5 AND 7 THEN N'ใช้ร่วมทุกวิชาชีพ'
        ELSE MAX(qv.question_title)
      END AS question_title
    FROM dbo.competency_question q
    JOIN dbo.competency_question_version qv
      ON qv.question_id = q.question_id
     AND qv.active_status = 1
     AND qv.is_current = 1
    WHERE q.active_status = 1
      AND q.question_no BETWEEN 1 AND 7
    GROUP BY q.question_no
    ORDER BY q.question_no;
  `);

  return result.recordset as QuestionOptionRow[];
}

async function getRankGroups() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      rank_group_id,
      rank_group_name
    FROM dbo.competency_rank_group
    WHERE active_status = 1
    ORDER BY sort_order, rank_group_id;
  `);

  return result.recordset as RankGroupRow[];
}

async function getDescriptions() {
  const pool = await getDbPool();

  const result = await pool.request().query(`
    SELECT
      d.description_version_id,
      d.question_no,
      d.rank_group_id,
      d.description_text,
      d.is_current,
      d.active_status,
      ISNULL(u.question_used_count, 0) AS question_used_count,
      CASE
        WHEN d.question_no BETWEEN 1 AND 4 THEN 'COMMON'
        ELSE 'PROFESSION'
      END AS question_scope,
      CASE
        WHEN d.question_no BETWEEN 5 AND 7 THEN N'ใช้ร่วมทุกวิชาชีพ'
        ELSE ISNULL(rep.question_title, N'-')
      END AS question_title,
      g.rank_group_name
    FROM dbo.competency_question_description_version d
    JOIN dbo.competency_rank_group g
      ON g.rank_group_id = d.rank_group_id
    OUTER APPLY (
      SELECT TOP 1
        qv.question_title
      FROM dbo.competency_question q
      JOIN dbo.competency_question_version qv
        ON qv.question_id = q.question_id
       AND qv.active_status = 1
       AND qv.is_current = 1
      WHERE q.question_no = d.question_no
        AND q.active_status = 1
      ORDER BY
        CASE WHEN q.question_scope = 'COMMON' THEN 0 ELSE 1 END,
        q.question_id
    ) rep
    OUTER APPLY (
      SELECT COUNT(1) AS question_used_count
      FROM dbo.competency_round_question rq
      JOIN dbo.competency_round_employee re
        ON re.round_id = rq.round_id
       AND re.rank_group_id = d.rank_group_id
       AND re.status_type <> 9
      WHERE rq.question_no = d.question_no
        AND rq.active_status = 1
    ) u
    ORDER BY
      d.is_current DESC,
      d.question_no,
      g.sort_order,
      d.description_version_id DESC;
  `);

  return result.recordset as DescriptionRow[];
}

export default async function QuestionDescriptionsPage({
  searchParams,
}: QuestionDescriptionsPageProps) {
  await requireAdminSession();

  const alertParams = await searchParams;

  async function saveDescription(formData: FormData) {
    "use server";

    const session = await requireAdminSession();

    const questionNo = Number(formData.get("question_no"));
    const rankGroupId = Number(formData.get("rank_group_id"));
    const descriptionText = String(formData.get("description_text") || "").trim();
    const confirmOverwrite =
      String(formData.get("confirm_overwrite") || "0") === "1";

    if (!questionNo) {
      redirectWithAlert("error", "กรุณาเลือกหัวข้อประเมิน");
    }

    if (!rankGroupId) {
      redirectWithAlert("error", "กรุณาเลือกกลุ่มระดับการถูกประเมิน");
    }

    if (!descriptionText) {
      redirectWithAlert("error", "กรุณาระบุคำอธิบายหัวข้อประเมิน");
    }

    const pool = await getDbPool();

    const currentResult = await pool
      .request()
      .input("question_no", sql.Int, questionNo)
      .input("rank_group_id", sql.Int, rankGroupId)
      .query(`
        SELECT TOP 1
          d.description_version_id,
          ISNULL(u.question_used_count, 0) AS question_used_count
        FROM dbo.competency_question_description_version d
        OUTER APPLY (
          SELECT COUNT(1) AS question_used_count
          FROM dbo.competency_round_question rq
          JOIN dbo.competency_round_employee re
            ON re.round_id = rq.round_id
           AND re.rank_group_id = d.rank_group_id
           AND re.status_type <> 9
          WHERE rq.question_no = d.question_no
            AND rq.active_status = 1
        ) u
        WHERE d.question_no = @question_no
          AND d.rank_group_id = @rank_group_id
          AND d.is_current = 1
        ORDER BY d.active_status DESC, d.description_version_id DESC;
      `);

    const currentDescription = currentResult.recordset[0] as
      | {
          description_version_id: number;
          question_used_count: number;
        }
      | undefined;

    if (
      currentDescription &&
      Number(currentDescription.question_used_count || 0) === 0 &&
      !confirmOverwrite
    ) {
      redirectWithAlert(
        "warning",
        "หัวข้อและกลุ่มระดับนี้มีคำอธิบายอยู่แล้ว หากต้องการแก้ไขให้กดยืนยันก่อนบันทึก",
      );
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      if (currentDescription) {
        const currentDescriptionId = Number(
          currentDescription.description_version_id,
        );
        const questionUsedCount = Number(
          currentDescription.question_used_count || 0,
        );

        if (questionUsedCount === 0) {
          const updateRequest = new sql.Request(transaction);

          await updateRequest
            .input("description_version_id", sql.Int, currentDescriptionId)
            .input("description_text", sql.NVarChar(sql.MAX), descriptionText)
            .query(`
              UPDATE dbo.competency_question_description_version
              SET
                description_text = @description_text,
                is_current = 1,
                active_status = 1
              WHERE description_version_id = @description_version_id;
            `);
        } else {
          const clearCurrentRequest = new sql.Request(transaction);

          await clearCurrentRequest
            .input("question_no", sql.Int, questionNo)
            .input("rank_group_id", sql.Int, rankGroupId)
            .query(`
              UPDATE dbo.competency_question_description_version
              SET is_current = 0
              WHERE question_no = @question_no
                AND rank_group_id = @rank_group_id;
            `);

          const insertRequest = new sql.Request(transaction);

          await insertRequest
            .input("question_no", sql.Int, questionNo)
            .input("rank_group_id", sql.Int, rankGroupId)
            .input("description_text", sql.NVarChar(sql.MAX), descriptionText)
            .input("created_by", sql.VarChar(20), session.emp_id)
            .query(`
              INSERT INTO dbo.competency_question_description_version
                (question_no, rank_group_id, description_text, is_current, active_status, created_by)
              VALUES
                (@question_no, @rank_group_id, @description_text, 1, 1, @created_by);
            `);
        }
      } else {
        const insertRequest = new sql.Request(transaction);

        await insertRequest
          .input("question_no", sql.Int, questionNo)
          .input("rank_group_id", sql.Int, rankGroupId)
          .input("description_text", sql.NVarChar(sql.MAX), descriptionText)
          .input("created_by", sql.VarChar(20), session.emp_id)
          .query(`
            INSERT INTO dbo.competency_question_description_version
              (question_no, rank_group_id, description_text, is_current, active_status, created_by)
            VALUES
              (@question_no, @rank_group_id, @description_text, 1, 1, @created_by);
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error) {
        redirectWithAlert("error", error.message);
      }

      redirectWithAlert("error", "ไม่สามารถบันทึกคำอธิบายหัวข้อประเมินได้");
    }

    revalidatePath("/admin/question-descriptions");
    redirectWithAlert("success", "บันทึกคำอธิบายหัวข้อประเมินเรียบร้อยแล้ว");
  }

  async function toggleDescriptionStatus(formData: FormData) {
    "use server";

    await requireAdminSession();

    const descriptionVersionId = Number(formData.get("description_version_id"));
    const activeStatus = Number(formData.get("active_status"));

    if (!descriptionVersionId) {
      redirectWithAlert("error", "ไม่พบข้อมูลคำอธิบายหัวข้อประเมิน");
    }

    const pool = await getDbPool();

    await pool
      .request()
      .input("description_version_id", sql.Int, descriptionVersionId)
      .input("active_status", sql.Bit, activeStatus)
      .query(`
        UPDATE dbo.competency_question_description_version
        SET active_status = @active_status
        WHERE description_version_id = @description_version_id;
      `);

    revalidatePath("/admin/question-descriptions");

    redirectWithAlert(
      "success",
      activeStatus === 1
        ? "เปิดใช้งานคำอธิบายเรียบร้อยแล้ว"
        : "ปิดใช้งานคำอธิบายเรียบร้อยแล้ว",
    );
  }

  const [questions, rankGroups, descriptions] = await Promise.all([
    getQuestionOptions(),
    getRankGroups(),
    getDescriptions(),
  ]);

  const questionOptions = questions.map((question) => ({
    value: String(question.question_no),
    label: `ข้อ ${question.question_no} - ${question.question_title}`,
  }));

  const rankGroupOptions = rankGroups.map((group) => ({
    value: String(group.rank_group_id),
    label: group.rank_group_name,
  }));

  const currentFilterOptions = [
    {
      value: "current",
      label: "ปัจจุบัน",
    },
    {
      value: "old",
      label: "เก่า",
    },
  ];

  const currentDescriptionRules = descriptions
    .filter((description) => description.is_current)
    .map((description) => ({
      question_no: description.question_no,
      rank_group_id: description.rank_group_id,
      question_used_count: description.question_used_count,
    }));

  return (
    <>
      <ActionAlert
        type={alertParams?.alert_type}
        message={alertParams?.alert_message}
      />

      <PageHeader
        title="คำอธิบายหัวข้อประเมิน"
        description="กำหนดคำอธิบายหัวข้อประเมินตามเลขข้อและกลุ่มระดับ ใช้ร่วมกันทุกวิชาชีพสำหรับข้อ 5-7"
      />

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          เพิ่ม / แก้ไขคำอธิบายหัวข้อประเมิน
        </h2>

        <QuestionDescriptionForm
          questionOptions={questionOptions}
          rankGroupOptions={rankGroupOptions}
          currentDescriptionRules={currentDescriptionRules}
          saveDescriptionAction={saveDescription}
        />
      </div>

      <DataTable
        headers={[
          "ข้อ",
          "ประเภท",
          "กลุ่มระดับการถูกประเมิน",
          "คำอธิบาย",
          "Current",
          "การใช้งาน",
          "สถานะ",
          "จัดการ",
        ]}
        emptyText="ยังไม่มีข้อมูลคำอธิบายหัวข้อประเมิน"
        filters={[
          {
            key: "current",
            label: "Current",
            options: currentFilterOptions,
            defaultValue: "current",
          },
          {
            key: "question",
            label: "หัวข้อประเมิน",
            options: questionOptions,
          },
          {
            key: "rankgroup",
            label: "กลุ่มระดับ",
            options: rankGroupOptions,
          },
        ]}
      >
        {descriptions.map((description) => (
          <tr
            key={description.description_version_id}
            data-filter-current={description.is_current ? "current" : "old"}
            data-filter-question={String(description.question_no)}
            data-filter-rankgroup={String(description.rank_group_id)}
            data-search={`ข้อ ${description.question_no} ${
              description.question_title
            } ${questionScopeText(description.question_scope)} ${
              description.rank_group_name
            } ${description.description_text} ${
              description.is_current ? "ปัจจุบัน" : "เก่า"
            } ${description.active_status ? "ใช้งาน" : "ปิดใช้งาน"}`}
          >
            <td className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
              <div className="font-medium">ข้อ {description.question_no}</div>
              <div className="mt-1 max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400">
                {description.question_title}
              </div>
            </td>

            <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
              {questionScopeText(description.question_scope)}
            </td>

            <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
              {description.rank_group_name}
            </td>

            <td className="max-w-xl px-5 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
              {description.description_text}
            </td>

            <td className="px-5 py-4 text-sm">
              <CurrentBadge current={description.is_current} />
            </td>

            <td className="px-5 py-4 text-sm">
              <UsedBadge usedCount={description.question_used_count} />
            </td>

            <td className="px-5 py-4 text-sm">
              <ActiveStatusBadge active={description.active_status} />
            </td>

            <td className="px-5 py-4 text-sm">
              <form action={toggleDescriptionStatus}>
                <input
                  type="hidden"
                  name="description_version_id"
                  value={description.description_version_id}
                />
                <input
                  type="hidden"
                  name="active_status"
                  value={description.active_status ? 0 : 1}
                />

                <button
                  className={
                    description.active_status
                      ? redActionButtonClass
                      : greenActionButtonClass
                  }
                >
                  {description.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </button>
              </form>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
