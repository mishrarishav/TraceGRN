import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, PackageCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { ScannerInput } from "@/components/common/ScannerInput";
import { MaterialSummaryCard } from "@/components/common/MaterialSummaryCard";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inwardMaterial, scanLabel } from "@/services/api";
import type { MaterialLabel } from "@/types";

export const Route = createFileRoute("/_shell/inward")({
  head: () => ({
    meta: [
      { title: "Material Inward — TraceFlow" },
      { name: "description", content: "Scan QR labels to confirm physical receipt and store materials into bin locations." },
      { property: "og:title", content: "Material Inward — TraceFlow" },
      { property: "og:description", content: "Handheld scanning workflow for material inward." },
    ],
  }),
  component: InwardPage,
});

interface LogEntry {
  id: string;
  labelUid: string;
  material: string;
  qty: string;
  time: string;
  ok: boolean;
  message: string;
}

function InwardPage() {
  const [current, setCurrent] = useState<MaterialLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [bin, setBin] = useState("A-01-03");

  const push = (entry: LogEntry) => setLog((l) => [entry, ...l].slice(0, 25));

  const scan = useMutation({
    mutationFn: (code: string) => scanLabel(code),
    onSuccess: async (res, code) => {
      if (!res.ok) {
        setCurrent(null);
        const message = res.error === "NOT_FOUND" ? "Label not found in system" : "Label already issued to production";
        setError(message);
        toast.error("Scan rejected", { description: `${code} · ${message}` });
        push({ id: crypto.randomUUID(), labelUid: code, material: "—", qty: "—", time: new Date().toLocaleTimeString(), ok: false, message });
        return;
      }
      setError(null);
      setCurrent(res.label);
      await inwardMaterial(res.label.labelUid);
      toast.success("Material inwarded", { description: `${res.label.labelUid} → bin ${bin}` });
      push({
        id: crypto.randomUUID(),
        labelUid: res.label.labelUid,
        material: res.label.materialNumber,
        qty: `${res.label.quantity} ${res.label.uom}`,
        time: new Date().toLocaleTimeString(),
        ok: true,
        message: `Stored in ${bin}`,
      });
    },
  });

  const okCount = log.filter((l) => l.ok).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Inward"
        description="Scan each QR pack label to confirm physical receipt into the store."
        icon={<PackageCheck className="h-5 w-5" />}
        actions={<StatusBadge status="Active" size="lg" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Scanned this session" value={log.length} tone="primary" />
        <StatCard label="Accepted" value={okCount} tone="success" />
        <StatCard label="Rejected" value={log.length - okCount} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Destination bin</p>
                <Select value={bin} onValueChange={setBin}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["A-01-03", "A-02-01", "B-04-07", "C-01-02", "QUAR-01"].map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ScannerInput
              onScan={(code) => scan.mutate(code)}
              busy={scan.isPending}
              tone="success"
              hint="Trigger the Zebra MC9300 or type the label UID and press Enter."
              suggestion="LBL-2026-000118"
            />
          </div>

          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key={error}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-5"
              >
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Scan rejected</p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </motion.div>
            ) : current ? (
              <motion.div key={current.labelUid} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-4">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                  <p className="text-sm font-semibold text-success">Inward confirmed · stored in {bin}</p>
                </div>
                <MaterialSummaryCard label={current} />
              </motion.div>
            ) : (
              <EmptyState
                title="Waiting for scan"
                description="Scan a printed QR label to begin material inward."
                icon={<PackageCheck className="h-6 w-6" />}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Session Log</p>
            <Button size="sm" variant="ghost" onClick={() => setLog([])} disabled={!log.length}>
              Clear
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {log.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scans yet in this session.</p>
            ) : (
              log.map((l) => (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-medium">{l.labelUid}</span>
                    <StatusBadge status={l.ok ? "Inwarded" : "Rejected"} />
                  </div>
                  <p className="num mt-1 text-xs text-muted-foreground">
                    {l.material} · {l.qty} · {l.time}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{l.message}</p>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
