# Backend Architecture

Dependencies point inward:

```text
API -> Application + Infrastructure
Infrastructure -> Application + Domain
Application -> Domain
Domain -> no project dependency
```

The database uses GUID internal primary keys. Business identity is represented by a normalized SHA-256 `BusinessKeyHash`; the selected identification strategy and import batch remain attached to each GRN line so later strategy changes do not reinterpret historical rows.

Material issue and other critical workflows will use SQL transactions plus row-version concurrency. `MaterialTransactions` and `AuditLogs` are append-only at the DbContext boundary.

API startup does not silently migrate the database. Schema and seed operations are explicit maintenance commands, which makes deployment behavior predictable.
