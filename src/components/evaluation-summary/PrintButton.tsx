"use client";

export default function PrintButton() {
  async function handlePrint() {
    await document.fonts.ready;
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 print:hidden"
    >
      พิมพ์ / บันทึก PDF
    </button>
  );
}
