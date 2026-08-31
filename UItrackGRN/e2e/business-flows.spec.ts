import { expect, test } from "@playwright/test";
import { createImportedLabel, desktopOnly, gotoReady } from "./helpers";

test.describe("business workflows", () => {
  test("business CSV auto-maps, previews and persists through the UI", async ({
    page,
  }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/import");
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "invalid.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("bad"),
    });
    await expect(
      page.getByText("Only .xlsx, .csv, .tsv and .txt files are supported"),
    ).toBeVisible();

    const grnNumber = `8${Date.now().toString().slice(-9)}`;
    const csv = [
      "Gr No,Gr date,Material,Material Description,Quantity,UOM,Vendor,Invo No,Inv Date,Sup Name,Bin loc,Mfg date,Exp Date,Pack Qty,No of Labels to print",
      `${grnNumber},03.08.2025,M06030952,COMPRESSION BUMPER,"1,000",PC,1094852,PW-INV-${grnNumber},02.08.2025,Kumar Automates,210,01.08.2025,01.08.2027,200,5`,
    ].join("\n");
    await input.setInputFiles({
      name: `${grnNumber}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    await expect(page.getByText("File parsed")).toBeVisible();
    await expect(page.getByText("1094852 · Kumar Automates")).toBeVisible();
    await expect(page.getByText(`PW-INV-${grnNumber} · Bin 210`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Commit Import" })).toBeVisible();
    await page.getByRole("button", { name: "Commit Import" }).click();
    await page.getByRole("button", { name: "Commit Import", exact: true }).last().click();
    await expect(page.getByText("Import committed")).toBeVisible();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();

    await gotoReady(page, "/grns");
    await page.getByPlaceholder(/Search records/).fill(grnNumber);
    await page.getByText(grnNumber, { exact: true }).click();
    await expect(page.getByText(`PW-INV-${grnNumber} · 2025-08-02`)).toBeVisible();
    await page.getByRole("tab", { name: "Line Items" }).click();
    await expect(page.getByText("210", { exact: true })).toBeVisible();
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
    await expect(page.getByText("Reprint sent")).toBeVisible();
  });

  test("a generated label can be printed from its preview", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    const generated = await createImportedLabel(page.request);
    await gotoReady(page, "/labels");
    await page.getByPlaceholder("Search records…").fill(generated.labelUid);
    await page.getByText(generated.labelUid, { exact: true }).first().click();
    await page.getByRole("button", { name: "Print & Inward Selected" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(generated.labelUid);
    await page.getByRole("button", { name: "Print & Inward", exact: true }).click();
    await expect(page.getByText("Label printed and inwarded")).toBeVisible();
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
