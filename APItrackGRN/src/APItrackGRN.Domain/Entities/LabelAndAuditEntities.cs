using APItrackGRN.Domain.Common;
using APItrackGRN.Domain.Enums;

namespace APItrackGRN.Domain.Entities;

public sealed class MaterialLabel : BaseEntity
{
    public required string LabelUid { get; set; }
    public Guid GrnLineId { get; set; }
    public GrnLine GrnLine { get; set; } = null!;
    public int SequenceNumber { get; set; }
    public decimal LabelQuantity { get; set; }
    public required string Uom { get; set; }
    public required string QrPayload { get; set; }
    public LabelStatus LabelStatus { get; set; } = LabelStatus.Generated;
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid GeneratedById { get; set; }
    public DateTimeOffset? PrintedAt { get; set; }
    public int PrintCount { get; set; }
    public Guid? LastPrintedById { get; set; }
    public DateTimeOffset? InwardedAt { get; set; }
    public Guid? InwardedById { get; set; }
    public DateTimeOffset? IssuedAt { get; set; }
    public Guid? IssuedById { get; set; }
    public bool IsActive { get; set; } = true;
    public byte[] RowVersion { get; set; } = [];
    public ICollection<MaterialTransaction> Transactions { get; set; } = [];
}

public sealed class MaterialTransaction : BaseEntity
{
    public required string TransactionNumber { get; set; }
    public TransactionType TransactionType { get; set; }
    public Guid LabelId { get; set; }
    public MaterialLabel Label { get; set; } = null!;
    public Guid GrnLineId { get; set; }
    public GrnLine GrnLine { get; set; } = null!;
    public Guid MaterialId { get; set; }
    public Material Material { get; set; } = null!;
    public decimal Quantity { get; set; }
    public required string Uom { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public string? DeviceId { get; set; }
    public Guid? StationId { get; set; }
    public Station? Station { get; set; }
    public string? Remarks { get; set; }
    public LabelStatus PreviousStatus { get; set; }
    public LabelStatus NewStatus { get; set; }
}

public sealed class AuditLog : BaseEntity
{
    public Guid? UserId { get; set; }
    public User? User { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public required string Action { get; set; }
    public required string EntityName { get; set; }
    public string? EntityId { get; set; }
    public string? OldValuesJson { get; set; }
    public string? NewValuesJson { get; set; }
    public string? DeviceId { get; set; }
    public string? IpAddress { get; set; }
    public string? MetadataJson { get; set; }
}
