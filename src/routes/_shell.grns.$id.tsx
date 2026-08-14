import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, CalendarDays, ClipboardList, FileSpreadsheet, MapPin, Receipt } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { ExportButton } from "@/components/common/ExportButton";
import { RevisionDiff } from "@/components/common/RevisionDiff";
import { Timeline } from "@/components/common/Timeline";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGRNById, getLabels, getRevisions } from "@/services/api";
import type { GRNLine, MaterialLabel } from "@/types";

export const Route = createFileRoute("/_shell/grns/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `GRN ${params.id} — TraceFlow` },
      { name: "description", content: `Line items, labels and revision history for goods receipt note ${params.id}.` },
      { property: "og:title", content: `GRN ${params.id} — TraceFlow` },
      { property: "og:description", content: `Material lines and label status for GRN ${params.id}.` },
    ],
  }),
  component: GRNDetailPage,
});

function GRNDetailPage() {
  const { id } = Route.useParams();
  const { data: grn, isLoading } = useQuery({ queryKey: ["grn", id], queryFn: () => getGRNById(id) });
  const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: getLabels });
  const { data: revisions = [] } = useQuery({ queryKey: ["revisions"], queryFn: getRevisions });

  if (isLoading) return <LoadingSkeleton />;
  if (!grn)
    return (
      <EmptyState
        title="GRN not found"
        description={`No goods receipt note matches ${id}.`}
        icon={<ClipboardList className="h-6 w-6" />}
        action={
          <Button asChild variant="outline">
            <Link to="/grns">Back to GRNs</Link>
          </Button>
        }
      />
    );

  const grnLabels = labels.filter((l) => l.grnNumber === grn.grnNumber);
  const grnRevisions = revisions.filter((r) => r.grnNumber === grn.grnNumber);
  const pct = Math.round((grn.issuedQty / Math.max(1, grn.receivedQty)) * 100);

  const lineColumns: Column<GRNLine>[] = [
    { key: "line", header: "Line", render: (l) => <span className="num">{l.lineItem}</span> },
    { key: "mat", header: "Material", render: (l) => <span className="num font-medium">{l.materialNumber}</span> },
    { key: "desc", header: "Description", render: (l) => l.description, className: "max-w-[260px] truncate" },
    { key: "batch", header: "Batch", render: (l) => <span className="num">{l.batch}</span> },
    { key: "recv", header: "Received", sortValue: (l) => l.receivedQty, render: (l) => <span className="num">{l.receivedQty.toLocaleString()}</span> },
    { key: "pack", header: "Pack Std", render: (l) => <span className="num">{l.packingStandard}</span> },
    { key: "labels", header: "Labels", render: (l) => <span className="num">{l.labels}</span> },
    { key: "issued", header: "Issued", sortValue: (l) => l.issuedQty, render: (l) => <span className="num text-warning">{l.issuedQty.toLocaleString()}</span> },
    { key: "avail", header: "Available", sortValue: (l) => l.availableQty, render: (l) => <span className="num text-success">{l.availableQty.toLocaleString()}</span> },
    { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
  ];

  const labelColumns: Column<MaterialLabel>[] = [
    { key: "uid", header: "Label UID", render: (l) => <span className="num font-medium">{l.labelUid}</span> },
    { key: "mat", header: "Material", render: (l) => <span className="num">{l.materialNumber}</span> },
    { key: "qty", header: "Qty", render: (l) => <span className="num">{l.quantity} {l.uom}</span> },
    { key: "bin", header: "Bin Seq", render: (l) => <span className="num">{l.binSequence}</span> },
    { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
    { key: "gen", header: "Generated", render: (l) => <span className="num text-xs text-muted-foreground">{l.generatedAt}</span> },
  ];

  const meta = [
    { icon: Building2, label: "Vendor", value: `${grn.vendor} (${grn.vendorCode})` },
    { icon: Receipt, label: "PO Number", value: grn.poNumber },
    { icon: CalendarDays, label: "GRN Date", value: grn.grnDate },
    { icon: MapPin, label: "Plant / Storage", value: `${grn.plant} · ${grn.storageLocation}` },
    { icon: FileSpreadsheet, label: "Import Batch", value: grn.importBatch },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/grns">
          <ArrowLeft className="h-4 w-4" /> All GRNs
        </Link>
      </Button>

      <PageHeader
        title={`GRN ${grn.grnNumber}`}
        description={`${grn.materials} materials · last updated ${grn.lastUpdated}`}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <>
            <StatusBadge status={grn.status} size="lg" />
            <ExportButton name={`grn-${grn.grnNumber}`} />
          </>
        }
      />

      <div className="panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        {meta.map((m) => (
          <div key={m.label} className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <m.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="num truncate text-sm font-medium">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Received" value={grn.receivedQty.toLocaleString()} tone="primary" />
        <StatCard label="Labels Generated" value={grn.labelled} hint={`${grn.inwarded} inwarded`} />
        <StatCard label="Issued" value={grn.issuedQty.toLocaleString()} tone="warning" />
        <StatCard label="Available" value={grn.availableQty.toLocaleString()} tone="success" />
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Issue completion</span>
          <span className="num text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-3 h-2" />
      </div>

      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Line Items</TabsTrigger>
          <TabsTrigger value="labels">Labels ({grnLabels.length})</TabsTrigger>
          <TabsTrigger value="revisions">Revisions ({grnRevisions.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="lines" className="mt-4">
          <DataTable
            rows={grn.lines}
            columns={lineColumns}
            searchKeys={(l) => `${l.materialNumber} ${l.description} ${l.batch}`}
            dense
          />
        </TabsContent>

        <TabsContent value="labels" className="mt-4">
          <DataTable
            rows={grnLabels}
            columns={labelColumns}
            searchKeys={(l) => `${l.labelUid} ${l.materialNumber}`}
            emptyMessage="No labels generated for this GRN yet."
            dense
          />
        </TabsContent>

        <TabsContent value="revisions" className="mt-4 space-y-3">
          {grnRevisions.length === 0 ? (
            <EmptyState title="No revisions" description="This GRN has not been revised since import." />
          ) : (
            grnRevisions.map((r) => (
              <div key={r.id} className="panel p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="num text-sm font-medium">
                    {r.materialNumber} · {r.field}
                  </p>
                  <StatusBadge status={r.status} />
                </div>
                <RevisionDiff field={r.field} oldValue={r.oldValue} newValue={r.newValue} />
                <p className="num mt-3 text-xs text-muted-foreground">
                  {r.changedBy} · {r.changedAt} {r.note ? `· ${r.note}` : ""}
                </p>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="panel p-5">
            <Timeline
              steps={[
                { title: "GRN imported from SAP", date: grn.grnDate, time: "09:12", user: "System", station: grn.importBatch, status: "New" },
                { title: "Labels generated", date: grn.grnDate, time: "10:04", user: "Priya Nair", station: "Store Desk 1", status: "Generated" },
                { title: "Labels printed", date: grn.grnDate, time: "10:22", user: "Priya Nair", station: "Zebra ZT411", status: "Printed" },
                { title: "Material inwarded", date: grn.grnDate, time: "11:47", user: "Amit Verma", station: "INW-01", status: "Inwarded" },
                { title: "Partial issue to production", date: grn.lastUpdated.slice(0, 10), time: "14:35", user: "Rahul Sharma", station: "ISS-02", status: "Issued" },
              ]}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
