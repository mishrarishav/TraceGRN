import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MonitorSmartphone } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { getStations } from "@/services/api";

export const Route = createFileRoute("/_shell/stations")({
  head: () => ({
    meta: [
      { title: "Stations & Devices — TraceFlow" },
      { name: "description", content: "Inward and issue stations with their assigned handheld scanning devices." },
      { property: "og:title", content: "Stations & Devices — TraceFlow" },
      { property: "og:description", content: "Shop-floor scanning stations and devices." },
    ],
  }),
  component: StationsPage,
});

function StationsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["stations"], queryFn: getStations });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stations & Devices"
        description="Registered scanning points across receiving, stores and production lines."
        icon={<MonitorSmartphone className="h-5 w-5" />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Stations" value={data.length} tone="primary" />
        <StatCard label="Issue Stations" value={data.filter((s) => s.type === "Issue Station").length} tone="warning" />
        <StatCard label="Active" value={data.filter((s) => s.status === "Active").length} tone="success" />
      </div>
      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s, i) => (
            <motion.div key={s.code} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="panel p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="num text-sm font-semibold text-primary">{s.code}</p>
                  <p className="text-sm font-medium">{s.name}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <p>Type · <span className="text-foreground">{s.type}</span></p>
                <p>Location · <span className="text-foreground">{s.location}</span></p>
                <p>Device · <span className="num text-foreground">{s.device}</span></p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
