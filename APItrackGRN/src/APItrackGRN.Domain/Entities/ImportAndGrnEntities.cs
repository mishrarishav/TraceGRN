using APItrackGRN.Domain.Common;
using APItrackGRN.Domain.Enums;

namespace APItrackGRN.Domain.Entities;

public sealed class IdentificationStrategy : BaseEntity
{
    public required string Name { get; set; }
    public IdentificationStrategyType StrategyType { get; set; }
    public required string SelectedFieldsJson { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset EffectiveFrom { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedById { get; set; }
}

public sealed class ImportBatch : BaseEntity
{
    public required string FileName { get; set; }
    public required string FileHash { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid UploadedById { get; set; }
    public User UploadedBy { get; set; } = null!;
    public int TotalRows { get; set; }
    public int NewRows { get; set; }
    public int UpdatedRows { get; set; }
    public int UnchangedRows { get; set; }
    public int RejectedRows { get; set; }
    public int WarningRows { get; set; }
    public ImportStatus ImportStatus { get; set; }
    public long ProcessingDurationMs { get; set; }
    public Guid IdentificationStrategyId { get; set; }
    public IdentificationStrategy IdentificationStrategy { get; set; } = null!;
    public bool IsDuplicateOverride { get; set; }
    public ICollection<ImportRowResult> RowResults { get; set; } = [];
}

public sealed class GrnHeader : BaseEntity
{
    public required string GrnNumber { get; set; }
    public DateOnly GrnDate { get; set; }
    public string? VendorCode { get; set; }
    public string? VendorName { get; set; }
    public string? Plant { get; set; }
    public string? StorageLocation { get; set; }
    public string? PurchaseOrder { get; set; }
    public ICollection<GrnLine> Lines { get; set; } = [];
}

public sealed class GrnLine : BaseEntity
{
    public Guid GrnHeaderId { get; set; }
    public GrnHeader GrnHeader { get; set; } = null!;
    public Guid MaterialId { get; set; }
    public Material Material { get; set; } = null!;
    public string? SapLineItemNumber { get; set; }
    public decimal ReceivedQuantity { get; set; }
    public decimal PackingStandard { get; set; }
    public string? BatchNumber { get; set; }
    public required string Uom { get; set; }
    public required string BusinessKeyHash { get; set; }
    public Guid IdentificationStrategyId { get; set; }
    public IdentificationStrategy IdentificationStrategy { get; set; } = null!;
    public Guid ImportBatchId { get; set; }
    public ImportBatch ImportBatch { get; set; } = null!;
    public int RecordVersion { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    public RevisionValidationStatus ValidationStatus { get; set; } = RevisionValidationStatus.Valid;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<GrnLineRevisionHistory> Revisions { get; set; } = [];
    public ICollection<MaterialLabel> Labels { get; set; } = [];
}

public sealed class GrnLineRevisionHistory : BaseEntity
{
    public Guid GrnLineId { get; set; }
    public GrnLine GrnLine { get; set; } = null!;
    public int PreviousVersion { get; set; }
    public int NewVersion { get; set; }
    public required string OldValuesJson { get; set; }
    public required string NewValuesJson { get; set; }
    public required string ChangedFieldsJson { get; set; }
    public Guid ImportBatchId { get; set; }
    public ImportBatch ImportBatch { get; set; } = null!;
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid ChangedById { get; set; }
    public RevisionValidationStatus ValidationStatus { get; set; }
}

public sealed class ImportRowResult : BaseEntity
{
    public Guid ImportBatchId { get; set; }
    public ImportBatch ImportBatch { get; set; } = null!;
    public int ExcelRowNumber { get; set; }
    public required string RawDataJson { get; set; }
    public string? BusinessKeyHash { get; set; }
    public ImportResultType ResultType { get; set; }
    public string? Message { get; set; }
    public Guid? GrnLineId { get; set; }
    public GrnLine? GrnLine { get; set; }
}
