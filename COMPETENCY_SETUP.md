# Competency Assessment - Setup Notes

## 1. Environment

คัดลอกไฟล์ `.env.example` เป็น `.env.local` แล้วแก้ค่าฐานข้อมูลจริง

```bash
cp .env.example .env.local
```

หลักการเชื่อมต่อ:

- `DB_DATABASE=Saraburi` เพราะ `Emp` และตาราง competency อยู่ฐานนี้
- `SSB_DATABASE=SSBDatabase` เพราะ `PYREXT` และ `dbo.GetUserFullName` อยู่ฐานนี้

## 2. Install package

โปรเจกต์เพิ่ม package `mssql` และ `@types/mssql` แล้ว ให้รัน

```bash
npm install
```

## 3. Run dev

```bash
npm run dev
```

เข้าใช้งานที่

```text
/login
```

หลัง login สำเร็จ `/` จะ redirect ไป `/dashboard`

## 4. Login logic

ใช้ตาราง `Saraburi.dbo.Emp`

```sql
where EmpID = @username
and PassWord = @password
```

ระบบจะ join ไปที่ `SSBDatabase.dbo.PYREXT` ด้วย `Emp.EmpID = PYREXT.PAYROLLNO` และดึงชื่อด้วย

```sql
SSBDatabase.dbo.GetUserFullName(PYREXT.PAYROLLNO)
```

## 5. Admin logic

ผู้ใช้เป็น admin เมื่อมีข้อมูลใน

```sql
dbo.competency_admin_user
```

และ `active_status = 1`

## 6. Weight table

ถ้ายังไม่ได้สร้างตารางน้ำหนักคะแนน ให้รันไฟล์นี้ในฐาน `Saraburi`

```text
database/competency_evaluator_weight.sql
```

กรณีมีผู้ประเมิน 1 คน รายงานจะใช้คะแนนคนนั้นเป็น 100%

กรณีมีผู้ประเมิน 2 คน รายงานจะใช้น้ำหนักจาก `competency_evaluator_weight` เช่น 70/30 แยกตาม `division_code`

## 7. Completed in this code set

- Login page `/login`
- Session cookie แบบง่าย
- Middleware protect route
- Dashboard `/dashboard`
- Sidebar ใหม่ เฉพาะเมนู competency
- User dropdown + logout
- Evaluator pages
  - `/evaluations`
  - `/evaluations/[assignment_id]`
  - `/evaluation-history`
- Admin pages
  - `/admin/rounds`
  - `/admin/rank-groups`
  - `/admin/questions`
  - `/admin/question-descriptions`
  - `/admin/round-employees`
  - `/admin/assignments`
  - `/admin/evaluator-weights`
  - `/admin/reports`

## 8. Build check

ตรวจแล้วผ่าน:

```bash
npm run lint
npm run build
```

หมายเหตุ: ตั้ง `experimental.cpus = 1` ใน `next.config.ts` เพื่อไม่ให้ Next build ใช้ worker เยอะเกินไปบน server เล็ก ๆ
