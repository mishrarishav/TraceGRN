import { expect, test } from "@playwright/test";
import { desktopOnly, gotoReady } from "./helpers";

test.describe("navigation and operational controls", () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    test.skip(desktopOnly(testInfo), "Control flows run once in the desktop project.");
  });

  test("global search opens and runs traceability", async ({ page }) => {
    await gotoReady(page, "/");
    const search = page.getByRole("search").getByLabel("Global traceability search");
    await page.keyboard.press("Control+K");
    await expect(search).toBeFocused();
    await search.fill("LBL-00003452");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/traceability\?q=LBL-00003452/);
    await expect(page.getByRole("heading", { name: "LBL-00003452" })).toBeVisible();
  });

  test("notifications, profile navigation and sidebar collapse work", async ({ page }) => {
    await gotoReady(page, "/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
    await expect(page.locator("[data-radix-popper-content-wrapper] li").first()).toBeVisible();

    await page.getByRole("button", { name: /Development Administrator/ }).click();
    await page.getByRole("menuitem", { name: "Configuration" }).click();
    await expect(page).toHaveURL(/\/configuration$/);
    await page.getByRole("button", { name: "Collapse" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("table search, columns, pagination and export controls respond", async ({ page }) => {
    await gotoReady(page, "/labels");
    const table = page.getByRole("table");
    await page.getByPlaceholder("Search records…").fill("LBL-00003452");
    await expect(page.getByText("Showing 1 of 1 records")).toBeVisible();
    await expect(table.getByText("LBL-00003452")).toBeVisible();

    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Batch" }).click();
    await expect(table.getByRole("columnheader", { name: "Batch" })).toBeVisible();

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: "Export CSV" }).click();
    await expect(page.getByText("Report downloaded")).toBeVisible();

    await page.getByPlaceholder("Search records…").clear();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Page 2 /")).toBeVisible();
  });

  test("report generation and configuration save provide feedback", async ({ page }) => {
    await gotoReady(page, "/reports");
    await page.getByRole("button", { name: "Generate" }).first().click();
    await expect(page.getByText("Report downloaded")).toBeVisible();

    await gotoReady(page, "/configuration");
    await page.getByRole("tab", { name: "Scanning" }).click();
    const stationGuard = page.getByRole("switch", { name: "Require issue station" });
    await expect(stationGuard).toBeChecked();
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Configuration saved to SQL Server")).toBeVisible();
  });

  test("offline mode warns that issue transactions require connectivity", async ({
    page,
    context,
  }) => {
    await gotoReady(page, "/issue");
    await context.setOffline(true);
    await expect(page.getByText("You are offline.")).toBeVisible();
    await expect(page.getByText("Issue transactions require an active connection.")).toBeVisible();
    await context.setOffline(false);
  });
});
