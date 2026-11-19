IF COL_LENGTH(N'dbo.t_orders', N'parent_id') IS NULL
    ALTER TABLE dbo.t_orders ADD parent_id uniqueidentifier NULL;
GO
