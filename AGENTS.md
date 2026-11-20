# AGENTS.md — Competency (สำหรับ Codex)

คุณคือผู้เขียนโค้ดที่รับงานจากหัวหน้า (Claude) งานทุกชิ้นจะถูกตรวจก่อนถึงผู้ใช้
ทำเฉพาะที่ spec สั่ง ถ้า spec ไม่ชัดหรือขัดกับกฎด้านล่าง ให้หยุดแล้วรายงาน อย่าเดาเอง

## อ่านก่อนเริ่ม
- `README.md` และ `COMPETENCY_SETUP.md` (ภาพรวมระบบ ฐานข้อมูล ข้อควรระวัง SQL)
- Stack: Next.js 16 App Router, React 19, **TypeScript**, Tailwind v4, `mssql`
- หน้าใน `src/app/(admin)` ส่วนใหญ่เป็น Server Component; ใช้ `requireSession()` / `requireAdminSession()` จาก `src/lib/session.ts`

## ห้ามเด็ดขาด
- **ห้ามเชื่อมต่อฐานข้อมูล** ห้ามรัน `npm run dev`, `npm start`, สคริปต์ใดที่เรียก `src/lib/db.ts` หรือ `sqlcmd`
  การทดสอบกับฐานข้อมูลหัวหน้าเป็นคนทำเอง
- **ห้ามอ่านหรือแก้ `.env.local` / `.env`** (มีรหัสผ่านฐานข้อมูล)
- **ห้ามแตะข้อมูลบุคลากรจริง** (รหัสพนักงาน ชื่อ เงินเดือน) ห้ามเปิด `Report.pdf` หรือ PDF ใน `D:\Project\performance-report\output`
  ตัวอย่าง/ข้อมูลทดสอบให้ใช้ค่าปลอม
- ห้ามแก้ SQL ใน `src/lib/*.ts` และหน้า admin เว้นแต่ spec สั่งชัดเจน
- ห้าม `git commit`, `git push`, เปลี่ยน branch, หรือ `npm install` แพ็กเกจใหม่ (ถ้าจำเป็นให้เสนอในรายงาน)

## กฎการเขียนโค้ด
- SQL ใช้ `.input()` parameter เสมอ ห้ามต่อ string ค่าจากผู้ใช้เข้า SQL
- join รหัสพนักงานตรง ๆ (`p.PAYROLLNO = re.payroll_no`) ห้ามครอบด้วย LTRIM/RTRIM/CAST (ทำให้ช้ามาก)
- ข้อความบน UI เป็นภาษาไทย ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษ ทำตามสไตล์โค้ดรอบข้าง แก้ให้น้อยที่สุดที่ทำงานได้
- UI หน้าเดิมใช้สไตล์ TailAdmin (การ์ด `rounded-2xl border ... dark:`) ทำตามให้เข้ากัน

## ตรวจงานก่อนส่ง
- `npx tsc --noEmit -p .` ต้องไม่มี error ใหม่
- `npx eslint <ไฟล์ที่แก้>` ต้องผ่าน (ทั้งโปรเจคมี lint error เดิมอยู่ ไม่ต้องแก้)
- ถ้าแก้ UI หรือ route ให้รัน `npm run build` (build ไม่ต่อฐานข้อมูล)
- shell เป็น PowerShell บน Windows ไฟล์ทุกไฟล์บันทึกเป็น UTF-8 (ไม่มี BOM)

## รูปแบบรายงานเมื่อจบงาน
1. ไฟล์ที่แก้ พร้อมสรุปสั้นๆ ว่าแก้อะไร
2. ผล tsc / eslint / build
3. สิ่งที่หัวหน้าต้องทดสอบกับฐานข้อมูลเอง
4. ข้อสงสัยหรือจุดที่ spec ไม่ชัด
