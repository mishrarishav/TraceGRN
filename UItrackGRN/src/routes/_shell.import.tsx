import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Save,
  Sparkles,
  TableProperties,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ExportButton } from "@/components/common/ExportButton";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  commitGRNImport,
  getImportOptions,
  inspectGRNImport,
  previewGRNImport,
  saveImportProfile,
  type ImportFieldDefinition,
  type ImportInspection,
} from "@/services/api";
import type { ImportBatch, ImportRowResult } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/import")({
  head: () => ({
    meta: [
      { title: "Smart GRN Import — TrackGRN" },
      {
        name: "description",
        content:
          "Inspect any supported Excel workbook, learn its sheet and column mapping, validate and import GRN data.",
      },
    ],
  }),
  component: ImportPage,
});

const steps = ["Upload", "Map Workbook", "Validate", "Commit"];
const ignoredField = "__ignore__";

function ImportPage() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState("");
  const [savedProfileId, setSavedProfileId] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ImportRowResult[]>([]);
  const [previewBatch, setPreviewBatch] = useState<ImportBatch | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: options } = useQuery({ queryKey: ["import-options"], queryFn: getImportOptions });

  const selectedSheet = inspection?.sheets.find((sheet) => sheet.name === sheetName) ?? null;
  const headers = selectedSheet?.rows[headerRow - 1] ?? [];
  const mappedTargets = new Set(Object.values(mapping));
  const requiredFields = inspection?.fields.filter((field) => field.required) ?? [];
  const missingRequired = requiredFields.filter((field) => !mappedTargets.has(field.key));
  const readyToValidate = Boolean(file && selectedSheet && missingRequired.length === 0);

  const inspect = useMutation({
    mutationFn: inspectGRNImport,
    onSuccess: (response) => {
      setInspection(response);
      setSheetName(response.selectedSheetName);
      setHeaderRow(response.selectedHeaderRow);
      setMapping(response.mapping);
      setSavedProfileId(response.matchedTemplate?.id);
      setProfileName(response.matchedTemplate?.name ?? profileNameFromFile(response.fileName));
      setProgress(100);
      setStep(1);
      toast.success(response.matchedTemplate ? "Saved format recognized" : "Workbook inspected", {
        description: response.matchedTemplate
          ? `${response.matchedTemplate.name} matched at ${response.matchedTemplate.confidence}% confidence.`
          : `${response.sheets.length} sheet${response.sheets.length === 1 ? "" : "s"} ready to preview and map.`,
      });
    },
    onError: (error) => {
      setProgress(0);
      toast.error("Workbook inspection failed", { description: error.message });
    },
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      saveImportProfile({
        templateId: savedProfileId,
        name: profileName.trim(),
        fileName: file!.name,
        sheetName,
        headerRowNumber: headerRow,
        mapping,
        headers,
      }),
    onSuccess: (response) => {
      setSavedProfileId(response.id);
      setMapping(response.mapping);
      toast.success("Import format saved", {
        description:
          "This sheet and all learned column names will be picked automatically next time.",
      });
    },
    onError: (error) => toast.error("Unable to save import format", { description: error.message }),
  });

  const validate = useMutation({
    mutationFn: () => {
      const defaultTemplate = options?.mappingTemplates.find((item) => item.isDefault)?.id;
      return previewGRNImport(
        file!,
        savedProfileId ?? inspection?.matchedTemplate?.id ?? defaultTemplate,
        { sheetName, headerRowNumber: headerRow, mapping },
        Boolean(previewBatch),
      );
    },
    onSuccess: (response) => {
      setRows(response.rows);
      setPreviewBatch(response.batch);
      setStep(2);
      toast.success("Selected sheet validated", {
        description: `${response.batch.totalRows} rows checked against SQL data.`,
      });
    },
    onError: (error) => toast.error("Import validation failed", { description: error.message }),
  });

  const commit = useMutation({
    mutationFn: (batchId: string) => commitGRNImport(batchId),
    onSuccess: (response) => {
      setCommitted(true);
      setStep(3);
      setConfirm(false);
      toast.success("Import committed", {
        description: `Batch ${response.batchId} · ${response.applied} rows applied to SQL Server`,
      });
    },
    onError: (error) => toast.error("Commit failed", { description: error.message }),
  });

  const handleFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!/[.](xls|xlsx|xlsm|xlsb|xltx|xltm|csv|tsv|txt)$/i.test(nextFile.name)) {
      toast.error("Select an Excel, CSV, TSV or TXT file");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      toast.error("File exceeds the 10 MB limit");
      return;
    }
    resetImport(false);
    setFile(nextFile);
    setProgress(20);
    inspect.mutate(nextFile);
  };

  const resetImport = (clearInput = true) => {
    setStep(0);
    setFile(null);
    setInspection(null);
    setSheetName("");
    setHeaderRow(1);
    setMapping({});
    setProfileName("");
    setSavedProfileId(undefined);
    setProgress(0);
    setRows([]);
    setPreviewBatch(null);
    setCommitted(false);
    if (clearInput && inputRef.current) inputRef.current.value = "";
  };

  const chooseSheet = (name: string) => {
    if (!inspection) return;
    const sheet = inspection.sheets.find((item) => item.name === name);
    if (!sheet) return;
    const candidate = bestHeader(sheet.rows, inspection.fields);
    setSheetName(name);
    setHeaderRow(candidate.rowNumber);
    setMapping(candidate.mapping);
    setSavedProfileId(undefined);
  };

  const chooseHeaderRow = (rowNumber: number) => {
    if (!inspection || !selectedSheet) return;
    const nextHeaders = selectedSheet.rows[rowNumber - 1] ?? [];
    setHeaderRow(rowNumber);
    setMapping(suggestMapping(nextHeaders, inspection.fields));
    setSavedProfileId(undefined);
  };

  const updateColumnMapping = (sourceHeader: string, targetField: string) => {
    setMapping((current) => {
      const next = { ...current };
      delete next[sourceHeader];
      if (targetField !== ignoredField) {
        for (const [source, target] of Object.entries(next)) {
          if (target === targetField) delete next[source];
        }
        next[sourceHeader] = targetField;
      }
      return next;
    });
    setSavedProfileId(undefined);
  };

  const counts = useMemo(
    () => ({
      new: rows.filter((row) => row.status === "New").length,
      updated: rows.filter((row) => row.status === "Updated").length,
      unchanged: rows.filter((row) => row.status === "Unchanged").length,
      warning: rows.filter((row) => row.status === "Warning").length,
      rejected: rows.filter((row) => row.status === "Rejected").length,
    }),
    [rows],
  );

  const columns: Column<ImportRowResult>[] = [
    {
      key: "grn",
      header: "GRN No",
      render: (row) => <span className="num font-medium">{row.grnNumber}</span>,
    },
    { key: "line", header: "Line", render: (row) => <span className="num">{row.lineItem}</span> },
    {
      key: "mat",
      header: "Material",
      render: (row) => <span className="num">{row.materialNumber}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (row) => row.description,
      className: "max-w-[240px] truncate",
    },
    {
      key: "qty",
      header: "Quantity",
      sortValue: (row) => row.quantity,
      render: (row) => (
        <span className="num">
          {row.quantity.toLocaleString()} {row.uom ?? ""}
        </span>
      ),
    },
    {
      key: "pack",
      header: "Pack Qty",
      render: (row) => <span className="num">{row.packingStandard}</span>,
    },
    { key: "batch", header: "Batch", render: (row) => <span className="num">{row.batch}</span> },
    {
      key: "source",
      header: "Vendor / Invoice / Bin",
      className: "min-w-[190px]",
      render: (row) => (
        <div className="space-y-0.5 text-xs">
          <p>{row.vendorCode ? `${row.vendorCode} · ${row.vendorName ?? ""}` : "—"}</p>
          <p className="text-muted-foreground">
            {[row.invoiceNumber, row.binLocation ? `Bin ${row.binLocation}` : ""]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "reason",
      header: "Remark",
      render: (row) => <span className="text-xs text-muted-foreground">{row.reason ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart GRN Import"
        description="Preview every worksheet, teach TrackGRN a format once, then import matching files directly."
        icon={<Upload className="h-5 w-5" />}
        actions={<ExportButton name="import-preview" />}
      />

      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {steps.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "num flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                index < step
                  ? "border-success bg-success/15 text-success"
                  : index === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              {index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                index === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span className="hidden h-px flex-1 bg-border sm:block" />
            ) : null}
          </div>
        ))}
      </div>

      {step === 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="panel p-5 lg:col-span-2">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFile(event.dataTransfer.files[0]);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border bg-surface",
              )}
            >
              <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground">
                <FileSpreadsheet className="h-7 w-7" />
              </span>
              <h3 className="mt-4 font-semibold">Drop the GRN workbook here</h3>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Excel 97–2026 formats (.xls, .xlsx, .xlsm, .xlsb), templates, CSV, TSV and TXT · up
                to 10 MB
              </p>
              <Button
                className="mt-5"
                onClick={() => inputRef.current?.click()}
                disabled={inspect.isPending}
              >
                {inspect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{" "}
                Browse File
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xls,.xlsx,.xlsm,.xlsb,.xltx,.xltm,.csv,.tsv,.txt"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </div>
            {file ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <FileSpreadsheet className="h-5 w-5 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <Progress value={progress} className="mt-2 h-1.5" />
                </div>
                <span className="num text-xs text-muted-foreground">{progress}%</span>
              </motion.div>
            ) : null}
          </div>
          <div className="panel space-y-4 p-5">
            <BrainCircuit className="h-7 w-7 text-primary" />
            <div>
              <p className="font-semibold">Format memory</p>
              <p className="mt-1 text-sm text-muted-foreground">
                TrackGRN remembers the chosen worksheet, header row and every column alias you save.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <p className="font-medium">Active identity</p>
              <p className="num mt-1 text-muted-foreground">
                {options?.identificationStrategy.selectedFields.join(" + ") ?? "Loading…"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {step === 1 && inspection && selectedSheet ? (
        <div className="space-y-4">
          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <TableProperties className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Workbook preview</h2>
                  {inspection.matchedTemplate ? (
                    <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
                      {inspection.matchedTemplate.name} · {inspection.matchedTemplate.confidence}%
                      match
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose the one sheet and the row containing its column names.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => resetImport()}>
                <X className="h-4 w-4" /> Change file
              </Button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Worksheet</Label>
                <Select value={sheetName} onValueChange={chooseSheet}>
                  <SelectTrigger aria-label="Worksheet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inspection.sheets.map((sheet) => (
                      <SelectItem key={sheet.name} value={sheet.name}>
                        {sheet.name} · {sheet.rowCount} rows
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Header row</Label>
                <Select
                  value={String(headerRow)}
                  onValueChange={(value) => chooseHeaderRow(Number(value))}
                >
                  <SelectTrigger aria-label="Header row">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: Math.min(25, selectedSheet.rows.length) }, (_, index) => (
                      <SelectItem key={index + 1} value={String(index + 1)}>
                        Row {index + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="text-xs text-muted-foreground">Sheet size</p>
                <p className="num mt-1 font-medium">
                  {selectedSheet.rowCount.toLocaleString()} ×{" "}
                  {selectedSheet.columnCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="text-xs text-muted-foreground">Required mapping</p>
                <p
                  className={cn(
                    "num mt-1 font-medium",
                    missingRequired.length === 0 ? "text-success" : "text-warning",
                  )}
                >
                  {requiredFields.length - missingRequired.length}/{requiredFields.length} mapped
                </p>
              </div>
            </div>

            <WorkbookGrid sheet={selectedSheet} headerRow={headerRow} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <div className="panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Column mapping</h2>
                  <p className="text-sm text-muted-foreground">
                    Map each source heading to one TrackGRN field.
                  </p>
                </div>
                {missingRequired.length === 0 ? (
                  <StatusBadge status="Ready" />
                ) : (
                  <StatusBadge status="Warning" />
                )}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {headers.map((header, index) =>
                  header.trim() ? (
                    <div
                      key={`${header}-${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-border bg-surface p-3"
                    >
                      <div className="min-w-0">
                        <p className="num text-[10px] text-muted-foreground">
                          Column {columnLetter(index + 1)}
                        </p>
                        <p className="truncate text-sm font-medium" title={header}>
                          {header}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={mapping[header] ?? ignoredField}
                        onValueChange={(value) => updateColumnMapping(header, value)}
                      >
                        <SelectTrigger aria-label={`Map ${header}`} className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ignoredField}>Do not import</SelectItem>
                          {inspection.fields.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {field.label}
                              {field.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null,
                )}
              </div>
              {missingRequired.length > 0 ? (
                <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  Required: {missingRequired.map((field) => field.label).join(", ")}
                </p>
              ) : null}
            </div>

            <div className="panel h-fit space-y-4 p-5 xl:sticky xl:top-4">
              <div>
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Teach this format</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Saving merges new column names as aliases instead of forgetting the old ones.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-name">Format name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  maxLength={200}
                />
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={!readyToValidate || !profileName.trim() || saveProfile.isPending}
                onClick={() => saveProfile.mutate()}
              >
                {saveProfile.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Save Sheet & Mapping
              </Button>
              <Button
                className="w-full gap-2"
                disabled={!readyToValidate || validate.isPending}
                onClick={() => validate.mutate()}
              >
                {validate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}{" "}
                Validate Selected Sheet
              </Button>
              <p className="text-xs text-muted-foreground">
                Validation never writes GRN rows. You review the result before the final commit.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {step >= 2 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard label="New Rows" value={counts.new} tone="primary" hint="Will be inserted" />
            <StatCard label="Updated" value={counts.updated} hint="Existing data revised" />
            <StatCard label="Unchanged" value={counts.unchanged} hint="No action" />
            <StatCard
              label="Warnings"
              value={counts.warning}
              tone="warning"
              hint="Review recommended"
            />
            <StatCard
              label="Rejected"
              value={counts.rejected}
              tone="danger"
              hint="Excluded from commit"
            />
          </div>
          <Tabs defaultValue="all">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="all">All Rows</TabsTrigger>
                <TabsTrigger value="new">New</TabsTrigger>
                <TabsTrigger value="updated">Updated</TabsTrigger>
                <TabsTrigger value="issues">Warnings & Rejected</TabsTrigger>
              </TabsList>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back to Mapping
                </Button>
                {committed ? (
                  <StatusBadge status="Completed" size="lg" />
                ) : (
                  <Button onClick={() => setConfirm(true)} className="gap-2">
                    <Sparkles className="h-4 w-4" /> Commit Import
                  </Button>
                )}
              </div>
            </div>
            {(
              [
                ["all", rows],
                ["new", rows.filter((row) => row.status === "New")],
                ["updated", rows.filter((row) => row.status === "Updated")],
                [
                  "issues",
                  rows.filter((row) => row.status === "Warning" || row.status === "Rejected"),
                ],
              ] as const
            ).map(([key, data]) => (
              <TabsContent key={key} value={key} className="mt-4">
                <DataTable
                  rows={[...data]}
                  columns={columns}
                  searchKeys={(row) =>
                    `${row.grnNumber} ${row.materialNumber} ${row.description} ${row.batch}`
                  }
                  emptyMessage="No rows in this category."
                  dense
                />
              </TabsContent>
            ))}
          </Tabs>
        </>
      ) : null}

      <ConfirmationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Commit this import batch?"
        description={`${counts.new} new and ${counts.updated} updated rows will be written to the traceability database. Rejected rows are skipped.`}
        confirmLabel="Commit Import"
        onConfirm={() => previewBatch && commit.mutate(previewBatch.batchId)}
      />
    </div>
  );
}

function WorkbookGrid({
  sheet,
  headerRow,
}: {
  sheet: ImportInspection["sheets"][number];
  headerRow: number;
}) {
  const width = Math.min(80, Math.max(sheet.columnCount, ...sheet.rows.map((row) => row.length)));
  return (
    <div
      className="mt-4 overflow-auto rounded-lg border border-border bg-background"
      style={{ maxHeight: 430 }}
    >
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-30">
          <tr>
            <th className="sticky left-0 z-40 min-w-12 border-b border-r border-border bg-muted px-2 py-2 text-center text-muted-foreground">
              #
            </th>
            {Array.from({ length: width }, (_, index) => (
              <th
                key={index}
                className="min-w-32 border-b border-r border-border bg-muted px-3 py-2 text-left font-semibold text-muted-foreground"
              >
                {columnLetter(index + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, rowIndex) => {
            const selected = rowIndex + 1 === headerRow;
            return (
              <tr key={rowIndex} className={selected ? "bg-primary/10" : "hover:bg-muted/30"}>
                <th
                  className={cn(
                    "sticky left-0 z-20 border-b border-r border-border px-2 py-2 text-center font-medium",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {rowIndex + 1}
                </th>
                {Array.from({ length: width }, (_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className={cn(
                      "max-w-64 truncate border-b border-r border-border px-3 py-2",
                      selected && "font-semibold text-primary",
                    )}
                    title={row[columnIndex] ?? ""}
                  >
                    {row[columnIndex] || ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sheet.previewTruncated ? (
        <p className="sticky bottom-0 left-0 border-t border-border bg-muted/95 px-3 py-2 text-xs text-muted-foreground">
          Preview limited to the first 75 rows and 80 columns; the complete selected sheet is
          processed during validation.
        </p>
      ) : null}
    </div>
  );
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function suggestMapping(headers: string[], fields: ImportFieldDefinition[]) {
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (!header.trim()) continue;
    const normalized = normalize(header);
    const field = fields.find((candidate) =>
      candidate.aliases.some((alias) => normalize(alias) === normalized),
    );
    if (field && !Object.values(result).includes(field.key)) result[header] = field.key;
  }
  return result;
}

function bestHeader(rows: string[][], fields: ImportFieldDefinition[]) {
  let best = { rowNumber: 1, mapping: {} as Record<string, string>, score: -1 };
  rows.slice(0, 25).forEach((headers, index) => {
    const mapping = suggestMapping(headers, fields);
    const required = fields.filter(
      (field) => field.required && Object.values(mapping).includes(field.key),
    ).length;
    const score = required * 20 + Object.keys(mapping).length;
    if (score > best.score) best = { rowNumber: index + 1, mapping, score };
  });
  return best;
}

function profileNameFromFile(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return `${stem || "GRN"} format`.slice(0, 200);
}

function columnLetter(column: number) {
  let value = column;
  let output = "";
  while (value > 0) {
    value--;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}
