using System.Security.Cryptography;
using System.Text;

namespace APItrackGRN.Application.BusinessKeys;

public interface IBusinessKeyCalculator
{
    string Calculate(IReadOnlyDictionary<string, string?> values, IReadOnlyCollection<string> selectedFields);
    string Preview(IReadOnlyDictionary<string, string?> values, IReadOnlyCollection<string> selectedFields);
}

public sealed class BusinessKeyCalculator : IBusinessKeyCalculator
{
    public string Calculate(IReadOnlyDictionary<string, string?> values, IReadOnlyCollection<string> selectedFields)
    {
        var normalized = Preview(values, selectedFields);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized))).ToLowerInvariant();
    }

    public string Preview(IReadOnlyDictionary<string, string?> values, IReadOnlyCollection<string> selectedFields)
    {
        if (selectedFields.Count == 0)
        {
            throw new ArgumentException("At least one identification field is required.", nameof(selectedFields));
        }

        return string.Join('|', selectedFields.Select(field =>
        {
            var match = values.FirstOrDefault(pair => string.Equals(pair.Key, field, StringComparison.OrdinalIgnoreCase));
            return Normalize(match.Value);
        }));
    }

    private static string Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().ToUpperInvariant();
}
