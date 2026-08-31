using System.Globalization;

namespace APItrackGRN.Application.Labels;

/// <summary>
/// Creates the durable label identifier and the human-readable, scanner-friendly QR payload.
/// The label UID is derived from the entity primary key, while SQL Server also enforces a
/// unique index on LabelUid. This makes the same identifier safe to use for generation,
/// printing, scanning, issue, and traceability.
/// </summary>
public static class LabelIdentity
{
    private static readonly string[] LabelPrefixes = ["Label ID:", "Label UID:", "Label:"];

    public static string FromId(Guid id) => $"LBL-{id:N}".ToUpperInvariant();

    public static string CreateQrPayload(
        string labelUid,
        string grnNumber,
        string materialNumber,
        decimal quantity,
        string uom,
        DateOnly grnDate,
        DateTimeOffset labelDate)
    {
        var localLabelDate = labelDate.ToLocalTime();
        return string.Join('\n',
            $"GRN Number: {grnNumber.Trim()}",
            $"Material: {materialNumber.Trim()}",
            $"Quantity: {quantity.ToString("0.####", CultureInfo.InvariantCulture)} {uom.Trim().ToUpperInvariant()}",
            $"GRN Date: {grnDate:dd-MM-yy}",
            $"Label Date: {localLabelDate:dd-MM-yy, HH-mm-ss}",
            $"Label ID: {labelUid.Trim().ToUpperInvariant()}");
    }

    public static string? ExtractUid(string? scannedValue)
    {
        if (string.IsNullOrWhiteSpace(scannedValue)) return null;

        var value = scannedValue.Trim();
        if (!value.Contains('\n'))
        {
            if (Guid.TryParse(value, out var rawId)) return FromId(rawId);
            if (value.StartsWith("LBL-", StringComparison.OrdinalIgnoreCase))
            {
                var suffix = value[4..];
                return Guid.TryParse(suffix, out var prefixedId)
                    ? FromId(prefixedId)
                    : value.ToUpperInvariant();
            }
        }

        foreach (var rawLine in value.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            var line = rawLine.Trim();
            foreach (var prefix in LabelPrefixes)
            {
                if (!line.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
                var candidate = line[prefix.Length..].Trim();
                if (candidate.StartsWith("LBL-", StringComparison.OrdinalIgnoreCase))
                    return candidate.ToUpperInvariant();
            }
        }

        return null;
    }
}
