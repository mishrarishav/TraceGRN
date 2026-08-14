import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { getMaterials } from "@/services/api";
import type { Material } from "@/types";

export const Route = createFileRoute("/_shell/materials")({
  head: () => ({
    meta: [
      { title: "Materials — TraceFlow" },
      { name: "description", content: "Material master with received, issued and available quantity across all GRNs." },
      { property: "og:title", content: "Materials — TraceFlow" },
      { property: "og:description", content: "Material master and live stock position." },
    ],
  }),
  component: MaterialsPage,
});

function MaterialsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["materials"], queryFn: getMaterials });
  const [uom, setUom] = useState("All");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<Material | null>(null);

  const filtered = data.filter(
    (m) => (uom === "All" || m.uom === uom) && (status === "All" || m.status === status),
  );

  const columns: Column<Material>[] = [
    { key: "mat", header: "Material", render: (m) => <span className="num font-semibold text-primary">{m.materialNumber}</span> },
    { key: "desc", header: "Description", render: (m) => m.description, className: "max-w-[280px] truncate" },
    { key: "uom", header: "UoM", render: (m) => <span className="num">{m.uom}</span> },
    { key: "pack", header: "Pack Std", sortValue: (m) => m.packingStandard, render: (m) => <span className="num">{m.packingStandard}</span> },
    { key: "recv", header: "Received", sortValue: (m) => m.totalReceived, render: (m) => <span className="num">{m.totalReceived.toLocaleString()}</span> },
    { key: "iss", header: "Issued", sortValue: (m) => m.totalIssued, render: (m) => <span className="num text-warning">{m.totalIssued.toLocaleString()}</span> },
    {
      key: "avail",
      header: "Available",
      sortValue: (m) => m.available,
      render: (m) => (
        <div className="w-28">
          <span className="num text-sm font-medium text-success">{m.available.toLocaleString()}</span>
          <Progress value={(m.available / Math.max(1, m.totalReceived)) * 100} className="mt-1 h-1.5" />
        </div>
      ),
    },
    { key: "grn", header: "Latest GRN", render: (m) => <span className="num">{m.latestGrn}</span> },
    { key: "status", header: "Status", render: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materials"
        description="Consolidated material position across every imported GRN."
        icon={<Boxes className="h-5 w-5" />}
        actions={<ExportButton name="materials" />}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Materials" value={filtered.length} tone="primary" />
        <StatCard label="Total Received" value={filtered.reduce((a, m) => a + m.totalReceived, 0).toLocaleString()} />
        <StatCard label="Total Issued" value={filtered.reduce((a, m) => a + m.totalIssued, 0).toLocaleString()} tone="warning" />
        <StatCard label="Available" value={filtered.reduce((a, m) => a + m.available, 0).toLocaleString()} tone="success" />
      </div>

      <FilterBar
        filters={[
          { key: "uom", label: "UoM", options: ["All", "PCS", "KG", "M", "L", "SET"], value: uom, onChange: setUom },
          { key: "status", label: "Status", options: ["All", "Available", "Blocked", "Partial"], value: status, onChange: setStatus },
        ]}
        onReset={() => {
          setUom("All");
          setStatus("All");
        }}
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(m) => `${m.materialNumber} ${m.description} ${m.latestGrn}`}
          onRowClick={setSelected}
          emptyMessage="No materials match the current filters."
        />
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="num">{selected.materialNumber}</SheetTitle>
                <SheetDescription>{selected.description}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Received" value={selected.totalReceived.toLocaleString()} />
                  <StatCard label="Issued" value={selected.totalIssued.toLocaleString()} tone="warning" />
                  <StatCard label="Available" value={selected.available.toLocaleString()} tone="success" />
                  <StatCard label="Pack Std" value={`${selected.packingStandard} ${selected.uom}`} />
                </div>
                <div className="panel space-y-2 p-4 text-sm">
                  <Row k="Unit of Measure" v={selected.uom} />
                  <Row k="Latest GRN" v={selected.latestGrn} />
                  <Row k="Estimated Labels" v={String(Math.ceil(selected.totalReceived / selected.packingStandard))} />
                </div>
                <Link
                  to="/traceability"
                  className="block rounded-lg border border-border bg-surface p-4 text-sm transition-colors hover:bg-accent"
                >
                  Trace this material end-to-end →
                </Link>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="num font-medium">{v}</span>
    </div>
  );
}
