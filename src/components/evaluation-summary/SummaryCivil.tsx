import { Fragment } from "react";
import { type EvaluationSummary, FIVE_LEVEL_GRADES, fmt } from "@/lib/evaluation-summary-types";
import { CheckBox } from "./shared";

export default function SummaryCivil({ data }: { data: EvaluationSummary }) {
  return (
    <>
      <section className="page">
        <h1 className="title">แบบสรุปการประเมินผลการปฏิบัติราชการ</h1>

        <p className="h gap">ส่วนที่ ๑ : ข้อมูลของผู้รับการประเมิน</p>
        <p className="line">
          รอบการประเมิน &nbsp;
          <CheckBox checked={data.round_no === 1} /> รอบที่ 1/{data.round_year} &nbsp;&nbsp;
          <CheckBox checked={data.round_no === 2} /> รอบที่ 2/{data.round_year}
        </p>
        <p className="line">ชื่อผู้รับการประเมิน {data.employee.full_name}</p>
        <p className="line">ตำแหน่ง {data.employee.position_name || "-"} &nbsp; ประเภทตำแหน่ง {data.employee.position_type || "-"} &nbsp; ระดับตำแหน่ง {data.employee.rank_name || "-"}</p>
        <p className="line">สังกัด {data.employee.division_name || "-"} โรงพยาบาลสระบุรี</p>
        <p className="line">ชื่อผู้ประเมิน {data.evaluator.full_name || "-"}</p>
        <p className="line">ตำแหน่ง {data.evaluator.position_name || "-"} &nbsp; ประเภทตำแหน่ง {data.evaluator.position_type || "-"} &nbsp; ระดับตำแหน่ง {data.evaluator.rank_name || "-"}</p>

        <p className="h gap">ส่วนที่ ๒ : การสรุปผลการประเมิน</p>
        <table>
          <thead>
            <tr>
              <th>องค์ประกอบการประเมิน</th>
              <th style={{ width: "18mm" }}>คะแนน (ก)</th>
              <th style={{ width: "18mm" }}>น้ำหนัก (ข)</th>
              <th style={{ width: "24mm" }}>รวมคะแนน (ก)x(ข)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>องค์ประกอบที่ ๑ : ผลสัมฤทธิ์ของงาน</td>
              <td className="num">{fmt(data.kpi.total)}</td>
              <td className="num">{fmt(data.kpi.weight_percent)}%</td>
              <td className="num">{fmt(data.kpi.component)}</td>
            </tr>
            <tr>
              <td>องค์ประกอบที่ ๒ : พฤติกรรมการปฏิบัติราชการ(สมรรถนะ)</td>
              <td className="num">{fmt(data.competency.raw_total)}</td>
              <td className="num">{fmt(data.competency.weight_percent)}%</td>
              <td className="num">{fmt(data.competency.component)}</td>
            </tr>
            <tr>
              <td>องค์ประกอบอื่น ๆ (ถ้ามี)</td>
              <td className="num"></td>
              <td className="num"></td>
              <td className="num"></td>
            </tr>
            <tr className="total">
              <td style={{ textAlign: "right" }}>รวม</td>
              <td className="num"></td>
              <td className="num">100.00%</td>
              <td className="num">{fmt(data.total)}</td>
            </tr>
          </tbody>
        </table>

        <p className="line gap">
          ระดับผลการประเมิน &nbsp;
          {FIVE_LEVEL_GRADES.map((g) => (<Fragment key={g}>
            <CheckBox checked={data.grade === g} /> {g} &nbsp;
          </Fragment>))}
        </p>

        <p className="h gap">ส่วนที่ ๓ : แผนพัฒนาการปฏิบัติราชการรายบุคคล</p>
        <table>
          <thead>
            <tr>
              <th>ความรู้ / ทักษะ / สมรรถนะ<br />ที่ต้องได้รับการพัฒนา</th>
              <th>วิธีการพัฒนา</th>
              <th style={{ width: "32mm" }}>ช่วงเวลาที่ต้องการ<br />การพัฒนา</th>
            </tr>
          </thead>
          <tbody>
            {[0,1,2,3,4].map((index) => (<Fragment key={index}>
            <tr className="devrow"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
            </Fragment>))}
          </tbody>
        </table>
      </section>

      <section className="page">
        <p className="h">ส่วนที่ ๔ : การรับทราบผลการประเมิน</p>
        <div className="frame">
          <p className="line"><b>ผู้รับการประเมิน :</b></p>
          <p className="line indent"><CheckBox checked={false} /> ได้รับทราบผลการประเมินและแผนพัฒนาการปฏิบัติราชการรายบุคคลแล้ว</p>
          <p className="sign">
            ลงชื่อ : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            ตำแหน่ง : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            วันที่ : <span className="dot" style={{ minWidth: "55mm" }}></span>
          </p>

          <p className="line" style={{ marginTop: "4px" }}><b>ผู้ประเมิน :</b></p>
          <p className="line indent"><CheckBox checked={false} /> ได้แจ้งผลการประเมินและผู้รับการประเมินได้ลงนามรับทราบ</p>
          <p className="line indent"><CheckBox checked={false} /> ได้แจ้งผลการประเมินเมื่อวันที่ <span className="dot" style={{ minWidth: "30mm" }}></span></p>
          <p className="line" style={{ marginLeft: "12mm" }}>
            แต่ผู้รับการประเมินไม่ลงนามรับทราบ โดยมี <span className="dot" style={{ minWidth: "30mm" }}></span> เป็นพยาน
          </p>
          <p className="line indent">ลงชื่อ : <span className="dot" style={{ minWidth: "40mm" }}></span> พยาน</p>
          <p className="sign">
            ลงชื่อ : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            ตำแหน่ง : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            วันที่ : <span className="dot" style={{ minWidth: "55mm" }}></span>
          </p>
        </div>

        <p className="h gap">ส่วนที่ ๕ : ความเห็นของผู้บังคับบัญชาเหนือขึ้นไป</p>
        <div className="frame">
          <p className="line"><b>ผู้บังคับบัญชาเหนือขึ้นไป :</b></p>
          <p className="line indent"><CheckBox checked={false} /> เห็นด้วยกับผลการประเมิน</p>
          <p className="line indent"><CheckBox checked={false} /> มีความเห็นต่าง ดังนี้ <span className="dot" style={{ minWidth: "80mm" }}></span></p>
          <p className="sign">
            ลงชื่อ : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            ตำแหน่ง : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            วันที่ : <span className="dot" style={{ minWidth: "55mm" }}></span>
          </p>

          <p className="line" style={{ marginTop: "4px" }}><b>ผู้บังคับบัญชาเหนือขึ้นไปอีกชั้นหนึ่ง (ถ้ามี) :</b></p>
          <p className="line indent"><CheckBox checked={false} /> เห็นด้วยกับผลการประเมิน</p>
          <p className="line indent"><CheckBox checked={false} /> มีความเห็นต่าง ดังนี้ <span className="dot" style={{ minWidth: "80mm" }}></span></p>
          <p className="sign">
            ลงชื่อ : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            ตำแหน่ง : <span className="dot" style={{ minWidth: "55mm" }}></span><br />
            วันที่ : <span className="dot" style={{ minWidth: "55mm" }}></span>
          </p>
        </div>

        <p className="note-title">คำชี้แจง</p>
        <p className="note">แบบสรุปการประเมินผลการปฏิบัติราชการ ประกอบด้วย</p>
        <p className="note"><b>ส่วนที่ ๑</b> ข้อมูลของผู้รับการประเมิน เพื่อระบุรายละเอียดต่าง ๆ ที่เกี่ยวข้องกับตัวผู้รับการประเมิน</p>
        <p className="note"><b>ส่วนที่ ๒</b> สรุปผลการประเมิน ใช้เพื่อกรอกค่าคะแนนการประเมินในองค์ประกอบด้านผลสัมฤทธิ์ของงาน องค์ประกอบด้านพฤติกรรมการปฏิบัติราชการ และน้ำหนักของทั้งสององค์ประกอบ โดยคะแนนผลสัมฤทธิ์ของงานนำมาจากแบบประเมินผลสัมฤทธิ์ของงาน และคะแนนพฤติกรรมการปฏิบัติราชการนำมาจากแบบประเมินสมรรถนะ ซึ่งให้แนบท้ายแบบสรุปฉบับนี้</p>
        <p className="note"><b>ส่วนที่ ๓</b> แผนพัฒนาการปฏิบัติราชการรายบุคคล ผู้ประเมินและผู้รับการประเมินร่วมกันจัดทำแผนพัฒนาผลการปฏิบัติราชการ</p>
        <p className="note"><b>ส่วนที่ ๔</b> การรับทราบผลการประเมิน ผู้รับการประเมินลงนามรับทราบผลการประเมิน</p>
        <p className="note"><b>ส่วนที่ ๕</b> ความเห็นของผู้บังคับบัญชาเหนือขึ้นไป ผู้บังคับบัญชาเหนือขึ้นไปกลั่นกรองผลการประเมิน แผนพัฒนาผลการปฏิบัติราชการ และให้ความเห็น</p>
      </section>
    </>
  );
}
