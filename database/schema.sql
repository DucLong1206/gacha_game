-- SQL Server schema for global-unique gacha + permadeath

CREATE TABLE dbo.Users (
    UserID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    UserName NVARCHAR(64) NOT NULL UNIQUE,
    SoftCurrency BIGINT NOT NULL DEFAULT 0,
    PremiumCurrency BIGINT NOT NULL DEFAULT 0,
    SoulStone INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Characters (
    CharacterID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    Name NVARCHAR(120) NOT NULL,
    Rarity TINYINT NOT NULL CHECK (Rarity BETWEEN 1 AND 10),
    IsUnique BIT NOT NULL DEFAULT 0,
    BaseHP INT NOT NULL,
    BaseATK INT NOT NULL,
    BaseDEF INT NOT NULL,
    SkillSetJson NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Character_Pool (
    CharacterID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    OwnerID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(32) NOT NULL CHECK (Status IN ('Available', 'Owned', 'Downed', 'Dead', 'WaitingForResurrection')),
    BannerTag NVARCHAR(64) NULL,
    Version ROWVERSION NOT NULL,
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_CharacterPool_Character FOREIGN KEY (CharacterID) REFERENCES dbo.Characters(CharacterID),
    CONSTRAINT FK_CharacterPool_Owner FOREIGN KEY (OwnerID) REFERENCES dbo.Users(UserID)
);

CREATE INDEX IX_CharacterPool_Status_Banner ON dbo.Character_Pool(Status, BannerTag) INCLUDE (OwnerID);
CREATE INDEX IX_CharacterPool_OwnerID ON dbo.Character_Pool(OwnerID) WHERE OwnerID IS NOT NULL;

CREATE TABLE dbo.User_Inventory (
    InventoryID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    UserID UNIQUEIDENTIFIER NOT NULL,
    CharacterID UNIQUEIDENTIFIER NOT NULL,
    CurrentHP INT NOT NULL,
    IsLocked BIT NOT NULL DEFAULT 0,
    IsDowned BIT NOT NULL DEFAULT 0,
    DownedExpireAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_UserInventory_Character UNIQUE (CharacterID),
    CONSTRAINT FK_UserInventory_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_UserInventory_Character FOREIGN KEY (CharacterID) REFERENCES dbo.Characters(CharacterID)
);

CREATE TABLE dbo.Gacha_Transactions (
    TxID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    UserID UNIQUEIDENTIFIER NOT NULL,
    BannerTag NVARCHAR(64) NOT NULL,
    CharacterID UNIQUEIDENTIFIER NOT NULL,
    Cost BIGINT NOT NULL,
    IdempotencyKey NVARCHAR(128) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_GachaTx_Idempotency UNIQUE (UserID, IdempotencyKey),
    CONSTRAINT FK_GachaTx_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_GachaTx_Character FOREIGN KEY (CharacterID) REFERENCES dbo.Characters(CharacterID)
);

GO

CREATE OR ALTER PROCEDURE dbo.usp_GachaPullAtomic
    @UserID UNIQUEIDENTIFIER,
    @BannerTag NVARCHAR(64),
    @Cost BIGINT,
    @IdempotencyKey NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CharacterID UNIQUEIDENTIFIER;

    BEGIN TRAN;

    IF EXISTS (
        SELECT 1 FROM dbo.Gacha_Transactions
        WHERE UserID = @UserID AND IdempotencyKey = @IdempotencyKey
    )
    BEGIN
        SELECT TOP 1 CharacterID
        FROM dbo.Gacha_Transactions
        WHERE UserID = @UserID AND IdempotencyKey = @IdempotencyKey;
        COMMIT TRAN;
        RETURN;
    END

    UPDATE dbo.Users
    SET PremiumCurrency = PremiumCurrency - @Cost
    WHERE UserID = @UserID AND PremiumCurrency >= @Cost;

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK TRAN;
        THROW 50001, 'Insufficient currency', 1;
    END

    DECLARE @Pulled TABLE (CharacterID UNIQUEIDENTIFIER);

    ;WITH cte AS (
        SELECT TOP 1 cp.CharacterID
        FROM dbo.Character_Pool cp WITH (UPDLOCK, ROWLOCK, READPAST)
        INNER JOIN dbo.Characters c ON c.CharacterID = cp.CharacterID
        WHERE cp.Status = 'Available'
          AND (@BannerTag IS NULL OR cp.BannerTag = @BannerTag)
        ORDER BY NEWID()
    )
    UPDATE cp
    SET OwnerID = @UserID,
        Status = 'Owned',
        UpdatedAt = SYSUTCDATETIME()
    OUTPUT inserted.CharacterID INTO @Pulled(CharacterID)
    FROM dbo.Character_Pool cp
    INNER JOIN cte ON cte.CharacterID = cp.CharacterID;

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK TRAN;
        THROW 50002, 'Pool empty', 1;
    END

    SELECT TOP 1 @CharacterID = CharacterID FROM @Pulled;

    INSERT INTO dbo.User_Inventory (InventoryID, UserID, CharacterID, CurrentHP)
    SELECT NEWID(), @UserID, c.CharacterID, c.BaseHP
    FROM dbo.Characters c
    WHERE c.CharacterID = @CharacterID;

    INSERT INTO dbo.Gacha_Transactions (TxID, UserID, BannerTag, CharacterID, Cost, IdempotencyKey)
    VALUES (NEWID(), @UserID, ISNULL(@BannerTag, N'global'), @CharacterID, @Cost, @IdempotencyKey);

    COMMIT TRAN;

    SELECT @CharacterID AS CharacterID;
END
GO

