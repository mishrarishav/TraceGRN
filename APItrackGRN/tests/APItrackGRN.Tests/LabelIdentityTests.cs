using APItrackGRN.Application.Labels;

namespace APItrackGRN.Tests;

public sealed class LabelIdentityTests
{
    [Fact]
    public void FromId_UsesTheCompleteGuid()
    {
        var id = Guid.Parse("14edc047-b20a-4f4e-aa17-3524e53f5fd2");

        Assert.Equal("LBL-14EDC047B20A4F4EAA173524E53F5FD2", LabelIdentity.FromId(id));
    }

    [Fact]
    public void CreateQrPayload_UsesNewLinesAndRequiredBusinessFields()
    {
        var uid = LabelIdentity.FromId(Guid.Parse("14edc047-b20a-4f4e-aa17-3524e53f5fd2"));
        var payload = LabelIdentity.CreateQrPayload(uid, "500515334", "M1", 200m, "pcs",
            new DateOnly(2026, 8, 27), new DateTimeOffset(2026, 8, 27, 12, 34, 56, TimeSpan.Zero));

        var lines = payload.Split('\n');
        Assert.Equal(6, lines.Length);
        Assert.Equal("GRN Number: 500515334", lines[0]);
        Assert.Equal("Material: M1", lines[1]);
        Assert.Equal("Quantity: 200 PCS", lines[2]);
        Assert.Equal("GRN Date: 27-08-26", lines[3]);
        Assert.StartsWith("Label Date: 27-08-26, ", lines[4]);
        Assert.Equal($"Label ID: {uid}", lines[5]);
    }

    [Theory]
    [InlineData("LBL-14EDC047B20A4F4EAA173524E53F5FD2")]
    [InlineData("GRN Number: 500515334\nLabel ID: LBL-14EDC047B20A4F4EAA173524E53F5FD2")]
    [InlineData("Label UID: LBL-14EDC047B20A4F4EAA173524E53F5FD2")]
    public void ExtractUid_AcceptsUidAndFullQrPayload(string scannedValue)
    {
        Assert.Equal("LBL-14EDC047B20A4F4EAA173524E53F5FD2", LabelIdentity.ExtractUid(scannedValue));
    }

    [Fact]
    public void ExtractUid_NormalizesRawAndPrefixedGuidValues()
    {
        var id = Guid.Parse("98b2fd12-1d24-4f60-a5f4-3dd9df89f718");
        var expected = LabelIdentity.FromId(id);

        Assert.Equal(expected, LabelIdentity.ExtractUid(id.ToString()));
        Assert.Equal(expected, LabelIdentity.ExtractUid($"LBL-{id}"));
    }
}
