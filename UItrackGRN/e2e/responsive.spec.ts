import { expect, test } from "@playwright/test";
import { expectNoBodyOverflow, gotoReady, handheldOnly } from "./helpers";

test.describe("handheld layouts", () => {
  for (const path of ["/", "/labels", "/issue", "/inventory", "/traceability"]) {
    test(`${path} fits the handheld viewport`, async ({ page }, testInfo) => {
      test.skip(handheldOnly(testInfo), "Responsive matrix only runs in handheld projects.");
      await gotoReady(page, path);
      await expectNoBodyOverflow(page);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText("Home", { exact: true }).last()).toBeVisible();
    });
  }

  test("issue scanner is reachable within the initial Zebra viewport", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "zebra-mc9300", "Zebra-specific viewport assertion.");
    await gotoReady(page, "/issue");
    const box = await page.getByPlaceholder("LBL-00000000").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
  });
});
