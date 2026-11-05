import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, Printer, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ExportButton } from "@/components/common/ExportButton";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranding } from "@/hooks/use-branding";
import { createLabelPdf, openLabelPdf } from "@/lib/label-pdf";
import type { DataTableState } from "@/lib/table-data";
import {
  getLabelPrintGroups,
  getLabelPrintHistory,
  getLabelPrintSelection,
  printLabel,
  recordLabelPdf,
  type LabelWorkspaceParameters,
} from "@/services/api";
import type { LabelPrintGroup, MaterialLabel } from "@/types";

export const Route = createFileRoute("/_shell/labels")({
  head: () => ({ meta: [{ title: "Sticker Printing - TrackGRN" }] }),
  component: LabelsPage,
});
const emptyView = (): DataTableState => ({ query: "", filters: {}, sort: null });
const groupKey = (group: LabelPrintGroup) =>
  JSON.stringify([group.grnNumber, group.materialNumber, group.uom]);
const canPrint = (label: MaterialLabel) =>
  label.status !== "Blocked" && label.status !== "Cancelled";
type ProgressRow = { state: "printing" | "completed" | "failed"; message?: string };

function LabelsPage() {
  const client = useQueryClient();
  const { branding } = useBranding();
  const [tab, setTab] = useState("pending");
  const [view, setView] = useState<DataTableState>(emptyView);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("All");
  const [selectedGroup, setSelectedGroup] = useState<string>();
  const [selectedUid, setSelectedUid] = useState<string>();
  const [output, setOutput] = useState<PrintOutput>("Printer");
  const [batch, setBatch] = useState<MaterialLabel[] | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
  const [reprint, setReprint] = useState<MaterialLabel | null>(null);
  const [reason, setReason] = useState("");
  const parameters: LabelWorkspaceParameters = {
    page: page + 1,
    pageSize: 12,
    search: view.query,
    grn: view.filters["grn"],
    material: view.filters["material"],
    uid: view.filters["uid"],
    status: tab === "history" ? status : undefined,
    sort: view.sort?.key,
    direction: view.sort?.dir,
  };
  const groupsQuery = useQuery({
    queryKey: ["label-print-groups", parameters],
    queryFn: () => getLabelPrintGroups(parameters),
    enabled: tab === "pending",
  });
  const historyQuery = useQuery({
    queryKey: ["label-print-history", parameters],
    queryFn: () => getLabelPrintHistory(parameters),
    enabled: tab === "history",
  });
  const groups = groupsQuery.data?.rows ?? [];
  const history = historyQuery.data?.rows ?? [];
  const group = groups.find((row) => groupKey(row) === selectedGroup) ?? groups[0];
  const groupParameters: LabelWorkspaceParameters = {
    grn: group?.grnNumber,
    material: group?.materialNumber,
    uom: group?.uom,
    exact: true,
  };
  const previewQuery = useQuery({
    queryKey: ["label-print-selection", groupParameters],
    queryFn: () => getLabelPrintSelection(groupParameters),
    enabled: tab === "pending" && !!group,
  });
  const active =
    tab === "pending"
      ? previewQuery.data?.[0]
      : (history.find((row) => row.labelUid === selectedUid) ?? history[0]);
  const selection = batch?.slice(from - 1, to) ?? [];
  const finished = selection.filter((label) =>
    ["completed", "failed"].includes(progress[label.labelUid]?.state ?? ""),
  ).length;
  const invalidate = () =>
    Promise.all(
      [
        "label-print-groups",
        "label-print-history",
        "label-print-selection",
        "labels",
        "dashboard",
        "inventory",
        "transactions",
        "traceability",
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );

  const printing = useMutation({
    mutationFn: async (job: {
      labels: MaterialLabel[];
      output: PrintOutput;
      popup?: Window | undefined;
      reason?: string | undefined;
    }) => {
      let failed = 0;
      let simulated = 0;
      if (job.output === "PDF") {
        try {
          createLabelPdf(job.labels, branding);
          const recorded = await recordLabelPdf(
            job.labels.map((label) => label.labelUid),
            job.reason,
          );
          openLabelPdf(recorded, branding, job.popup);
          setProgress(
            Object.fromEntries(recorded.map((label) => [label.labelUid, { state: "completed" }])),
          );
        } catch (error) {
          job.popup?.close();
          throw error;
        }
      } else {
        for (const label of job.labels) {
          setProgress((rows) => ({ ...rows, [label.labelUid]: { state: "printing" } }));
          try {
            const dispatched = await printLabel(label.labelUid, job.reason);
            if (dispatched.simulated) simulated++;
            setProgress((rows) => ({
              ...rows,
              [label.labelUid]: {
                state: "completed",
                ...(dispatched.simulated ? { message: "Simulated" } : {}),
              },
            }));
          } catch (error) {
            failed++;
            setProgress((rows) => ({
              ...rows,
              [label.labelUid]: {
                state: "failed",
                message: error instanceof Error ? error.message : "Printing failed",
              },
            }));
          }
        }
      }
      return { failed, completed: job.labels.length - failed, output: job.output, simulated };
    },
    onSuccess: ({ failed, completed, output: completedOutput, simulated }) => {
      void invalidate();
      if (failed)
        toast.warning(`${completed} completed, ${failed} failed. Retry the failed labels.`);
      else {
        if (simulated)
          toast.warning(
            `${simulated} label(s) simulated. Configure a physical printer for actual stickers.`,
          );
        else
          toast.success(
            completedOutput === "PDF"
              ? "Sticker PDF prepared and recorded"
              : "Labels sent to Zebra printer",
          );
        setReprint(null);
      }
    },
    onError: (error) => {
      void invalidate();
      toast.error("Sticker output failed", { description: error.message });
    },
  });
  const startOutput = (labels: MaterialLabel[], reprintReason?: string) => {
    if (!labels.length || labels.length > 500) return;
    let popup: Window | undefined;
    if (output === "PDF") {
      popup = window.open("", "_blank") ?? undefined;
      if (!popup) {
        toast.error("Allow pop-ups for TrackGRN to open the sticker PDF.");
        return;
      }
      popup.opener = null;
      popup.document.body.textContent = "Preparing sticker PDF...";
    }
    printing.mutate({ labels, output, popup, reason: reprintReason });
  };
  const prepare = useMutation({
    mutationFn: (options: LabelWorkspaceParameters) => getLabelPrintSelection(options),
    onSuccess: (labels) => {
      if (!labels.length) {
        toast.info("No pending labels match this selection.");
        return;
      }
      printing.reset();
      setProgress({});
      setBatch(labels);
      setFrom(1);
      setTo(Math.min(500, labels.length));
    },
    onError: (error) => toast.error("Could not load labels", { description: error.message }),
  });
  const busy = printing.isPending || prepare.isPending;
  const openReprint = (label: MaterialLabel) => {
    printing.reset();
    setProgress({});
    setReason("");
    setReprint(label);
  };
  function commonColumns<
    T extends Pick<
      MaterialLabel,
      "grnNumber" | "materialNumber" | "description" | "quantity" | "uom"
    >,
  >(): Column<T>[] {
    return [
      {
        key: "grn",
        header: "GRN",
        sortValue: (row) => row.grnNumber,
        filterValue: (row) => row.grnNumber,
        render: (row) => <span className="num whitespace-nowrap">{row.grnNumber}</span>,
      },
      {
        key: "material",
        header: "Material",
        sortValue: (row) => row.materialNumber,
        filterValue: (row) => row.materialNumber,
        render: (row) => <span className="num whitespace-nowrap">{row.materialNumber}</span>,
      },
      {
        key: "description",
        header: "Description",
        render: (row) => (
          <span className="block max-w-48 truncate" title={row.description}>
            {row.description}
          </span>
        ),
      },
      {
        key: "quantity",
        header: "Quantity",
        sortValue: (row) => row.quantity,
        render: (row) => (
          <span className="num whitespace-nowrap">
            {row.quantity} {row.uom}
          </span>
        ),
      },
    ];
  }
  const groupColumns: Column<LabelPrintGroup>[] = [
    { key: "srNo", header: "Sr. No.", render: (_row, index) => index + 1 },
    ...commonColumns<LabelPrintGroup>(),
    {
      key: "labels",
      header: "Labels",
      sortValue: (row) => row.labelCount,
      render: (row) => <span className="num">{row.labelCount}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            prepare.mutate({
              grn: row.grnNumber,
              material: row.materialNumber,
              uom: row.uom,
              exact: true,
            });
          }}
        >
          Print labels
        </Button>
      ),
    },
  ];
  const historyColumns: Column<MaterialLabel>[] = [
    {
      key: "uid",
      header: "Label ID",
      sortValue: (row) => row.labelUid,
      filterValue: (row) => row.labelUid,
      render: (row) => <span className="num whitespace-nowrap text-primary">{row.labelUid}</span>,
    },
    ...commonColumns<MaterialLabel>(),
    { key: "sequence", header: "Pack", render: (row) => row.binSequence },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "count", header: "Print count", render: (row) => row.printCount },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !canPrint(row)}
          onClick={(event) => {
            event.stopPropagation();
            openReprint(row);
          }}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Reprint
        </Button>
      ),
    },
  ];
  const query = tab === "pending" ? groupsQuery : historyQuery;
  const tableProps = {
    state: view,
    onStateChange: setView,
    pageSize: 12,
    dense: true,
    loading: query.isFetching,
    pagination: { page, total: query.data?.total ?? 0, onPageChange: setPage },
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sticker Printing"
        description="Excel upload → Generate & auto-inward → Print sticker → Scan for issue"
        icon={<QrCode className="h-5 w-5" />}
        actions={
          <>
            <ExportButton name="labels" />
            {tab === "pending" ? (
              <Button
                disabled={busy || !groupsQuery.data?.total}
                onClick={() => prepare.mutate(parameters)}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print All
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          setView(emptyView());
          setPage(0);
          setStatus("All");
        }}
      >
        <TabsList>
          <TabsTrigger value="pending">Pending Printing</TabsTrigger>
          <TabsTrigger value="history">Reprint History</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isError ? (
        <div role="alert" className="panel p-4 text-destructive">
          Could not load printing records: {query.error.message}
          <Button variant="outline" className="ml-3" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {tab === "pending" ? (
            <DataTable
              key="groups"
              {...tableProps}
              rows={groups}
              columns={groupColumns}
              searchKeys={(row) => `${row.grnNumber} ${row.materialNumber} ${row.description}`}
              onRowClick={(row) => setSelectedGroup(groupKey(row))}
              emptyMessage="All matching labels have been printed. Use Reprint History for an existing sticker."
            />
          ) : (
            <DataTable
              key="history"
              {...tableProps}
              rows={history}
              columns={historyColumns}
              searchKeys={(row) => `${row.labelUid} ${row.grnNumber} ${row.materialNumber}`}
              onRowClick={(row) => setSelectedUid(row.labelUid)}
              toolbar={
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Label status filter" className="h-9 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["All", "Inwarded", "Issued", "Blocked", "Cancelled"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === "All" ? "All statuses" : value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          )}
        </div>
        <aside className="panel self-start p-3">
          <p className="font-semibold">Label Preview</p>
          <p className="mb-3 text-xs text-muted-foreground">
            100 × 75 mm · QR contains only Label ID
          </p>
          {active ? (
            <QRPreview
              label={active}
              config={{
                brandLogoDataUrl: branding.clientLogoDataUrl,
                brandName: branding.clientName,
              }}
            />
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              {previewQuery.isError && tab === "pending"
                ? "Could not load the selected part's labels."
                : "Select a part or printed label to preview."}
            </p>
          )}
          <div className="mt-3">
            <PrintOutputSelect value={output} onChange={setOutput} disabled={busy} />
          </div>
          <Button
            className="mt-3 w-full"
            disabled={busy || !active || !canPrint(active)}
            onClick={() =>
              tab === "pending" ? prepare.mutate(groupParameters) : active && openReprint(active)
            }
          >
            {output === "PDF" ? (
              <FileText className="mr-2 h-4 w-4" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            {tab === "pending" ? "Print selected part" : "Reprint selected label"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            PDF preparation is recorded in print history. Reprinting keeps the same Label ID and
            stock quantity.
          </p>
        </aside>
      </div>
      <Dialog
        open={!!batch}
        onOpenChange={(open) => {
          if (!open && !printing.isPending) setBatch(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-5xl overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {output === "PDF" ? "Batch PDF Preview" : "Batch Print Preview"}
            </DialogTitle>
            <DialogDescription>
              One sticker for each pack. Labels are inwarded automatically. Select up to 500 labels
              per print run.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <PrintOutputSelect value={output} onChange={setOutput} disabled={printing.isPending} />
            <label className="text-sm">
              From label
              <Input
                aria-label="From label"
                type="number"
                min={1}
                max={batch?.length}
                value={from}
                disabled={printing.isPending}
                className="w-28"
                onChange={(event) => {
                  const next = Math.min(
                    batch?.length ?? 1,
                    Math.max(1, Number(event.target.value) || 1),
                  );
                  setFrom(next);
                  setTo(Math.min(batch?.length ?? 1, next + 499));
                  setProgress({});
                  printing.reset();
                }}
              />
            </label>
            <label className="text-sm">
              To label
              <Input
                aria-label="To label"
                type="number"
                min={from}
                max={Math.min(batch?.length ?? 1, from + 499)}
                value={to}
                disabled={printing.isPending}
                className="w-28"
                onChange={(event) => {
                  setTo(
                    Math.min(
                      batch?.length ?? 1,
                      from + 499,
                      Math.max(from, Number(event.target.value) || from),
                    ),
                  );
                  setProgress({});
                  printing.reset();
                }}
              />
            </label>
            <p className="pb-2 text-sm text-muted-foreground">
              {batch?.length} pending labels · {selection.length} selected
            </p>
          </div>
          {printing.isPending || finished > 0 ? (
            <Progress value={selection.length ? (finished / selection.length) * 100 : 0} />
          ) : null}
          <div className="max-h-[42dvh] overflow-auto rounded-lg border">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {["#", "Label ID", "GRN", "Material", "Pack Qty", "Progress"].map((heading) => (
                    <th className="p-2 text-left" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selection.map((label, index) => (
                  <tr key={label.labelUid} className="border-t">
                    <td className="p-2">{from + index}</td>
                    <td className="p-2 font-mono text-xs">{label.labelUid}</td>
                    <td className="p-2">{label.grnNumber}</td>
                    <td className="p-2">{label.materialNumber}</td>
                    <td className="p-2">
                      {label.quantity} {label.uom}
                    </td>
                    <td className="p-2">
                      {progress[label.labelUid]?.state === "completed" ? (
                        <span className="inline-flex items-center text-success">
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {progress[label.labelUid]?.message ?? "Completed"}
                        </span>
                      ) : progress[label.labelUid]?.state === "failed" ? (
                        <span className="text-destructive">
                          {progress[label.labelUid]?.message}
                        </span>
                      ) : progress[label.labelUid]?.state === "printing" ? (
                        "Printing..."
                      ) : (
                        "Ready"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {printing.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {printing.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={printing.isPending} onClick={() => setBatch(null)}>
              Close
            </Button>
            <Button
              disabled={
                printing.isPending ||
                !selection.length ||
                selection.every((label) => progress[label.labelUid]?.state === "completed")
              }
              onClick={() =>
                startOutput(
                  selection.filter((label) => progress[label.labelUid]?.state !== "completed"),
                )
              }
            >
              {printing.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {output === "PDF"
                ? `Open PDF (${selection.length} Labels)`
                : finished
                  ? "Retry failed labels"
                  : `Print ${selection.length} Labels`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        keepOpen
        open={!!reprint}
        onOpenChange={(open) => {
          if (!open && !printing.isPending) setReprint(null);
        }}
        title="Reprint this label?"
        description={`Label ${reprint?.labelUid ?? ""}. The same Label ID will be retained and this output will be audited.`}
        confirmLabel={printing.isPending ? "Preparing..." : "Reprint Label"}
        onConfirm={() => {
          if (reprint && !printing.isPending) {
            if (!reason.trim()) {
              toast.error("Enter a reason for reprint.");
              return;
            }
            startOutput([reprint], reason.trim());
          }
        }}
      >
        <label className="text-sm">
          Reprint reason
          <Input
            aria-label="Reprint reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Damaged sticker"
            disabled={printing.isPending}
          />
        </label>
        <PrintOutputSelect value={output} onChange={setOutput} disabled={printing.isPending} />
      </ConfirmationDialog>
    </div>
  );
}
