IF OBJECT_ID('dbo.competency_evaluator_weight', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.competency_evaluator_weight (
        evaluator_weight_id int IDENTITY(1,1) PRIMARY KEY,
        round_id            int NOT NULL,
        division_code       varchar(20) NOT NULL,
        evaluator_level     tinyint NOT NULL,
        weight_percent      decimal(5,2) NOT NULL,
        active_status       bit NOT NULL CONSTRAINT df_competency_evaluator_weight_active_status DEFAULT 1,
        created_date        datetime2(0) NOT NULL CONSTRAINT df_competency_evaluator_weight_created_date DEFAULT SYSDATETIME(),
        created_by          varchar(20) NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'ux_competency_evaluator_weight_round_division_level_active'
      AND object_id = OBJECT_ID('dbo.competency_evaluator_weight')
)
BEGIN
    CREATE UNIQUE INDEX ux_competency_evaluator_weight_round_division_level_active
    ON dbo.competency_evaluator_weight(round_id, division_code, evaluator_level)
    WHERE active_status = 1;
END;
GO
