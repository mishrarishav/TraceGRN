# TrackGRN UI

App Name "TraceGRN"

Lovable Master Prompt — Material Traceability PWA UI

Build a complete, polished, production-quality frontend-only PWA UI for a manufacturing Material Traceability application.

The application tracks material from:

SAP GRN Excel Import → QR Label Generation → Material Inward → Storage → Store-to-Production Issue → Inventory Balance → Traceability & Reports

IMPORTANT:

Build UI/UX only

Do NOT create Supabase

Do NOT create PostgreSQL

Do NOT create any backend

Do NOT create real authentication

Do NOT integrate SAP APIs

Use realistic mock data and a clean mock service layer

The frontend must later be easy to connect with an ASP.NET Core Web API + Microsoft SQL Server backend

Keep API/service abstraction separate from components

Tech Stack

Use:

React

TypeScript

Vite

Tailwind CSS

shadcn/ui

Lucide React Icons

React Router

TanStack Query architecture

React Hook Form

Zod

Recharts

date-fns

Sonner for notifications/toasts

Framer Motion for subtle animations where useful

vite-plugin-pwa

Do not use Bootstrap.

Use Lovable's native React + Tailwind + shadcn architecture.

Design Direction

Create a premium industrial SaaS / manufacturing operations UI.

The UI should look like a real enterprise application, not a generic admin template.

Visual direction:

clean

premium

modern

industrial

information-rich

spacious but efficient

professional typography

excellent hierarchy

subtle shadows

soft borders

polished cards

contextual icons

restrained gradients

smooth micro-interactions

Avoid excessive glassmorphism or random gradients.

Light + Dark Theme

Implement complete theme support:

Light Theme

Dark Theme

System Theme

Add theme toggle in header.

Persist selected theme using localStorage.

Dark theme should NOT use pure black.

Use premium dark navy/slate tones.

Every component, chart, badge, modal, table and scanner screen must work correctly in both themes.

Animation

Use subtle professional animations.

Use Framer Motion where appropriate.

Examples:

KPI cards entrance animation

animated dashboard counters

page transition

scanner pulse animation

success check animation

QR scan animation

loading shimmer

progress animation

expandable rows

dialog transitions

status change animation

Do not over-animate.

Animations must never reduce usability.

Responsive Design

Application must work perfectly on:

Desktop

Laptop

Tablet

Android mobile

Zebra MC9300 handheld scanner

Desktop:

Use collapsible left sidebar + top navigation.

Tablet:

Use compact sidebar/drawer.

Mobile / Zebra:

Use mobile drawer and quick-access scan actions.

Scanner pages must have extremely large touch targets.

Application Branding

Use temporary brand:

TrackGRN

Subtitle:

Material Traceability System

Use a professional icon combining:

box/package

QR scan

movement/traceability

Use Lucide icons throughout.

Do NOT use emojis as UI icons.

Main Application Layout

Desktop layout:

Left sidebar

Top header

Main content area

Header should contain:

Global Search

Environment badge: DEMO

Theme switcher

Notifications

Help icon

User profile menu

Sidebar menu:

Dashboard

SAP GRN Import

GRNs

Materials

Labels

Material Inward

Material Issue

Inventory

Traceability

Reports

Import History

Revision History

Users

Stations

Configuration

Audit Log

1. Login Page

Create premium login page.

Fields:

Username

Password

Remember Me

Button:

Login

Display mock credentials:

Username: admin

Password: admin123

Include:

TrackGRN logo

Material Traceability System

Factory / warehouse inspired abstract background.

No real authentication required.

Login button should navigate to Dashboard.

2. Dashboard

Create executive operational dashboard.

KPI cards:

Today's GRNs

Imported Items

Received Quantity

Available Quantity

Today's Issued Quantity

Labels Generated

Pending Inward

Import Warnings

Each KPI should have:

icon

value

small trend

tooltip

Example values:

Today's GRNs: 28

Imported Items: 867

Received Qty: 86,500

Available Qty: 63,200

Issued Today: 23,300

Labels Generated: 142

Pending Inward: 18

Warnings: 4

Add charts:

Received vs Issued

7-day chart.

Top Materials

Horizontal bar chart.

Import Trend

Daily GRN import chart.

Label Status

Donut chart.

Add:

Recent Activity timeline.

3. SAP GRN Import

Create a multi-step professional workflow.

Stepper:

Upload

Column Mapping

Preview

Validation

Import Result

Upload

Large drag/drop area.

Accept:

.xlsx

Display:

filename

size

upload timestamp

uploaded by

Simulate upload progress.

Example file:

SAP_GRN_14_Aug_2026.xlsx

4. Excel Column Mapping

Create mapping screen.

Left:

Excel Column

Right:

Application Field

Example:

GRN No → GRN Number

Material → Material Number

Material Desc → Description

Qty → Received Quantity

Packing Qty → Packing Standard

Line Item → SAP Line Item Number

Batch → Batch Number

Plant → Plant

PO Number → Purchase Order

Allow:

Save Mapping Template

Reset Mapping

Auto Map

5. Import Preview

Display first 20 rows.

Columns:

GRN Number

SAP Line Item

Material Number

Description

Quantity

Packing

Batch

Plant

Status

Use realistic data.

Example:

GRN 500515334

Materials:

M01

M0220

M022

M021

Show multiple materials under same GRN.

Visually group GRN rows where useful.

6. Import Validation

Each row may have status:

NEW

UPDATED

UNCHANGED

WARNING

REJECTED

Use excellent status badges.

Example:

GRN 500515335

Material M100

Old Quantity:

10,000

New Quantity:

12,000

Status:

UPDATED

Show side-by-side changes.

Another example:

Previous Received:

10,000

Already Issued:

3,000

New SAP Quantity:

2,000

Status:

REJECTED

Reason:

New received quantity cannot be lower than already issued quantity.

7. Import Result

Show KPI cards:

Total Rows

New

Updated

Unchanged

Warnings

Rejected

Example:

Total: 867

New: 793

Updated: 42

Unchanged: 25

Warning: 5

Rejected: 2

Allow:

View Import

Download Error Report

Go to GRNs

8. GRN List

Create professional searchable data table.

Columns:

GRN Number

GRN Date

Vendor

Materials

Received Qty

Issued Qty

Available Qty

Status

Last Updated

Actions

Filters:

Date Range

GRN

Material

Vendor

Status

Plant

Provide:

Pagination

Sorting

Column selection

Export

9. GRN Detail Page

Header:

GRN Number

GRN Date

Vendor

PO

Plant

Storage Location

Import Batch

Display summary cards:

Received

Labelled

Inwarded

Issued

Available

Add tabs:

Overview

Line Items

Labels

Transactions

Revision History

Import History

10. GRN Line Items

Important:

One GRN can contain multiple materials.

Example:

GRN 500515334

Line 10

M01

Line 20

M0220

Line 30

M022

Line 40

M021

Columns:

Line

Material

Description

Received Qty

Packing Standard

Labels

Issued

Available

Status

11. Materials Page

Materials list.

Columns:

Material Number

Description

UOM

Packing Standard

Total Received

Total Issued

Available

Latest GRN

Status

Create Material Detail page.

Tabs:

Overview

GRNs

Labels

Transactions

History

12. Label Generation

Create label management page.

Filter by:

GRN

Material

Status

Date

Label statuses:

Generated

Printed

Inwarded

Issued

Blocked

Cancelled

Provide action:

Generate Labels

Example:

Received Quantity:

10,000

Packing Standard:

1,000

System result:

10 labels

If:

Quantity = 10,500

Packing = 1,000

Result:

10 × 1,000

1 × 500

Total:

11 labels

13. QR Label Preview

Create realistic thermal label preview.

Label should display:

TrackGRN

QR Code placeholder

Label UID

GRN Number

Material Number

Material Description

Quantity

UOM

Batch

GRN Date

Bin Sequence

Example:

Label UID:

LBL-00003452

GRN:

500515334

Material:

M01

Quantity:

1,000 PCS

Batch:

B240814-01

Bin:

03 of 10

Add:

Print

Print All

Reprint

Reprint should show confirmation dialog.

Include:

Previous print count.

14. Material Inward

This screen must be highly optimized for Zebra MC9300.

Design mobile-first scanner layout.

Header:

Material Inward

Large scan area.

Animated scanner icon.

Auto-focused input:

Scan QR / Label UID

Hardware keyboard wedge compatible.

Pressing Enter should simulate lookup.

After scan show material card:

Label UID

GRN

Material

Description

Quantity

Batch

Current Status

Large button:

CONFIRM INWARD

After confirmation:

show green animated success.

Example:

Material Successfully Inwarded

Then automatically clear scanner input after simulated delay.

Show recent scans below.

15. Material Issue

Most important scanner page.

Optimize heavily for Zebra MC9300.

Large header:

Material Issue

Station:

STORE-EXIT-01

Operator:

Rahul Sharma

Large scanning input.

After scan display:

Material

M01

GRN

500515334

Quantity

1,000 PCS

Batch

B240814-01

Status

AVAILABLE

Large full-width button:

ISSUE MATERIAL

Button must be extremely easy to tap.

On success:

large animated check icon.

Message:

Material Issued Successfully

Quantity:

1,000 PCS

Remaining:

7,000 PCS

Then automatically prepare next scan.

Create duplicate scan error state:

ALREADY ISSUED

This label was issued on:

14 Aug 2026

03:42 PM

By:

Rahul Sharma

Use large red warning.

16. Inventory

Create inventory page.

Tabs:

Material View

GRN View

Label View

Columns:

Material

GRN

Received

Labelled

Inwarded

Issued

Available

Blocked

Packing Standard

Use:

search

filters

pagination

export

17. Traceability

Create one of the most impressive pages.

Large universal search bar.

Search by:

QR / Label UID

GRN

Material

Batch

Operator

Transaction Number

Example search:

LBL-00003452

Display summary:

Material:

M01

GRN:

500515334

Quantity:

1,000 PCS

Current Status:

ISSUED

Then show vertical visual timeline:

SAP GRN Imported

↓

Label Generated

↓

Label Printed

↓

Material Inwarded

↓

Stored

↓

Issued to Production

Each step should show:

Date

Time

User

Station

Status

Add subtle animated timeline line.

18. Reports

Reports home page.

Report cards:

GRN Report

Material Inventory Report

Label Status Report

Issue History

Operator Activity

Import History

GRN Revision Report

Traceability Report

Use good icons.

Clicking report card should open report table.

Reports should contain:

Filters

Date range

Search

Export Excel

Export CSV

Print

Mock functionality only.

19. Import History

Columns:

Batch ID

File Name

Uploaded At

Uploaded By

Total Rows

New

Updated

Unchanged

Warnings

Rejected

Status

Duration

Add expandable row showing:

File Hash

Identification Strategy

Mapping Template

20. GRN Revision History

Show revision cards.

Example:

GRN:

500515335

Material:

M100

Old Quantity:

10,000

New Quantity:

12,000

Changed By:

SAP Import

Status:

VALID

Use side-by-side diff UI.

Show changed values with:

old value in muted/red style

new value in green/highlight style

Statuses:

Valid

Warning

Rejected

Admin Review

21. Unique Record Identification Configuration

THIS IS A CRITICAL SCREEN.

Page title:

GRN Record Identification Strategy

Explain:

The selected fields determine how incoming SAP rows are matched against existing GRN records.

Create radio/card options:

Strategy A

GRN Number + Material Number

Strategy B

GRN Number + SAP Line Item Number

Strategy C

GRN Number + Material Number + SAP Line Item Number

Strategy D

Custom Combination

For Custom Combination provide draggable / selectable field chips:

GRN Number

Material Number

SAP Line Item Number

Plant

Storage Location

Batch Number

Vendor Code

Purchase Order Number

PO Line

Allow:

Add Future Field

Display:

Selected Key Fields

Example:

GRN Number

Material Number

SAP Line Item

Live Business Key Preview:

500515334 | M01 | 10

Display sample hash:

a81fc7c972d34f...

Add warning alert:

Changing the identification strategy will apply to future imports. Historical records will retain the strategy used when originally imported.

Provide:

Save Strategy

Test Strategy

Reset

On Save show confirmation modal.

22. Excel Mapping Configuration

Config screen.

Create mappings.

Fields:

SAP Column

Application Field

Required

Active

Transform

Allow mapping templates.

Examples:

Default SAP GRN Format

Plant 1000 Format

23. Label Configuration

Settings:

Company Name

Label Width

Label Height

QR Size

Fields to Display

Show Batch

Show GRN Date

Show Description

Show Bin Sequence

Add live label preview.

24. Packing Rules

Display material-specific packing standards.

Columns:

Material

Default Packing

UOM

Allow Partial Pack

Updated By

Updated At

Provide edit modal.

25. Business Rules

Create toggle settings:

Require Inward Before Issue

Allow Label Reprint

Require Reprint Reason

Allow Duplicate Inward

Require Station for Issue

Allow GRN Revision After Labels Generated

Allow GRN Revision After Material Issued

Require Admin Review for Quantity Decrease

Mock save interactions.

26. Users

User management UI.

Roles:

Admin

Store Manager

Store Operator

Viewer

Columns:

Name

Employee Code

Username

Role

Status

Last Login

Actions

Provide Create User modal.

No actual authentication backend.

27. Stations

Create scanning station configuration.

Example:

STORE-EXIT-01

Store Production Exit

Type:

Issue Station

Status:

Active

Another:

STORE-INWARD-01

Incoming Material Station

Support mock Create/Edit Station.

28. Audit Log

Table:

Timestamp

User

Action

Module

Entity

Entity ID

Device

IP

Status

Actions examples:

Excel Uploaded

GRN Updated

Label Generated

Label Reprinted

Material Inwarded

Material Issued

Configuration Changed

Click row to open drawer.

Drawer should show:

Old Values

New Values

User

Device

Timestamp

Metadata

29. Mobile Navigation

On small devices prioritize:

Home

Inward

Scan/Issue

Inventory

Menu

Make scanner action visually prominent.

30. PWA UI

Configure basic PWA frontend structure.

Provide:

manifest

service worker setup

installable app support

mobile app feel

Add optional UI banner:

Install TrackGRN App

No backend required.

If offline:

Show:

You are offline

Issue transactions require an active connection.

Do NOT simulate secure offline inventory transactions.

31. Global Components

Create reusable:

AppSidebar

TopHeader

ThemeToggle

PageHeader

KPICard

DataTable

FilterBar

StatusBadge

EmptyState

LoadingSkeleton

ConfirmationDialog

QRPreview

ScannerInput

MaterialSummaryCard

Timeline

StatCard

ExportButton

RevisionDiff

UserAvatar

NotificationMenu

32. Status Design System

Create consistent colors/icons for:

New

Updated

Unchanged

Warning

Rejected

Generated

Printed

Inwarded

Issued

Blocked

Cancelled

Available

Admin Review

Ensure status colors work in light and dark mode.

33. Mock Data Architecture

Do NOT put all mock objects directly into JSX pages.

Create structure such as:

src/

components/

pages/

features/

services/

mocks/

types/

hooks/

utils/

layouts/

Create typed models:

User

Role

Material

GRNHeader

GRNLine

MaterialLabel

ImportBatch

ImportRowResult

MaterialTransaction

IdentificationStrategy

Station

AuditEvent

Create mock service functions such as:

getDashboardData()

getGRNs()

getGRNById()

uploadGRNMock()

getLabels()

scanLabel()

issueMaterial()

inwardMaterial()

getInventory()

searchTraceability()

getReports()

getAuditLogs()

Use small simulated API delays.

This architecture must allow the mock implementation to later be replaced with:

ASP.NET Core REST API

without rebuilding the UI.

34. Sample Business Data

Use realistic demo data.

Main GRN:

500515334

Line Items:

10 – M01

20 – M0220

30 – M022

40 – M021

Another GRN:

500515335

Example material:

M01

Description:

Automotive Assembly Component

Received:

10,000 PCS

Packing:

1,000 PCS

Labels:

10

Issued Labels:

3

Issued:

3,000

Available:

7,000

Revision example:

Old:

10,000

New:

12,000

Status:

Updated

Rejected revision:

Received:

10,000

Already Issued:

3,000

SAP Revised Quantity:

2,000

Status:

Rejected

35. Important Business Scope

DO NOT implement:

Rack management

Aisle management

Shelf management

Warehouse maps

Full WMS

Picking path optimization

SAP API integration

Production consumption

BOM tracking

Finished goods

Dispatch

Shipment

Customer portal

The application ends when material is issued from Store to Production.

36. UX Quality Requirements

Do not leave blank placeholder pages.

Every sidebar menu should open a finished screen.

Use realistic mock data everywhere.

Buttons should work where reasonable.

Filters should visibly filter mock data.

Dialogs should open.

Theme switch must work.

Scanner simulation must work.

Configuration selections must work.

Tables should support sorting/pagination where useful.

Provide polished:

Empty states

Loading states

Success states

Error states

Confirmation states

Do not make it look like a prototype wireframe.

Make it look like a nearly production-ready enterprise product.

37. Handoff Requirement

This project will later be connected to:

Backend:

ASP.NET Core Web API

Database:

Microsoft SQL Server

Authentication:

JWT

SAP integration may come later.

Therefore:

keep business types clean

isolate mock services

do not tightly couple frontend with Supabase

do not use Supabase-specific models

do not use Firebase

do not embed backend logic into React pages

centralize API/service calls

prepare environment variable such as:

VITE_API_BASE_URL

Later Codex should be able to replace mock services with real REST endpoints.

Final Instruction

Build the entire frontend application, not just the dashboard.

Prioritize these screens visually:

Dashboard

SAP GRN Import

GRN Detail

Label Generation

QR Label Preview

Material Inward

Material Issue

Inventory

Traceability

GRN Record Identification Strategy

The Material Issue scanner and Traceability page should be visually exceptional.

Use premium icons, excellent responsive behavior, switchable Light/Dark themes, subtle animations, realistic manufacturing data and a clean architecture suitable for later ASP.NET Core + MS SQL integration.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2bc82eb3-175b-42a1-9ea0-48e1cc6d289b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
