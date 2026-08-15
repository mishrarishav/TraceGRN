using APItrackGRN.Domain.Entities;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Tests;

public sealed class ImmutableLedgerTests
{
    [Fact]
    public async Task SaveChanges_RejectsAuditLogModification()
    {
        var options = new DbContextOptionsBuilder<TrackGrnDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var context = new TrackGrnDbContext(options);
        var audit = new AuditLog { Action = "Test", EntityName = "TestEntity" };
        context.AuditLogs.Add(audit);
        await context.SaveChangesAsync();

        audit.Action = "Changed";

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => context.SaveChangesAsync());
        Assert.Contains("immutable", exception.Message, StringComparison.OrdinalIgnoreCase);
    }
}
