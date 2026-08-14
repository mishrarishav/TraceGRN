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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getImportPreview, uploadGRNMock } from "@/services/api";
import type { ImportRowResult } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/import")({
  head: () => ({
    meta: [
      { title: "SAP GRN Import — TraceFlow" },
      { name: "description", content: "Upload SAP GRN Excel extracts, validate rows and commit material records." },
      { property: "og:title", content: "SAP GRN Import — TraceFlow" },
      { property: "og:description", content: "Validate and commit SAP GRN Excel extracts." },
    ],
  }),
  component: ImportPage,
});

const strategies = [
  { id: "A", name: "Strategy A — GRN + Line Item", fields: "GRN No + Line Item" },
  { id: "B", name: "Strategy B — GRN + Material", fields: "GRN No + Material No" },
  { id: "C", name: "Strategy C — GRN + Material + Batch", fields: "GRN No + Material No + Batch" },
  { id: "D", name: "Strategy D — Composite Hash", fields: "GRN + Line + Material + Plant" },
];

const steps = ["Upload File", "Validate & Preview", "Commit"];

function ImportPage() {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [strategy, setStrategy] = useState("A");
  const [template, setTemplate] = useState("SAP MB51 Standard");
  const [progress, setProgress] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["import-preview"],
    queryFn: getImportPreview,
    enabled: step >= 1,
  });

  const upload = useMutation({
    mutationFn: (name: string) => uploadGRNMock(name),
    onSuccess: () => {
      setStep(1);
      toast.success("File parsed", { description: "867 rows read from the SAP extract." });
    },
  });

  const handleFile = (name: string) => {
    setFileName(name);
    setProgress(0);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          return 100;
        }
        return p + 12;
      });
    }, 90);
    setTimeout(() => upload.mutate(name), 900);
  };

  const counts = {
    new: rows.filter((r) => r.status === "New").length,
    updated: rows.filter((r) => r.status === "Updated").length,
    unchanged: rows.filter((r) => r.status === "Unchanged").length,
    warning: rows.filter((r) => r.status === "Warning").length,
    rejected: rows.filter((r) => r.status === "Rejected").length,
  };

  const columns: Column<ImportRowResult>[] = [
    { key: "grn", header: "GRN No", render: (r) => <span className="num font-medium">{r.grnNumber}</span> },
    { key: "line", header: "Line", render: (r) => <span className="num">{r.lineItem}</span> },
    { key: "mat", header: "Material", render: (r) => <span className="num">{r.materialNumber}</span> },
    { key: "desc", header: "Description", render: (r) => r.description, className: "max-w-[240px] truncate" },
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
    { key: "pack", header: "Pack Std", render: (r) => <span className="num">{r.packingStandard}</span> },
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
            <span className={cn("text-sm font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
              {s}
            </span>
            {i < steps.length - 1 ? <span className="hidden h-px flex-1 bg-border sm:block" /> : null}
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
                handleFile(e.dataTransfer.files[0]?.name ?? "SAP_GRN_Extract.xlsx");
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
              <p className="mt-1 text-sm text-muted-foreground">Supports .xlsx and .xls up to 10 MB</p>
              <Button className="mt-5" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Browse Files
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0]?.name ?? "SAP_GRN_Extract.xlsx")}
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
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setFileName(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            ) : null}
          </div>

          <div className="panel space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold">Identification Strategy</p>
              <p className="text-xs text-muted-foreground">Determines how duplicate SAP rows are matched.</p>
            </div>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <p className="font-medium">Matching fields</p>
              <p className="num mt-1 text-muted-foreground">
                {strategies.find((s) => s.id === strategy)?.fields}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Column Mapping Template</p>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAP MB51 Standard">SAP MB51 Standard</SelectItem>
                  <SelectItem value="SAP MIGO Export">SAP MIGO Export</SelectItem>
                  <SelectItem value="Plant 1000 Custom">Plant 1000 Custom</SelectItem>
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
            <StatCard label="Updated" value={counts.updated} tone="default" hint="Quantity revised" />
            <StatCard label="Unchanged" value={counts.unchanged} hint="No action" />
            <StatCard label="Warnings" value={counts.warning} tone="warning" hint="Needs review" />
            <StatCard label="Rejected" value={counts.rejected} tone="danger" hint="Excluded from commit" />
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
                  searchKeys={(r) => `${r.grnNumber} ${r.materialNumber} ${r.description} ${r.batch}`}
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
        onConfirm={() => {
          setCommitted(true);
          setStep(2);
          toast.success("Import committed", {
            description: `Batch IMP-2026-0042 · ${counts.new + counts.updated} rows applied`,
          });
        }}
      />
    </div>
  );
}
