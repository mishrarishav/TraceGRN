import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  fullName: "TrackGRN Test Admin",
  employeeCode: "UI-TEST",
  role: "Admin",
  roleDisplay: "Admin",
};

async function authenticate(page: Page) {
  await page.addInitScript((currentUser) => {
    localStorage.setItem("trackgrn-access-token", "duplicate-test-token");
    localStorage.setItem("trackgrn-refresh-token", "duplicate-test-refresh");
    localStorage.setItem("trackgrn-user", JSON.stringify(currentUser));
  }, user);
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("duplicate rows require Skip or Proceed decisions before import commit", async ({ page }) => {
  await authenticate(page);
  let commitPayload: unknown;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/system/branding") {
      return json(route, {
        appName: "TrackGRN",
        version: "1.1.2",
        clientName: "",
        clientLogoDataUrl: "",
      });
    }
    if (url.pathname === "/api/dashboard") return json(route, { activity: [] });
    if (url.pathname === "/api/imports/options") {
      return json(route, {
        identificationStrategy: {
          id: "strategy-1",
          name: "GRN Number + Material Number",
          selectedFields: ["GRNNumber", "MaterialNumber"],
        },
        mappingTemplates: [{ id: "mapping-1", name: "Saved SAP Format", isDefault: true }],
      });
    }
    if (url.pathname === "/api/imports/inspect") {
      return json(route, {
        fileName: "duplicate-grn.csv",
        extension: ".csv",
        sheets: [
          {
            name: "GRN Data",
            index: 0,
            rowCount: 4,
            columnCount: 4,
            previewTruncated: false,
            rows: [
              ["Gr No", "Gr date", "Material", "Quantity"],
              ["GRN-100", "21.08.2026", "M06081352", "80"],
              ["GRN-100", "21.08.2026", "M05N3N001", "196"],
              ["GRN-100", "21.08.2026", "M02100490", "500"],
            ],
          },
        ],
        selectedSheetName: "GRN Data",
        selectedHeaderRow: 1,
        matchedTemplate: { id: "mapping-1", name: "Saved SAP Format", confidence: 100 },
        mapping: {
          "Gr No": "grnNumber",
          "Gr date": "grnDate",
          Material: "materialNumber",
          Quantity: "receivedQuantity",
        },
        fields: [
          { key: "grnNumber", label: "GRN Number", required: true, aliases: ["Gr No"] },
          { key: "grnDate", label: "GRN Date", required: true, aliases: ["Gr date"] },
          {
            key: "materialNumber",
            label: "Material Number",
            required: true,
            aliases: ["Material"],
          },
          {
            key: "receivedQuantity",
            label: "Received Quantity",
            required: true,
            aliases: ["Quantity"],
          },
        ],
        requiredMapped: 4,
        requiredTotal: 4,
        readyForImport: true,
      });
    }
    if (url.pathname === "/api/imports/preview") {
      return json(route, {
        batch: {
          batchId: "batch-duplicate-1",
          fileName: "duplicate-grn.csv",
          uploadedAt: "2026-08-21T12:00:00Z",
          uploadedBy: user.fullName,
          totalRows: 3,
          newRows: 1,
          updated: 1,
          unchanged: 1,
          warnings: 0,
          rejected: 0,
          status: "Pending",
          durationSeconds: 0.2,
          fileHash: "duplicate-hash",
          identificationStrategy: "GRN Number + Material Number",
          mappingTemplate: "Saved SAP Format",
          isDuplicateFile: true,
        },
        rows: [
          {
            id: "row-new",
            excelRowNumber: 22,
            grnNumber: "GRN-100",
            lineItem: 22,
            materialNumber: "M06081352",
            description: "New material",
            quantity: 80,
            packingStandard: 250,
            batch: "",
            plant: "1000",
            uom: "PC",
            isDuplicate: false,
            requiresDuplicateDecision: false,
            status: "New",
            reason: "New business identity; row will be inserted.",
          },
          {
            id: "row-23",
            excelRowNumber: 23,
            grnNumber: "GRN-100",
            lineItem: 23,
            materialNumber: "M05N3N001",
            description: "Existing changed material",
            quantity: 196,
            previousQuantity: 180,
            packingStandard: 80,
            batch: "",
            plant: "1000",
            uom: "PC",
            isDuplicate: true,
            requiresDuplicateDecision: true,
            status: "Updated",
            reason: "Existing business identity; quantity changed from 180 to 196.",
          },
          {
            id: "row-45",
            excelRowNumber: 45,
            grnNumber: "GRN-100",
            lineItem: 45,
            materialNumber: "M02100490",
            description: "Existing unchanged material",
            quantity: 500,
            previousQuantity: 500,
            packingStandard: 500,
            batch: "",
            plant: "1000",
            uom: "PC",
            isDuplicate: true,
            requiresDuplicateDecision: true,
            status: "Unchanged",
            reason: "Existing business identity; values match SQL.",
          },
        ],
      });
    }
    if (url.pathname === "/api/imports/batch-duplicate-1/commit") {
      commitPayload = route.request().postDataJSON();
      return json(route, {
        batchId: "batch-duplicate-1",
        status: "Completed",
        applied: 2,
        skippedDuplicates: 1,
        proceededDuplicates: 1,
      });
    }
    return json(route, user);
  });

  await page.goto("/import");
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: "duplicate-grn.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Gr No,Gr date,Material,Quantity\nGRN-100,21.08.2026,M06081352,80"),
  });
  await expect(page.getByText("Workbook preview")).toBeVisible();
  await page.getByRole("button", { name: "Validate Selected Sheet" }).click();

  await expect(page.getByRole("dialog")).toContainText("Resolve duplicate row 1 of 2");
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip All", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Proceed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Proceed All", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Resolve duplicate row 2 of 2");
  await page.getByRole("button", { name: "Proceed All", exact: true }).click();

  await expect(page.getByText("This file has been imported before")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit Import", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Commit Import", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Commit Import", exact: true })
    .click();

  await expect
    .poll(() => commitPayload)
    .toEqual({
      duplicateDecisions: [
        { rowId: "row-23", action: "Skip" },
        { rowId: "row-45", action: "Proceed" },
      ],
    });
  await expect(page.getByText("Import committed")).toBeVisible();
});
