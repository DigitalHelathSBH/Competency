# Competency database scripts

ไฟล์ `competency_evaluator_weight.sql` คือ table เพิ่มเติมสำหรับเก็บน้ำหนักคะแนนผู้ประเมินตาม `round_id + division_code + evaluator_level`.

ตัวอย่าง 70/30:

```sql
insert into dbo.competency_evaluator_weight
(round_id, division_code, evaluator_level, weight_percent, active_status, created_by)
values
(1, '01', 1, 70.00, 1, 'admin'),
(1, '01', 2, 30.00, 1, 'admin');
```

กรณีมีผู้ประเมินแค่ 1 คน รายงานจะคิดคะแนนใบนั้นเป็น 100% ตามที่ตกลงกันไว้
