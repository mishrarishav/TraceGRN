# TrackGRN Functional Validation Report

**Validation date:** 17 August 2026

**Application:** TrackGRN Material Traceability System

**UI:** React 19, TanStack Router, TypeScript

**API:** ASP.NET Core 8, JWT authentication and role authorization

**Database:** Microsoft SQL Server with EF Core migrations

**Automation:** Playwright Chromium, responsive device profiles and SQL integration tests

## Client report

The client-shareable report is a single offline HTML file. Its screenshots, highlights,
arrows, architecture diagram and process flow are embedded directly in the file:

- [Open TrackGRN Client Report](TrackGRN-Client-Report.html)

## Verified outcome

TrackGRN is wired to the real ASP.NET API and Microsoft SQL database. CRUD operations,
GRN import, label lifecycle, inward, issue, inventory, traceability, audit, revisions and
report downloads use persistent server data rather than runtime mock services.

| Verification | Result |
|---|---|
| API build | Pass — 0 warnings, 0 errors |
| API SQL integration tests | Pass — 12/12 |
| UI lint | Pass |
| UI production build | Pass |
| Annotated evidence capture | Pass — 2/2 scenarios |
| Desktop route and business workflows | Pass |
| Pixel responsive profile | Pass |
| Zebra MC9300 480 × 800 profile | Pass |
| SQL migration and idempotent seed | Pass |
| API health, authentication and persisted material read | Pass |

## Automated coverage

| Area | Verified behavior |
|---|---|
| Authentication | Invalid login rejection, valid JWT login, refresh and protected routes |
| Master CRUD | Materials, users, stations/devices and configuration persistence |
| SAP import | `.xlsx` validation, 10 MB rule, preview, warnings and commit |
| GRNs | Search, detail, material lines, business identity and revision restrictions |
| Labels | Unique pack identity, QR preview, print/reprint audit, filter and export |
| Inward | Scanner lookup, transition validation and duplicate inward rejection |
| Issue | Required station, inward prerequisite, confirmation and duplicate rejection |
| Inventory | Received, issued and available balances derived from SQL transactions |
| Traceability | Search by label/GRN/material/batch and complete lifecycle history |
| Audit and reports | Persistent audit records and API-generated report downloads |
| Responsive UI | Desktop, Pixel mobile and Zebra 480 × 800 scanner workflow |
| Accessibility | Serious/critical WCAG checks on primary operator screens |

## Annotated evidence

Orange outlines mark the exact control or information area. Red arrows connect numbered
callouts to the relevant UI element.

1. [Operations dashboard](playwright-evidence/01-dashboard-annotated.png)
2. [SAP GRN import](playwright-evidence/02-sap-import-annotated.png)
3. [Material inward](playwright-evidence/03-material-inward-annotated.png)
4. [Material issue](playwright-evidence/04-material-issue-annotated.png)
5. [Traceability lifecycle](playwright-evidence/05-traceability-annotated.png)
6. [Scanning safeguards](playwright-evidence/06-scanning-config-annotated.png)
7. [Zebra handheld workflow](playwright-evidence/07-zebra-issue-480x800-annotated.png)

## Hardware boundary

Keyboard-wedge scanning can be demonstrated with a keyboard or attached compatible
scanner. Thermal output remains in simulation until a physical printer is available.
The backend includes simulation, Zebra raw TCP and Windows spooler modes, but final
production acceptance still requires the actual plant scanner, printer, SAP workbook
variation and LAN environment.

## Regenerate annotated screenshots

Build the API first, then run the documentation capture from `UItrackGRN`:

```powershell
$env:TRACKGRN_GENERATE_DOCUMENTATION='1'
npm.cmd exec -- playwright test e2e/documentation.spec.ts --project=desktop-chromium
```

Re-embed the latest screenshots into the client HTML:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/generate-client-report.ps1
```
