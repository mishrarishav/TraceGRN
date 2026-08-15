using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using APItrackGRN.Api.Security;
using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(TrackGrnDbContext dbContext, IJwtTokenService tokenService) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var normalizedUsername = request.Username.Trim().ToLowerInvariant();
        var user = await dbContext.Users.Include(x => x.Role)
            .SingleOrDefaultAsync(x => x.Username == normalizedUsername, cancellationToken);
        if (user is null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new ProblemDetails { Title = "Invalid credentials", Detail = "The username or password is incorrect.", Status = 401 });
        return Ok(await CreateSession(user, cancellationToken));
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<LoginResponse>> Refresh(RefreshRequest request, CancellationToken cancellationToken)
    {
        var hash = Hash(request.RefreshToken);
        var stored = await dbContext.RefreshTokens.Include(x => x.User).ThenInclude(x => x.Role)
            .SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
        if (stored is null || stored.RevokedAt is not null || stored.ExpiresAt <= DateTimeOffset.UtcNow || !stored.User.IsActive)
            return Unauthorized(new ProblemDetails { Title = "Session expired", Detail = "Sign in again to continue.", Status = 401 });
        stored.RevokedAt = DateTimeOffset.UtcNow;
        var result = await CreateSession(stored.User, cancellationToken, false);
        stored.ReplacedByTokenHash = Hash(result.RefreshToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(result);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest request, CancellationToken cancellationToken)
    {
        var hash = Hash(request.RefreshToken);
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var token = await dbContext.RefreshTokens.SingleOrDefaultAsync(x => x.TokenHash == hash && x.UserId == userId, cancellationToken);
        if (token is not null && token.RevokedAt is null)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await dbContext.Users.AsNoTracking().Include(x => x.Role).SingleOrDefaultAsync(x => x.Id == userId && x.IsActive, cancellationToken);
        return user is null ? Unauthorized() : Ok(ToUser(user));
    }

    private async Task<LoginResponse> CreateSession(User user, CancellationToken cancellationToken, bool save = true)
    {
        var jwt = tokenService.Create(user);
        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        dbContext.RefreshTokens.Add(new RefreshToken
        {
            TokenHash = Hash(refreshToken), UserId = user.Id, ExpiresAt = DateTimeOffset.UtcNow.AddDays(7)
        });
        user.LastLoginAt = DateTimeOffset.UtcNow;
        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id, Action = "UserLogin", EntityName = "User", EntityId = user.Id.ToString(),
            MetadataJson = "{\"result\":\"Success\"}"
        });
        if (save) await dbContext.SaveChangesAsync(cancellationToken);
        return new LoginResponse(jwt.AccessToken, jwt.ExpiresAt, refreshToken, DateTimeOffset.UtcNow.AddDays(7), ToUser(user));
    }

    private static CurrentUser ToUser(User user) => new(user.Id, user.Username, user.FullName, user.EmployeeCode,
        user.Role.Name, ApiText.DisplayRole(user.Role.Name));
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}

public sealed record LoginRequest(string Username, string Password);
public sealed record RefreshRequest(string RefreshToken);
public sealed record CurrentUser(Guid Id, string Username, string FullName, string EmployeeCode, string Role, string RoleDisplay);
public sealed record LoginResponse(string AccessToken, DateTimeOffset ExpiresAt, string RefreshToken,
    DateTimeOffset RefreshExpiresAt, CurrentUser User);
