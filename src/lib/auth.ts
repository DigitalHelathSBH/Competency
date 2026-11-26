import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "./db";

export type LoginUser = {
  emp_id: string;
  payroll_no: string;
  full_name: string;
  is_admin: boolean;
  is_evaluator: boolean;
};

export async function loginWithEmp(username: string, password: string): Promise<LoginUser | null> {
  const pool = await getDbPool();
  const ssbDb = quoteSqlName(getSsbDatabaseName());

  const result = await pool
    .request()
    .input("username", sql.VarChar(20), username)
    .input("password", sql.VarChar(100), password)
    .query(`
      SELECT TOP 1
          CAST(e.EmpID AS varchar(20)) AS emp_id,
          CAST(p.PAYROLLNO AS varchar(20)) AS payroll_no,
          CAST(
            ${ssbDb}.dbo.GetSSBName(p.FIRSTTHAINAME) +' '+ ${ssbDb}.dbo.GetSSBName(p.LASTTHAINAME)
            AS nvarchar(255)
          ) AS full_name,
          au.admin_role_type AS admin_role_type,
          CASE WHEN au.emp_id IS NULL THEN 0 ELSE 1 END AS is_evaluator
      FROM dbo.Emp e
      -- login ได้เฉพาะรหัสที่ยังทำงานอยู่ใน PYREXT (ไม่มีวันพ้นสภาพ) ใช้กับทุกสิทธิ์รวม admin/ผู้ประเมิน
      JOIN ${ssbDb}.dbo.PYREXT p
          ON p.PAYROLLNO = e.EmpID
         AND p.TERMINATEDATE IS NULL
      -- ไม่อยู่ใน competency_admin_user = บุคลากรทั่วไป (ดูแบบสรุปของตัวเองเท่านั้น)
      OUTER APPLY (
          SELECT TOP 1 x.emp_id, x.admin_role_type
          FROM dbo.competency_admin_user x
          WHERE x.emp_id = e.EmpID
            AND x.active_status = 1
          ORDER BY CASE WHEN x.admin_role_type = 1 THEN 0 ELSE 1 END
      ) au
      WHERE e.EmpID = @username
        AND CAST(e.PassWord AS varchar(100)) = @password;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    emp_id: row.emp_id,
    payroll_no: row.payroll_no,
    full_name: row.full_name || row.emp_id,
    is_admin: Number(row.admin_role_type) === 1,
    is_evaluator: Number(row.is_evaluator) === 1,
  };
}
