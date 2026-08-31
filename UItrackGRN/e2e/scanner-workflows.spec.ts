import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { collectRuntimeErrors, createImportedLabel, desktopOnly, gotoReady } from "./helpers";

const API_ORIGIN = process.env["TRACKGRN_API_ORIGIN"] ?? "http://127.0.0.1:5025";

async function printAndInwardLabel(page: Page, request: APIRequestContext, labelUid: string) {
  const accessToken = await page.evaluate(() => localStorage.getItem("trackgrn-access-token"));
  expect(accessToken).toBeTruthy();

  const response = await request.post(
    `${API_ORIGIN}/api/labels/${encodeURIComponent(labelUid)}/print`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {},
    },
  );
  const result = (await response.json()) as { status?: string; title?: string; detail?: string };
  expect(
    response.ok(),
    result.detail ?? result.title ?? "Print and inward request failed",
  ).toBeTruthy();
  expect(result.status).toBe("Inwarded");
}

test.describe("scanner lifecycle", () => {
  test("legacy inward route opens Label Material Inward without browser randomUUID", async ({
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
    await expect(page).toHaveURL(/\/labels\/?$/);
    await expect(page.getByRole("heading", { name: "Label Material Inward" })).toBeVisible();
    await expect(page.getByRole("button", { name: /simulate/i })).toHaveCount(0);

    await page.getByPlaceholder("Search records…").fill(labelUid);
    const labelRow = page.getByRole("row").filter({ hasText: labelUid });
    await expect(labelRow).toBeVisible();
    await expect(labelRow).toContainText("Generated");
    expect(runtimeErrors).toEqual([]);
  });

  test("a label follows the guarded inward-to-issue lifecycle", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      desktopOnly(testInfo),
      "Stateful scanner lifecycle runs once in the desktop project.",
    );

    const {
      labelUid: label,
      qrPayload,
      grnNumber,
      materialNumber,
    } = await createImportedLabel(request);
    await gotoReady(page, "/issue");
    const issuedMaterials = page.locator('section[aria-labelledby="issued-materials-heading"]');
    await expect(issuedMaterials.getByRole("columnheader")).toHaveText([
      "Material Code",
      "Description",
      "GRN",
      "GRN Date",
      "Label Print Date",
      "Issue Date",
      "Issued By",
      "Issue Qty",
    ]);

    let scanner = page.getByPlaceholder("Scan full QR payload or enter Label UID");
    await scanner.fill(qrPayload);
    await scanner.press("Enter");
    await expect(page.getByText("Label must be inwarded before issue").first()).toBeVisible();

    await printAndInwardLabel(page, request, label);
    scanner = page.getByPlaceholder("Scan full QR payload or enter Label UID");
    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText(`${label} issued to STORE-EXIT-01`)).toBeVisible();

    const issuedRow = issuedMaterials
      .getByRole("row")
      .filter({ hasText: grnNumber })
      .filter({ hasText: materialNumber });
    await expect(issuedRow).toBeVisible();
    await expect(issuedRow).toHaveClass(/bg-success\/10/);
    const issuedCells = issuedRow.getByRole("cell");
    await expect(issuedCells).toHaveCount(8);
    await expect(issuedCells.nth(0)).toHaveText(materialNumber);
    await expect(issuedCells.nth(1)).toContainText("Playwright material");
    await expect(issuedCells.nth(2)).toHaveText(grnNumber);
    await expect(issuedCells.nth(3)).toContainText(/\d/);
    await expect(issuedCells.nth(4)).toContainText(/\d/);
    await expect(issuedCells.nth(5)).toContainText(/\d/);
    await expect(issuedCells.nth(6)).toHaveText("TrackGRN Administrator");
    await expect(issuedCells.nth(7)).toContainText("1,000");

    await scanner.fill(label);
    await scanner.press("Enter");
    await expect(page.getByText("Label already issued to production").first()).toBeVisible();
  });
});
