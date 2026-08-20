using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/vendors")]
public sealed class VendorsController(TrackGrnDbContext dbContext, IAuditWriter audit) : TrackControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? search,
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        var query = dbContext.Vendors.AsNoTracking().Include(x => x.Aliases).AsQueryable();
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.VendorCode.Contains(term) || x.VendorName.Contains(term)
                || x.Aliases.Any(alias => alias.AliasName.Contains(term)));
        }

        var rows = await query.OrderBy(x => x.VendorCode).Take(1000).Select(x => new
        {
            id = x.Id.ToString(), x.VendorCode, x.VendorName,
            aliases = x.Aliases.OrderBy(alias => alias.AliasName).Select(alias => alias.AliasName),
            grnCount = x.GrnHeaders.Count,
            status = x.IsActive ? "Active" : "Inactive"
        }).ToListAsync(cancellationToken);
        return Ok(rows);
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPost]
    public async Task<IActionResult> Create(VendorRequest request, CancellationToken cancellationToken)
    {
        var errors = Validate(request);
        if (errors is not null) return ValidationProblem(errors);
        var code = request.VendorCode.Trim().ToUpperInvariant();
        if (await dbContext.Vendors.AnyAsync(x => x.VendorCode == code, cancellationToken))
            return Conflict(Problem("Vendor already exists", $"Vendor {code} is already configured."));

        var vendor = new Vendor
        {
            VendorCode = code,
            VendorName = request.VendorName.Trim(),
            IsActive = request.IsActive
        };
        AddAliases(vendor, request.Aliases);
        dbContext.Vendors.Add(vendor);
        audit.Add("VendorCreated", "Vendor", vendor.Id.ToString(), newValues: request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { search = code }, new { vendor.Id });
    }

    [Authorize(Roles = "Admin,StoreManager")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, VendorRequest request, CancellationToken cancellationToken)
    {
        var errors = Validate(request);
        if (errors is not null) return ValidationProblem(errors);
        var vendor = await dbContext.Vendors.Include(x => x.Aliases)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (vendor is null) return NotFound();

        var code = request.VendorCode.Trim().ToUpperInvariant();
        if (await dbContext.Vendors.AnyAsync(x => x.Id != id && x.VendorCode == code, cancellationToken))
            return Conflict(Problem("Vendor already exists", $"Vendor {code} is already configured."));

        var old = new { vendor.VendorCode, vendor.VendorName, Aliases = vendor.Aliases.Select(x => x.AliasName), vendor.IsActive };
        vendor.VendorCode = code;
        vendor.VendorName = request.VendorName.Trim();
        vendor.IsActive = request.IsActive;
        var requestedAliases = NormalizeAliases(request.Aliases, vendor.VendorName);
        dbContext.VendorAliases.RemoveRange(vendor.Aliases.Where(alias => !requestedAliases.Contains(alias.AliasName)));
        foreach (var alias in requestedAliases.Where(alias => vendor.Aliases.All(existing =>
                     !string.Equals(existing.AliasName, alias, StringComparison.OrdinalIgnoreCase))))
            vendor.Aliases.Add(new VendorAlias { Vendor = vendor, AliasName = alias });

        audit.Add("VendorUpdated", "Vendor", id.ToString(), old, request);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var vendor = await dbContext.Vendors.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (vendor is null) return NotFound();
        vendor.IsActive = false;
        audit.Add("VendorDeactivated", "Vendor", id.ToString(), newValues: new { IsActive = false });
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static Dictionary<string, string[]>? Validate(VendorRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.VendorCode)) errors["vendorCode"] = ["Vendor code is required."];
        if (string.IsNullOrWhiteSpace(request.VendorName)) errors["vendorName"] = ["Vendor name is required."];
        return errors.Count == 0 ? null : errors;
    }

    private static void AddAliases(Vendor vendor, IEnumerable<string>? aliases)
    {
        foreach (var alias in NormalizeAliases(aliases, vendor.VendorName))
            vendor.Aliases.Add(new VendorAlias { Vendor = vendor, AliasName = alias });
    }

    private static HashSet<string> NormalizeAliases(IEnumerable<string>? aliases, string canonicalName) =>
        (aliases ?? []).Select(alias => alias.Trim())
        .Where(alias => !string.IsNullOrWhiteSpace(alias) && !string.Equals(alias, canonicalName, StringComparison.OrdinalIgnoreCase))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static ProblemDetails Problem(string title, string detail) => new() { Title = title, Detail = detail, Status = 409 };
}

public sealed record VendorRequest(
    string VendorCode,
    string VendorName,
    string[]? Aliases = null,
    bool IsActive = true);
