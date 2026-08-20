using System.Text.Json;
using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize(Roles = "Admin")]
[ApiController]
[Route("api/configuration")]
public sealed class ConfigurationController(
    TrackGrnDbContext dbContext,
    IRequestContext requestContext,
    IAuditWriter audit,
    ILabelPrinter printer,
    IPrinterDiscoveryService printerDiscovery) : TrackControllerBase
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
        var printerConfiguration = await printer.GetConfigurationAsync(cancellationToken);

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
                printerConfiguration.Mode, printerConfiguration.PrinterName, printerConfiguration.Host,
                printerConfiguration.Port, printerConfiguration.Dpi,
                printerConfiguration.ConnectionTimeoutSeconds,
                hardwareReady = PrinterIsReady(printerConfiguration)
            }
        });
    }

    [HttpPost("printer/test")]
    public async Task<IActionResult> TestPrinter(CancellationToken cancellationToken)
    {
        var configuration = await printer.GetConfigurationAsync(cancellationToken);
        var labelUid = $"TEST-{DateTime.Now:yyyyMMdd-HHmmss}";
        PrintDispatchResult result;
        try
        {
            result = await printer.PrintAsync(TestJob(labelUid), cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return PrinterFailure(exception);
        }

        audit.Add("PrinterTestDispatched", "Printer", result.Printer, newValues: new
        {
            labelUid,
            result.Mode,
            result.Printer,
            result.Simulated,
            configuration.Dpi
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            ok = true,
            labelUid,
            result.Mode,
            result.Printer,
            result.Simulated,
            configuration.Dpi
        });
    }

    [HttpGet("printer/discover")]
    public async Task<IActionResult> DiscoverPrinters(CancellationToken cancellationToken) =>
        Ok(await printerDiscovery.DiscoverAsync(cancellationToken));

    [HttpGet("printer/agents/discover")]
    public async Task<IActionResult> DiscoverPrintAgents(CancellationToken cancellationToken) =>
        Ok(await printerDiscovery.DiscoverAgentsAsync(cancellationToken));

    [HttpPost("printer/configure-and-test")]
    public async Task<IActionResult> ConfigureAndTestPrinter(
        ConfigurePrinterRequest request,
        CancellationToken cancellationToken)
    {
        var validation = ValidatePrinter(request);
        if (validation.Count > 0) return ValidationProblem(validation);

        var configuration = new PrinterOptions
        {
            Mode = NormalizeMode(request.Mode),
            PrinterName = request.PrinterName.Trim(),
            Host = string.IsNullOrWhiteSpace(request.Host) ? null : request.Host.Trim(),
            Port = request.Port,
            Dpi = request.Dpi,
            ConnectionTimeoutSeconds = Math.Clamp(request.ConnectionTimeoutSeconds, 1, 30)
        };
        var labelUid = $"TEST-{DateTime.Now:yyyyMMdd-HHmmss}";
        PrintDispatchResult result;
        try
        {
            result = await printer.PrintAsync(TestJob(labelUid), cancellationToken, configuration);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return PrinterFailure(exception);
        }

        var previous = await printer.GetConfigurationAsync(cancellationToken);
        Upsert(
            "PrinterConfiguration",
            "Hardware",
            configuration,
            "Runtime printer adapter configuration verified by a test label");
        audit.Add("PrinterConfigured", "Printer", configuration.PrinterName, previous, configuration, new
        {
            labelUid,
            result.Mode,
            result.Simulated
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            ok = true,
            saved = true,
            labelUid,
            result.Mode,
            result.Printer,
            result.Simulated,
            configuration.Host,
            configuration.Port,
            configuration.Dpi
        });
    }

    [HttpPut]
    public async Task<IActionResult> Update(ConfigurationRequest request, CancellationToken cancellationToken)
    {
        if (request.IdentificationStrategy is null)
            return ValidationProblem(new Dictionary<string, string[]> { ["identificationStrategy"] = ["Identification strategy is required."] });
        if (request.IdentificationStrategy.SelectedFields.Count == 0)
            return ValidationProblem(new Dictionary<string, string[]> { ["selectedFields"] = ["At least one identity field is required."] });

        var plantValidation = ValidatePlantConfiguration(request.PlantConfiguration);
        if (plantValidation.Count > 0) return ValidationProblem(plantValidation);

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

    private static bool PrinterIsReady(PrinterOptions options) =>
        string.Equals(options.Mode, "Simulation", StringComparison.OrdinalIgnoreCase)
        || string.Equals(options.Mode, "WindowsSpooler", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.PrinterName)
        || string.Equals(options.Mode, "RawTcp", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.Host)
        || string.Equals(options.Mode, "LocalAgent", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.Host)
            && !string.IsNullOrWhiteSpace(options.PrinterName);

    private static LabelPrintJob TestJob(string labelUid) => new(
        labelUid,
        "M06030952",
        "TRACKGRN ZEBRA PRINTER TEST",
        "TEST-NO-DB",
        "TEST-BATCH",
        200m,
        "PC",
        1,
        1);

    private static Dictionary<string, string[]> ValidatePrinter(ConfigurePrinterRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var mode = NormalizeMode(request.Mode);
        if (mode is not ("Simulation" or "WindowsSpooler" or "RawTcp" or "LocalAgent"))
            errors["mode"] = ["Mode must be Simulation, WindowsSpooler, RawTcp, or LocalAgent."];
        if (string.IsNullOrWhiteSpace(request.PrinterName))
            errors["printerName"] = ["A printer display name or Windows queue name is required."];
        if (mode == "RawTcp" && string.IsNullOrWhiteSpace(request.Host))
            errors["host"] = ["Network printer IP address or hostname is required for RawTcp mode."];
        if (mode == "LocalAgent" && string.IsNullOrWhiteSpace(request.Host))
            errors["host"] = ["The Windows computer running TrackGRN Print Agent is required."];
        if (request.Port is < 1 or > 65535)
            errors["port"] = ["Printer port must be between 1 and 65535."];
        if (request.Dpi is < 100 or > 1200)
            errors["dpi"] = ["Printer DPI must be between 100 and 1200."];
        if (request.ConnectionTimeoutSeconds is < 1 or > 30)
            errors["connectionTimeoutSeconds"] = ["Connection timeout must be between 1 and 30 seconds."];
        return errors;
    }

    private static string NormalizeMode(string? mode) => mode?.Trim().ToLowerInvariant() switch
    {
        "simulation" => "Simulation",
        "windowsspooler" => "WindowsSpooler",
        "rawtcp" => "RawTcp",
        "localagent" => "LocalAgent",
        _ => mode?.Trim() ?? string.Empty
    };

    private static Dictionary<string, string[]> ValidatePlantConfiguration(PlantConfig configuration)
    {
        var errors = new Dictionary<string, string[]>();
        if ((configuration.ClientName?.Length ?? 0) > 100)
            errors["plantConfiguration.clientName"] = ["Client name cannot exceed 100 characters."];

        if (!string.IsNullOrWhiteSpace(configuration.ClientLogoDataUrl))
        {
            if (configuration.ClientLogoDataUrl.Length > 1_400_000)
                errors["plantConfiguration.clientLogoDataUrl"] = ["Client logo must be smaller than 1 MB."];
            else if (!configuration.ClientLogoDataUrl.StartsWith("data:image/png;base64,", StringComparison.OrdinalIgnoreCase)
                     && !configuration.ClientLogoDataUrl.StartsWith("data:image/jpeg;base64,", StringComparison.OrdinalIgnoreCase)
                     && !configuration.ClientLogoDataUrl.StartsWith("data:image/webp;base64,", StringComparison.OrdinalIgnoreCase))
                errors["plantConfiguration.clientLogoDataUrl"] = ["Client logo must be a PNG, JPEG, or WebP image."];
        }

        return errors;
    }

    private ObjectResult PrinterFailure(Exception exception) => StatusCode(
        StatusCodes.Status502BadGateway,
        new ProblemDetails
        {
            Title = "Printer connection failed",
            Detail = exception.Message,
            Status = StatusCodes.Status502BadGateway
        });
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
    string UidPrefix = "LBL", string LabelSize = "100x75", string CompanyName = "TrackGRN Industries",
    int QrSize = 160, bool ShowBatch = true, bool ShowGrnDate = true,
    bool ShowDescription = true, bool ShowBinSequence = true);
public sealed record PlantConfig(
    string DefaultPlant = "1000",
    string DefaultStorageLocation = "RM01",
    string TimeZone = "Asia/Kolkata",
    string ClientName = "",
    string ClientLogoDataUrl = "");
public sealed record ImportConfig(int MaxFileSizeMb = 10, bool BlockDuplicateFileHashes = true, bool AutoGenerateLabels = true);
public sealed record ConfigurePrinterRequest(
    string Mode,
    string PrinterName,
    string? Host,
    int Port = 9100,
    int Dpi = 203,
    int ConnectionTimeoutSeconds = 5);
