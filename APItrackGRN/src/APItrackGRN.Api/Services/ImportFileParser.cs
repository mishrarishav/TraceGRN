using System.Globalization;

namespace APItrackGRN.Api.Services;

public static class ImportFileParser
{
    private static readonly string[] RequiredFields = ["GRNNumber", "GRNDate", "MaterialNumber", "ReceivedQuantity"];
    private static readonly IReadOnlyList<ImportFieldDefinition> FieldDefinitions = BuildFieldDefinitions();
    private static readonly IReadOnlyDictionary<string, string> BuiltInAliases = BuildAliases(FieldDefinitions);

    public static IReadOnlyList<ImportFieldDefinition> Fields => FieldDefinitions;

    public static List<NormalizedImportRow> Parse(
        byte[] bytes,
        string extension,
        IReadOnlyDictionary<string, string> configuredMapping,
        string? sheetName = null,
        int? headerRowNumber = null)
    {
        var workbook = ImportWorkbookReader.Read(bytes, extension);
        var sheet = string.IsNullOrWhiteSpace(sheetName)
            ? workbook.Sheets.FirstOrDefault()
            : workbook.Sheets.FirstOrDefault(x => string.Equals(x.Name, sheetName, StringComparison.OrdinalIgnoreCase));
        if (sheet is null)
            throw new InvalidDataException(string.IsNullOrWhiteSpace(sheetName)
                ? "Workbook does not contain a worksheet."
                : $"Worksheet '{sheetName}' was not found.");
        if (sheet.Rows.Count == 0) throw new InvalidDataException($"Worksheet '{sheet.Name}' is empty.");

        var headerIndex = headerRowNumber is null ? FindFirstUsedRow(sheet.Rows) : headerRowNumber.Value - 1;
        if (headerIndex < 0 || headerIndex >= sheet.Rows.Count)
            throw new InvalidDataException("The selected header row is outside the worksheet.");
        var headers = sheet.Rows[headerIndex].Select((value, index) => new { Column = index + 1, Value = value.Trim() })
            .Where(x => !string.IsNullOrWhiteSpace(x.Value))
            .ToDictionary(x => x.Column, x => x.Value);
        var columns = ResolveColumns(headers, configuredMapping);
        EnsureRequiredColumns(columns);

        var output = new List<NormalizedImportRow>();
        for (var index = headerIndex + 1; index < sheet.Rows.Count; index++)
        {
            var values = sheet.Rows[index];
            string Text(string field) => columns.TryGetValue(field, out var column) && column <= values.Count
                ? values[column - 1].Trim()
                : string.Empty;
            DateOnly? Date(string field) => ParseNullableDate(Text(field));
            decimal Number(string field) => ParseNumber(Text(field));
            if (string.IsNullOrWhiteSpace(Text("GRNNumber")) && string.IsNullOrWhiteSpace(Text("MaterialNumber"))) continue;
            output.Add(CreateRow(index + 1, Text, Date, Number));
        }

        if (output.Count == 0) throw new InvalidDataException($"Worksheet '{sheet.Name}' does not contain any material rows below row {headerIndex + 1}.");
        return output;
    }

    public static Dictionary<string, string> SuggestMapping(
        IReadOnlyList<string> headers,
        IReadOnlyDictionary<string, string>? configuredMapping = null)
    {
        configuredMapping ??= new Dictionary<string, string>();
        var indexed = headers.Select((value, index) => new { Column = index + 1, Value = value.Trim() })
            .Where(x => !string.IsNullOrWhiteSpace(x.Value))
            .ToDictionary(x => x.Column, x => x.Value);
        var resolved = ResolveColumns(indexed, configuredMapping);
        var mapping = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (field, column) in resolved)
            if (indexed.TryGetValue(column, out var header)) mapping[header] = field;
        return mapping;
    }

    public static bool HasRequiredFields(IReadOnlyDictionary<string, string> mapping) =>
        RequiredFields.All(field => mapping.Values.Contains(field, StringComparer.OrdinalIgnoreCase));

    public static string NormalizeHeader(string value) => new(value
        .Where(char.IsLetterOrDigit)
        .Select(char.ToLowerInvariant)
        .ToArray());

    private static int FindFirstUsedRow(IReadOnlyList<IReadOnlyList<string>> rows)
    {
        for (var index = 0; index < rows.Count; index++)
            if (rows[index].Any(value => !string.IsNullOrWhiteSpace(value))) return index;
        return -1;
    }

    private static NormalizedImportRow CreateRow(
        int rowNumber,
        Func<string, string> text,
        Func<string, DateOnly?> date,
        Func<string, decimal> number)
    {
        var expectedLabels = number("ExpectedLabelCount");
        return new NormalizedImportRow(
            rowNumber, text("GRNNumber"), date("GRNDate") ?? default, text("SAPLineItemNumber"),
            text("MaterialNumber").ToUpperInvariant(), text("MaterialDescription"), number("ReceivedQuantity"),
            number("PackingStandard"), text("BatchNumber"), text("UOM"), text("Plant"),
            text("StorageLocation"), text("PurchaseOrder"), text("VendorCode"), text("VendorName"),
            text("InvoiceNumber"), date("InvoiceDate"), text("BinLocation"), date("ManufacturingDate"),
            date("ExpiryDate"), expectedLabels > 0 && expectedLabels <= int.MaxValue
                ? decimal.ToInt32(decimal.Truncate(expectedLabels)) : null);
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
            throw new InvalidDataException($"Required columns could not be identified: {string.Join(", ", missing)}. Select the header row and map the missing columns.");
    }

    private static IReadOnlyList<ImportFieldDefinition> BuildFieldDefinitions() =>
    [
        Field("GRNNumber", "GRN Number", true, "GRN No", "GR No", "GR Number", "Goods Receipt No", "Goods Receipt Number"),
        Field("GRNDate", "GRN Date", true, "GR Date", "Gr date", "Goods Receipt Date"),
        Field("SAPLineItemNumber", "SAP Line Item", false, "Line Item", "Item", "Item No", "SAP Line Item"),
        Field("MaterialNumber", "Material Number", true, "Material", "Material No", "Material Code", "Part No", "Part Number", "Parts Number"),
        Field("MaterialDescription", "Material Description", false, "Material Desc", "Description", "Part Description"),
        Field("ReceivedQuantity", "Received Quantity", true, "Quantity", "Qty", "Received Qty", "GR Quantity"),
        Field("PackingStandard", "Packing Standard", false, "Pack Qty", "Packing Qty", "Pack Quantity", "Standard Pack Qty"),
        Field("BatchNumber", "Batch Number", false, "Batch", "Batch No", "Lot", "Lot No"),
        Field("UOM", "UOM", false, "Unit", "Unit of Measure"),
        Field("Plant", "Plant", false, "Plant Code"),
        Field("StorageLocation", "Storage Location", false, "Storage Loc", "SLoc"),
        Field("PurchaseOrder", "Purchase Order", false, "PO", "PO Number", "Purchase Order No"),
        Field("VendorCode", "Vendor Code", false, "Vendor", "SAP Vendor Code", "Supplier Code"),
        Field("VendorName", "Vendor Name", false, "Supplier Name", "Sup Name", "Supplier"),
        Field("InvoiceNumber", "Invoice Number", false, "Invoice No", "Invo No", "Inv No"),
        Field("InvoiceDate", "Invoice Date", false, "Inv Date"),
        Field("BinLocation", "Bin Location", false, "Bin", "Bin Loc"),
        Field("ManufacturingDate", "Manufacturing Date", false, "Mfg Date", "MFD", "MFD Date"),
        Field("ExpiryDate", "Expiry Date", false, "Exp Date", "Expiration Date"),
        Field("ExpectedLabelCount", "Expected Label Count", false, "No of Labels to print", "Labels to Print", "Label Count", "No of Labels")
    ];

    private static ImportFieldDefinition Field(string key, string label, bool required, params string[] aliases) =>
        new(key, label, required, new[] { key, label }.Concat(aliases).Distinct(StringComparer.OrdinalIgnoreCase).ToArray());

    private static IReadOnlyDictionary<string, string> BuildAliases(IEnumerable<ImportFieldDefinition> definitions)
    {
        var aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in definitions)
            foreach (var alias in field.Aliases) aliases[NormalizeHeader(alias)] = field.Key;
        return aliases;
    }

    private static DateOnly? ParseNullableDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        string[] formats =
        [
            "dd.MM.yyyy", "d.M.yyyy", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy",
            "yyyy-MM-dd", "yyyy-MM-dd HH:mm:ss", "yyyy/MM/dd", "MM/dd/yyyy", "M/d/yyyy", "dd.MM.yy", "d.M.yy"
        ];
        if (DateOnly.TryParseExact(trimmed, formats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var exact)) return exact;
        if (DateOnly.TryParse(trimmed, CultureInfo.GetCultureInfo("en-IN"), DateTimeStyles.AllowWhiteSpaces, out var indian)) return indian;
        return null;
    }

    private static decimal ParseNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        var trimmed = value.Trim().Replace("\u00a0", string.Empty).Replace(" ", string.Empty);
        if (decimal.TryParse(trimmed, NumberStyles.Number | NumberStyles.AllowExponent, CultureInfo.InvariantCulture, out var number)) return number;
        if (decimal.TryParse(trimmed, NumberStyles.Number | NumberStyles.AllowExponent, CultureInfo.GetCultureInfo("en-IN"), out number)) return number;
        return 0;
    }
}

public sealed record ImportFieldDefinition(string Key, string Label, bool Required, IReadOnlyList<string> Aliases);

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
