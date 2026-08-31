using System.Data;
using APItrackGRN.Api.Services;
using APItrackGRN.Application.Labels;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize]
[ApiController]
public sealed class OperationsController(
    TrackGrnDbContext dbContext,
    IRequestContext requestContext,
    IAuditWriter audit,
    ILabelPrinter printer,
    ILabelQuantityCalculator labelQuantityCalculator) : TrackControllerBase
{
    [HttpGet("/api/dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStart = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);
        var tomorrowStart = todayStart.AddDays(1);
        var from = todayStart.AddDays(-6);
        var labels = dbContext.MaterialLabels.AsNoTracking().Where(x => x.IsActive);
        var todayImports = dbContext.ImportBatches.AsNoTracking().Where(x => x.UploadedAt >= todayStart && x.UploadedAt < tomorrowStart);
        var received = await dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive).SumAsync(x => (decimal?)x.ReceivedQuantity, cancellationToken) ?? 0;
        var issued = await labels.Where(x => x.LabelStatus == LabelStatus.Issued).SumAsync(x => (decimal?)x.LabelQuantity, cancellationToken) ?? 0;
        var issuedToday = await labels.Where(x => x.IssuedAt >= DateTimeOffset.UtcNow.Date).SumAsync(x => (decimal?)x.LabelQuantity, cancellationToken) ?? 0;
        var labelCount = await labels.CountAsync(cancellationToken);
        var pending = await labels.CountAsync(x => x.LabelStatus == LabelStatus.Generated, cancellationToken);
        var warningCount = await todayImports.SumAsync(x => (int?)x.WarningRows + x.RejectedRows, cancellationToken) ?? 0;
        var kpis = new object[]
        {
            Kpi("grns", "Today's GRNs", await dbContext.GrnHeaders.CountAsync(x => x.GrnDate == today, cancellationToken), "GRN headers imported today", "receipt"),
            Kpi("items", "Imported Items", await todayImports.SumAsync(x => (int?)x.TotalRows, cancellationToken) ?? 0, "SAP rows processed today", "layers"),
            Kpi("received", "Received Quantity", received, "Total accepted GRN quantity", "package"),
            Kpi("available", "Available Quantity", received - issued, "Quantity not issued to production", "warehouse"),
            Kpi("issued", "Issued Today", issuedToday, "Quantity issued today", "forklift"),
            Kpi("labels", "Labels Generated", labelCount, "Active pack labels", "qr"),
            Kpi("pending", "Pending Print", pending, "Generated labels waiting for physical printing", "clock"),
            Kpi("warnings", "Import Warnings", warningCount, "Rows needing review today", "alert")
        };

        var dayRows = await dbContext.MaterialTransactions.AsNoTracking().Where(x => x.Timestamp >= from)
            .GroupBy(x => new { Day = x.Timestamp.Date, x.TransactionType })
            .Select(x => new { x.Key.Day, x.Key.TransactionType, Quantity = x.Sum(t => t.Quantity) })
            .ToListAsync(cancellationToken);
        var receivedVsIssued = Enumerable.Range(0, 7).Select(offset => from.AddDays(offset)).Select(day => new
        {
            day = day.ToString("dd MMM"),
            received = dayRows.Where(x => x.Day == day.Date && x.TransactionType == TransactionType.Inward).Sum(x => x.Quantity),
            issued = dayRows.Where(x => x.Day == day.Date && x.TransactionType == TransactionType.Issue).Sum(x => x.Quantity)
        });
        var topMaterials = await dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive)
            .GroupBy(x => x.Material.MaterialNumber).Select(x => new { material = x.Key, qty = x.Sum(y => y.ReceivedQuantity) })
            .OrderByDescending(x => x.qty).Take(6).ToListAsync(cancellationToken);
        var imports = await dbContext.ImportBatches.AsNoTracking().Where(x => x.UploadedAt >= from)
            .GroupBy(x => x.UploadedAt.Date).Select(x => new { Day = x.Key, Count = x.Count() }).ToListAsync(cancellationToken);
        var importTrend = Enumerable.Range(0, 7).Select(offset => from.AddDays(offset)).Select(day => new
        {
            day = day.ToString("dd MMM"), grns = imports.FirstOrDefault(x => x.Day == day.Date)?.Count ?? 0
        });
        var statusCounts = await labels.GroupBy(x => x.LabelStatus).Select(x => new { name = x.Key.ToString(), value = x.Count() }).ToListAsync(cancellationToken);
        var activityRows = await dbContext.MaterialTransactions.AsNoTracking().Include(x => x.User).Include(x => x.Label)
            .ThenInclude(x => x.GrnLine).ThenInclude(x => x.Material).OrderByDescending(x => x.Timestamp).Take(8).ToListAsync(cancellationToken);
        var activity = activityRows.Select(x => new
        {
            id = x.TransactionNumber,
            text = $"{TransactionName(x.TransactionType)} {x.Quantity:0.####} {x.Uom} of {x.Material?.MaterialNumber ?? x.Label?.GrnLine?.Material?.MaterialNumber ?? "Unknown"} ({x.Label?.LabelUid ?? "No label"})",
            user = x.User?.FullName ?? "System", time = x.Timestamp.ToLocalTime().ToString("HH:mm"), type = StatusName(x.NewStatus)
        });
        return Ok(new { kpis, receivedVsIssued, topMaterials, importTrend, labelStatus = statusCounts, activity });
    }

    [HttpGet("/api/labels")]
    public async Task<IActionResult> Labels([FromQuery] string? status, [FromQuery] string? grn,
        [FromQuery] int limit = 500, CancellationToken cancellationToken = default)
    {
        var query = dbContext.MaterialLabels.AsNoTracking().Where(x => x.IsActive);
        if (Enum.TryParse<LabelStatus>(status, true, out var parsed)) query = query.Where(x => x.LabelStatus == parsed);
        if (!string.IsNullOrWhiteSpace(grn)) query = query.Where(x => x.GrnLine.GrnHeader.GrnNumber == grn.Trim());
        var rows = await query.OrderByDescending(x => x.GeneratedAt).Take(Math.Clamp(limit, 1, 2000))
            .Select(x => new LabelRow(x.LabelUid, x.QrPayload, x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber,
                x.GrnLine.Material.Description, x.LabelQuantity, x.Uom, x.GrnLine.BatchNumber ?? "—",
                x.GrnLine.GrnHeader.GrnDate,
                x.GrnLine.Labels.Count(l => l.IsActive && l.SequenceNumber <= x.SequenceNumber),
                x.GrnLine.Labels.Count(l => l.IsActive),
                x.LabelStatus, x.PrintCount, x.GeneratedAt, x.InwardedAt, x.IssuedAt,
                x.IssuedById == null ? null : dbContext.Users.Where(u => u.Id == x.IssuedById).Select(u => u.FullName).FirstOrDefault(),
                x.RowVersion, x.Id, x.GrnLineId, x.GrnLine.MaterialId)).ToListAsync(cancellationToken);
        return Ok(rows.Select(ToLabelDto));
    }

    [HttpGet("/api/labels/{labelUid}")]
    public async Task<IActionResult> Scan(string labelUid, [FromQuery] string purpose = "lookup", CancellationToken cancellationToken = default)
    {
        var row = await LoadLabel(labelUid, cancellationToken);
        if (row is null) return ScanError("NOT_FOUND", "Label not found in system", 404);
        var error = ValidateStatus(row.LabelStatus, purpose);
        if (error is not null) return ScanError(error.Value.Code, error.Value.Message, 409, ToLabelDto(row));
        return Ok(ToLabelDto(row));
    }

    [Authorize(Roles = "Admin,StoreManager,StoreOperator")]
    [HttpPost("/api/inward")]
    public async Task<IActionResult> Inward(ScanOperationRequest request, CancellationToken cancellationToken)
    {
        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(() => InwardCore(request, cancellationToken));
    }

    private async Task<IActionResult> InwardCore(ScanOperationRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        var row = await LoadLabel(request.LabelUid, cancellationToken);
        if (row is null) return ScanError("NOT_FOUND", "Label not found in system", 404);
        var error = ValidateStatus(row.LabelStatus, "inward");
        if (error is not null) return ScanError(error.Value.Code, error.Value.Message, 409, ToLabelDto(row));
        Guid? stationId = null;
        if (!string.IsNullOrWhiteSpace(request.StationCode))
            stationId = await dbContext.Stations.Where(x => x.StationCode == request.StationCode && x.IsActive && (x.Type == StationType.Inward || x.Type == StationType.General)).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var affected = await dbContext.MaterialLabels.Where(x => x.LabelUid == row.LabelUid && x.IsActive
                && (x.LabelStatus == LabelStatus.Generated || x.LabelStatus == LabelStatus.Printed))
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.LabelStatus, LabelStatus.Inwarded)
                .SetProperty(x => x.InwardedAt, now).SetProperty(x => x.InwardedById, requestContext.UserId), cancellationToken);
        if (affected != 1) return ScanError("ALREADY_INWARDED", "Label was already processed by another scan", 409);
        dbContext.MaterialTransactions.Add(Transaction(row, TransactionType.Inward, row.LabelStatus, LabelStatus.Inwarded, request, stationId, now));
        audit.Add("MaterialInwarded", "Label", row.LabelUid, new { Status = row.LabelStatus.ToString() }, new { Status = "Inwarded", row.LabelQuantity }, new { request.StationCode });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(new { ok = true, labelUid = row.LabelUid });
    }

    [Authorize(Roles = "Admin,StoreManager,StoreOperator")]
    [HttpPost("/api/issues")]
    public async Task<IActionResult> Issue(ScanOperationRequest request, CancellationToken cancellationToken)
    {
        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(() => IssueCore(request, cancellationToken));
    }

    private async Task<IActionResult> IssueCore(ScanOperationRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        var row = await LoadLabel(request.LabelUid, cancellationToken);
        if (row is null) return ScanError("NOT_FOUND", "Label not found in system", 404);
        var error = ValidateStatus(row.LabelStatus, "issue");
        if (error is not null) return ScanError(error.Value.Code, error.Value.Message, 409, ToLabelDto(row));
        var station = await dbContext.Stations.SingleOrDefaultAsync(x => x.StationCode == request.StationCode && x.IsActive && (x.Type == StationType.Issue || x.Type == StationType.General), cancellationToken);
        if (station is null) return ValidationProblem(new Dictionary<string, string[]> { ["stationCode"] = ["An active issue station is required."] });

        var now = DateTimeOffset.UtcNow;
        var affected = await dbContext.MaterialLabels.Where(x => x.LabelUid == row.LabelUid && x.IsActive && x.LabelStatus == LabelStatus.Inwarded)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.LabelStatus, LabelStatus.Issued)
                .SetProperty(x => x.IssuedAt, now).SetProperty(x => x.IssuedById, requestContext.UserId), cancellationToken);
        if (affected != 1) return ScanError("ALREADY_ISSUED", "Label was already issued by another scan", 409);
        dbContext.MaterialTransactions.Add(Transaction(row, TransactionType.Issue, LabelStatus.Inwarded, LabelStatus.Issued, request, station.Id, now));
        audit.Add("MaterialIssued", "Label", row.LabelUid, new { Status = "Inwarded" }, new { Status = "Issued", row.LabelQuantity }, new { station.StationCode });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        var materialReceived = await dbContext.GrnLines.Where(x => x.MaterialId == row.MaterialId && x.IsActive)
            .SumAsync(x => (decimal?)x.ReceivedQuantity, cancellationToken) ?? 0;
        var materialIssued = await dbContext.MaterialLabels.Where(x => x.GrnLine.MaterialId == row.MaterialId && x.LabelStatus == LabelStatus.Issued && x.IsActive)
            .SumAsync(x => (decimal?)x.LabelQuantity, cancellationToken) ?? 0;
        var remaining = materialReceived - materialIssued;
        return Ok(new { ok = true, quantity = row.LabelQuantity, remaining, uom = row.Uom, transactionNumber = $"TXN-ISS-{now:yyyyMMddHHmmssfff}" });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPost("/api/labels/generate")]
    public async Task<IActionResult> GenerateLabels(GenerateLabelsRequest request, CancellationToken cancellationToken)
    {
        var line = await dbContext.GrnLines.Include(x => x.Material).Include(x => x.GrnHeader).Include(x => x.Labels)
            .SingleOrDefaultAsync(x => x.Id == request.GrnLineId && x.IsActive, cancellationToken);
        if (line is null) return NotFound();
        var activeTotal = line.Labels.Where(x => x.IsActive && x.LabelStatus != LabelStatus.Cancelled).Sum(x => x.LabelQuantity);
        var remaining = line.ReceivedQuantity - activeTotal;
        if (remaining <= 0)
            return Conflict(new ProblemDetails { Title = "Labels are already complete", Detail = "Active label quantity already covers the GRN line.", Status = 409 });
        var quantities = labelQuantityCalculator.Calculate(remaining, line.PackingStandard);
        var start = line.Labels.Count == 0 ? 0 : line.Labels.Max(x => x.SequenceNumber);
        var now = DateTimeOffset.UtcNow;
        var uids = new List<string>();
        for (var index = 0; index < quantities.Count; index++)
        {
            var labelId = Guid.NewGuid();
            var uid = LabelIdentity.FromId(labelId);
            var label = new MaterialLabel
            {
                Id = labelId, LabelUid = uid, GrnLineId = line.Id, SequenceNumber = start + index + 1,
                LabelQuantity = quantities[index], Uom = line.Uom,
                QrPayload = LabelIdentity.CreateQrPayload(uid, line.GrnHeader.GrnNumber,
                    line.Material.MaterialNumber, quantities[index], line.Uom, line.GrnHeader.GrnDate, now),
                LabelStatus = LabelStatus.Generated, GeneratedById = requestContext.UserId, GeneratedAt = now
            };
            dbContext.MaterialLabels.Add(label);
            dbContext.MaterialTransactions.Add(new MaterialTransaction
            {
                TransactionNumber = $"TXN-GEN-{now:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}"[..48],
                TransactionType = TransactionType.LabelGenerated, Label = label, GrnLineId = line.Id,
                MaterialId = line.MaterialId, Quantity = label.LabelQuantity, Uom = line.Uom,
                UserId = requestContext.UserId, Timestamp = now, PreviousStatus = LabelStatus.Generated,
                NewStatus = LabelStatus.Generated, Remarks = request.Remarks ?? "Manual label generation"
            });
            uids.Add(uid);
        }
        audit.Add("LabelsGenerated", "GrnLine", line.Id.ToString(), newValues: new { Count = uids.Count, Quantity = remaining, Labels = uids });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { generated = uids.Count, quantity = remaining, labelUids = uids });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPut("/api/labels/{labelUid}/status")]
    public async Task<IActionResult> ChangeLabelStatus(string labelUid, ChangeLabelStatusRequest request, CancellationToken cancellationToken)
    {
        var label = await dbContext.MaterialLabels.Include(x => x.GrnLine).SingleOrDefaultAsync(x => x.LabelUid == labelUid, cancellationToken);
        if (label is null) return NotFound();
        var next = request.Action.Trim().ToLowerInvariant() switch
        {
            "block" => LabelStatus.Blocked,
            "unblock" when label.LabelStatus == LabelStatus.Blocked => label.PrintCount > 0 ? LabelStatus.Inwarded : LabelStatus.Generated,
            "cancel" => LabelStatus.Cancelled,
            _ => (LabelStatus?)null
        };
        if (next is null) return ValidationProblem(new Dictionary<string, string[]> { ["action"] = ["Action must be block, unblock or cancel."] });
        if (label.LabelStatus == LabelStatus.Issued)
            return Conflict(new ProblemDetails { Title = "Issued labels are immutable", Status = 409 });
        if (next == LabelStatus.Cancelled && string.IsNullOrWhiteSpace(request.Reason))
            return ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["Cancellation reason is required."] });
        var previous = label.LabelStatus;
        label.LabelStatus = next.Value;
        if (next == LabelStatus.Cancelled) label.IsActive = false;
        dbContext.MaterialTransactions.Add(new MaterialTransaction
        {
            TransactionNumber = $"TXN-STA-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}"[..48],
            TransactionType = next == LabelStatus.Cancelled ? TransactionType.Cancel : next == LabelStatus.Blocked ? TransactionType.Block : TransactionType.Unblock,
            LabelId = label.Id, GrnLineId = label.GrnLineId, MaterialId = label.GrnLine.MaterialId,
            Quantity = label.LabelQuantity, Uom = label.Uom, UserId = requestContext.UserId,
            DeviceId = requestContext.DeviceId, Remarks = request.Reason, PreviousStatus = previous, NewStatus = next.Value
        });
        audit.Add("LabelStatusChanged", "Label", labelUid, new { Status = previous.ToString() }, new { Status = next.ToString() }, new { request.Reason });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { labelUid, status = StatusName(next.Value) });
    }

    [Authorize(Roles = "Admin,StoreManager,StoreOperator")]
    [HttpPost("/api/labels/{labelUid}/print")]
    public async Task<IActionResult> Print(string labelUid, PrintRequest request, CancellationToken cancellationToken)
    {
        var row = await LoadLabel(labelUid, cancellationToken);
        if (row is null) return NotFound();
        if (row.LabelStatus is LabelStatus.Cancelled or LabelStatus.Blocked)
            return ScanError(row.LabelStatus == LabelStatus.Blocked ? "BLOCKED" : "CANCELLED", $"{row.LabelStatus} label cannot be printed", 409);
        if (row.PrintCount > 0 && string.IsNullOrWhiteSpace(request.Reason))
            return ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["A reason is required for reprint."] });
        var qrPayload = LabelIdentity.CreateQrPayload(row.LabelUid, row.GrnNumber, row.MaterialNumber,
            row.LabelQuantity, row.Uom, row.GrnDate, row.GeneratedAt);
        var result = await printer.PrintAsync(new LabelPrintJob(row.LabelUid, row.MaterialNumber, row.Description,
            row.GrnNumber, row.Batch, row.LabelQuantity, row.Uom, row.SequenceNumber, row.SequenceTotal,
            qrPayload), cancellationToken);
        var label = await dbContext.MaterialLabels.SingleAsync(x => x.LabelUid == row.LabelUid, cancellationToken);
        var previousStatus = label.LabelStatus;
        label.QrPayload = qrPayload;
        label.PrintedAt = DateTimeOffset.UtcNow;
        label.LastPrintedById = requestContext.UserId;
        label.PrintCount++;
        if (label.LabelStatus is LabelStatus.Generated or LabelStatus.Printed)
        {
            label.LabelStatus = LabelStatus.Inwarded;
            label.InwardedAt ??= label.PrintedAt;
            label.InwardedById ??= requestContext.UserId;
        }
        var transactionType = label.PrintCount == 1 ? TransactionType.LabelPrinted : TransactionType.Reprint;
        dbContext.MaterialTransactions.Add(Transaction(row, transactionType, previousStatus, label.LabelStatus,
            new ScanOperationRequest(labelUid, request.StationCode, request.Reason), null, label.PrintedAt.Value));
        audit.Add(transactionType == TransactionType.Reprint ? "LabelReprinted" : "LabelPrinted", "Label", labelUid,
            new { PrintCount = label.PrintCount - 1, Status = previousStatus.ToString() },
            new { label.PrintCount, Status = label.LabelStatus.ToString(), result.Mode, result.Printer },
            new { request.Reason, result.Simulated });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { ok = true, labelUid, label.PrintCount, status = StatusName(label.LabelStatus), result.Mode, result.Printer, result.Simulated });
    }

    [Authorize(Roles = "Admin,StoreManager,StoreOperator")]
    [HttpPost("/api/labels/print-batch")]
    public async Task<IActionResult> PrintBatch(BatchPrintRequest request, CancellationToken cancellationToken)
    {
        if (request.LabelUids.Count is 0 or > 500)
            return ValidationProblem(new Dictionary<string, string[]> { ["labelUids"] = ["Select between 1 and 500 labels."] });
        var results = new List<object>();
        foreach (var uid in request.LabelUids.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var action = await Print(uid, new PrintRequest(request.Reason ?? "Batch print", request.StationCode), cancellationToken);
            results.Add(new { labelUid = uid, success = action is OkObjectResult });
        }
        return Ok(new { requested = request.LabelUids.Count, results });
    }

    [HttpGet("/api/inventory")]
    public async Task<IActionResult> Inventory(CancellationToken cancellationToken)
    {
        var lines = await dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive)
            .Select(x => new
            {
                x.Material.MaterialNumber, x.Material.Description, x.GrnHeader.GrnNumber,
                received = x.ReceivedQuantity,
                labelled = x.Labels.Count(l => l.IsActive),
                inwarded = x.Labels.Count(l => l.IsActive && (l.LabelStatus == LabelStatus.Inwarded || l.LabelStatus == LabelStatus.Stored)),
                issued = x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Issued).Sum(l => (decimal?)l.LabelQuantity) ?? 0,
                blocked = x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Blocked).Sum(l => (decimal?)l.LabelQuantity) ?? 0,
                x.PackingStandard
            }).OrderBy(x => x.MaterialNumber).ThenBy(x => x.GrnNumber).ToListAsync(cancellationToken);
        return Ok(lines.Select(x => new
        {
            x.MaterialNumber, x.Description, x.GrnNumber, x.received, x.labelled, x.inwarded, x.issued,
            available = x.received - x.issued - x.blocked, x.blocked, x.PackingStandard
        }));
    }

    [HttpGet("/api/transactions")]
    public async Task<IActionResult> Transactions([FromQuery] int limit = 500, CancellationToken cancellationToken = default)
    {
        var rows = await dbContext.MaterialTransactions.AsNoTracking().Include(x => x.Label).Include(x => x.GrnLine)
            .ThenInclude(x => x.GrnHeader).Include(x => x.Material).Include(x => x.User).Include(x => x.Station)
            .OrderByDescending(x => x.Timestamp).Take(Math.Clamp(limit, 1, 2000)).ToListAsync(cancellationToken);
        return Ok(rows.Select(x => new
        {
            id = x.TransactionNumber, timestamp = x.Timestamp.ToString("O"), type = TransactionName(x.TransactionType),
            labelUid = x.Label.LabelUid, grnNumber = x.GrnLine.GrnHeader.GrnNumber,
            grnDate = x.GrnLine.GrnHeader.GrnDate.ToString("yyyy-MM-dd"),
            materialNumber = x.Material.MaterialNumber, description = x.Material.Description,
            labelPrintedAt = x.Label.PrintedAt?.ToString("O"), quantity = x.Quantity, uom = x.Uom,
            station = x.Station?.StationCode ?? "SYSTEM", @operator = x.User.FullName, status = StatusName(x.NewStatus)
        }));
    }

    [HttpGet("/api/traceability")]
    public async Task<IActionResult> Trace([FromQuery] string q, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(q)) return BadRequest();
        var term = q.Trim();
        var labelUid = LabelIdentity.ExtractUid(term) ?? term;
        var label = await dbContext.MaterialLabels.AsNoTracking().Include(x => x.GrnLine).ThenInclude(x => x.GrnHeader)
            .Include(x => x.GrnLine).ThenInclude(x => x.Material)
            .Where(x => x.IsActive && (x.LabelUid == labelUid || x.QrPayload == term || x.GrnLine.GrnHeader.GrnNumber == term
                || x.GrnLine.Material.MaterialNumber == term || x.GrnLine.BatchNumber == term))
            .OrderByDescending(x => x.GeneratedAt).FirstOrDefaultAsync(cancellationToken);
        if (label is null) return NotFound();
        var txns = await dbContext.MaterialTransactions.AsNoTracking().Where(x => x.LabelId == label.Id)
            .Include(x => x.User).Include(x => x.Station).OrderBy(x => x.Timestamp).ToListAsync(cancellationToken);
        var traceEvents = txns
            .Where(x => x.TransactionType is not TransactionType.LabelGenerated and not TransactionType.LabelPrinted)
            .Select(x => new TraceEvent(x.Timestamp, TransactionTitle(x.TransactionType), x.User.FullName,
                x.Station?.StationCode ?? x.DeviceId ?? "SYSTEM", StatusName(x.NewStatus)))
            .ToList();
        var printedLifecycle = txns.LastOrDefault(x => x.TransactionType == TransactionType.LabelPrinted);
        var generatedLifecycle = txns.FirstOrDefault(x => x.TransactionType == TransactionType.LabelGenerated);
        var labelLifecycle = printedLifecycle ?? generatedLifecycle;
        var lifecycleTitle = printedLifecycle is not null || label.PrintCount > 0
            ? "Label Generated & Printed"
            : "Label Generated";
        traceEvents.Add(labelLifecycle is null
            ? new TraceEvent(label.GeneratedAt, lifecycleTitle, "System", "LABEL", StatusName(label.LabelStatus))
            : new TraceEvent(labelLifecycle.Timestamp, lifecycleTitle, labelLifecycle.User.FullName,
                labelLifecycle.Station?.StationCode ?? labelLifecycle.DeviceId ?? "LABEL", StatusName(labelLifecycle.NewStatus)));
        var steps = traceEvents.OrderBy(x => x.Timestamp).Select(x => new
        {
            title = x.Title, date = x.Timestamp.ToLocalTime().ToString("dd MMM yyyy"),
            time = x.Timestamp.ToLocalTime().ToString("hh:mm tt"), user = x.User,
            station = x.Station, status = x.Status
        }).ToList();
        return Ok(new
        {
            label.LabelUid, label.GrnLine.Material.MaterialNumber, label.GrnLine.Material.Description,
            label.GrnLine.GrnHeader.GrnNumber, quantity = label.LabelQuantity, label.Uom,
            batch = label.GrnLine.BatchNumber ?? "—", currentStatus = StatusName(label.LabelStatus), steps
        });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpGet("/api/audit")]
    public async Task<IActionResult> Audit([FromQuery] int limit = 1000, CancellationToken cancellationToken = default)
    {
        var rows = await dbContext.AuditLogs.AsNoTracking().Include(x => x.User)
            .OrderByDescending(x => x.Timestamp).Take(Math.Clamp(limit, 1, 5000)).ToListAsync(cancellationToken);
        return Ok(rows.Select(x => new
        {
            id = $"AUD-{x.Id.ToString("N")[..8].ToUpperInvariant()}", timestamp = x.Timestamp.ToString("O"),
            user = x.User?.FullName ?? "System", action = x.Action, module = ModuleName(x.EntityName),
            entity = x.EntityName, entityId = x.EntityId ?? "—", device = x.DeviceId ?? "Server",
            ip = x.IpAddress ?? "local", status = "Success", oldValues = ApiText.EmptyObject(x.OldValuesJson),
            newValues = ApiText.EmptyObject(x.NewValuesJson), metadata = ApiText.EmptyObject(x.MetadataJson)
        }));
    }

    [HttpGet("/api/revisions")]
    public async Task<IActionResult> Revisions(CancellationToken cancellationToken)
    {
        var rows = await dbContext.GrnLineRevisionHistory.AsNoTracking().Include(x => x.GrnLine)
            .ThenInclude(x => x.GrnHeader).Include(x => x.GrnLine).ThenInclude(x => x.Material)
            .OrderByDescending(x => x.ChangedAt).ToListAsync(cancellationToken);
        return Ok(rows.Select(x => new
        {
            x.Id, x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber,
            field = string.Join(", ", System.Text.Json.JsonSerializer.Deserialize<string[]>(x.ChangedFieldsJson) ?? []),
            oldValue = x.OldValuesJson, newValue = x.NewValuesJson, changedBy = "SAP Import",
            changedAt = x.ChangedAt.ToString("O"), status = x.ValidationStatus switch
            {
                RevisionValidationStatus.RequiresAdminReview => "Admin Review",
                RevisionValidationStatus.Rejected => "Rejected",
                RevisionValidationStatus.Warning => "Warning",
                _ => "Updated"
            }, note = $"Revision {x.PreviousVersion} → {x.NewVersion}"
        }));
    }

    [Authorize(Roles = "Admin,StoreManager,Viewer")]
    [HttpGet("/api/reports/issues/options")]
    public async Task<IActionResult> IssueReportOptions(CancellationToken cancellationToken)
    {
        var issues = dbContext.MaterialTransactions.AsNoTracking()
            .Where(x => x.TransactionType == TransactionType.Issue);
        var materials = await issues
            .Select(x => new { id = x.MaterialId, x.Material.MaterialNumber, x.Material.Description })
            .Distinct().OrderBy(x => x.MaterialNumber).ToListAsync(cancellationToken);
        var issuers = await issues
            .Select(x => new { id = x.UserId, name = x.User.FullName })
            .Distinct().OrderBy(x => x.name).ToListAsync(cancellationToken);
        return Ok(new { materials, issuers });
    }

    [Authorize(Roles = "Admin,StoreManager,Viewer")]
    [HttpGet("/api/reports/issues")]
    public async Task<IActionResult> IssueReport([FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? toExclusive = null, [FromQuery] Guid? materialId = null,
        [FromQuery] Guid? issuedById = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        if (from.HasValue && toExclusive.HasValue && toExclusive.Value <= from.Value)
            return ValidationProblem(new Dictionary<string, string[]>
            {
                ["toExclusive"] = ["To date must be later than from date."]
            });

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = dbContext.MaterialTransactions.AsNoTracking()
            .Where(x => x.TransactionType == TransactionType.Issue);
        if (from.HasValue) query = query.Where(x => x.Timestamp >= from.Value);
        if (toExclusive.HasValue) query = query.Where(x => x.Timestamp < toExclusive.Value);
        if (materialId.HasValue) query = query.Where(x => x.MaterialId == materialId.Value);
        if (issuedById.HasValue) query = query.Where(x => x.UserId == issuedById.Value);

        var total = await query.CountAsync(cancellationToken);
        var raw = await query.OrderByDescending(x => x.Timestamp).ThenByDescending(x => x.TransactionNumber)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                x.TransactionNumber, x.Timestamp, x.TransactionType, x.Label.LabelUid,
                x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.GrnHeader.GrnDate,
                x.Material.MaterialNumber, x.Material.Description, x.Label.PrintedAt,
                x.Quantity, x.Uom, Station = x.Station == null ? null : x.Station.StationCode,
                Operator = x.User.FullName, x.NewStatus
            }).ToListAsync(cancellationToken);
        var items = raw.Select(x => new
        {
            id = x.TransactionNumber, timestamp = x.Timestamp.ToString("O"), type = TransactionName(x.TransactionType),
            labelUid = x.LabelUid, grnNumber = x.GrnNumber, grnDate = x.GrnDate.ToString("yyyy-MM-dd"),
            materialNumber = x.MaterialNumber, description = x.Description,
            labelPrintedAt = x.PrintedAt?.ToString("O"), quantity = x.Quantity, uom = x.Uom,
            station = x.Station ?? "SYSTEM", @operator = x.Operator, status = StatusName(x.NewStatus)
        }).ToList();
        return Ok(new { page, pageSize, total, items });
    }

    [Authorize(Roles = "Admin,StoreManager,Viewer")]
    [HttpGet("/api/reports/imports")]
    public async Task<IActionResult> ImportReport([FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? toExclusive = null, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25, CancellationToken cancellationToken = default)
    {
        if (from.HasValue && toExclusive.HasValue && toExclusive.Value <= from.Value)
            return ValidationProblem(new Dictionary<string, string[]>
            {
                ["toExclusive"] = ["To date must be later than from date."]
            });

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = dbContext.ImportBatches.AsNoTracking().AsQueryable();
        if (from.HasValue) query = query.Where(x => x.UploadedAt >= from.Value);
        if (toExclusive.HasValue) query = query.Where(x => x.UploadedAt < toExclusive.Value);

        var total = await query.CountAsync(cancellationToken);
        var raw = await query.OrderByDescending(x => x.UploadedAt).ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                x.Id, x.FileName, x.UploadedAt, UploadedBy = x.UploadedBy.FullName,
                x.TotalRows, x.NewRows, x.UpdatedRows, x.UnchangedRows, x.WarningRows,
                x.RejectedRows, x.ImportStatus
            }).ToListAsync(cancellationToken);
        var items = raw.Select(x => new
        {
            batchId = x.Id.ToString(), x.FileName, uploadedAt = x.UploadedAt.ToString("O"),
            uploadedBy = x.UploadedBy, x.TotalRows, x.NewRows, updated = x.UpdatedRows,
            unchanged = x.UnchangedRows, warnings = x.WarningRows, rejected = x.RejectedRows,
            status = x.ImportStatus switch
            {
                ImportStatus.CompletedWithWarnings => "Warning",
                ImportStatus.Pending or ImportStatus.Processing => "Pending",
                _ => x.ImportStatus.ToString()
            }
        }).ToList();
        return Ok(new { page, pageSize, total, items });
    }

    [HttpGet("/api/reports")]
    public IActionResult Reports() => Ok(new object[]
    {
        Report("grn", "GRN Report", "GRN headers with received, issued and available quantity", "receipt"),
        Report("inventory", "Material Inventory Report", "Material-wise stock balance across GRNs", "warehouse"),
        Report("labels", "Label Status Report", "Label lifecycle status by GRN and material", "qr"),
        Report("issues", "Issue History", "Store-to-production issue transactions", "forklift"),
        Report("operators", "Operator Activity", "Scan volume and accuracy per operator", "users"),
        Report("imports", "Import History", "SAP Excel import batches and outcomes", "upload"),
        Report("revisions", "GRN Revision Report", "Quantity revisions with approval status", "history"),
        Report("trace", "Traceability Report", "Full label journey from GRN to production", "route"),
        Report("materials", "Material Master", "Configured material master data", "warehouse"),
        Report("audit", "Audit Log", "Immutable user and system activity", "history")
    });

    [Authorize(Roles = "Admin,StoreManager,Viewer")]
    [HttpGet("/api/reports/{reportId}/export")]
    public async Task<IActionResult> ExportReport(string reportId, [FromQuery] string format = "xlsx",
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] string? plant = null, CancellationToken cancellationToken = default)
    {
        var headers = Array.Empty<string>();
        var rows = new List<string[]>();
        switch (reportId.ToLowerInvariant())
        {
            case "grn":
            {
                headers = ["GRN", "Date", "Material", "Description", "Received", "Issued", "UOM", "Plant", "Batch"];
                var query = dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive);
                if (from is not null) query = query.Where(x => x.GrnHeader.GrnDate >= from);
                if (to is not null) query = query.Where(x => x.GrnHeader.GrnDate <= to);
                if (!string.IsNullOrWhiteSpace(plant)) query = query.Where(x => x.GrnHeader.Plant == plant);
                var data = await query.Select(x => new
                {
                    x.GrnHeader.GrnNumber, x.GrnHeader.GrnDate, x.Material.MaterialNumber, x.Material.Description,
                    x.ReceivedQuantity, Issued = x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Issued).Sum(l => (decimal?)l.LabelQuantity) ?? 0,
                    x.Uom, x.GrnHeader.Plant, x.BatchNumber
                }).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.GrnNumber, x.GrnDate.ToString("yyyy-MM-dd"), x.MaterialNumber, x.Description, x.ReceivedQuantity.ToString("0.####"), x.Issued.ToString("0.####"), x.Uom, x.Plant ?? "", x.BatchNumber ?? "" }));
                break;
            }
            case "inventory":
            {
                headers = ["Material", "Description", "GRN", "Received", "Issued", "Available", "Packing Standard"];
                var data = await dbContext.GrnLines.AsNoTracking().Where(x => x.IsActive).Select(x => new
                {
                    x.Material.MaterialNumber, x.Material.Description, x.GrnHeader.GrnNumber, x.ReceivedQuantity, x.PackingStandard,
                    Issued = x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Issued).Sum(l => (decimal?)l.LabelQuantity) ?? 0
                }).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.MaterialNumber, x.Description, x.GrnNumber, x.ReceivedQuantity.ToString("0.####"), x.Issued.ToString("0.####"), (x.ReceivedQuantity - x.Issued).ToString("0.####"), x.PackingStandard.ToString("0.####") }));
                break;
            }
            case "materials":
            {
                headers = ["Material", "Description", "UOM", "Packing Standard", "Active", "Created At"];
                var data = await dbContext.Materials.AsNoTracking().OrderBy(x => x.MaterialNumber)
                    .Select(x => new { x.MaterialNumber, x.Description, x.Uom, x.DefaultPackingStandard, x.IsActive, x.CreatedAt })
                    .ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.MaterialNumber, x.Description, x.Uom,
                    x.DefaultPackingStandard?.ToString("0.####") ?? "", x.IsActive.ToString(), x.CreatedAt.ToString("O") }));
                break;
            }
            case "labels":
            {
                headers = ["Label UID", "GRN", "Material", "Quantity", "UOM", "Status", "Print Count", "Generated At"];
                var data = await dbContext.MaterialLabels.AsNoTracking().Where(x => x.IsActive).Select(x => new { x.LabelUid, x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber, x.LabelQuantity, x.Uom, x.LabelStatus, x.PrintCount, x.GeneratedAt }).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.LabelUid, x.GrnNumber, x.MaterialNumber, x.LabelQuantity.ToString("0.####"), x.Uom, x.LabelStatus.ToString(), x.PrintCount.ToString(), x.GeneratedAt.ToString("O") }));
                break;
            }
            case "issues":
            case "trace":
            {
                headers = ["Transaction", "Timestamp", "Type", "Label UID", "GRN", "Material", "Quantity", "UOM", "Operator", "Station"];
                var query = dbContext.MaterialTransactions.AsNoTracking();
                if (reportId.Equals("issues", StringComparison.OrdinalIgnoreCase)) query = query.Where(x => x.TransactionType == TransactionType.Issue);
                var data = await query.Select(x => new { x.TransactionNumber, x.Timestamp, x.TransactionType, x.Label.LabelUid, x.GrnLine.GrnHeader.GrnNumber, x.Material.MaterialNumber, x.Quantity, x.Uom, x.User.FullName, Station = x.Station == null ? "" : x.Station.StationCode }).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.TransactionNumber, x.Timestamp.ToString("O"), x.TransactionType.ToString(), x.LabelUid, x.GrnNumber, x.MaterialNumber, x.Quantity.ToString("0.####"), x.Uom, x.FullName, x.Station }));
                break;
            }
            case "operators":
            {
                headers = ["Operator", "Transaction Type", "Transactions", "Quantity"];
                var data = await dbContext.MaterialTransactions.AsNoTracking().GroupBy(x => new { x.User.FullName, x.TransactionType }).Select(x => new { x.Key.FullName, x.Key.TransactionType, Count = x.Count(), Quantity = x.Sum(y => y.Quantity) }).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.FullName, x.TransactionType.ToString(), x.Count.ToString(), x.Quantity.ToString("0.####") }));
                break;
            }
            case "imports":
            {
                headers = ["Batch", "File", "Uploaded At", "Rows", "New", "Updated", "Warnings", "Rejected", "Status"];
                var data = await dbContext.ImportBatches.AsNoTracking().OrderByDescending(x => x.UploadedAt).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.Id.ToString(), x.FileName, x.UploadedAt.ToString("O"), x.TotalRows.ToString(), x.NewRows.ToString(), x.UpdatedRows.ToString(), x.WarningRows.ToString(), x.RejectedRows.ToString(), x.ImportStatus.ToString() }));
                break;
            }
            case "revisions":
            {
                headers = ["GRN", "Material", "Previous Version", "New Version", "Changed Fields", "Changed At", "Status"];
                var data = await dbContext.GrnLineRevisionHistory.AsNoTracking().Select(x => new { x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber, x.PreviousVersion, x.NewVersion, x.ChangedFieldsJson, x.ChangedAt, x.ValidationStatus }).ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.GrnNumber, x.MaterialNumber, x.PreviousVersion.ToString(), x.NewVersion.ToString(), x.ChangedFieldsJson, x.ChangedAt.ToString("O"), x.ValidationStatus.ToString() }));
                break;
            }
            case "audit":
            {
                headers = ["Timestamp", "User", "Action", "Entity", "Entity ID", "Device", "IP Address", "Old Values", "New Values"];
                var data = await dbContext.AuditLogs.AsNoTracking().OrderByDescending(x => x.Timestamp)
                    .Select(x => new { x.Timestamp, User = x.User == null ? "System" : x.User.FullName, x.Action,
                        x.EntityName, x.EntityId, x.DeviceId, x.IpAddress, x.OldValuesJson, x.NewValuesJson })
                    .ToListAsync(cancellationToken);
                rows.AddRange(data.Select(x => new[] { x.Timestamp.ToString("O"), x.User, x.Action, x.EntityName,
                    x.EntityId ?? "", x.DeviceId ?? "", x.IpAddress ?? "", x.OldValuesJson ?? "", x.NewValuesJson ?? "" }));
                break;
            }
            default:
                return NotFound(new ProblemDetails { Title = "Unknown report", Status = 404 });
        }

        var safeName = $"TrackGRN-{reportId}-{DateTime.UtcNow:yyyyMMdd-HHmmss}";
        if (format.Equals("csv", StringComparison.OrdinalIgnoreCase))
        {
            static string Csv(string value) => $"\"{value.Replace("\"", "\"\"")}\"";
            var csv = string.Join(',', headers.Select(Csv)) + Environment.NewLine
                + string.Join(Environment.NewLine, rows.Select(row => string.Join(',', row.Select(Csv))));
            return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"{safeName}.csv");
        }
        if (!format.Equals("xlsx", StringComparison.OrdinalIgnoreCase))
            return ValidationProblem(new Dictionary<string, string[]> { ["format"] = ["Supported formats are xlsx and csv."] });
        using var workbook = new XLWorkbook();
        var worksheet = workbook.AddWorksheet("TrackGRN");
        for (var column = 0; column < headers.Length; column++) worksheet.Cell(1, column + 1).Value = headers[column];
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
            for (var column = 0; column < rows[rowIndex].Length; column++) worksheet.Cell(rowIndex + 2, column + 1).Value = rows[rowIndex][column];
        worksheet.Row(1).Style.Font.Bold = true;
        worksheet.SheetView.FreezeRows(1);
        worksheet.ColumnsUsed().AdjustToContents(8, 45);
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return File(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{safeName}.xlsx");
    }

    private async Task<LabelRow?> LoadLabel(string uid, CancellationToken cancellationToken)
    {
        var rawValue = uid.Trim();
        var labelUid = LabelIdentity.ExtractUid(rawValue) ?? rawValue;
        return await dbContext.MaterialLabels.AsNoTracking()
            .Where(x => x.LabelUid == labelUid || x.QrPayload == rawValue)
            .Select(x => new LabelRow(x.LabelUid, x.QrPayload, x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber,
                x.GrnLine.Material.Description, x.LabelQuantity, x.Uom, x.GrnLine.BatchNumber ?? "—",
                x.GrnLine.GrnHeader.GrnDate,
                x.GrnLine.Labels.Count(l => l.IsActive && l.SequenceNumber <= x.SequenceNumber),
                x.GrnLine.Labels.Count(l => l.IsActive),
                x.LabelStatus, x.PrintCount, x.GeneratedAt, x.InwardedAt, x.IssuedAt,
                x.IssuedById == null ? null : dbContext.Users.Where(u => u.Id == x.IssuedById).Select(u => u.FullName).FirstOrDefault(),
                x.RowVersion, x.Id, x.GrnLineId, x.GrnLine.MaterialId)).SingleOrDefaultAsync(cancellationToken);
    }

    private static object ToLabelDto(LabelRow x) => new
    {
        x.LabelUid, x.QrPayload, x.GrnNumber, x.MaterialNumber, x.Description, quantity = x.LabelQuantity, x.Uom,
        batch = x.Batch, grnDate = x.GrnDate.ToString("yyyy-MM-dd"),
        binSequence = $"{x.SequenceNumber:D2} of {x.SequenceTotal}", status = StatusName(x.LabelStatus),
        x.PrintCount, generatedAt = x.GeneratedAt.ToString("O"), inwardedAt = x.InwardedAt?.ToString("O"),
        issuedAt = x.IssuedAt?.ToString("O"),
        x.IssuedBy, x.GrnLineId, rowVersion = Convert.ToBase64String(x.RowVersion)
    };

    private MaterialTransaction Transaction(LabelRow label, TransactionType type, LabelStatus previous, LabelStatus next,
        ScanOperationRequest request, Guid? stationId, DateTimeOffset now) => new()
    {
        TransactionNumber = $"TXN-{type.ToString()[..Math.Min(type.ToString().Length, 3)].ToUpperInvariant()}-{now:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}"[..45],
        TransactionType = type, LabelId = label.Id, GrnLineId = label.GrnLineId, MaterialId = label.MaterialId,
        Quantity = label.LabelQuantity, Uom = label.Uom, UserId = requestContext.UserId, Timestamp = now,
        DeviceId = request.DeviceId ?? requestContext.DeviceId, StationId = stationId, Remarks = request.Remarks,
        PreviousStatus = previous, NewStatus = next
    };

    private IActionResult ScanError(string code, string message, int status, object? label = null)
    {
        var problem = new ProblemDetails { Title = "Scan rejected", Detail = message, Status = status };
        problem.Extensions["code"] = code;
        if (label is not null) problem.Extensions["label"] = label;
        return StatusCode(status, problem);
    }

    private static (string Code, string Message)? ValidateStatus(LabelStatus status, string purpose)
    {
        if (status == LabelStatus.Issued) return ("ALREADY_ISSUED", "Label already issued to production");
        if (status == LabelStatus.Blocked) return ("BLOCKED", "Label is blocked and cannot be processed");
        if (status == LabelStatus.Cancelled) return ("CANCELLED", "Label is cancelled and cannot be processed");
        if (purpose.Equals("inward", StringComparison.OrdinalIgnoreCase) && status is LabelStatus.Inwarded or LabelStatus.Stored)
            return ("ALREADY_INWARDED", "Label already inwarded");
        if (purpose.Equals("issue", StringComparison.OrdinalIgnoreCase) && status is not LabelStatus.Inwarded)
            return ("NOT_INWARDED", "Label must be inwarded before issue");
        return null;
    }

    private static object Kpi(string key, string label, decimal value, string tooltip, string icon) => new { key, label, value, trend = 0, tooltip, icon };
    private static object Report(string id, string name, string description, string icon) => new { id, name, description, icon };
    private static string StatusName(LabelStatus status) => status == LabelStatus.Stored ? "Available" : status.ToString();
    private static string TransactionName(TransactionType type) => type switch
    {
        TransactionType.LabelGenerated => "Label Generated", TransactionType.LabelPrinted => "Label Printed",
        _ => type.ToString()
    };
    private static string TransactionTitle(TransactionType type) => type switch
    {
        TransactionType.LabelGenerated => "Label Generated", TransactionType.LabelPrinted => "Label Printed",
        TransactionType.Inward => "Material Inwarded", TransactionType.Issue => "Issued to Production",
        TransactionType.Reprint => "Label Reprinted", _ => type.ToString()
    };
    private static string ModuleName(string entity) => entity switch
    {
        "ImportBatch" => "Import", "MaterialLabel" or "Label" => "Labels", "MaterialTransaction" => "Issue",
        "Configuration" or "User" or "Station" or "Material" => "Admin", _ => entity
    };

    private sealed record LabelRow(string LabelUid, string QrPayload, string GrnNumber, string MaterialNumber, string Description,
        decimal LabelQuantity, string Uom, string Batch, DateOnly GrnDate, int SequenceNumber,
        int SequenceTotal, LabelStatus LabelStatus, int PrintCount, DateTimeOffset GeneratedAt,
        DateTimeOffset? InwardedAt, DateTimeOffset? IssuedAt, string? IssuedBy, byte[] RowVersion, Guid Id = default,
        Guid GrnLineId = default, Guid MaterialId = default);

    private sealed record TraceEvent(DateTimeOffset Timestamp, string Title, string User, string Station, string Status);
}

public sealed record ScanOperationRequest(string LabelUid, string? StationCode = null, string? Remarks = null, string? DeviceId = null);
public sealed record PrintRequest(string? Reason = null, string? StationCode = null);
public sealed record BatchPrintRequest(List<string> LabelUids, string? Reason = null, string? StationCode = null);
public sealed record GenerateLabelsRequest(Guid GrnLineId, string? Remarks = null);
public sealed record ChangeLabelStatusRequest(string Action, string? Reason = null);
