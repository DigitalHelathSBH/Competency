export default function AdminLoading() {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-gray-950/35 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/70 bg-white p-7 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/15">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          กำลังโหลดข้อมูล
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          ระบบตอบรับคำสั่งแล้ว และกำลังเตรียมข้อมูลของหน้าที่เลือก
        </p>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}