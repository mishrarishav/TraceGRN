using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace TrackGRN.PrintAgent;

internal static class WindowsPrinter
{
    private const uint PrinterEnumLocal = 0x00000002;
    private const uint PrinterEnumConnections = 0x00000004;

    public static IReadOnlyList<string> GetInstalledPrinters()
    {
        EnsureWindows();
        const uint flags = PrinterEnumLocal | PrinterEnumConnections;
        _ = EnumPrinters(flags, null, 4, IntPtr.Zero, 0, out var required, out _);
        if (required == 0) return [];

        var buffer = Marshal.AllocHGlobal((int)required);
        try
        {
            if (!EnumPrinters(flags, null, 4, buffer, required, out _, out var returned))
                ThrowLastError("enumerate installed printers");

            var size = Marshal.SizeOf<PrinterInfo4>();
            var printers = new List<string>((int)returned);
            for (var index = 0; index < returned; index++)
            {
                var info = Marshal.PtrToStructure<PrinterInfo4>(IntPtr.Add(buffer, index * size));
                var name = Marshal.PtrToStringUni(info.PrinterName);
                if (!string.IsNullOrWhiteSpace(name)) printers.Add(name);
            }

            return printers.Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static void SendRaw(string printerName, string payload, string? labelUid)
    {
        EnsureWindows();
        if (string.IsNullOrWhiteSpace(printerName))
            throw new InvalidOperationException("Printer queue name cannot be empty.");
        if (!OpenPrinter(printerName, out var printer, IntPtr.Zero)) ThrowLastError("open printer");
        try
        {
            var document = new DocInfo
            {
                DocumentName = string.IsNullOrWhiteSpace(labelUid)
                    ? "TrackGRN Material Label"
                    : $"TrackGRN {labelUid}",
                DataType = "RAW"
            };
            if (StartDocPrinter(printer, 1, document) == 0) ThrowLastError("start print document");
            try
            {
                if (!StartPagePrinter(printer)) ThrowLastError("start print page");
                try
                {
                    var bytes = Encoding.UTF8.GetBytes(payload);
                    var payloadBuffer = Marshal.AllocCoTaskMem(bytes.Length);
                    try
                    {
                        Marshal.Copy(bytes, 0, payloadBuffer, bytes.Length);
                        if (!WritePrinter(printer, payloadBuffer, bytes.Length, out var written)
                            || written != bytes.Length)
                            ThrowLastError("write print payload");
                    }
                    finally
                    {
                        Marshal.FreeCoTaskMem(payloadBuffer);
                    }
                }
                finally
                {
                    _ = EndPagePrinter(printer);
                }
            }
            finally
            {
                _ = EndDocPrinter(printer);
            }
        }
        finally
        {
            _ = ClosePrinter(printer);
        }
    }

    private static void EnsureWindows()
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("TrackGRN Local Print Agent requires Windows.");
    }

    private static void ThrowLastError(string operation) =>
        throw new Win32Exception(Marshal.GetLastWin32Error(), $"Unable to {operation}.");

    [StructLayout(LayoutKind.Sequential)]
    private struct PrinterInfo4
    {
        public IntPtr PrinterName;
        public IntPtr ServerName;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class DocInfo
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string DocumentName = string.Empty;
        [MarshalAs(UnmanagedType.LPWStr)] public string? OutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string DataType = "RAW";
    }

    [DllImport("winspool.drv", EntryPoint = "EnumPrintersW", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumPrinters(
        uint flags,
        string? name,
        uint level,
        IntPtr printerEnum,
        uint bufferSize,
        out uint required,
        out uint returned);

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
