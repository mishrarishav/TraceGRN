using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace APItrackGRN.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessMasterAndImportFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultBinLocation",
                table: "Materials",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OpeningQuantity",
                table: "Materials",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PartNumber",
                table: "Materials",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BinLocation",
                table: "GRNLines",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ExpectedLabelCount",
                table: "GRNLines",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ExpiryDate",
                table: "GRNLines",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ManufacturingDate",
                table: "GRNLines",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "InvoiceDate",
                table: "GRNHeaders",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceNumber",
                table: "GRNHeaders",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VendorId",
                table: "GRNHeaders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Vendors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VendorCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    VendorName = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vendors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "VendorAliases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VendorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AliasName = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorAliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VendorAliases_Vendors_VendorId",
                        column: x => x.VendorId,
                        principalTable: "Vendors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GRNHeaders_VendorId",
                table: "GRNHeaders",
                column: "VendorId");

            migrationBuilder.CreateIndex(
                name: "IX_VendorAliases_VendorId_AliasName",
                table: "VendorAliases",
                columns: new[] { "VendorId", "AliasName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Vendors_VendorCode",
                table: "Vendors",
                column: "VendorCode",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_GRNHeaders_Vendors_VendorId",
                table: "GRNHeaders",
                column: "VendorId",
                principalTable: "Vendors",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GRNHeaders_Vendors_VendorId",
                table: "GRNHeaders");

            migrationBuilder.DropTable(
                name: "VendorAliases");

            migrationBuilder.DropTable(
                name: "Vendors");

            migrationBuilder.DropIndex(
                name: "IX_GRNHeaders_VendorId",
                table: "GRNHeaders");

            migrationBuilder.DropColumn(
                name: "DefaultBinLocation",
                table: "Materials");

            migrationBuilder.DropColumn(
                name: "OpeningQuantity",
                table: "Materials");

            migrationBuilder.DropColumn(
                name: "PartNumber",
                table: "Materials");

            migrationBuilder.DropColumn(
                name: "BinLocation",
                table: "GRNLines");

            migrationBuilder.DropColumn(
                name: "ExpectedLabelCount",
                table: "GRNLines");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "GRNLines");

            migrationBuilder.DropColumn(
                name: "ManufacturingDate",
                table: "GRNLines");

            migrationBuilder.DropColumn(
                name: "InvoiceDate",
                table: "GRNHeaders");

            migrationBuilder.DropColumn(
                name: "InvoiceNumber",
                table: "GRNHeaders");

            migrationBuilder.DropColumn(
                name: "VendorId",
                table: "GRNHeaders");
        }
    }
}
