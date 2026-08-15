# Database Schema

The initial migration creates the following groups:

- Security: `Roles`, `Users`, `RefreshTokens`
- Master data: `Materials`, `PackingRules`, `Stations`
- Import/configuration: `IdentificationStrategies`, `ImportBatches`, `ImportRowResults`, `ExcelMappingTemplates`, `ApplicationSettings`
- GRN: `GRNHeaders`, `GRNLines`, `GRNLineRevisionHistory`
- Traceability: `MaterialLabels`, `MaterialTransactions`, `AuditLogs`

Important constraints and indexes include unique usernames, employee codes, material numbers, label UIDs and transaction numbers; a filtered unique active business-key index; quantity check constraints; import, batch, timestamp and status indexes; and SQL Server row-version columns on users, GRN lines and labels.

`GRNNumber` is indexed but is deliberately not the GRN-line unique key because a GRN can contain multiple materials.
