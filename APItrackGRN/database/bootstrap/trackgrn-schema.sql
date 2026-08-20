IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [ApplicationSettings] (
        [Id] uniqueidentifier NOT NULL,
        [Key] nvarchar(150) NOT NULL,
        [ValueJson] nvarchar(max) NOT NULL,
        [Category] nvarchar(100) NOT NULL,
        [Description] nvarchar(500) NULL,
        [UpdatedById] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_ApplicationSettings] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [ExcelMappingTemplates] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [MappingJson] nvarchar(max) NOT NULL,
        [IsDefault] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedById] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_ExcelMappingTemplates] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [GRNHeaders] (
        [Id] uniqueidentifier NOT NULL,
        [GRNNumber] nvarchar(100) NOT NULL,
        [GRNDate] date NOT NULL,
        [VendorCode] nvarchar(100) NULL,
        [VendorName] nvarchar(250) NULL,
        [Plant] nvarchar(50) NULL,
        [StorageLocation] nvarchar(50) NULL,
        [PurchaseOrder] nvarchar(100) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_GRNHeaders] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [IdentificationStrategies] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [StrategyType] nvarchar(50) NOT NULL,
        [SelectedFieldsJson] nvarchar(max) NOT NULL,
        [IsActive] bit NOT NULL,
        [EffectiveFrom] datetimeoffset NOT NULL,
        [CreatedById] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_IdentificationStrategies] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [Materials] (
        [Id] uniqueidentifier NOT NULL,
        [MaterialNumber] nvarchar(100) NOT NULL,
        [Description] nvarchar(500) NOT NULL,
        [UOM] nvarchar(20) NOT NULL,
        [DefaultPackingStandard] decimal(18,4) NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_Materials] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_Materials_DefaultPackingStandard] CHECK ([DefaultPackingStandard] IS NULL OR [DefaultPackingStandard] > 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [Roles] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(50) NOT NULL,
        [Description] nvarchar(250) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_Roles] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [Stations] (
        [Id] uniqueidentifier NOT NULL,
        [StationCode] nvarchar(50) NOT NULL,
        [StationName] nvarchar(200) NOT NULL,
        [Type] nvarchar(30) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_Stations] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [PackingRules] (
        [Id] uniqueidentifier NOT NULL,
        [MaterialId] uniqueidentifier NOT NULL,
        [PackingStandard] decimal(18,4) NOT NULL,
        [UOM] nvarchar(20) NOT NULL,
        [AllowPartialPack] bit NOT NULL,
        [UpdatedById] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_PackingRules] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_PackingRules_PackingStandard] CHECK ([PackingStandard] > 0),
        CONSTRAINT [FK_PackingRules_Materials_MaterialId] FOREIGN KEY ([MaterialId]) REFERENCES [Materials] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] uniqueidentifier NOT NULL,
        [Username] nvarchar(100) NOT NULL,
        [FullName] nvarchar(200) NOT NULL,
        [EmployeeCode] nvarchar(50) NOT NULL,
        [PasswordHash] nvarchar(200) NOT NULL,
        [RoleId] uniqueidentifier NOT NULL,
        [IsActive] bit NOT NULL,
        [LastLoginAt] datetimeoffset NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Users_Roles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [Roles] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NULL,
        [Timestamp] datetimeoffset NOT NULL,
        [Action] nvarchar(100) NOT NULL,
        [EntityName] nvarchar(100) NOT NULL,
        [EntityId] nvarchar(100) NULL,
        [OldValuesJson] nvarchar(max) NULL,
        [NewValuesJson] nvarchar(max) NULL,
        [DeviceId] nvarchar(100) NULL,
        [IpAddress] nvarchar(64) NULL,
        [MetadataJson] nvarchar(max) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AuditLogs_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [ImportBatches] (
        [Id] uniqueidentifier NOT NULL,
        [FileName] nvarchar(260) NOT NULL,
        [FileHash] nvarchar(64) NOT NULL,
        [UploadedAt] datetimeoffset NOT NULL,
        [UploadedById] uniqueidentifier NOT NULL,
        [TotalRows] int NOT NULL,
        [NewRows] int NOT NULL,
        [UpdatedRows] int NOT NULL,
        [UnchangedRows] int NOT NULL,
        [RejectedRows] int NOT NULL,
        [WarningRows] int NOT NULL,
        [ImportStatus] nvarchar(40) NOT NULL,
        [ProcessingDurationMs] bigint NOT NULL,
        [IdentificationStrategyId] uniqueidentifier NOT NULL,
        [IsDuplicateOverride] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_ImportBatches] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ImportBatches_IdentificationStrategies_IdentificationStrategyId] FOREIGN KEY ([IdentificationStrategyId]) REFERENCES [IdentificationStrategies] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ImportBatches_Users_UploadedById] FOREIGN KEY ([UploadedById]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [RefreshTokens] (
        [Id] uniqueidentifier NOT NULL,
        [TokenHash] nvarchar(128) NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [ExpiresAt] datetimeoffset NOT NULL,
        [RevokedAt] datetimeoffset NULL,
        [ReplacedByTokenHash] nvarchar(128) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_RefreshTokens] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_RefreshTokens_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [GRNLines] (
        [Id] uniqueidentifier NOT NULL,
        [GrnHeaderId] uniqueidentifier NOT NULL,
        [MaterialId] uniqueidentifier NOT NULL,
        [SAPLineItemNumber] nvarchar(50) NULL,
        [ReceivedQuantity] decimal(18,4) NOT NULL,
        [PackingStandard] decimal(18,4) NOT NULL,
        [BatchNumber] nvarchar(100) NULL,
        [UOM] nvarchar(20) NOT NULL,
        [BusinessKeyHash] nvarchar(64) NOT NULL,
        [IdentificationStrategyId] uniqueidentifier NOT NULL,
        [ImportBatchId] uniqueidentifier NOT NULL,
        [RecordVersion] int NOT NULL,
        [IsActive] bit NOT NULL,
        [ValidationStatus] nvarchar(40) NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_GRNLines] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_GRNLines_PackingStandard] CHECK ([PackingStandard] > 0),
        CONSTRAINT [CK_GRNLines_ReceivedQuantity] CHECK ([ReceivedQuantity] > 0),
        CONSTRAINT [CK_GRNLines_RecordVersion] CHECK ([RecordVersion] > 0),
        CONSTRAINT [FK_GRNLines_GRNHeaders_GrnHeaderId] FOREIGN KEY ([GrnHeaderId]) REFERENCES [GRNHeaders] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_GRNLines_IdentificationStrategies_IdentificationStrategyId] FOREIGN KEY ([IdentificationStrategyId]) REFERENCES [IdentificationStrategies] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_GRNLines_ImportBatches_ImportBatchId] FOREIGN KEY ([ImportBatchId]) REFERENCES [ImportBatches] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_GRNLines_Materials_MaterialId] FOREIGN KEY ([MaterialId]) REFERENCES [Materials] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [GRNLineRevisionHistory] (
        [Id] uniqueidentifier NOT NULL,
        [GrnLineId] uniqueidentifier NOT NULL,
        [PreviousVersion] int NOT NULL,
        [NewVersion] int NOT NULL,
        [OldValuesJson] nvarchar(max) NOT NULL,
        [NewValuesJson] nvarchar(max) NOT NULL,
        [ChangedFieldsJson] nvarchar(max) NOT NULL,
        [ImportBatchId] uniqueidentifier NOT NULL,
        [ChangedAt] datetimeoffset NOT NULL,
        [ChangedById] uniqueidentifier NOT NULL,
        [ValidationStatus] nvarchar(40) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_GRNLineRevisionHistory] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_GRNLineRevisionHistory_GRNLines_GrnLineId] FOREIGN KEY ([GrnLineId]) REFERENCES [GRNLines] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_GRNLineRevisionHistory_ImportBatches_ImportBatchId] FOREIGN KEY ([ImportBatchId]) REFERENCES [ImportBatches] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [ImportRowResults] (
        [Id] uniqueidentifier NOT NULL,
        [ImportBatchId] uniqueidentifier NOT NULL,
        [ExcelRowNumber] int NOT NULL,
        [RawDataJson] nvarchar(max) NOT NULL,
        [BusinessKeyHash] nvarchar(64) NULL,
        [ResultType] nvarchar(30) NOT NULL,
        [Message] nvarchar(1000) NULL,
        [GrnLineId] uniqueidentifier NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_ImportRowResults] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ImportRowResults_GRNLines_GrnLineId] FOREIGN KEY ([GrnLineId]) REFERENCES [GRNLines] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ImportRowResults_ImportBatches_ImportBatchId] FOREIGN KEY ([ImportBatchId]) REFERENCES [ImportBatches] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [MaterialLabels] (
        [Id] uniqueidentifier NOT NULL,
        [LabelUid] nvarchar(80) NOT NULL,
        [GrnLineId] uniqueidentifier NOT NULL,
        [SequenceNumber] int NOT NULL,
        [LabelQuantity] decimal(18,4) NOT NULL,
        [UOM] nvarchar(20) NOT NULL,
        [QrPayload] nvarchar(500) NOT NULL,
        [LabelStatus] nvarchar(30) NOT NULL,
        [GeneratedAt] datetimeoffset NOT NULL,
        [GeneratedById] uniqueidentifier NOT NULL,
        [PrintedAt] datetimeoffset NULL,
        [PrintCount] int NOT NULL,
        [LastPrintedById] uniqueidentifier NULL,
        [InwardedAt] datetimeoffset NULL,
        [InwardedById] uniqueidentifier NULL,
        [IssuedAt] datetimeoffset NULL,
        [IssuedById] uniqueidentifier NULL,
        [IsActive] bit NOT NULL,
        [RowVersion] rowversion NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_MaterialLabels] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_MaterialLabels_LabelQuantity] CHECK ([LabelQuantity] > 0),
        CONSTRAINT [FK_MaterialLabels_GRNLines_GrnLineId] FOREIGN KEY ([GrnLineId]) REFERENCES [GRNLines] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE TABLE [MaterialTransactions] (
        [Id] uniqueidentifier NOT NULL,
        [TransactionNumber] nvarchar(100) NOT NULL,
        [TransactionType] nvarchar(30) NOT NULL,
        [LabelId] uniqueidentifier NOT NULL,
        [GrnLineId] uniqueidentifier NOT NULL,
        [MaterialId] uniqueidentifier NOT NULL,
        [Quantity] decimal(18,4) NOT NULL,
        [UOM] nvarchar(20) NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [Timestamp] datetimeoffset NOT NULL,
        [DeviceId] nvarchar(100) NULL,
        [StationId] uniqueidentifier NULL,
        [Remarks] nvarchar(1000) NULL,
        [PreviousStatus] nvarchar(30) NOT NULL,
        [NewStatus] nvarchar(30) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_MaterialTransactions] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_MaterialTransactions_Quantity] CHECK ([Quantity] > 0),
        CONSTRAINT [FK_MaterialTransactions_GRNLines_GrnLineId] FOREIGN KEY ([GrnLineId]) REFERENCES [GRNLines] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MaterialTransactions_MaterialLabels_LabelId] FOREIGN KEY ([LabelId]) REFERENCES [MaterialLabels] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MaterialTransactions_Materials_MaterialId] FOREIGN KEY ([MaterialId]) REFERENCES [Materials] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MaterialTransactions_Stations_StationId] FOREIGN KEY ([StationId]) REFERENCES [Stations] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_MaterialTransactions_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ApplicationSettings_Key] ON [ApplicationSettings] ([Key]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_EntityName_EntityId] ON [AuditLogs] ([EntityName], [EntityId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_Timestamp] ON [AuditLogs] ([Timestamp]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_UserId] ON [AuditLogs] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ExcelMappingTemplates_Name] ON [ExcelMappingTemplates] ([Name]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNHeaders_GRNNumber] ON [GRNHeaders] ([GRNNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNHeaders_GRNNumber_Plant_StorageLocation] ON [GRNHeaders] ([GRNNumber], [Plant], [StorageLocation]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_GRNLineRevisionHistory_GrnLineId_NewVersion] ON [GRNLineRevisionHistory] ([GrnLineId], [NewVersion]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNLineRevisionHistory_ImportBatchId] ON [GRNLineRevisionHistory] ([ImportBatchId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNLines_BatchNumber] ON [GRNLines] ([BatchNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_GRNLines_BusinessKeyHash] ON [GRNLines] ([BusinessKeyHash]) WHERE [IsActive] = 1');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNLines_GrnHeaderId] ON [GRNLines] ([GrnHeaderId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNLines_IdentificationStrategyId] ON [GRNLines] ([IdentificationStrategyId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNLines_ImportBatchId] ON [GRNLines] ([ImportBatchId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_GRNLines_MaterialId] ON [GRNLines] ([MaterialId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_IdentificationStrategies_IsActive] ON [IdentificationStrategies] ([IsActive]) WHERE [IsActive] = 1');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ImportBatches_FileHash] ON [ImportBatches] ([FileHash]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ImportBatches_IdentificationStrategyId] ON [ImportBatches] ([IdentificationStrategyId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ImportBatches_UploadedAt] ON [ImportBatches] ([UploadedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ImportBatches_UploadedById] ON [ImportBatches] ([UploadedById]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ImportRowResults_GrnLineId] ON [ImportRowResults] ([GrnLineId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ImportRowResults_ImportBatchId_ExcelRowNumber] ON [ImportRowResults] ([ImportBatchId], [ExcelRowNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MaterialLabels_GrnLineId_SequenceNumber] ON [MaterialLabels] ([GrnLineId], [SequenceNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialLabels_LabelStatus] ON [MaterialLabels] ([LabelStatus]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MaterialLabels_LabelUid] ON [MaterialLabels] ([LabelUid]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Materials_MaterialNumber] ON [Materials] ([MaterialNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialTransactions_GrnLineId] ON [MaterialTransactions] ([GrnLineId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialTransactions_LabelId_TransactionType] ON [MaterialTransactions] ([LabelId], [TransactionType]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialTransactions_MaterialId] ON [MaterialTransactions] ([MaterialId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialTransactions_StationId] ON [MaterialTransactions] ([StationId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialTransactions_Timestamp] ON [MaterialTransactions] ([Timestamp]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_MaterialTransactions_TransactionNumber] ON [MaterialTransactions] ([TransactionNumber]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_MaterialTransactions_UserId] ON [MaterialTransactions] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PackingRules_MaterialId] ON [PackingRules] ([MaterialId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_RefreshTokens_TokenHash] ON [RefreshTokens] ([TokenHash]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_RefreshTokens_UserId_ExpiresAt] ON [RefreshTokens] ([UserId], [ExpiresAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Roles_Name] ON [Roles] ([Name]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Stations_StationCode] ON [Stations] ([StationCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_EmployeeCode] ON [Users] ([EmployeeCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Users_RoleId] ON [Users] ([RoleId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Username] ON [Users] ([Username]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814220435_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260814220435_InitialCreate', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814234448_AddStationHardwareMetadata'
)
BEGIN
    ALTER TABLE [Stations] ADD [DeviceName] nvarchar(150) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814234448_AddStationHardwareMetadata'
)
BEGIN
    ALTER TABLE [Stations] ADD [Location] nvarchar(250) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260814234448_AddStationHardwareMetadata'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260814234448_AddStationHardwareMetadata', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [Materials] ADD [DefaultBinLocation] nvarchar(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [Materials] ADD [OpeningQuantity] decimal(18,4) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [Materials] ADD [PartNumber] nvarchar(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNLines] ADD [BinLocation] nvarchar(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNLines] ADD [ExpectedLabelCount] int NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNLines] ADD [ExpiryDate] date NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNLines] ADD [ManufacturingDate] date NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNHeaders] ADD [InvoiceDate] date NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNHeaders] ADD [InvoiceNumber] nvarchar(100) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNHeaders] ADD [VendorId] uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    CREATE TABLE [Vendors] (
        [Id] uniqueidentifier NOT NULL,
        [VendorCode] nvarchar(100) NOT NULL,
        [VendorName] nvarchar(250) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_Vendors] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    CREATE TABLE [VendorAliases] (
        [Id] uniqueidentifier NOT NULL,
        [VendorId] uniqueidentifier NOT NULL,
        [AliasName] nvarchar(250) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NULL,
        CONSTRAINT [PK_VendorAliases] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_VendorAliases_Vendors_VendorId] FOREIGN KEY ([VendorId]) REFERENCES [Vendors] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    CREATE INDEX [IX_GRNHeaders_VendorId] ON [GRNHeaders] ([VendorId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_VendorAliases_VendorId_AliasName] ON [VendorAliases] ([VendorId], [AliasName]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Vendors_VendorCode] ON [Vendors] ([VendorCode]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    ALTER TABLE [GRNHeaders] ADD CONSTRAINT [FK_GRNHeaders_Vendors_VendorId] FOREIGN KEY ([VendorId]) REFERENCES [Vendors] ([Id]) ON DELETE SET NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260820121735_AddBusinessMasterAndImportFields'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260820121735_AddBusinessMasterAndImportFields', N'8.0.30');
END;
GO

COMMIT;
GO

