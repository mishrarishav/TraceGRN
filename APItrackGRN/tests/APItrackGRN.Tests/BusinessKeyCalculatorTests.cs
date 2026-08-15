using APItrackGRN.Application.BusinessKeys;

namespace APItrackGRN.Tests;

public sealed class BusinessKeyCalculatorTests
{
    private readonly BusinessKeyCalculator _calculator = new();

    [Fact]
    public void Calculate_NormalizesCaseAndWhitespace()
    {
        var first = _calculator.Calculate(
            new Dictionary<string, string?> { ["GRNNumber"] = " 500515334 ", ["MaterialNumber"] = "m01" },
            ["GRNNumber", "MaterialNumber"]);
        var second = _calculator.Calculate(
            new Dictionary<string, string?> { ["grnnumber"] = "500515334", ["materialnumber"] = "M01" },
            ["GRNNumber", "MaterialNumber"]);

        Assert.Equal(first, second);
        Assert.Equal(64, first.Length);
    }

    [Fact]
    public void Calculate_DifferentiatesMaterialsUnderSameGrn()
    {
        var first = _calculator.Calculate(
            new Dictionary<string, string?> { ["GRNNumber"] = "500515334", ["MaterialNumber"] = "M01" },
            ["GRNNumber", "MaterialNumber"]);
        var second = _calculator.Calculate(
            new Dictionary<string, string?> { ["GRNNumber"] = "500515334", ["MaterialNumber"] = "M0220" },
            ["GRNNumber", "MaterialNumber"]);

        Assert.NotEqual(first, second);
    }
}
