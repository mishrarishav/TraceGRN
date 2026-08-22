using APItrackGRN.Domain.Common;

namespace APItrackGRN.Domain.Entities;

public sealed class ApplicationSetting : BaseEntity
{
    public required string Key { get; set; }
    public required string ValueJson { get; set; }
    public required string Category { get; set; }
    public string? Description { get; set; }
    public Guid? UpdatedById { get; set; }
}

public sealed class ExcelMappingTemplate : BaseEntity
{
    public required string Name { get; set; }
    public required string MappingJson { get; set; }
    public string? SheetName { get; set; }
    public int? HeaderRowNumber { get; set; }
    public string? SheetAliasesJson { get; set; }
    public string? HeaderSignatureJson { get; set; }
    public string? FileNamePattern { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid? CreatedById { get; set; }
}
