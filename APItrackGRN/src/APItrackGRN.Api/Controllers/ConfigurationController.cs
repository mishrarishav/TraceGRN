using System.Text.Json;
using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace APItrackGRN.Api.Controllers;

[Authorize(Roles = "Admin")]
[ApiController]
[Route("api/configuration")]
public sealed class ConfigurationController(
    TrackGrnDbContext dbContext,
    IRequestContext requestContext,
    IAuditWriter audit,
    IOptions<PrinterOptions> printerOptions) : TrackControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpGet]
    [HttpGet("bootstrap")]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var active = await dbContext.IdentificationStrategies.AsNoTracking().SingleAsync(x => x.IsActive, cancellationToken);
        var settings = await dbContext.ApplicationSettings.AsNoTracking().ToDictionaryAsync(x => x.Key, cancellationToken);
        var templates = await dbContext.ExcelMappingTemplates.AsNoTracking().Where(x => x.IsActive)
            .OrderByDescending(x => x.IsDefault).ThenBy(x => x.Name).ToListAsync(cancellationToken);

        return Ok(new
        {
            identificationStrategy = ToStrategy(active),
            strategies = await dbContext.IdentificationStrategies.AsNoTracking().OrderByDescending(x => x.EffectiveFrom)
                .Select(x => new { x.Id, x.Name, x.StrategyType, x.SelectedFieldsJson, x.IsActive, x.EffectiveFrom })
                .ToListAsync(cancellationToken),
            mappingTemplates = templates.Select(x => new
            {
                x.Id, x.Name, mapping = Deserialize<Dictionary<string, string>>(x.MappingJson, []), x.IsDefault, x.IsActive
            }),
            businessRules = Setting(settings, "BusinessRules", new BusinessRulesConfig()),
            labelConfiguration = Setting(settings, "LabelConfiguration", new LabelConfig()),
            plantConfiguration = Setting(settings, "PlantConfiguration", new PlantConfig()),
            importConfiguration = Setting(settings, "ImportConfiguration", new ImportConfig()),
            printing = new
            {
                printerOptions.Value.Mode, printerOptions.Value.PrinterName, printerOptions.Value.Host,
                printerOptions.Value.Port, printerOptions.Value.Dpi,
                hardwareReady = string.Equals(printerOptions.Value.Mode, "Simulation", StringComparison.OrdinalIgnoreCase)
                    || !string.IsNullOrWhiteSpace(printerOptions.Value.Host)
            }
        });
    }

    [HttpPut]
    public async Task<IActionResult> Update(ConfigurationRequest request, CancellationToken cancellationToken)
    {
        if (request.IdentificationStrategy is null)
            return ValidationProblem(new Dictionary<string, string[]> { ["identificationStrategy"] = ["Identification strategy is required."] });
        if (request.IdentificationStrategy.SelectedFields.Count == 0)
            return ValidationProblem(new Dictionary<string, string[]> { ["selectedFields"] = ["At least one identity field is required."] });

        var oldStrategy = await dbContext.IdentificationStrategies.SingleAsync(x => x.IsActive, cancellationToken);
        var oldSnapshot = new { oldStrategy.Name, oldStrategy.StrategyType, oldStrategy.SelectedFieldsJson };
        var requestedFields = JsonSerializer.Serialize(request.IdentificationStrategy.SelectedFields, JsonOptions);
        if (oldStrategy.StrategyType != request.IdentificationStrategy.StrategyType
            || oldStrategy.SelectedFieldsJson != requestedFields
            || oldStrategy.Name != request.IdentificationStrategy.Name.Trim())
        {
            oldStrategy.IsActive = false;
            dbContext.IdentificationStrategies.Add(new IdentificationStrategy
            {
                Name = request.IdentificationStrategy.Name.Trim(),
                StrategyType = request.IdentificationStrategy.StrategyType,
                SelectedFieldsJson = requestedFields,
                IsActive = true,
                CreatedById = requestContext.UserId
            });
        }

        Upsert("BusinessRules", "BusinessRules", request.BusinessRules, "Critical operational business rules");
        Upsert("LabelConfiguration", "Labels", request.LabelConfiguration, "Printable label content and format");
        Upsert("PlantConfiguration", "Plant", request.PlantConfiguration, "Plant defaults and time zone");
        Upsert("ImportConfiguration", "Import", request.ImportConfiguration, "Excel upload constraints and automation");
        audit.Add("ConfigurationUpdated", "Configuration", "System", oldSnapshot, request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("mapping-templates")]
    public async Task<IActionResult> CreateTemplate(MappingTemplateRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Mapping.Count == 0)
            return ValidationProblem(new Dictionary<string, string[]> { ["template"] = ["Template name and at least one mapping are required."] });
        if (await dbContext.ExcelMappingTemplates.AnyAsync(x => x.Name == request.Name.Trim(), cancellationToken))
            return Conflict(new ProblemDetails { Title = "Mapping template already exists", Status = 409 });
        if (request.IsDefault)
        {
            var defaults = await dbContext.ExcelMappingTemplates.Where(x => x.IsDefault).ToListAsync(cancellationToken);
            defaults.ForEach(x => x.IsDefault = false);
        }
        var template = new ExcelMappingTemplate
        {
            Name = request.Name.Trim(), MappingJson = JsonSerializer.Serialize(request.Mapping, JsonOptions),
            IsDefault = request.IsDefault, IsActive = true, CreatedById = requestContext.UserId
        };
        dbContext.ExcelMappingTemplates.Add(template);
        audit.Add("MappingTemplateCreated", "ExcelMappingTemplate", template.Id.ToString(), newValues: request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { template.Id });
    }

    [HttpPut("mapping-templates/{id:guid}")]
    public async Task<IActionResult> UpdateTemplate(Guid id, MappingTemplateRequest request, CancellationToken cancellationToken)
    {
        var template = await dbContext.ExcelMappingTemplates.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (template is null) return NotFound();
        if (request.Mapping.Count == 0) return ValidationProblem(new Dictionary<string, string[]> { ["mapping"] = ["At least one mapping is required."] });
        if (request.IsDefault)
        {
            var defaults = await dbContext.ExcelMappingTemplates.Where(x => x.IsDefault && x.Id != id).ToListAsync(cancellationToken);
            defaults.ForEach(x => x.IsDefault = false);
        }
        var old = new { template.Name, template.MappingJson, template.IsDefault, template.IsActive };
        template.Name = request.Name.Trim();
        template.MappingJson = JsonSerializer.Serialize(request.Mapping, JsonOptions);
        template.IsDefault = request.IsDefault;
        template.IsActive = request.IsActive;
        audit.Add("MappingTemplateUpdated", "ExcelMappingTemplate", id.ToString(), old, request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private void Upsert<T>(string key, string category, T value, string description)
    {
        var setting = dbContext.ApplicationSettings.Local.FirstOrDefault(x => x.Key == key)
            ?? dbContext.ApplicationSettings.SingleOrDefault(x => x.Key == key);
        if (setting is null)
        {
            dbContext.ApplicationSettings.Add(new ApplicationSetting
            {
                Key = key, Category = category, Description = description,
                ValueJson = JsonSerializer.Serialize(value, JsonOptions), UpdatedById = requestContext.UserId
            });
            return;
        }
        setting.ValueJson = JsonSerializer.Serialize(value, JsonOptions);
        setting.UpdatedById = requestContext.UserId;
    }

    private static object ToStrategy(IdentificationStrategy x) => new
    {
        x.Id, x.Name, x.StrategyType,
        selectedFields = Deserialize<List<string>>(x.SelectedFieldsJson, []), x.EffectiveFrom
    };

    private static T Setting<T>(IReadOnlyDictionary<string, ApplicationSetting> settings, string key, T fallback) =>
        settings.TryGetValue(key, out var setting) ? Deserialize(setting.ValueJson, fallback) : fallback;

    private static T Deserialize<T>(string json, T fallback)
    {
        try { return JsonSerializer.Deserialize<T>(json, JsonOptions) ?? fallback; }
        catch (JsonException) { return fallback; }
    }
}

public sealed record StrategyRequest(string Name, IdentificationStrategyType StrategyType, List<string> SelectedFields);
public sealed record MappingTemplateRequest(string Name, Dictionary<string, string> Mapping, bool IsDefault, bool IsActive = true);
public sealed record ConfigurationRequest(
    StrategyRequest? IdentificationStrategy,
    BusinessRulesConfig BusinessRules,
    LabelConfig LabelConfiguration,
    PlantConfig PlantConfiguration,
    ImportConfig ImportConfiguration);

public sealed record BusinessRulesConfig(
    bool RequireInwardBeforeIssue = true,
    bool AllowLabelReprint = true,
    bool RequireReprintReason = true,
    bool AllowDuplicateInward = false,
    bool RequireStationForIssue = true,
    bool AllowGrnRevisionAfterLabelsGenerated = true,
    bool AllowGrnRevisionAfterMaterialIssued = false,
    bool RequireAdminReviewForQuantityDecrease = true);
public sealed record LabelConfig(
    string UidPrefix = "LBL", string LabelSize = "100x75", string CompanyName = "TraceFlow Industries",
    int QrSize = 160, bool ShowBatch = true, bool ShowGrnDate = true,
    bool ShowDescription = true, bool ShowBinSequence = true);
public sealed record PlantConfig(string DefaultPlant = "1000", string DefaultStorageLocation = "RM01", string TimeZone = "Asia/Kolkata");
public sealed record ImportConfig(int MaxFileSizeMb = 10, bool BlockDuplicateFileHashes = true, bool AutoGenerateLabels = true);
