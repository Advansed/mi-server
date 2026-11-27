IF COL_LENGTH(N'dbo.d_acts', N'lic_id') IS NULL
    ALTER TABLE dbo.d_acts ADD lic_id uniqueidentifier NULL;
GO
