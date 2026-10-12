IF OBJECT_ID(N'dbo.t_session', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.t_session (
        id          uniqueidentifier NOT NULL CONSTRAINT PK_t_session PRIMARY KEY DEFAULT newid(),
        user_id     uniqueidentifier NOT NULL,
        open_date   datetime2(0)     NOT NULL,
        close_date  datetime2(0)     NULL
    );

    CREATE INDEX IX_t_session_user_id ON dbo.t_session (user_id);
END
GO

CREATE OR ALTER PROCEDURE dbo.p_open_session
    @json nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @token   uniqueidentifier;
    DECLARE @user_id uniqueidentifier;
    DECLARE @id      uniqueidentifier = NEWID();
    DECLARE @out     nvarchar(max);

    SELECT @token = token
    FROM OPENJSON(@json)
    WITH (token uniqueidentifier '$.token');

    IF @token IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Не верный токен"}' AS data;
        RETURN;
    END;

    SELECT @user_id = id FROM t_logins WHERE token = @token;

    IF @user_id IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Токен не найден или невалиден"}' AS data;
        RETURN;
    END;

    INSERT INTO t_session (id, user_id, open_date, close_date)
    VALUES (@id, @user_id, SYSDATETIME(), NULL);

    SELECT @out = (
        SELECT id, user_id, open_date, close_date
        FROM t_session
        WHERE id = @id
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT '{"success": true, "data": ' + ISNULL(@out, '{}') + '}' AS data;
END
GO

CREATE OR ALTER PROCEDURE dbo.p_close_session
    @json nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @token      uniqueidentifier;
    DECLARE @session_id uniqueidentifier;
    DECLARE @user_id    uniqueidentifier;
    DECLARE @close_date datetime2(0);
    DECLARE @found      bit = 0;
    DECLARE @out        nvarchar(max);

    SELECT
        @token      = token,
        @session_id = id
    FROM OPENJSON(@json)
    WITH (
        token uniqueidentifier '$.token',
        id    uniqueidentifier '$.id'
    );

    IF @token IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Не верный токен"}' AS data;
        RETURN;
    END;

    SELECT @user_id = id FROM t_logins WHERE token = @token;

    IF @user_id IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Токен не найден или невалиден"}' AS data;
        RETURN;
    END;

    IF @session_id IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Не указана сессия"}' AS data;
        RETURN;
    END;

    SELECT
        @found      = 1,
        @close_date = close_date
    FROM t_session
    WHERE id = @session_id AND user_id = @user_id;

    IF @found = 0
    BEGIN
        SELECT '{"success": false, "message": "Сессия не найдена"}' AS data;
        RETURN;
    END;

    IF @close_date IS NOT NULL
    BEGIN
        SELECT '{"success": false, "message": "Смена уже закрыта"}' AS data;
        RETURN;
    END;

    UPDATE t_session
    SET close_date = SYSDATETIME()
    WHERE id = @session_id AND user_id = @user_id AND close_date IS NULL;

    SELECT @out = (
        SELECT id, user_id, open_date, close_date
        FROM t_session
        WHERE id = @session_id
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT '{"success": true, "data": ' + ISNULL(@out, '{}') + '}' AS data;
END
GO

CREATE OR ALTER PROCEDURE dbo.p_get_session
    @json nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @token   uniqueidentifier;
    DECLARE @user_id uniqueidentifier;
    DECLARE @out     nvarchar(max);

    SELECT @token = token
    FROM OPENJSON(@json)
    WITH (token uniqueidentifier '$.token');

    IF @token IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Не верный токен"}' AS data;
        RETURN;
    END;

    SELECT @user_id = id FROM t_logins WHERE token = @token;

    IF @user_id IS NULL
    BEGIN
        SELECT '{"success": false, "message": "Токен не найден или невалиден"}' AS data;
        RETURN;
    END;

    SELECT @out = (
        SELECT TOP (1) id, user_id, open_date, close_date
        FROM t_session
        WHERE user_id = @user_id AND close_date IS NULL
        ORDER BY open_date DESC
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT '{"success": true, "data": ' + ISNULL(@out, 'null') + '}' AS data;
END
GO
