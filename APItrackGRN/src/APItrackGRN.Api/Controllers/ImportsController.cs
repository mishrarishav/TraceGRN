using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using APItrackGRN.Api.Services;
using APItrackGRN.Application.BusinessKeys;
using APItrackGRN.Application.Labels;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using ClosedXML.Excel;
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

    [HttpPost("preview")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Preview(IFormFile file, [FromForm] Guid? mappingTemplateId,
        [FromForm] bool overrideDuplicate = false, CancellationToken cancellationToken = default)
    {
        if (file.Length == 0) return ValidationProblem(Error("file", "Select a non-empty Excel file."));
        if (file.Length > 10 * 1024 * 1024) return StatusCode(413, new ProblemDetails { Title = "File exceeds the 10 MB limit", Status = 413 });
        if (!string.Equals(Path.GetExtension(file.FileName), ".xlsx", StringComparison.OrdinalIgnoreCase))
            return ValidationProblem(Error("file", "Only .xlsx files are supported."));

        await using var memory = new MemoryStream();
        await file.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        if (bytes.Length < 4 || bytes[0] != (byte)'P' || bytes[1] != (byte)'K')
            return ValidationProblem(Error("file", "The uploaded file is not a valid XLSX workbook."));
        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        var duplicate = await dbContext.ImportBatches.AsNoTracking().Where(x => x.FileHash == hash && x.ImportStatus != ImportStatus.Failed)
            .OrderByDescending(x => x.UploadedAt).Select(x => new { x.Id, x.FileName, x.UploadedAt }).FirstOrDefaultAsync(cancellationToken);
        if (duplicate is not null && !overrideDuplicate)
        {
            var problem = new ProblemDetails { Title = "Duplicate Excel file", Detail = $"This file was already uploaded as {duplicate.FileName} at {duplicate.UploadedAt:O}.", Status = 409 };
            problem.Extensions["code"] = "DUPLICATE_FILE";
            problem.Extensions["existingBatchId"] = duplicate.Id;
            return Conflict(problem);
        }

        var strategy = await dbContext.IdentificationStrategies.SingleAsync(x => x.IsActive, cancellationToken);
        var selectedFields = JsonSerializer.Deserialize<List<string>>(strategy.SelectedFieldsJson, JsonOptions) ?? [];
        var template = mappingTemplateId is null
            ? await dbContext.ExcelMappingTemplates.AsNoTracking().OrderByDescending(x => x.IsDefault).FirstOrDefaultAsync(x => x.IsActive, cancellationToken)
            : await dbContext.ExcelMappingTemplates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == mappingTemplateId && x.IsActive, cancellationToken);
        if (template is null) return ValidationProblem(Error("mappingTemplateId", "No active Excel mapping template is configured."));
        var mapping = JsonSerializer.Deserialize<Dictionary<string, string>>(template.MappingJson, JsonOptions) ?? [];
        var stopwatch = Stopwatch.StartNew();
        List<NormalizedImportRow> parsed;
        try { parsed = ParseWorkbook(bytes, mapping); }
        catch (InvalidDataException exception) { return ValidationProblem(Error("file", exception.Message)); }

        var materials = await dbContext.Materials.AsNoTracking().ToDictionaryAsync(x => x.MaterialNumber, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var candidates = new List<PreviewCandidate>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var source in parsed)
        {
            var normalized = ApplyDefaults(source, materials);
            var errors = ValidateRow(normalized, selectedFields);
            var values = IdentityValues(normalized);
            var key = errors.Count == 0 ? businessKeyCalculator.Calculate(values, selectedFields) : null;
            if (key is not null && !seen.Add(key)) errors.Add("Duplicate business identity within this workbook.");
            candidates.Add(new PreviewCandidate(normalized, key, errors));
        }

        var keys = candidates.Where(x => x.BusinessKeyHash is not null).Select(x => x.BusinessKeyHash!).Distinct().ToList();
        var existing = new Dictionary<string, ExistingLine>(StringComparer.OrdinalIgnoreCase);
        foreach (var chunk in keys.Chunk(1000))
        {
            var found = await dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive && chunk.Contains(x.BusinessKeyHash))
                .Select(x => new ExistingLine(x.Id, x.BusinessKeyHash, x.ReceivedQuantity, x.PackingStandard,
                    x.BatchNumber, x.Uom, x.Material.Description,
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
        audit.Add("ExcelPreviewed", "ImportBatch", batch.Id.ToString(), newValues: new { batch.FileName, batch.TotalRows, batch.NewRows, batch.UpdatedRows, batch.UnchangedRows, batch.WarningRows, batch.RejectedRows, TemplateName = template.Name, StrategyName = strategy.Name });
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
                    Uom = row.Uom, DefaultPackingStandard = row.PackingStandard, IsActive = true
                };
                materials.Add(material.MaterialNumber, material);
                dbContext.Materials.Add(material);
            }
            else
            {
                material.Description = row.MaterialDescription;
                material.Uom = row.Uom;
                material.DefaultPackingStandard ??= row.PackingStandard;
            }
            var header = headers.FirstOrDefault(x => x.GrnNumber == row.GrnNumber
                && string.Equals(x.Plant, row.Plant, StringComparison.OrdinalIgnoreCase)
                && string.Equals(x.StorageLocation, row.StorageLocation, StringComparison.OrdinalIgnoreCase));
            if (header is null)
            {
                header = new GrnHeader
                {
                    GrnNumber = row.GrnNumber, GrnDate = row.GrnDate, VendorCode = row.VendorCode,
                    VendorName = row.VendorName, Plant = row.Plant, StorageLocation = row.StorageLocation,
                    PurchaseOrder = row.PurchaseOrder
                };
                headers.Add(header);
                dbContext.GrnHeaders.Add(header);
            }
            else
            {
                header.GrnDate = row.GrnDate;
                header.VendorCode = row.VendorCode;
                header.VendorName = row.VendorName;
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
                    BatchNumber = row.BatchNumber, Uom = row.Uom, BusinessKeyHash = result.BusinessKeyHash!,
                    IdentificationStrategyId = batch.IdentificationStrategyId, ImportBatchId = batch.Id
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

    private List<NormalizedImportRow> ParseWorkbook(byte[] bytes, IReadOnlyDictionary<string, string> mapping)
    {
        try
        {
            using var workbook = new XLWorkbook(new MemoryStream(bytes));
            var sheet = workbook.Worksheets.FirstOrDefault() ?? throw new InvalidDataException("Workbook does not contain a worksheet.");
            var headerRow = sheet.FirstRowUsed() ?? throw new InvalidDataException("Worksheet is empty.");
            var domainColumns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var cell in headerRow.CellsUsed())
            {
                var source = cell.GetString().Trim();
                var match = mapping.FirstOrDefault(x => string.Equals(x.Key.Trim(), source, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(match.Value)) domainColumns[match.Value] = cell.Address.ColumnNumber;
            }
            var missing = new[] { "GRNNumber", "GRNDate", "MaterialNumber", "MaterialDescription", "ReceivedQuantity" }
                .Where(x => !domainColumns.ContainsKey(x)).ToList();
            if (missing.Count > 0) throw new InvalidDataException($"Required mapped columns are missing: {string.Join(", ", missing)}.");
            var output = new List<NormalizedImportRow>();
            var last = sheet.LastRowUsed()?.RowNumber() ?? headerRow.RowNumber();
            for (var number = headerRow.RowNumber() + 1; number <= last; number++)
            {
                var row = sheet.Row(number);
                string Text(string field) => domainColumns.TryGetValue(field, out var column) ? row.Cell(column).GetFormattedString().Trim() : string.Empty;
                if (string.IsNullOrWhiteSpace(Text("GRNNumber")) && string.IsNullOrWhiteSpace(Text("MaterialNumber"))) continue;
                output.Add(new NormalizedImportRow(number, Text("GRNNumber"), ParseDate(row, domainColumns, "GRNDate"),
                    Text("SAPLineItemNumber"), Text("MaterialNumber").ToUpperInvariant(), Text("MaterialDescription"),
                    ParseDecimal(row, domainColumns, "ReceivedQuantity"), ParseDecimal(row, domainColumns, "PackingStandard"),
                    Text("BatchNumber"), Text("UOM"), Text("Plant"), Text("StorageLocation"),
                    Text("PurchaseOrder"), Text("VendorCode"), Text("VendorName")));
            }
            if (output.Count == 0) throw new InvalidDataException("Workbook does not contain any material rows.");
            return output;
        }
        catch (InvalidDataException) { throw; }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new InvalidDataException($"Unable to read the XLSX workbook: {exception.Message}");
        }
    }

    private static DateOnly ParseDate(IXLRow row, IReadOnlyDictionary<string, int> columns, string field)
    {
        if (!columns.TryGetValue(field, out var column)) return default;
        var cell = row.Cell(column);
        if (cell.TryGetValue<DateTime>(out var date)) return DateOnly.FromDateTime(date);
        return DateOnly.TryParse(cell.GetFormattedString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) ? parsed : default;
    }

    private static decimal ParseDecimal(IXLRow row, IReadOnlyDictionary<string, int> columns, string field)
    {
        if (!columns.TryGetValue(field, out var column)) return 0;
        var cell = row.Cell(column);
        if (cell.TryGetValue<decimal>(out var value)) return value;
        return decimal.TryParse(cell.GetFormattedString(), NumberStyles.Any, CultureInfo.InvariantCulture, out value) ? value : 0;
    }

    private static NormalizedImportRow ApplyDefaults(NormalizedImportRow row, IReadOnlyDictionary<string, Material> materials)
    {
        materials.TryGetValue(row.MaterialNumber, out var material);
        return row with
        {
            MaterialDescription = string.IsNullOrWhiteSpace(row.MaterialDescription) ? material?.Description ?? string.Empty : row.MaterialDescription,
            PackingStandard = row.PackingStandard > 0 ? row.PackingStandard : material?.DefaultPackingStandard ?? 0,
            Uom = string.IsNullOrWhiteSpace(row.Uom) ? material?.Uom ?? "PCS" : row.Uom.ToUpperInvariant(),
            Plant = string.IsNullOrWhiteSpace(row.Plant) ? "1000" : row.Plant,
            StorageLocation = string.IsNullOrWhiteSpace(row.StorageLocation) ? "RM01" : row.StorageLocation
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
        if (!existing.TryGetValue(candidate.BusinessKeyHash!, out var line)) return (ImportResultType.New, "New business identity; row will be inserted.");
        var row = candidate.Row;
        if (row.ReceivedQuantity < line.IssuedQuantity)
            return (ImportResultType.Rejected, $"Received quantity {row.ReceivedQuantity} cannot be below issued quantity {line.IssuedQuantity}.");
        if (row.PackingStandard != line.PackingStandard && line.HasProcessedLabels)
            return (ImportResultType.Rejected, "Packing standard cannot change after labels have been printed or processed.");
        var changed = row.ReceivedQuantity != line.ReceivedQuantity || row.PackingStandard != line.PackingStandard
            || !string.Equals(row.BatchNumber, line.BatchNumber, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.Uom, line.Uom, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.MaterialDescription, line.Description, StringComparison.Ordinal);
        if (!changed) return (ImportResultType.Unchanged, "No business field changed.");
        if (row.ReceivedQuantity < line.ReceivedQuantity)
            return (ImportResultType.Warning, "Quantity decrease will be reconciled against unprocessed labels during commit.");
        return (ImportResultType.Updated, "Existing line will be revised and label delta reconciled.");
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
        if (!string.Equals(line.Uom, row.Uom, StringComparison.Ordinal)) fields.Add("UOM");
        if (!string.Equals(line.Material.Description, row.MaterialDescription, StringComparison.Ordinal)) fields.Add("Material Description");
        return fields;
    }

    private static object Snapshot(GrnLine line) => new
    {
        line.ReceivedQuantity, line.PackingStandard, line.BatchNumber, line.Uom,
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
            status = result.ResultType.ToString(), reason = result.Message
        };
    }

    private static Dictionary<string, string[]> Error(string key, string message) => new() { [key] = [message] };

    private sealed record PreviewCandidate(NormalizedImportRow Row, string? BusinessKeyHash, List<string> Errors);
    private sealed record ExistingLine(Guid Id, string BusinessKeyHash, decimal ReceivedQuantity,
        decimal PackingStandard, string? BatchNumber, string Uom, string Description,
        decimal IssuedQuantity, bool HasProcessedLabels);
}

public sealed record NormalizedImportRow(
    int ExcelRowNumber, string GrnNumber, DateOnly GrnDate, string SapLineItemNumber,
    string MaterialNumber, string MaterialDescription, decimal ReceivedQuantity,
    decimal PackingStandard, string BatchNumber, string Uom, string Plant,
    string StorageLocation, string PurchaseOrder, string VendorCode, string VendorName);
