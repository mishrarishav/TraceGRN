import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

const pdfLabels = [1, 2, 3].map((sequence) => ({
  labelUid: `LBL-${String(sequence).padStart(32, "0")}`,
  grnNumber: "5000515455",
  materialNumber: `M0603095${sequence}`,
  description:
    sequence === 2
      ? "COMPRESSION BUMPER WITH A LONG SAP MATERIAL DESCRIPTION TO CHECK LABEL WRAPPING AND PRINT MARGINS"
      : "COMPRESSION BUMPER",
  quantity: 200,
  uom: "PC",
  batch: "TEST-BATCH",
  grnDate: "2026-10-06",
  binSequence: `${String(sequence).padStart(2, "0")} of 3`,
  status: sequence === 3 ? "Inwarded" : "Generated",
  printCount: sequence === 3 ? 1 : 0,
  generatedAt: "2026-10-06T06:30:00Z",
  qrPayload: `GRN Number: 5000515455\nMaterial: M0603095${sequence}\nQuantity: 200 PC\nGRN Date: 06-10-26\nLabel Date: 06-10-26, 12-00-00\nLabel ID: LBL-${String(sequence).padStart(32, "0")}`,
}));

async function mockPrinting(page: Page) {
  await authenticate(page);
  const writes: string[] = [];
  const logo = await readFile("public/branding/AppLogo.png");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      writes.push(url.pathname);
      return json(route, { ok: true, printer: "Zebra UAT", printCount: 1, status: "Inwarded" });
    }
    if (url.pathname === "/api/labels") return json(route, pdfLabels);
    if (url.pathname === "/api/system/branding") {
      return json(route, {
        appName: "TrackGRN",
        version: "1.1.2",
        clientName: "Tenneco UAT",
        clientLogoDataUrl: `data:image/png;base64,${logo.toString("base64")}`,
      });
    }
    if (url.pathname === "/api/configuration") {
      return json(route, {
        identificationStrategy: {
          strategyType: "GrnAndMaterial",
          name: "GRN + Material",
          selectedFields: [],
        },
        businessRules: {},
        labelConfiguration: {},
        plantConfiguration: { clientName: "Tenneco UAT" },
        importConfiguration: {},
        mappingTemplates: [],
        printing: {
          mode: "WindowsSpooler",
          printerName: "Zebra UAT",
          host: null,
          port: 9100,
          dpi: 203,
          connectionTimeoutSeconds: 5,
          hardwareReady: true,
        },
      });
    }
    return json(route, user);
  });
  return writes;
}

async function choosePdf(page: Page) {
  await page.getByRole("combobox", { name: "Print output", exact: true }).last().click();
  await page.getByRole("option", { name: "PDF", exact: true }).click();
}

async function downloadLabelPdf(preview: Page, path: string, pages: number) {
  await expect(preview.getByText(`${pages} label(s) - one label per page`)).toBeVisible();
  await expect(
    preview.getByText("Print at Actual size / 100% using 100 x 75 mm paper."),
  ).toBeVisible();
  const downloadPromise = preview.waitForEvent("download");
  await preview.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  await download.saveAs(path);
  const bytes = await readFile(path);
  const content = bytes.toString("latin1");
  expect(content.startsWith("%PDF-")).toBe(true);
  expect(content.match(/\/Type \/Page\b/g)).toHaveLength(pages);
  const dimensions = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(content);
  expect(dimensions).not.toBeNull();
  expect((Number(dimensions![1]) * 25.4) / 72).toBeCloseTo(100, 2);
  expect((Number(dimensions![2]) * 25.4) / 72).toBeCloseTo(75, 2);
  return download;
}

test("single label exports a real PDF offline without printing or inward writes", async ({
  page,
  context,
}, testInfo) => {
  const writes = await mockPrinting(page);
  await page.goto("/labels");
  await page.locator('html[data-hydrated="true"]').waitFor();
  await expect(
    page.getByRole("button", { name: "Print & Inward Selected", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await choosePdf(page);
  await context.setOffline(true);
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open Label PDF", exact: true }).click();
  const preview = await popupPromise;
  const download = await downloadLabelPdf(preview, testInfo.outputPath("single-label.pdf"), 1);
  expect(download.suggestedFilename()).toBe(`TrackGRN-${pdfLabels[0]!.labelUid}.pdf`);
  await page.screenshot({ path: testInfo.outputPath("pdf-output-ui.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const exportButton = page.getByRole("button", { name: "Open Label PDF", exact: true });
  await exportButton.scrollIntoViewIfNeeded();
  const bounds = await exportButton.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("pdf-output-mobile.png"), fullPage: true });
  expect(writes).toEqual([]);
});

test("batch PDF exports only the chosen range including previously inwarded labels", async ({
  page,
  context,
}, testInfo) => {
  const writes = await mockPrinting(page);
  await page.goto("/labels");
  await expect(page.getByRole("button", { name: "Batch Print", exact: true })).toBeEnabled();
  await choosePdf(page);
  await page.getByRole("button", { name: "Batch PDF", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Batch PDF Preview" })).toBeVisible();
  await page.getByLabel("From label").fill("2");
  await page.getByLabel("To label").fill("3");
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open PDF (2 Labels)", exact: true }).click();
  await downloadLabelPdf(await popupPromise, testInfo.outputPath("batch-labels.pdf"), 2);
  expect(writes).toEqual([]);
});

test("Printer output still dispatches the selected label through the API", async ({ page }) => {
  const writes = await mockPrinting(page);
  await page.goto("/labels");
  await page.getByRole("button", { name: "Print & Inward Selected", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Print & Inward", exact: true }).last().click();
  await expect(page.getByText("Label printed and inwarded", { exact: true })).toBeVisible();
  expect(writes).toEqual([`/api/labels/${pdfLabels[0]!.labelUid}/print`]);
});

test("Configuration test PDF works without a connected printer", async ({
  page,
  context,
}, testInfo) => {
  const writes = await mockPrinting(page);
  await page.goto("/configuration");
  await page.getByRole("tab", { name: "Plant & Hardware" }).click();
  await choosePdf(page);
  await expect(page.getByRole("button", { name: "Save & Test Printer", exact: true })).toBeHidden();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open Test PDF", exact: true }).click();
  await downloadLabelPdf(await popupPromise, testInfo.outputPath("test-label.pdf"), 1);
  expect(writes).toEqual([]);
});

test("blocked PDF popups show an actionable error without dispatching a print job", async ({
  page,
}) => {
  const writes = await mockPrinting(page);
  await page.goto("/labels");
  await choosePdf(page);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Open Label PDF", exact: true }).click();
  await expect(page.getByText("Allow pop-ups for TrackGRN to open the label PDF.")).toBeVisible();
  expect(writes).toEqual([]);
});
