using APItrackGRN.Domain.Common;
using APItrackGRN.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Infrastructure.Persistence;

public sealed class TrackGrnDbContext(DbContextOptions<TrackGrnDbContext> options) : DbContext(options)
{
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Material> Materials => Set<Material>();
    public DbSet<Station> Stations => Set<Station>();
    public DbSet<PackingRule> PackingRules => Set<PackingRule>();
    public DbSet<IdentificationStrategy> IdentificationStrategies => Set<IdentificationStrategy>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<ImportRowResult> ImportRowResults => Set<ImportRowResult>();
    public DbSet<GrnHeader> GrnHeaders => Set<GrnHeader>();
    public DbSet<GrnLine> GrnLines => Set<GrnLine>();
    public DbSet<GrnLineRevisionHistory> GrnLineRevisionHistory => Set<GrnLineRevisionHistory>();
    public DbSet<MaterialLabel> MaterialLabels => Set<MaterialLabel>();
    public DbSet<MaterialTransaction> MaterialTransactions => Set<MaterialTransaction>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ApplicationSetting> ApplicationSettings => Set<ApplicationSetting>();
    public DbSet<ExcelMappingTemplate> ExcelMappingTemplates => Set<ExcelMappingTemplate>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TrackGrnDbContext).Assembly);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyEntityRules();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        ApplyEntityRules();
        return base.SaveChanges();
    }

    private void ApplyEntityRules()
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = entry.Entity.CreatedAt == default
                    ? DateTimeOffset.UtcNow
                    : entry.Entity.CreatedAt;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        var immutableChanges = ChangeTracker.Entries()
            .Where(entry => entry.Entity is MaterialTransaction or AuditLog)
            .Where(entry => entry.State is EntityState.Modified or EntityState.Deleted)
            .ToList();

        if (immutableChanges.Count > 0)
        {
            throw new InvalidOperationException("Transaction and audit ledger records are immutable.");
        }
    }
}
