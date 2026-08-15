using APItrackGRN.Infrastructure.Persistence;
using APItrackGRN.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace APItrackGRN.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("TrackGRN")
            ?? throw new InvalidOperationException("Connection string 'TrackGRN' is not configured.");

        services.AddDbContext<TrackGrnDbContext>(options =>
            options.UseSqlServer(connectionString, sql =>
            {
                sql.MigrationsAssembly(typeof(TrackGrnDbContext).Assembly.FullName);
                sql.EnableRetryOnFailure(5, TimeSpan.FromSeconds(10), null);
            }));

        services.AddScoped<DatabaseSeeder>();
        return services;
    }
}
