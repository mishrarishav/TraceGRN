using APItrackGRN.Domain.Common;
using APItrackGRN.Domain.Enums;

namespace APItrackGRN.Domain.Entities;

public sealed class Material : BaseEntity
{
    public required string MaterialNumber { get; set; }
    public required string Description { get; set; }
    public required string Uom { get; set; }
    public decimal? DefaultPackingStandard { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<GrnLine> GrnLines { get; set; } = [];
}

public sealed class Station : BaseEntity
{
    public required string StationCode { get; set; }
    public required string StationName { get; set; }
    public StationType Type { get; set; }
    public string? Location { get; set; }
    public string? DeviceName { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class PackingRule : BaseEntity
{
    public Guid MaterialId { get; set; }
    public Material Material { get; set; } = null!;
    public decimal PackingStandard { get; set; }
    public required string Uom { get; set; }
    public bool AllowPartialPack { get; set; } = true;
    public Guid? UpdatedById { get; set; }
}
