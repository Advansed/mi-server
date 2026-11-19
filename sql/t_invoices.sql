IF OBJECT_ID(N'dbo.t_invoices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.t_invoices (
        id          uniqueidentifier NOT NULL,
        lic_id      uniqueidentifier NOT NULL,
        number      varchar(13)      NULL,
        date        datetime         NULL,
        division    varchar(64)      NULL,
        lic         varchar(16)      NULL,
        applicant   varchar(150)     NULL,
        status      varchar(24)      NULL,
        address     varchar(256)     NULL,
        description nvarchar(2048)   NULL,
        plan_date   datetime2(0)     NULL,
        CONSTRAINT PK_t_invoices PRIMARY KEY (id, lic_id)
    );
END
GO

IF COL_LENGTH(N'dbo.t_invoices', N'description') IS NULL
    ALTER TABLE dbo.t_invoices ADD description nvarchar(2048) NULL;
GO
