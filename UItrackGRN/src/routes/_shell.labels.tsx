import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { QRPreview } from "@/components/common/QRPreview";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  getConfiguration,
  getLabels,
  printLabel,
  printLabelBatch,
  testPrinter,
} from "@/services/api";
import type { MaterialLabel } from "@/types";

export const Route = createFileRoute("/_shell/labels")({
  head: () => ({
    meta: [
      { title: "Label Management — TrackGRN" },
      {
        name: "description",
        content: "Generate, preview and reprint QR material labels with full print audit history.",
      },
      { property: "og:title", content: "Label Management — TrackGRN" },
      { property: "og:description", content: "QR label generation and reprint control." },
    ],
  }),
  component: LabelsPage,
});

function LabelsPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["labels"], queryFn: getLabels });
  const { data: configuration } = useQuery({
    queryKey: ["configuration"],
    queryFn: getConfiguration,
  });
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<MaterialLabel | null>(null);
  const [reprint, setReprint] = useState<MaterialLabel | null>(null);
  const [cfg, setCfg] = useState({
    showBatch: true,
    showGrnDate: true,
    showDescription: true,
    showBin: true,
  });
  const batchPrint = useMutation({
    mutationFn: (uids: string[]) => printLabelBatch(uids),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
      toast.success("Batch print dispatched", {
        description: `${result.results.filter((item) => item.success).length} of ${result.requested} labels processed by the server printer adapter.`,
      });
    },
    onError: (error) => toast.error("Batch print failed", { description: error.message }),
  });
  const reprintMutation = useMutation({
    mutationFn: (label: MaterialLabel) =>
      printLabel(
        label.labelUid,
        label.printCount > 0 ? "Operator-confirmed damaged label reprint" : undefined,
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
      const action = (reprint?.printCount ?? 0) > 0 ? "Reprint" : "Print";
      toast.success(result.simulated ? `${action} simulated` : `${action} sent`, {
        description: `${reprint?.labelUid ?? "Label"} → ${result.printer}`,
      });
      setReprint(null);
    },
    onError: (error) => toast.error("Reprint failed", { description: error.message }),
  });
  const printerTest = useMutation({
    mutationFn: testPrinter,
    onSuccess: (result) =>
      toast.success(result.simulated ? "Test label simulated" : "Test label sent to printer", {
        description: `${result.labelUid} → ${result.printer} (${result.mode}, ${result.dpi} dpi)`,
      }),
    onError: (error) => toast.error("Test label print failed", { description: error.message }),
  });

  const filtered = data.filter((l) => status === "All" || l.status === status);
  const active = selected ?? filtered[0] ?? null;

  const columns: Column<MaterialLabel>[] = [
    {
      key: "uid",
      header: "Label UID",
      render: (l) => <span className="num font-semibold text-primary">{l.labelUid}</span>,
    },
    { key: "grn", header: "GRN", render: (l) => <span className="num">{l.grnNumber}</span> },
    {
      key: "mat",
      header: "Material",
      render: (l) => <span className="num">{l.materialNumber}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (l) => l.description,
      className: "max-w-[220px] truncate",
    },
    {
      key: "qty",
      header: "Qty",
      sortValue: (l) => l.quantity,
      render: (l) => (
        <span className="num">
          {l.quantity} {l.uom}
        </span>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      render: (l) => <span className="num">{l.batch}</span>,
      hideByDefault: true,
    },
    { key: "bin", header: "Bin Seq", render: (l) => <span className="num">{l.binSequence}</span> },
    {
      key: "prints",
      header: "Prints",
      sortValue: (l) => l.printCount,
      render: (l) => <span className="num">{l.printCount}</span>,
    },
    { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
    {
      key: "actions",
      header: "",
      render: (l) => (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={(e) => {
            e.stopPropagation();
            setReprint(l);
          }}
        >
          {l.printCount > 0 ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Printer className="h-3.5 w-3.5" />
          )}
          {l.printCount > 0 ? "Reprint" : "Print"}
        </Button>
      ),
    },
  ];

  const count = (s: string) => data.filter((l) => l.status === s).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Label Management"
        description="Every pack gets a unique QR label derived from the GRN packing standard."
        icon={<QrCode className="h-5 w-5" />}
        actions={
          <>
            <ExportButton name="labels" />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => printerTest.mutate()}
              disabled={printerTest.isPending || !configuration?.printing.hardwareReady}
            >
              <Printer className="h-4 w-4" />
              {printerTest.isPending ? "Sending…" : "Print Test Label"}
            </Button>
            <Button
              className="gap-2"
              onClick={() => batchPrint.mutate(filtered.map((label) => label.labelUid))}
              disabled={filtered.length === 0 || batchPrint.isPending}
            >
              <Printer className="h-4 w-4" /> Batch Print
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Generated" value={count("Generated")} tone="primary" />
        <StatCard label="Printed" value={count("Printed")} />
        <StatCard label="Inwarded" value={count("Inwarded")} tone="success" />
        <StatCard label="Issued" value={count("Issued")} tone="warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <FilterBar
            filters={[
              {
                key: "status",
                label: "Label Status",
                options: ["All", "Generated", "Printed", "Inwarded", "Issued", "Blocked"],
                value: status,
                onChange: setStatus,
              },
            ]}
            onReset={() => setStatus("All")}
          />
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <DataTable
              rows={filtered}
              columns={columns}
              searchKeys={(l) => `${l.labelUid} ${l.grnNumber} ${l.materialNumber} ${l.batch}`}
              onRowClick={setSelected}
              emptyMessage="No labels match the current filter."
              dense
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <p className="text-sm font-semibold">Label Preview</p>
            <p className="mb-3 text-xs text-muted-foreground">100 × 75 mm thermal transfer</p>
            {active ? <QRPreview label={active} config={cfg} /> : null}
            <Button
              type="button"
              className="mt-4 w-full gap-2"
              onClick={() => active && setReprint(active)}
              disabled={!active}
            >
              <Printer className="h-4 w-4" />
              {(active?.printCount ?? 0) > 0 ? "Reprint Selected Label" : "Print Selected Label"}
            </Button>
          </div>

          <div className="panel space-y-3 p-4">
            <p className="text-sm font-semibold">Print Settings</p>
            <div className="rounded-lg border border-border bg-surface p-3">
              <Label className="text-xs text-muted-foreground">Active printer</Label>
              <p className="mt-1 text-sm font-medium">
                {configuration?.printing.printerName ?? "Loading printer…"}
              </p>
              <p className="num text-xs text-muted-foreground">
                {configuration
                  ? `${configuration.printing.mode} · ${configuration.printing.dpi} dpi`
                  : "Reading API configuration"}
              </p>
            </div>
            {(
              [
                ["showDescription", "Show description"],
                ["showBatch", "Show batch"],
                ["showGrnDate", "Show GRN date"],
                ["showBin", "Show bin sequence"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cfg[key]}
                  onCheckedChange={(v) => setCfg((c) => ({ ...c, [key]: Boolean(v) }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={!!reprint}
        onOpenChange={(o) => !o && setReprint(null)}
        title={(reprint?.printCount ?? 0) > 0 ? "Reprint this label?" : "Print this label?"}
        description={
          (reprint?.printCount ?? 0) > 0
            ? `Label ${reprint?.labelUid ?? ""} has been printed ${reprint?.printCount ?? 0} time(s). A reprint is recorded in the audit log.`
            : `Send label ${reprint?.labelUid ?? ""} to the active configured printer? The print is recorded in the audit log.`
        }
        confirmLabel={(reprint?.printCount ?? 0) > 0 ? "Reprint Label" : "Print Label"}
        onConfirm={() => reprint && reprintMutation.mutate(reprint)}
      />
    </div>
  );
}
