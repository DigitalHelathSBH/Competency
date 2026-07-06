type StatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
};

export default function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <h3 className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">{value}</h3>
      {detail && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
  );
}
