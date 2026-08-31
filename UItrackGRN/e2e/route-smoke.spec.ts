import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  collectRuntimeErrors,
  desktopOnly,
  expectNoBodyOverflow,
  gotoReady,
  routes,
} from "./helpers";

test.describe("desktop route health", () => {
  for (const [path, heading] of routes) {
    test(`${path} renders ${heading} without runtime or layout errors`, async ({
      page,
    }, testInfo) => {
      test.skip(desktopOnly(testInfo), "Desktop route matrix runs once in the desktop project.");
      const runtimeErrors = collectRuntimeErrors(page);
      await gotoReady(page, path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expectNoBodyOverflow(page);
      expect(runtimeErrors).toEqual([]);
    });
  }

  for (const path of [
    "/",
    "/login",
    "/import",
    "/labels",
    "/issue",
    "/traceability",
    "/configuration",
  ]) {
    test(`${path} has no serious accessibility violations`, async ({ page }, testInfo) => {
      test.skip(desktopOnly(testInfo), "Accessibility scan runs once in the desktop project.");
      await gotoReady(page, path);
      await page.waitForTimeout(600);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = result.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );
      expect(serious).toEqual([]);
    });
  }

  test("unknown route renders the recovery page", async ({ page }, testInfo) => {
    test.skip(desktopOnly(testInfo), "Desktop route matrix runs once in the desktop project.");
    await gotoReady(page, "/definitely-not-a-route");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});
