import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getAuditLogs } from "@/services/api";
import type { AuditEvent } from "@/types";

export const Route = createFileRoute("/_shell/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — TraceFlow" },
      { name: "description", content: "Immutable record of every import, label, inward and issue action with old and new values." },
      { property: "og:title", content: "Audit Log — TraceFlow" },
      { property: "og:description", content: "Immutable traceability audit trail." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["audit"], queryFn: getAuditLogs });
  const [module, setModule] = useState("All");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const filtered = data.filter((a) => (module === "All" || a.module === module) && (status === "All" || a.status === status));

  const columns: Column<AuditEvent>[] = [
    { key: "ts", header: "Timestamp", render: (a) => <span className="num text-xs">{a.timestamp}</span> },
    { key: "user", header: "User", render: (a) => a.user },
    { key: "action", header: "Action", render: (a) => <span className="font-medium">{a.action}</span> },
    { key: "module", header: "Module", render: (a) => a.module },
    { key: "entity", header: "Entity", render: (a) => <span className="num">{a.entity} {a.entityId}</span> },
    { key: "device", header: "Device", render: (a) => <span className="num text-xs">{a.device}</span>, hideByDefault: true },
    { key: "ip", header: "IP", render: (a) => <span className="num text-xs">{a.ip}</span>, hideByDefault: true },
    { key: "status", header: "Result", render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Complete, tamper-evident history of user and system actions."
        icon={<ScrollText className="h-5 w-5" />}
        actions={<ExportButton name="audit-log" />}
      />
      <FilterBar
        filters={[
          { key: "module", label: "Module", options: ["All", "Import", "Labels", "Inward", "Issue", "Admin"], value: module, onChange: setModule },
          { key: "status", label: "Result", options: ["All", "Success", "Failed"], value: status, onChange: setStatus },
        ]}
        onReset={() => { setModule("All"); setStatus("All"); }}
      />
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(a) => `${a.user} ${a.action} ${a.entityId} ${a.module}`}
          onRowClick={setSelected}
          dense
        />
      )}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.action}</SheetTitle>
                <SheetDescription className="num">
                  {selected.entity} {selected.entityId} · {selected.timestamp}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 text-sm">
                <div className="panel space-y-2 p-4">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Context</p>
                  <p className="num">User · {selected.user}</p>
                  <p className="num">Device · {selected.device}</p>
                  <p className="num">IP · {selected.ip}</p>
                  <p>Module · {selected.module}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="panel p-4">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Old values</p>
                    {Object.entries(selected.oldValues).map(([k, v]) => (
                      <p key={k} className="num text-xs">{k}: {String(v)}</p>
                    ))}
                  </div>
                  <div className="panel p-4">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">New values</p>
                    {Object.entries(selected.newValues).map(([k, v]) => (
                      <p key={k} className="num text-xs text-success">{k}: {String(v)}</p>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
