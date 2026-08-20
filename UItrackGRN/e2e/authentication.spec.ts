import { expect, test, type Page } from "@playwright/test";
import { desktopOnly, gotoReady, handheldOnly } from "./helpers";

async function enterValidCredentials(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByLabel("Username").fill("admin");
  await expect(page.getByLabel("Username")).toHaveValue("admin");
  await page.getByLabel("Password").fill("TrackGRN-Dev-Admin-2026!");
  await expect(page.getByLabel("Password")).toHaveValue("TrackGRN-Dev-Admin-2026!");
}

async function expectLoginViewportLocked(page: Page) {
  await expect(page.getByText("Demo credentials")).toHaveCount(0);
  await expect(page.getByText(/Plant 1000.*Store Operations/)).toHaveCount(0);
  const pageOverflow = await page.evaluate(() => ({
    body: document.body.scrollHeight - window.innerHeight,
    document: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(pageOverflow.body).toBeLessThanOrEqual(0);
  expect(pageOverflow.document).toBeLessThanOrEqual(0);
}

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

  test("valid credentials open the dashboard", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Functional flow runs once in the desktop project.");
    await gotoReady(page, "/login");
    await expect(page.locator('[role="img"][aria-label="TrackGRN"]:visible')).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.ico");
    await expect(page.getByText("Powered by MAHAD GLOBUS INDIA")).toBeVisible();
    await expect(
      page.getByTestId("login-footer").getByText("v1.1.2", { exact: true }),
    ).toBeVisible();
    await expectLoginViewportLocked(page);
    await enterValidCredentials(page);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
    await expect(page.locator('aside img[src="/branding/AppLogo.png"]')).toBeVisible();
  });

  test("mobile HTTP login works when crypto.randomUUID is unavailable", async ({
    page,
  }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Compatibility flow runs once in the desktop project.");
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        value: undefined,
        configurable: true,
      });
    });
    await gotoReady(page, "/login");
    await enterValidCredentials(page);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("trackgrn-device-id")))
      .toMatch(/^WEB-/);
  });

  test("mobile login branding and fixed app footer stay above navigation", async ({
    page,
  }, testInfo) => {
    test.skip(handheldOnly(testInfo), "Responsive shell runs only in handheld projects.");
    await gotoReady(page, "/login");
    await expect(page.locator('[role="img"][aria-label="TrackGRN"]:visible')).toBeVisible();
    const loginFooter = page.getByTestId("login-footer");
    await expectLoginViewportLocked(page);
    const loginFooterBox = await loginFooter.boundingBox();
    expect(Math.round((loginFooterBox?.y ?? 0) + (loginFooterBox?.height ?? 0))).toBe(
      page.viewportSize()?.height,
    );
    await enterValidCredentials(page);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
    const appFooterBox = await page.getByTestId("app-footer").boundingBox();
    const mobileNavBox = await page.getByTestId("mobile-navigation").boundingBox();
    expect(
      Math.abs(
        Math.round((appFooterBox?.y ?? 0) + (appFooterBox?.height ?? 0)) -
          Math.round(mobileNavBox?.y ?? 0),
      ),
    ).toBeLessThanOrEqual(1);
  });
});
