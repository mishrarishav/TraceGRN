using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/materials")]
public sealed class MaterialsController(TrackGrnDbContext dbContext, IAuditWriter audit) : TrackControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? search, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 250, [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 500);
        var query = dbContext.Materials.AsNoTracking().AsQueryable();
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.MaterialNumber.Contains(term) || x.Description.Contains(term)
                || (x.PartNumber != null && x.PartNumber.Contains(term))
                || (x.DefaultBinLocation != null && x.DefaultBinLocation.Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        var raw = await query.OrderBy(x => x.MaterialNumber).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                x.Id, x.MaterialNumber, x.Description, x.Uom, x.PartNumber,
                x.DefaultBinLocation, x.OpeningQuantity,
                packingStandard = x.DefaultPackingStandard ?? x.GrnLines.Where(l => l.IsActive)
                    .OrderByDescending(l => l.CreatedAt).Select(l => (decimal?)l.PackingStandard).FirstOrDefault() ?? 0,
                totalReceived = x.GrnLines.Where(l => l.IsActive).Sum(l => (decimal?)l.ReceivedQuantity) ?? 0,
                totalIssued = x.GrnLines.SelectMany(l => l.Labels)
                    .Where(label => label.IsActive && label.LabelStatus == LabelStatus.Issued)
                    .Sum(label => (decimal?)label.LabelQuantity) ?? 0,
                latestGrn = x.GrnLines.Where(l => l.IsActive).OrderByDescending(l => l.GrnHeader.GrnDate)
                    .Select(l => l.GrnHeader.GrnNumber).FirstOrDefault() ?? "—",
                x.IsActive
            }).ToListAsync(cancellationToken);

        var items = raw.Select(x => new
        {
            x.Id, x.MaterialNumber, x.Description, x.Uom, x.PartNumber,
            x.DefaultBinLocation, x.OpeningQuantity, x.packingStandard, x.totalReceived,
            x.totalIssued, available = x.totalReceived - x.totalIssued, x.latestGrn,
            status = x.IsActive ? "Available" : "Inactive"
        });
        return Ok(new { page, pageSize, total, items });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPost]
    public async Task<IActionResult> Create(MaterialRequest request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null) return ValidationProblem(error);
        var number = request.MaterialNumber.Trim().ToUpperInvariant();
        if (await dbContext.Materials.AnyAsync(x => x.MaterialNumber == number, cancellationToken))
            return Conflict(Problem("Material already exists", $"Material {number} is already configured."));
        var entity = new Material
        {
            MaterialNumber = number, Description = request.Description.Trim(),
            Uom = request.Uom.Trim().ToUpperInvariant(), DefaultPackingStandard = request.PackingStandard,
            PartNumber = Clean(request.PartNumber), DefaultBinLocation = Clean(request.DefaultBinLocation),
            OpeningQuantity = request.OpeningQuantity,
            IsActive = request.IsActive
        };
        dbContext.Materials.Add(entity);
        audit.Add("MaterialCreated", "Material", entity.Id.ToString(), newValues: request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { search = number }, new { entity.Id });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, MaterialRequest request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error is not null) return ValidationProblem(error);
        var entity = await dbContext.Materials.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null) return NotFound();
        var number = request.MaterialNumber.Trim().ToUpperInvariant();
        if (await dbContext.Materials.AnyAsync(x => x.Id != id && x.MaterialNumber == number, cancellationToken))
            return Conflict(Problem("Material already exists", $"Material {number} is already configured."));
        var old = new { entity.MaterialNumber, entity.Description, entity.Uom, entity.DefaultPackingStandard,
            entity.PartNumber, entity.DefaultBinLocation, entity.OpeningQuantity, entity.IsActive };
        entity.MaterialNumber = number;
        entity.Description = request.Description.Trim();
        entity.Uom = request.Uom.Trim().ToUpperInvariant();
        entity.DefaultPackingStandard = request.PackingStandard;
        entity.PartNumber = Clean(request.PartNumber);
        entity.DefaultBinLocation = Clean(request.DefaultBinLocation);
        entity.OpeningQuantity = request.OpeningQuantity;
        entity.IsActive = request.IsActive;
        audit.Add("MaterialUpdated", "Material", id.ToString(), old, request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Materials.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null) return NotFound();
        entity.IsActive = false;
        audit.Add("MaterialDeactivated", "Material", id.ToString(), newValues: new { IsActive = false });
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static Dictionary<string, string[]>? Validate(MaterialRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.MaterialNumber)) errors["materialNumber"] = ["Material number is required."];
        if (string.IsNullOrWhiteSpace(request.Description)) errors["description"] = ["Description is required."];
        if (string.IsNullOrWhiteSpace(request.Uom)) errors["uom"] = ["UOM is required."];
        if (request.PackingStandard <= 0) errors["packingStandard"] = ["Packing standard must be greater than zero."];
        if (request.OpeningQuantity < 0) errors["openingQuantity"] = ["Opening/reference quantity cannot be negative."];
        return errors.Count == 0 ? null : errors;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ProblemDetails Problem(string title, string detail) => new() { Title = title, Detail = detail, Status = 409 };
}

public sealed record MaterialRequest(string MaterialNumber, string Description, string Uom,
    decimal PackingStandard, bool IsActive = true, string? PartNumber = null,
    string? DefaultBinLocation = null, decimal? OpeningQuantity = null);
