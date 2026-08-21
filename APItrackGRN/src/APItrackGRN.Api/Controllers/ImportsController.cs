using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using APItrackGRN.Api.Services;
using APItrackGRN.Application.BusinessKeys;
using APItrackGRN.Application.Labels;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize(Roles = "Admin,StoreManager")]
[ApiController]
[Route("api/imports")]
public sealed class ImportsController(
    TrackGrnDbContext dbContext,
    IBusinessKeyCalculator businessKeyCalculator,
    ILabelQuantityCalculator labelQuantityCalculator,
    IRequestContext requestContext,
    IAuditWriter audit) : TrackControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpGet("options")]
    public async Task<IActionResult> Options(CancellationToken cancellationToken)
    {
        var strategy = await dbContext.IdentificationStrategies.AsNoTracking().SingleAsync(x => x.IsActive, cancellationToken);
        var templates = await dbContext.ExcelMappingTemplates.AsNoTracking().Where(x => x.IsActive)
            .OrderByDescending(x => x.IsDefault).ThenBy(x => x.Name)
            .Select(x => new { x.Id, x.Name, x.IsDefault }).ToListAsync(cancellationToken);
        return Ok(new
        {
            identificationStrategy = new
            {
                strategy.Id, strategy.Name,
                selectedFields = JsonSerializer.Deserialize<string[]>(strategy.SelectedFieldsJson, JsonOptions) ?? []
            },
            mappingTemplates = templates
        });
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var rows = await dbContext.ImportBatches.AsNoTracking().Include(x => x.UploadedBy)
            .Include(x => x.IdentificationStrategy).OrderByDescending(x => x.UploadedAt).Take(500)
            .ToListAsync(cancellationToken);
        var defaultTemplate = await dbContext.ExcelMappingTemplates.AsNoTracking().Where(x => x.IsDefault)
            .Select(x => x.Name).FirstOrDefaultAsync(cancellationToken) ?? "Default SAP GRN Format";
        return Ok(rows.Select(x => BatchDto(x, defaultTemplate)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var batch = await dbContext.ImportBatches.AsNoTracking().Include(x => x.UploadedBy)
            .Include(x => x.IdentificationStrategy).SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (batch is null) return NotFound();
        var rows = await dbContext.ImportRowResults.AsNoTracking().Where(x => x.ImportBatchId == id)
            .OrderBy(x => x.ExcelRowNumber).ToListAsync(cancellationToken);
        return Ok(new { batch = BatchDto(batch, "Configured template"), rows = rows.Select(RowDto) });
    }

    [HttpPost("inspect")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Inspect(IFormFile file, CancellationToken cancellationToken)
    {
        var upload = await ReadUpload(file, cancellationToken);
        if (upload.Error is not null) return upload.Error;

        ImportWorkbookData workbook;
        try { workbook = ImportWorkbookReader.Read(upload.Bytes!, upload.Extension!); }
        catch (InvalidDataException exception) { return ValidationProblem(Error("file", exception.Message)); }

        var profiles = await dbContext.ExcelMappingTemplates.AsNoTracking().Where(x => x.IsActive)
            .OrderByDescending(x => x.IsDefault).ThenBy(x => x.Name).ToListAsync(cancellationToken);
        var selection = FindBestSelection(workbook, profiles, file.FileName);
        var selectedSheet = workbook.Sheets[selection.SheetIndex];
        var selectedHeaders = HeadersAt(selectedSheet, selection.HeaderRowNumber);
        var mapping = ImportFileParser.SuggestMapping(selectedHeaders, selection.ProfileMapping);
        var requiredMapped = ImportFileParser.Fields.Count(x => x.Required && mapping.Values.Contains(x.Key, StringComparer.OrdinalIgnoreCase));
        var requiredTotal = ImportFileParser.Fields.Count(x => x.Required);

        var sheets = workbook.Sheets.Select((sheet, index) => new
        {
            name = sheet.Name,
            index,
            rowCount = sheet.Rows.Count,
            columnCount = sheet.ColumnCount,
            previewTruncated = sheet.Rows.Count > 75 || sheet.ColumnCount > 80,
            rows = sheet.Rows.Take(75).Select(row => row.Take(80).ToArray()).ToArray()
        });
        return Ok(new
        {
            fileName = Path.GetFileName(file.FileName),
            extension = upload.Extension,
            sheets,
            selectedSheetName = selectedSheet.Name,
            selectedHeaderRow = selection.HeaderRowNumber,
            matchedTemplate = selection.Profile is null ? null : new
            {
                selection.Profile.Id,
                selection.Profile.Name,
                confidence = selection.Confidence
            },
            mapping,
            fields = ImportFileParser.Fields,
            requiredMapped,
            requiredTotal,
            readyForImport = requiredMapped == requiredTotal
        });
    }

    [HttpPost("profiles")]
    public async Task<IActionResult> SaveProfile(ImportProfileRequest request, CancellationToken cancellationToken)
    {
        var errors = ValidateProfile(request);
        if (errors.Count > 0) return ValidationProblem(errors);

        ExcelMappingTemplate? profile = null;
        if (request.TemplateId is not null)
            profile = await dbContext.ExcelMappingTemplates.SingleOrDefaultAsync(x => x.Id == request.TemplateId, cancellationToken);
        if (profile is null)
            profile = await dbContext.ExcelMappingTemplates.SingleOrDefaultAsync(x => x.Name == request.Name.Trim(), cancellationToken);

        if (profile is not null && await dbContext.ExcelMappingTemplates.AnyAsync(
                x => x.Id != profile.Id && x.Name == request.Name.Trim(), cancellationToken))
            return Conflict(new ProblemDetails { Title = "Profile name already exists", Status = 409 });

        var creating = profile is null;
        profile ??= new ExcelMappingTemplate
        {
            Name = request.Name.Trim(),
            MappingJson = "{}",
            CreatedById = requestContext.UserId,
            IsActive = true
        };
        var existingMapping = DeserializeMapping(profile.MappingJson);
        foreach (var pair in request.Mapping!.Where(x => !string.IsNullOrWhiteSpace(x.Key) && !string.IsNullOrWhiteSpace(x.Value)))
            existingMapping[pair.Key.Trim()] = pair.Value.Trim();
        var sheetAliases = DeserializeStrings(profile.SheetAliasesJson);
        if (!sheetAliases.Contains(request.SheetName.Trim(), StringComparer.OrdinalIgnoreCase))
            sheetAliases.Add(request.SheetName.Trim());

        profile.Name = request.Name.Trim();
        profile.MappingJson = JsonSerializer.Serialize(existingMapping, JsonOptions);
        profile.SheetName ??= request.SheetName.Trim();
        profile.HeaderRowNumber = request.HeaderRowNumber;
        profile.SheetAliasesJson = JsonSerializer.Serialize(sheetAliases, JsonOptions);
        profile.HeaderSignatureJson = JsonSerializer.Serialize((request.Headers ?? []).Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToArray(), JsonOptions);
        profile.FileNamePattern = NormalizeFileName(request.FileName);
        profile.LastUsedAt = DateTimeOffset.UtcNow;
        profile.IsActive = true;
        if (creating) dbContext.ExcelMappingTemplates.Add(profile);

        audit.Add(creating ? "ImportProfileCreated" : "ImportProfileUpdated", "ExcelMappingTemplate",
            profile.Id.ToString(), newValues: new { profile.Name, Sheet = request.SheetName, request.HeaderRowNumber, AliasesLearned = request.Mapping!.Count });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { profile.Id, profile.Name, mapping = existingMapping, sheetAliases });
    }

    [HttpPost("preview")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Preview(IFormFile file, [FromForm] Guid? mappingTemplateId,
        [FromForm] string? sheetName, [FromForm] int? headerRowNumber, [FromForm] string? mappingJson,
        [FromForm] bool overrideDuplicate = false, CancellationToken cancellationToken = default)
    {
        var upload = await ReadUpload(file, cancellationToken);
        if (upload.Error is not null) return upload.Error;
        var extension = upload.Extension!;
        var bytes = upload.Bytes!;
        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        var duplicate = await dbContext.ImportBatches.AsNoTracking().Where(x => x.FileHash == hash && x.ImportStatus != ImportStatus.Failed)
            .OrderByDescending(x => x.UploadedAt).Select(x => new { x.Id, x.FileName, x.UploadedAt }).FirstOrDefaultAsync(cancellationToken);
        if (duplicate is not null && !overrideDuplicate)
        {
            var problem = new ProblemDetails { Title = "Duplicate import file", Detail = $"This file was already uploaded as {duplicate.FileName} at {duplicate.UploadedAt:O}.", Status = 409 };
            problem.Extensions["code"] = "DUPLICATE_FILE";
            problem.Extensions["existingBatchId"] = duplicate.Id;
            return Conflict(problem);
        }

        var strategy = await dbContext.IdentificationStrategies.SingleAsync(x => x.IsActive, cancellationToken);
        var selectedFields = JsonSerializer.Deserialize<List<string>>(strategy.SelectedFieldsJson, JsonOptions) ?? [];
        var template = mappingTemplateId is null
            ? await dbContext.ExcelMappingTemplates.OrderByDescending(x => x.IsDefault).FirstOrDefaultAsync(x => x.IsActive, cancellationToken)
            : await dbContext.ExcelMappingTemplates.SingleOrDefaultAsync(x => x.Id == mappingTemplateId && x.IsActive, cancellationToken);
        if (template is null) return ValidationProblem(Error("mappingTemplateId", "No active Excel mapping template is configured."));
        Dictionary<string, string> mapping;
        try
        {
            mapping = string.IsNullOrWhiteSpace(mappingJson)
                ? DeserializeMapping(template.MappingJson)
                : JsonSerializer.Deserialize<Dictionary<string, string>>(mappingJson, JsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return ValidationProblem(Error("mappingJson", "Column mapping is not valid JSON."));
        }
        sheetName = string.IsNullOrWhiteSpace(sheetName) ? template.SheetName : sheetName.Trim();
        headerRowNumber ??= template.HeaderRowNumber;
        var stopwatch = Stopwatch.StartNew();
        List<NormalizedImportRow> parsed;
        try { parsed = ImportFileParser.Parse(bytes, extension, mapping, sheetName, headerRowNumber); }
        catch (InvalidDataException exception) { return ValidationProblem(Error("file", exception.Message)); }

        var materials = await dbContext.Materials.AsNoTracking().ToDictionaryAsync(x => x.MaterialNumber, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var vendors = await dbContext.Vendors.AsNoTracking().Include(x => x.Aliases)
            .ToDictionaryAsync(x => x.VendorCode, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var candidates = new List<PreviewCandidate>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var source in parsed)
        {
            var warnings = new List<string>();
            var normalized = ApplyDefaults(source, materials, vendors, warnings);
            var errors = ValidateRow(normalized, selectedFields);
            if (normalized.ExpectedLabelCount is not null && normalized.ReceivedQuantity > 0 && normalized.PackingStandard > 0)
            {
                var calculated = labelQuantityCalculator.Calculate(normalized.ReceivedQuantity, normalized.PackingStandard).Count;
                if (normalized.ExpectedLabelCount != calculated)
                    warnings.Add($"Source expects {normalized.ExpectedLabelCount} labels, but quantity and pack quantity calculate to {calculated}.");
            }
            var values = IdentityValues(normalized);
            var key = errors.Count == 0 ? businessKeyCalculator.Calculate(values, selectedFields) : null;
            if (key is not null && !seen.Add(key)) errors.Add("Duplicate business identity within this workbook.");
            candidates.Add(new PreviewCandidate(normalized, key, errors, warnings));
        }

        var keys = candidates.Where(x => x.BusinessKeyHash is not null).Select(x => x.BusinessKeyHash!).Distinct().ToList();
        var existing = new Dictionary<string, ExistingLine>(StringComparer.OrdinalIgnoreCase);
        foreach (var chunk in keys.Chunk(1000))
        {
            var found = await dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive && chunk.Contains(x.BusinessKeyHash))
                .Select(x => new ExistingLine(x.Id, x.BusinessKeyHash, x.ReceivedQuantity, x.PackingStandard,
                    x.BatchNumber, x.Uom, x.Material.Description, x.BinLocation, x.ManufacturingDate,
                    x.ExpiryDate, x.ExpectedLabelCount, x.GrnHeader.VendorCode, x.GrnHeader.VendorName,
                    x.GrnHeader.InvoiceNumber, x.GrnHeader.InvoiceDate,
                    x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Issued).Sum(l => (decimal?)l.LabelQuantity) ?? 0,
                    x.Labels.Any(l => l.IsActive && l.LabelStatus != LabelStatus.Generated)))
                .ToListAsync(cancellationToken);
            foreach (var line in found) existing[line.BusinessKeyHash] = line;
        }

        var batch = new ImportBatch
        {
            FileName = Path.GetFileName(file.FileName), FileHash = hash, UploadedById = requestContext.UserId,
            TotalRows = candidates.Count, ImportStatus = ImportStatus.Pending,
            IdentificationStrategyId = strategy.Id, IsDuplicateOverride = overrideDuplicate
        };
        dbContext.ImportBatches.Add(batch);
        foreach (var candidate in candidates)
        {
            var (type, message) = Classify(candidate, existing);
            var result = new ImportRowResult
            {
                ImportBatchId = batch.Id, ExcelRowNumber = candidate.Row.ExcelRowNumber,
                RawDataJson = JsonSerializer.Serialize(candidate.Row, JsonOptions),
                BusinessKeyHash = candidate.BusinessKeyHash, ResultType = type, Message = message,
                GrnLineId = candidate.BusinessKeyHash is not null && existing.TryGetValue(candidate.BusinessKeyHash, out var current) ? current.Id : null
            };
            dbContext.ImportRowResults.Add(result);
            Count(batch, type);
        }
        stopwatch.Stop();
        batch.ProcessingDurationMs = stopwatch.ElapsedMilliseconds;
        template.LastUsedAt = DateTimeOffset.UtcNow;
        audit.Add("ExcelPreviewed", "ImportBatch", batch.Id.ToString(), newValues: new { batch.FileName, batch.TotalRows, batch.NewRows, batch.UpdatedRows, batch.UnchangedRows, batch.WarningRows, batch.RejectedRows, TemplateName = template.Name, SheetName = sheetName, HeaderRowNumber = headerRowNumber, StrategyName = strategy.Name });
        await dbContext.SaveChangesAsync(cancellationToken);
        var rowResults = await dbContext.ImportRowResults.AsNoTracking().Where(x => x.ImportBatchId == batch.Id).OrderBy(x => x.ExcelRowNumber).ToListAsync(cancellationToken);
        return Ok(new { batch = BatchDto(batch, template.Name), rows = rowResults.Select(RowDto) });
    }

    [HttpPost("{id:guid}/commit")]
    public async Task<IActionResult> Commit(Guid id, CancellationToken cancellationToken)
    {
        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(() => CommitCore(id, cancellationToken));
    }

    private async Task<IActionResult> CommitCore(Guid id, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var batch = await dbContext.ImportBatches.Include(x => x.RowResults).Include(x => x.IdentificationStrategy)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (batch is null) return NotFound();
        if (batch.ImportStatus != ImportStatus.Pending)
            return Conflict(new ProblemDetails { Title = "Import was already committed", Detail = $"Current status: {batch.ImportStatus}", Status = 409 });
        batch.ImportStatus = ImportStatus.Processing;
        var rows = batch.RowResults.OrderBy(x => x.ExcelRowNumber).ToList();
        var materials = await dbContext.Materials.ToDictionaryAsync(x => x.MaterialNumber, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var vendors = await dbContext.Vendors.Include(x => x.Aliases)
            .ToDictionaryAsync(x => x.VendorCode, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var headers = await dbContext.GrnHeaders.ToListAsync(cancellationToken);
        var autoLabels = await AutoGenerateLabels(cancellationToken);
        var applied = 0;

        foreach (var result in rows.Where(x => x.ResultType is not ImportResultType.Rejected and not ImportResultType.Unchanged))
        {
            var row = JsonSerializer.Deserialize<NormalizedImportRow>(result.RawDataJson, JsonOptions)!;
            if (!materials.TryGetValue(row.MaterialNumber, out var material))
            {
                material = new Material
                {
                    MaterialNumber = row.MaterialNumber, Description = row.MaterialDescription,
                    Uom = row.Uom, DefaultPackingStandard = row.PackingStandard,
                    DefaultBinLocation = string.IsNullOrWhiteSpace(row.BinLocation) ? null : row.BinLocation,
                    IsActive = true
                };
                materials.Add(material.MaterialNumber, material);
                dbContext.Materials.Add(material);
            }
            else
            {
                material.Description = row.MaterialDescription;
                material.Uom = row.Uom;
                material.DefaultPackingStandard ??= row.PackingStandard;
                material.DefaultBinLocation ??= string.IsNullOrWhiteSpace(row.BinLocation) ? null : row.BinLocation;
            }

            Vendor? vendor = null;
            if (!string.IsNullOrWhiteSpace(row.VendorCode))
            {
                if (!vendors.TryGetValue(row.VendorCode, out vendor))
                {
                    vendor = new Vendor
                    {
                        VendorCode = row.VendorCode,
                        VendorName = string.IsNullOrWhiteSpace(row.VendorName) ? row.VendorCode : row.VendorName,
                        IsActive = true
                    };
                    vendors.Add(vendor.VendorCode, vendor);
                    dbContext.Vendors.Add(vendor);
                }
            }
            var header = headers.FirstOrDefault(x => x.GrnNumber == row.GrnNumber
                && string.Equals(x.Plant, row.Plant, StringComparison.OrdinalIgnoreCase)
                && string.Equals(x.StorageLocation, row.StorageLocation, StringComparison.OrdinalIgnoreCase));
            if (header is null)
            {
                header = new GrnHeader
                {
                    GrnNumber = row.GrnNumber, GrnDate = row.GrnDate, Vendor = vendor,
                    VendorCode = row.VendorCode, VendorName = row.VendorName,
                    InvoiceNumber = row.InvoiceNumber, InvoiceDate = row.InvoiceDate,
                    Plant = row.Plant, StorageLocation = row.StorageLocation, PurchaseOrder = row.PurchaseOrder
                };
                headers.Add(header);
                dbContext.GrnHeaders.Add(header);
            }
            else
            {
                header.GrnDate = row.GrnDate;
                header.Vendor = vendor;
                header.VendorCode = row.VendorCode;
                header.VendorName = row.VendorName;
                header.InvoiceNumber = row.InvoiceNumber;
                header.InvoiceDate = row.InvoiceDate;
                header.PurchaseOrder = row.PurchaseOrder;
            }

            var line = result.BusinessKeyHash is null ? null : await dbContext.GrnLines.Include(x => x.Labels)
                .SingleOrDefaultAsync(x => x.IsActive && x.BusinessKeyHash == result.BusinessKeyHash, cancellationToken);
            if (line is null)
            {
                line = new GrnLine
                {
                    GrnHeader = header, Material = material, SapLineItemNumber = row.SapLineItemNumber,
                    ReceivedQuantity = row.ReceivedQuantity, PackingStandard = row.PackingStandard,
                    BatchNumber = row.BatchNumber, BinLocation = row.BinLocation,
                    ManufacturingDate = row.ManufacturingDate, ExpiryDate = row.ExpiryDate,
                    ExpectedLabelCount = row.ExpectedLabelCount, Uom = row.Uom, BusinessKeyHash = result.BusinessKeyHash!,
                    IdentificationStrategyId = batch.IdentificationStrategyId, ImportBatchId = batch.Id,
                    ValidationStatus = result.ResultType == ImportResultType.Warning
                        ? RevisionValidationStatus.Warning : RevisionValidationStatus.Valid
                };
                dbContext.GrnLines.Add(line);
                if (autoLabels) GenerateLabels(line, row.ReceivedQuantity, 0, batch.UploadedById);
            }
            else
            {
                var issued = line.Labels.Where(x => x.IsActive && x.LabelStatus == LabelStatus.Issued).Sum(x => x.LabelQuantity);
                if (row.ReceivedQuantity < issued)
                {
                    result.ResultType = ImportResultType.Rejected;
                    result.Message = $"Received quantity {row.ReceivedQuantity} is below issued quantity {issued}.";
                    continue;
                }
                var changed = ChangedFields(line, row);
                if (changed.Count == 0)
                {
                    result.ResultType = ImportResultType.Unchanged;
                    continue;
                }
                var old = Snapshot(line);
                var oldVersion = line.RecordVersion;
                if (autoLabels && !ReconcileLabels(line, row.ReceivedQuantity, batch.UploadedById, out var reconciliationError))
                {
                    result.ResultType = ImportResultType.Rejected;
                    result.Message = reconciliationError;
                    continue;
                }
                line.GrnHeader = header;
                line.Material = material;
                line.SapLineItemNumber = row.SapLineItemNumber;
                line.ReceivedQuantity = row.ReceivedQuantity;
                line.PackingStandard = row.PackingStandard;
                line.BatchNumber = row.BatchNumber;
                line.BinLocation = row.BinLocation;
                line.ManufacturingDate = row.ManufacturingDate;
                line.ExpiryDate = row.ExpiryDate;
                line.ExpectedLabelCount = row.ExpectedLabelCount;
                line.Uom = row.Uom;
                line.ImportBatchId = batch.Id;
                line.RecordVersion++;
                line.ValidationStatus = result.ResultType == ImportResultType.Warning
                    ? RevisionValidationStatus.Warning : RevisionValidationStatus.Valid;
                dbContext.GrnLineRevisionHistory.Add(new GrnLineRevisionHistory
                {
                    GrnLineId = line.Id, PreviousVersion = oldVersion, NewVersion = line.RecordVersion,
                    OldValuesJson = JsonSerializer.Serialize(old, JsonOptions),
                    NewValuesJson = JsonSerializer.Serialize(Snapshot(line), JsonOptions),
                    ChangedFieldsJson = JsonSerializer.Serialize(changed, JsonOptions), ImportBatchId = batch.Id,
                    ChangedById = requestContext.UserId, ValidationStatus = line.ValidationStatus
                });
            }
            result.GrnLineId = line.Id;
            applied++;
        }

        batch.ImportStatus = batch.RowResults.Any(x => x.ResultType is ImportResultType.Warning or ImportResultType.Rejected)
            ? ImportStatus.CompletedWithWarnings : ImportStatus.Completed;
        batch.RejectedRows = batch.RowResults.Count(x => x.ResultType == ImportResultType.Rejected);
        batch.WarningRows = batch.RowResults.Count(x => x.ResultType == ImportResultType.Warning);
        batch.UpdatedRows = batch.RowResults.Count(x => x.ResultType == ImportResultType.Updated);
        batch.UnchangedRows = batch.RowResults.Count(x => x.ResultType == ImportResultType.Unchanged);
        audit.Add("ExcelImportCommitted", "ImportBatch", batch.Id.ToString(), newValues: new { batch.FileName, applied, batch.ImportStatus, batch.RejectedRows, batch.WarningRows });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(new { batchId = batch.Id, status = batch.ImportStatus.ToString(), applied, batch.NewRows, batch.UpdatedRows, batch.UnchangedRows, batch.WarningRows, batch.RejectedRows });
    }

    private static NormalizedImportRow ApplyDefaults(
        NormalizedImportRow row,
        IReadOnlyDictionary<string, Material> materials,
        IReadOnlyDictionary<string, Vendor> vendors,
        ICollection<string> warnings)
    {
        materials.TryGetValue(row.MaterialNumber, out var material);
        vendors.TryGetValue(row.VendorCode, out var vendor);
        if (vendor is not null && !string.IsNullOrWhiteSpace(row.VendorName))
        {
            var sourceNameMatches = string.Equals(vendor.VendorName, row.VendorName, StringComparison.OrdinalIgnoreCase)
                || vendor.Aliases.Any(alias => string.Equals(alias.AliasName, row.VendorName, StringComparison.OrdinalIgnoreCase));
            if (!sourceNameMatches)
                warnings.Add($"Supplier name '{row.VendorName}' does not match vendor master {vendor.VendorCode} ({vendor.VendorName}); master name will be used.");
        }
        return row with
        {
            MaterialDescription = string.IsNullOrWhiteSpace(row.MaterialDescription) ? material?.Description ?? string.Empty : row.MaterialDescription,
            PackingStandard = row.PackingStandard > 0 ? row.PackingStandard : material?.DefaultPackingStandard ?? 0,
            Uom = string.IsNullOrWhiteSpace(row.Uom) ? material?.Uom ?? "PCS" : row.Uom.ToUpperInvariant(),
            Plant = string.IsNullOrWhiteSpace(row.Plant) ? "1000" : row.Plant,
            StorageLocation = string.IsNullOrWhiteSpace(row.StorageLocation) ? "RM01" : row.StorageLocation,
            BinLocation = string.IsNullOrWhiteSpace(row.BinLocation) ? material?.DefaultBinLocation ?? string.Empty : row.BinLocation,
            VendorName = vendor?.VendorName ?? row.VendorName
        };
    }

    private static List<string> ValidateRow(NormalizedImportRow row, IReadOnlyCollection<string> identityFields)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(row.GrnNumber)) errors.Add("GRN number is required.");
        if (row.GrnDate == default) errors.Add("GRN date is invalid.");
        if (string.IsNullOrWhiteSpace(row.MaterialNumber)) errors.Add("Material number is required.");
        if (string.IsNullOrWhiteSpace(row.MaterialDescription)) errors.Add("Material description is required.");
        if (row.ReceivedQuantity <= 0) errors.Add("Received quantity must be greater than zero.");
        if (row.PackingStandard <= 0) errors.Add("Packing standard is missing or invalid.");
        if (row.ManufacturingDate is not null && row.ExpiryDate is not null && row.ExpiryDate < row.ManufacturingDate)
            errors.Add("Expiry date cannot be earlier than manufacturing date.");
        var values = IdentityValues(row);
        foreach (var field in identityFields.Where(field => !values.TryGetValue(field, out var value) || string.IsNullOrWhiteSpace(value)))
            errors.Add($"Identity field {field} is required by the active strategy.");
        return errors;
    }

    private static Dictionary<string, string?> IdentityValues(NormalizedImportRow row) => new(StringComparer.OrdinalIgnoreCase)
    {
        ["GRNNumber"] = row.GrnNumber, ["MaterialNumber"] = row.MaterialNumber,
        ["SAPLineItemNumber"] = row.SapLineItemNumber, ["BatchNumber"] = row.BatchNumber,
        ["Plant"] = row.Plant, ["StorageLocation"] = row.StorageLocation, ["PurchaseOrder"] = row.PurchaseOrder
    };

    private static (ImportResultType Type, string Message) Classify(PreviewCandidate candidate, IReadOnlyDictionary<string, ExistingLine> existing)
    {
        if (candidate.Errors.Count > 0) return (ImportResultType.Rejected, string.Join(" ", candidate.Errors));
        if (!existing.TryGetValue(candidate.BusinessKeyHash!, out var line))
            return WithWarnings(candidate, ImportResultType.New, "New business identity; row will be inserted.");
        var row = candidate.Row;
        if (row.ReceivedQuantity < line.IssuedQuantity)
            return (ImportResultType.Rejected, $"Received quantity {row.ReceivedQuantity} cannot be below issued quantity {line.IssuedQuantity}.");
        if (row.PackingStandard != line.PackingStandard && line.HasProcessedLabels)
            return (ImportResultType.Rejected, "Packing standard cannot change after labels have been printed or processed.");
        var changed = row.ReceivedQuantity != line.ReceivedQuantity || row.PackingStandard != line.PackingStandard
            || !string.Equals(row.BatchNumber, line.BatchNumber, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.Uom, line.Uom, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.MaterialDescription, line.Description, StringComparison.Ordinal)
            || !string.Equals(row.BinLocation, line.BinLocation, StringComparison.OrdinalIgnoreCase)
            || row.ManufacturingDate != line.ManufacturingDate || row.ExpiryDate != line.ExpiryDate
            || row.ExpectedLabelCount != line.ExpectedLabelCount
            || !string.Equals(row.VendorCode, line.VendorCode, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.VendorName, line.VendorName, StringComparison.Ordinal)
            || !string.Equals(row.InvoiceNumber, line.InvoiceNumber, StringComparison.OrdinalIgnoreCase)
            || row.InvoiceDate != line.InvoiceDate;
        if (!changed) return WithWarnings(candidate, ImportResultType.Unchanged, "No business field changed.");
        if (row.ReceivedQuantity < line.ReceivedQuantity)
            return WithWarnings(candidate, ImportResultType.Warning, "Quantity decrease will be reconciled against unprocessed labels during commit.");
        return WithWarnings(candidate, ImportResultType.Updated, "Existing line will be revised and label delta reconciled.");
    }

    private static (ImportResultType Type, string Message) WithWarnings(
        PreviewCandidate candidate,
        ImportResultType type,
        string message)
    {
        if (candidate.Warnings.Count == 0) return (type, message);
        var resultType = type is ImportResultType.New or ImportResultType.Updated ? ImportResultType.Warning : type;
        return (resultType, $"{message} {string.Join(" ", candidate.Warnings)}");
    }

    private bool ReconcileLabels(GrnLine line, decimal newQuantity, Guid userId, out string? error)
    {
        error = null;
        var active = line.Labels.Where(x => x.IsActive && x.LabelStatus != LabelStatus.Cancelled).OrderByDescending(x => x.SequenceNumber).ToList();
        var total = active.Sum(x => x.LabelQuantity);
        if (newQuantity > total)
        {
            GenerateLabels(line, newQuantity - total, active.Count == 0 ? 0 : active.Max(x => x.SequenceNumber), userId);
            return true;
        }
        var excess = total - newQuantity;
        if (excess <= 0) return true;
        foreach (var label in active.Where(x => x.LabelStatus is LabelStatus.Generated or LabelStatus.Printed))
        {
            if (excess <= 0) break;
            if (label.LabelQuantity <= excess)
            {
                var previousStatus = label.LabelStatus;
                label.LabelStatus = LabelStatus.Cancelled;
                label.IsActive = false;
                excess -= label.LabelQuantity;
                AddTransaction(label, line, TransactionType.Cancel, userId, previousStatus, LabelStatus.Cancelled, "Cancelled by quantity revision");
            }
            else if (label.LabelStatus == LabelStatus.Generated && label.PrintCount == 0)
            {
                label.LabelQuantity -= excess;
                excess = 0;
            }
        }
        if (excess <= 0) return true;
        error = $"Quantity decrease leaves {excess:0.####} that cannot be removed because labels are already inwarded or issued.";
        return false;
    }

    private void GenerateLabels(GrnLine line, decimal quantity, int startSequence, Guid userId)
    {
        var quantities = labelQuantityCalculator.Calculate(quantity, line.PackingStandard);
        for (var index = 0; index < quantities.Count; index++)
        {
            var sequence = startSequence + index + 1;
            var uid = $"LBL-{DateTime.UtcNow:yyMMdd}-{Guid.NewGuid():N}"[..24].ToUpperInvariant();
            var label = new MaterialLabel
            {
                LabelUid = uid, GrnLine = line, SequenceNumber = sequence, LabelQuantity = quantities[index],
                Uom = line.Uom, QrPayload = uid, LabelStatus = LabelStatus.Generated, GeneratedById = userId
            };
            dbContext.MaterialLabels.Add(label);
            AddTransaction(label, line, TransactionType.LabelGenerated, userId, LabelStatus.Generated, LabelStatus.Generated, "Auto-generated from SAP import");
        }
    }

    private void AddTransaction(MaterialLabel label, GrnLine line, TransactionType type, Guid userId,
        LabelStatus previous, LabelStatus next, string remarks)
    {
        var now = DateTimeOffset.UtcNow;
        dbContext.MaterialTransactions.Add(new MaterialTransaction
        {
            TransactionNumber = $"TXN-{type.ToString()[..Math.Min(3, type.ToString().Length)].ToUpperInvariant()}-{now:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}"[..48],
            TransactionType = type, Label = label, GrnLine = line, Material = line.Material,
            Quantity = label.LabelQuantity, Uom = label.Uom, UserId = userId, Timestamp = now,
            Remarks = remarks, PreviousStatus = previous, NewStatus = next
        });
    }

    private async Task<bool> AutoGenerateLabels(CancellationToken cancellationToken)
    {
        var json = await dbContext.ApplicationSettings.AsNoTracking().Where(x => x.Key == "ImportConfiguration")
            .Select(x => x.ValueJson).SingleOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return true;
        try { return JsonSerializer.Deserialize<ImportConfig>(json, JsonOptions)?.AutoGenerateLabels ?? true; }
        catch (JsonException) { return true; }
    }

    private static List<string> ChangedFields(GrnLine line, NormalizedImportRow row)
    {
        var fields = new List<string>();
        if (line.ReceivedQuantity != row.ReceivedQuantity) fields.Add("Received Quantity");
        if (line.PackingStandard != row.PackingStandard) fields.Add("Packing Standard");
        if (!string.Equals(line.BatchNumber, row.BatchNumber, StringComparison.Ordinal)) fields.Add("Batch Number");
        if (!string.Equals(line.BinLocation, row.BinLocation, StringComparison.Ordinal)) fields.Add("Bin Location");
        if (line.ManufacturingDate != row.ManufacturingDate) fields.Add("Manufacturing Date");
        if (line.ExpiryDate != row.ExpiryDate) fields.Add("Expiry Date");
        if (line.ExpectedLabelCount != row.ExpectedLabelCount) fields.Add("Expected Label Count");
        if (!string.Equals(line.Uom, row.Uom, StringComparison.Ordinal)) fields.Add("UOM");
        if (!string.Equals(line.Material.Description, row.MaterialDescription, StringComparison.Ordinal)) fields.Add("Material Description");
        return fields;
    }

    private static object Snapshot(GrnLine line) => new
    {
        line.ReceivedQuantity, line.PackingStandard, line.BatchNumber, line.BinLocation,
        line.ManufacturingDate, line.ExpiryDate, line.ExpectedLabelCount, line.Uom,
        MaterialDescription = line.Material.Description, line.SapLineItemNumber
    };

    private static void Count(ImportBatch batch, ImportResultType type)
    {
        switch (type)
        {
            case ImportResultType.New: batch.NewRows++; break;
            case ImportResultType.Updated: batch.UpdatedRows++; break;
            case ImportResultType.Unchanged: batch.UnchangedRows++; break;
            case ImportResultType.Warning: batch.WarningRows++; break;
            case ImportResultType.Rejected: batch.RejectedRows++; break;
        }
    }

    private static object BatchDto(ImportBatch x, string template) => new
    {
        batchId = x.Id.ToString(), x.FileName, uploadedAt = x.UploadedAt.ToString("O"),
        uploadedBy = x.UploadedBy?.FullName ?? "Current user", x.TotalRows, x.NewRows,
        updated = x.UpdatedRows, unchanged = x.UnchangedRows, warnings = x.WarningRows,
        rejected = x.RejectedRows, status = x.ImportStatus switch
        {
            ImportStatus.CompletedWithWarnings => "Warning", ImportStatus.Pending => "Pending",
            ImportStatus.Processing => "Pending", _ => x.ImportStatus.ToString()
        }, durationSeconds = Math.Round(x.ProcessingDurationMs / 1000d, 2), x.FileHash,
        identificationStrategy = x.IdentificationStrategy?.Name ?? "Active strategy", mappingTemplate = template
    };

    private static object RowDto(ImportRowResult result)
    {
        var row = JsonSerializer.Deserialize<NormalizedImportRow>(result.RawDataJson, JsonOptions)!;
        return new
        {
            id = result.Id.ToString(), row.GrnNumber,
            lineItem = int.TryParse(row.SapLineItemNumber, out var line) ? line : row.ExcelRowNumber,
            row.MaterialNumber, description = row.MaterialDescription, quantity = row.ReceivedQuantity,
            packingStandard = row.PackingStandard, batch = row.BatchNumber, row.Plant,
            uom = row.Uom, vendorCode = row.VendorCode, vendorName = row.VendorName,
            invoiceNumber = row.InvoiceNumber, invoiceDate = row.InvoiceDate, binLocation = row.BinLocation,
            manufacturingDate = row.ManufacturingDate, expiryDate = row.ExpiryDate,
            expectedLabelCount = row.ExpectedLabelCount,
            status = result.ResultType.ToString(), reason = result.Message
        };
    }

    private async Task<(byte[]? Bytes, string? Extension, IActionResult? Error)> ReadUpload(
        IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length == 0)
            return (null, null, ValidationProblem(Error("file", "Select a non-empty import file.")));
        if (file.Length > 10 * 1024 * 1024)
            return (null, null, StatusCode(413, new ProblemDetails { Title = "File exceeds the 10 MB limit", Status = 413 }));
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!ImportWorkbookReader.Supports(extension))
            return (null, null, ValidationProblem(Error("file", ImportWorkbookReader.SupportedFormatsMessage)));
        await using var memory = new MemoryStream();
        await file.CopyToAsync(memory, cancellationToken);
        return (memory.ToArray(), extension, null);
    }

    private static ImportSelection FindBestSelection(
        ImportWorkbookData workbook,
        IReadOnlyList<ExcelMappingTemplate> profiles,
        string fileName)
    {
        ImportSelection? best = null;
        var candidates = profiles.Count == 0 ? new ExcelMappingTemplate?[] { null } : profiles.Cast<ExcelMappingTemplate?>();
        foreach (var profile in candidates)
        {
            var configured = profile is null ? [] : DeserializeMapping(profile.MappingJson);
            var sheetAliases = profile is null ? [] : DeserializeStrings(profile.SheetAliasesJson);
            if (profile?.SheetName is { Length: > 0 } && !sheetAliases.Contains(profile.SheetName, StringComparer.OrdinalIgnoreCase))
                sheetAliases.Add(profile.SheetName);
            var signature = profile is null ? [] : DeserializeStrings(profile.HeaderSignatureJson);
            for (var sheetIndex = 0; sheetIndex < workbook.Sheets.Count; sheetIndex++)
            {
                var sheet = workbook.Sheets[sheetIndex];
                var rowLimit = Math.Min(sheet.Rows.Count, 25);
                for (var headerIndex = 0; headerIndex < rowLimit; headerIndex++)
                {
                    var headers = sheet.Rows[headerIndex];
                    if (!headers.Any(x => !string.IsNullOrWhiteSpace(x))) continue;
                    var mapping = ImportFileParser.SuggestMapping(headers, configured);
                    var required = ImportFileParser.Fields.Count(x => x.Required && mapping.Values.Contains(x.Key, StringComparer.OrdinalIgnoreCase));
                    var mapped = mapping.Values.Distinct(StringComparer.OrdinalIgnoreCase).Count();
                    var sheetMatch = sheetAliases.Contains(sheet.Name, StringComparer.OrdinalIgnoreCase);
                    var signatureMatches = signature.Count == 0 ? 0 : headers.Count(header => signature.Any(saved =>
                        ImportFileParser.NormalizeHeader(saved) == ImportFileParser.NormalizeHeader(header)));
                    var fileMatch = profile?.FileNamePattern is { Length: > 0 } pattern &&
                        string.Equals(pattern, NormalizeFileName(fileName), StringComparison.OrdinalIgnoreCase);
                    var score = required * 25 + mapped * 3 + (sheetMatch ? 30 : 0) + signatureMatches * 2
                        + (fileMatch ? 8 : 0) + (profile?.HeaderRowNumber == headerIndex + 1 ? 4 : 0)
                        + (profile?.IsDefault == true ? 1 : 0);
                    var confidence = Math.Clamp(required * 20 + Math.Min(20, mapped * 2) + (sheetMatch ? 15 : 0)
                        + Math.Min(15, signatureMatches * 2), 0, 100);
                    var candidate = new ImportSelection(sheetIndex, headerIndex + 1, profile, configured, score, confidence);
                    if (best is null || candidate.Score > best.Score) best = candidate;
                }
            }
        }

        if (best is not null) return best;
        return new ImportSelection(0, 1, profiles.FirstOrDefault(),
            profiles.FirstOrDefault() is { } fallback ? DeserializeMapping(fallback.MappingJson) : [], 0, 0);
    }

    private static IReadOnlyList<string> HeadersAt(ImportSheetData sheet, int headerRowNumber) =>
        headerRowNumber > 0 && headerRowNumber <= sheet.Rows.Count ? sheet.Rows[headerRowNumber - 1] : [];

    private static Dictionary<string, string> DeserializeMapping(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var values = JsonSerializer.Deserialize<Dictionary<string, string>>(json, JsonOptions) ?? [];
            return new Dictionary<string, string>(values, StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static List<string> DeserializeStrings(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? []; }
        catch (JsonException) { return []; }
    }

    private static string NormalizeFileName(string? fileName)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName ?? string.Empty);
        var normalized = new string(stem.ToLowerInvariant().Select(character => char.IsDigit(character) ? ' ' : character).ToArray());
        return string.Join('-', normalized.Split([' ', '_', '-'], StringSplitOptions.RemoveEmptyEntries)).Trim('-');
    }

    private static Dictionary<string, string[]> ValidateProfile(ImportProfileRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name)) errors["name"] = ["Profile name is required."];
        if (string.IsNullOrWhiteSpace(request.SheetName)) errors["sheetName"] = ["Worksheet is required."];
        if (request.HeaderRowNumber < 1) errors["headerRowNumber"] = ["Header row must be 1 or greater."];
        if (request.Mapping is null || request.Mapping.Count == 0) errors["mapping"] = ["Map at least one source column."];
        if (request.Mapping is null) return errors;
        var knownFields = ImportFileParser.Fields.Select(x => x.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (request.Mapping.Values.Any(x => !knownFields.Contains(x))) errors["mapping"] = ["Mapping contains an unknown TrackGRN field."];
        if (!ImportFileParser.HasRequiredFields(request.Mapping))
            errors["mapping"] = ["GRN Number, GRN Date, Material Number and Received Quantity must be mapped."];
        return errors;
    }

    private static Dictionary<string, string[]> Error(string key, string message) => new() { [key] = [message] };

    private sealed record ImportSelection(
        int SheetIndex,
        int HeaderRowNumber,
        ExcelMappingTemplate? Profile,
        IReadOnlyDictionary<string, string> ProfileMapping,
        int Score,
        int Confidence);

    private sealed record PreviewCandidate(
        NormalizedImportRow Row,
        string? BusinessKeyHash,
        List<string> Errors,
        List<string> Warnings);
    private sealed record ExistingLine(Guid Id, string BusinessKeyHash, decimal ReceivedQuantity,
        decimal PackingStandard, string? BatchNumber, string Uom, string Description,
        string? BinLocation, DateOnly? ManufacturingDate, DateOnly? ExpiryDate, int? ExpectedLabelCount,
        string? VendorCode, string? VendorName, string? InvoiceNumber, DateOnly? InvoiceDate,
        decimal IssuedQuantity, bool HasProcessedLabels);
}

public sealed record ImportProfileRequest(
    Guid? TemplateId,
    string Name,
    string FileName,
    string SheetName,
    int HeaderRowNumber,
    Dictionary<string, string>? Mapping,
    List<string>? Headers);
