import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RevisionDiff } from "@/components/common/RevisionDiff";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ExportButton } from "@/components/common/ExportButton";
import { StatCard } from "@/components/common/StatCard";
import { getRevisions } from "@/services/api";

export const Route = createFileRoute("/_shell/revisions")({
  head: () => ({
    meta: [
      { title: "Revision History — TraceFlow" },
      { name: "description", content: "Quantity and field revisions applied to GRNs after the original SAP import." },
      { property: "og:title", content: "Revision History — TraceFlow" },
      { property: "og:description", content: "GRN revisions with approval status." },
    ],
  }),
  component: RevisionsPage,
});

function RevisionsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["revisions"], queryFn: getRevisions });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision History"
        description="Every change made to imported GRN data, with before and after values."
        icon={<History className="h-5 w-5" />}
        actions={<ExportButton name="revisions" />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Revisions" value={data.length} tone="primary" />
        <StatCard label="Awaiting Review" value={data.filter((r) => r.status === "Admin Review" || r.status === "Pending").length} tone="warning" />
        <StatCard label="Applied" value={data.filter((r) => r.status === "Updated" || r.status === "Completed").length} tone="success" />
      </div>
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((r) => (
            <div key={r.id} className="panel p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="num text-sm font-semibold text-primary">{r.grnNumber}</p>
                  <p className="num text-xs text-muted-foreground">Material {r.materialNumber}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <RevisionDiff field={r.field} oldValue={r.oldValue} newValue={r.newValue} />
              <p className="num mt-3 text-xs text-muted-foreground">
                {r.changedBy} · {r.changedAt}
              </p>
              {r.note ? <p className="mt-1 text-xs text-muted-foreground">{r.note}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
