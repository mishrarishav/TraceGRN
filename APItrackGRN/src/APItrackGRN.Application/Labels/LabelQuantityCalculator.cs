namespace APItrackGRN.Application.Labels;

public interface ILabelQuantityCalculator
{
    IReadOnlyList<decimal> Calculate(decimal receivedQuantity, decimal packingStandard);
}

public sealed class LabelQuantityCalculator : ILabelQuantityCalculator
{
    public IReadOnlyList<decimal> Calculate(decimal receivedQuantity, decimal packingStandard)
    {
        if (receivedQuantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(receivedQuantity), "Received quantity must be positive.");
        }

        if (packingStandard <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(packingStandard), "Packing standard must be positive.");
        }

        var quantities = new List<decimal>();
        var remaining = receivedQuantity;

        while (remaining > 0)
        {
            var quantity = Math.Min(remaining, packingStandard);
            quantities.Add(quantity);
            remaining -= quantity;
        }

        return quantities;
    }
}
