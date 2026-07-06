export type ThaiDateFormatType = "full" | "short";

const thaiMonthsFull = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const thaiMonthsShort = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ก.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function parseDateOnly(dateValue: string | Date | null | undefined) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) return null;

    return {
      day: dateValue.getDate(),
      month: dateValue.getMonth() + 1,
      yearAD: dateValue.getFullYear(),
    };
  }

  const value = String(dateValue).trim();

  if (!value) return null;

  // รองรับรูปแบบ 2026-12-01 หรือ 2026-12-01T00:00:00.000Z
  const datePart = value.substring(0, 10);
  const parts = datePart.split("-");

  if (parts.length !== 3) return null;

  const yearAD = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!yearAD || !month || !day) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  return {
    day,
    month,
    yearAD,
  };
}

export function formatThaiDate(
  dateValue: string | Date | null | undefined,
  formatType: ThaiDateFormatType = "short"
) {
  const parsed = parseDateOnly(dateValue);

  if (!parsed) return "-";

  const yearBE = parsed.yearAD + 543;

  if (formatType === "full") {
    return `${parsed.day} ${thaiMonthsFull[parsed.month - 1]} ${yearBE}`;
  }

  const shortYearBE = String(yearBE).slice(-2);

  return `${parsed.day} ${thaiMonthsShort[parsed.month - 1]} ${shortYearBE}`;
}