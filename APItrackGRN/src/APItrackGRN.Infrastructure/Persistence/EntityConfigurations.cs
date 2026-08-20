using APItrackGRN.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace APItrackGRN.Infrastructure.Persistence;

internal sealed class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("Roles");
        builder.Property(x => x.Name).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(250);
        builder.HasIndex(x => x.Name).IsUnique();
    }
}

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Users");
        builder.Property(x => x.Username).HasMaxLength(100).IsRequired();
        builder.Property(x => x.FullName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.EmployeeCode).HasMaxLength(50).IsRequired();
        builder.Property(x => x.PasswordHash).HasMaxLength(200).IsRequired();
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.HasIndex(x => x.Username).IsUnique();
        builder.HasIndex(x => x.EmployeeCode).IsUnique();
        builder.HasOne(x => x.Role).WithMany(x => x.Users).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("RefreshTokens");
        builder.Property(x => x.TokenHash).HasMaxLength(128).IsRequired();
        builder.Property(x => x.ReplacedByTokenHash).HasMaxLength(128);
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => new { x.UserId, x.ExpiresAt });
        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class MaterialConfiguration : IEntityTypeConfiguration<Material>
{
    public void Configure(EntityTypeBuilder<Material> builder)
    {
        builder.ToTable("Materials", table =>
            table.HasCheckConstraint("CK_Materials_DefaultPackingStandard", "[DefaultPackingStandard] IS NULL OR [DefaultPackingStandard] > 0"));
        builder.Property(x => x.MaterialNumber).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(500).IsRequired();
        builder.Property(x => x.Uom).HasColumnName("UOM").HasMaxLength(20).IsRequired();
        builder.Property(x => x.DefaultPackingStandard).HasPrecision(18, 4);
        builder.Property(x => x.PartNumber).HasMaxLength(100);
        builder.Property(x => x.DefaultBinLocation).HasMaxLength(100);
        builder.Property(x => x.OpeningQuantity).HasPrecision(18, 4);
        builder.HasIndex(x => x.MaterialNumber).IsUnique();
    }
}

internal sealed class VendorConfiguration : IEntityTypeConfiguration<Vendor>
{
    public void Configure(EntityTypeBuilder<Vendor> builder)
    {
        builder.ToTable("Vendors");
        builder.Property(x => x.VendorCode).HasMaxLength(100).IsRequired();
        builder.Property(x => x.VendorName).HasMaxLength(250).IsRequired();
        builder.HasIndex(x => x.VendorCode).IsUnique();
    }
}

internal sealed class VendorAliasConfiguration : IEntityTypeConfiguration<VendorAlias>
{
    public void Configure(EntityTypeBuilder<VendorAlias> builder)
    {
        builder.ToTable("VendorAliases");
        builder.Property(x => x.AliasName).HasMaxLength(250).IsRequired();
        builder.HasIndex(x => new { x.VendorId, x.AliasName }).IsUnique();
        builder.HasOne(x => x.Vendor).WithMany(x => x.Aliases).HasForeignKey(x => x.VendorId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class StationConfiguration : IEntityTypeConfiguration<Station>
{
    public void Configure(EntityTypeBuilder<Station> builder)
    {
        builder.ToTable("Stations");
        builder.Property(x => x.StationCode).HasMaxLength(50).IsRequired();
        builder.Property(x => x.StationName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Location).HasMaxLength(250);
        builder.Property(x => x.DeviceName).HasMaxLength(150);
        builder.HasIndex(x => x.StationCode).IsUnique();
    }
}

internal sealed class PackingRuleConfiguration : IEntityTypeConfiguration<PackingRule>
{
    public void Configure(EntityTypeBuilder<PackingRule> builder)
    {
        builder.ToTable("PackingRules", table =>
            table.HasCheckConstraint("CK_PackingRules_PackingStandard", "[PackingStandard] > 0"));
        builder.Property(x => x.PackingStandard).HasPrecision(18, 4);
        builder.Property(x => x.Uom).HasColumnName("UOM").HasMaxLength(20).IsRequired();
        builder.HasIndex(x => x.MaterialId).IsUnique();
        builder.HasOne(x => x.Material).WithMany().HasForeignKey(x => x.MaterialId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class IdentificationStrategyConfiguration : IEntityTypeConfiguration<IdentificationStrategy>
{
    public void Configure(EntityTypeBuilder<IdentificationStrategy> builder)
    {
        builder.ToTable("IdentificationStrategies");
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.StrategyType).HasConversion<string>().HasMaxLength(50);
        builder.Property(x => x.SelectedFieldsJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.HasIndex(x => x.IsActive).HasFilter("[IsActive] = 1").IsUnique();
    }
}

internal sealed class ImportBatchConfiguration : IEntityTypeConfiguration<ImportBatch>
{
    public void Configure(EntityTypeBuilder<ImportBatch> builder)
    {
        builder.ToTable("ImportBatches");
        builder.Property(x => x.FileName).HasMaxLength(260).IsRequired();
        builder.Property(x => x.FileHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.ImportStatus).HasConversion<string>().HasMaxLength(40);
        builder.HasIndex(x => x.FileHash);
        builder.HasIndex(x => x.UploadedAt);
        builder.HasOne(x => x.UploadedBy).WithMany().HasForeignKey(x => x.UploadedById).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.IdentificationStrategy).WithMany().HasForeignKey(x => x.IdentificationStrategyId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class GrnHeaderConfiguration : IEntityTypeConfiguration<GrnHeader>
{
    public void Configure(EntityTypeBuilder<GrnHeader> builder)
    {
        builder.ToTable("GRNHeaders");
        builder.Property(x => x.GrnNumber).HasColumnName("GRNNumber").HasMaxLength(100).IsRequired();
        builder.Property(x => x.GrnDate).HasColumnName("GRNDate");
        builder.Property(x => x.VendorCode).HasMaxLength(100);
        builder.Property(x => x.VendorName).HasMaxLength(250);
        builder.Property(x => x.InvoiceNumber).HasMaxLength(100);
        builder.Property(x => x.Plant).HasMaxLength(50);
        builder.Property(x => x.StorageLocation).HasMaxLength(50);
        builder.Property(x => x.PurchaseOrder).HasMaxLength(100);
        builder.HasIndex(x => x.GrnNumber);
        builder.HasIndex(x => new { x.GrnNumber, x.Plant, x.StorageLocation });
        builder.HasOne(x => x.Vendor).WithMany(x => x.GrnHeaders).HasForeignKey(x => x.VendorId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class GrnLineConfiguration : IEntityTypeConfiguration<GrnLine>
{
    public void Configure(EntityTypeBuilder<GrnLine> builder)
    {
        builder.ToTable("GRNLines", table =>
        {
            table.HasCheckConstraint("CK_GRNLines_ReceivedQuantity", "[ReceivedQuantity] > 0");
            table.HasCheckConstraint("CK_GRNLines_PackingStandard", "[PackingStandard] > 0");
            table.HasCheckConstraint("CK_GRNLines_RecordVersion", "[RecordVersion] > 0");
        });
        builder.Property(x => x.SapLineItemNumber).HasColumnName("SAPLineItemNumber").HasMaxLength(50);
        builder.Property(x => x.ReceivedQuantity).HasPrecision(18, 4);
        builder.Property(x => x.PackingStandard).HasPrecision(18, 4);
        builder.Property(x => x.BatchNumber).HasMaxLength(100);
        builder.Property(x => x.BinLocation).HasMaxLength(100);
        builder.Property(x => x.Uom).HasColumnName("UOM").HasMaxLength(20).IsRequired();
        builder.Property(x => x.BusinessKeyHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.ValidationStatus).HasConversion<string>().HasMaxLength(40);
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.HasIndex(x => x.BusinessKeyHash).HasFilter("[IsActive] = 1").IsUnique();
        builder.HasIndex(x => x.ImportBatchId);
        builder.HasIndex(x => x.BatchNumber);
        builder.HasOne(x => x.GrnHeader).WithMany(x => x.Lines).HasForeignKey(x => x.GrnHeaderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.Material).WithMany(x => x.GrnLines).HasForeignKey(x => x.MaterialId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.IdentificationStrategy).WithMany().HasForeignKey(x => x.IdentificationStrategyId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.ImportBatch).WithMany().HasForeignKey(x => x.ImportBatchId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class GrnLineRevisionConfiguration : IEntityTypeConfiguration<GrnLineRevisionHistory>
{
    public void Configure(EntityTypeBuilder<GrnLineRevisionHistory> builder)
    {
        builder.ToTable("GRNLineRevisionHistory");
        builder.Property(x => x.OldValuesJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.Property(x => x.NewValuesJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.Property(x => x.ChangedFieldsJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.Property(x => x.ValidationStatus).HasConversion<string>().HasMaxLength(40);
        builder.HasIndex(x => new { x.GrnLineId, x.NewVersion }).IsUnique();
        builder.HasOne(x => x.GrnLine).WithMany(x => x.Revisions).HasForeignKey(x => x.GrnLineId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.ImportBatch).WithMany().HasForeignKey(x => x.ImportBatchId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ImportRowResultConfiguration : IEntityTypeConfiguration<ImportRowResult>
{
    public void Configure(EntityTypeBuilder<ImportRowResult> builder)
    {
        builder.ToTable("ImportRowResults");
        builder.Property(x => x.RawDataJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.Property(x => x.BusinessKeyHash).HasMaxLength(64);
        builder.Property(x => x.ResultType).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Message).HasMaxLength(1000);
        builder.HasIndex(x => new { x.ImportBatchId, x.ExcelRowNumber }).IsUnique();
        builder.HasOne(x => x.ImportBatch).WithMany(x => x.RowResults).HasForeignKey(x => x.ImportBatchId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.GrnLine).WithMany().HasForeignKey(x => x.GrnLineId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class MaterialLabelConfiguration : IEntityTypeConfiguration<MaterialLabel>
{
    public void Configure(EntityTypeBuilder<MaterialLabel> builder)
    {
        builder.ToTable("MaterialLabels", table =>
            table.HasCheckConstraint("CK_MaterialLabels_LabelQuantity", "[LabelQuantity] > 0"));
        builder.Property(x => x.LabelUid).HasMaxLength(80).IsRequired();
        builder.Property(x => x.LabelQuantity).HasPrecision(18, 4);
        builder.Property(x => x.Uom).HasColumnName("UOM").HasMaxLength(20).IsRequired();
        builder.Property(x => x.QrPayload).HasMaxLength(500).IsRequired();
        builder.Property(x => x.LabelStatus).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.HasIndex(x => x.LabelUid).IsUnique();
        builder.HasIndex(x => new { x.GrnLineId, x.SequenceNumber }).IsUnique();
        builder.HasIndex(x => x.LabelStatus);
        builder.HasOne(x => x.GrnLine).WithMany(x => x.Labels).HasForeignKey(x => x.GrnLineId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class MaterialTransactionConfiguration : IEntityTypeConfiguration<MaterialTransaction>
{
    public void Configure(EntityTypeBuilder<MaterialTransaction> builder)
    {
        builder.ToTable("MaterialTransactions", table =>
            table.HasCheckConstraint("CK_MaterialTransactions_Quantity", "[Quantity] > 0"));
        builder.Property(x => x.TransactionNumber).HasMaxLength(100).IsRequired();
        builder.Property(x => x.TransactionType).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Quantity).HasPrecision(18, 4);
        builder.Property(x => x.Uom).HasColumnName("UOM").HasMaxLength(20).IsRequired();
        builder.Property(x => x.DeviceId).HasMaxLength(100);
        builder.Property(x => x.Remarks).HasMaxLength(1000);
        builder.Property(x => x.PreviousStatus).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.NewStatus).HasConversion<string>().HasMaxLength(30);
        builder.HasIndex(x => x.TransactionNumber).IsUnique();
        builder.HasIndex(x => x.Timestamp);
        builder.HasIndex(x => new { x.LabelId, x.TransactionType });
        builder.HasOne(x => x.Label).WithMany(x => x.Transactions).HasForeignKey(x => x.LabelId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.GrnLine).WithMany().HasForeignKey(x => x.GrnLineId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.Material).WithMany().HasForeignKey(x => x.MaterialId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.Station).WithMany().HasForeignKey(x => x.StationId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");
        builder.Property(x => x.Action).HasMaxLength(100).IsRequired();
        builder.Property(x => x.EntityName).HasMaxLength(100).IsRequired();
        builder.Property(x => x.EntityId).HasMaxLength(100);
        builder.Property(x => x.DeviceId).HasMaxLength(100);
        builder.Property(x => x.IpAddress).HasMaxLength(64);
        builder.Property(x => x.OldValuesJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.NewValuesJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.MetadataJson).HasColumnType("nvarchar(max)");
        builder.HasIndex(x => x.Timestamp);
        builder.HasIndex(x => new { x.EntityName, x.EntityId });
        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ApplicationSettingConfiguration : IEntityTypeConfiguration<ApplicationSetting>
{
    public void Configure(EntityTypeBuilder<ApplicationSetting> builder)
    {
        builder.ToTable("ApplicationSettings");
        builder.Property(x => x.Key).HasMaxLength(150).IsRequired();
        builder.Property(x => x.ValueJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.Property(x => x.Category).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(500);
        builder.HasIndex(x => x.Key).IsUnique();
    }
}

internal sealed class ExcelMappingTemplateConfiguration : IEntityTypeConfiguration<ExcelMappingTemplate>
{
    public void Configure(EntityTypeBuilder<ExcelMappingTemplate> builder)
    {
        builder.ToTable("ExcelMappingTemplates");
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.MappingJson).HasColumnType("nvarchar(max)").IsRequired();
        builder.HasIndex(x => x.Name).IsUnique();
    }
}
