import type { EvaluationSummary } from "@/lib/evaluation-summary-types";
import SummaryMinistry from "./SummaryMinistry";
import SummaryCivil from "./SummaryCivil";
import SummaryWorker from "./SummaryWorker";
import SummaryTemp from "./SummaryTemp";
import SummaryGov from "./SummaryGov";
import "./summary-print.css";

const summaryComponents = {
  ministry: SummaryMinistry,
  civil: SummaryCivil,
  worker: SummaryWorker,
  temp: SummaryTemp,
  gov: SummaryGov,
};

// @font-face อยู่ตรงนี้แทนไฟล์ CSS เพื่อเติม basePath ให้ URL ฟอนต์ (production ตั้ง NEXT_PUBLIC_BASE_PATH)
const fontBase = `${(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "")}/fonts`;
const fontFaces = [
  ["THSarabunPSK.ttf", "normal", "normal"],
  ["THSarabunPSK-Bold.ttf", "bold", "normal"],
  ["THSarabunPSK-Italic.ttf", "normal", "italic"],
  ["THSarabunPSK-BoldItalic.ttf", "bold", "italic"],
]
  .map(
    ([file, weight, style]) =>
      `@font-face{font-family:"Evaluation Summary Sarabun";src:url("${fontBase}/${file}") format("truetype");font-weight:${weight};font-style:${style};font-display:swap;}`,
  )
  .join("");

export default function EvaluationSummaryDocument({ data }: { data: EvaluationSummary }) {
  const Summary = summaryComponents[data.form];

  return (
    <div className={"eval-summary form-" + data.form} lang="th">
      <style>{fontFaces}</style>
      <Summary data={data} />
    </div>
  );
}
