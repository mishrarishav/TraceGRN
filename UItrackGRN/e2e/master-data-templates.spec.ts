import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import readExcelFile from "read-excel-file/node";
import { gotoReady, expectNoBodyOverflow } from "./helpers";

const xml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function fillTemplate(bytes: Buffer, rows: (string | number | boolean)[][]) {
  const zip = await JSZip.loadAsync(bytes);
  const path = "xl/worksheets/sheet1.xml";
  const sheet = await zip.file(path)!.async("string");
  const header = sheet.match(/<x:row\b[^>]*\br="1"[^>]*>[\s\S]*?<\/x:row>/)![0];
  const data = rows
    .map(
      (row, index) =>
        `<x:row r="${index + 2}">${row
          .map((value, col) => {
            const ref = `${String.fromCharCode(65 + col)}${index + 2}`;
            if (typeof value === "number") return `<x:c r="${ref}"><x:v>${value}</x:v></x:c>`;
            return `<x:c r="${ref}" t="inlineStr"><x:is><x:t>${xml(String(value))}</x:t></x:is></x:c>`;
          })
          .join("")}</x:row>`,
    )
    .join("");
  zip.file(
    path,
    sheet.replace(
      /<x:sheetData\b[^>]*>[\s\S]*?<\/x:sheetData>/,
      `<x:sheetData>${header}${data}</x:sheetData>`,
    ),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

for (const [entity, singular] of [
  ["materials", "Material"],
  ["vendors", "Vendor"],
] as const) {
  test(`${singular} Excel template downloads, validates, creates and updates directly`, async ({
    page,
  }, info) => {
    test.skip(
      !new URL(process.env["TRACKGRN_API_ORIGIN"] ?? "http://127.0.0.1:5025").hostname.match(
        /^(127\.0\.0\.1|localhost)$/,
      ),
      "Writes are restricted to the local test API.",
    );
    await gotoReady(page, `/${entity}`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${singular} Template`, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`trackgrn-${entity}-template.xlsx`);
    const path = info.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    const bytes = await readFile(path);
    const sheets = await readExcelFile(bytes);
    expect(sheets.find((sheet) => sheet.sheet.toLowerCase() === entity)!.data).toHaveLength(1);
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain('name="Instructions"');
    const code = `00${Date.now()}${info.project.name.slice(0, 1).toUpperCase()}`;
    const name = `E2E ${singular}, हिन्दी & Co`;
    const values =
      entity === "materials"
        ? [code, name, "PCS", 12.5, "PART-001", "A-01", 0, true]
        : [code, name, "Alias A|Alias B", true];
    await page.getByRole("button", { name: "Bulk Upload", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const input = dialog.getByLabel(`${singular} bulk upload file`, { exact: true });
    await input.setInputFiles({
      name: "filled.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await fillTemplate(bytes, [values]),
    });
    await expect(dialog.locator("tbody tr")).toContainText([code]);
    await expect(dialog.locator("tbody tr")).toContainText(["Create"]);
    await dialog.getByRole("button", { name: "Upload 1 valid rows", exact: true }).click();
    await expect(dialog.locator("tbody tr")).toContainText(["Created"]);
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    const search = page.getByRole("textbox", { name: "Search records", exact: true });
    await search.click();
    await page.keyboard.type(code, { delay: 35 });
    await expect(search).toBeFocused();
    await expect(page.getByTestId("data-table").locator("tbody tr")).toContainText([name]);

    values[1] = `${name} updated`;
    await page.getByRole("button", { name: "Bulk Upload", exact: true }).click();
    await input.setInputFiles({
      name: "updated.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await fillTemplate(bytes, [values]),
    });
    await expect(dialog.locator("tbody tr")).toContainText(["Update"]);
    await dialog.getByRole("button", { name: "Upload 1 valid rows", exact: true }).click();
    await expect(dialog.locator("tbody tr")).toContainText(["Updated"]);
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(page.getByTestId("data-table").locator("tbody tr")).toContainText([
      `${name} updated`,
    ]);
    await expectNoBodyOverflow(page);
    await page.screenshot({ path: info.outputPath(`${entity}-completed.png`), fullPage: true });
  });
}

test("bulk validation reports duplicates and missing columns and still accepts CSV", async ({
  page,
}) => {
  await gotoReady(page, "/materials");
  await page.getByRole("button", { name: "Bulk Upload", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const file = dialog.getByLabel("Material bulk upload file", { exact: true });
  await file.setInputFiles({
    name: "missing.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Material Number,Description\n00123,Part"),
  });
  await expect(dialog.getByText(/Missing required columns: UOM, Pack Quantity/)).toBeVisible();
  await file.setInputFiles({
    name: "duplicates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Material Number,Description,UOM,Pack Quantity\n00123,Part,PCS,10\n00123,Part,PCS,10",
    ),
  });
  await expect(
    dialog.getByText("Material code is duplicated in this file.", { exact: true }),
  ).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: "Upload 0 valid rows", exact: true }),
  ).toBeDisabled();
  await file.setInputFiles({
    name: "legacy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Material Number,Description,UOM,Pack Quantity\n00123,"Part, with comma",PCS,10',
    ),
  });
  await expect(dialog.locator("tbody tr")).toContainText(["00123"]);
  await expect(
    dialog.getByRole("button", { name: "Upload 1 valid rows", exact: true }),
  ).toBeEnabled();
});

test("Excel validation rejects empty and oversized templates before saving", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "File limits are independent of the viewport.",
  );
  await gotoReady(page, "/vendors");
  await page.getByRole("button", { name: "Bulk Upload", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const file = dialog.getByLabel("Vendor bulk upload file", { exact: true });
  const bytes = await readFile("public/templates/trackgrn-vendors-template.xlsx");
  await file.setInputFiles({
    name: "blank.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await expect(
    dialog.getByText("The file must contain a header and at least one data row.", { exact: true }),
  ).toBeVisible();
  const rows = Array.from({ length: 2001 }, (_, index) => [`V-${index}`, "Vendor", "", true]);
  await file.setInputFiles({
    name: "too-many.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await fillTemplate(bytes, rows),
  });
  await expect(
    dialog.getByText("A single bulk upload can contain at most 2,000 data rows.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Upload 0 valid rows", exact: true }),
  ).toBeDisabled();
});
