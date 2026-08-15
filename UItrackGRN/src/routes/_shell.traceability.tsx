import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Route as RouteIcon, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Timeline } from "@/components/common/Timeline";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ExportButton } from "@/components/common/ExportButton";
import { QRCodeArt } from "@/components/common/QRPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLabels, searchTraceability } from "@/services/api";
import type { TraceResult } from "@/types";

export const Route = createFileRoute("/_shell/traceability")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Traceability — TraceFlow" },
      {
        name: "description",
        content:
          "Trace any label, batch, material or GRN through its full journey from SAP import to production issue.",
      },
      { property: "og:title", content: "Traceability — TraceFlow" },
      {
        property: "og:description",
        content: "Full material journey from GRN import to production issue.",
      },
    ],
  }),
  component: TraceabilityPage,
});

function TraceabilityPage() {
  const { q: initialQuery } = Route.useSearch();
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { data: recentLabels = [] } = useQuery({ queryKey: ["labels"], queryFn: getLabels });
  const samples = Array.from(
    new Set(recentLabels.slice(0, 4).flatMap((label) => [label.labelUid, label.grnNumber])),
  ).slice(0, 4);

  const { mutate: trace, isPending } = useMutation({
    mutationFn: (q: string) => searchTraceability(q),
    onSuccess: (res) => {
      setResult(res);
      setNotFound(!res);
    },
  });

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      trace(initialQuery);
    }
  }, [initialQuery, trace]);

  const run = (q: string) => {
    setQuery(q);
    if (q.trim()) trace(q);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traceability"
        description="Search by label UID, GRN number, material number or batch to replay the full history."
        icon={<RouteIcon className="h-5 w-5" />}
        actions={result ? <ExportButton name={`trace-${result.labelUid}`} /> : undefined}
      />

      <div className="panel p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Label UID, GRN, material or batch"
              className="num h-12 pl-9 text-base"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 px-8" disabled={isPending}>
            {isPending ? "Searching…" : "Trace"}
          </Button>
        </form>
        {samples.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Recent:</span>
            {samples.map((sample) => (
              <button
                key={sample}
                onClick={() => run(sample)}
                className="num rounded-full border border-border bg-surface px-3 py-1 text-xs transition-colors hover:bg-accent"
              >
                {sample}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {notFound ? (
        <EmptyState
          title="No traceability record found"
          description="Check the label UID, GRN, material or batch number and search again."
          icon={<SearchX className="h-6 w-6" />}
        />
      ) : null}

      {result ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <QRCodeArt value={result.labelUid} className="h-24 w-24 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="num text-lg font-semibold">{result.labelUid}</h2>
                <StatusBadge status={result.currentStatus} size="lg" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
              <p className="num mt-1 text-xs text-muted-foreground">
                Material {result.materialNumber} · GRN {result.grnNumber} · Batch {result.batch}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Quantity" value={`${result.quantity} ${result.uom}`} tone="primary" />
            <StatCard label="Batch" value={result.batch} />
            <StatCard label="GRN" value={result.grnNumber} />
            <StatCard label="Events" value={result.steps.length} tone="success" />
          </div>

          <div className="panel p-5">
            <h3 className="mb-4 text-sm font-semibold">Material Journey</h3>
            <Timeline steps={result.steps} />
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
