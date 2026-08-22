using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace APItrackGRN.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIntelligentImportProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FileNamePattern",
                table: "ExcelMappingTemplates",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HeaderRowNumber",
                table: "ExcelMappingTemplates",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HeaderSignatureJson",
                table: "ExcelMappingTemplates",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastUsedAt",
                table: "ExcelMappingTemplates",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SheetAliasesJson",
                table: "ExcelMappingTemplates",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SheetName",
                table: "ExcelMappingTemplates",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FileNamePattern",
                table: "ExcelMappingTemplates");

            migrationBuilder.DropColumn(
                name: "HeaderRowNumber",
                table: "ExcelMappingTemplates");

            migrationBuilder.DropColumn(
                name: "HeaderSignatureJson",
                table: "ExcelMappingTemplates");

            migrationBuilder.DropColumn(
                name: "LastUsedAt",
                table: "ExcelMappingTemplates");

            migrationBuilder.DropColumn(
                name: "SheetAliasesJson",
                table: "ExcelMappingTemplates");

            migrationBuilder.DropColumn(
                name: "SheetName",
                table: "ExcelMappingTemplates");
        }
    }
}
