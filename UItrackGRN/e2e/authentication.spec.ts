import { expect, test } from "@playwright/test";
import { desktopOnly, gotoReady } from "./helpers";

test.describe("API authentication", () => {
  test("invalid credentials are rejected", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/login");
    await page.getByLabel("Username").fill("wrong-user");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Sign in failed")).toBeVisible();
  });

  test("valid demo credentials open the dashboard", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/login");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
  });
});
