namespace APItrackGRN.Api.Security;

public sealed class JwtSettings
{
    public const string SectionName = "Jwt";
    public string Issuer { get; init; } = "TrackGRN.Api";
    public string Audience { get; init; } = "TrackGRN.UI";
    public string Key { get; init; } = string.Empty;
    public int AccessTokenMinutes { get; init; } = 30;
}
