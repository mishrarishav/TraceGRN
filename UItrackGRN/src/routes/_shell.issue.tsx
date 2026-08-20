import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Forklift, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { ScannerInput } from "@/components/common/ScannerInput";
import { MaterialSummaryCard } from "@/components/common/MaterialSummaryCard";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLabels, getStations, issueMaterial, scanErrorMessage, scanLabel } from "@/services/api";
import { createRuntimeId } from "@/lib/id";
import type { MaterialLabel } from "@/types";

export const Route = createFileRoute("/_shell/issue")({
  head: () => ({
    meta: [
      { title: "Material Issue — TrackGRN" },
      {
        name: "description",
        content: "Scan QR labels at the issue station to move material from store to production.",
      },
      { property: "og:title", content: "Material Issue — TrackGRN" },
      { property: "og:description", content: "Store-to-production issue scanning station." },
    ],
  }),
  component: IssuePage,
});

interface IssueLog {
  id: string;
  labelUid: string;
  material: string;
  qty: string;
  time: string;
  ok: boolean;
  message: string;
}

function IssuePage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<MaterialLabel | null>(null);
  const [confirmed, setConfirmed] = useState<MaterialLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<IssueLog[]>([]);
  const [station, setStation] = useState("STORE-EXIT-01");
  const [remaining, setRemaining] = useState<number | null>(null);
  const { data: stationRows = [] } = useQuery({ queryKey: ["stations"], queryFn: getStations });
  const { data: labels = [] } = useQuery({ queryKey: ["labels"], queryFn: getLabels });
  const issueStations = stationRows.filter(
    (row) =>
      row.status === "Active" && (row.type === "Issue Station" || row.type === "General Station"),
  );
  const simulationLabel =
    labels.find((label) => label.status === "Inwarded") ??
    labels.find((label) => label.status === "Generated" || label.status === "Printed") ??
    labels[0];

  const scan = useMutation({
    mutationFn: (code: string) => scanLabel(code, "issue"),
    onSuccess: (res, code) => {
      if (!res.ok) {
        setPending(null);
        setConfirmed(null);
        const message = scanErrorMessage[res.error];
        setError(message);
        toast.error("Scan rejected", { description: `${code} · ${message}` });
        setLog((l) => [
          {
            id: createRuntimeId("scan"),
            labelUid: code,
            material: "—",
            qty: "—",
            time: new Date().toLocaleTimeString(),
            ok: false,
            message,
          },
          ...l,
        ]);
        return;
      }
      setError(null);
      setConfirmed(null);
      setPending(res.label);
    },
  });

  const issue = useMutation({
    mutationFn: async (label: MaterialLabel) => ({
      label,
      result: await issueMaterial(label.labelUid, station),
    }),
    onSuccess: ({ label, result }) => {
      setConfirmed(label);
      setRemaining(result.remaining);
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
      toast.success("Material issued", {
        description: `${label.labelUid} · ${result.quantity} ${result.uom} to ${station}`,
      });
      setLog((l) => [
        {
          id: createRuntimeId("scan"),
          labelUid: label.labelUid,
          material: label.materialNumber,
          qty: `${result.quantity} ${result.uom}`,
          time: new Date().toLocaleTimeString(),
          ok: true,
          message: `Issued to ${station}`,
        },
        ...l,
      ]);
      setPending(null);
    },
    onError: (failure) => {
      const message = failure instanceof Error ? failure.message : "Issue transaction failed";
      setError(message);
      setConfirmed(null);
      toast.error("Issue failed", { description: message });
    },
  });

  const okCount = log.filter((l) => l.ok).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Issue"
        description="Store-to-production issue. Each scan permanently consumes the labelled pack."
        icon={<Forklift className="h-5 w-5" />}
        actions={<StatusBadge status="Active" size="lg" />}
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard label="Scans this session" value={log.length} tone="primary" />
        <StatCard label="Issued" value={okCount} tone="success" />
        <StatCard label="Rejected" value={log.length - okCount} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="panel space-y-4 p-3 sm:p-5">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Issue station</p>
              <Select value={station} onValueChange={setStation}>
                <SelectTrigger className="h-11" aria-label="Issue station">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {issueStations.map((row) => (
                    <SelectItem key={row.code} value={row.code}>
                      {row.code} · {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScannerInput
              onScan={(code) => scan.mutate(code)}
              busy={scan.isPending}
              hint="Scan the pack QR label with the handheld device."
              suggestion={simulationLabel?.labelUid}
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
            ) : confirmed ? (
              <motion.div
                key={confirmed.labelUid}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                  <div>
                    <p className="text-sm font-semibold text-success">Issued to {station}</p>
                    {remaining !== null ? (
                      <p className="num text-xs text-success/80">
                        Remaining stock: {remaining.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
                <MaterialSummaryCard label={confirmed} />
              </motion.div>
            ) : pending ? (
              <motion.div
                key={`p-${pending.labelUid}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <MaterialSummaryCard label={pending} />
              </motion.div>
            ) : (
              <EmptyState
                title="Ready to scan"
                description="Scan a pack label to load material details before issuing."
                icon={<Forklift className="h-6 w-6" />}
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
              <p className="text-sm text-muted-foreground">No issues recorded yet.</p>
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
                    <StatusBadge status={l.ok ? "Issued" : "Rejected"} />
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

      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Confirm material issue"
        description={`${pending?.quantity ?? 0} ${pending?.uom ?? ""} of ${pending?.materialNumber ?? ""} will be issued to ${station}. This cannot be undone.`}
        confirmLabel="Confirm Issue"
        onConfirm={() => pending && issue.mutate(pending)}
      />
    </div>
  );
}
