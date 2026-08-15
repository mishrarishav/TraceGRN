import { expect, test } from "@playwright/test";
import { createSapWorkbook, desktopOnly, gotoReady } from "./helpers";

test.describe("business workflows", () => {
  test("SAP import rejects non-xlsx files and commits a valid preview", async ({
    page,
  }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/import");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("bad"),
    });
    await expect(page.getByText("Only .xlsx files are supported")).toBeVisible();

    const workbook = await createSapWorkbook();
    await input.setInputFiles({
      name: `${workbook.grnNumber}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbook.buffer,
    });
    await expect(page.getByText("File parsed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Commit Import" })).toBeVisible();
    await page.getByRole("button", { name: "Commit Import" }).click();
    await page.getByRole("button", { name: "Commit Import", exact: true }).last().click();
    await expect(page.getByText("Import committed")).toBeVisible();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  });

  test("GRN search opens a multi-material GRN detail", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/grns");
    await page.getByPlaceholder("Search records…").fill("500515334");
    await expect(page.getByText("Showing 1 of 1 records")).toBeVisible();
    await page.getByText("500515334", { exact: true }).click();
    await expect(page).toHaveURL(/\/grns\/500515334$/);
    await page.getByRole("tab", { name: "Line Items" }).click();
    for (const material of ["M01", "M0220", "M022", "M021"]) {
      await expect(page.getByText(material, { exact: true })).toBeVisible();
    }
  });

  test("traceability supports a valid label and a not-found state", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/traceability");
    const search = page.getByPlaceholder("Label UID, GRN, material or batch");
    await search.fill("LBL-00003452");
    await page.getByRole("button", { name: "Trace" }).click();
    await expect(page.getByRole("heading", { name: "LBL-00003452" })).toBeVisible();
    await expect(page.getByText("Issued to Production")).toBeVisible();

    await search.fill("UNKNOWN-LABEL");
    await page.getByRole("button", { name: "Trace" }).click();
    await expect(page.getByText("No traceability record found")).toBeVisible();
  });

  test("label reprint requires confirmation and reports success", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/labels");
    await page.getByRole("button", { name: "Reprint" }).first().click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Reprint Label" }).click();
    await expect(page.getByText(/Reprint (sent|simulated)/)).toBeVisible();
  });

  test("theme selection persists after reload", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/");
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitem", { name: /Dark/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await page.locator('html[data-hydrated="true"]').waitFor();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
