import { Fragment } from "react";
import { type EvaluationSummary, FIVE_LEVEL_GRADES, fmt } from "@/lib/evaluation-summary-types";
import { CheckBox } from "./shared";

export default function SummaryMinistry({ data }: { data: EvaluationSummary }) {
  return (
    <>
      <section className="page">
        <h1 className="title">แบบสรุปการประเมินผลการปฏิบัติงานของพนักงานกระทรวงสาธารณสุขทั่วไป</h1>

        <p className="h gap">ส่วนที่ 1 ข้อมูลของผู้รับการประเมิน</p>
        <p className="line">ชื่อผู้รับการประเมิน {data.employee.full_name}</p>
        <p className="line">ตำแหน่ง {data.employee.position_name || "-"} กลุ่มงาน {data.employee.division_name || "-"} สังกัด โรงพยาบาลสระบุรี</p>

        <p className="h gap">ส่วนที่ 2 การประเมินผลสัมฤทธิ์ของงาน</p>
        <p className="line">{data.period_label}</p>
        <table>
          <thead>
            <tr>
              <th>ตัวชี้วัด/ผลงาน</th>
              <th style={{ width: "14mm" }}>ระดับ</th>
              <th style={{ width: "20mm" }}>%น้ำหนัก</th>
              <th style={{ width: "20mm" }}>คะแนน</th>
            </tr>
          </thead>
          <tbody>
            {data.kpi.rows.length > 0 ? (<>
              {data.kpi.rows.map((row, index) => (<Fragment key={index}>
              <tr>
                <td>{row.kpi_code} {row.kpi_name}</td>
                <td className="num">{row.level ?? "-"}</td>
                <td className="num">{fmt(row.weight)}%</td>
                <td className="num">{fmt(row.score)}</td>
              </tr>
              </Fragment>))}
            </>) : (<>
              <tr><td colSpan={4} className="num">ไม่พบข้อมูลผลสัมฤทธิ์ของงาน</td></tr>
            </>)}
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num"></td>
              <td className="num">{fmt(data.kpi.rows.reduce((sum, row) => sum + row.weight, 0))}%</td>
              <td className="num">{fmt(data.kpi.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="sum">คะแนนผลสัมฤทธิ์ของงาน = {fmt(data.kpi.total)}</p>

        <p className="h gap2">ส่วนที่ 3 การประเมินพฤติกรรมการปฏิบัติงานหรือสมรรถนะ</p>
        <p className="line">{data.period_label}</p>
        <table>
          <thead>
            <tr>
              <th>พฤติกรรมการปฏิบัติงานหรือสมรรถนะ</th>
              <th style={{ width: "20mm" }}>ค่าที่ได้</th>
              <th style={{ width: "20mm" }}>%น้ำหนัก</th>
              <th style={{ width: "20mm" }}>คะแนน</th>
            </tr>
          </thead>
          <tbody>
            {data.competency.rows.length > 0 ? (<>
              {data.competency.rows.map((row, index) => (<Fragment key={index}>
              <tr>
                <td>{row.title}</td>
                <td className="num">{fmt(row.value)}</td>
                <td className="num">{fmt(row.share)}%</td>
                <td className="num">{fmt(row.points)}</td>
              </tr>
              </Fragment>))}
            </>) : (<>
              <tr><td colSpan={4} className="num">ไม่พบข้อมูลพฤติกรรมการปฏิบัติงาน</td></tr>
            </>)}
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num"></td>
              <td className="num">100.00%</td>
              <td className="num">{fmt(data.competency.raw_total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="sum">คะแนนพฤติกรรม = {fmt(data.competency.raw_total)}</p>

        <p className="h gap">ส่วนที่ 4 การสรุปผลการประเมินทั้งปี</p>
        <table>
          <thead>
            <tr>
              <th>องค์ประกอบการประเมิน</th>
              <th style={{ width: "20mm" }}>คะแนน (ก)</th>
              <th style={{ width: "20mm" }}>น้ำหนัก (ข)</th>
              <th style={{ width: "25mm" }}>รวมคะแนน (ก)x(ข)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ผลการประเมินด้านผลสัมฤทธิ์ของงาน</td>
              <td className="num">{fmt(data.kpi.total)}</td>
              <td className="num">{fmt(data.kpi.weight_percent)}%</td>
              <td className="num">{fmt(data.kpi.component)}</td>
            </tr>
            <tr>
              <td>ผลการประเมินด้านพฤติกรรมการปฏิบัติงานหรือสมรรถนะ</td>
              <td className="num">{fmt(data.competency.raw_total)}</td>
              <td className="num">{fmt(data.competency.weight_percent)}%</td>
              <td className="num">{fmt(data.competency.component)}</td>
            </tr>
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num"></td>
              <td className="num">100.00%</td>
              <td className="num">{fmt(data.total)}</td>
            </tr>
          </tbody>
        </table>

        <p className="line">ระดับผลการประเมิน &nbsp;{FIVE_LEVEL_GRADES.map((g) => (<Fragment key={g}>&nbsp; {g} <CheckBox checked={data.grade === g} />&nbsp;</Fragment>))}</p>
        <div className="flow-line"><span>ความคิดเห็นเพิ่มเติมของผู้ประเมิน</span><span className="fill">................................................................................................................................................................................................................................................</span></div>
        <p className="dots">................................................................................................................................................................................................................................................</p>
        <p className="dots">................................................................................................................................................................................................................................................</p>
        <p className="dots">................................................................................................................................................................................................................................................</p>
      </section>

      <section className="page">
        <p className="h">ส่วนที่ 5 การรับทราบผลการประเมิน</p>
        <div className="frame">
          <p className="line"><CheckBox checked={false} /> ผู้รับการประเมิน ได้รับทราบผลการประเมินแล้ว</p>
          <p className="line indent">ลงชื่อ <span className="dot" style={{ minWidth: "60mm" }}></span></p>
          <p className="line indent">ตำแหน่ง <span className="dot" style={{ minWidth: "60mm" }}></span></p>
          <p className="line indent">วันที่ <span className="dot" style={{ minWidth: "60mm" }}></span></p>

          <p className="line" style={{ marginTop: "8px" }}><CheckBox checked={false} /> ผู้ประเมินได้แจ้งผลการประเมินและผู้รับการประเมินได้ลงนามรับทราบ</p>
          <p className="line indent">ลงชื่อ <span className="dot" style={{ minWidth: "60mm" }}></span></p>
          <p className="line indent">ตำแหน่ง <span className="dot" style={{ minWidth: "60mm" }}></span></p>
          <p className="line indent">วันที่ <span className="dot" style={{ minWidth: "60mm" }}></span></p>
          <p className="line"><CheckBox checked={false} /> ได้แจ้งผลการประเมินเมื่อวันที่ <span className="dot" style={{ minWidth: "40mm" }}></span></p>
          <p className="line indent">แต่ผู้รับการประเมินไม่ลงนามรับทราบ โดยมี <span className="dot" style={{ minWidth: "40mm" }}></span> เป็นพยาน</p>
          <p className="line indent">ลงชื่อ <span className="dot" style={{ minWidth: "50mm" }}></span> พยาน</p>
          <p className="line indent">ตำแหน่ง <span className="dot" style={{ minWidth: "60mm" }}></span></p>
          <p className="line indent">วันที่ <span className="dot" style={{ minWidth: "60mm" }}></span></p>
        </div>

        <p className="h gap">ส่วนที่ 6 ความเห็นของผู้บังคับบัญชาเหนือขึ้นไป</p>
        <div className="frame">
          <p className="line">ประเมินผลการปฏิบัติงาน</p>
          <p className="line">ผู้บังคับบัญชาเหนือขึ้นไป:</p>
          <p className="line indent"><CheckBox checked={false} /> เห็นด้วยกับผลการประเมิน</p>
          <p className="line indent"><CheckBox checked={false} /> มีความเห็นต่างดังนี้</p>
          <span className="blank"></span>
          <p className="sign">
            ลงชื่อ <span className="dot" style={{ minWidth: "60mm" }}></span><br />
            ตำแหน่ง <span className="dot" style={{ minWidth: "60mm" }}></span><br />
            วันที่ <span className="dot" style={{ minWidth: "60mm" }}></span>
          </p>

          <p className="line" style={{ marginTop: "8px" }}>ผู้บังคับบัญชาเหนือขึ้นไปอีกชั้นหนึ่ง (ถ้ามี):</p>
          <p className="line indent"><CheckBox checked={false} /> เห็นด้วยกับผลการประเมิน</p>
          <p className="line indent"><CheckBox checked={false} /> มีความเห็นต่างดังนี้</p>
          <span className="blank"></span>
          <p className="sign">
            ลงชื่อ <span className="dot" style={{ minWidth: "60mm" }}></span><br />
            ตำแหน่ง <span className="dot" style={{ minWidth: "60mm" }}></span><br />
            วันที่ <span className="dot" style={{ minWidth: "60mm" }}></span>
          </p>
        </div>
      </section>
    </>
  );
}
