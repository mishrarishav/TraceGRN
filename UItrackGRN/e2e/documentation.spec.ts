import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { desktopOnly, gotoReady } from "./helpers";

const evidenceDir = path.resolve(process.cwd(), "../docs/playwright-evidence");

async function annotate(page: Page, items: Array<{ locator: Locator; label: string }>) {
  const annotations: Array<{ x: number; y: number; width: number; height: number; label: string }> =
    [];
  for (const item of items) {
    const box = await item.locator.boundingBox();
    if (box) annotations.push({ ...box, label: item.label });
  }

  await page.evaluate((targets) => {
    document.querySelector("#playwright-documentation-overlay")?.remove();
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.id = "playwright-documentation-overlay";
    svg.setAttribute("width", String(window.innerWidth));
    svg.setAttribute("height", String(window.innerHeight));
    svg.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Segoe UI,Arial,sans-serif",
    );

    const defs = document.createElementNS(ns, "defs");
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "doc-arrow");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    const arrow = document.createElementNS(ns, "path");
    arrow.setAttribute("d", "M0,0 L0,6 L9,3 z");
    arrow.setAttribute("fill", "#ef4444");
    marker.append(arrow);
    defs.append(marker);
    svg.append(defs);

    targets.forEach((target) => {
      const highlight = document.createElementNS(ns, "rect");
      highlight.setAttribute("x", String(Math.max(2, target.x - 4)));
      highlight.setAttribute("y", String(Math.max(2, target.y - 4)));
      highlight.setAttribute("width", String(target.width + 8));
      highlight.setAttribute("height", String(target.height + 8));
      highlight.setAttribute("rx", "8");
      highlight.setAttribute("fill", "rgba(250,204,21,.12)");
      highlight.setAttribute("stroke", "#f59e0b");
      highlight.setAttribute("stroke-width", "4");
      svg.append(highlight);

      const labelWidth = Math.min(320, Math.max(130, target.label.length * 7.2 + 24));
      const labelX = Math.min(window.innerWidth - labelWidth - 8, Math.max(8, target.x));
      const labelY = target.y > 70 ? target.y - 44 : target.y + target.height + 14;
      const labelBox = document.createElementNS(ns, "rect");
      labelBox.setAttribute("x", String(labelX));
      labelBox.setAttribute("y", String(labelY));
      labelBox.setAttribute("width", String(labelWidth));
      labelBox.setAttribute("height", "30");
      labelBox.setAttribute("rx", "6");
      labelBox.setAttribute("fill", "#111827");
      labelBox.setAttribute("stroke", "#f59e0b");
      labelBox.setAttribute("stroke-width", "2");
      svg.append(labelBox);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(labelX + 12));
      text.setAttribute("y", String(labelY + 20));
      text.setAttribute("fill", "white");
      text.setAttribute("font-size", "13");
      text.setAttribute("font-weight", "700");
      text.textContent = target.label;
      svg.append(text);

      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(labelX + labelWidth / 2));
      line.setAttribute("y1", String(labelY > target.y ? labelY : labelY + 30));
      line.setAttribute("x2", String(target.x + target.width / 2));
      line.setAttribute("y2", String(labelY > target.y ? target.y + target.height : target.y));
      line.setAttribute("stroke", "#ef4444");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("marker-end", "url(#doc-arrow)");
      svg.append(line);
    });

    document.body.append(svg);
  }, annotations);
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: path.join(evidenceDir, name), animations: "disabled" });
}

test.describe("annotated documentation evidence", () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    test.skip(desktopOnly(testInfo), "Evidence is generated once from desktop Chromium.");
  });

  test("captures the primary operator screens", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
    await page.waitForTimeout(600);
    await annotate(page, [
      { locator: page.getByRole("navigation").first(), label: "1. Module navigation" },
      {
        locator: page.getByRole("heading", { name: "Operations Dashboard" }),
        label: "2. Current operation",
      },
      {
        locator: page.getByText("Today's GRNs", { exact: true }).locator(".."),
        label: "3. Live plant KPIs",
      },
      {
        locator: page.getByText("Label Status", { exact: true }).locator(".."),
        label: "4. Label lifecycle chart",
      },
    ]);
    await capture(page, "01-dashboard-annotated.png");

    await gotoReady(page, "/import");
    await annotate(page, [
      {
        locator: page.getByText("Drop your SAP GRN Excel file here").locator(".."),
        label: "1. Validated .xlsx upload",
      },
      {
        locator: page.getByText("Identification Strategy").locator("../.."),
        label: "2. Business identity strategy",
      },
      { locator: page.getByRole("button", { name: "Browse Files" }), label: "3. Start import" },
    ]);
    await capture(page, "02-sap-import-annotated.png");

    await gotoReady(page, "/inward");
    await annotate(page, [
      {
        locator: page.getByRole("heading", { name: "Material Inward" }),
        label: "1. Inward operation",
      },
      { locator: page.getByPlaceholder("LBL-00000000"), label: "2. Zebra / keyboard-wedge scan" },
      { locator: page.getByRole("button", { name: "Lookup" }), label: "3. Validate and receive" },
      {
        locator: page.getByText("Session Log").locator(".."),
        label: "4. Accepted/rejected audit trail",
      },
    ]);
    await capture(page, "03-material-inward-annotated.png");

    await gotoReady(page, "/issue");
    await annotate(page, [
      { locator: page.getByLabel("Issue station"), label: "1. Required production station" },
      { locator: page.getByPlaceholder("LBL-00000000"), label: "2. Scan an inwarded pack" },
      { locator: page.getByRole("button", { name: "Lookup" }), label: "3. Guarded issue lookup" },
      { locator: page.getByText("Session Log").locator(".."), label: "4. Issue audit trail" },
    ]);
    await capture(page, "04-material-issue-annotated.png");

    await gotoReady(page, "/traceability");
    const traceSearch = page.getByPlaceholder("Label UID, GRN, material or batch");
    await traceSearch.fill("LBL-00003452");
    await page.getByRole("button", { name: "Trace" }).click();
    await expect(page.getByRole("heading", { name: "LBL-00003452" })).toBeVisible();
    await annotate(page, [
      { locator: traceSearch, label: "1. Search label / GRN / material / batch" },
      {
        locator: page.getByRole("heading", { name: "LBL-00003452" }),
        label: "2. Unique pack identity",
      },
      {
        locator: page.getByText("Issued to Production").first(),
        label: "3. Complete lifecycle event",
      },
    ]);
    await capture(page, "05-traceability-annotated.png");

    await gotoReady(page, "/configuration");
    await page.getByRole("tab", { name: "Scanning" }).click();
    await annotate(page, [
      {
        locator: page.getByRole("switch", { name: "Require issue station" }).locator(".."),
        label: "1. Station validation guard",
      },
      {
        locator: page.getByRole("switch", { name: "Allow duplicate inward" }).locator(".."),
        label: "2. Duplicate inward policy",
      },
      {
        locator: page.getByText(/Issue remains online-only/),
        label: "3. No offline issue queue",
      },
      {
        locator: page.getByRole("button", { name: "Save Changes" }),
        label: "4. Persist plant settings",
      },
    ]);
    await capture(page, "06-scanning-config-annotated.png");
  });

  test("captures the Zebra-sized issue workflow", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await gotoReady(page, "/issue");
    await annotate(page, [
      { locator: page.getByLabel("Issue station"), label: "1. Station" },
      { locator: page.getByPlaceholder("LBL-00000000"), label: "2. Scanner is above fold" },
      {
        locator: page.getByText("Scan", { exact: true }).last().locator(".."),
        label: "3. Thumb-ready scan action",
      },
    ]);
    await capture(page, "07-zebra-issue-480x800-annotated.png");
  });
});
