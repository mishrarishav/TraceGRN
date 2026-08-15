using System.Text.Json;
using APItrackGRN.Application.BusinessKeys;
using APItrackGRN.Domain.Entities;
using APItrackGRN.Domain.Enums;
using APItrackGRN.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace APItrackGRN.Infrastructure.Seeding;

public sealed class DatabaseSeeder(
    TrackGrnDbContext dbContext,
    IConfiguration configuration,
    IBusinessKeyCalculator businessKeyCalculator,
    ILogger<DatabaseSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var roles = await SeedRolesAsync(cancellationToken);
        var admin = await SeedAdminAsync(roles["Admin"], cancellationToken);
        var strategy = await SeedStrategyAsync(admin.Id, cancellationToken);
        var stations = await SeedStationsAsync(cancellationToken);
        var materials = await SeedMaterialsAsync(cancellationToken);
        await SeedConfigurationAsync(admin.Id, cancellationToken);
        await SeedDemoTraceabilityAsync(admin, strategy, stations["STORE-EXIT-01"], materials, cancellationToken);

        logger.LogInformation("TrackGRN seed completed successfully.");
    }

    private async Task<Dictionary<string, Role>> SeedRolesAsync(CancellationToken cancellationToken)
    {
        var definitions = new Dictionary<string, string>
        {
            ["Admin"] = "Full system access",
            ["StoreManager"] = "Imports, labels, inventory, reports and approvals",
            ["StoreOperator"] = "Inward, issue and basic inventory operations",
            ["Viewer"] = "Read-only traceability and reports"
        };

        var existing = await dbContext.Roles.ToDictionaryAsync(x => x.Name, cancellationToken);
        foreach (var (name, description) in definitions)
        {
            if (!existing.ContainsKey(name))
            {
                var role = new Role { Name = name, Description = description };
                dbContext.Roles.Add(role);
                existing[name] = role;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private async Task<User> SeedAdminAsync(Role adminRole, CancellationToken cancellationToken)
    {
        var username = configuration["Seed:AdminUsername"] ?? "admin";
        var existing = await dbContext.Users.SingleOrDefaultAsync(x => x.Username == username, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var password = configuration["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12)
        {
            throw new InvalidOperationException(
                "Seed:AdminPassword must be configured with at least 12 characters before running --seed.");
        }

        var admin = new User
        {
            Username = username,
            FullName = configuration["Seed:AdminFullName"] ?? "Development Administrator",
            EmployeeCode = configuration["Seed:AdminEmployeeCode"] ?? "DEV-ADMIN",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12),
            RoleId = adminRole.Id,
            IsActive = true
        };

        dbContext.Users.Add(admin);
        await dbContext.SaveChangesAsync(cancellationToken);
        return admin;
    }

    private async Task<IdentificationStrategy> SeedStrategyAsync(Guid adminId, CancellationToken cancellationToken)
    {
        var existing = await dbContext.IdentificationStrategies.SingleOrDefaultAsync(x => x.IsActive, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var strategy = new IdentificationStrategy
        {
            Name = "GRN Number + Material Number",
            StrategyType = IdentificationStrategyType.GrnAndMaterial,
            SelectedFieldsJson = JsonSerializer.Serialize(new[] { "GRNNumber", "MaterialNumber" }),
            IsActive = true,
            CreatedById = adminId
        };

        dbContext.IdentificationStrategies.Add(strategy);
        await dbContext.SaveChangesAsync(cancellationToken);
        return strategy;
    }

    private async Task<Dictionary<string, Station>> SeedStationsAsync(CancellationToken cancellationToken)
    {
        var definitions = new[]
        {
            new { Code = "STORE-EXIT-01", Name = "Store Production Exit", Type = StationType.Issue,
                Location = "Plant 1000 — Store Gate A", Device = "Keyboard-wedge scanner" },
            new { Code = "STORE-INWARD-01", Name = "Incoming Material Station", Type = StationType.Inward,
                Location = "Plant 1000 — Receiving Dock", Device = "Keyboard-wedge scanner" }
        };

        var existing = await dbContext.Stations.ToDictionaryAsync(x => x.StationCode, cancellationToken);
        foreach (var definition in definitions)
        {
            if (!existing.ContainsKey(definition.Code))
            {
                var station = new Station
                {
                    StationCode = definition.Code,
                    StationName = definition.Name,
                    Type = definition.Type,
                    Location = definition.Location,
                    DeviceName = definition.Device
                };
                dbContext.Stations.Add(station);
                existing[definition.Code] = station;
            }
            else
            {
                existing[definition.Code].StationName = definition.Name;
                existing[definition.Code].Type = definition.Type;
                existing[definition.Code].Location = definition.Location;
                existing[definition.Code].DeviceName = definition.Device;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private async Task<Dictionary<string, Material>> SeedMaterialsAsync(CancellationToken cancellationToken)
    {
        var definitions = new[]
        {
            new { Number = "M01", Description = "Automotive Assembly Component", Packing = 1000m },
            new { Number = "M0220", Description = "Precision Mounting Bracket", Packing = 500m },
            new { Number = "M022", Description = "Drive Housing Component", Packing = 500m },
            new { Number = "M021", Description = "Industrial Fastener Set", Packing = 250m },
            new { Number = "M100", Description = "Revision Demonstration Material", Packing = 1000m }
        };

        var existing = await dbContext.Materials.ToDictionaryAsync(x => x.MaterialNumber, cancellationToken);
        foreach (var definition in definitions)
        {
            if (!existing.ContainsKey(definition.Number))
            {
                var material = new Material
                {
                    MaterialNumber = definition.Number,
                    Description = definition.Description,
                    Uom = "PCS",
                    DefaultPackingStandard = definition.Packing
                };
                dbContext.Materials.Add(material);
                existing[definition.Number] = material;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private async Task SeedConfigurationAsync(Guid adminId, CancellationToken cancellationToken)
    {
        var businessRules = new
            {
                RequireInwardBeforeIssue = true,
                AllowLabelReprint = true,
                RequireReprintReason = true,
                AllowDuplicateInward = false,
                RequireStationForIssue = true,
                AllowGrnRevisionAfterLabelsGenerated = true,
                AllowGrnRevisionAfterMaterialIssued = false,
                RequireAdminReviewForQuantityDecrease = true
            };

        await AddSettingIfMissing("BusinessRules", "BusinessRules", businessRules,
            "Critical inward, issue, reprint and GRN revision rules", adminId, cancellationToken);
        await AddSettingIfMissing("LabelConfiguration", "Labels", new
        {
            UidPrefix = "LBL", LabelSize = "100x75", CompanyName = "TraceFlow Industries",
            QrSize = 160, ShowBatch = true, ShowGrnDate = true, ShowDescription = true, ShowBinSequence = true
        }, "Default printable label configuration", adminId, cancellationToken);
        await AddSettingIfMissing("PlantConfiguration", "Plant", new
        {
            DefaultPlant = "1000", DefaultStorageLocation = "RM01", TimeZone = "Asia/Kolkata"
        }, "Default plant and time zone", adminId, cancellationToken);
        await AddSettingIfMissing("ImportConfiguration", "Import", new
        {
            MaxFileSizeMb = 10, BlockDuplicateFileHashes = true, AutoGenerateLabels = true
        }, "Excel import limits and label automation", adminId, cancellationToken);

        if (!await dbContext.ExcelMappingTemplates.AnyAsync(cancellationToken))
        {
            dbContext.ExcelMappingTemplates.Add(new ExcelMappingTemplate
            {
                Name = "Default SAP GRN Format",
                IsDefault = true,
                CreatedById = adminId,
                MappingJson = JsonSerializer.Serialize(new Dictionary<string, string>
                {
                    ["GRN No"] = "GRNNumber",
                    ["GRN Date"] = "GRNDate",
                    ["Line Item"] = "SAPLineItemNumber",
                    ["Material"] = "MaterialNumber",
                    ["Material Desc"] = "MaterialDescription",
                    ["Qty"] = "ReceivedQuantity",
                    ["Packing Qty"] = "PackingStandard",
                    ["Batch"] = "BatchNumber",
                    ["Plant"] = "Plant",
                    ["PO Number"] = "PurchaseOrder"
                })
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task AddSettingIfMissing(string key, string category, object value, string description,
        Guid adminId, CancellationToken cancellationToken)
    {
        if (await dbContext.ApplicationSettings.AnyAsync(x => x.Key == key, cancellationToken)) return;
        dbContext.ApplicationSettings.Add(new ApplicationSetting
        {
            Key = key, Category = category, ValueJson = JsonSerializer.Serialize(value),
            Description = description, UpdatedById = adminId
        });
    }

    private async Task SeedDemoTraceabilityAsync(
        User admin,
        IdentificationStrategy strategy,
        Station issueStation,
        IReadOnlyDictionary<string, Material> materials,
        CancellationToken cancellationToken)
    {
        const string seedHash = "DEMO-SEED-SAP-GRN-20260814";
        if (await dbContext.ImportBatches.AnyAsync(x => x.FileHash == seedHash, cancellationToken))
        {
            return;
        }

        var timestamp = new DateTimeOffset(2026, 8, 14, 9, 0, 0, TimeSpan.Zero);
        var importBatch = new ImportBatch
        {
            FileName = "SAP_GRN_14_Aug_2026.xlsx",
            FileHash = seedHash,
            UploadedAt = timestamp,
            UploadedById = admin.Id,
            TotalRows = 5,
            NewRows = 5,
            ImportStatus = ImportStatus.Completed,
            ProcessingDurationMs = 1240,
            IdentificationStrategyId = strategy.Id
        };

        var mainHeader = new GrnHeader
        {
            GrnNumber = "500515334",
            GrnDate = new DateOnly(2026, 8, 14),
            VendorCode = "V1001",
            VendorName = "Demo Automotive Supplier",
            Plant = "1000",
            StorageLocation = "RM01",
            PurchaseOrder = "4500123456"
        };
        var revisionHeader = new GrnHeader
        {
            GrnNumber = "500515335",
            GrnDate = new DateOnly(2026, 8, 14),
            VendorCode = "V1002",
            VendorName = "Demo Components India",
            Plant = "1000",
            StorageLocation = "RM01",
            PurchaseOrder = "4500123457"
        };

        dbContext.AddRange(importBatch, mainHeader, revisionHeader);

        var lineDefinitions = new[]
        {
            new { Header = mainHeader, Line = "10", Material = materials["M01"], Quantity = 10000m, Packing = 1000m, Batch = "B240814-01" },
            new { Header = mainHeader, Line = "20", Material = materials["M0220"], Quantity = 4000m, Packing = 500m, Batch = "B240814-02" },
            new { Header = mainHeader, Line = "30", Material = materials["M022"], Quantity = 2500m, Packing = 500m, Batch = "B240814-03" },
            new { Header = mainHeader, Line = "40", Material = materials["M021"], Quantity = 1000m, Packing = 250m, Batch = "B240814-04" },
            new { Header = revisionHeader, Line = "10", Material = materials["M100"], Quantity = 12000m, Packing = 1000m, Batch = "B240814-05" }
        };

        var lines = new List<GrnLine>();
        foreach (var definition in lineDefinitions)
        {
            var values = new Dictionary<string, string?>
            {
                ["GRNNumber"] = definition.Header.GrnNumber,
                ["MaterialNumber"] = definition.Material.MaterialNumber,
                ["SAPLineItemNumber"] = definition.Line
            };
            var line = new GrnLine
            {
                GrnHeader = definition.Header,
                MaterialId = definition.Material.Id,
                SapLineItemNumber = definition.Line,
                ReceivedQuantity = definition.Quantity,
                PackingStandard = definition.Packing,
                BatchNumber = definition.Batch,
                Uom = "PCS",
                BusinessKeyHash = businessKeyCalculator.Calculate(values, ["GRNNumber", "MaterialNumber"]),
                IdentificationStrategyId = strategy.Id,
                ImportBatch = importBatch
            };
            lines.Add(line);
            dbContext.GrnLines.Add(line);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < lines.Count; index++)
        {
            dbContext.ImportRowResults.Add(new ImportRowResult
            {
                ImportBatchId = importBatch.Id,
                ExcelRowNumber = index + 2,
                RawDataJson = JsonSerializer.Serialize(new
                {
                    GRNNumber = lines[index].GrnHeader.GrnNumber,
                    lines[index].SapLineItemNumber,
                    lines[index].MaterialId,
                    lines[index].ReceivedQuantity
                }),
                BusinessKeyHash = lines[index].BusinessKeyHash,
                ResultType = ImportResultType.New,
                Message = "Seeded demo import row",
                GrnLineId = lines[index].Id
            });
        }

        var mainLine = lines[0];
        for (var sequence = 1; sequence <= 10; sequence++)
        {
            var labelUid = $"LBL-000034{49 + sequence:D2}";
            var isIssued = sequence <= 3;
            var label = new MaterialLabel
            {
                LabelUid = labelUid,
                GrnLineId = mainLine.Id,
                SequenceNumber = sequence,
                LabelQuantity = 1000m,
                Uom = "PCS",
                QrPayload = labelUid,
                LabelStatus = isIssued ? LabelStatus.Issued : LabelStatus.Inwarded,
                GeneratedAt = timestamp.AddMinutes(sequence),
                GeneratedById = admin.Id,
                PrintedAt = timestamp.AddMinutes(15 + sequence),
                PrintCount = 1,
                LastPrintedById = admin.Id,
                InwardedAt = timestamp.AddHours(1).AddMinutes(sequence),
                InwardedById = admin.Id,
                IssuedAt = isIssued ? timestamp.AddHours(6).AddMinutes(sequence) : null,
                IssuedById = isIssued ? admin.Id : null
            };
            dbContext.MaterialLabels.Add(label);

            dbContext.MaterialTransactions.Add(new MaterialTransaction
            {
                TransactionNumber = $"TXN-GEN-{sequence:D6}",
                TransactionType = TransactionType.LabelGenerated,
                Label = label,
                GrnLineId = mainLine.Id,
                MaterialId = mainLine.MaterialId,
                Quantity = 1000m,
                Uom = "PCS",
                UserId = admin.Id,
                Timestamp = label.GeneratedAt,
                PreviousStatus = LabelStatus.Generated,
                NewStatus = LabelStatus.Generated
            });

            dbContext.MaterialTransactions.Add(new MaterialTransaction
            {
                TransactionNumber = $"TXN-INW-{sequence:D6}",
                TransactionType = TransactionType.Inward,
                Label = label,
                GrnLineId = mainLine.Id,
                MaterialId = mainLine.MaterialId,
                Quantity = 1000m,
                Uom = "PCS",
                UserId = admin.Id,
                Timestamp = label.InwardedAt!.Value,
                PreviousStatus = LabelStatus.Printed,
                NewStatus = LabelStatus.Inwarded
            });

            if (isIssued)
            {
                dbContext.MaterialTransactions.Add(new MaterialTransaction
                {
                    TransactionNumber = $"TXN-ISS-{sequence:D6}",
                    TransactionType = TransactionType.Issue,
                    Label = label,
                    GrnLineId = mainLine.Id,
                    MaterialId = mainLine.MaterialId,
                    Quantity = 1000m,
                    Uom = "PCS",
                    UserId = admin.Id,
                    Timestamp = label.IssuedAt!.Value,
                    StationId = issueStation.Id,
                    DeviceId = "ZEBRA-MC9300-DEMO",
                    PreviousStatus = LabelStatus.Inwarded,
                    NewStatus = LabelStatus.Issued
                });
            }
        }

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = admin.Id,
            Timestamp = timestamp,
            Action = "SeedDatabase",
            EntityName = "Database",
            EntityId = "TrackGRN",
            MetadataJson = JsonSerializer.Serialize(new { Demo = true, AcceptanceBalance = 7000 })
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
