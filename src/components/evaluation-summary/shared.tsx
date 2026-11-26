import { fmt } from "@/lib/evaluation-summary-types";

export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className="box" role="img" aria-label={checked ? "เลือก" : "ไม่เลือก"}>
      {checked && (
        <svg className="tick" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M1.5 12.5 L8.5 20 L23 3 L21.5 1.5 L8.5 16 L3 10.5 Z" fill="#000" />
        </svg>
      )}
    </span>
  );
}

/** Keep the source form's clamped, truncated level column (null leaves all blank). */
export function LevelCells({ value }: { value: number | null }) {
  const column = value === null ? 0 : Math.min(Math.max(Math.trunc(value), 1), 5);

  return (
    <>
      {[1, 2, 3, 4, 5].map((level) => (
        <td className="num" key={level}>{level === column ? fmt(value) : null}</td>
      ))}
    </>
  );
}

export function Signature() {
  return (
    <>
      <p>ลงชื่อ <span className="dot" style={{ minWidth: "48mm" }} /></p>
      <p>ตำแหน่ง <span className="dot" style={{ minWidth: "44mm" }} /></p>
      <p>วันที่ <span className="dot" style={{ minWidth: "47mm" }} /></p>
    </>
  );
}
