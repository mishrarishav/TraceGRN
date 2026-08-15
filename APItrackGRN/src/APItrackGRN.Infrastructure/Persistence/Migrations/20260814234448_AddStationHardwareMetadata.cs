using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace APItrackGRN.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStationHardwareMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeviceName",
                table: "Stations",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "Stations",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeviceName",
                table: "Stations");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "Stations");
        }
    }
}
