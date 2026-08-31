using APItrackGRN.Api.Services;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace APItrackGRN.Tests;

public sealed class LabelPrinterTests
{
    [Fact]
    public void Discovery_candidates_are_bounded_to_the_local_subnet_and_exclude_the_api_host()
    {
        var candidates = PrinterDiscoveryService.CandidateAddresses(
            IPAddress.Parse("192.168.1.3"),
            IPAddress.Parse("255.255.255.0"));

        Assert.Equal(253, candidates.Count);
        Assert.Contains(IPAddress.Parse("192.168.1.1"), candidates);
        Assert.Contains(IPAddress.Parse("192.168.1.254"), candidates);
        Assert.DoesNotContain(IPAddress.Parse("192.168.1.3"), candidates);
        Assert.DoesNotContain(IPAddress.Parse("192.168.1.0"), candidates);
        Assert.DoesNotContain(IPAddress.Parse("192.168.1.255"), candidates);
    }

    [Fact]
    public async Task Simulation_builds_zebra_203dpi_zpl_without_hardware()
    {
        var printer = new LabelPrinter(Options.Create(new PrinterOptions
        {
            Mode = "Simulation",
            PrinterName = "ZDesigner ZD230-203dpi ZPL",
            Dpi = 203
        }), NullLogger<LabelPrinter>.Instance);

        var result = await printer.PrintAsync(new LabelPrintJob(
            "TEST-TRACKGRN-001", "M06030952", "COMPRESSION BUMPER", "5000515455",
            "TEST-BATCH", 200m, "PC", 1, 5,
            "GRN Number: 5000515455\nMaterial: M06030952\nLabel ID: TEST-TRACKGRN-001"), CancellationToken.None);

        Assert.True(result.Simulated);
        Assert.Equal("ZDesigner ZD230-203dpi ZPL", result.Printer);
        Assert.Contains("^PW812^LL609", result.Payload);
        Assert.Contains("^FDTRACKGRN - MATERIAL LABEL^FS", result.Payload);
        Assert.Contains("^BQN,2,7", result.Payload);
        Assert.Contains("GRN Number: 5000515455\\0AMaterial: M06030952", result.Payload);
        Assert.Contains("^FDPACK: 1 OF 5^FS", result.Payload);
        Assert.Contains("SANAND PLANT", result.Payload);
        Assert.EndsWith("^XZ", result.Payload);
    }

    [Fact]
    public async Task Local_agent_sends_authenticated_zpl_to_the_selected_windows_queue()
    {
        var portProbe = new TcpListener(IPAddress.Loopback, 0);
        portProbe.Start();
        var port = ((IPEndPoint)portProbe.LocalEndpoint).Port;
        portProbe.Stop();

        using var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        string? receivedKey = null;
        string? receivedPrinter = null;
        string? receivedZpl = null;
        var requestReceived = Task.Run(async () =>
        {
            var context = await listener.GetContextAsync();
            try
            {
                receivedKey = context.Request.Headers[LocalPrintAgentProtocol.HeaderName];
                using var document = await JsonDocument.ParseAsync(context.Request.InputStream);
                receivedPrinter = document.RootElement.GetProperty("printerName").GetString();
                receivedZpl = document.RootElement.GetProperty("zpl").GetString();
                context.Response.StatusCode = 200;
            }
            finally
            {
                context.Response.Close();
            }
        });

        var printer = new LabelPrinter(Options.Create(new PrinterOptions
        {
            Mode = "LocalAgent",
            PrinterName = "ZDesigner ZD230-203dpi ZPL",
            Host = "127.0.0.1",
            Port = port,
            Dpi = 203,
            ConnectionTimeoutSeconds = 3
        }), NullLogger<LabelPrinter>.Instance);

        var result = await printer.PrintAsync(new LabelPrintJob(
            "LOCAL-AGENT-001", "M06030952", "LOCAL AGENT TEST", "5000515455",
            "TEST-BATCH", 200m, "PC", 1, 1), CancellationToken.None);

        await requestReceived.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.Equal(LocalPrintAgentProtocol.DefaultKey, receivedKey);
        Assert.Equal("ZDesigner ZD230-203dpi ZPL", receivedPrinter);
        Assert.DoesNotContain("^FDUID:", receivedZpl);
        Assert.Contains("^FDLA,LOCAL-AGENT-001^FS", receivedZpl);
        Assert.False(result.Simulated);
        Assert.Equal("LocalAgent", result.Mode);
        Assert.Equal("ZDesigner ZD230-203dpi ZPL", result.Printer);
    }
}
