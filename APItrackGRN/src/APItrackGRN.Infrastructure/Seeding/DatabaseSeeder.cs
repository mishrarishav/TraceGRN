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
        await SeedVendorsAsync(cancellationToken);
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
        var definitions = new MaterialSeed[]
        {
            new("M01", "Automotive Assembly Component", 1000m),
            new("M0220", "Precision Mounting Bracket", 500m),
            new("M022", "Drive Housing Component", 500m),
            new("M021", "Industrial Fastener Set", 250m),
            new("M100", "Revision Demonstration Material", 1000m),

            new("MT0A1P064", "RESERVE TUBE (FINISHED)", 30m),
            new("M06901275", "UPPER SPRING PAD-TOP MOUNT", 200m),
            new("M06901284", "BUMPER CAP", 240m),
            new("M06030952", "COMPRESSION BUMPER", 200m),
            new("M06431911", "DIRT SHIELD", 32m),
            new("M0171Y542", "BUMPER CAP", 300m),
            new("M02030078", "BASE CUP", 100m),
            new("M02071727", "HOSE BRACKET - RH", 100m),
            new("M02071728", "HOSE BRACKET - LH", 100m),
            new("M02200786", "FOOT BRACKET", 26m),
            new("M02100490", "UPPER WASHER", 500m, "1905", "86", 5160m),

            new("M02190422", null, 250m),
            new("M06081352", null, 80m, "519", "210", 30240m),
            new("M05N3N001", null, 196m, "1300", "170", 9350m),
            new("M06200175", null, 500m, "624", "16", 6160m),
            new("M06901276", null, 100m, "840", "12", 2640m),
            new("M06901277", null, 100m, "156", "18", 21600m),

            new("M06030602", null, 570m),
            new("M06030840", null, 220m),
            new("M06030646", null, 350m),
            new("M06030489", null, 380m),
            new("M06030884", null, 230m),
            new("M06031300", null, 55m),
            new("M02190519", null, 144m),
            new("M02071223", null, 600m),
            new("M02071222", null, 600m),
            new("M02100430", null, 500m)
        };

        var existing = await dbContext.Materials.ToDictionaryAsync(x => x.MaterialNumber, cancellationToken);
        foreach (var definition in definitions)
        {
            if (!existing.ContainsKey(definition.Number))
            {
                var material = new Material
                {
                    MaterialNumber = definition.Number,
                    Description = definition.Description ?? $"Material {definition.Number}",
                    Uom = "PC",
                    DefaultPackingStandard = definition.Packing,
                    PartNumber = definition.PartNumber,
                    DefaultBinLocation = definition.BinLocation,
                    OpeningQuantity = definition.OpeningQuantity
                };
                dbContext.Materials.Add(material);
                existing[definition.Number] = material;
            }
            else
            {
                var material = existing[definition.Number];
                if (!string.IsNullOrWhiteSpace(definition.Description)) material.Description = definition.Description;
                material.DefaultPackingStandard = definition.Packing;
                material.PartNumber = definition.PartNumber ?? material.PartNumber;
                material.DefaultBinLocation = definition.BinLocation ?? material.DefaultBinLocation;
                material.OpeningQuantity = definition.OpeningQuantity ?? material.OpeningQuantity;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private async Task SeedVendorsAsync(CancellationToken cancellationToken)
    {
        var definitions = new VendorSeed[]
        {
            new("1098779", "ATOMONE TECHNOLOGIES"),
            new("1074658", "BASF INDIA LIMITED"),
            new("1087643", "BASF INDIA LTD"),
            new("1083253", "Bridgestone India Automotive"),
            new("1094477", "FREUDENBERG-NOK PRIVATE LIMITED"),
            new("1069332", "Fuchs Lubricants"),
            new("1063568", "Global Automotive Components Pvt. L"),
            new("1051226", "GOLDY PRECISION STAMPINGS PVT. LTD."),
            new("1082521", "GOOD LUCK INDUSTRIES"),
            new("1079983", "Good Luck Industries"),
            new("1094846", "GOWELL RUBBER INDUSTRIES"),
            new("1068161", "GOWELL RUBBER INDUSTRIES"),
            new("1079962", "HINDUSTAN PETROLEUM"),
            new("1096228", "HINDUSTAN PETROLEUM CORPORATION LTD"),
            new("1093513", "Inox Air Products Pvt. Ltd."),
            new("1064742", "Prakash Techno Plast India Pvt"),
            new("1094766", "JAIRAJ ANCILLARIES PVT LTD", ["Jairaj Ancillares Pvt. Ltd.", "GOWELL RUBBER INDUSTRIES"]),
            new("1091705", "JAIRAJ ANCILLARIES PVT LTD"),
            new("1094021", "KAMAL CED COATERS", ["Kamal CED"]),
            new("1053449", "KAMAL RUBPLAST INDUSTRIES PVT"),
            new("1094852", "Kumar Automates"),
            new("1095022", "NVK AUTOTECH INDIA"),
            new("1064906", "KUMAR AUTOMATES"),
            new("1099367", "MUBEA AUTOMOTIVE COMPONENT"),
            new("1051279", "Mubea Automotive Components India")
        };

        var existing = await dbContext.Vendors.Include(x => x.Aliases).ToDictionaryAsync(x => x.VendorCode, cancellationToken);
        foreach (var definition in definitions)
        {
            if (!existing.TryGetValue(definition.Code, out var vendor))
            {
                vendor = new Vendor { VendorCode = definition.Code, VendorName = definition.Name, IsActive = true };
                dbContext.Vendors.Add(vendor);
                existing[definition.Code] = vendor;
            }
            else
            {
                vendor.VendorName = definition.Name;
                vendor.IsActive = true;
            }

            foreach (var alias in definition.Aliases ?? [])
            {
                if (vendor.Aliases.Any(item => string.Equals(item.AliasName, alias, StringComparison.OrdinalIgnoreCase))) continue;
                vendor.Aliases.Add(new VendorAlias { Vendor = vendor, AliasName = alias });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        var unlinkedHeaders = await dbContext.GrnHeaders
            .Where(header => header.VendorId == null && header.VendorCode != null)
            .ToListAsync(cancellationToken);
        foreach (var header in unlinkedHeaders)
        {
            if (header.VendorCode is not null && existing.TryGetValue(header.VendorCode, out var vendor))
            {
                header.Vendor = vendor;
                header.VendorName = vendor.VendorName;
            }
        }

        if (unlinkedHeaders.Count > 0) await dbContext.SaveChangesAsync(cancellationToken);
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
            UidPrefix = "LBL", LabelSize = "100x75", CompanyName = "TrackGRN Industries",
            QrSize = 160, ShowBatch = true, ShowGrnDate = true, ShowDescription = true, ShowBinSequence = true
        }, "Default printable label configuration", adminId, cancellationToken);
        await AddSettingIfMissing("PlantConfiguration", "Plant", new
        {
            DefaultPlant = "1000", DefaultStorageLocation = "RM01", TimeZone = "Asia/Kolkata",
            ClientName = "", ClientLogoDataUrl = ""
        }, "Default plant and time zone", adminId, cancellationToken);
        await AddSettingIfMissing("ImportConfiguration", "Import", new
        {
            MaxFileSizeMb = 10, BlockDuplicateFileHashes = true, AutoGenerateLabels = true
        }, "Excel import limits and label automation", adminId, cancellationToken);

        var businessMapping = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["GRN No"] = "GRNNumber",
            ["Gr No"] = "GRNNumber",
            ["GRN Date"] = "GRNDate",
            ["Gr date"] = "GRNDate",
            ["Line Item"] = "SAPLineItemNumber",
            ["Material"] = "MaterialNumber",
            ["Material Desc"] = "MaterialDescription",
            ["Material Description"] = "MaterialDescription",
            ["Qty"] = "ReceivedQuantity",
            ["Quantity"] = "ReceivedQuantity",
            ["Packing Qty"] = "PackingStandard",
            ["Pack Qty"] = "PackingStandard",
            ["Batch"] = "BatchNumber",
            ["UOM"] = "UOM",
            ["Plant"] = "Plant",
            ["PO Number"] = "PurchaseOrder",
            ["Vendor"] = "VendorCode",
            ["SAP Vendor code"] = "VendorCode",
            ["Sup Name"] = "VendorName",
            ["Invo No"] = "InvoiceNumber",
            ["Inv Date"] = "InvoiceDate",
            ["Bin loc"] = "BinLocation",
            ["Mfg date"] = "ManufacturingDate",
            ["Exp Date"] = "ExpiryDate",
            ["No of Labels to print"] = "ExpectedLabelCount"
        });
        var defaultTemplate = await dbContext.ExcelMappingTemplates
            .SingleOrDefaultAsync(x => x.Name == "Default SAP GRN Format", cancellationToken);
        if (defaultTemplate is null)
        {
            dbContext.ExcelMappingTemplates.Add(new ExcelMappingTemplate
            {
                Name = "Default SAP GRN Format",
                IsDefault = true,
                CreatedById = adminId,
                MappingJson = businessMapping
            });
        }
        else
        {
            defaultTemplate.MappingJson = businessMapping;
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

    private sealed record MaterialSeed(
        string Number,
        string? Description,
        decimal Packing,
        string? PartNumber = null,
        string? BinLocation = null,
        decimal? OpeningQuantity = null);

    private sealed record VendorSeed(string Code, string Name, string[]? Aliases = null);
}
