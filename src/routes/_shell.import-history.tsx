import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { getImportBatches } from "@/services/api";
import type { ImportBatch } from "@/types";

export const Route = createFileRoute("/_shell/import-history")({
  head: () => ({
    meta: [
      { title: "Import History — TraceFlow" },
      { name: "description", content: "Audit of every SAP GRN Excel import batch with row-level outcomes." },
      { property: "og:title", content: "Import History — TraceFlow" },
      { property: "og:description", content: "SAP GRN import batch history and outcomes." },
    ],
  }),
  component: ImportHistoryPage,
});

function ImportHistoryPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["import-batches"], queryFn: getImportBatches });

  const columns: Column<ImportBatch>[] = [
    { key: "id", header: "Batch", render: (b) => <span className="num font-semibold text-primary">{b.batchId}</span> },
    { key: "file", header: "File", render: (b) => b.fileName, className: "max-w-[220px] truncate" },
    { key: "at", header: "Uploaded", render: (b) => <span className="num">{b.uploadedAt}</span> },
    { key: "by", header: "By", render: (b) => b.uploadedBy },
    { key: "rows", header: "Rows", sortValue: (b) => b.totalRows, render: (b) => <span className="num">{b.totalRows}</span> },
    { key: "new", header: "New", render: (b) => <span className="num text-primary">{b.newRows}</span> },
    { key: "upd", header: "Updated", render: (b) => <span className="num text-info">{b.updated}</span> },
    { key: "warn", header: "Warnings", render: (b) => <span className="num text-warning">{b.warnings}</span> },
    { key: "rej", header: "Rejected", render: (b) => <span className="num text-destructive">{b.rejected}</span> },
    { key: "strategy", header: "Strategy", render: (b) => b.identificationStrategy, hideByDefault: true },
    { key: "dur", header: "Duration", render: (b) => <span className="num">{b.durationSeconds}s</span> },
    { key: "status", header: "Status", render: (b) => <StatusBadge status={b.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import History"
        description="Every SAP extract processed, with identification strategy and outcome counts."
        icon={<FileSpreadsheet className="h-5 w-5" />}
        actions={<ExportButton name="import-history" />}
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Batches" value={data.length} tone="primary" />
        <StatCard label="Rows Processed" value={data.reduce((a, b) => a + b.totalRows, 0).toLocaleString()} />
        <StatCard label="Warnings" value={data.reduce((a, b) => a + b.warnings, 0)} tone="warning" />
        <StatCard label="Rejected" value={data.reduce((a, b) => a + b.rejected, 0)} tone="danger" />
      </div>
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable rows={data} columns={columns} searchKeys={(b) => `${b.batchId} ${b.fileName} ${b.uploadedBy}`} />
      )}
    </div>
  );
}
