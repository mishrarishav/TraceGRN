using System.Data;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

public sealed partial class OperationsController
{
    // Aggregate before paging: a part with thousands of packs still occupies one row.
    [HttpGet("/api/labels/print-groups")]
    public async Task<IActionResult> PrintGroups([FromQuery] LabelWorkspaceQuery options, CancellationToken cancellationToken)
    {
        var query = FilterPrintLabels(PendingPrintLabels(), options);
        var groups = query.GroupBy(x => new
            { x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber, x.GrnLine.Material.Description, x.Uom })
            .Select(g => new { g.Key.GrnNumber, g.Key.MaterialNumber, g.Key.Description,
                g.Key.Uom, Quantity = g.Sum(x => x.LabelQuantity), LabelCount = g.Count(), GeneratedAt = g.Max(x => x.GeneratedAt) });
        var total = await groups.CountAsync(cancellationToken);
        var asc = options.Direction == "asc";
        var sorted = options.Sort switch
        {
            "grn" => asc ? groups.OrderBy(x => x.GrnNumber) : groups.OrderByDescending(x => x.GrnNumber),
            "material" => asc ? groups.OrderBy(x => x.MaterialNumber) : groups.OrderByDescending(x => x.MaterialNumber),
            "quantity" => asc ? groups.OrderBy(x => x.Quantity) : groups.OrderByDescending(x => x.Quantity),
            "labels" => asc ? groups.OrderBy(x => x.LabelCount) : groups.OrderByDescending(x => x.LabelCount),
            _ => asc ? groups.OrderBy(x => x.GeneratedAt) : groups.OrderByDescending(x => x.GeneratedAt)
        };
        var pageSize = Math.Clamp(options.PageSize, 1, 100);
        var rows = await sorted.ThenBy(x => x.GrnNumber).ThenBy(x => x.MaterialNumber).ThenBy(x => x.Uom)
            .Skip((Math.Max(1, options.Page) - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(new { rows, total });
    }

    [HttpGet("/api/labels/print-history")]
    public async Task<IActionResult> PrintHistory([FromQuery] LabelWorkspaceQuery options, CancellationToken cancellationToken)
    {
        // Retain cancelled/blocked printed records for audit; output actions reject them.
        var query = FilterPrintLabels(dbContext.MaterialLabels.AsNoTracking().Where(x => x.PrintCount > 0), options);
        var total = await query.CountAsync(cancellationToken);
        var ordered = OrderPrintLabels(query, options);
        var rows = await ProjectPrintLabels(ordered.Skip((Math.Max(1, options.Page) - 1) * Math.Clamp(options.PageSize, 1, 100))
            .Take(Math.Clamp(options.PageSize, 1, 100))).ToListAsync(cancellationToken);
        return Ok(new { rows = rows.Select(ToLabelDto), total });
    }

    [HttpGet("/api/labels/print-selection")]
    public async Task<IActionResult> PrintSelection([FromQuery] LabelWorkspaceQuery options, CancellationToken cancellationToken)
    {
        var query = FilterPrintLabels(PendingPrintLabels(), options);
        var rows = await ProjectPrintLabels(OrderPrintLabels(query, options)).ToListAsync(cancellationToken);
        return Ok(rows.Select(ToLabelDto));
    }

    [Authorize(Roles = "Admin,StoreManager,StoreOperator")]
    [HttpPost("/api/labels/pdf")]
    public async Task<IActionResult> RecordPdf(BatchPrintRequest request, CancellationToken cancellationToken)
    {
        if (request.LabelUids.Count is 0 or > 500)
            return ValidationProblem(new Dictionary<string, string[]> { ["labelUids"] = ["Select between 1 and 500 labels."] });
        var uids = request.LabelUids.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var labels = await dbContext.MaterialLabels.Include(x => x.GrnLine).ThenInclude(x => x.GrnHeader)
                .Include(x => x.GrnLine.Material).Where(x => uids.Contains(x.LabelUid)).ToListAsync(cancellationToken);
            if (labels.Count != uids.Count) return (IActionResult)NotFound(new ProblemDetails { Title = "A selected label no longer exists" });
            if (labels.Any(x => !x.IsActive || x.LabelStatus is LabelStatus.Blocked or LabelStatus.Cancelled))
                return Conflict(new ProblemDetails { Title = "Blocked or cancelled labels cannot be printed" });
            if (labels.Any(x => x.PrintCount > 0) && string.IsNullOrWhiteSpace(request.Reason))
                return ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["A reason is required for reprint."] });
            var now = DateTimeOffset.UtcNow;
            foreach (var label in labels)
            {
                var previous = label.LabelStatus;
                EnsureAutoInward(label, label.GrnLine, now);
                label.QrPayload = label.LabelUid;
                label.PrintCount++;
                label.PrintedAt = now;
                label.LastPrintedById = requestContext.UserId;
                var type = label.PrintCount == 1 ? TransactionType.LabelPrinted : TransactionType.Reprint;
                dbContext.MaterialTransactions.Add(new MaterialTransaction
                {
                    TransactionNumber = $"TXN-PDF-{Guid.NewGuid():N}", TransactionType = type,
                    LabelId = label.Id, GrnLineId = label.GrnLineId, MaterialId = label.GrnLine.MaterialId,
                    Quantity = label.LabelQuantity, Uom = label.Uom, UserId = requestContext.UserId,
                    Timestamp = now, PreviousStatus = previous, NewStatus = label.LabelStatus,
                    DeviceId = requestContext.DeviceId, Remarks = request.Reason ?? "PDF sticker prepared"
                });
                audit.Add(type == TransactionType.Reprint ? "LabelReprinted" : "LabelPrinted", "Label", label.LabelUid,
                    new { PrintCount = label.PrintCount - 1 }, new { label.PrintCount, Output = "PDF" }, new { request.Reason });
            }
            await dbContext.SaveChangesAsync(cancellationToken);
            var result = await ProjectPrintLabels(dbContext.MaterialLabels.AsNoTracking().Where(x => uids.Contains(x.LabelUid)))
                .ToListAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            var byUid = result.ToDictionary(x => x.LabelUid, StringComparer.OrdinalIgnoreCase);
            return Ok(uids.Select(uid => ToLabelDto(byUid[uid])));
        });
    }

    private IQueryable<MaterialLabel> PendingPrintLabels() => dbContext.MaterialLabels.AsNoTracking()
        .Where(x => x.IsActive && x.GrnLine.IsActive && x.PrintCount == 0
            && (x.LabelStatus == LabelStatus.Generated || x.LabelStatus == LabelStatus.Printed || x.LabelStatus == LabelStatus.Inwarded));

    private static IQueryable<MaterialLabel> FilterPrintLabels(IQueryable<MaterialLabel> query, LabelWorkspaceQuery options)
    {
        if (!string.IsNullOrWhiteSpace(options.Search))
        {
            var value = options.Search.Trim();
            query = query.Where(x => x.LabelUid.Contains(value) || x.GrnLine.GrnHeader.GrnNumber.Contains(value)
                || x.GrnLine.Material.MaterialNumber.Contains(value) || x.GrnLine.Material.Description.Contains(value));
        }
        if (!string.IsNullOrWhiteSpace(options.Grn)) query = options.Exact
            ? query.Where(x => x.GrnLine.GrnHeader.GrnNumber == options.Grn)
            : query.Where(x => x.GrnLine.GrnHeader.GrnNumber.Contains(options.Grn));
        if (!string.IsNullOrWhiteSpace(options.Material)) query = options.Exact
            ? query.Where(x => x.GrnLine.Material.MaterialNumber == options.Material)
            : query.Where(x => x.GrnLine.Material.MaterialNumber.Contains(options.Material));
        if (!string.IsNullOrWhiteSpace(options.Uom)) query = query.Where(x => x.Uom == options.Uom);
        if (!string.IsNullOrWhiteSpace(options.Uid)) query = query.Where(x => x.LabelUid.Contains(options.Uid));
        if (Enum.TryParse<LabelStatus>(options.Status, true, out var status)) query = query.Where(x => x.LabelStatus == status);
        return query;
    }

    private static IOrderedQueryable<MaterialLabel> OrderPrintLabels(IQueryable<MaterialLabel> query, LabelWorkspaceQuery options)
    {
        var asc = options.Direction == "asc";
        var ordered = options.Sort switch
        {
            "grn" => asc ? query.OrderBy(x => x.GrnLine.GrnHeader.GrnNumber) : query.OrderByDescending(x => x.GrnLine.GrnHeader.GrnNumber),
            "material" => asc ? query.OrderBy(x => x.GrnLine.Material.MaterialNumber) : query.OrderByDescending(x => x.GrnLine.Material.MaterialNumber),
            "quantity" => asc ? query.OrderBy(x => x.LabelQuantity) : query.OrderByDescending(x => x.LabelQuantity),
            "uid" => asc ? query.OrderBy(x => x.LabelUid) : query.OrderByDescending(x => x.LabelUid),
            _ => asc ? query.OrderBy(x => x.GeneratedAt) : query.OrderByDescending(x => x.GeneratedAt)
        };
        return ordered.ThenBy(x => x.GrnLine.GrnHeader.GrnNumber).ThenBy(x => x.GrnLine.Material.MaterialNumber)
            .ThenBy(x => x.SequenceNumber).ThenBy(x => x.LabelUid);
    }

    private static IQueryable<LabelRow> ProjectPrintLabels(IQueryable<MaterialLabel> query) => query.Select(x => new LabelRow(
        x.LabelUid, x.LabelUid, x.GrnLine.GrnHeader.GrnNumber, x.GrnLine.Material.MaterialNumber, x.GrnLine.Material.Description,
        x.LabelQuantity, x.Uom, x.GrnLine.BatchNumber ?? "", x.GrnLine.GrnHeader.GrnDate,
        x.GrnLine.Labels.Count(l => l.IsActive && l.SequenceNumber <= x.SequenceNumber), x.GrnLine.Labels.Count(l => l.IsActive),
        x.LabelStatus, x.PrintCount, x.GeneratedAt, x.InwardedAt, x.IssuedAt, null, x.RowVersion, x.Id, x.GrnLineId, x.GrnLine.MaterialId));

    private void EnsureAutoInward(MaterialLabel label, GrnLine line, DateTimeOffset now)
    {
        if (label.LabelStatus is not (LabelStatus.Generated or LabelStatus.Printed)) return;
        label.LabelStatus = LabelStatus.Inwarded;
        label.InwardedAt = now;
        label.InwardedById = requestContext.UserId;
        AddAutoInwardTransaction(label, line, requestContext.UserId, now);
    }

    private void AddAutoInwardTransaction(MaterialLabel label, GrnLine line, Guid userId, DateTimeOffset now) =>
        dbContext.MaterialTransactions.Add(new MaterialTransaction
        {
            TransactionNumber = $"TXN-INW-{Guid.NewGuid():N}", TransactionType = TransactionType.Inward,
            Label = label, GrnLineId = line.Id, MaterialId = line.MaterialId, Quantity = label.LabelQuantity,
            Uom = label.Uom, UserId = userId, Timestamp = now,
            PreviousStatus = LabelStatus.Generated, NewStatus = LabelStatus.Inwarded, Remarks = "Automatic material inward"
        });

}

public sealed class LabelWorkspaceQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 12;
    public string? Search { get; set; }
    public string? Grn { get; set; }
    public string? Material { get; set; }
    public string? Uom { get; set; }
    public string? Uid { get; set; }
    public string? Status { get; set; }
    public string? Sort { get; set; }
    public string? Direction { get; set; }
    public bool Exact { get; set; }
}
