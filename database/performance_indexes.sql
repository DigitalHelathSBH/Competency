/*
  Index เพิ่มความเร็ว (รันในฐาน Saraburi) — รันซ้ำได้ ไม่สร้างซ้ำ
  สาเหตุ: ตารางด้านล่างมีแค่ PK ทำให้ทุกหน้าที่ join ด้วย round_employee_id /
  assignment_id / evaluator_payroll_no ต้อง scan ทั้งตาราง (วัดได้ ~1.5 วิ ต่อ OUTER APPLY)
*/

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_competency_round_employee_round'
               AND object_id = OBJECT_ID('dbo.competency_round_employee'))
  CREATE INDEX IX_competency_round_employee_round
    ON dbo.competency_round_employee (round_id, status_type)
    INCLUDE (payroll_no, division_code, section_code, position_code, competency_percent, evaluator_required_type);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_competency_evaluator_assignment_employee'
               AND object_id = OBJECT_ID('dbo.competency_evaluator_assignment'))
  CREATE INDEX IX_competency_evaluator_assignment_employee
    ON dbo.competency_evaluator_assignment (round_employee_id, evaluator_level, status_type)
    INCLUDE (evaluator_payroll_no);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_competency_evaluator_assignment_evaluator'
               AND object_id = OBJECT_ID('dbo.competency_evaluator_assignment'))
  CREATE INDEX IX_competency_evaluator_assignment_evaluator
    ON dbo.competency_evaluator_assignment (evaluator_payroll_no, status_type)
    INCLUDE (round_employee_id, evaluator_level);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_competency_evaluation_assignment'
               AND object_id = OBJECT_ID('dbo.competency_evaluation'))
  CREATE INDEX IX_competency_evaluation_assignment
    ON dbo.competency_evaluation (assignment_id, status_type)
    INCLUDE (total_score, submitted_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_kpi_evaluator_assignment_evaluator'
               AND object_id = OBJECT_ID('dbo.kpi_evaluator_assignment'))
  CREATE INDEX IX_kpi_evaluator_assignment_evaluator
    ON dbo.kpi_evaluator_assignment (evaluator_payroll_no, status_type)
    INCLUDE (round_employee_id);
