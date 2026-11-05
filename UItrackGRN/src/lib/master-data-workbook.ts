export type MasterDataEntity = "materials" | "vendors";

export const masterDataTemplateUrl = (entity: MasterDataEntity) =>
  `${import.meta.env.BASE_URL}templates/trackgrn-${entity}-template.xlsx`;

export async function readMasterDataWorkbook(
  entity: MasterDataEntity,
  file: File,
): Promise<string[][]> {
  // Load the Excel reader only when a workbook is selected. It reads in a worker.
  const { default: readExcelFile } = await import("read-excel-file/browser");
  const sheets = await readExcelFile(file);
  const sheet =
    sheets.find((sheet) => sheet.sheet.toLowerCase() === entity) ??
    sheets.find((sheet) => sheet.sheet.toLowerCase() !== "instructions");
  if (!sheet) throw new Error(`Workbook does not contain a ${entity} data sheet.`);
  return sheet.data.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell);
    }),
  );
}
