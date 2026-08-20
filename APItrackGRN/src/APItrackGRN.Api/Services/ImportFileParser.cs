using System.Globalization;
using System.Text;
using ClosedXML.Excel;

namespace APItrackGRN.Api.Services;

public static class ImportFileParser
{
    private static readonly string[] RequiredFields = ["GRNNumber", "GRNDate", "MaterialNumber", "ReceivedQuantity"];

    private static readonly IReadOnlyDictionary<string, string> BuiltInAliases = BuildAliases();

    public static List<NormalizedImportRow> Parse(
        byte[] bytes,
        string extension,
        IReadOnlyDictionary<string, string> configuredMapping)
    {
        return extension.ToLowerInvariant() switch
        {
            ".xlsx" => ParseWorkbook(bytes, configuredMapping),
            ".csv" or ".tsv" or ".txt" => ParseDelimited(bytes, configuredMapping),
            _ => throw new InvalidDataException("Only .xlsx, .csv, .tsv and .txt files are supported.")
        };
    }

    private static List<NormalizedImportRow> ParseWorkbook(
        byte[] bytes,
        IReadOnlyDictionary<string, string> configuredMapping)
    {
        try
        {
            using var workbook = new XLWorkbook(new MemoryStream(bytes));
            var sheet = workbook.Worksheets.FirstOrDefault()
                ?? throw new InvalidDataException("Workbook does not contain a worksheet.");
            var headerRow = sheet.FirstRowUsed()
                ?? throw new InvalidDataException("Worksheet is empty.");
            var headers = headerRow.CellsUsed().ToDictionary(
                cell => cell.Address.ColumnNumber,
                cell => cell.GetString().Trim());
            var columns = ResolveColumns(headers, configuredMapping);
            EnsureRequiredColumns(columns);

            var output = new List<NormalizedImportRow>();
            var lastRow = sheet.LastRowUsed()?.RowNumber() ?? headerRow.RowNumber();
            for (var rowNumber = headerRow.RowNumber() + 1; rowNumber <= lastRow; rowNumber++)
            {
                var row = sheet.Row(rowNumber);
                string Text(string field) => columns.TryGetValue(field, out var column)
                    ? row.Cell(column).GetFormattedString().Trim()
                    : string.Empty;
                DateOnly? Date(string field)
                {
                    if (!columns.TryGetValue(field, out var column)) return null;
                    var cell = row.Cell(column);
                    return cell.TryGetValue<DateTime>(out var date)
                        ? DateOnly.FromDateTime(date)
                        : ParseNullableDate(cell.GetFormattedString());
                }
                decimal Number(string field)
                {
                    if (!columns.TryGetValue(field, out var column)) return 0;
                    var cell = row.Cell(column);
                    return cell.TryGetValue<decimal>(out var number)
                        ? number
                        : ParseNumber(cell.GetFormattedString());
                }

                if (string.IsNullOrWhiteSpace(Text("GRNNumber")) && string.IsNullOrWhiteSpace(Text("MaterialNumber"))) continue;
                output.Add(CreateRow(rowNumber, Text, Date, Number));
            }

            if (output.Count == 0) throw new InvalidDataException("Workbook does not contain any material rows.");
            return output;
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new InvalidDataException($"Unable to read the XLSX workbook: {exception.Message}");
        }
    }

    private static List<NormalizedImportRow> ParseDelimited(
        byte[] bytes,
        IReadOnlyDictionary<string, string> configuredMapping)
    {
        try
        {
            var text = DecodeText(bytes);
            var delimiter = DetectDelimiter(text);
            var rows = ReadDelimitedRows(text, delimiter);
            if (rows.Count == 0) throw new InvalidDataException("Delimited file is empty.");

            var headers = rows[0].Select((value, index) => new { Column = index + 1, Value = value.Trim() })
                .ToDictionary(x => x.Column, x => x.Value);
            var columns = ResolveColumns(headers, configuredMapping);
            EnsureRequiredColumns(columns);

            var output = new List<NormalizedImportRow>();
            for (var index = 1; index < rows.Count; index++)
            {
                var values = rows[index];
                string Text(string field) => columns.TryGetValue(field, out var column) && column <= values.Count
                    ? values[column - 1].Trim()
                    : string.Empty;
                DateOnly? Date(string field) => ParseNullableDate(Text(field));
                decimal Number(string field) => ParseNumber(Text(field));

                if (string.IsNullOrWhiteSpace(Text("GRNNumber")) && string.IsNullOrWhiteSpace(Text("MaterialNumber"))) continue;
                output.Add(CreateRow(index + 1, Text, Date, Number));
            }

            if (output.Count == 0) throw new InvalidDataException("Delimited file does not contain any material rows.");
            return output;
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

    private static NormalizedImportRow CreateRow(
        int rowNumber,
        Func<string, string> text,
        Func<string, DateOnly?> date,
        Func<string, decimal> number)
    {
        var expectedLabels = number("ExpectedLabelCount");
        return new NormalizedImportRow(
            rowNumber,
            text("GRNNumber"),
            date("GRNDate") ?? default,
            text("SAPLineItemNumber"),
            text("MaterialNumber").ToUpperInvariant(),
            text("MaterialDescription"),
            number("ReceivedQuantity"),
            number("PackingStandard"),
            text("BatchNumber"),
            text("UOM"),
            text("Plant"),
            text("StorageLocation"),
            text("PurchaseOrder"),
            text("VendorCode"),
            text("VendorName"),
            text("InvoiceNumber"),
            date("InvoiceDate"),
            text("BinLocation"),
            date("ManufacturingDate"),
            date("ExpiryDate"),
            expectedLabels > 0 && expectedLabels <= int.MaxValue ? decimal.ToInt32(decimal.Truncate(expectedLabels)) : null);
    }

    private static Dictionary<string, int> ResolveColumns(
        IReadOnlyDictionary<int, string> headers,
        IReadOnlyDictionary<string, string> configuredMapping)
    {
        var configured = configuredMapping
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Key) && !string.IsNullOrWhiteSpace(pair.Value))
            .GroupBy(pair => NormalizeHeader(pair.Key), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Last().Value, StringComparer.OrdinalIgnoreCase);
        var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var (column, sourceHeader) in headers)
        {
            var normalized = NormalizeHeader(sourceHeader);
            if (configured.TryGetValue(normalized, out var configuredField))
            {
                columns.TryAdd(configuredField, column);
                continue;
            }

            if (BuiltInAliases.TryGetValue(normalized, out var field)) columns.TryAdd(field, column);
        }

        return columns;
    }

    private static void EnsureRequiredColumns(IReadOnlyDictionary<string, int> columns)
    {
        var missing = RequiredFields.Where(field => !columns.ContainsKey(field)).ToList();
        if (missing.Count > 0)
            throw new InvalidDataException($"Required columns could not be identified: {string.Join(", ", missing)}. Use a mapping template or a supported business header.");
    }

    private static IReadOnlyDictionary<string, string> BuildAliases()
    {
        var aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        void Add(string field, params string[] names)
        {
            aliases[NormalizeHeader(field)] = field;
            foreach (var name in names) aliases[NormalizeHeader(name)] = field;
        }

        Add("GRNNumber", "GRN No", "GR No", "GR Number", "Goods Receipt No", "Goods Receipt Number");
        Add("GRNDate", "GRN Date", "GR Date", "Gr date", "Goods Receipt Date");
        Add("SAPLineItemNumber", "Line Item", "Item", "Item No", "SAP Line Item");
        Add("MaterialNumber", "Material", "Material No", "Material Code", "Part No", "Part Number", "Parts Number");
        Add("MaterialDescription", "Material Description", "Material Desc", "Description", "Part Description");
        Add("ReceivedQuantity", "Quantity", "Qty", "Received Qty", "GR Quantity");
        Add("PackingStandard", "Pack Qty", "Packing Qty", "Pack Quantity", "Packing Standard", "Standard Pack Qty");
        Add("BatchNumber", "Batch", "Batch No", "Lot", "Lot No");
        Add("UOM", "Unit", "Unit of Measure");
        Add("Plant", "Plant Code");
        Add("StorageLocation", "Storage Location", "Storage Loc", "SLoc");
        Add("PurchaseOrder", "PO", "PO Number", "Purchase Order", "Purchase Order No");
        Add("VendorCode", "Vendor", "Vendor Code", "SAP Vendor Code", "Supplier Code");
        Add("VendorName", "Vendor Name", "Supplier Name", "Sup Name", "Supplier");
        Add("InvoiceNumber", "Invoice No", "Invoice Number", "Invo No", "Inv No");
        Add("InvoiceDate", "Invoice Date", "Inv Date");
        Add("BinLocation", "Bin", "Bin Loc", "Bin Location");
        Add("ManufacturingDate", "Mfg Date", "Manufacturing Date", "MFD", "MFD Date");
        Add("ExpiryDate", "Exp Date", "Expiry Date", "Expiration Date");
        Add("ExpectedLabelCount", "No of Labels to print", "Labels to Print", "Label Count", "No of Labels");
        return aliases;
    }

    private static string NormalizeHeader(string value) => new(value
        .Where(char.IsLetterOrDigit)
        .Select(char.ToLowerInvariant)
        .ToArray());

    private static DateOnly? ParseNullableDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        string[] formats =
        [
            "dd.MM.yyyy", "d.M.yyyy", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy",
            "yyyy-MM-dd", "yyyy/MM/dd", "MM/dd/yyyy", "M/d/yyyy", "dd.MM.yy", "d.M.yy"
        ];
        if (DateOnly.TryParseExact(trimmed, formats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var exact))
            return exact;
        if (DateOnly.TryParse(trimmed, CultureInfo.GetCultureInfo("en-IN"), DateTimeStyles.AllowWhiteSpaces, out var indian))
            return indian;
        return null;
    }

    private static decimal ParseNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        var trimmed = value.Trim().Replace("\u00a0", string.Empty).Replace(" ", string.Empty);
        if (decimal.TryParse(trimmed, NumberStyles.Number | NumberStyles.AllowExponent, CultureInfo.InvariantCulture, out var number))
            return number;
        if (decimal.TryParse(trimmed, NumberStyles.Number | NumberStyles.AllowExponent, CultureInfo.GetCultureInfo("en-IN"), out number))
            return number;
        return 0;
    }

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

    private static List<List<string>> ReadDelimitedRows(string text, char delimiter)
    {
        var rows = new List<List<string>>();
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
                else
                {
                    quoted = !quoted;
                }
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

public sealed record NormalizedImportRow(
    int ExcelRowNumber,
    string GrnNumber,
    DateOnly GrnDate,
    string SapLineItemNumber,
    string MaterialNumber,
    string MaterialDescription,
    decimal ReceivedQuantity,
    decimal PackingStandard,
    string BatchNumber,
    string Uom,
    string Plant,
    string StorageLocation,
    string PurchaseOrder,
    string VendorCode,
    string VendorName,
    string InvoiceNumber,
    DateOnly? InvoiceDate,
    string BinLocation,
    DateOnly? ManufacturingDate,
    DateOnly? ExpiryDate,
    int? ExpectedLabelCount);
