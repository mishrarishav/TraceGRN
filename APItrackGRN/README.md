# APItrackGRN

ASP.NET Core 8 and SQL Server foundation for the TraceFlow/TrackGRN material traceability application.

## Structure

```text
src/
├── APItrackGRN.Api             HTTP, JWT, Swagger and CLI host
├── APItrackGRN.Application     Domain services and business calculations
├── APItrackGRN.Domain          Entities and enums
└── APItrackGRN.Infrastructure  EF Core, SQL Server and seed implementation
tests/
database/bootstrap/             Database creation and idempotent schema SQL
docs/                           Architecture and database notes
```

## Database lifecycle

The API owns the database lifecycle through EF Core migrations.

- No flag: run API only; the database is never changed automatically.
- `--migrate`: apply pending schema migrations and exit.
- `--seed`: apply pending migrations, insert/update idempotent seed data, and exit.
- `--migrate --seed`: explicit combined setup; behavior is equivalent to `--seed`.

From the repository root:

```powershell
npm run migrate
npm run seed
npm run api
```

The checked-in SQL equivalents are:

- `database/bootstrap/001-create-database.sql`
- `database/bootstrap/trackgrn-schema.sql`

The schema script is regenerated with `npm run db:script` after any EF migration change.

## Seed data

The seed is repeatable and includes:

- `Admin`, `StoreManager`, `StoreOperator`, and `Viewer` roles
- development admin user (credentials configured under `Seed`)
- active `GRN Number + Material Number` identification strategy
- default Excel mapping and configurable business rules
- inward and issue stations
- GRNs `500515334` and `500515335`
- materials `M01`, `M0220`, `M022`, `M021`, and `M100`
- 10 labels for M01, with 3 issued and an expected 7,000 PCS balance

The password in `appsettings.Development.json` is for local development only. Production must supply `Jwt__Key` and `Seed__AdminPassword` through a secret store or environment variables.

## API endpoints currently available

- `POST /api/auth/login`
- `GET /api/system/status`
- `GET /api/materials`
- `GET /api/grns`
- `GET /api/configuration/bootstrap` (Admin)
- `GET /health/live`
- `/swagger`

The remaining domain endpoints will be added behind the same architecture as the mock UI services are replaced.
