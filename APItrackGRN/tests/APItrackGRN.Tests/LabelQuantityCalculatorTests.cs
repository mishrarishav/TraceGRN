using APItrackGRN.Application.Labels;

namespace APItrackGRN.Tests;

public sealed class LabelQuantityCalculatorTests
{
    private readonly LabelQuantityCalculator _calculator = new();

    [Fact]
    public void Calculate_ExactPacking_CreatesExpectedLabels()
    {
        var labels = _calculator.Calculate(10_000m, 1_000m);

        Assert.Equal(10, labels.Count);
        Assert.All(labels, quantity => Assert.Equal(1_000m, quantity));
        Assert.Equal(10_000m, labels.Sum());
    }

    [Fact]
    public void Calculate_PartialPacking_CreatesRemainderLabel()
    {
        var labels = _calculator.Calculate(10_500m, 1_000m);

        Assert.Equal(11, labels.Count);
        Assert.Equal(500m, labels[^1]);
        Assert.Equal(10_500m, labels.Sum());
    }

    [Theory]
    [InlineData(0, 1000)]
    [InlineData(1000, 0)]
    [InlineData(-1, 1000)]
    public void Calculate_InvalidQuantity_Throws(decimal quantity, decimal packing)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => _calculator.Calculate(quantity, packing));
    }
}
