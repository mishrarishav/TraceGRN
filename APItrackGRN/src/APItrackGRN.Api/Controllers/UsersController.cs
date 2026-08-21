using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[Authorize(Roles = "Admin")]
[ApiController]
[Route("api/users")]
public sealed class UsersController(TrackGrnDbContext dbContext, IAuditWriter audit) : TrackControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var users = await dbContext.Users.AsNoTracking().Include(x => x.Role)
            .OrderBy(x => x.FullName).ToListAsync(cancellationToken);
        return Ok(users.Select(x => new
        {
            x.Id, name = x.FullName, x.EmployeeCode, x.Username,
            role = ApiText.DisplayRole(x.Role.Name), status = x.IsActive ? "Active" : "Inactive",
            lastLogin = x.LastLoginAt?.ToString("O") ?? "Never",
            rowVersion = Convert.ToBase64String(x.RowVersion)
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create(UserRequest request, CancellationToken cancellationToken)
    {
        var validation = Validate(request, true);
        if (validation is not null) return ValidationProblem(validation);
        var username = request.Username.Trim().ToLowerInvariant();
        var employeeCode = request.EmployeeCode.Trim().ToUpperInvariant();
        if (await dbContext.Users.AnyAsync(x => x.Username == username || x.EmployeeCode == employeeCode, cancellationToken))
            return Conflict(new ProblemDetails { Title = "Duplicate user", Detail = "Username or employee code already exists.", Status = 409 });
        var role = await dbContext.Roles.SingleOrDefaultAsync(x => x.Name == ApiText.NormalizeRole(request.Role), cancellationToken);
        if (role is null) return ValidationProblem(new Dictionary<string, string[]> { ["role"] = ["Unknown role."] });
        var user = new User
        {
            Username = username, FullName = request.Name.Trim(), EmployeeCode = employeeCode,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password!, workFactor: 12),
            RoleId = role.Id, IsActive = request.IsActive
        };
        dbContext.Users.Add(user);
        audit.Add("UserCreated", "User", user.Id.ToString(), newValues: new { user.Username, user.FullName, user.EmployeeCode, Role = role.Name, user.IsActive });
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(Get), new { user.Id });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UserRequest request, CancellationToken cancellationToken)
    {
        var validation = Validate(request, false);
        if (validation is not null) return ValidationProblem(validation);
        var user = await dbContext.Users.Include(x => x.Role).SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (user is null) return NotFound();
        var username = request.Username.Trim().ToLowerInvariant();
        var employeeCode = request.EmployeeCode.Trim().ToUpperInvariant();
        if (await dbContext.Users.AnyAsync(x => x.Id != id && (x.Username == username || x.EmployeeCode == employeeCode), cancellationToken))
            return Conflict(new ProblemDetails { Title = "Duplicate user", Detail = "Username or employee code already exists.", Status = 409 });
        var role = await dbContext.Roles.SingleOrDefaultAsync(x => x.Name == ApiText.NormalizeRole(request.Role), cancellationToken);
        if (role is null) return ValidationProblem(new Dictionary<string, string[]> { ["role"] = ["Unknown role."] });
        var old = new { user.Username, user.FullName, user.EmployeeCode, Role = user.Role.Name, user.IsActive };
        user.Username = username;
        user.FullName = request.Name.Trim();
        user.EmployeeCode = employeeCode;
        user.RoleId = role.Id;
        user.IsActive = request.IsActive;
        audit.Add("UserUpdated", "User", id.ToString(), old, new { user.Username, user.FullName, user.EmployeeCode, Role = role.Name, user.IsActive });
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, ResetPasswordRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 12)
            errors["newPassword"] = ["Password must contain at least 12 characters."];
        if (!string.Equals(request.NewPassword, request.ConfirmPassword, StringComparison.Ordinal))
            errors["confirmPassword"] = ["Password confirmation does not match."];
        if (errors.Count > 0) return ValidationProblem(errors);

        var user = await dbContext.Users.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (user is null) return NotFound();

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, workFactor: 12);
        var now = DateTimeOffset.UtcNow;
        var activeRefreshTokens = await dbContext.RefreshTokens
            .Where(x => x.UserId == id && x.RevokedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var token in activeRefreshTokens) token.RevokedAt = now;

        audit.Add("UserPasswordReset", "User", id.ToString(), newValues: new
        {
            user.Username,
            RevokedSessions = activeRefreshTokens.Count
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { userId = id, revokedSessions = activeRefreshTokens.Count });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (user is null) return NotFound();
        if (user.Id == Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value))
            return Conflict(new ProblemDetails { Title = "Cannot deactivate current user", Status = 409 });
        user.IsActive = false;
        audit.Add("UserDeactivated", "User", id.ToString(), newValues: new { IsActive = false });
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static Dictionary<string, string[]>? Validate(UserRequest request, bool requirePassword)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name)) errors["name"] = ["Name is required."];
        if (string.IsNullOrWhiteSpace(request.EmployeeCode)) errors["employeeCode"] = ["Employee code is required."];
        if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Trim().Length < 3) errors["username"] = ["Username must contain at least 3 characters."];
        if (string.IsNullOrWhiteSpace(request.Role)) errors["role"] = ["Role is required."];
        if (requirePassword && (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12)) errors["password"] = ["Password must contain at least 12 characters."];
        if (requirePassword && !string.IsNullOrWhiteSpace(request.Password) && request.Password.Length < 12) errors["password"] = ["Password must contain at least 12 characters."];
        return errors.Count == 0 ? null : errors;
    }
}

public sealed record UserRequest(string Name, string EmployeeCode, string Username, string Role,
    string? Password, bool IsActive = true);

public sealed record ResetPasswordRequest(string NewPassword, string ConfirmPassword);
