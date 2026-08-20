import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { Progress } from "@/components/ui/progress";
import { getGRNs } from "@/services/api";
import type { GRNHeader } from "@/types";

export const Route = createFileRoute("/_shell/grns/")({
  head: () => ({
    meta: [
      { title: "Goods Receipt Notes — TrackGRN" },
      {
        name: "description",
        content:
          "Browse imported SAP GRNs with received, labelled, inwarded and issued quantities.",
      },
      { property: "og:title", content: "Goods Receipt Notes — TrackGRN" },
      { property: "og:description", content: "Browse imported SAP GRNs and their material lines." },
    ],
  }),
  component: GRNListPage,
});

function GRNListPage() {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({ queryKey: ["grns"], queryFn: getGRNs });
  const [status, setStatus] = useState("All");
  const [plant, setPlant] = useState("All");

  const filtered = data.filter(
    (g) => (status === "All" || g.status === status) && (plant === "All" || g.plant === plant),
  );

  const columns: Column<GRNHeader>[] = [
    {
      key: "grn",
      header: "GRN Number",
      render: (g) => <span className="num font-semibold text-primary">{g.grnNumber}</span>,
    },
    { key: "date", header: "GRN Date", render: (g) => <span className="num">{g.grnDate}</span> },
    {
      key: "vendor",
      header: "Vendor",
      render: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{g.vendor}</p>
          <p className="num text-xs text-muted-foreground">{g.vendorCode}</p>
        </div>
      ),
    },
    {
      key: "po",
      header: "PO Number",
      render: (g) => <span className="num">{g.poNumber}</span>,
      hideByDefault: true,
    },
    {
      key: "plant",
      header: "Plant / SLoc",
      render: (g) => (
        <span className="num">
          {g.plant} · {g.storageLocation}
        </span>
      ),
    },
    {
      key: "materials",
      header: "Materials",
      sortValue: (g) => g.materials,
      render: (g) => <span className="num">{g.materials}</span>,
    },
    {
      key: "recv",
      header: "Received",
      sortValue: (g) => g.receivedQty,
      render: (g) => <span className="num">{g.receivedQty.toLocaleString()}</span>,
    },
    {
      key: "avail",
      header: "Available",
      sortValue: (g) => g.availableQty,
      render: (g) => <span className="num text-success">{g.availableQty.toLocaleString()}</span>,
    },
    {
      key: "progress",
      header: "Issue Progress",
      sortValue: (g) => g.issuedQty / Math.max(1, g.receivedQty),
      render: (g) => {
        const pct = Math.round((g.issuedQty / Math.max(1, g.receivedQty)) * 100);
        return (
          <div className="w-32">
            <Progress value={pct} className="h-1.5" />
            <p className="num mt-1 text-xs text-muted-foreground">{pct}% issued</p>
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (g) => <StatusBadge status={g.status} /> },
  ];

  const totals = filtered.reduce(
    (acc, g) => ({
      received: acc.received + g.receivedQty,
      issued: acc.issued + g.issuedQty,
      available: acc.available + g.availableQty,
    }),
    { received: 0, issued: 0, available: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods Receipt Notes"
        description="All GRNs imported from SAP with live labelling and issue progress."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={<ExportButton name="grns" />}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="GRNs" value={filtered.length} tone="primary" />
        <StatCard label="Received Qty" value={totals.received.toLocaleString()} />
        <StatCard label="Issued Qty" value={totals.issued.toLocaleString()} tone="warning" />
        <StatCard label="Available Qty" value={totals.available.toLocaleString()} tone="success" />
      </div>

      <FilterBar
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["All", "Partial", "Completed", "Pending", "Blocked"],
            value: status,
            onChange: setStatus,
          },
          {
            key: "plant",
            label: "Plant",
            options: ["All", "1000", "1100"],
            value: plant,
            onChange: setPlant,
          },
        ]}
        onReset={() => {
          setStatus("All");
          setPlant("All");
        }}
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(g) => `${g.grnNumber} ${g.vendor} ${g.poNumber} ${g.importBatch}`}
          onRowClick={(g) => void navigate({ to: "/grns/$id", params: { id: g.grnNumber } })}
          emptyMessage="No GRNs match the current filters."
        />
      )}
    </div>
  );
}
