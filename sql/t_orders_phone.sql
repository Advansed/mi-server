IF COL_LENGTH(N'dbo.t_orders', N'phone') IS NULL
    ALTER TABLE dbo.t_orders ADD phone varchar(16) NULL;
GO

IF COL_LENGTH(N'dbo.t_orders', N'phone') IS NOT NULL
   AND EXISTS (
        SELECT 1
        FROM sys.columns AS c
        INNER JOIN sys.types AS t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID(N'dbo.t_orders')
          AND c.name = N'phone'
          AND (t.name <> N'varchar' OR c.max_length <> 16)
   )
    ALTER TABLE dbo.t_orders ALTER COLUMN phone varchar(16) NULL;
GO
