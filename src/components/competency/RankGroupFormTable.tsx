"use client";

import DataTable from "@/components/competency/DataTable";
import { FormEvent, useRef, useState, useTransition } from "react";

export type RankGroupItem = {
  rank_group_id: number;
  rank_group_name: string;
  sort_order: number;
  active_status: boolean;
};

type RankGroupFormTableProps = {
  rankGroups: RankGroupItem[];
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const redActionButtonClass =
  "rounded-lg border border-[#ed5565] bg-[#ed5565] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64253]";

const greenActionButtonClass =
  "rounded-lg border border-[#1ab394] bg-[#1ab394] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#18a689]";

function ActiveStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#1ab394]/10 px-2.5 py-1 text-xs font-medium text-[#1ab394]">
      เปิดใช้งาน
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#ed5565]/10 px-2.5 py-1 text-xs font-medium text-[#ed5565]">
      ปิดใช้งาน
    </span>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง";
}

export default function RankGroupFormTable({
  rankGroups,
  createAction,
  updateAction,
  toggleAction,
}: RankGroupFormTableProps) {
  const [editingGroup, setEditingGroup] = useState<RankGroupItem | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formSectionRef = useRef<HTMLDivElement>(null);

  function handleEdit(group: RankGroupItem) {
    setErrorMessage("");
    setEditingGroup(group);

    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function cancelEdit() {
    setErrorMessage("");
    setEditingGroup(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const action = editingGroup ? updateAction : createAction;

    startTransition(async () => {
      try {
        await action(formData);
        setEditingGroup(null);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    });
  }

  return (
    <>
      <div
        ref={formSectionRef}
        className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {editingGroup ? "แก้ไขกลุ่มระดับ" : "เพิ่มกลุ่มระดับ"}
          </h2>
          {editingGroup ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              กำลังแก้ไข: {editingGroup.rank_group_name}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-[#ed5565]/30 bg-[#ed5565]/10 px-4 py-3 text-sm text-[#ed5565]">
            {errorMessage}
          </div>
        ) : null}

        <form
          key={editingGroup?.rank_group_id ?? "create"}
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 md:grid-cols-12"
        >
          {editingGroup ? (
            <input
              type="hidden"
              name="rank_group_id"
              value={editingGroup.rank_group_id}
            />
          ) : null}

          <div className="md:col-span-9">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ชื่อกลุ่มระดับ
            </label>
            <input
              name="rank_group_name"
              required
              defaultValue={editingGroup?.rank_group_name ?? ""}
              placeholder="เช่น กลุ่มระดับ 1"
              className={inputClass}
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              ลำดับ
            </label>
            <input
              name="sort_order"
              type="number"
              min={0}
              required
              defaultValue={editingGroup?.sort_order ?? 0}
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 md:col-span-12">
            {editingGroup ? (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-11 rounded-lg bg-[#ed5565] px-5 text-sm font-medium text-white hover:bg-[#e64253] disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยกเลิกการแก้ไข
              </button>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className={
                editingGroup
                  ? "h-11 rounded-lg bg-[#f8ac59] px-5 text-sm font-medium text-white hover:bg-[#f6a23c] disabled:cursor-not-allowed disabled:opacity-60"
                  : "h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              {isPending
                ? "กำลังบันทึก..."
                : editingGroup
                  ? "บันทึกการแก้ไข"
                  : "บันทึกกลุ่มระดับ"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">
          รายการกลุ่มระดับ
        </h2>

        <DataTable
          headers={["ชื่อกลุ่มระดับ", "ลำดับ", "สถานะ", "จัดการ"]}
          emptyText="ยังไม่มีข้อมูลกลุ่มระดับ"
        >
          {rankGroups.map((group) => (
            <tr
              key={group.rank_group_id}
              data-search={`${group.rank_group_name} ${group.sort_order} ${group.active_status ? "เปิดใช้งาน" : "ปิดใช้งาน"}`}
            >
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {group.rank_group_name}
              </td>
              <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                {group.sort_order}
              </td>
              <td className="px-5 py-4 text-sm">
                <ActiveStatusBadge active={Boolean(group.active_status)} />
              </td>
              <td className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(group)}
                    className="rounded-lg bg-[#f8ac59] px-4 py-2 text-xs font-medium text-white hover:bg-[#f6a23c]"
                  >
                    แก้ไข
                  </button>

                  <form action={toggleAction}>
                    <input
                      type="hidden"
                      name="rank_group_id"
                      value={group.rank_group_id}
                    />
                    <input
                      type="hidden"
                      name="active_status"
                      value={group.active_status ? 0 : 1}
                    />
                    <button
                      type="submit"
                      className={
                        group.active_status
                          ? redActionButtonClass
                          : greenActionButtonClass
                      }
                    >
                      {group.active_status ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </>
  );
}