import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { Progress } from "@/components/ui/progress";
import { getInventory } from "@/services/api";
import type { InventoryRow } from "@/types";

export const Route = createFileRoute("/_shell/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — TrackGRN" },
      {
        name: "description",
        content:
          "Material-wise stock balance showing received, labelled, inwarded, issued and blocked quantities.",
      },
      { property: "og:title", content: "Inventory — TrackGRN" },
      { property: "og:description", content: "Live stock balance across GRNs and materials." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["inventory"], queryFn: getInventory });
  const [availability, setAvailability] = useState("All");

  const filtered = data.filter((r) =>
    availability === "All"
      ? true
      : availability === "In Stock"
        ? r.available > 0
        : availability === "Depleted"
          ? r.available === 0
          : r.blocked > 0,
  );

  const columns: Column<InventoryRow>[] = [
    {
      key: "mat",
      header: "Material",
      render: (r) => <span className="num font-semibold text-primary">{r.materialNumber}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (r) => r.description,
      className: "max-w-[240px] truncate",
    },
    { key: "grn", header: "GRN", render: (r) => <span className="num">{r.grnNumber}</span> },
    {
      key: "recv",
      header: "Received",
      sortValue: (r) => r.received,
      render: (r) => <span className="num">{r.received.toLocaleString()}</span>,
    },
    {
      key: "lab",
      header: "Labelled",
      sortValue: (r) => r.labelled,
      render: (r) => <span className="num">{r.labelled}</span>,
    },
    {
      key: "inw",
      header: "Inwarded",
      sortValue: (r) => r.inwarded,
      render: (r) => <span className="num">{r.inwarded}</span>,
    },
    {
      key: "iss",
      header: "Issued",
      sortValue: (r) => r.issued,
      render: (r) => <span className="num text-warning">{r.issued.toLocaleString()}</span>,
    },
    {
      key: "blk",
      header: "Blocked",
      sortValue: (r) => r.blocked,
      render: (r) => <span className="num text-destructive">{r.blocked}</span>,
      hideByDefault: true,
    },
    {
      key: "avail",
      header: "Available",
      sortValue: (r) => r.available,
      render: (r) => (
        <div className="w-32">
          <span className="num text-sm font-medium text-success">
            {r.available.toLocaleString()}
          </span>
          <Progress value={(r.available / Math.max(1, r.received)) * 100} className="mt-1 h-1.5" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock balance derived from labelling, inward and issue transactions."
        icon={<Warehouse className="h-5 w-5" />}
        actions={<ExportButton name="inventory" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock Lines" value={filtered.length} tone="primary" />
        <StatCard
          label="Received"
          value={filtered.reduce((a, r) => a + r.received, 0).toLocaleString()}
        />
        <StatCard
          label="Issued"
          value={filtered.reduce((a, r) => a + r.issued, 0).toLocaleString()}
          tone="warning"
        />
        <StatCard
          label="Available"
          value={filtered.reduce((a, r) => a + r.available, 0).toLocaleString()}
          tone="success"
        />
      </div>

      <FilterBar
        filters={[
          {
            key: "availability",
            label: "Availability",
            options: ["All", "In Stock", "Depleted", "Has Blocked"],
            value: availability,
            onChange: setAvailability,
          },
        ]}
        onReset={() => setAvailability("All")}
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(r) => `${r.materialNumber} ${r.description} ${r.grnNumber}`}
          emptyMessage="No stock rows match the current filter."
        />
      )}
    </div>
  );
}
