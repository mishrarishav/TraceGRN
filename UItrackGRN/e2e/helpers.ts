import JSZip from "jszip";
import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

export const routes = [
  ["/", "Operations Dashboard"],
  ["/import", "SAP GRN Import"],
  ["/grns", "Goods Receipt Notes"],
  ["/grns/500515334", "GRN 500515334"],
  ["/materials", "Materials"],
  ["/labels", "Label Management"],
  ["/inward", "Material Inward"],
  ["/issue", "Material Issue"],
  ["/inventory", "Inventory"],
  ["/traceability", "Traceability"],
  ["/reports", "Reports"],
  ["/import-history", "Import History"],
  ["/revisions", "Revision History"],
  ["/users", "Users & Roles"],
  ["/stations", "Stations & Devices"],
  ["/configuration", "Configuration"],
  ["/audit", "Audit Log"],
] as const;

export function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) {
      const source = message.location().url;
      errors.push(source ? `${message.text()} (${source})` : message.text());
    }
  });
  return errors;
}

export async function expectNoBodyOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "Page body must not overflow the viewport horizontally").toBeLessThanOrEqual(1);
}

export async function gotoReady(page: Page, path: string) {
  if (path !== "/login") {
    const login = await page.request.post("http://127.0.0.1:5025/api/auth/login", {
      data: { username: "admin", password: "TrackGRN-Dev-Admin-2026!" },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const session = (await login.json()) as {
      accessToken: string;
      refreshToken: string;
      user: unknown;
    };
    await page.addInitScript((auth) => {
      localStorage.setItem("trackgrn-access-token", auth.accessToken);
      localStorage.setItem("trackgrn-refresh-token", auth.refreshToken);
      localStorage.setItem("trackgrn-user", JSON.stringify(auth.user));
    }, session);
  }
  await page.goto(path);
  await page.locator('html[data-hydrated="true"]').waitFor();
}

export function desktopOnly(testInfo: TestInfo) {
  return testInfo.project.name !== "desktop-chromium";
}

export function handheldOnly(testInfo: TestInfo) {
  return !["mobile-chromium", "zebra-mc9300"].includes(testInfo.project.name);
}

export async function createSapWorkbook(identity = crypto.randomUUID()) {
  const suffix = identity.replaceAll("-", "").slice(0, 10).toUpperCase();
  const grnNumber = `9${Date.now().toString().slice(-9)}`;
  const materialNumber = `E2E-${suffix}`;
  const rows: (string | number)[][] = [
    [
      "GRN No",
      "GRN Date",
      "Line Item",
      "Material",
      "Material Desc",
      "Qty",
      "Packing Qty",
      "Batch",
      "Plant",
      "PO Number",
    ],
    [
      grnNumber,
      new Date().toISOString().slice(0, 10),
      "10",
      materialNumber,
      `Playwright material ${suffix}`,
      1000,
      1000,
      `B-${suffix}`,
      "1000",
      `PO-${suffix}`,
    ],
  ];
  const escapeXml = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => {
            const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
            return typeof value === "number"
              ? `<c r="${reference}"><v>${value}</v></c>`
              : `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="SAP GRN" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, grnNumber, materialNumber };
}

export async function createImportedLabel(request: APIRequestContext) {
  const login = await request.post("http://127.0.0.1:5025/api/auth/login", {
    data: { username: "admin", password: "TrackGRN-Dev-Admin-2026!" },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const session = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const optionsResponse = await request.get("http://127.0.0.1:5025/api/imports/options", {
    headers,
  });
  expect(optionsResponse.ok(), await optionsResponse.text()).toBeTruthy();
  const options = (await optionsResponse.json()) as {
    mappingTemplates: { id: string; isDefault: boolean }[];
  };
  const workbook = await createSapWorkbook();
  const previewResponse = await request.post("http://127.0.0.1:5025/api/imports/preview", {
    headers,
    multipart: {
      file: {
        name: `${workbook.grnNumber}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: workbook.buffer,
      },
      mappingTemplateId: options.mappingTemplates.find((item) => item.isDefault)?.id ?? "",
      overrideDuplicate: "false",
    },
  });
  expect(previewResponse.ok(), await previewResponse.text()).toBeTruthy();
  const preview = (await previewResponse.json()) as { batch: { batchId: string } };
  const commit = await request.post(
    `http://127.0.0.1:5025/api/imports/${preview.batch.batchId}/commit`,
    { headers },
  );
  expect(commit.ok(), await commit.text()).toBeTruthy();
  const labelsResponse = await request.get(
    `http://127.0.0.1:5025/api/labels?grn=${workbook.grnNumber}`,
    { headers },
  );
  expect(labelsResponse.ok(), await labelsResponse.text()).toBeTruthy();
  const labels = (await labelsResponse.json()) as { labelUid: string; status: string }[];
  expect(labels.length).toBeGreaterThan(0);
  expect(labels[0]?.status).toBe("Generated");
  return { ...workbook, labelUid: labels[0]!.labelUid };
}
