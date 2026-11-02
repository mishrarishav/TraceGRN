import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { MaterialLabel } from "../src/types";
import { labelQrPayload } from "../src/lib/label-content";

const uid = (n: number) => `LBL-${String(n).padStart(32, "0")}`;
function fixtures(): MaterialLabel[] {
  return Array.from({ length: 39 }, (_, i) => ({
    labelUid: uid(i + 1),
    grnNumber: "5000515455",
    materialNumber: `PART-${String(Math.floor(i / 3) + 1).padStart(2, "0")}`,
    description: "UPPER SPRING SEAT WITH A LONG MATERIAL DESCRIPTION FOR WRAPPING VALIDATION",
    quantity: 25,
    uom: "PC",
    batch: "LEGACY-BATCH",
    grnDate: "2026-10-23",
    binSequence: `${(i % 3) + 1} of 3`,
    status: "Inwarded",
    printCount: 0,
    generatedAt: "2026-10-23T10:00:00Z",
    qrPayload: `GRN Number: 5000515455\nLabel ID: ${uid(i + 1)}`,
  }));
}
async function openLabels(page: Page, failOnce = "") {
  const labels = fixtures();
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const searches: string[] = [];
  const user = {
    id: "trial-operator",
    username: "trial",
    fullName: "Trial Operator",
    role: "Admin",
    roleDisplay: "Admin",
  };
  await page.addInitScript((user) => {
    localStorage.setItem("trackgrn-access-token", "trial-token");
    localStorage.setItem("trackgrn-user", JSON.stringify(user));
  }, user);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.searchParams;
    let body: unknown = user;
    let status = 200;
    const filtered = labels.filter((l) => {
      const search = p.get("search")?.toLowerCase();
      if (
        search &&
        !`${l.labelUid} ${l.materialNumber} ${l.grnNumber} ${l.description}`
          .toLowerCase()
          .includes(search)
      )
        return false;
      for (const [key, field] of [
        ["grn", "grnNumber"],
        ["material", "materialNumber"],
        ["uid", "labelUid"],
      ] as const) {
        const value = p.get(key);
        if (value && !(p.get("exact") === "true" ? l[field] === value : l[field].includes(value)))
          return false;
      }
      return !p.get("status") || p.get("status") === "All" || l.status === p.get("status");
    });
    if (request.method() !== "GET") {
      const data = request.postDataJSON();
      writes.push({ path: url.pathname, body: data });
      if (url.pathname === "/api/labels/pdf") {
        body = (data.labelUids as string[]).map((id) => {
          const l = labels.find((l) => l.labelUid === id)!;
          l.printCount++;
          l.qrPayload = l.labelUid;
          return { ...l };
        });
      } else if (url.pathname.endsWith("/print")) {
        const id = url.pathname.split("/")[3]!;
        if (id === failOnce) {
          failOnce = "";
          status = 503;
          body = { title: "Printer unavailable", detail: "Printer temporarily offline" };
        } else {
          const l = labels.find((l) => l.labelUid === id)!;
          l.printCount++;
          body = { ok: true, printer: "Zebra ZD230", printCount: l.printCount, status: l.status };
        }
      }
    } else if (url.pathname === "/api/labels/print-groups") {
      searches.push(url.search);
      const groups = new Map<string, Record<string, unknown>>();
      for (const l of filtered.filter((l) => l.printCount === 0)) {
        const g = groups.get(l.materialNumber) ?? { ...l, quantity: 0, labelCount: 0 };
        g.quantity = Number(g.quantity) + l.quantity;
        g.labelCount = Number(g.labelCount) + 1;
        groups.set(l.materialNumber, g);
      }
      const all = [...groups.values()];
      const start = (Number(p.get("page") ?? 1) - 1) * 12;
      body = { rows: all.slice(start, start + 12), total: all.length };
    } else if (url.pathname === "/api/labels/print-history") {
      const all = filtered.filter((l) => l.printCount > 0);
      const start = (Number(p.get("page") ?? 1) - 1) * 12;
      body = { rows: all.slice(start, start + 12), total: all.length };
    } else if (url.pathname === "/api/labels/print-selection")
      body = filtered.filter((l) => l.printCount === 0);
    else if (url.pathname === "/api/system/branding")
      body = { appName: "TrackGRN", clientName: "Tenneco", version: "1.2.0" };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/labels");
  const table = page.getByTestId("data-table");
  await expect(table.getByTestId("data-table-footer")).toContainText("Showing 12 of 13 records");
  return { labels, writes, searches, table };
}
async function choosePdf(page: Page) {
  await page.getByRole("combobox", { name: "Print output", exact: true }).last().click();
  await page.getByRole("option", { name: "PDF", exact: true }).click();
}

test("12 grouped rows, server pagination, filtering and UID-only preview", async ({
  page,
}, info) => {
  const { table, searches } = await openLabels(page);
  await expect(table.locator("tbody tr")).toHaveCount(12);
  await expect(table.locator("tbody tr").first()).toContainText("75 PC");
  await expect(table.locator("tbody tr").first()).toContainText("PART-01");
  await expect(page.getByRole("img", { name: `QR code for ${uid(1)}`, exact: true })).toBeVisible();
  await expect(page.locator("aside.panel")).not.toContainText("LEGACY-BATCH");
  await table.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("PART-13");
  expect(searches.some((s) => s.includes("page=2"))).toBe(true);
  await table.getByPlaceholder("Search records…").fill("PART-12");
  await expect(table.getByTestId("data-table-footer")).toContainText("Showing 1 of 1 records");
  await expect(table).toContainText("PART-12");
  await page.getByRole("button", { name: "Print All", exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("grouped-printing.png"), fullPage: true });
});

test("PDF output is real 100x75mm, recorded, and moves selected packs to history", async ({
  page,
  context,
}, info) => {
  const { writes, labels } = await openLabels(page);
  await choosePdf(page);
  await page.getByRole("button", { name: "Print selected part", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("To label", { exact: true }).fill("2");
  const popupPromise = context.waitForEvent("page");
  await dialog.getByRole("button", { name: "Open PDF (2 Labels)", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByText("2 label(s) - one label per page")).toBeVisible();
  const downloadPromise = popup.waitForEvent("download");
  await popup.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  const path = info.outputPath("feedback-labels.pdf");
  await download.saveAs(path);
  const bytes = await readFile(path);
  const pdf = bytes.toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);
  const dimensions = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!;
  expect((Number(dimensions[1]) * 25.4) / 72).toBeCloseTo(100, 2);
  expect((Number(dimensions[2]) * 25.4) / 72).toBeCloseTo(75, 2);
  expect(writes.map((w) => w.path)).toEqual(["/api/labels/pdf"]);
  expect(writes[0]!.body.labelUids).toEqual([uid(1), uid(2)]);
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("tab", { name: "Reprint History", exact: true }).click();
  await expect(page.getByTestId("data-table-footer")).toContainText("Showing 2 of 2 records");
  expect(labels.reduce((sum, l) => sum + l.quantity, 0)).toBe(975);
});

test("reprint requires a reason, retains UID and records one PDF output", async ({
  page,
  context,
}) => {
  const { labels, writes } = await openLabels(page);
  labels[0]!.printCount = 1;
  await page.getByRole("tab", { name: "Reprint History", exact: true }).click();
  await page
    .getByTestId("data-table")
    .getByRole("button", { name: "Reprint", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Reprint Label", exact: true }).click();
  await expect(confirmation).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirmation.getByLabel("Reprint reason", { exact: true }).fill("Damaged sticker");
  await choosePdf(page);
  const popupPromise = context.waitForEvent("page");
  await confirmation.getByRole("button", { name: "Reprint Label", exact: true }).click();
  await expect((await popupPromise).getByText("1 label(s) - one label per page")).toBeVisible();
  expect(writes).toEqual([
    { path: "/api/labels/pdf", body: { labelUids: [uid(1)], reason: "Damaged sticker" } },
  ]);
  expect(labels[0]!.printCount).toBe(2);
  expect(labels[0]!.quantity).toBe(25);
});

test("Zebra failures are visible and retry sends only the failed label", async ({ page }) => {
  const { writes } = await openLabels(page, uid(2));
  await page.getByRole("button", { name: "Print selected part", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Print 3 Labels", exact: true }).click();
  await expect(dialog.getByText("Printer temporarily offline")).toBeVisible();
  await dialog.getByRole("button", { name: "Retry failed labels", exact: true }).click();
  await expect(dialog.getByText("Completed", { exact: true })).toHaveCount(3);
  expect(writes.map((w) => w.path)).toEqual(
    [uid(1), uid(2), uid(3), uid(2)].map((id) => `/api/labels/${id}/print`),
  );
});

test("blocked PDF popup performs no database or printer write", async ({ page }) => {
  const { writes } = await openLabels(page);
  await choosePdf(page);
  await page.getByRole("button", { name: "Print selected part", exact: true }).click();
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Open PDF (3 Labels)", exact: true }).click();
  await expect(page.getByText("Allow pop-ups for TrackGRN to open the sticker PDF.")).toBeVisible();
  expect(writes).toEqual([]);
});

for (const width of [390, 480])
  test(`printing workspace fits ${width}px scanner/mobile viewport`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const { table } = await openLabels(page);
    const box = await table.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await expect(page.getByRole("tab", { name: "Reprint History", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`printing-${width}.png`), fullPage: true });
  });

test("legacy persisted QR data cannot leak back into newly printed QR", () => {
  const label = fixtures()[0]!;
  expect(labelQrPayload(label)).toBe(label.labelUid);
});
