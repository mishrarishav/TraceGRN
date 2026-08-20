# TrackGRN Operator User Guide

## 1. Sign in

Open TrackGRN and use the assigned plant credentials. For the current demo UI:

- Username: `admin`
- Password: `admin123`

Invalid credentials are rejected. The login button stays disabled until the application is fully ready, preventing accidental native form submission on a slow plant terminal.

## 2. Dashboard

The dashboard provides current GRN, received, available, issue, inward and warning KPIs. Use the left navigation on desktop or bottom navigation on a handheld.

![Dashboard controls](playwright-evidence/01-dashboard-annotated.png)

1. The left rail opens operational, shop-floor, insight and administration modules.
2. The page heading confirms the current operation.
3. KPI cards show plant-level counts and quantities.
4. Charts show received/issued movement and label lifecycle status.

Press `Ctrl+K` on desktop to focus global search. Enter a label UID, GRN, material or batch and press Enter to open Traceability.

## 3. Import an SAP GRN file

![SAP import controls](playwright-evidence/02-sap-import-annotated.png)

1. Open **SAP GRN Import**.
2. Drop or browse for an `.xlsx` file. Other formats and files above 10 MB are rejected.
3. Select the identification strategy that matches the plant's SAP business identity rule.
4. Select the column-mapping template.
5. Review New, Updated, Unchanged, Warning and Rejected rows.
6. Select **Commit Import**, verify the summary, then confirm.

Never commit rejected rows without resolving their stated reason. A revised SAP extract must never reduce received quantity below material already issued.

## 4. Labels

Open **Labels** to review generated pack UIDs, preview the 100 × 75 mm layout, select a printer and control optional label fields.

- **Batch Print** sends the currently filtered set to the selected printer.
- **Reprint** requires confirmation and is recorded for audit.
- **Bin Seq** means pack sequence (for example, `03 of 10`); it is not rack/aisle/bin location management.

## 5. Material inward

![Material inward](playwright-evidence/03-material-inward-annotated.png)

1. Open **Material Inward**.
2. Scan with the Zebra keyboard wedge, or enter the label UID and press Enter.
3. The system accepts Generated/Printed packs and changes them to Inwarded.
4. Watch the green confirmation and Session Log.

The system rejects an unknown, already inwarded, already issued, blocked or cancelled label. Do not attach a replacement QR with a different UID to bypass a rejection.

## 6. Issue material to production

![Material issue](playwright-evidence/04-material-issue-annotated.png)

1. Open **Material Issue** and confirm the production station.
2. Scan the pack label.
3. Review material, quantity, GRN and batch in the confirmation dialog.
4. Select **Confirm Issue** once.

Only Inwarded labels can issue. Issue is intentionally online-only: if the red offline banner appears, restore the LAN connection before continuing. Generated, printed, duplicate, blocked and cancelled scans are rejected.

### Zebra 480 × 800 layout

![Zebra issue layout](playwright-evidence/07-zebra-issue-480x800-annotated.png)

The station and scan input are kept in the initial handheld viewport. The raised center **Scan** action is thumb-accessible from the bottom navigation.

## 7. Traceability

![Traceability result](playwright-evidence/05-traceability-annotated.png)

Search by:

- Label UID, for one physical pack journey
- GRN number, for receipt-related labels
- Material number
- Batch

The result shows current status and lifecycle events from label generation and printing through inward and production issue. Use Export when an audit copy is required.

## 8. Scanning policy

![Scanning configuration](playwright-evidence/06-scanning-config-annotated.png)

Administrators can require an issue station and control the duplicate-inward policy. Keep duplicate inward disabled for normal production. Offline issue queuing is intentionally unavailable because replaying queued scans could consume one pack twice.

## 9. Common rejection messages

| Message | Operator action |
|---|---|
| Label not found in system | Check the full UID and confirm that its GRN import/label generation completed |
| Label already inwarded | Do not inward again; use Traceability to verify the first event |
| Label must be inwarded before issue | Complete physical inward first |
| Label already issued to production | Stop and verify the physical pack and trace history |
| Label is blocked/cancelled | Contact the store manager or administrator |
| You are offline | Restore the plant LAN before issuing |

## 10. Test and support evidence

The automated test report is [PLAYWRIGHT-TEST-REPORT.md](PLAYWRIGHT-TEST-REPORT.md). It includes the covered routes, defect resolutions, commands, responsive profiles, accessibility result and known integration boundaries.
