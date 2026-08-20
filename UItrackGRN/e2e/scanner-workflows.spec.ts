import { expect, test } from "@playwright/test";
import { collectRuntimeErrors, createImportedLabel, desktopOnly, gotoReady } from "./helpers";

test.describe("scanner lifecycle", () => {
  test("simulation uses a current SQL label without browser randomUUID", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "zebra-mc9300",
      "Insecure-LAN compatibility flow runs on the Zebra-sized browser profile.",
    );

    const { labelUid } = await createImportedLabel(request);
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        value: undefined,
        configurable: true,
      });
    });
    const runtimeErrors = collectRuntimeErrors(page);

    await gotoReady(page, "/inward");
    await page.getByRole("button", { name: `Simulate ${labelUid}` }).click();
    await expect(page.getByText("Inward confirmed")).toBeVisible();

    const scanner = page.getByPlaceholder("LBL-00000000");
    await scanner.fill(labelUid);
    await scanner.press("Enter");
    await expect(page.getByText("Label already inwarded").first()).toBeVisible();
    expect(runtimeErrors.filter((error) => !error.includes("409 (Conflict)"))).toEqual([]);
  });

  test("a label follows the guarded inward-to-issue lifecycle", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      desktopOnly(testInfo),
      "Stateful scanner lifecycle runs once in the desktop project.",
    );

    const { labelUid: label } = await createImportedLabel(request);
    await gotoReady(page, "/issue");
    let scanner = page.getByPlaceholder("LBL-00000000");
    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByText("Label must be inwarded before issue").first()).toBeVisible();

    await gotoReady(page, "/inward");
    scanner = page.getByPlaceholder("LBL-00000000");
    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByText("Inward confirmed")).toBeVisible();
    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByText("Label already inwarded").first()).toBeVisible();

    await gotoReady(page, "/issue");
    scanner = page.getByPlaceholder("LBL-00000000");
    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirm Issue" }).click();
    await expect(page.getByText(/Issued to/).first()).toBeVisible();
    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByText("Label already issued to production").first()).toBeVisible();
  });
});
