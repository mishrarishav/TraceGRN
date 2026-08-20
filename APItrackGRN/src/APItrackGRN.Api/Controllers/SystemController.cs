using System.Text.Json;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[ApiController]
[Route("api/system")]
public sealed class SystemController(TrackGrnDbContext dbContext, IWebHostEnvironment environment) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [AllowAnonymous]
    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken cancellationToken)
    {
        var databaseAvailable = await dbContext.Database.CanConnectAsync(cancellationToken);
        return Ok(new
        {
            service = "TrackGRN API",
            environment = environment.EnvironmentName,
            database = databaseAvailable ? "available" : "unavailable",
            utcTime = DateTimeOffset.UtcNow
        });
    }

    [AllowAnonymous]
    [HttpGet("branding")]
    public async Task<IActionResult> Branding(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var configuration = new PlantConfig();
        try
        {
            var value = await dbContext.ApplicationSettings.AsNoTracking()
                .Where(setting => setting.Key == "PlantConfiguration")
                .Select(setting => setting.ValueJson)
                .SingleOrDefaultAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(value))
                configuration = JsonSerializer.Deserialize<PlantConfig>(value, JsonOptions) ?? configuration;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Branding must never prevent the unauthenticated login screen from loading.
        }

        return Ok(new
        {
            appName = "TrackGRN",
            version = "1.1.2",
            configuration.ClientName,
            configuration.ClientLogoDataUrl
        });
    }
}
