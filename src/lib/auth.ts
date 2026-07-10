import { getDbPool, getSsbDatabaseName, quoteSqlName, sql } from "./db";

export type LoginUser = {
  emp_id: string;
  payroll_no: string;
  full_name: string;
  is_admin: boolean;
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
          CAST(ISNULL(p.PAYROLLNO, e.EmpID) AS varchar(20)) AS payroll_no,
          CAST(
            CASE
              WHEN p.PAYROLLNO IS NULL THEN e.EmpID
              ELSE ${ssbDb}.dbo.GetUserFullName(p.PAYROLLNO)
            END AS nvarchar(255)
          ) AS full_name,
          au.admin_role_type AS admin_role_type
      FROM dbo.Emp e
      LEFT JOIN ${ssbDb}.dbo.PYREXT p
          ON CAST(e.EmpID AS varchar(20)) = CAST(p.PAYROLLNO AS varchar(20))
      INNER JOIN dbo.competency_admin_user au
          ON au.emp_id = CAST(e.EmpID AS varchar(20))
          AND au.active_status = 1
      WHERE CAST(e.EmpID AS varchar(20)) = @username
        AND CAST(e.PassWord AS varchar(100)) = @password;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    emp_id: row.emp_id,
    payroll_no: row.payroll_no,
    full_name: row.full_name || row.emp_id,
    is_admin: Number(row.admin_role_type) === 1,
  };
}
