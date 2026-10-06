import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createImportedLabel, desktopOnly, gotoReady } from "./helpers";

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

    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("menuitem", { name: "Configuration" }).click();
    await expect(page).toHaveURL(/\/configuration$/);
    await page.getByRole("button", { name: "Collapse" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("sidebar separates master data from operational workflows", async ({ page }) => {
    await gotoReady(page, "/");
    const sidebar = page.getByTestId("sidebar-scroll");
    await expect(sidebar.getByText("Overview", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Master Data", { exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Materials", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Vendors", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "SAP GRN Import", exact: true })).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Label Material Inward", exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "GRNs", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Material Inward", exact: true })).toHaveCount(
      0,
    );
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
    await page.getByRole("menuitem", { name: "Done", exact: true }).click();

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: "Export CSV" }).click();
    await expect(page.getByText("Report downloaded")).toBeVisible();

    await page.getByPlaceholder("Search records…").clear();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Page 2 /")).toBeVisible();
  });

  test("table, content, sidebar and app footer keep independent scroll positions", async ({
    page,
  }) => {
    await gotoReady(page, "/labels");
    const main = page.getByTestId("app-content-scroll");
    const sidebar = page.getByTestId("sidebar-scroll");
    const tableScroll = page.getByTestId("data-table-scroll");
    const tableHeader = tableScroll.locator("thead th").first();
    const appFooter = page.getByTestId("app-footer");

    const dimensions = await tableScroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    const before = await page.evaluate(() => ({
      document: document.documentElement.scrollTop,
      main: document.querySelector<HTMLElement>('[data-testid="app-content-scroll"]')?.scrollTop,
      sidebar: document.querySelector<HTMLElement>('[data-testid="sidebar-scroll"]')?.scrollTop,
    }));
    const headerBefore = await tableHeader.boundingBox();
    expect(headerBefore).not.toBeNull();

    await tableScroll.hover();
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => tableScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    const after = await page.evaluate(() => ({
      document: document.documentElement.scrollTop,
      main: document.querySelector<HTMLElement>('[data-testid="app-content-scroll"]')?.scrollTop,
      sidebar: document.querySelector<HTMLElement>('[data-testid="sidebar-scroll"]')?.scrollTop,
    }));
    expect(after).toEqual(before);
    const headerAfter = await tableHeader.boundingBox();
    expect(Math.abs((headerAfter?.y ?? 0) - (headerBefore?.y ?? 0))).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("data-table-footer")).toBeVisible();
    await expect(appFooter.getByText("TrackGRN")).toBeVisible();
    await expect(appFooter.getByText("v1.1.2")).toBeVisible();
    await expect(appFooter.getByText("Powered by MAHAD GLOBUS INDIA")).toBeVisible();
    const footerBox = await appFooter.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(Math.round((footerBox?.y ?? 0) + (footerBox?.height ?? 0))).toBe(
      page.viewportSize()?.height,
    );
  });

  test("compact viewport drawer keeps its navigation independently scrollable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 560 });
    await gotoReady(page, "/users");
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog");
    const sidebar = drawer.getByTestId("sidebar-scroll");
    await expect(sidebar).toBeVisible();
    const dimensions = await sidebar.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    await sidebar.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(drawer.getByRole("link", { name: "Audit Log" })).toBeVisible();
  });

  test("client name and uploaded logo persist to header, footer and login", async ({ page }) => {
    const clientName = "Playwright Client Industries";
    const logoPath = fileURLToPath(new URL("../public/branding/AppLogo.png", import.meta.url));
    await gotoReady(page, "/configuration");
    const accessToken = await page.evaluate(() => localStorage.getItem("trackgrn-access-token"));
    expect(accessToken).not.toBeNull();
    const original = await page.evaluate(async (token) => {
      const response = await fetch("/api/configuration", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Configuration read failed: ${response.status}`);
      return await response.json();
    }, accessToken);

    const restorePayload = {
      identificationStrategy: original.identificationStrategy,
      businessRules: original.businessRules,
      labelConfiguration: original.labelConfiguration,
      plantConfiguration: original.plantConfiguration,
      importConfiguration: original.importConfiguration,
    };

    try {
      await page.getByRole("tab", { name: "Plant & Hardware" }).click();
      await page.getByLabel("Client name").fill(clientName);
      await page.locator("#client-logo-upload").setInputFiles(logoPath);
      await expect(page.getByRole("img", { name: "Client logo preview" })).toBeVisible();
      await page.getByRole("button", { name: "Save Changes" }).click();
      await expect(page.getByText("Configuration saved to SQL Server")).toBeVisible();
      await expect(page.getByLabel("Configured client").getByText(clientName)).toBeVisible();
      await expect(page.getByTestId("app-footer").getByText(clientName)).toBeVisible();

      await page.evaluate(() => localStorage.clear());
      const loginPage = await page.context().newPage();
      await loginPage.goto("/login");
      await loginPage.locator('html[data-hydrated="true"]').waitFor();
      const loginBranding = loginPage.getByTestId("login-client-branding");
      await expect(loginBranding.getByText(clientName)).toBeVisible();
      await expect(loginBranding.getByRole("img", { name: `${clientName} logo` })).toBeVisible();
      await loginPage.close();
    } finally {
      const restored = await page.evaluate(
        async ({ token, payload }) => {
          const response = await fetch("/api/configuration", {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          return response.ok;
        },
        { token: accessToken, payload: restorePayload },
      );
      expect(restored).toBeTruthy();
    }
  });

  test("tabular reports and configuration save provide feedback", async ({ page }) => {
    await gotoReady(page, "/reports");
    await expect(page.getByRole("button", { name: "Generate" })).toHaveCount(0);
    await expect(page.getByLabel("From Date")).toBeVisible();
    await expect(page.getByLabel("To Date")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Issued By filter" })).toBeVisible();

    const materialFilter = page.getByRole("combobox", { name: "Material filter" });
    await materialFilter.click();
    await expect(page.getByPlaceholder("Search material code or description…")).toBeVisible();
    await page.keyboard.press("Escape");

    const issueReport = page.locator('section[aria-labelledby="issue-report-heading"]');
    await expect(issueReport.getByRole("columnheader")).toHaveText([
      "Material Code",
      "Description",
      "GRN",
      "GRN Date",
      "Label Print Date",
      "Issue Date",
      "Issued By",
      "Issue Qty",
    ]);

    const importHistory = page.locator('section[aria-labelledby="smart-import-history-heading"]');
    await expect(importHistory.getByRole("columnheader")).toHaveText([
      "Imported At",
      "File",
      "Imported By",
      "Batch",
      "Rows",
      "New",
      "Updated",
      "Unchanged",
      "Warnings",
      "Rejected",
      "Status",
    ]);

    await gotoReady(page, "/configuration");
    await page.getByRole("tab", { name: "Scanning" }).click();
    const stationGuard = page.getByRole("switch", { name: "Require issue station" });
    await expect(stationGuard).toBeChecked();
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Configuration saved to SQL Server")).toBeVisible();
  });

  test("label material inward opens an exact batch range preview", async ({ page }) => {
    const generated = await createImportedLabel(page.request);
    await gotoReady(page, "/labels");
    await expect(page.getByRole("heading", { name: "Label Material Inward" })).toBeVisible();
    await page.getByPlaceholder("Search records…").fill(generated.labelUid);
    await page.getByText(generated.labelUid, { exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Print & Inward Selected" })).toBeVisible();
    await page.getByPlaceholder("Search records…").clear();
    await page.getByRole("button", { name: "Batch Print" }).click();

    const preview = page.getByRole("dialog", { name: "Batch Print Preview" });
    await expect(preview).toBeVisible();
    await expect(preview.getByText(/Printing 1 to \d+ of \d+ eligible labels/)).toBeVisible();
    await expect(preview.getByRole("columnheader", { name: "Label UID" })).toBeVisible();
    await expect(preview.getByRole("columnheader", { name: "Progress" })).toBeVisible();
    await preview.getByRole("button", { name: "Cancel" }).click();
  });

  test("printer configuration can be saved and tested from the UI", async ({ page }) => {
    let submittedPrinter: Record<string, unknown> | undefined;
    await page.route("**/api/configuration/printer/agents/discover", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          scannedAt: new Date().toISOString(),
          scannedHosts: 254,
          networks: [
            {
              interfaceName: "Plant Wi-Fi",
              localAddress: "192.168.1.3",
              subnet: "192.168.1.0/24",
            },
          ],
          agents: [
            {
              host: "192.168.1.24",
              port: 17891,
              machineName: "PACKING-LAPTOP-02",
              version: "1.0.0",
              source: "TrackGRN Agent · Plant Wi-Fi",
              latencyMs: 12,
              printers: ["ZDesigner ZD230-203dpi ZPL"],
            },
          ],
        }),
      });
    });
    await page.route("**/api/configuration/printer/configure-and-test", async (route) => {
      submittedPrinter = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          saved: true,
          labelUid: "TEST-20260827-120000",
          mode: "LocalAgent",
          printer: "ZDesigner ZD230-203dpi ZPL",
          host: "192.168.1.24",
          port: 17891,
          dpi: 203,
        }),
      });
    });
    await gotoReady(page, "/configuration");
    await page.getByRole("tab", { name: "Plant & Hardware" }).click();

    await page.getByLabel("Printer connection mode").click();
    await page.getByRole("option", { name: "Network printer (IP / port 9100)" }).click();
    await expect(page.getByRole("button", { name: "Find Printer IP" })).toBeVisible();

    await page.getByLabel("Printer connection mode").click();
    await page.getByRole("option", { name: "Print locally via installed Agent" }).click();
    await expect(page.getByRole("button", { name: "Find Printer IP" })).toBeHidden();
    const installer = page.getByRole("link", { name: "Download MSI" });
    await expect(installer).toHaveAttribute("download", "");
    await expect(installer).toHaveAttribute("href", /\/downloads\/TrackGRN-PrintAgent\.msi$/);
    const downloadPromise = page.waitForEvent("download");
    await installer.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("TrackGRN-PrintAgent.msi");
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    expect((await stat(downloadPath!)).size).toBeGreaterThan(30_000_000);
    await page.getByRole("button", { name: "Find Installed Print Agents" }).click();
    await expect(page.getByText("PACKING-LAPTOP-02")).toBeVisible();
    await expect(page.getByText("ZDesigner ZD230-203dpi ZPL")).toBeVisible();
    await page.getByRole("button", { name: "Use this printer" }).click();
    await expect(page.getByLabel("Print Agent IP or hostname")).toHaveValue("192.168.1.24");
    await expect(page.getByLabel("Printer name")).toHaveValue("ZDesigner ZD230-203dpi ZPL");

    await page.getByRole("button", { name: "Save & Test Printer" }).click();
    await expect(page.getByText("Printer saved and test label dispatched")).toBeVisible();
    expect(submittedPrinter).toMatchObject({
      mode: "LocalAgent",
      printerName: "ZDesigner ZD230-203dpi ZPL",
      host: "192.168.1.24",
      port: 17891,
    });
  });

  test("installed local agent dispatches a physical Zebra test label", async ({ page }) => {
    test.skip(
      process.env["TRACKGRN_PHYSICAL_PRINTER"] !== "1",
      "Physical printer tests are opt-in.",
    );
    const printerName =
      process.env["TRACKGRN_PHYSICAL_PRINTER_NAME"] ?? "ZDesigner ZD230-203dpi ZPL";

    await gotoReady(page, "/configuration");
    await page.getByRole("tab", { name: "Plant & Hardware" }).click();
    await page.getByLabel("Printer connection mode").click();
    await page.getByRole("option", { name: "Print locally via installed Agent" }).click();
    await page.getByRole("button", { name: "Find Installed Print Agents" }).click();
    const printerRow = page.getByText(printerName, { exact: true }).locator("..");
    await expect(printerRow).toBeVisible({ timeout: 20_000 });
    await printerRow.getByRole("button", { name: "Use this printer" }).click();
    await page.getByRole("button", { name: "Save & Test Printer" }).click();
    await expect(page.getByText("Printer saved and test label dispatched").last()).toBeVisible({
      timeout: 15_000,
    });
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
