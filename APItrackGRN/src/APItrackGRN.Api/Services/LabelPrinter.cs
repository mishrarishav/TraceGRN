using System.ComponentModel;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace APItrackGRN.Api.Services;

public sealed class PrinterOptions
{
    public const string SectionName = "Printing";
    public string Mode { get; init; } = "WindowsSpooler";
    public string PrinterName { get; init; } = "ZDesigner ZD230-203dpi ZPL";
    public string? Host { get; init; }
    public int Port { get; init; } = 9100;
    public int Dpi { get; init; } = 203;
    public int ConnectionTimeoutSeconds { get; init; } = 5;
}

public sealed record LabelPrintJob(
    string LabelUid,
    string MaterialNumber,
    string Description,
    string GrnNumber,
    string BatchNumber,
    decimal Quantity,
    string Uom,
    int SequenceNumber,
    int SequenceTotal,
    string? QrPayload = null);

public sealed record PrintDispatchResult(string Mode, string Printer, bool Simulated, string Payload);

public static class LocalPrintAgentProtocol
{
    public const int DefaultPort = 17891;
    public const string HeaderName = "X-TrackGRN-Agent-Key";
    public const string DefaultKey = "TrackGRN-Plant-PrintAgent-v1-2026";
}

public interface ILabelPrinter
{
    Task<PrinterOptions> GetConfigurationAsync(CancellationToken cancellationToken);
    Task<PrintDispatchResult> PrintAsync(
        LabelPrintJob job,
        CancellationToken cancellationToken,
        PrinterOptions? configurationOverride = null);
}

public sealed class LabelPrinter : ILabelPrinter
{
    private const string PrinterSettingKey = "PrinterConfiguration";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HttpClient AgentHttpClient = new();
    private readonly PrinterOptions _fallback;
    private readonly ILogger<LabelPrinter> _logger;
    private readonly TrackGrnDbContext? _dbContext;

    public LabelPrinter(IOptions<PrinterOptions> options, ILogger<LabelPrinter> logger)
        : this(options, logger, null)
    {
    }

    public LabelPrinter(
        IOptions<PrinterOptions> options,
        ILogger<LabelPrinter> logger,
        TrackGrnDbContext? dbContext)
    {
        _fallback = options.Value;
        _logger = logger;
        _dbContext = dbContext;
    }

    public async Task<PrinterOptions> GetConfigurationAsync(CancellationToken cancellationToken)
    {
        if (_dbContext is null) return _fallback;

        var json = await _dbContext.ApplicationSettings.AsNoTracking()
            .Where(x => x.Key == PrinterSettingKey)
            .Select(x => x.ValueJson)
            .SingleOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return _fallback;

        try
        {
            var configured = JsonSerializer.Deserialize<PrinterOptions>(json, JsonOptions) ?? _fallback;
            if (string.Equals(configured.Mode, "Simulation", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(_fallback.Mode, "Simulation", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(
                    "Ignoring legacy simulation printer configuration; physical printer defaults will be used");
                return _fallback;
            }
            return configured;
        }
        catch (JsonException exception)
        {
            _logger.LogWarning(exception, "Ignoring invalid SQL-backed printer configuration");
            return _fallback;
        }
    }

    public async Task<PrintDispatchResult> PrintAsync(
        LabelPrintJob job,
        CancellationToken cancellationToken,
        PrinterOptions? configurationOverride = null)
    {
        var options = configurationOverride ?? await GetConfigurationAsync(cancellationToken);
        var zpl = BuildZpl(job);
        if (string.Equals(options.Mode, "Simulation", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation("Simulated label print {LabelUid} on {Printer}", job.LabelUid, options.PrinterName);
            return new PrintDispatchResult("Simulation", options.PrinterName, true, zpl);
        }

        if (string.Equals(options.Mode, "WindowsSpooler", StringComparison.OrdinalIgnoreCase))
        {
            WindowsRawPrinter.Send(options.PrinterName, zpl);
            _logger.LogInformation("Sent label {LabelUid} to Windows printer {Printer}", job.LabelUid, options.PrinterName);
            return new PrintDispatchResult("WindowsSpooler", options.PrinterName, false, zpl);
        }

        if (string.Equals(options.Mode, "RawTcp", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.Host))
        {
            using var client = new TcpClient();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.ConnectionTimeoutSeconds, 1, 30)));
            try
            {
                await client.ConnectAsync(options.Host, options.Port, timeout.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                throw new TimeoutException(
                    $"Printer {options.Host}:{options.Port} did not respond within {options.ConnectionTimeoutSeconds} seconds.");
            }
            await using var stream = client.GetStream();
            var bytes = Encoding.UTF8.GetBytes(zpl);
            await stream.WriteAsync(bytes, timeout.Token);
            await stream.FlushAsync(timeout.Token);
            _logger.LogInformation(
                "Sent label {LabelUid} to network printer {Printer} at {Host}:{Port}",
                job.LabelUid,
                options.PrinterName,
                options.Host,
                options.Port);
            return new PrintDispatchResult("RawTcp", options.PrinterName, false, zpl);
        }

        if (string.Equals(options.Mode, "LocalAgent", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.Host)
            && !string.IsNullOrWhiteSpace(options.PrinterName))
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.ConnectionTimeoutSeconds, 1, 30)));
            var endpoint = new UriBuilder(
                Uri.UriSchemeHttp,
                options.Host,
                options.Port,
                "print").Uri;
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.TryAddWithoutValidation(
                LocalPrintAgentProtocol.HeaderName,
                LocalPrintAgentProtocol.DefaultKey);
            request.Content = JsonContent.Create(new
            {
                printerName = options.PrinterName,
                zpl,
                labelUid = job.LabelUid
            });

            HttpResponseMessage response;
            try
            {
                response = await AgentHttpClient.SendAsync(request, timeout.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                throw new TimeoutException(
                    $"Print Agent {options.Host}:{options.Port} did not respond within {options.ConnectionTimeoutSeconds} seconds.");
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                    throw new InvalidOperationException(
                        $"Print Agent {options.Host}:{options.Port} returned {(int)response.StatusCode}. {detail}".Trim());
                }
            }

            _logger.LogInformation(
                "Sent label {LabelUid} through Print Agent {Host}:{Port} to Windows printer {Printer}",
                job.LabelUid,
                options.Host,
                options.Port,
                options.PrinterName);
            return new PrintDispatchResult("LocalAgent", options.PrinterName, false, zpl);
        }

        throw new InvalidOperationException(
            "Printing mode must be Simulation, RawTcp, WindowsSpooler, or LocalAgent; network modes also require a host.");
    }

    private static string BuildZpl(LabelPrintJob job)
    {
        static string Clean(string value) => value.Replace("^", string.Empty).Replace("~", string.Empty);
        static string QrData(string value) => Clean(value)
            .Replace("\\", "\\5C", StringComparison.Ordinal)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace("\n", "\\0A", StringComparison.Ordinal);
        var qrPayload = QrData(job.QrPayload ?? job.LabelUid);
        return $"^XA\n" +
               "^PW812^LL609\n" +
               $"^FO40,35^A0N,36,36^FDTRACKGRN - MATERIAL LABEL^FS\n" +
               $"^FO40,135^A0N,28,28^FDMATERIAL: {Clean(job.MaterialNumber)}^FS\n" +
               $"^FO40,175^A0N,24,24^FD{Clean(job.Description)}^FS\n" +
               $"^FO40,220^A0N,26,26^FDGRN: {Clean(job.GrnNumber)}  BATCH: {Clean(job.BatchNumber)}^FS\n" +
               $"^FO40,265^A0N,30,30^FDQTY: {job.Quantity:0.####} {Clean(job.Uom)}^FS\n" +
               $"^FO40,310^A0N,24,24^FDPACK: {job.SequenceNumber} OF {job.SequenceTotal}^FS\n" +
               $"^FO520,90^BQN,2,7^FH\\^FDLA,{qrPayload}^FS\n" +
               "^FO40,570^A0N,20,20^FDMATERIAL TRACEABILITY SYSTEM - SANAND PLANT^FS\n" +
               "^XZ";
    }
}

internal static class WindowsRawPrinter
{
    public static void Send(string printerName, string payload)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("WindowsSpooler printing requires Windows.");
        if (string.IsNullOrWhiteSpace(printerName))
            throw new InvalidOperationException("Printing:PrinterName must match an installed Windows printer.");
        if (!OpenPrinter(printerName, out var printer, IntPtr.Zero)) ThrowLastError("open printer");
        try
        {
            var document = new DocInfo { DocumentName = "TrackGRN Material Label", DataType = "RAW" };
            if (StartDocPrinter(printer, 1, document) == 0) ThrowLastError("start print document");
            try
            {
                if (!StartPagePrinter(printer)) ThrowLastError("start print page");
                try
                {
                    var bytes = Encoding.UTF8.GetBytes(payload);
                    var buffer = Marshal.AllocCoTaskMem(bytes.Length);
                    try
                    {
                        Marshal.Copy(bytes, 0, buffer, bytes.Length);
                        if (!WritePrinter(printer, buffer, bytes.Length, out var written) || written != bytes.Length)
                            ThrowLastError("write print payload");
                    }
                    finally
                    {
                        Marshal.FreeCoTaskMem(buffer);
                    }
                }
                finally
                {
                    EndPagePrinter(printer);
                }
            }
            finally
            {
                EndDocPrinter(printer);
            }
        }
        finally
        {
            ClosePrinter(printer);
        }
    }

    private static void ThrowLastError(string operation) =>
        throw new Win32Exception(Marshal.GetLastWin32Error(), $"Unable to {operation}.");

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class DocInfo
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string DocumentName = string.Empty;
        [MarshalAs(UnmanagedType.LPWStr)] public string? OutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string DataType = "RAW";
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr printer, int level, [In] DocInfo document);

    [DllImport("winspool.drv", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool StartPagePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);

    [DllImport("winspool.drv", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EndPagePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EndDocPrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ClosePrinter(IntPtr printer);
}
