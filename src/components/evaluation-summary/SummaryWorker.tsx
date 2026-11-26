import { Fragment } from "react";
import { type EvaluationSummary, WORKER_GRADES, fmt } from "@/lib/evaluation-summary-types";
import { CheckBox } from "./shared";

export default function SummaryWorker({ data }: { data: EvaluationSummary }) {
  return (
    <>
      <section className="page">
        <p className="letterhead small" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <h1 className="title">แบบประเมินประสิทธิภาพและประสิทธิผลการปฏิบัติงานของลูกจ้างประจำ</h1>

        <p className="line">รอบการประเมินรอบที่ {data.round_no}/{data.round_year}</p>
        <p className="line">ตำแหน่ง {data.employee.position_name || "-"} &nbsp; กลุ่มงาน {data.employee.division_name || "-"}</p>
        <p className="line">ชื่อผู้รับการประเมิน {data.employee.full_name}</p>
        <div className="row2">
          <span>ค่าจ้าง: {fmt(data.salary)} บาท</span>
          <span>สังกัด โรงพยาบาลสระบุรี</span>
        </div>
        <hr style={{ border: "0", borderTop: "1px solid #555", margin: "12px 0 0" }} />

        <p className="h" style={{ marginTop: "4px" }}>หน้าที่ความรับผิดชอบปัจจุบัน</p>
        {[1,2,3,4,5].map((n) => (<Fragment key={n}>
        <p className="line">{n} <span className="dot" style={{ minWidth: "150mm" }}></span></p>
        </Fragment>))}

        <p className="h gap">ตอนที่ 1 การประเมิน</p>
        <table>
          <thead>
            <tr><th>ผลงาน</th><th style={{ width: "24mm" }}>คะแนนเต็ม</th><th style={{ width: "24mm" }}>คะแนนที่ได้</th></tr>
          </thead>
          <tbody>
            {data.kpi.rows.length > 0 ? (<>
              {data.kpi.rows.map((row, index) => (<Fragment key={index}>
              <tr><td>{row.kpi_name}</td><td className="num">{fmt(row.weight)}</td><td className="num">{fmt(row.score)}</td></tr>
              </Fragment>))}
            </>) : (<>
              <tr><td colSpan={3} className="num">ไม่พบข้อมูลผลงาน</td></tr>
            </>)}
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num">{fmt(data.kpi.rows.reduce((sum, row) => sum + row.weight, 0))}</td>
              <td className="num">{fmt(data.kpi.total)}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ marginTop: "6px" }}>
          <thead>
            <tr><th>คุณลักษณะการปฏิบัติงาน</th><th style={{ width: "24mm" }}>คะแนนเต็ม</th><th style={{ width: "24mm" }}>คะแนนที่ได้</th></tr>
          </thead>
          <tbody>
            {data.competency.rows.length > 0 ? (<>
              {data.competency.rows.map((row, index) => (<Fragment key={index}>
              <tr><td>{row.title}</td><td className="num">{fmt(row.share)}</td><td className="num">{fmt(row.points)}</td></tr>
              </Fragment>))}
            </>) : (<>
              <tr><td colSpan={3} className="num">ไม่พบข้อมูลคุณลักษณะการปฏิบัติงาน</td></tr>
            </>)}
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num">100.00</td>
              <td className="num">{fmt(data.competency.raw_total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="page">
        <p className="letterhead small" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <p className="h">1.2 สรุปผลการประเมิน</p>
        <table>
          <thead>
            <tr><th>องค์ประกอบการประเมิน</th><th style={{ width: "24mm" }}>คะแนน</th><th style={{ width: "24mm" }}>สัดส่วน</th><th style={{ width: "26mm" }}>คะแนนรวม</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>คุณลักษณะการปฏิบัติงาน</td>
              <td className="num">{fmt(data.competency.raw_total)}</td>
              <td className="num">{fmt(data.competency.weight_percent)}</td>
              <td className="num">{fmt(data.competency.component)}</td>
            </tr>
            <tr>
              <td>ผลงาน</td>
              <td className="num">{fmt(data.kpi.total)}</td>
              <td className="num">{fmt(data.kpi.weight_percent)}</td>
              <td className="num">{fmt(data.kpi.component)}</td>
            </tr>
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num"></td>
              <td className="num">100%</td>
              <td className="num">{fmt(data.total)}</td>
            </tr>
          </tbody>
        </table>

        <p className="line gap" style={{ textAlign: "center" }}><b>ระดับผลการประเมินครั้งที่ {data.round_no}</b></p>
        <p className="line" style={{ textAlign: "center" }}><CheckBox checked={data.grade === WORKER_GRADES[0]} /> ดีเด่น &nbsp; 90&#8211;100%</p>
        <p className="line" style={{ textAlign: "center" }}><CheckBox checked={data.grade === WORKER_GRADES[1]} /> เป็นที่ยอมรับได้ &nbsp; 60&#8211;89%</p>
        <p className="line" style={{ textAlign: "center" }}><CheckBox checked={data.grade === WORKER_GRADES[2]} /> ต้องปรับปรุง &nbsp; 0&#8211;59%</p>

        <p className="h gap">ตอนที่ 2 ความเห็นของผู้ประเมินชั้นต้นเกี่ยวกับการพัฒนาการเลื่อนขั้นค่าจ้าง และอื่น ๆ</p>
        <p className="line">2.1 ความเห็นเกี่ยวกับการพัฒนาฝึกอบรม และการแก้ไขการปฏิบัติงาน (ระบุความถนัด จุดเด่น
          และสิ่งที่ควรพัฒนาของผู้รับการประเมิน)</p>
        <p className="line" style={{ textAlign: "center" }}>ครั้งที่ {data.round_no} ({data.period_range})</p>
        <div className="commentbox"></div>
      </section>

      <section className="page">
        <p className="letterhead small" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <p className="h">2.2 ความเห็นเกี่ยวกับการเลื่อนขั้นค่าจ้าง</p>
        <div className="frame">
        <div className="frame-head">ครั้งที่ {data.round_no}</div>
        <div className="frame-body">
        <p className="line"><CheckBox checked={false} /> ควรเลื่อนขั้นค่าจ้าง 1 ขั้น (ผลประเมิน 90-100%)</p>
        <p className="line"><CheckBox checked={false} /> ควรเลื่อนขั้นค่าจ้าง 0.5 ขั้น (ผลประเมิน 60-89%)</p>
        <p className="line"><CheckBox checked={false} /> ไม่ควรเลื่อนขั้นค่าจ้าง (ผลการประเมินต่ำกว่า 60%)</p>
        <p className="line">ระบุเหตุผลในการเสนอเลื่อนขั้นค่าจ้าง (โดยเฉพาะกรณีเสนอเลื่อนขั้นค่าจ้าง 1 ขั้น
          และกรณีเสนอไม่ควรเลื่อนขั้นค่าจ้าง ให้ระบุให้ชัดเจน)</p>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>

        <p className="line gap"><CheckBox checked={false} /> ควรเลื่อนขั้นค่าจ้าง 1.5 ขั้น ตามระเบียบกระทรวงการคลังว่าด้วยการเลื่อนขั้นค่าจ้างลูกจ้างประจำของส่วนราชการ
          พ.ศ. 2544 ข้อ 12 วรรคสาม</p>
        <p className="line">เหตุผล (ระบุว่าผลการประเมินดีเด่น เข้าเกณฑ์เลื่อนขั้นค่าจ้าง 1 ขั้น ในครั้งแรก
          แต่มีข้อจำกัดเรื่องโควตาและผลประเมินดีเด่นอีกในครั้งที่ 2 และโควตาให้เลื่อนขั้นค่าจ้างได้อย่างไร)</p>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>

        <p className="sign">
          ลงชื่อ <span className="dot" style={{ minWidth: "55mm" }}></span> ผู้ประเมิน<br />
          ( <span className="dot" style={{ minWidth: "55mm" }}></span> )<br />
          ตำแหน่ง <span className="dot" style={{ minWidth: "55mm" }}></span><br />
          วันที่ <span className="dot" style={{ minWidth: "55mm" }}></span>
        </p>
        </div>
        </div>
      </section>

      <section className="page">
        <p className="letterhead small" style={{ textAlign: "right" }}>รพ.สระบุรี</p>
        <p className="h">ตอนที่ 3 ความเห็นของผู้ประเมินเหนือขึ้นไป</p>
        <div className="frame">
        <div className="frame-head">ครั้งที่ {data.round_no}</div>
        <div className="frame-body">
        <p className="line"><CheckBox checked={false} /> เห็นด้วยกับการประเมินข้างต้น</p>
        <p className="line"><CheckBox checked={false} /> มีความเห็นแตกต่างจากการประเมินข้างต้น ดังนี้</p>
        <p className="line indent">1. การให้คะแนนในการประเมิน</p>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <p className="line indent" style={{ marginTop: "4px" }}>2. การพัฒนาผู้รับการประเมิน</p>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>
        <p className="line indent" style={{ marginTop: "4px" }}>3. การเลื่อนขั้นค่าจ้าง</p>
        <div className="devline"></div>
        <div className="devline"></div>
        <div className="devline"></div>

        <p className="sign">
          ลงชื่อ <span className="dot" style={{ minWidth: "55mm" }}></span><br />
          ( <span className="dot" style={{ minWidth: "55mm" }}></span> )<br />
          ตำแหน่ง <span className="dot" style={{ minWidth: "55mm" }}></span><br />
          วันที่ <span className="dot" style={{ minWidth: "55mm" }}></span>
        </p>
        </div>
        </div>
      </section>
    </>
  );
}
