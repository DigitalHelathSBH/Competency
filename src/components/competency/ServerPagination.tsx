import type { ReactNode } from "react";

type ServerPaginationAction = (formData: FormData) => void | Promise<void>;

type HiddenField = {
  name: string;
  value?: string | number | null;
};

type ServerPaginationProps = {
  action: ServerPaginationAction;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRows: number;
  startItem: number;
  endItem: number;
  hiddenFields?: HiddenField[];
};

const buttonClassName =
  "h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

function HiddenFields({ fields }: { fields: HiddenField[] }) {
  return (
    <>
      {fields.map((field) => (
        <input
          key={field.name}
          type="hidden"
          name={field.name}
          value={field.value == null ? "" : String(field.value)}
        />
      ))}
    </>
  );
}

function PageButton({
  action,
  page,
  pageSize,
  hiddenFields,
  disabled,
  children,
}: {
  action: ServerPaginationAction;
  page: number;
  pageSize: number;
  hiddenFields: HiddenField[];
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <form action={action}>
      <HiddenFields fields={hiddenFields} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="page_size" value={pageSize} />
      <button type="submit" disabled={disabled} className={buttonClassName}>
        {children}
      </button>
    </form>
  );
}

export default function ServerPagination({
  action,
  currentPage,
  totalPages,
  pageSize,
  totalRows,
  startItem,
  endItem,
  hiddenFields = [],
}: ServerPaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const isFirstPage = safeCurrentPage <= 1;
  const isLastPage = safeCurrentPage >= safeTotalPages;

  return (
    <div className="mt-5 flex flex-col gap-4 border-t border-gray-100 pt-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400 xl:flex-row xl:items-center xl:justify-between">
      <div>
        แสดง {startItem.toLocaleString()}-{endItem.toLocaleString()} จาก {totalRows.toLocaleString()} รายการ
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center gap-2">
          <PageButton
            action={action}
            page={1}
            pageSize={pageSize}
            hiddenFields={hiddenFields}
            disabled={isFirstPage}
          >
            หน้าแรก
          </PageButton>

          <PageButton
            action={action}
            page={Math.max(1, safeCurrentPage - 1)}
            pageSize={pageSize}
            hiddenFields={hiddenFields}
            disabled={isFirstPage}
          >
            ก่อนหน้า
          </PageButton>
        </div>

        <form action={action} className="flex items-center gap-2">
          <HiddenFields fields={hiddenFields} />
          <input type="hidden" name="page_size" value={pageSize} />
          <span>หน้า</span>
          <input
            name="page"
            type="number"
            min="1"
            max={safeTotalPages}
            defaultValue={safeCurrentPage}
            className="h-10 w-20 rounded-lg border border-gray-300 bg-transparent px-3 text-center text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
          <span>จาก {safeTotalPages.toLocaleString()}</span>
          <button
            type="submit"
            className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            ไป
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <PageButton
            action={action}
            page={Math.min(safeTotalPages, safeCurrentPage + 1)}
            pageSize={pageSize}
            hiddenFields={hiddenFields}
            disabled={isLastPage}
          >
            ถัดไป
          </PageButton>

          <PageButton
            action={action}
            page={safeTotalPages}
            pageSize={pageSize}
            hiddenFields={hiddenFields}
            disabled={isLastPage}
          >
            หน้าสุดท้าย
          </PageButton>
        </div>
      </div>
    </div>
  );
}
