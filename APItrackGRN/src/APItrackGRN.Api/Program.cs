using System.Text;
using System.Text.Json.Serialization;
using APItrackGRN.Api.Security;
using APItrackGRN.Api.Services;
using APItrackGRN.Application;
using APItrackGRN.Infrastructure;
using APItrackGRN.Infrastructure.Persistence;
using APItrackGRN.Infrastructure.Seeding;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;

var printerTestMode = args.Contains("--printer-test", StringComparer.OrdinalIgnoreCase);
var maintenanceMode = args.Contains("--migrate", StringComparer.OrdinalIgnoreCase)
    || args.Contains("--seed", StringComparer.OrdinalIgnoreCase);

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, services, logger) => logger
    .ReadFrom.Configuration(context.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext());

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IRequestContext, RequestContext>();
builder.Services.AddScoped<IAuditWriter, AuditWriter>();
builder.Services.Configure<PrinterOptions>(builder.Configuration.GetSection(PrinterOptions.SectionName));
builder.Services.AddScoped<ILabelPrinter, LabelPrinter>();
builder.Services.AddSingleton<IPrinterDiscoveryService, PrinterDiscoveryService>();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "TrackGRN API",
        Version = "v1",
        Description = "Material traceability API for SAP GRN import, QR labels, inward and store issuance."
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
        }] = Array.Empty<string>()
    });
});

var jwtSection = builder.Configuration.GetSection(JwtSettings.SectionName);
var jwtSettings = jwtSection.Get<JwtSettings>()
    ?? throw new InvalidOperationException("JWT settings are missing.");
if (string.IsNullOrWhiteSpace(jwtSettings.Key)
    || jwtSettings.Key.Length < 32
    || jwtSettings.Key.StartsWith("SET_WITH_", StringComparison.Ordinal)
    || jwtSettings.Key.StartsWith("REPLACE_WITH_", StringComparison.Ordinal))
{
    throw new InvalidOperationException("JWT key must contain at least 32 characters.");
}

builder.Services.Configure<JwtSettings>(jwtSection);
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy =>
{
    if (allowedOrigins.Length == 0)
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        return;
    }

    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
}));

var app = builder.Build();

if (printerTestMode)
{
    await using var printerScope = app.Services.CreateAsyncScope();
    var printer = printerScope.ServiceProvider.GetRequiredService<ILabelPrinter>();
    var labelUid = $"TEST-{DateTime.Now:yyyyMMdd-HHmmss}";
    var result = await printer.PrintAsync(new LabelPrintJob(
        labelUid,
        "M06030952",
        "TEST LABEL - PRINTER VERIFICATION",
        "TEST-NO-DB",
        "TEST-BATCH",
        200m,
        "PC",
        1,
        1), CancellationToken.None);
    Log.Information("Printer test {LabelUid} sent using {Mode} to {Printer}; simulated={Simulated}",
        labelUid, result.Mode, result.Printer, result.Simulated);
    await Log.CloseAndFlushAsync();
    return;
}

var testBootstrap = app.Environment.IsEnvironment("Testing");
if (maintenanceMode || testBootstrap)
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
    Log.Information("Applying TrackGRN database migrations...");
    await dbContext.Database.MigrateAsync();
    Log.Information("Database migrations are up to date.");

    if (testBootstrap || args.Contains("--seed", StringComparer.OrdinalIgnoreCase))
    {
        Log.Information("Applying idempotent TrackGRN seed data...");
        var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
        await seeder.SeedAsync();
    }

    if (maintenanceMode)
    {
        await Log.CloseAndFlushAsync();
        return;
    }
}

app.UseExceptionHandler();
app.UseSerilogRequestLogging();
app.UseSwagger();
app.UseSwaggerUI();
app.UseStaticFiles();
app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health/live");
app.MapControllers();

app.Lifetime.ApplicationStarted.Register(() =>
    Log.Information("TrackGRN API ready on {Addresses}", string.Join(", ", app.Urls)));

await app.RunAsync();

public partial class Program;
