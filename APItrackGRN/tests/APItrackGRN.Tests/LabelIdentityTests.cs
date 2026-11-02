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
    public void CreateQrPayload_ContainsOnlyTheDurableLabelIdentifier()
    {
        var uid = LabelIdentity.FromId(Guid.Parse("14edc047-b20a-4f4e-aa17-3524e53f5fd2"));
        var payload = LabelIdentity.CreateQrPayload(uid, "500515334", "M1", 200m, "pcs",
            new DateOnly(2026, 8, 27), new DateTimeOffset(2026, 8, 27, 12, 34, 56, TimeSpan.Zero));

        Assert.Equal(uid, payload);
        Assert.DoesNotContain("\n", payload);
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
