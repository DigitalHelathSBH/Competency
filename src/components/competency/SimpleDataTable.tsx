import { SimpleRow } from "@/lib/competency";

type SimpleDataTableProps = {
  rows: SimpleRow[];
  emptyText?: string;
};

export default function SimpleDataTable({ rows, emptyText = "ไม่พบข้อมูล" }: SimpleDataTableProps) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              {columns.length === 0 ? (
                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">ข้อมูล</th>
              ) : (
                columns.map((column) => (
                  <th key={column} className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    {column}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{emptyText}</td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td key={column} className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {row[column] === null || row[column] === undefined ? "" : String(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
