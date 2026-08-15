using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace APItrackGRN.Infrastructure.Persistence;

public sealed class TrackGrnDbContextFactory : IDesignTimeDbContextFactory<TrackGrnDbContext>
{
    public TrackGrnDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__TrackGRN")
            ?? Environment.GetEnvironmentVariable("TRACKGRN_ConnectionStrings__TrackGRN")
            ?? "Server=localhost;Database=TrackGRN;Trusted_Connection=True;TrustServerCertificate=True";

        var options = new DbContextOptionsBuilder<TrackGrnDbContext>()
            .UseSqlServer(connectionString, sql =>
                sql.MigrationsAssembly(typeof(TrackGrnDbContext).Assembly.FullName))
            .Options;

        return new TrackGrnDbContext(options);
    }
}
