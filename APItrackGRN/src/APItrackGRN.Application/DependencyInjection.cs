using APItrackGRN.Application.BusinessKeys;
using APItrackGRN.Application.Labels;
using Microsoft.Extensions.DependencyInjection;

namespace APItrackGRN.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddSingleton<IBusinessKeyCalculator, BusinessKeyCalculator>();
        services.AddSingleton<ILabelQuantityCalculator, LabelQuantityCalculator>();
        return services;
    }
}
