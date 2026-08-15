import { expect, test } from "@playwright/test";
import { desktopOnly, gotoReady } from "./helpers";

test.describe("SQL-backed master CRUD", () => {
  test("user create, edit, validation and deactivate", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Master editing is covered once on desktop");
    const suffix = Date.now().toString().slice(-9);
    const username = `pw${suffix}`;
    const employeeCode = `PWU-${suffix}`;

    await gotoReady(page, "/users");
    await page.getByRole("button", { name: "Add User" }).click();
    await page.getByRole("button", { name: "Save User" }).click();
    await expect
      .poll(() =>
        page.getByLabel("Full name").evaluate((input: HTMLInputElement) => input.checkValidity()),
      )
      .toBe(false);

    await page.getByLabel("Full name").fill(`Playwright User ${suffix}`);
    await page.getByLabel("Employee code").fill(employeeCode);
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("Playwright-Pass-2026!");
    await page.getByRole("button", { name: "Save User" }).click();
    await expect(page.getByText("User created")).toBeVisible();

    await page.getByPlaceholder("Search records…").fill(username);
    await page.getByText(username, { exact: true }).click();
    await page.getByLabel("Full name").fill(`Playwright Updated ${suffix}`);
    await page.getByRole("button", { name: "Save User" }).click();
    await expect(page.getByText("User updated")).toBeVisible();

    await page.getByPlaceholder("Search records…").fill(username);
    await page.getByText(username, { exact: true }).click();
    await page.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("User deactivated")).toBeVisible();
  });

  test("material create, edit, validation and deactivate", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Master editing is covered once on desktop");
    const suffix = Date.now().toString().slice(-9);
    const materialNumber = `PW-MAT-${suffix}`;

    await gotoReady(page, "/materials");
    await page.getByRole("button", { name: "Add Material" }).click();
    await page.getByLabel("Packing standard").fill("0");
    await page.getByRole("button", { name: "Save Material" }).click();
    await expect
      .poll(() =>
        page
          .getByLabel("Packing standard")
          .evaluate((input: HTMLInputElement) => input.checkValidity()),
      )
      .toBe(false);

    await page.getByLabel("Material number").fill(materialNumber);
    await page.getByLabel("Description").fill(`Playwright material ${suffix}`);
    await page.getByLabel("Packing standard").fill("25");
    await page.getByRole("button", { name: "Save Material" }).click();
    await expect(page.getByText("Material created")).toBeVisible();

    await page.getByPlaceholder("Search records…").fill(materialNumber);
    await page.getByRole("row").filter({ hasText: materialNumber }).click();
    await page.getByLabel("Description").fill(`Playwright material updated ${suffix}`);
    await page.getByRole("button", { name: "Save Material" }).click();
    await expect(page.getByText("Material updated")).toBeVisible();

    await page.getByPlaceholder("Search records…").fill(materialNumber);
    await page.getByRole("row").filter({ hasText: materialNumber }).click();
    await page.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("Material deactivated")).toBeVisible();
  });

  test("station create, edit, validation and deactivate", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Master editing is covered once on desktop");
    const suffix = Date.now().toString().slice(-9);
    const stationCode = `PW-${suffix}`;

    await gotoReady(page, "/stations");
    await page.getByRole("button", { name: "Add Station" }).click();
    await page.getByRole("button", { name: "Save Station" }).click();
    await expect
      .poll(() =>
        page
          .getByLabel("Station code")
          .evaluate((input: HTMLInputElement) => input.checkValidity()),
      )
      .toBe(false);

    await page.getByLabel("Station code").fill(stationCode);
    await page.getByLabel("Station name").fill(`Playwright Station ${suffix}`);
    await page.getByLabel("Location").fill("E2E Bay");
    await page.getByRole("button", { name: "Save Station" }).click();
    await expect(page.getByText("Station created")).toBeVisible();

    await page.getByRole("button", { name: new RegExp(stationCode) }).click();
    await page.getByLabel("Station name").fill(`Playwright Station Updated ${suffix}`);
    await page.getByRole("button", { name: "Save Station" }).click();
    await expect(page.getByText("Station updated", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: new RegExp(stationCode) }).click();
    await page.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("Station deactivated")).toBeVisible();
  });
});
