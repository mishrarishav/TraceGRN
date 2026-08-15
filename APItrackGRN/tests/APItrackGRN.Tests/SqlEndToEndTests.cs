using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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
    public async Task Import_inward_issue_and_printer_simulation_persist_to_sql_server()
    {
        using var client = await factory.CreateAuthenticatedClient();
        var identity = $"E2E{Guid.NewGuid():N}"[..14].ToUpperInvariant();
        var imported = await ImportAndCommit(client, identity, 1000m, 1000m);

        var labels = await client.GetFromJsonAsync<List<LabelDto>>($"/api/labels?grn={imported.GrnNumber}");
        var label = Assert.Single(labels!);
        Assert.Equal("Generated", label.Status);

        var print = await client.PostAsJsonAsync($"/api/labels/{label.LabelUid}/print", new { reason = "SQL integration test" });
        Assert.Equal(HttpStatusCode.OK, print.StatusCode);
        var printResult = await print.Content.ReadFromJsonAsync<PrintDto>();
        Assert.True(printResult!.Simulated);

        var inward = await client.PostAsJsonAsync("/api/inward", new
        {
            labelUid = label.LabelUid,
            stationCode = "STORE-INWARD-01",
            deviceId = "SQL-TEST-SCANNER"
        });
        Assert.Equal(HttpStatusCode.OK, inward.StatusCode);

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
        Assert.True(await db.AuditLogs.CountAsync(x => x.EntityId == label.LabelUid) >= 3);
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

    private static async Task<ImportedRow> ImportAndCommit(HttpClient client, string identity, decimal quantity, decimal packing)
    {
        var grn = $"9{DateTime.UtcNow.Ticks.ToString()[^9..]}";
        var material = $"M-{identity}";
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
    private sealed record PrintDto(bool Simulated);
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
