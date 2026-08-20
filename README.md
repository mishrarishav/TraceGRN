# TrackGRN Workspace

TrackGRN is split into two applications while keeping Git metadata at the workspace root.

```text
TrackGRN/
├── UItrackGRN/    React + TypeScript PWA UI
└── APItrackGRN/   ASP.NET Core 8 API + SQL Server schema
```

## Prerequisites

- Node.js and npm
- .NET 8 SDK
- Access to the Microsoft SQL Server configured in `APItrackGRN/src/APItrackGRN.Api/appsettings.json`

## Commands

Run all commands from `D:\TrackGRN`.

If Windows PowerShell blocks `npm.ps1` under its default execution policy, use `npm.cmd` in the same commands (for example, `npm.cmd run api`). No execution-policy change is required.

```powershell
# Frontend
npm run ui

# API (Swagger: http://localhost:5025/swagger)
npm run api

# Apply pending EF migrations and exit
npm run api -- --migrate
# Alias
npm run migrate

# Apply migrations, seed idempotent data, and exit
npm run api -- --seed
# Alias
npm run seed

# Explicit combined setup
npm run db:setup

# Regenerate the idempotent SQL deployment script
npm run db:script

# Build both applications
npm run build
```

`--seed` always applies pending migrations first. Normal API startup intentionally does not mutate the database.

## Configuration

Shared defaults, including the SQL Server target, are stored in
`APItrackGRN/src/APItrackGRN.Api/appsettings.json`. Development-only overrides are stored in
`appsettings.Development.json`. Any setting can also be overridden without editing a file by
using environment variables:

```powershell
$env:ConnectionStrings__TrackGRN='Server=localhost\SQLEXPRESS;Database=TrackGRN;Trusted_Connection=True;TrustServerCertificate=True'
$env:Jwt__Key='replace-with-a-long-random-production-secret'
$env:Seed__AdminPassword='replace-with-a-strong-development-password'
```

For the UI, copy `UItrackGRN/.env.example` to `UItrackGRN/.env.local` when the API URL differs.

See [APItrackGRN/README.md](APItrackGRN/README.md) for backend and database details.

## Functional testing and operator documentation

- [Client demonstration report (single offline HTML)](docs/TrackGRN-Client-Report.html)
- [Playwright functional test report](docs/PLAYWRIGHT-TEST-REPORT.md)
- [Operator user guide](docs/OPERATOR-USER-GUIDE.md)
- [Annotated screenshots](docs/playwright-evidence/)
