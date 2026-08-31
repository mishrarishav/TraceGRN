using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using APItrackGRN.Infrastructure.Seeding;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace APItrackGRN.Tests;

[CollectionDefinition("SQL Server integration", DisableParallelization = true)]
public sealed class SqlServerIntegrationCollection;

[Collection("SQL Server integration")]
public sealed class SqlEndToEndTests(SqlTrackGrnFactory factory) : IClassFixture<SqlTrackGrnFactory>
{
    [Fact]
    public async Task Admin_can_reset_user_password_and_revoke_existing_refresh_session()
    {
        using var adminClient = await factory.CreateAuthenticatedClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var username = $"reset-{suffix}";
        const string oldPassword = "Old-Password-2026!";
        const string newPassword = "New-Password-2026!";
        var create = await adminClient.PostAsJsonAsync("/api/users", new
        {
            name = "Password Reset Test", employeeCode = $"RST-{suffix}", username,
            role = "Viewer", password = oldPassword, isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var userId = (await create.Content.ReadFromJsonAsync<IdDto>())!.Id;

        using var anonymous = factory.CreateClient();
        var oldLogin = await anonymous.PostAsJsonAsync("/api/auth/login", new { username, password = oldPassword });
        Assert.Equal(HttpStatusCode.OK, oldLogin.StatusCode);
        using var oldSession = JsonDocument.Parse(await oldLogin.Content.ReadAsStringAsync());
        var oldRefreshToken = oldSession.RootElement.GetProperty("refreshToken").GetString();

        var reset = await adminClient.PostAsJsonAsync($"/api/users/{userId}/reset-password", new
        {
            newPassword, confirmPassword = newPassword
        });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        using var resetJson = JsonDocument.Parse(await reset.Content.ReadAsStringAsync());
        Assert.Equal(1, resetJson.RootElement.GetProperty("revokedSessions").GetInt32());

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/auth/login", new { username, password = oldPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await anonymous.PostAsJsonAsync("/api/auth/login", new { username, password = newPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = oldRefreshToken })).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "UserPasswordReset" && x.EntityId == userId.ToString()));
    }

    [Fact]
    public async Task Saved_import_profile_recognizes_sheet_and_custom_column_aliases()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        using var workbook = new XLWorkbook();
        workbook.AddWorksheet("Read me").Cell(1, 1).Value = "Instructions";
        var data = workbook.AddWorksheet("Plant Custom Data");
        data.Cell(1, 1).Value = "Generated report";
        string[] headers = ["Receipt ID", "Receipt On", "Part Code X", "Accepted Qty"];
        for (var index = 0; index < headers.Length; index++) data.Cell(2, index + 1).Value = headers[index];
        data.Cell(3, 1).Value = $"91{DateTime.UtcNow.Ticks.ToString()[^8..]}";
        data.Cell(3, 2).Value = new DateTime(2026, 8, 21);
        data.Cell(3, 3).Value = "M06030952";
        data.Cell(3, 4).Value = 500m;
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        var bytes = stream.ToArray();

        var profileName = $"Custom plant format {suffix}";
        var save = await client.PostAsJsonAsync("/api/imports/profiles", new
        {
            templateId = (Guid?)null,
            name = profileName,
            fileName = $"plant-{suffix}.xlsx",
            sheetName = "Plant Custom Data",
            headerRowNumber = 2,
            mapping = new Dictionary<string, string>
            {
                ["Receipt ID"] = "GRNNumber", ["Receipt On"] = "GRNDate",
                ["Part Code X"] = "MaterialNumber", ["Accepted Qty"] = "ReceivedQuantity"
            },
            headers
        });
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        using var inspectForm = new MultipartFormDataContent();
        using var inspectFile = new ByteArrayContent(bytes);
        inspectFile.Headers.ContentType = MediaTypeHeaderValue.Parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        inspectForm.Add(inspectFile, "file", $"plant-{suffix}.xlsx");
        var inspect = await client.PostAsync("/api/imports/inspect", inspectForm);
        Assert.True(inspect.IsSuccessStatusCode, await inspect.Content.ReadAsStringAsync());
        using var inspected = JsonDocument.Parse(await inspect.Content.ReadAsStringAsync());
        Assert.Equal("Plant Custom Data", inspected.RootElement.GetProperty("selectedSheetName").GetString());
        Assert.Equal(2, inspected.RootElement.GetProperty("selectedHeaderRow").GetInt32());
        Assert.Equal(profileName, inspected.RootElement.GetProperty("matchedTemplate").GetProperty("name").GetString());
        Assert.True(inspected.RootElement.GetProperty("readyForImport").GetBoolean());
        Assert.Equal(2, inspected.RootElement.GetProperty("sheets").GetArrayLength());
    }

    [Fact]
    public async Task Import_print_as_inward_and_issue_persist_to_sql_server()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var identity = $"E2E{Guid.NewGuid():N}"[..14].ToUpperInvariant();
        var imported = await ImportAndCommit(client, identity, 1000m, 1000m);

        var labels = await client.GetFromJsonAsync<List<LabelDto>>($"/api/labels?grn={imported.GrnNumber}");
        var label = Assert.Single(labels!);
        Assert.Equal("Generated", label.Status);
        using var beforePrintTrace = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/traceability?q={Uri.EscapeDataString(label.LabelUid)}"));
        var beforePrintTitles = beforePrintTrace.RootElement.GetProperty("steps").EnumerateArray()
            .Select(step => step.GetProperty("title").GetString()).ToList();
        Assert.Contains("Label Generated", beforePrintTitles);
        Assert.DoesNotContain("Label Generated & Printed", beforePrintTitles);

        var print = await client.PostAsJsonAsync($"/api/labels/{label.LabelUid}/print", new { reason = "SQL integration test" });
        Assert.Equal(HttpStatusCode.OK, print.StatusCode);
        var printResult = await print.Content.ReadFromJsonAsync<PrintDto>();
        Assert.True(printResult!.Simulated);
        Assert.Equal("Inwarded", printResult.Status);
        using var afterPrintTrace = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/traceability?q={Uri.EscapeDataString(label.LabelUid)}"));
        var afterPrintTitles = afterPrintTrace.RootElement.GetProperty("steps").EnumerateArray()
            .Select(step => step.GetProperty("title").GetString()).ToList();
        Assert.Contains("Label Generated & Printed", afterPrintTitles);
        Assert.DoesNotContain("Label Generated", afterPrintTitles);
        Assert.DoesNotContain("Label Printed", afterPrintTitles);

        var issue = await client.PostAsJsonAsync("/api/issues", new
        {
            labelUid = label.LabelUid,
            stationCode = "STORE-EXIT-01",
            deviceId = "SQL-TEST-SCANNER"
        });
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var stored = await db.MaterialLabels.AsNoTracking().SingleAsync(x => x.LabelUid == label.LabelUid);
        Assert.Equal(LabelStatus.Issued, stored.LabelStatus);
        Assert.Equal(1, stored.PrintCount);
        Assert.Equal(1, await db.MaterialTransactions.CountAsync(x => x.LabelId == stored.Id && x.TransactionType == TransactionType.Issue));
        Assert.True(await db.AuditLogs.CountAsync(x => x.EntityId == label.LabelUid) >= 2);
    }

    [Fact]
    public async Task Standalone_printer_test_dispatches_without_creating_a_material_label()
    {
        using var client = await factory.CreateAuthenticatedClient();
        await using var beforeScope = factory.Services.CreateAsyncScope();
        var beforeDb = beforeScope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var labelCountBefore = await beforeDb.MaterialLabels.CountAsync();

        var response = await client.PostAsync("/api/configuration/printer/test", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(responseJson.RootElement.GetProperty("ok").GetBoolean());
        Assert.True(responseJson.RootElement.GetProperty("simulated").GetBoolean());
        Assert.Equal("SQL Test Printer", responseJson.RootElement.GetProperty("printer").GetString());
        Assert.StartsWith("TEST-", responseJson.RootElement.GetProperty("labelUid").GetString());

        await using var afterScope = factory.Services.CreateAsyncScope();
        var afterDb = afterScope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        Assert.Equal(labelCountBefore, await afterDb.MaterialLabels.CountAsync());
        Assert.True(await afterDb.AuditLogs.AnyAsync(x => x.Action == "PrinterTestDispatched"));
    }

    [Fact]
    public async Task Printer_configuration_is_tested_then_persisted_in_sql_server()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var missingHost = await client.PostAsJsonAsync("/api/configuration/printer/configure-and-test", new
        {
            mode = "RawTcp",
            printerName = "Network Zebra",
            host = "",
            port = 9100,
            dpi = 203,
            connectionTimeoutSeconds = 5
        });
        Assert.Equal(HttpStatusCode.BadRequest, missingHost.StatusCode);

        var configure = await client.PostAsJsonAsync("/api/configuration/printer/configure-and-test", new
        {
            mode = "Simulation",
            printerName = "SQL Test Printer",
            host = (string?)null,
            port = 9100,
            dpi = 203,
            connectionTimeoutSeconds = 5
        });
        Assert.Equal(HttpStatusCode.OK, configure.StatusCode);
        using var result = JsonDocument.Parse(await configure.Content.ReadAsStringAsync());
        Assert.True(result.RootElement.GetProperty("saved").GetBoolean());
        Assert.True(result.RootElement.GetProperty("simulated").GetBoolean());

        var configuration = await client.GetFromJsonAsync<JsonElement>("/api/configuration");
        var printing = configuration.GetProperty("printing");
        Assert.Equal("Simulation", printing.GetProperty("mode").GetString());
        Assert.Equal("SQL Test Printer", printing.GetProperty("printerName").GetString());

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        Assert.True(await db.ApplicationSettings.AnyAsync(x => x.Key == "PrinterConfiguration"));
        Assert.True(await db.AuditLogs.AnyAsync(x => x.Action == "PrinterConfigured"));
    }

    [Fact]
    public async Task Public_branding_returns_the_sql_backed_client_name_and_logo_without_login()
    {
        const string logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
            var setting = await db.ApplicationSettings.SingleAsync(x => x.Key == "PlantConfiguration");
            setting.ValueJson = JsonSerializer.Serialize(new
            {
                DefaultPlant = "1000",
                DefaultStorageLocation = "RM01",
                TimeZone = "Asia/Kolkata",
                ClientName = "Test Client Industries",
                ClientLogoDataUrl = logo
            });
            await db.SaveChangesAsync();
        }

        using var anonymousClient = factory.CreateClient();
        var response = await anonymousClient.GetAsync("/api/system/branding");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var branding = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("TrackGRN", branding.GetProperty("appName").GetString());
        Assert.Equal("1.1.2", branding.GetProperty("version").GetString());
        Assert.Equal("Test Client Industries", branding.GetProperty("clientName").GetString());
        Assert.Equal(logo, branding.GetProperty("clientLogoDataUrl").GetString());
    }

    [Fact]
    public async Task Concurrent_double_issue_allows_exactly_one_transaction()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var identity = $"RACE{Guid.NewGuid():N}"[..14].ToUpperInvariant();
        var imported = await ImportAndCommit(client, identity, 500m, 500m);
        var label = (await client.GetFromJsonAsync<List<LabelDto>>($"/api/labels?grn={imported.GrnNumber}"))!.Single();
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/inward", new { labelUid = label.LabelUid, stationCode = "STORE-INWARD-01" })).StatusCode);

        var payload = new { labelUid = label.LabelUid, stationCode = "STORE-EXIT-01", deviceId = "RACE-TEST" };
        var results = await Task.WhenAll(
            client.PostAsJsonAsync("/api/issues", payload),
            client.PostAsJsonAsync("/api/issues", payload));
        Assert.Equal(1, results.Count(x => x.StatusCode == HttpStatusCode.OK));
        Assert.Equal(1, results.Count(x => x.StatusCode == HttpStatusCode.Conflict));

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        Assert.Equal(1, await db.MaterialTransactions.CountAsync(
            x => x.Label.LabelUid == label.LabelUid && x.TransactionType == TransactionType.Issue));
    }

    [Fact]
    public async Task Revision_below_issued_quantity_is_rejected_without_changing_the_grn_line()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var identity = $"REV{Guid.NewGuid():N}"[..14].ToUpperInvariant();
        var imported = await ImportAndCommit(client, identity, 1000m, 1000m);
        var label = (await client.GetFromJsonAsync<List<LabelDto>>($"/api/labels?grn={imported.GrnNumber}"))!.Single();
        await client.PostAsJsonAsync("/api/inward", new { labelUid = label.LabelUid, stationCode = "STORE-INWARD-01" });
        await client.PostAsJsonAsync("/api/issues", new { labelUid = label.LabelUid, stationCode = "STORE-EXIT-01" });

        var revision = Workbook(imported.GrnNumber, imported.MaterialNumber, identity, 500m, 1000m);
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(revision);
        file.Headers.ContentType = MediaTypeHeaderValue.Parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        form.Add(file, "file", $"revision-{identity}.xlsx");
        var previewResponse = await client.PostAsync("/api/imports/preview", form);
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        using var previewJson = JsonDocument.Parse(await previewResponse.Content.ReadAsStringAsync());
        Assert.Equal("Rejected", previewJson.RootElement.GetProperty("rows")[0].GetProperty("status").GetString());
        Assert.Contains("issued quantity", previewJson.RootElement.GetProperty("rows")[0].GetProperty("reason").GetString());

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var quantity = await db.GrnLines.Where(x => x.GrnHeader.GrnNumber == imported.GrnNumber)
            .Select(x => x.ReceivedQuantity).SingleAsync();
        Assert.Equal(1000m, quantity);
    }

    [Fact]
    public async Task Material_master_create_update_and_deactivate_are_audited()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var number = $"MAT-{Guid.NewGuid():N}"[..16].ToUpperInvariant();
        var create = await client.PostAsJsonAsync("/api/materials", new
        {
            materialNumber = number, description = "Integration material", uom = "PCS",
            packingStandard = 25m, isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var id = (await create.Content.ReadFromJsonAsync<IdDto>())!.Id;
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/materials/{id}", new
        {
            materialNumber = number, description = "Updated integration material", uom = "BOX",
            packingStandard = 10m, isActive = true
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/materials/{id}")).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var material = await db.Materials.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal("Updated integration material", material.Description);
        Assert.Equal("BOX", material.Uom);
        Assert.False(material.IsActive);
        Assert.Equal(3, await db.AuditLogs.CountAsync(x => x.EntityName == "Material" && x.EntityId == id.ToString()));
    }

    [Fact]
    public async Task Business_csv_uses_material_master_pack_quantity_for_label_count()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var grn = $"7{DateTime.UtcNow.Ticks.ToString()[^9..]}";
        var content = string.Join('\n',
            "Gr No,Gr date,Material,Material Description,Quantity,UOM,Vendor,Invo No,Inv Date,Sup Name,Bin loc,Mfg date,Exp Date,Pack Qty,No of Labels to print",
            $"{grn},03.08.2025,M06030952,COMPRESSION BUMPER,\"1,000\",PC,1094852,2526KG0208,02.08.2025,Kumar Automates,210,01.08.2025,01.08.2027,333,5");
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(Encoding.UTF8.GetBytes(content));
        file.Headers.ContentType = MediaTypeHeaderValue.Parse("text/csv");
        form.Add(file, "file", $"business-{grn}.csv");

        var previewResponse = await client.PostAsync("/api/imports/preview", form);
        Assert.True(previewResponse.StatusCode == HttpStatusCode.OK, await previewResponse.Content.ReadAsStringAsync());
        using var previewJson = JsonDocument.Parse(await previewResponse.Content.ReadAsStringAsync());
        var previewRow = previewJson.RootElement.GetProperty("rows")[0];
        Assert.Equal("Warning", previewRow.GetProperty("status").GetString());
        Assert.Contains("Material master pack quantity 200 overrides source pack quantity 333",
            previewRow.GetProperty("reason").GetString());
        Assert.Equal(1000m, previewRow.GetProperty("quantity").GetDecimal());
        Assert.Equal("1094852", previewRow.GetProperty("vendorCode").GetString());
        Assert.Equal("2526KG0208", previewRow.GetProperty("invoiceNumber").GetString());
        Assert.Equal("210", previewRow.GetProperty("binLocation").GetString());
        Assert.Equal(200m, previewRow.GetProperty("packingStandard").GetDecimal());
        Assert.Equal(5, previewRow.GetProperty("expectedLabelCount").GetInt32());

        var batchId = previewJson.RootElement.GetProperty("batch").GetProperty("batchId").GetString();
        var commit = await client.PostAsync($"/api/imports/{batchId}/commit", null);
        Assert.True(commit.StatusCode == HttpStatusCode.OK, await commit.Content.ReadAsStringAsync());

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var header = await db.GrnHeaders.AsNoTracking().Include(x => x.Vendor)
            .SingleAsync(x => x.GrnNumber == grn);
        Assert.Equal(new DateOnly(2025, 8, 3), header.GrnDate);
        Assert.Equal("1094852", header.Vendor!.VendorCode);
        Assert.Equal("2526KG0208", header.InvoiceNumber);
        Assert.Equal(new DateOnly(2025, 8, 2), header.InvoiceDate);
        var line = await db.GrnLines.AsNoTracking().Include(x => x.Labels)
            .SingleAsync(x => x.GrnHeaderId == header.Id);
        Assert.Equal("210", line.BinLocation);
        Assert.Equal(new DateOnly(2025, 8, 1), line.ManufacturingDate);
        Assert.Equal(new DateOnly(2027, 8, 1), line.ExpiryDate);
        Assert.Equal(200m, line.PackingStandard);
        Assert.Equal(5, line.ExpectedLabelCount);
        Assert.Equal(5, line.Labels.Count);
        Assert.All(line.Labels, label => Assert.Equal(200m, label.LabelQuantity));
    }

    [Fact]
    public async Task Material_master_pack_update_resplits_unprinted_labels()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var identity = $"PACK{Guid.NewGuid():N}"[..14].ToUpperInvariant();
        var materialNumber = $"M-{identity}";
        var create = await client.PostAsJsonAsync("/api/materials", new
        {
            materialNumber,
            description = $"Pack change {identity}",
            uom = "PCS",
            packingStandard = 100m,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var materialId = (await create.Content.ReadFromJsonAsync<IdDto>())!.Id;

        var imported = await ImportAndCommit(client, identity, 1_000m, 333m, materialNumber);
        var before = await client.GetFromJsonAsync<List<LabelDto>>($"/api/labels?grn={imported.GrnNumber}");
        Assert.Equal(10, before!.Count);

        var update = await client.PutAsJsonAsync($"/api/materials/{materialId}", new
        {
            materialNumber,
            description = $"Pack change {identity}",
            uom = "PCS",
            packingStandard = 200m,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var line = await db.GrnLines.AsNoTracking().Include(x => x.Labels)
            .SingleAsync(x => x.GrnHeader.GrnNumber == imported.GrnNumber);
        var active = line.Labels.Where(x => x.IsActive).OrderBy(x => x.SequenceNumber).ToList();
        Assert.Equal(200m, line.PackingStandard);
        Assert.Equal(5, active.Count);
        Assert.All(active, label => Assert.Equal(200m, label.LabelQuantity));
    }

    [Fact]
    public async Task Business_master_seed_contains_pack_bin_quantity_and_vendor_aliases()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        var material = await db.Materials.AsNoTracking().SingleAsync(x => x.MaterialNumber == "M06081352");
        Assert.Equal(80m, material.DefaultPackingStandard);
        Assert.Equal("519", material.PartNumber);
        Assert.Equal("210", material.DefaultBinLocation);
        Assert.Equal(30240m, material.OpeningQuantity);

        var vendor = await db.Vendors.AsNoTracking().Include(x => x.Aliases)
            .SingleAsync(x => x.VendorCode == "1094021");
        Assert.Equal("KAMAL CED COATERS", vendor.VendorName);
        Assert.Contains(vendor.Aliases, alias => alias.AliasName == "Kamal CED");
    }

    private static async Task<ImportedRow> ImportAndCommit(HttpClient client, string identity,
        decimal quantity, decimal packing, string? materialNumber = null)
    {
        var grn = $"9{DateTime.UtcNow.Ticks.ToString()[^9..]}";
        var material = materialNumber ?? $"M-{identity}";
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(Workbook(grn, material, identity, quantity, packing));
        file.Headers.ContentType = MediaTypeHeaderValue.Parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        form.Add(file, "file", $"{identity}.xlsx");
        var previewResponse = await client.PostAsync("/api/imports/preview", form);
        Assert.True(previewResponse.StatusCode == HttpStatusCode.OK, await previewResponse.Content.ReadAsStringAsync());
        using var previewJson = JsonDocument.Parse(await previewResponse.Content.ReadAsStringAsync());
        var batchId = previewJson.RootElement.GetProperty("batch").GetProperty("batchId").GetString();
        var commit = await client.PostAsync($"/api/imports/{batchId}/commit", null);
        Assert.True(commit.StatusCode == HttpStatusCode.OK, await commit.Content.ReadAsStringAsync());
        return new ImportedRow(grn, material);
    }

    private static byte[] Workbook(string grn, string material, string identity, decimal quantity, decimal packing)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("SAP GRN");
        var headers = new[] { "GRN No", "GRN Date", "Line Item", "Material", "Material Desc", "Qty", "Packing Qty", "Batch", "Plant", "PO Number" };
        for (var index = 0; index < headers.Length; index++) sheet.Cell(1, index + 1).Value = headers[index];
        sheet.Cell(2, 1).Value = grn;
        sheet.Cell(2, 2).Value = DateTime.Today;
        sheet.Cell(2, 3).Value = "10";
        sheet.Cell(2, 4).Value = material;
        sheet.Cell(2, 5).Value = $"SQL integration {identity}";
        sheet.Cell(2, 6).Value = quantity;
        sheet.Cell(2, 7).Value = packing;
        sheet.Cell(2, 8).Value = $"B-{identity}";
        sheet.Cell(2, 9).Value = "1000";
        sheet.Cell(2, 10).Value = $"PO-{identity}";
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private sealed record ImportedRow(string GrnNumber, string MaterialNumber);
    private sealed record LabelDto(string LabelUid, string Status);
    private sealed record PrintDto(bool Simulated, string Status);
    private sealed record IdDto(Guid Id);
}

public sealed class SqlTrackGrnFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string ConnectionString =
        "Server=localhost\\SQLEXPRESS;Database=TrackGRN_IntegrationTests;Trusted_Connection=True;TrustServerCertificate=True";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:TrackGRN"] = ConnectionString,
                ["Jwt:Key"] = "TrackGRN-integration-test-signing-key-at-least-32-characters",
                ["Seed:AdminUsername"] = "admin",
                ["Seed:AdminPassword"] = "TrackGRN-Dev-Admin-2026!",
                ["Seed:AdminFullName"] = "Integration Administrator",
                ["Seed:AdminEmployeeCode"] = "TEST-ADMIN",
                ["Printing:Mode"] = "Simulation",
                ["Printing:PrinterName"] = "SQL Test Printer"
            }));
    }

    public async Task InitializeAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TrackGrnDbContext>();
        await db.Database.EnsureDeletedAsync();
        await base.DisposeAsync();
    }

    public async Task<HttpClient> CreateAuthenticatedClient()
    {
        var client = CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "admin", password = "TrackGRN-Dev-Admin-2026!"
        });
        login.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", json.RootElement.GetProperty("accessToken").GetString());
        return client;
    }
}
