using System.Reflection;
using Microsoft.AspNetCore.Http.Json;
using TrackGRN.PrintAgent;

const string agentHeader = "X-TrackGRN-Agent-Key";
const string defaultAgentKey = "TrackGRN-Plant-PrintAgent-v1-2026";

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(options => options.ServiceName = "TrackGRN Local Print Agent");
builder.WebHost.UseUrls("http://0.0.0.0:17891");
builder.Services.Configure<JsonOptions>(options =>
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var app = builder.Build();
var configuredKey = builder.Configuration["Agent:Key"]
    ?? Environment.GetEnvironmentVariable("TRACKGRN_PRINT_AGENT_KEY")
    ?? defaultAgentKey;

app.Use(async (context, next) =>
{
    if (!context.Request.Headers.TryGetValue(agentHeader, out var suppliedKey)
        || !string.Equals(suppliedKey.ToString(), configuredKey, StringComparison.Ordinal))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { title = "TrackGRN print agent key is invalid." });
        return;
    }

    await next();
});

app.MapGet("/health", () => Results.Ok(new
{
    status = "ready",
    machineName = Environment.MachineName,
    version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0",
    port = 17891
}));

app.MapGet("/printers", () =>
{
    try
    {
        return Results.Ok(new
        {
            machineName = Environment.MachineName,
            printers = WindowsPrinter.GetInstalledPrinters()
        });
    }
    catch (Exception exception)
    {
        return Results.Problem(
            title: "Unable to read installed Windows printers",
            detail: exception.Message,
            statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapPost("/print", (AgentPrintRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.PrinterName))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["printerName"] = ["An installed Windows printer queue is required."]
        });
    if (string.IsNullOrWhiteSpace(request.Zpl))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["zpl"] = ["A ZPL print payload is required."]
        });
    if (request.Zpl.Length > 1_000_000)
        return Results.Problem(
            title: "Print payload is too large",
            statusCode: StatusCodes.Status413PayloadTooLarge);

    try
    {
        WindowsPrinter.SendRaw(request.PrinterName.Trim(), request.Zpl, request.LabelUid);
        return Results.Ok(new
        {
            ok = true,
            machineName = Environment.MachineName,
            printer = request.PrinterName.Trim(),
            request.LabelUid
        });
    }
    catch (Exception exception)
    {
        return Results.Problem(
            title: "Local printer rejected the label",
            detail: exception.Message,
            statusCode: StatusCodes.Status502BadGateway);
    }
});

app.Lifetime.ApplicationStarted.Register(() =>
    app.Logger.LogInformation(
        "TrackGRN Local Print Agent ready on port 17891 as {MachineName}",
        Environment.MachineName));

await app.RunAsync();

namespace TrackGRN.PrintAgent
{
    public sealed record AgentPrintRequest(string PrinterName, string Zpl, string? LabelUid);
}
