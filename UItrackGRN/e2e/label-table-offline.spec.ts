import { expect, test, type Page } from "@playwright/test";
import type { MaterialLabel } from "../src/types";

const labels: MaterialLabel[] = Array.from({ length: 2000 }, (_, index) => ({
  labelUid: `LBL-${String(index + 1).padStart(32, "0")}`,
  materialNumber: index < 60 ? "MT1A15128" : "OTHER-MATERIAL",
  description: "Test material",
  grnNumber: index < 30 ? "GRN-A" : "GRN-B",
  quantity: index + 1,
  uom: "PC",
  batch: "TEST-BATCH",
  grnDate: "2026-10-06",
  binSequence: `${index < 60 ? 60 - index : index + 1} of 60`,
  status: "Generated",
  printCount: 0,
  generatedAt: "2026-10-06T10:00:00Z",
}));

async function openLabels(page: Page, rows = labels) {
  const user = {
    id: "table-test",
    username: "test",
    fullName: "Table Test",
    role: "Admin",
    roleDisplay: "Admin",
  };
  const printed: string[] = [];
  await page.addInitScript((value) => {
    localStorage.setItem("trackgrn-access-token", "table-test-token");
    localStorage.setItem("trackgrn-user", JSON.stringify(value));
  }, user);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = user;
    if (route.request().method() !== "GET") {
      printed.push(url.pathname);
      body = { ok: true, printer: "Mock Zebra", printCount: 1, status: "Inwarded" };
    } else if (url.pathname === "/api/labels") body = rows;
    else if (url.pathname === "/api/system/branding")
      body = { appName: "TrackGRN", clientName: "Test Plant" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/labels");
  const table = page.getByTestId("data-table");
  await expect(table.getByTestId("data-table-footer")).toContainText(`of ${rows.length} records`);
  return { table, printed, search: table.getByPlaceholder("Search records…") };
}

async function choosePdf(page: Page) {
  await page.getByRole("combobox", { name: "Print output", exact: true }).last().click();
  await page.getByRole("option", { name: "PDF", exact: true }).click();
}

test("columns stay open for multiple changes and close with Done, Escape or an outside click", async ({
  page,
}) => {
  const { table } = await openLabels(page);
  await table.getByRole("button", { name: "Columns", exact: true }).click();
  const menu = page.getByRole("menu");
  for (const name of ["GRN", "Material"]) {
    await menu.getByRole("menuitemcheckbox", { name, exact: true }).click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemcheckbox", { name, exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(table.getByRole("columnheader", { name, exact: true })).toHaveCount(0);
  }
  await menu.getByRole("menuitemcheckbox", { name: "Description", exact: true }).click();
  await expect(menu).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Description", exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Done", exact: true }).click();
  await expect(menu).toBeHidden();
  await table.getByRole("button", { name: "Columns", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await table.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("heading", { name: "Label Material Inward", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("search limits batch print to all 60 matches out of 2000 in table sort order", async ({
  page,
}) => {
  const { table, search, printed } = await openLabels(page);
  await search.fill("MT1A15128");
  await expect(table.getByTestId("data-table-footer")).toContainText("Showing 6 of 60 records");
  const headers = await table.getByRole("columnheader").allTextContents();
  expect(headers.indexOf("Sr. No.") + 1).toBe(headers.indexOf("Label No."));
  const serial = table.locator("tbody tr td:nth-child(5)");
  await expect(serial).toHaveText(["1", "2", "3", "4", "5", "6"]);
  await table.getByRole("button", { name: "Next", exact: true }).click();
  await expect(serial).toHaveText(["7", "8", "9", "10", "11", "12"]);
  await table.getByRole("button", { name: "Label No.", exact: true }).click();
  await expect(table.getByRole("columnheader", { name: "Label No.", exact: true })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(serial).toHaveText(["1", "2", "3", "4", "5", "6"]);
  await expect(table.locator("tbody tr td:nth-child(6)")).toHaveText([
    "1 of 60",
    "2 of 60",
    "3 of 60",
    "4 of 60",
    "5 of 60",
    "6 of 60",
  ]);
  await page.getByRole("button", { name: "Batch Print", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Batch Print Preview" });
  await expect(dialog.locator("tbody tr")).toHaveCount(60);
  await expect(dialog.getByLabel("To label")).toHaveValue("60");
  const expected = labels.slice(0, 60).reverse();
  await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText(
    expected.map((label) => label.labelUid),
  );
  await dialog.getByRole("button", { name: "Print & Inward 60 Labels", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Batch Complete", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(printed).toEqual(expected.map((label) => `/api/labels/${label.labelUid}/print`));
});

test("column filters combine with search and recover from zero matches", async ({
  page,
}, testInfo) => {
  const { table, search, printed } = await openLabels(page);
  await search.fill("MT1A15128");
  await table.getByRole("button", { name: "Filters", exact: true }).click();
  await table.getByRole("textbox", { name: "Filter GRN", exact: true }).fill("GRN-B");
  await expect(table.getByTestId("data-table-footer")).toContainText("of 30 records");
  await table.getByRole("textbox", { name: "Filter Pack Qty", exact: true }).fill("48");
  await expect(table.getByTestId("data-table-footer")).toContainText("Showing 1 of 1 records");
  await expect(table.locator("tbody tr td").first()).toHaveText(labels[47]!.labelUid);
  await page.getByRole("button", { name: "Batch Print", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText(labels[47]!.labelUid);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await table.getByRole("textbox", { name: "Filter Material", exact: true }).fill("NONEXISTENT");
  await expect(table.getByText("Nothing to show", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Batch Print", exact: true })).toBeDisabled();
  await expect(table.getByRole("textbox", { name: "Filter Material", exact: true })).toBeVisible();
  await table.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(table.getByTestId("data-table-footer")).toContainText("of 60 records");
  await page.screenshot({ path: testInfo.outputPath("label-table-filters.png"), fullPage: true });
  expect(printed).toEqual([]);
});

test("batch PDF keeps the searched, filtered and sorted range when switching output", async ({
  page,
  context,
}) => {
  const { table, search, printed } = await openLabels(page);
  await search.fill("MT1A15128");
  await table.getByRole("button", { name: "Filters", exact: true }).click();
  await table.getByRole("textbox", { name: "Filter GRN", exact: true }).fill("GRN-B");
  await table.getByRole("button", { name: "Pack Qty", exact: true }).click();
  await table.getByRole("button", { name: "Pack Qty", exact: true }).click();
  await expect(table.getByRole("columnheader", { name: "Pack Qty", exact: true })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await page.getByRole("button", { name: "Batch Print", exact: true }).click();
  await choosePdf(page);
  const dialog = page.getByRole("dialog", { name: "Batch PDF Preview" });
  await expect(dialog.getByLabel("To label")).toHaveValue("30");
  await dialog.getByLabel("From label").fill("2");
  await dialog.getByLabel("To label").fill("4");
  await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText([
    labels[58]!.labelUid,
    labels[57]!.labelUid,
    labels[56]!.labelUid,
  ]);
  const popupPromise = context.waitForEvent("page");
  await dialog.getByRole("button", { name: "Open PDF (3 Labels)", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByText("3 label(s) - one label per page")).toBeVisible();
  expect(printed).toEqual([]);
});

test("status filters and print eligibility remain in effect", async ({ page }) => {
  const statuses = ["Generated", "Inwarded", "Blocked", "Cancelled"] as const;
  const rows = labels.slice(0, 4).map((label, i) => ({ ...label, status: statuses[i]! }));
  const { table } = await openLabels(page, rows);
  await page.getByRole("button", { name: "Batch Print", exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(1);
  await choosePdf(page);
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(2);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await table.getByRole("combobox", { name: "Label status filter", exact: true }).click();
  await page.getByRole("option", { name: "Inwarded", exact: true }).click();
  await expect(table.getByTestId("data-table-footer")).toContainText("of 1 records");
  await page.getByRole("button", { name: "Batch PDF", exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr td:nth-child(2)")).toHaveText(
    rows[1]!.labelUid,
  );
});

test("table filter controls stay within the mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { table, search } = await openLabels(page);
  await search.fill("MT1A15128");
  await table.getByRole("button", { name: "Filters", exact: true }).click();
  const bounds = await table.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  for (const name of ["Columns", "Filters"]) {
    const buttonBounds = await table.getByRole("button", { name, exact: true }).boundingBox();
    expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath("label-table-mobile.png"), fullPage: true });
});
