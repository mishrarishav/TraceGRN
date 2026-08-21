using APItrackGRN.Api.Controllers;
using APItrackGRN.Api.Services;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Tests;

public sealed class UsersControllerTests
{
    [Fact]
    public async Task Reset_password_hashes_new_secret_revokes_sessions_and_audits_without_storing_password()
    {
        var options = new DbContextOptionsBuilder<TrackGrnDbContext>()
            .UseInMemoryDatabase($"password-reset-{Guid.NewGuid():N}")
            .Options;
        await using var db = new TrackGrnDbContext(options);
        var user = new User
        {
            Username = "operator", FullName = "Store Operator", EmployeeCode = "OP-01",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Old-Password-2026!"), RoleId = Guid.NewGuid()
        };
        db.Users.Add(user);
        db.RefreshTokens.AddRange(
            new RefreshToken { UserId = user.Id, TokenHash = "active", ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) },
            new RefreshToken { UserId = user.Id, TokenHash = "already-revoked", ExpiresAt = DateTimeOffset.UtcNow.AddDays(1), RevokedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        var audit = new RecordingAuditWriter();
        var controller = new UsersController(db, audit);

        var result = await controller.ResetPassword(user.Id,
            new ResetPasswordRequest("New-Password-2026!", "New-Password-2026!"), CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        Assert.True(BCrypt.Net.BCrypt.Verify("New-Password-2026!", user.PasswordHash));
        Assert.False(BCrypt.Net.BCrypt.Verify("Old-Password-2026!", user.PasswordHash));
        Assert.All(await db.RefreshTokens.Where(x => x.TokenHash == "active").ToListAsync(),
            token => Assert.NotNull(token.RevokedAt));
        Assert.Equal("UserPasswordReset", audit.Action);
        Assert.DoesNotContain("New-Password-2026!", audit.SerializedValues, StringComparison.Ordinal);
    }

    private sealed class RecordingAuditWriter : IAuditWriter
    {
        public string? Action { get; private set; }
        public string SerializedValues { get; private set; } = string.Empty;

        public void Add(string action, string entityName, string? entityId = null, object? oldValues = null,
            object? newValues = null, object? metadata = null, Guid? userId = null)
        {
            Action = action;
            SerializedValues = System.Text.Json.JsonSerializer.Serialize(new { oldValues, newValues, metadata });
        }
    }
}
