import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, FileSpreadsheet, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ExportButton } from "@/components/common/ExportButton";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { commitGRNImport, getImportOptions, previewGRNImport } from "@/services/api";
import type { ImportBatch, ImportRowResult } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/import")({
  head: () => ({
    meta: [
      { title: "SAP GRN Import — TraceFlow" },
      {
        name: "description",
        content: "Upload SAP GRN Excel extracts, validate rows and commit material records.",
      },
      { property: "og:title", content: "SAP GRN Import — TraceFlow" },
      { property: "og:description", content: "Validate and commit SAP GRN Excel extracts." },
    ],
  }),
  component: ImportPage,
});

const steps = ["Upload File", "Validate & Preview", "Commit"];

function ImportPage() {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [template, setTemplate] = useState("");
  const [progress, setProgress] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ImportRowResult[]>([]);
  const [previewBatch, setPreviewBatch] = useState<ImportBatch | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: options } = useQuery({ queryKey: ["import-options"], queryFn: getImportOptions });
  const activeTemplate =
    template || options?.mappingTemplates.find((item) => item.isDefault)?.id || "";

  const upload = useMutation({
    mutationFn: (file: File) => previewGRNImport(file, activeTemplate || undefined),
    onSuccess: (response) => {
      setRows(response.rows);
      setPreviewBatch(response.batch);
      setProgress(100);
      setStep(1);
      toast.success("File parsed", {
        description: `${response.batch.totalRows} rows validated against SQL data.`,
      });
    },
    onError: (error) => toast.error("Import validation failed", { description: error.message }),
  });

  const commit = useMutation({
    mutationFn: (batchId: string) => commitGRNImport(batchId),
    onSuccess: (response) => {
      setCommitted(true);
      setStep(2);
      setConfirm(false);
      toast.success("Import committed", {
        description: `Batch ${response.batchId} · ${response.applied} rows applied to SQL Server`,
      });
    },
    onError: (error) => toast.error("Commit failed", { description: error.message }),
  });

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Only .xlsx files are supported");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File exceeds the 10 MB limit");
      return;
    }

    setFileName(file.name);
    setProgress(0);
    setProgress(15);
    upload.mutate(file);
  };

  const counts = {
    new: rows.filter((r) => r.status === "New").length,
    updated: rows.filter((r) => r.status === "Updated").length,
    unchanged: rows.filter((r) => r.status === "Unchanged").length,
    warning: rows.filter((r) => r.status === "Warning").length,
    rejected: rows.filter((r) => r.status === "Rejected").length,
  };

  const columns: Column<ImportRowResult>[] = [
    {
      key: "grn",
      header: "GRN No",
      render: (r) => <span className="num font-medium">{r.grnNumber}</span>,
    },
    { key: "line", header: "Line", render: (r) => <span className="num">{r.lineItem}</span> },
    {
      key: "mat",
      header: "Material",
      render: (r) => <span className="num">{r.materialNumber}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (r) => r.description,
      className: "max-w-[240px] truncate",
    },
    {
      key: "qty",
      header: "Quantity",
      sortValue: (r) => r.quantity,
      render: (r) => (
        <span className="num">
          {r.previousQuantity !== undefined ? (
            <>
              <span className="text-muted-foreground line-through">{r.previousQuantity}</span>{" "}
              <span className="font-semibold text-info">{r.quantity}</span>
            </>
          ) : (
            r.quantity
          )}
        </span>
      ),
    },
    {
      key: "pack",
      header: "Pack Std",
      render: (r) => <span className="num">{r.packingStandard}</span>,
    },
    { key: "batch", header: "Batch", render: (r) => <span className="num">{r.batch}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "reason",
      header: "Remark",
      render: (r) => <span className="text-xs text-muted-foreground">{r.reason ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="SAP GRN Import"
        description="Upload the SAP Excel extract, validate every row, then commit to the traceability database."
        icon={<Upload className="h-5 w-5" />}
        actions={<ExportButton name="import-preview" />}
      />

      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "num flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                i < step
                  ? "border-success bg-success/15 text-success"
                  : i === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                i === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </span>
            {i < steps.length - 1 ? (
              <span className="hidden h-px flex-1 bg-border sm:block" />
            ) : null}
          </div>
        ))}
      </div>

      {step === 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="panel p-5 lg:col-span-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border bg-surface",
              )}
            >
              <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground">
                <FileSpreadsheet className="h-7 w-7" />
              </span>
              <h3 className="mt-4 font-semibold">Drop your SAP GRN Excel file here</h3>
              <p className="mt-1 text-sm text-muted-foreground">Supports .xlsx up to 10 MB</p>
              <Button
                className="mt-5"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Browse
                Files
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {fileName ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <FileSpreadsheet className="h-5 w-5 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <Progress value={progress} className="mt-2 h-1.5" />
                </div>
                <span className="num text-xs text-muted-foreground">{progress}%</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setFileName(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            ) : null}
          </div>

          <div className="panel space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold">Identification Strategy</p>
              <p className="text-xs text-muted-foreground">
                Determines how duplicate SAP rows are matched.
              </p>
            </div>
            <Select value={options?.identificationStrategy.id ?? "loading"} disabled>
              <SelectTrigger aria-label="Identification strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={options?.identificationStrategy.id ?? "loading"}>
                  {options?.identificationStrategy.name ?? "Loading active strategy…"}
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <p className="font-medium">Matching fields</p>
              <p className="num mt-1 text-muted-foreground">
                {options?.identificationStrategy.selectedFields.join(" + ") ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Column Mapping Template</p>
              <Select value={activeTemplate} onValueChange={setTemplate}>
                <SelectTrigger className="mt-2" aria-label="Mapping template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options?.mappingTemplates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}

      {step >= 1 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard label="New Rows" value={counts.new} tone="primary" hint="Will be inserted" />
            <StatCard
              label="Updated"
              value={counts.updated}
              tone="default"
              hint="Quantity revised"
            />
            <StatCard label="Unchanged" value={counts.unchanged} hint="No action" />
            <StatCard label="Warnings" value={counts.warning} tone="warning" hint="Needs review" />
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
              {committed ? (
                <StatusBadge status="Completed" size="lg" />
              ) : (
                <Button onClick={() => setConfirm(true)} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Commit Import
                </Button>
              )}
            </div>

            {[
              ["all", rows],
              ["new", rows.filter((r) => r.status === "New")],
              ["updated", rows.filter((r) => r.status === "Updated")],
              ["issues", rows.filter((r) => r.status === "Warning" || r.status === "Rejected")],
            ].map(([key, data]) => (
              <TabsContent key={key as string} value={key as string} className="mt-4">
                <DataTable
                  rows={data as ImportRowResult[]}
                  columns={columns}
                  searchKeys={(r) =>
                    `${r.grnNumber} ${r.materialNumber} ${r.description} ${r.batch}`
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
