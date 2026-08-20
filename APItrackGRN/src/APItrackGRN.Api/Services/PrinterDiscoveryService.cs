using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;

namespace APItrackGRN.Api.Services;

public sealed record PrinterNetwork(
    string InterfaceName,
    string LocalAddress,
    string Subnet);

public sealed record DiscoveredPrinter(
    string Host,
    int Port,
    string PrinterName,
    string Source,
    long LatencyMs);

public sealed record PrinterDiscoveryResult(
    DateTimeOffset ScannedAt,
    int ScannedHosts,
    IReadOnlyList<PrinterNetwork> Networks,
    IReadOnlyList<DiscoveredPrinter> Printers);

public sealed record DiscoveredPrintAgent(
    string Host,
    int Port,
    string MachineName,
    string Version,
    string Source,
    long LatencyMs,
    IReadOnlyList<string> Printers);

public sealed record PrintAgentDiscoveryResult(
    DateTimeOffset ScannedAt,
    int ScannedHosts,
    IReadOnlyList<PrinterNetwork> Networks,
    IReadOnlyList<DiscoveredPrintAgent> Agents);

public interface IPrinterDiscoveryService
{
    Task<PrinterDiscoveryResult> DiscoverAsync(CancellationToken cancellationToken);
    Task<PrintAgentDiscoveryResult> DiscoverAgentsAsync(CancellationToken cancellationToken);
}

public sealed class PrinterDiscoveryService(ILogger<PrinterDiscoveryService> logger)
    : IPrinterDiscoveryService
{
    private const int RawPrintPort = 9100;
    private const int MaxHostsPerInterface = 254;
    private const int MaxParallelConnections = 48;
    private static readonly TimeSpan RawConnectionTimeout = TimeSpan.FromMilliseconds(450);
    private static readonly TimeSpan AgentRequestTimeout = TimeSpan.FromMilliseconds(1200);
    private static readonly HttpClient AgentHttpClient = new(new SocketsHttpHandler
    {
        ConnectTimeout = AgentRequestTimeout,
        PooledConnectionLifetime = TimeSpan.FromMinutes(2)
    });

    public async Task<PrinterDiscoveryResult> DiscoverAsync(CancellationToken cancellationToken)
    {
        var targets = ActiveNetworks();
        var candidates = NetworkCandidates(targets, includeApiHost: false);
        var discovered = new ConcurrentBag<DiscoveredPrinter>();

        await Parallel.ForEachAsync(
            candidates,
            CreateParallelOptions(cancellationToken),
            async (candidate, token) =>
            {
                using var client = new TcpClient { NoDelay = true };
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                timeout.CancelAfter(RawConnectionTimeout);
                var stopwatch = Stopwatch.StartNew();
                try
                {
                    await client.ConnectAsync(candidate.Address, RawPrintPort, timeout.Token);
                    stopwatch.Stop();
                    discovered.Add(new DiscoveredPrinter(
                        candidate.Address.ToString(),
                        RawPrintPort,
                        $"Network printer {candidate.Address}",
                        $"Raw TCP 9100 · {candidate.Network.InterfaceName}",
                        stopwatch.ElapsedMilliseconds));
                }
                catch (Exception exception) when (
                    exception is SocketException or OperationCanceledException)
                {
                    // Closed and filtered ports are expected while scanning a local subnet.
                }
            });

        var printers = discovered.OrderBy(printer => ParseAddress(printer.Host)).ToList();
        logger.LogInformation(
            "Printer discovery scanned {HostCount} LAN hosts and found {PrinterCount} raw TCP endpoints",
            candidates.Count,
            printers.Count);

        return new PrinterDiscoveryResult(
            DateTimeOffset.UtcNow,
            candidates.Count,
            targets.Select(target => target.Network).ToList(),
            printers);
    }

    public async Task<PrintAgentDiscoveryResult> DiscoverAgentsAsync(CancellationToken cancellationToken)
    {
        var targets = ActiveNetworks();
        var candidates = NetworkCandidates(targets, includeApiHost: true);
        var discovered = new ConcurrentBag<DiscoveredPrintAgent>();

        await Parallel.ForEachAsync(
            candidates,
            CreateParallelOptions(cancellationToken),
            async (candidate, token) =>
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                timeout.CancelAfter(AgentRequestTimeout);
                var stopwatch = Stopwatch.StartNew();
                try
                {
                    var health = await GetAgentAsync<AgentHealth>(
                        candidate.Address,
                        "/health",
                        timeout.Token);
                    if (health is null || !string.Equals(health.Status, "ready", StringComparison.OrdinalIgnoreCase))
                        return;

                    var queues = await GetAgentAsync<AgentPrinters>(
                        candidate.Address,
                        "/printers",
                        timeout.Token);
                    stopwatch.Stop();
                    discovered.Add(new DiscoveredPrintAgent(
                        candidate.Address.ToString(),
                        LocalPrintAgentProtocol.DefaultPort,
                        string.IsNullOrWhiteSpace(health.MachineName)
                            ? candidate.Address.ToString()
                            : health.MachineName,
                        health.Version ?? "unknown",
                        $"TrackGRN Agent · {candidate.Network.InterfaceName}",
                        stopwatch.ElapsedMilliseconds,
                        queues?.Printers ?? []));
                }
                catch (Exception exception) when (
                    exception is HttpRequestException
                        or OperationCanceledException
                        or JsonException
                        or NotSupportedException)
                {
                    // A missing agent is the normal result for almost every address in the scan.
                }
            });

        var agents = discovered.OrderBy(agent => ParseAddress(agent.Host)).ToList();
        logger.LogInformation(
            "Print Agent discovery scanned {HostCount} LAN hosts and found {AgentCount} agents",
            candidates.Count,
            agents.Count);

        return new PrintAgentDiscoveryResult(
            DateTimeOffset.UtcNow,
            candidates.Count,
            targets.Select(target => target.Network).ToList(),
            agents);
    }

    public static IReadOnlyList<IPAddress> CandidateAddresses(IPAddress address, IPAddress mask)
    {
        var addressValue = ToUInt32(address);
        var maskValue = ToUInt32(mask);
        var network = addressValue & maskValue;
        var broadcast = network | ~maskValue;
        var hostCount = broadcast > network + 1 ? (long)broadcast - network - 1 : 0;

        if (hostCount > MaxHostsPerInterface)
        {
            network = addressValue & 0xFFFFFF00u;
            broadcast = network | 0x000000FFu;
        }

        var result = new List<IPAddress>();
        for (var current = network + 1; current < broadcast; current++)
        {
            if (current != addressValue) result.Add(FromUInt32(current));
        }
        return result;
    }

    private static async Task<T?> GetAgentAsync<T>(
        IPAddress address,
        string path,
        CancellationToken cancellationToken)
    {
        var endpoint = new UriBuilder(
            Uri.UriSchemeHttp,
            address.ToString(),
            LocalPrintAgentProtocol.DefaultPort,
            path).Uri;
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        request.Headers.TryAddWithoutValidation(
            LocalPrintAgentProtocol.HeaderName,
            LocalPrintAgentProtocol.DefaultKey);
        using var response = await AgentHttpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        if (!response.IsSuccessStatusCode) return default;
        return await response.Content.ReadFromJsonAsync<T>(cancellationToken: cancellationToken);
    }

    private static List<NetworkCandidate> NetworkCandidates(
        IReadOnlyList<NetworkTarget> targets,
        bool includeApiHost)
    {
        var candidates = targets.SelectMany(target =>
        {
            IEnumerable<IPAddress> addresses = CandidateAddresses(target.Address, target.Mask);
            if (includeApiHost) addresses = addresses.Append(target.Address);
            return addresses.Select(address => new NetworkCandidate(address, target.Network));
        });
        return candidates
            .GroupBy(candidate => candidate.Address)
            .Select(group => group.First())
            .ToList();
    }

    private static ParallelOptions CreateParallelOptions(CancellationToken cancellationToken) => new()
    {
        MaxDegreeOfParallelism = MaxParallelConnections,
        CancellationToken = cancellationToken
    };

    private static List<NetworkTarget> ActiveNetworks()
    {
        var result = new List<NetworkTarget>();
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces()
                     .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up
                         && adapter.NetworkInterfaceType is not (NetworkInterfaceType.Loopback
                             or NetworkInterfaceType.Tunnel)))
        {
            var properties = adapter.GetIPProperties();
            var hasIpv4Gateway = properties.GatewayAddresses.Any(gateway =>
                gateway.Address.AddressFamily == AddressFamily.InterNetwork
                && !IPAddress.Any.Equals(gateway.Address));
            if (!hasIpv4Gateway) continue;

            foreach (var unicast in properties.UnicastAddresses.Where(unicast =>
                         unicast.Address.AddressFamily == AddressFamily.InterNetwork
                         && unicast.IPv4Mask is not null
                         && IsPrivateAddress(unicast.Address)))
            {
                var prefix = PrefixLength(unicast.IPv4Mask);
                result.Add(new NetworkTarget(
                    unicast.Address,
                    unicast.IPv4Mask,
                    new PrinterNetwork(
                        adapter.Name,
                        unicast.Address.ToString(),
                        $"{NetworkAddress(unicast.Address, unicast.IPv4Mask)}/{prefix}")));
            }
        }
        return result;
    }

    private static bool IsPrivateAddress(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10
            || bytes[0] == 172 && bytes[1] is >= 16 and <= 31
            || bytes[0] == 192 && bytes[1] == 168;
    }

    private static int PrefixLength(IPAddress mask) => mask.GetAddressBytes()
        .Sum(value => System.Numerics.BitOperations.PopCount((uint)value));

    private static string NetworkAddress(IPAddress address, IPAddress mask) =>
        FromUInt32(ToUInt32(address) & ToUInt32(mask)).ToString();

    private static uint ParseAddress(string address) => ToUInt32(IPAddress.Parse(address));

    private static uint ToUInt32(IPAddress address) =>
        BinaryPrimitives.ReadUInt32BigEndian(address.GetAddressBytes());

    private static IPAddress FromUInt32(uint address)
    {
        Span<byte> bytes = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(bytes, address);
        return new IPAddress(bytes);
    }

    private sealed record NetworkTarget(
        IPAddress Address,
        IPAddress Mask,
        PrinterNetwork Network);

    private sealed record NetworkCandidate(IPAddress Address, PrinterNetwork Network);
    private sealed record AgentHealth(string Status, string MachineName, string? Version, int Port);
    private sealed record AgentPrinters(string MachineName, IReadOnlyList<string> Printers);
}
