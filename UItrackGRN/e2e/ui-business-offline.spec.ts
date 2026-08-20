import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  fullName: "Offline UI Test Admin",
  employeeCode: "UI-TEST",
  role: "Admin",
  roleDisplay: "Admin",
};

async function authenticate(page: Page) {
  await page.addInitScript((currentUser) => {
    localStorage.setItem("trackgrn-access-token", "offline-ui-token");
    localStorage.setItem("trackgrn-refresh-token", "offline-ui-refresh");
    localStorage.setItem("trackgrn-user", JSON.stringify(currentUser));
  }, user);
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("business CSV controls and mapped preview render without UI regressions", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/imports/options") {
      return json(route, {
        identificationStrategy: {
          id: "strategy-1",
          name: "GRN Number + Material Number",
          selectedFields: ["GRNNumber", "MaterialNumber"],
        },
        mappingTemplates: [{ id: "mapping-1", name: "Default SAP GRN Format", isDefault: true }],
      });
    }
    if (url.pathname === "/api/imports/preview") {
      return json(route, {
        batch: {
          batchId: "batch-1",
          fileName: "business.csv",
          uploadedAt: new Date().toISOString(),
          uploadedBy: "Offline UI Test Admin",
          totalRows: 1,
          newRows: 1,
          updated: 0,
          unchanged: 0,
          warnings: 0,
          rejected: 0,
          status: "Pending",
          durationSeconds: 0.1,
          fileHash: "offline-hash",
          identificationStrategy: "GRN Number + Material Number",
          mappingTemplate: "Default SAP GRN Format",
        },
        rows: [
          {
            id: "row-1",
            grnNumber: "5000515455",
            lineItem: 2,
            materialNumber: "M06030952",
            description: "COMPRESSION BUMPER",
            quantity: 1000,
            packingStandard: 200,
            batch: "",
            plant: "1000",
            uom: "PC",
            vendorCode: "1094852",
            vendorName: "Kumar Automates",
            invoiceNumber: "2526KG0208",
            binLocation: "210",
            expectedLabelCount: 5,
            status: "New",
            reason: "New business identity; row will be inserted.",
          },
        ],
      });
    }
    if (url.pathname === "/api/imports/batch-1/commit") {
      return json(route, { batchId: "batch-1", status: "Completed", applied: 1 });
    }
    return json(route, user);
  });

  await page.goto("/import");
  await page.locator('html[data-hydrated="true"]').waitFor();
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByText("Only .xlsx, .csv, .tsv and .txt files are supported")).toBeVisible();
  await input.setInputFiles({
    name: "business.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Gr No,Gr date,Material,Quantity\n5000515455,03.08.2025,M06030952,1000"),
  });
  await expect(page.getByText("File parsed")).toBeVisible();
  await expect(page.getByText("1094852 · Kumar Automates")).toBeVisible();
  await expect(page.getByText("2526KG0208 · Bin 210")).toBeVisible();
  await expect(page.getByText("5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Commit Import" }).click();
  await page.getByRole("button", { name: "Commit Import", exact: true }).last().click();
  await expect(page.getByText("Import committed")).toBeVisible();
});

test("vendor master preserves the existing UI CRUD pattern", async ({ page }) => {
  await authenticate(page);
  let vendors = [
    {
      id: "vendor-1094021",
      vendorCode: "1094021",
      vendorName: "KAMAL CED COATERS",
      aliases: ["Kamal CED"],
      grnCount: 0,
      status: "Active",
    },
  ];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/vendors" && route.request().method() === "GET")
      return json(route, vendors);
    if (url.pathname === "/api/vendors" && route.request().method() === "POST") {
      const request = route.request().postDataJSON() as {
        vendorCode: string;
        vendorName: string;
        aliases: string[];
      };
      vendors = [...vendors, { id: "vendor-new", ...request, grnCount: 0, status: "Active" }];
      return json(route, { id: "vendor-new" }, 201);
    }
    return json(route, user);
  });

  await page.goto("/vendors");
  await page.locator('html[data-hydrated="true"]').waitFor();
  await expect(page.getByText("1094021", { exact: true })).toBeVisible();
  await expect(page.getByText("Kamal CED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Vendor" }).click();
  await page.getByLabel("SAP vendor code").fill("PWV00001");
  await page.getByLabel("Canonical vendor name").fill("Playwright Vendor");
  await page.getByLabel("Vendor aliases").fill("PW Vendor, Vendor Alias");
  await page.getByRole("button", { name: "Save Vendor" }).click();
  await expect(page.getByText("Vendor created")).toBeVisible();
  await expect(page.getByText("PWV00001", { exact: true })).toBeVisible();
});
