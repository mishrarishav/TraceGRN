using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/grns")]
public sealed class GrnsController(TrackGrnDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? search, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 250, CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 500);
        var query = dbContext.GrnHeaders.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.GrnNumber.Contains(term) || x.VendorName!.Contains(term)
                || x.Lines.Any(l => l.Material.MaterialNumber.Contains(term)));
        }
        var total = await query.CountAsync(cancellationToken);
        var ids = await query.OrderByDescending(x => x.GrnDate).ThenBy(x => x.GrnNumber)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(x => x.Id).ToListAsync(cancellationToken);
        var items = new List<object>();
        foreach (var id in ids)
        {
            var item = await Build(id, cancellationToken);
            if (item is not null) items.Add(item);
        }
        return Ok(new { page, pageSize, total, items });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id, CancellationToken cancellationToken)
    {
        var headerId = Guid.TryParse(id, out var guid)
            ? await dbContext.GrnHeaders.Where(x => x.Id == guid).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(cancellationToken)
            : await dbContext.GrnHeaders.Where(x => x.GrnNumber == id).OrderByDescending(x => x.CreatedAt).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(cancellationToken);
        if (headerId is null) return NotFound();
        return Ok(await Build(headerId.Value, cancellationToken));
    }

    private async Task<object?> Build(Guid id, CancellationToken cancellationToken)
    {
        var header = await dbContext.GrnHeaders.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new
            {
                x.GrnNumber, x.GrnDate, x.VendorName, x.VendorCode, x.PurchaseOrder, x.Plant,
                x.StorageLocation, x.UpdatedAt, x.CreatedAt,
                importBatch = x.Lines.Where(l => l.IsActive).OrderByDescending(l => l.ImportBatch.UploadedAt)
                    .Select(l => l.ImportBatch.FileName).FirstOrDefault() ?? "—"
            }).SingleOrDefaultAsync(cancellationToken);
        if (header is null) return null;
        var lines = await dbContext.GrnLines.AsNoTracking().Where(x => x.GrnHeaderId == id && x.IsActive)
            .Select(x => new
            {
                x.Id, x.SapLineItemNumber, x.Material.MaterialNumber, x.Material.Description, x.ReceivedQuantity,
                x.PackingStandard, x.BatchNumber, x.ValidationStatus,
                labels = x.Labels.Count(l => l.IsActive),
                issuedQty = x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Issued).Sum(l => (decimal?)l.LabelQuantity) ?? 0,
                inwarded = x.Labels.Count(l => l.IsActive && (l.LabelStatus == LabelStatus.Inwarded || l.LabelStatus == LabelStatus.Stored)),
                blockedQty = x.Labels.Where(l => l.IsActive && l.LabelStatus == LabelStatus.Blocked).Sum(l => (decimal?)l.LabelQuantity) ?? 0
            }).OrderBy(x => x.SapLineItemNumber).ToListAsync(cancellationToken);
        var lineDtos = lines.Select((x, index) => new
        {
            grnLineId = x.Id, lineItem = int.TryParse(x.SapLineItemNumber, out var parsed) ? parsed : index + 1,
            x.MaterialNumber, x.Description, receivedQty = x.ReceivedQuantity, x.PackingStandard,
            x.labels, x.issuedQty, availableQty = x.ReceivedQuantity - x.issuedQty - x.blockedQty,
            batch = x.BatchNumber ?? "—", status = x.ValidationStatus switch
            {
                RevisionValidationStatus.Warning => "Warning",
                RevisionValidationStatus.RequiresAdminReview => "Admin Review",
                RevisionValidationStatus.Rejected => "Rejected",
                _ => x.issuedQty == x.ReceivedQuantity ? "Completed" : x.issuedQty > 0 ? "Partial" : "New"
            }
        }).ToList();
        var received = lines.Sum(x => x.ReceivedQuantity);
        var issued = lines.Sum(x => x.issuedQty);
        var blocked = lines.Sum(x => x.blockedQty);
        var labelled = lines.Sum(x => x.labels);
        var inwarded = lines.Sum(x => x.inwarded);
        var status = lines.Any(x => x.ValidationStatus == RevisionValidationStatus.RequiresAdminReview) ? "Admin Review"
            : lines.Any(x => x.ValidationStatus == RevisionValidationStatus.Warning) ? "Warning"
            : issued == received && received > 0 ? "Completed" : issued > 0 || inwarded > 0 ? "Partial" : "New";
        return new
        {
            header.GrnNumber, grnDate = header.GrnDate.ToString("yyyy-MM-dd"), vendor = header.VendorName ?? "—",
            vendorCode = header.VendorCode ?? "—", poNumber = header.PurchaseOrder ?? "—", plant = header.Plant ?? "—",
            storageLocation = header.StorageLocation ?? "—", header.importBatch, materials = lines.Count,
            receivedQty = received, issuedQty = issued, availableQty = received - issued - blocked,
            labelled, inwarded, status, lastUpdated = (header.UpdatedAt ?? header.CreatedAt).ToString("O"), lines = lineDtos
        };
    }
}
