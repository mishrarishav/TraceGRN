using System.ComponentModel;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Options;

namespace APItrackGRN.Api.Services;

public sealed class PrinterOptions
{
    public const string SectionName = "Printing";
    public string Mode { get; init; } = "Simulation";
    public string PrinterName { get; init; } = "TrackGRN Simulator";
    public string? Host { get; init; }
    public int Port { get; init; } = 9100;
    public int Dpi { get; init; } = 203;
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
    int SequenceTotal);

public sealed record PrintDispatchResult(string Mode, string Printer, bool Simulated, string Payload);

public interface ILabelPrinter
{
    Task<PrintDispatchResult> PrintAsync(LabelPrintJob job, CancellationToken cancellationToken);
}

public sealed class LabelPrinter(IOptions<PrinterOptions> options, ILogger<LabelPrinter> logger) : ILabelPrinter
{
    private readonly PrinterOptions _options = options.Value;

    public async Task<PrintDispatchResult> PrintAsync(LabelPrintJob job, CancellationToken cancellationToken)
    {
        var zpl = BuildZpl(job);
        if (string.Equals(_options.Mode, "Simulation", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("Simulated label print {LabelUid} on {Printer}", job.LabelUid, _options.PrinterName);
            return new PrintDispatchResult("Simulation", _options.PrinterName, true, zpl);
        }

        if (string.Equals(_options.Mode, "WindowsSpooler", StringComparison.OrdinalIgnoreCase))
        {
            WindowsRawPrinter.Send(_options.PrinterName, zpl);
            logger.LogInformation("Sent label {LabelUid} to Windows printer {Printer}", job.LabelUid, _options.PrinterName);
            return new PrintDispatchResult("WindowsSpooler", _options.PrinterName, false, zpl);
        }

        if (string.Equals(_options.Mode, "RawTcp", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(_options.Host))
        {
            using var client = new TcpClient();
            await client.ConnectAsync(_options.Host, _options.Port, cancellationToken);
            await using var stream = client.GetStream();
            var bytes = Encoding.UTF8.GetBytes(zpl);
            await stream.WriteAsync(bytes, cancellationToken);
            await stream.FlushAsync(cancellationToken);
            return new PrintDispatchResult("RawTcp", _options.PrinterName, false, zpl);
        }

        throw new InvalidOperationException(
            "Printing mode must be Simulation, RawTcp, or WindowsSpooler; RawTcp also requires Printing:Host.");
    }

    private static string BuildZpl(LabelPrintJob job)
    {
        static string Clean(string value) => value.Replace("^", string.Empty).Replace("~", string.Empty);
        return $"^XA\n" +
               "^PW812^LL609\n" +
               $"^FO40,35^A0N,36,36^FDTRACEFLOW - MATERIAL LABEL^FS\n" +
               $"^FO40,90^A0N,28,28^FDUID: {Clean(job.LabelUid)}^FS\n" +
               $"^FO40,135^A0N,28,28^FDMATERIAL: {Clean(job.MaterialNumber)}^FS\n" +
               $"^FO40,175^A0N,24,24^FD{Clean(job.Description)}^FS\n" +
               $"^FO40,220^A0N,26,26^FDGRN: {Clean(job.GrnNumber)}  BATCH: {Clean(job.BatchNumber)}^FS\n" +
               $"^FO40,265^A0N,30,30^FDQTY: {job.Quantity:0.####} {Clean(job.Uom)}^FS\n" +
               $"^FO40,310^A0N,24,24^FDPACK: {job.SequenceNumber} OF {job.SequenceTotal}^FS\n" +
               $"^FO520,90^BQN,2,7^FDLA,{Clean(job.LabelUid)}^FS\n" +
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
