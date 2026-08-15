using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace APItrackGRN.Api.Controllers;

[ApiController]
[Route("api/system")]
public sealed class SystemController(TrackGrnDbContext dbContext, IWebHostEnvironment environment) : ControllerBase
{
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
}
