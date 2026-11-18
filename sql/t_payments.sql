IF OBJECT_ID(N'dbo.t_payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.t_payments (
        id          uniqueidentifier NOT NULL CONSTRAINT PK_t_payments PRIMARY KEY,
        invoice_id  uniqueidentifier NOT NULL,
        user_id     uniqueidentifier NOT NULL,
        amount      decimal(15, 2)   NOT NULL,
        order_id    nvarchar(128)    NOT NULL,
        payload     nvarchar(max)    NOT NULL,
        form_url    nvarchar(max)    NULL,
        posted      int              NULL,
        status      int              NULL,
        error       nvarchar(max)    NULL,
        updated_at  datetime2(0)     NOT NULL CONSTRAINT DF_t_payments_updated_at DEFAULT sysdatetime(),
        created_at  datetime2(0)     NOT NULL CONSTRAINT DF_t_payments_created_at DEFAULT sysdatetime()
    );

    CREATE INDEX IX_t_payments_invoice_id ON dbo.t_payments (invoice_id);
END
GO

IF COL_LENGTH(N'dbo.t_payments', N'posted') IS NULL
    ALTER TABLE dbo.t_payments ADD posted int NULL;
GO

IF COL_LENGTH(N'dbo.t_payments', N'status') IS NULL
    ALTER TABLE dbo.t_payments ADD status int NULL;
GO

IF COL_LENGTH(N'dbo.t_payments', N'error') IS NULL
    ALTER TABLE dbo.t_payments ADD error nvarchar(max) NULL;
GO

IF COL_LENGTH(N'dbo.t_payments', N'updated_at') IS NULL
    ALTER TABLE dbo.t_payments ADD updated_at datetime2(0) NOT NULL CONSTRAINT DF_t_payments_updated_at DEFAULT sysdatetime();
GO
