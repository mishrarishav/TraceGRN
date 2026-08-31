import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface BulkUploadColumn {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
}

export interface BulkRowParseResult<T> {
  key: string;
  value: T;
  errors: string[];
}

interface MasterDataBulkUploadProps<T> {
  entityName: string;
  entityNamePlural: string;
  templateFileName: string;
  columns: BulkUploadColumn[];
  templateRows: string[][];
  existingIds: ReadonlyMap<string, string>;
  parseRow: (record: Record<string, string>, rowNumber: number) => BulkRowParseResult<T>;
  uploadRow: (value: T, existingId: string | undefined) => Promise<unknown>;
  onComplete: () => void | Promise<unknown>;
}

type UploadState = "pending" | "success" | "failed";

interface ParsedRow<T> extends BulkRowParseResult<T> {
  rowNumber: number;
  existingId: string | undefined;
}

interface RowUploadResult {
  state: UploadState;
  message: string;
}

export function MasterDataBulkUpload<T>({
  entityName,
  entityNamePlural,
  templateFileName,
  columns,
  templateRows,
  existingIds,
  parseRow,
  uploadRow,
  onComplete,
}: MasterDataBulkUploadProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow<T>[]>([]);
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [uploadResults, setUploadResults] = useState<Record<number, RowUploadResult>>({});

  const validRows = rows.filter((row) => row.errors.length === 0);
  const invalidRows = rows.length - validRows.length;
  const createCount = validRows.filter((row) => !row.existingId).length;
  const updateCount = validRows.length - createCount;
  const finishedCount = Object.values(uploadResults).filter(
    (result) => result.state !== "pending",
  ).length;

  const reset = () => {
    setFileName("");
    setRows([]);
    setFileError("");
    setReading(false);
    setUploading(false);
    setProcessed(0);
    setUploadResults({});
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (uploading) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const downloadTemplate = () => {
    const content = [columns.map((column) => column.label), ...templateRows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`${entityName} template downloaded`);
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    setFileError("");
    setUploadResults({});
    setProcessed(0);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError(
        "Please upload the completed CSV template. Excel files can be saved as CSV UTF-8.",
      );
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File is larger than the 5 MB upload limit.");
      return;
    }

    setReading(true);
    try {
      const csvRows = parseCsv(await file.text());
      if (csvRows.length < 2) {
        setFileError("The CSV must contain a header and at least one data row.");
        return;
      }
      if (csvRows.length - 1 > 2_000) {
        setFileError("A single bulk upload can contain at most 2,000 data rows.");
        return;
      }

      const header = csvRows[0] ?? [];
      const columnIndexes = mapColumnIndexes(header, columns);
      const missing = columns.filter(
        (column) => column.required && columnIndexes[column.key] === undefined,
      );
      if (missing.length > 0) {
        setFileError(
          `Missing required column${missing.length === 1 ? "" : "s"}: ${missing
            .map((column) => column.label)
            .join(", ")}. Download a fresh template and keep its header row unchanged.`,
        );
        return;
      }

      const parsed = csvRows
        .slice(1)
        .map((cells, index) => ({ cells, rowNumber: index + 2 }))
        .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""))
        .map(({ cells, rowNumber }) => {
          const record: Record<string, string> = {};
          columns.forEach((column) => {
            const columnIndex = columnIndexes[column.key];
            record[column.key] = columnIndex === undefined ? "" : (cells[columnIndex] ?? "").trim();
          });
          const result = parseRow(record, rowNumber);
          return {
            ...result,
            rowNumber,
            existingId: existingIds.get(normalizeLookupKey(result.key)),
          };
        });

      if (parsed.length === 0) {
        setFileError("The CSV does not contain any populated data rows.");
        return;
      }

      const keyCounts = new Map<string, number>();
      parsed.forEach((row) => {
        const key = normalizeLookupKey(row.key);
        if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      });
      setRows(
        parsed.map((row) => {
          const duplicate = (keyCounts.get(normalizeLookupKey(row.key)) ?? 0) > 1;
          return duplicate
            ? { ...row, errors: [...row.errors, `${entityName} code is duplicated in this file.`] }
            : row;
        }),
      );
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The CSV could not be read.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const startUpload = async () => {
    if (validRows.length === 0 || uploading) return;
    setUploading(true);
    setProcessed(0);
    setUploadResults(
      Object.fromEntries(
        validRows.map((row) => [row.rowNumber, { state: "pending", message: "Waiting" }]),
      ),
    );

    let cursor = 0;
    let successes = 0;
    let failures = 0;
    const workers = Array.from({ length: Math.min(4, validRows.length) }, async () => {
      while (cursor < validRows.length) {
        const index = cursor;
        cursor += 1;
        const row = validRows[index];
        if (!row) continue;
        try {
          await uploadRow(row.value, row.existingId);
          successes += 1;
          setUploadResults((current) => ({
            ...current,
            [row.rowNumber]: {
              state: "success",
              message: row.existingId ? "Updated" : "Created",
            },
          }));
        } catch (error) {
          failures += 1;
          setUploadResults((current) => ({
            ...current,
            [row.rowNumber]: {
              state: "failed",
              message: error instanceof Error ? error.message : "Upload failed",
            },
          }));
        } finally {
          setProcessed((current) => current + 1);
        }
      }
    });

    await Promise.all(workers);
    if (successes > 0) await onComplete();
    setUploading(false);
    if (failures === 0) {
      toast.success(`${successes} ${entityNamePlural.toLowerCase()} imported`, {
        description: `${createCount} created and ${updateCount} updated.`,
      });
    } else {
      toast.warning("Bulk upload completed with errors", {
        description: `${successes} succeeded and ${failures} failed. Review the highlighted rows.`,
      });
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Bulk Upload
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk upload {entityNamePlural.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Download the CSV template, complete it in Excel, then upload it for validation.
              Existing codes are updated; new codes are created.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              onClick={downloadTemplate}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">1. Download template</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Keep the header row and save as CSV UTF-8.
                </span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              onClick={() => inputRef.current?.click()}
              disabled={reading || uploading}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                {reading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">2. Select completed CSV</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {fileName || "Up to 2,000 rows / 5 MB"}
                </span>
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void selectFile(event.target.files?.[0])}
            />
          </div>

          {fileError ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Summary label="Rows" value={rows.length} />
                <Summary label="Create" value={createCount} tone="text-primary" />
                <Summary label="Update" value={updateCount} tone="text-warning" />
                <Summary
                  label="Invalid"
                  value={invalidRows}
                  tone={invalidRows > 0 ? "text-destructive" : "text-success"}
                />
              </div>

              {uploading || finishedCount > 0 ? (
                <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Upload progress</span>
                    <span className="num text-muted-foreground">
                      {processed}/{validRows.length}
                    </span>
                  </div>
                  <Progress
                    value={(processed / Math.max(1, validRows.length)) * 100}
                    className="h-2"
                  />
                </div>
              ) : null}

              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">CSV Row</th>
                      <th className="px-3 py-2 font-medium">{entityName} Code</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">Validation / Upload Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const result = uploadResults[row.rowNumber];
                      const failed = row.errors.length > 0 || result?.state === "failed";
                      const succeeded = result?.state === "success";
                      return (
                        <tr
                          key={row.rowNumber}
                          className={cn(
                            "border-b border-border last:border-0",
                            failed && "bg-destructive/5",
                            succeeded && "bg-success/10",
                          )}
                        >
                          <td className="num px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                          <td className="num px-3 py-2 font-medium">{row.key || "—"}</td>
                          <td className="px-3 py-2">
                            {row.errors.length > 0 ? (
                              <span className="text-xs text-muted-foreground">Skipped</span>
                            ) : (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 text-xs font-medium",
                                  row.existingId
                                    ? "bg-warning/10 text-warning"
                                    : "bg-primary/10 text-primary",
                                )}
                              >
                                {row.existingId ? "Update" : "Create"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {row.errors.length > 0 ? (
                              <span className="text-destructive">{row.errors.join(" ")}</span>
                            ) : result ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5",
                                  result.state === "success" && "text-success",
                                  result.state === "failed" && "text-destructive",
                                  result.state === "pending" && "text-muted-foreground",
                                )}
                              >
                                {result.state === "success" ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : result.state === "pending" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5" />
                                )}
                                {result.message}
                              </span>
                            ) : (
                              <span className="text-success">Ready</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={uploading}>
              {finishedCount > 0 ? "Close" : "Cancel"}
            </Button>
            <Button
              className="gap-2"
              onClick={() => void startUpload()}
              disabled={validRows.length === 0 || uploading || finishedCount > 0}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading
                ? `Uploading ${processed}/${validRows.length}`
                : `Upload ${validRows.length} valid rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-lg font-semibold", tone)}>{value}</p>
    </div>
  );
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeLookupKey(value: string) {
  return value.trim().toUpperCase();
}

function mapColumnIndexes(headers: string[], columns: BulkUploadColumn[]) {
  const acceptedNames = new Map<string, string>();
  columns.forEach((column) => {
    [column.key, column.label, ...(column.aliases ?? [])].forEach((name) =>
      acceptedNames.set(normalizeHeader(name), column.key),
    );
  });
  const indexes: Record<string, number> = {};
  headers.forEach((header, index) => {
    const key = acceptedNames.get(normalizeHeader(header));
    if (key && indexes[key] === undefined) indexes[key] = index;
  });
  return indexes;
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("The CSV contains an unmatched quote. Check the file and try again.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";"];
  let selected = ",";
  let selectedCount = -1;
  candidates.forEach((candidate) => {
    const count = firstLine.split(candidate).length - 1;
    if (count > selectedCount) {
      selected = candidate;
      selectedCount = count;
    }
  });
  return selected;
}
