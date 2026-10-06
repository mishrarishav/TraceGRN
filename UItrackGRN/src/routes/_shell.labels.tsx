import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { QRPreview } from "@/components/common/QRPreview";
import { PrintOutputSelect, type PrintOutput } from "@/components/common/PrintOutputSelect";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranding } from "@/hooks/use-branding";
import { cn } from "@/lib/utils";
import { openLabelPdf } from "@/lib/label-pdf";
import { getTableRows, type DataTableState } from "@/lib/table-data";
import { getLabels, printLabel } from "@/services/api";
import type { MaterialLabel } from "@/types";

export const Route = createFileRoute("/_shell/labels")({
  head: () => ({
    meta: [
      { title: "Label Material Inward — TrackGRN" },
      {
        name: "description",
        content: "Preview, batch print and inward SAP-imported material labels.",
      },
      { property: "og:title", content: "Label Material Inward — TrackGRN" },
      {
        property: "og:description",
        content: "Batch print and inward SAP-imported material labels.",
      },
    ],
  }),
  component: LabelsPage,
});

type BatchRowState = "queued" | "printing" | "completed" | "failed";

interface BatchRowProgress {
  state: BatchRowState;
  message?: string;
}

function isAwaitingInward(label: MaterialLabel) {
  return label.status === "Generated" || label.status === "Printed";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected printer error";
}

function labelSearchText(label: MaterialLabel) {
  return `${label.labelUid} ${label.grnNumber} ${label.materialNumber} ${label.description} ${label.batch} ${label.binSequence}`;
}

function LabelsPage() {
  const queryClient = useQueryClient();
  const { branding } = useBranding();
  const { data = [], isLoading } = useQuery({ queryKey: ["labels"], queryFn: getLabels });
  const [status, setStatus] = useState("All");
  const [tableState, setTableState] = useState<DataTableState>({
    query: "",
    filters: {},
    sort: null,
  });
  const [selected, setSelected] = useState<MaterialLabel | null>(null);
  const [reprint, setReprint] = useState<MaterialLabel | null>(null);
  const [printOutput, setPrintOutput] = useState<PrintOutput>("Printer");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSource, setBatchSource] = useState<MaterialLabel[]>([]);
  const [batchFrom, setBatchFrom] = useState(1);
  const [batchTo, setBatchTo] = useState(1);
  const [batchProgress, setBatchProgress] = useState<Record<string, BatchRowProgress>>({});

  const statusRows = useMemo(
    () => data.filter((label) => status === "All" || label.status === status),
    [data, status],
  );
  const batchSelection = useMemo(
    () => batchSource.slice(Math.max(0, batchFrom - 1), Math.max(batchFrom, batchTo)),
    [batchFrom, batchSource, batchTo],
  );
  const batchFinished = batchSelection.filter((label) => {
    const state = batchProgress[label.labelUid]?.state;
    return state === "completed" || state === "failed";
  }).length;

  const updateBatchRow = (labelUid: string, next: BatchRowProgress) => {
    setBatchProgress((current) => ({ ...current, [labelUid]: next }));
  };

  const batchPrint = useMutation({
    mutationFn: async (labels: MaterialLabel[]) => {
      let completed = 0;
      let failed = 0;

      for (const label of labels) {
        updateBatchRow(label.labelUid, { state: "printing" });
        try {
          await printLabel(
            label.labelUid,
            label.printCount > 0 ? "Batch reprint before material inward" : undefined,
          );
          updateBatchRow(label.labelUid, { state: "completed" });
          completed += 1;
        } catch (error) {
          updateBatchRow(label.labelUid, { state: "failed", message: errorMessage(error) });
          failed += 1;
        }
      }

      return { completed, failed, requested: labels.length };
    },
    onSuccess: (result) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["labels"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      if (result.failed > 0) {
        toast.warning("Batch completed with exceptions", {
          description: `${result.completed} of ${result.requested} labels were printed and inwarded. Review the red rows before retrying.`,
        });
      } else {
        toast.success("Batch print and inward complete", {
          description: `${result.completed} labels were printed and inwarded successfully.`,
        });
      }
    },
  });

  const reprintMutation = useMutation({
    mutationFn: async (label: MaterialLabel) => {
      const isFirstPrint = label.printCount === 0;
      const result = await printLabel(
        label.labelUid,
        isFirstPrint ? undefined : "Operator-confirmed damaged label reprint",
      );

      return { result, inwarded: isAwaitingInward(label) };
    },
    onSuccess: (outcome) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["labels"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      toast.success(outcome.inwarded ? "Label printed and inwarded" : "Reprint sent", {
        description: `${reprint?.labelUid ?? "Label"} → ${outcome.result.printer}`,
      });
      setReprint(null);
    },
    onError: (error) => toast.error("Label print failed", { description: error.message }),
  });

  const batchLabels = (output: PrintOutput) =>
    filtered.filter((label) =>
      output === "PDF"
        ? label.status !== "Blocked" && label.status !== "Cancelled"
        : isAwaitingInward(label),
    );

  const prepareBatch = (eligible: MaterialLabel[]) => {
    batchPrint.reset();
    setBatchSource(eligible);
    setBatchFrom(1);
    setBatchTo(eligible.length);
    setBatchProgress(
      Object.fromEntries(eligible.map((label) => [label.labelUid, { state: "queued" }])),
    );
  };

  const changePrintOutput = (output: PrintOutput) => {
    setPrintOutput(output);
    if (batchOpen) prepareBatch(batchLabels(output));
  };

  const exportPdf = (labels: MaterialLabel[]) => {
    try {
      openLabelPdf(labels, branding);
      toast.success("Label PDF opened", {
        description: `${labels.length} label(s) ready to download or print.`,
      });
    } catch (error) {
      toast.error("PDF export failed", { description: errorMessage(error) });
    }
  };

  const openLabelOutput = (label: MaterialLabel) => {
    if (printOutput === "PDF") exportPdf([label]);
    else setReprint(label);
  };

  const openBatchPreview = () => {
    const eligible = batchLabels(printOutput);
    if (eligible.length === 0) {
      toast.info(
        printOutput === "PDF"
          ? "No labels are available for PDF export in this view."
          : "No labels are awaiting print and inward in this view.",
      );
      return;
    }

    prepareBatch(eligible);
    setBatchOpen(true);
  };

  const columns: Column<MaterialLabel>[] = [
    {
      key: "uid",
      header: "Label UID",
      sortValue: (label) => label.labelUid,
      filterValue: (label) => label.labelUid,
      render: (label) => (
        <span className="num whitespace-nowrap font-semibold text-primary">{label.labelUid}</span>
      ),
    },
    {
      key: "grn",
      header: "GRN",
      sortValue: (label) => label.grnNumber,
      filterValue: (label) => label.grnNumber,
      render: (label) => <span className="num whitespace-nowrap">{label.grnNumber}</span>,
    },
    {
      key: "material",
      header: "Material",
      sortValue: (label) => label.materialNumber,
      filterValue: (label) => label.materialNumber,
      render: (label) => <span className="num whitespace-nowrap">{label.materialNumber}</span>,
    },
    {
      key: "description",
      header: "Description",
      sortValue: (label) => label.description,
      filterValue: (label) => label.description,
      render: (label) => label.description,
      className: "max-w-[200px] truncate",
      hideByDefault: true,
    },
    {
      key: "quantity",
      header: "Pack Qty",
      sortValue: (label) => label.quantity,
      filterValue: (label) => `${label.quantity} ${label.uom}`,
      render: (label) => (
        <span className="num whitespace-nowrap">
          {label.quantity} {label.uom}
        </span>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      sortValue: (label) => label.batch,
      filterValue: (label) => label.batch,
      render: (label) => <span className="num">{label.batch}</span>,
      hideByDefault: true,
    },
    {
      key: "srNo",
      header: "Sr. No.",
      render: (_label, rowIndex) => <span className="num">{rowIndex + 1}</span>,
    },
    {
      key: "sequence",
      header: "Label No.",
      sortValue: (label) => Number.parseInt(label.binSequence, 10) || 0,
      filterValue: (label) => label.binSequence,
      render: (label) => <span className="num whitespace-nowrap">{label.binSequence}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (label) => label.status,
      filterValue: (label) => label.status,
      render: (label) => <StatusBadge status={label.status} />,
    },
    {
      key: "actions",
      header: "",
      render: (label) => {
        const awaitingInward = isAwaitingInward(label);
        const isReprint = label.printCount > 0;
        return (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 whitespace-nowrap"
            onClick={(event) => {
              event.stopPropagation();
              openLabelOutput(label);
            }}
            disabled={label.status === "Blocked" || label.status === "Cancelled"}
          >
            {printOutput === "PDF" ? (
              <FileText className="h-3.5 w-3.5" />
            ) : isReprint ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
            {printOutput === "PDF"
              ? "Open PDF"
              : awaitingInward
                ? `${isReprint ? "Reprint" : "Print"} & Inward`
                : "Reprint"}
          </Button>
        );
      },
    },
  ];

  const filtered = getTableRows(statusRows, columns, tableState, labelSearchText);
  const active = selected
    ? (filtered.find((label) => label.labelUid === selected.labelUid) ?? filtered[0] ?? null)
    : (filtered[0] ?? null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Label Material Inward"
        description="Print SAP-imported pack labels and inward each completed label in the same flow."
        icon={<QrCode className="h-5 w-5" />}
        actions={
          <>
            <ExportButton name="labels" />
            <Button
              className="gap-2"
              onClick={openBatchPreview}
              disabled={isLoading || batchLabels(printOutput).length === 0}
            >
              {printOutput === "PDF" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {printOutput === "PDF" ? "Batch PDF" : "Batch Print"}
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <DataTable
              rows={statusRows}
              columns={columns}
              state={tableState}
              onStateChange={setTableState}
              pageSize={6}
              searchKeys={labelSearchText}
              onRowClick={setSelected}
              emptyMessage="No labels match the current filter."
              dense
              toolbar={
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger aria-label="Label status filter" className="h-9 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "All",
                      "Generated",
                      "Printed",
                      "Inwarded",
                      "Issued",
                      "Blocked",
                      "Cancelled",
                    ].map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "All" ? "All statuses" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          )}
        </div>

        <div className="panel self-start p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Label Preview</p>
              <p className="text-xs text-muted-foreground">100 × 75 mm thermal transfer</p>
            </div>
            {active ? <StatusBadge status={active.status} /> : null}
          </div>
          {active ? (
            <QRPreview
              label={active}
              config={{
                brandLogoDataUrl: branding.clientLogoDataUrl,
                brandName: branding.clientName,
              }}
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Select a label to preview
            </div>
          )}
          <div className="mt-3">
            <PrintOutputSelect value={printOutput} onChange={changePrintOutput} />
            {printOutput === "PDF" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Opens a PDF in a new window for download or printing. PDF export does not mark
                labels inward.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            className="mt-3 w-full gap-2"
            onClick={() => active && openLabelOutput(active)}
            disabled={!active || active.status === "Blocked" || active.status === "Cancelled"}
          >
            {printOutput === "PDF" ? (
              <FileText className="h-4 w-4" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            {printOutput === "PDF"
              ? "Open Label PDF"
              : active && isAwaitingInward(active)
                ? `${active.printCount > 0 ? "Reprint" : "Print"} & Inward Selected`
                : "Reprint Selected Label"}
          </Button>
        </div>
      </div>

      <Dialog
        open={batchOpen}
        onOpenChange={(open) => {
          if (!open && batchPrint.isPending) return;
          setBatchOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-5xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12">
            <DialogTitle>
              {printOutput === "PDF" ? "Batch PDF Preview" : "Batch Print Preview"}
            </DialogTitle>
            <DialogDescription>
              {printOutput === "PDF"
                ? "Choose the label range to open as a PDF. One label per page; PDF export does not mark labels inward."
                : "Confirm the exact SAP-imported label range. Each row turns green after print and material inward both complete."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <PrintOutputSelect
                value={printOutput}
                onChange={changePrintOutput}
                disabled={batchPrint.isPending || batchPrint.isSuccess}
              />
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                From label
                <Input
                  type="number"
                  min={1}
                  max={batchSource.length}
                  value={batchFrom}
                  disabled={batchPrint.isPending || batchPrint.isSuccess}
                  onChange={(event) => {
                    const next = Math.min(
                      batchSource.length,
                      Math.max(1, Number(event.target.value) || 1),
                    );
                    setBatchFrom(next);
                    setBatchTo((current) => Math.max(current, next));
                  }}
                  className="mt-1 h-9 w-28"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                To label
                <Input
                  type="number"
                  min={batchFrom}
                  max={batchSource.length}
                  value={batchTo}
                  disabled={batchPrint.isPending || batchPrint.isSuccess}
                  onChange={(event) =>
                    setBatchTo(
                      Math.min(
                        batchSource.length,
                        Math.max(batchFrom, Number(event.target.value) || batchFrom),
                      ),
                    )
                  }
                  className="mt-1 h-9 w-28"
                />
              </label>
              <div className="pb-2 text-sm text-muted-foreground">
                {printOutput === "PDF" ? "Exporting" : "Printing"}{" "}
                <span className="num font-semibold text-foreground">
                  {batchSource.length ? batchFrom : 0}
                </span>{" "}
                to <span className="num font-semibold text-foreground">{batchTo}</span> of{" "}
                <span className="num font-semibold text-foreground">{batchSource.length}</span>{" "}
                eligible labels
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses all matching table records across pages, in the current sort order.
              {printOutput === "Printer"
                ? " Only labels awaiting print and inward are included."
                : " Blocked and cancelled labels are excluded."}
            </p>

            {printOutput === "Printer" ? (
              <div className="flex items-center gap-3">
                <Progress
                  value={batchSelection.length ? (batchFinished / batchSelection.length) * 100 : 0}
                  className="h-2 flex-1"
                />
                <span className="num text-xs text-muted-foreground">
                  {batchFinished}/{batchSelection.length}
                </span>
              </div>
            ) : null}

            <div className="max-h-[48dvh] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 z-10 bg-surface text-left text-xs tracking-wide text-muted-foreground uppercase shadow-sm">
                  <tr>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Label UID</th>
                    <th className="px-3 py-2.5">GRN</th>
                    <th className="px-3 py-2.5">Material</th>
                    <th className="px-3 py-2.5">Pack Qty</th>
                    <th className="px-3 py-2.5">{printOutput === "PDF" ? "Status" : "Progress"}</th>
                  </tr>
                </thead>
                <tbody>
                  {batchSelection.map((label, index) => {
                    const rowProgress = batchProgress[label.labelUid] ?? { state: "queued" };
                    return (
                      <tr
                        key={label.labelUid}
                        className={cn(
                          "border-t border-border/70 transition-colors",
                          rowProgress.state === "completed" && "bg-success/20 text-success",
                          rowProgress.state === "failed" && "bg-destructive/10 text-destructive",
                          rowProgress.state === "printing" && "bg-primary/10",
                        )}
                      >
                        <td className="num px-3 py-2.5">{batchFrom + index}</td>
                        <td className="num px-3 py-2.5 font-semibold">{label.labelUid}</td>
                        <td className="num px-3 py-2.5">{label.grnNumber}</td>
                        <td className="num px-3 py-2.5">{label.materialNumber}</td>
                        <td className="num px-3 py-2.5">
                          {label.quantity} {label.uom}
                        </td>
                        <td className="px-3 py-2.5">
                          {printOutput === "PDF" ? (
                            <StatusBadge status={label.status} />
                          ) : (
                            <BatchStatus progress={rowProgress} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-surface/50 px-5 py-3">
            <Button
              variant="outline"
              onClick={() => setBatchOpen(false)}
              disabled={batchPrint.isPending}
            >
              {batchPrint.isSuccess ? "Done" : "Cancel"}
            </Button>
            <Button
              className="gap-2"
              disabled={batchSelection.length === 0 || batchPrint.isPending || batchPrint.isSuccess}
              onClick={() =>
                printOutput === "PDF"
                  ? exportPdf(batchSelection)
                  : batchPrint.mutate(batchSelection)
              }
            >
              {batchPrint.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : printOutput === "PDF" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {printOutput === "PDF"
                ? `Open PDF (${batchSelection.length} Labels)`
                : batchPrint.isPending
                  ? `Printing ${batchFinished + 1} of ${batchSelection.length}`
                  : batchPrint.isSuccess
                    ? "Batch Complete"
                    : `Print & Inward ${batchSelection.length} Labels`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!reprint}
        onOpenChange={(open) => {
          if (!open && !reprintMutation.isPending) setReprint(null);
        }}
        title={
          printOutput === "PDF"
            ? "Open this label as PDF?"
            : reprint && isAwaitingInward(reprint)
              ? `${reprint.printCount > 0 ? "Reprint" : "Print"} and inward this label?`
              : "Reprint this label?"
        }
        description={
          printOutput === "PDF"
            ? "The PDF opens in a new window for download or printing. Exporting does not mark this label inward."
            : reprint && isAwaitingInward(reprint)
              ? `Label ${reprint.labelUid} will be sent to the printer and marked inward after printing succeeds.`
              : `Label ${reprint?.labelUid ?? ""} has been printed ${reprint?.printCount ?? 0} time(s). This reprint is recorded in the audit log.`
        }
        confirmLabel={
          printOutput === "PDF"
            ? "Open Label PDF"
            : reprint && isAwaitingInward(reprint)
              ? `${reprint.printCount > 0 ? "Reprint" : "Print"} & Inward`
              : "Reprint Label"
        }
        onConfirm={() => {
          if (!reprint) return;
          if (printOutput === "PDF") {
            exportPdf([reprint]);
            setReprint(null);
          } else reprintMutation.mutate(reprint);
        }}
      >
        <PrintOutputSelect value={printOutput} onChange={changePrintOutput} />
      </ConfirmationDialog>
    </div>
  );
}

function BatchStatus({ progress }: { progress: BatchRowProgress }) {
  const content: Record<BatchRowState, { icon: typeof Circle; label: string }> = {
    queued: { icon: Circle, label: "Queued" },
    printing: { icon: Loader2, label: "Printing" },
    completed: { icon: CheckCircle2, label: "Printed & inwarded" },
    failed: { icon: AlertCircle, label: "Needs attention" },
  };
  const { icon: Icon, label } = content[progress.state];

  return (
    <div>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
        <Icon className={cn("h-4 w-4", progress.state === "printing" && "animate-spin")} />
        {label}
      </span>
      {progress.message ? (
        <p className="mt-0.5 max-w-64 text-xs leading-snug">{progress.message}</p>
      ) : null}
    </div>
  );
}
