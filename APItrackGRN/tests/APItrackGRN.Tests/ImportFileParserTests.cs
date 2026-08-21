using System.Text;
using APItrackGRN.Api.Services;
using ClosedXML.Excel;

namespace APItrackGRN.Tests;

public sealed class ImportFileParserTests
{
    private static readonly Dictionary<string, string> EmptyMapping = [];

    [Fact]
    public void Parses_business_csv_headers_dates_and_grouped_quantity()
    {
        var csv = string.Join('\n',
            "Gr No,Gr date,Material,Material Description,Quantity,UOM,Vendor,Invo No,Inv Date,Sup Name,Bin loc,Mfg date,Exp Date,Pack Qty,No of Labels to print",
            "5000515455,03.08.2025,MT0A1P064,RESERVE TUBE (FINISHED),\"1,000\",PC,1094852,2526KG0208,02.08.2025,Kumar Automates,210,01.08.2025,01.08.2027,200,5");

        var row = Assert.Single(ImportFileParser.Parse(Encoding.UTF8.GetBytes(csv), ".csv", EmptyMapping));

        Assert.Equal("5000515455", row.GrnNumber);
        Assert.Equal(new DateOnly(2025, 8, 3), row.GrnDate);
        Assert.Equal(1000m, row.ReceivedQuantity);
        Assert.Equal("1094852", row.VendorCode);
        Assert.Equal("2526KG0208", row.InvoiceNumber);
        Assert.Equal(new DateOnly(2025, 8, 2), row.InvoiceDate);
        Assert.Equal("210", row.BinLocation);
        Assert.Equal(new DateOnly(2025, 8, 1), row.ManufacturingDate);
        Assert.Equal(new DateOnly(2027, 8, 1), row.ExpiryDate);
        Assert.Equal(200m, row.PackingStandard);
        Assert.Equal(5, row.ExpectedLabelCount);
    }

    [Fact]
    public void Parses_tab_separated_content_even_with_csv_extension()
    {
        var tsv = string.Join('\n',
            "Gr No\tGr date\tMaterial\tMaterial Description\tQuantity\tPack Qty",
            "5000515456\t04.08.2025\tM06901275\tUPPER SPRING PAD-TOP MOUNT\t1,200\t200");

        var row = Assert.Single(ImportFileParser.Parse(Encoding.UTF8.GetBytes(tsv), ".csv", EmptyMapping));

        Assert.Equal("M06901275", row.MaterialNumber);
        Assert.Equal(1200m, row.ReceivedQuantity);
        Assert.Equal(200m, row.PackingStandard);
    }

    [Fact]
    public void Parses_business_headers_from_xlsx()
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Business GRN");
        string[] headers = ["Gr No", "Gr date", "Material", "Material Description", "Quantity", "Pack Qty"];
        for (var index = 0; index < headers.Length; index++) sheet.Cell(1, index + 1).Value = headers[index];
        sheet.Cell(2, 1).Value = "5000515457";
        sheet.Cell(2, 2).Value = new DateTime(2025, 8, 5);
        sheet.Cell(2, 3).Value = "M06901284";
        sheet.Cell(2, 4).Value = "BUMPER CAP";
        sheet.Cell(2, 5).Value = 480m;
        sheet.Cell(2, 6).Value = 240m;
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        var row = Assert.Single(ImportFileParser.Parse(stream.ToArray(), ".xlsx", EmptyMapping));

        Assert.Equal(new DateOnly(2025, 8, 5), row.GrnDate);
        Assert.Equal("M06901284", row.MaterialNumber);
        Assert.Equal(480m, row.ReceivedQuantity);
        Assert.Equal(240m, row.PackingStandard);
    }

    [Fact]
    public void Parses_selected_sheet_header_row_and_custom_aliases()
    {
        using var workbook = new XLWorkbook();
        workbook.AddWorksheet("Instructions").Cell(1, 1).Value = "Do not import this sheet";
        var sheet = workbook.AddWorksheet("Plant GRN Data");
        sheet.Cell(1, 1).Value = "Generated report";
        sheet.Cell(2, 1).Value = "Receipt ID";
        sheet.Cell(2, 2).Value = "Receipt On";
        sheet.Cell(2, 3).Value = "Part Code X";
        sheet.Cell(2, 4).Value = "Accepted Qty";
        sheet.Cell(3, 1).Value = "5000515999";
        sheet.Cell(3, 2).Value = new DateTime(2026, 8, 21);
        sheet.Cell(3, 3).Value = "M06030952";
        sheet.Cell(3, 4).Value = 750m;
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        var mapping = new Dictionary<string, string>
        {
            ["Receipt ID"] = "GRNNumber",
            ["Receipt On"] = "GRNDate",
            ["Part Code X"] = "MaterialNumber",
            ["Accepted Qty"] = "ReceivedQuantity"
        };

        var row = Assert.Single(ImportFileParser.Parse(
            stream.ToArray(), ".xlsx", mapping, "Plant GRN Data", 2));

        Assert.Equal("5000515999", row.GrnNumber);
        Assert.Equal(new DateOnly(2026, 8, 21), row.GrnDate);
        Assert.Equal("M06030952", row.MaterialNumber);
        Assert.Equal(750m, row.ReceivedQuantity);
        Assert.Equal(3, row.ExcelRowNumber);
    }
}
