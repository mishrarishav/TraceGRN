using System.Security.Claims;
using System.Text.Json;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace APItrackGRN.Api.Services;

public abstract class TrackControllerBase : ControllerBase
{
    protected ActionResult ValidationProblem(Dictionary<string, string[]> errors) =>
        base.ValidationProblem(new ValidationProblemDetails(errors));
}

public interface IRequestContext
{
    Guid UserId { get; }
    string? DeviceId { get; }
    string? IpAddress { get; }
}

public sealed class RequestContext(IHttpContextAccessor accessor) : IRequestContext
{
    private HttpContext HttpContext => accessor.HttpContext
        ?? throw new InvalidOperationException("No active HTTP request is available.");

    public Guid UserId => Guid.TryParse(
        HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
        ? id
        : throw new UnauthorizedAccessException("The access token does not contain a valid user id.");

    public string? DeviceId => HttpContext.Request.Headers["X-Device-Id"].FirstOrDefault();
    public string? IpAddress => HttpContext.Connection.RemoteIpAddress?.ToString();
}

public interface IAuditWriter
{
    void Add(
        string action,
        string entityName,
        string? entityId = null,
        object? oldValues = null,
        object? newValues = null,
        object? metadata = null,
        Guid? userId = null);
}

public sealed class AuditWriter(TrackGrnDbContext dbContext, IRequestContext requestContext) : IAuditWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public void Add(
        string action,
        string entityName,
        string? entityId = null,
        object? oldValues = null,
        object? newValues = null,
        object? metadata = null,
        Guid? userId = null)
    {
        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = userId ?? requestContext.UserId,
            Action = action,
            EntityName = entityName,
            EntityId = entityId,
            OldValuesJson = Serialize(oldValues),
            NewValuesJson = Serialize(newValues),
            MetadataJson = Serialize(metadata),
            DeviceId = requestContext.DeviceId,
            IpAddress = requestContext.IpAddress
        });
    }

    private static string? Serialize(object? value) =>
        value is null ? null : JsonSerializer.Serialize(value, JsonOptions);
}

public static class ApiText
{
    public static string DisplayRole(string role) => role switch
    {
        "StoreManager" => "Store Manager",
        "StoreOperator" => "Store Operator",
        _ => role
    };

    public static string NormalizeRole(string role) => role.Replace(" ", string.Empty, StringComparison.Ordinal);

    public static object EmptyObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, object?>();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(json)
                ?? new Dictionary<string, object?>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?> { ["raw"] = json };
        }
    }
}
