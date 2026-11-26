# ระบบประเมินผลการปฏิบัติงาน (Competency + KPI)

Next.js 16 (App Router) + SQL Server (`mssql`) โรงพยาบาลสระบุรี

- วิธีติดตั้ง/ตั้งค่า env/login ดู [COMPETENCY_SETUP.md](COMPETENCY_SETUP.md)
- สคริปต์ฐานข้อมูลเพิ่มเติมอยู่ใน [database/](database/) (รวม `performance_indexes.sql`)

## โครงสร้างหลัก

| ส่วน | ที่อยู่ |
| --- | --- |
| ประเมิน Competency | `src/app/(admin)/evaluations` |
| ประเมิน KPI (โมดูลใหม่ในระบบนี้) | `src/app/(admin)/kpi-evaluations` |
| รายงาน Competency / KPI / ผลรวม | `reports`, `kpi-reports`, `performance-reports` |
| ตั้งค่า (admin) | `src/app/(admin)/admin/*` |
| DB pool / session / query กลาง | `src/lib/db.ts`, `src/lib/session*.ts`, `src/lib/competency.ts` |

ฐานข้อมูล: `Saraburi` (ตาราง `competency_*`, `kpi_*`, `Emp`), `SSBDatabase` (`PYREXT`, ชื่อหน่วยงาน),
`KPI` (โปรแกรม KPI เดิม — หน้า performance-reports อ่านคะแนนจาก `FinalResultByPeriodID`)

## ข้อควรระวังเวลาเขียน SQL

- join `PYREXT.PAYROLLNO` กับ payroll_no ตรง ๆ (`p.PAYROLLNO = re.payroll_no`) ห้ามครอบด้วย
  `LTRIM/RTRIM/CAST` เพราะทำให้ใช้ index ไม่ได้ (เคยทำให้รายงานช้า ~9 วินาที/query)
  คอลัมน์ payroll ทุกตารางเป็น `varchar(20)` และไม่มีช่องว่างนำหน้า

## คำสั่ง

```bash
npm run dev
npm run build
npm run lint
```
