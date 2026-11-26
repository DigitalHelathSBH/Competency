import { Fragment } from "react";
import { type EvaluationSummary, FIVE_LEVEL_GRADES, fmt } from "@/lib/evaluation-summary-types";
import { CheckBox, LevelCells, Signature } from "./shared";

export default function SummaryTemp({ data }: { data: EvaluationSummary }) {
  const kpiLevelTotal = data.kpi.rows.reduce(
    (sum, row) => sum + (row.level || 0) * row.weight / 100, 0,
  );
  const competencyLevelTotal = data.competency.rows.reduce(
    (sum, row) => sum + row.value * row.share / 100, 0,
  );

  return (
    <>
      <section className="page">
        <p className="letterhead" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <h1 className="title">แบบประเมินผลการปฏิบัติงานของลูกจ้างชั่วคราว</h1>
        <p className="line"><b>รอบการประเมิน ครั้งที่ {data.round_no}</b> ระหว่างวันที่ {data.period_range}</p>

        <p className="h">ส่วนที่ 1 ข้อมูลของผู้รับการประเมิน</p>
        <p className="line">ชื่อผู้รับการประเมิน {data.employee.full_name}</p>
        <p className="line">วันเริ่มจ้าง {data.employee.join_date || "-"}</p>
        <div className="row2">
          <span>ตำแหน่ง {data.employee.position_name || "-"}</span>
          <span>สังกัด {data.employee.division_name || "-"}</span>
        </div>
        <hr style={{ border: "0", borderTop: "1px solid #555", margin: "8px 0 0" }} />

        <p className="h" style={{ marginTop: "4px" }}>ส่วนที่ 2 การประเมินผลสัมฤทธิ์ของงาน</p>
        <table className="compact">
          <colgroup><col /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "17mm" }} /><col style={{ width: "19mm" }} /></colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>ตัวชี้วัด/ผลงาน</th>
              <th colSpan={5}>ระดับค่าเป้าหมาย (ก)</th>
              <th rowSpan={2}>% น้ำหนัก<br />(ข)</th>
              <th rowSpan={2}>คะแนน (ค)<br />(ค = ก×ข)</th>
            </tr>
            <tr>
              <th className="lv">1.00–<br />1.99</th>
              <th className="lv">2.00–<br />2.99</th>
              <th className="lv">3.00–<br />3.99</th>
              <th className="lv">4.00–<br />4.99</th>
              <th className="lv">5.00</th>
            </tr>
          </thead>
          <tbody>

            {data.kpi.rows.length > 0 ? (<>
              {data.kpi.rows.map((row, index) => (<Fragment key={index}>

              <tr>
                <td>{(index + 1)}. {row.kpi_name}</td>
                <LevelCells value={row.level} />
                <td className="num">{fmt(row.weight)}</td>
                <td className="num">{fmt((row.level || 0) * row.weight / 100)}</td>
              </tr>
              </Fragment>))}
            </>) : (<>
              <tr><td colSpan={8} className="num">ไม่พบข้อมูลผลงาน</td></tr>
            </>)}
            <tr>
              <td colSpan={6} style={{ textAlign: "right" }}>รวม</td>
              <td className="num">{data.kpi.rows.reduce((sum, row) => sum + row.weight, 0)}%</td>
              <td className="num">{fmt(kpiLevelTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="formula">
          <b>คะแนนผลสัมฤทธิ์ของงานครั้งที่ {data.round_no}</b> =
          <span className="frac"><span className="top">คะแนนรวมของทุกตัวชี้วัด (ค)</span><span>5</span></span>
          × 100 =
          <span className="frac"><span className="top">{fmt(kpiLevelTotal)}</span><span>5</span></span>
          × 100 = <span className="result">{fmt(data.kpi.total)}</span>
        </div>
        <table className="note">
          <tbody>
          <tr><td style={{ width: "18mm" }}><b>หมายเหตุ :</b></td><td style={{ width: "22mm" }}>5 (ตัวหาร)</td><td>หมายถึง คะแนนเต็มของระดับค่าเป้าหมาย</td></tr>
          <tr><td></td><td>100 (ตัวคูณ)</td><td>หมายถึง การแปลงคะแนนรวมของผลสัมฤทธิ์ของงานให้เป็นคะแนนที่มีฐานคะแนนเต็มเป็น 100 คะแนน</td></tr>
            </tbody>
        </table>
      </section>

      <section className="page">
        <p className="letterhead" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <p className="h">ส่วนที่ 3 การประเมินพฤติกรรมการปฏิบัติงาน</p>
        <table>
          <colgroup><col /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "14mm" }} /><col style={{ width: "17mm" }} /><col style={{ width: "19mm" }} /></colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>พฤติกรรมการปฏิบัติงาน</th>
              <th colSpan={5}>ระดับที่แสดงออกจริง (ก)</th>
              <th rowSpan={2}>% น้ำหนัก<br />(ข)</th>
              <th rowSpan={2}>คะแนน (ค)<br />(ค = ก×ข)</th>
            </tr>
            <tr>
              <th className="lv">1.00–1.99<br />ต่ำกว่า<br />ที่กำหนดมาก</th>
              <th className="lv">2.00–2.99<br />ต่ำกว่า<br />ที่กำหนด</th>
              <th className="lv">3.00–3.99<br />ตาม<br />ที่กำหนด</th>
              <th className="lv">4.00–4.99<br />เกินกว่า<br />ที่กำหนด</th>
              <th className="lv">5.00<br />เกินกว่า<br />ที่กำหนดมาก</th>
            </tr>
          </thead>
          <tbody>

            {data.competency.rows.length > 0 ? (<>
              {data.competency.rows.map((row, index) => (<Fragment key={index}>

              <tr>
                <td>{(index + 1)}. {row.title}</td>
                <LevelCells value={row.value} />
                <td className="num">{fmt(row.share)}</td>
                <td className="num">{fmt(row.value * row.share / 100)}</td>
              </tr>
              </Fragment>))}
            </>) : (<>
              <tr><td colSpan={8} className="num">ไม่พบข้อมูลพฤติกรรมการปฏิบัติงาน</td></tr>
            </>)}
            <tr>
              <td colSpan={6} style={{ textAlign: "right" }}>รวม</td>
              <td className="num">100%</td>
              <td className="num">{fmt(competencyLevelTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="formula">
          <b>คะแนนพฤติกรรมครั้งที่ {data.round_no}</b> =
          <span className="frac"><span className="top">คะแนนรวมของทุกสมรรถนะ (ค)</span><span>5</span></span>
          × 100 =
          <span className="frac"><span className="top">{fmt(competencyLevelTotal)}</span><span>5</span></span>
          × 100 = <span className="result">{fmt(data.competency.raw_total)}</span>
        </div>
        <table className="note">
          <tbody>
          <tr><td style={{ width: "18mm" }}><b>หมายเหตุ :</b></td><td style={{ width: "22mm" }}>5 (ตัวหาร)</td><td>หมายถึง คะแนนเต็มของระดับที่แสดงออกจริง</td></tr>
          <tr><td></td><td>100 (ตัวคูณ)</td><td>หมายถึง การแปลงคะแนนรวมของพฤติกรรมการปฏิบัติงานให้เป็นคะแนนที่มีฐานคะแนนเต็มเป็น 100 คะแนน</td></tr>
            </tbody>
        </table>

        <p className="h gap">ส่วนที่ 4 สรุปผลการประเมินครั้งที่ {data.round_no}</p>
          <table>
          <thead>
            <tr><th>องค์ประกอบการประเมิน</th><th style={{ width: "20mm" }}>คะแนน (ก)</th><th style={{ width: "20mm" }}>น้ำหนัก (ข)</th><th style={{ width: "24mm" }}>รวมคะแนน<br />(ก) × (ข)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>ผลการประเมินผลสัมฤทธิ์</td>
              <td className="num">{fmt(data.kpi.total)}</td>
              <td className="num">{data.kpi.weight_percent}%</td>
              <td className="num">{fmt(data.kpi.component)}</td>
            </tr>
            <tr>
              <td>ผลการประเมินพฤติกรรม</td>
              <td className="num">{fmt(data.competency.raw_total)}</td>
              <td className="num">{data.competency.weight_percent}%</td>
              <td className="num">{fmt(data.competency.component)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num"></td>
              <td className="num">100%</td>
              <td className="num">{fmt(data.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="line" style={{ marginTop: "8px" }}><b>ระดับผลการประเมินครั้งที่ {data.round_no}</b></p>
        <p className="line grades">
          <CheckBox checked={data.grade === FIVE_LEVEL_GRADES[0]} /> ดีเด่น 95–100% &nbsp;&nbsp;
          <CheckBox checked={data.grade === FIVE_LEVEL_GRADES[1]} /> ดีมาก 85–94% &nbsp;&nbsp;
          <CheckBox checked={data.grade === FIVE_LEVEL_GRADES[2]} /> ดี 75–84% &nbsp;&nbsp;
          <CheckBox checked={data.grade === FIVE_LEVEL_GRADES[3]} /> พอใช้ 65–74% &nbsp;&nbsp;
          <CheckBox checked={data.grade === FIVE_LEVEL_GRADES[4]} /> ต้องปรับปรุง 0–64%
        </p>

        <p className="h gap">ความคิดเห็นเพิ่มเติมของผู้ประเมิน</p>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
      </section>

      <section className="page">
        <p className="letterhead" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <p className="h">ส่วนที่ 5 การรับทราบผลการประเมิน ครั้งที่ {data.round_no}</p>
        <div className="frame">
          <p className="line"><b>ผู้รับการประเมิน :</b></p>
          <div className="ack">
            <p className="line"><CheckBox checked={false} /> ได้รับทราบผลการประเมินการปฏิบัติงานแล้ว</p>
            <div className="sig"><Signature /></div>
          </div>
        </div>
        <div className="frame">
          <p className="line"><b>ผู้ประเมิน :</b></p>
          <div className="ack">
            <p className="line"><CheckBox checked={false} /> ได้แจ้งผลการประเมินและผู้รับการประเมินได้ลงนามรับทราบ</p>
            <div className="sig"><Signature /></div>
          </div>
          <p className="line gap"><CheckBox checked={false} /> ได้แจ้งผลการประเมินเมื่อวันที่ <span className="dot" style={{ minWidth: "45mm" }}></span>
            แต่ผู้รับการประเมินไม่ลงนามรับทราบ</p>
          <p className="line" style={{ marginLeft: "8mm" }}>โดยมี <span className="dot" style={{ minWidth: "60mm" }}></span> เป็นพยาน</p>
          <div style={{ marginLeft: "20mm" }}>
            <p className="line">ลงชื่อ <span className="dot" style={{ minWidth: "55mm" }}></span> พยาน</p>
            <p className="line">ตำแหน่ง <span className="dot" style={{ minWidth: "51mm" }}></span></p>
            <p className="line">วันที่ <span className="dot" style={{ minWidth: "54mm" }}></span></p>
          </div>
        </div>

        <p className="h gap">ส่วนที่ 6 ความเห็นของผู้บังคับบัญชาเหนือขึ้นไป</p>
        {["ผู้บังคับบัญชาเหนือขึ้นไป", "ผู้บังคับบัญชาเหนือขึ้นไปอีกชั้นหนึ่ง (ถ้ามี)"].map((who) => (<Fragment key={who}>
        <div className="frame">
          <p className="line"><b>{who} :</b></p>
          <div className="ack">
            <div>
              <p className="line"><CheckBox checked={false} /> เห็นด้วยกับผลการประเมิน</p>
              <p className="line"><CheckBox checked={false} /> มีความเห็นต่างดังนี้</p>
            </div>
            <div className="sig"><Signature /></div>
          </div>
          <div className="devline"></div>
          <div className="devline"></div>
        </div>
        </Fragment>))}
      </section>
    </>
  );
}
