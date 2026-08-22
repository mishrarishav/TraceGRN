using System.Globalization;
using System.Text;
using ExcelDataReader;

namespace APItrackGRN.Api.Services;

public static class ImportWorkbookReader
{
    public const int MaximumRows = 100_000;
    public const int MaximumColumns = 512;

    private static readonly HashSet<string> ExcelExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".xls", ".xlsx", ".xlsm", ".xlsb", ".xltx", ".xltm"
    };

    private static readonly HashSet<string> DelimitedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".csv", ".tsv", ".txt"
    };

    static ImportWorkbookReader()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }

    public static bool Supports(string extension) =>
        ExcelExtensions.Contains(extension) || DelimitedExtensions.Contains(extension);

    public static string SupportedFormatsMessage =>
        "Only .xls, .xlsx, .xlsm, .xlsb, .xltx, .xltm, .csv, .tsv and .txt files are supported.";

    public static ImportWorkbookData Read(byte[] bytes, string extension)
    {
        if (ExcelExtensions.Contains(extension)) return ReadExcel(bytes);
        if (DelimitedExtensions.Contains(extension)) return ReadDelimited(bytes, extension);
        throw new InvalidDataException(SupportedFormatsMessage);
    }

    private static ImportWorkbookData ReadExcel(byte[] bytes)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var reader = ExcelReaderFactory.CreateReader(stream, new ExcelReaderConfiguration
            {
                FallbackEncoding = Encoding.GetEncoding(1252),
                LeaveOpen = false
            });
            var sheets = new List<ImportSheetData>();
            do
            {
                var rows = new List<IReadOnlyList<string>>();
                var columnCount = 0;
                while (reader.Read())
                {
                    if (rows.Count >= MaximumRows)
                        throw new InvalidDataException($"Worksheet '{reader.Name}' exceeds the {MaximumRows:N0} row safety limit.");
                    var fields = Math.Min(reader.FieldCount, MaximumColumns);
                    if (reader.FieldCount > MaximumColumns)
                        throw new InvalidDataException($"Worksheet '{reader.Name}' exceeds the {MaximumColumns:N0} column safety limit.");
                    var row = new string[fields];
                    for (var column = 0; column < fields; column++) row[column] = FormatValue(reader.GetValue(column));
                    var used = row.Length;
                    while (used > 0 && string.IsNullOrWhiteSpace(row[used - 1])) used--;
                    columnCount = Math.Max(columnCount, used);
                    rows.Add(used == row.Length ? row : row[..used]);
                }
                sheets.Add(new ImportSheetData(reader.Name, rows, columnCount));
            } while (reader.NextResult());

            if (sheets.Count == 0) throw new InvalidDataException("Workbook does not contain a worksheet.");
            return new ImportWorkbookData(sheets);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new InvalidDataException($"Unable to read the Excel workbook: {exception.Message}");
        }
    }

    private static ImportWorkbookData ReadDelimited(byte[] bytes, string extension)
    {
        try
        {
            var text = DecodeText(bytes);
            var delimiter = extension.Equals(".tsv", StringComparison.OrdinalIgnoreCase) ? '\t' : DetectDelimiter(text);
            var rows = ReadDelimitedRows(text, delimiter);
            if (rows.Count == 0) throw new InvalidDataException("Delimited file is empty.");
            if (rows.Count > MaximumRows)
                throw new InvalidDataException($"File exceeds the {MaximumRows:N0} row safety limit.");
            var columnCount = rows.Max(row => row.Count);
            if (columnCount > MaximumColumns)
                throw new InvalidDataException($"File exceeds the {MaximumColumns:N0} column safety limit.");
            return new ImportWorkbookData([new ImportSheetData("Data", rows, columnCount)]);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new InvalidDataException($"Unable to read the delimited file: {exception.Message}");
        }
    }

    private static string FormatValue(object? value) => value switch
    {
        null => string.Empty,
        DateTime date when date.TimeOfDay == TimeSpan.Zero => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTime date => date.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        double number => number.ToString("G15", CultureInfo.InvariantCulture),
        float number => number.ToString("G9", CultureInfo.InvariantCulture),
        decimal number => number.ToString(CultureInfo.InvariantCulture),
        bool boolean => boolean ? "TRUE" : "FALSE",
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture) ?? string.Empty,
        _ => value.ToString()?.Trim() ?? string.Empty
    };

    private static string DecodeText(byte[] bytes)
    {
        using var reader = new StreamReader(new MemoryStream(bytes), new UTF8Encoding(false, false), true);
        return reader.ReadToEnd().TrimStart('\uFEFF');
    }

    private static char DetectDelimiter(string text)
    {
        var firstRecord = text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
        var candidates = new[] { '\t', ',', ';', '|' };
        var detected = candidates.Select(delimiter => new { Delimiter = delimiter, Count = CountOutsideQuotes(firstRecord, delimiter) })
            .OrderByDescending(x => x.Count).First();
        if (detected.Count == 0) throw new InvalidDataException("Could not detect a tab, comma, semicolon or pipe delimiter.");
        return detected.Delimiter;
    }

    private static int CountOutsideQuotes(string value, char delimiter)
    {
        var count = 0;
        var quoted = false;
        for (var index = 0; index < value.Length; index++)
        {
            if (value[index] == '"')
            {
                if (quoted && index + 1 < value.Length && value[index + 1] == '"') index++;
                else quoted = !quoted;
            }
            else if (!quoted && value[index] == delimiter) count++;
        }
        return count;
    }

    private static List<IReadOnlyList<string>> ReadDelimitedRows(string text, char delimiter)
    {
        var rows = new List<IReadOnlyList<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;

        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];
            if (character == '"')
            {
                if (quoted && index + 1 < text.Length && text[index + 1] == '"')
                {
                    field.Append('"');
                    index++;
                }
                else quoted = !quoted;
                continue;
            }
            if (!quoted && character == delimiter)
            {
                row.Add(field.ToString());
                field.Clear();
                continue;
            }
            if (!quoted && (character == '\r' || character == '\n'))
            {
                if (character == '\r' && index + 1 < text.Length && text[index + 1] == '\n') index++;
                row.Add(field.ToString());
                field.Clear();
                if (row.Any(value => !string.IsNullOrWhiteSpace(value))) rows.Add(row);
                row = [];
                continue;
            }
            field.Append(character);
        }

        if (quoted) throw new InvalidDataException("Delimited file contains an unterminated quoted field.");
        row.Add(field.ToString());
        if (row.Any(value => !string.IsNullOrWhiteSpace(value))) rows.Add(row);
        return rows;
    }
}

public sealed record ImportWorkbookData(IReadOnlyList<ImportSheetData> Sheets);

public sealed record ImportSheetData(string Name, IReadOnlyList<IReadOnlyList<string>> Rows, int ColumnCount);
