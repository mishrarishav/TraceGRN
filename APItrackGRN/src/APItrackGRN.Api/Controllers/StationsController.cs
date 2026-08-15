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
[Route("api/stations")]
public sealed class StationsController(TrackGrnDbContext dbContext, IAuditWriter audit) : TrackControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? type, [FromQuery] bool includeInactive = true, CancellationToken cancellationToken = default)
    {
        var query = dbContext.Stations.AsNoTracking().AsQueryable();
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (Enum.TryParse<StationType>(type, true, out var stationType)) query = query.Where(x => x.Type == stationType);
        var items = await query.OrderBy(x => x.StationCode).Select(x => new
        {
            id = x.Id, code = x.StationCode, name = x.StationName,
            type = x.Type == StationType.Inward ? "Inward Station" : x.Type == StationType.Issue ? "Issue Station" : "General Station",
            location = x.Location ?? "Not assigned", status = x.IsActive ? "Active" : "Inactive",
            device = x.DeviceName ?? "Keyboard-wedge compatible"
        }).ToListAsync(cancellationToken);
        return Ok(items);
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPost]
    public async Task<IActionResult> Create(StationRequest request, CancellationToken cancellationToken)
    {
        var errors = Validate(request);
        if (errors is not null) return ValidationProblem(errors);
        var code = request.Code.Trim().ToUpperInvariant();
        if (await dbContext.Stations.AnyAsync(x => x.StationCode == code, cancellationToken))
            return Conflict(new ProblemDetails { Title = "Station already exists", Status = 409 });
        var entity = Map(new Station { StationCode = code, StationName = request.Name.Trim() }, request);
        dbContext.Stations.Add(entity);
        audit.Add("StationCreated", "Station", entity.Id.ToString(), newValues: request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { entity.Id });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, StationRequest request, CancellationToken cancellationToken)
    {
        var errors = Validate(request);
        if (errors is not null) return ValidationProblem(errors);
        var entity = await dbContext.Stations.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null) return NotFound();
        var code = request.Code.Trim().ToUpperInvariant();
        if (await dbContext.Stations.AnyAsync(x => x.Id != id && x.StationCode == code, cancellationToken))
            return Conflict(new ProblemDetails { Title = "Station already exists", Status = 409 });
        var old = new { entity.StationCode, entity.StationName, entity.Type, entity.Location, entity.DeviceName, entity.IsActive };
        entity.StationCode = code;
        entity.StationName = request.Name.Trim();
        Map(entity, request);
        audit.Add("StationUpdated", "Station", id.ToString(), old, request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Stations.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null) return NotFound();
        entity.IsActive = false;
        audit.Add("StationDeactivated", "Station", id.ToString(), newValues: new { IsActive = false });
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static Station Map(Station entity, StationRequest request)
    {
        entity.Type = request.Type.StartsWith("Inward", StringComparison.OrdinalIgnoreCase) ? StationType.Inward
            : request.Type.StartsWith("Issue", StringComparison.OrdinalIgnoreCase) ? StationType.Issue : StationType.General;
        entity.Location = request.Location?.Trim();
        entity.DeviceName = request.Device?.Trim();
        entity.IsActive = request.IsActive;
        return entity;
    }

    private static Dictionary<string, string[]>? Validate(StationRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Code)) errors["code"] = ["Station code is required."];
        if (string.IsNullOrWhiteSpace(request.Name)) errors["name"] = ["Station name is required."];
        if (string.IsNullOrWhiteSpace(request.Type)) errors["type"] = ["Station type is required."];
        return errors.Count == 0 ? null : errors;
    }
}

public sealed record StationRequest(string Code, string Name, string Type, string? Location,
    string? Device, bool IsActive = true);
