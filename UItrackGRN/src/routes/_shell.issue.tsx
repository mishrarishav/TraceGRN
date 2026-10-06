import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Forklift, Loader2, ScanLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getStations,
  getTransactions,
  issueMaterial,
  scanErrorMessage,
  scanLabel,
} from "@/services/api";
import type { MaterialLabel } from "@/types";
import { extractLabelUid } from "@/lib/label-scan";

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

interface IssuedConfirmation {
  label: MaterialLabel;
  station: string;
  quantity: number;
  remaining: number;
  uom: string;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatGrnDate(value?: string | null) {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) return `${dateOnly[3]}-${dateOnly[2]}-${dateOnly[1]}`;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${padDatePart(parsed.getDate())}-${padDatePart(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const hours = parsed.getHours();
  const displayHours = hours % 12 || 12;
  const period = hours >= 12 ? "PM" : "AM";
  return `${padDatePart(parsed.getDate())}-${padDatePart(parsed.getMonth() + 1)}-${parsed.getFullYear()}, ${padDatePart(displayHours)}:${padDatePart(parsed.getMinutes())}:${padDatePart(parsed.getSeconds())} ${period}`;
}

function IssuePage() {
  const queryClient = useQueryClient();
  const scannerRef = useRef<HTMLTextAreaElement>(null);
  const [scanCode, setScanCode] = useState("");
  const [lastIssued, setLastIssued] = useState<IssuedConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState("STORE-EXIT-01");
  const { data: stationRows = [] } = useQuery({ queryKey: ["stations"], queryFn: getStations });
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
  });
  const issueStations = stationRows.filter(
    (row) =>
      row.status === "Active" && (row.type === "Issue Station" || row.type === "General Station"),
  );
  const issuedRows = transactions.filter((row) => row.type === "Issue").slice(0, 50);

  const issue = useMutation({
    mutationFn: async (label: MaterialLabel) => {
      const issueStation = station;
      return {
        label,
        issueStation,
        result: await issueMaterial(label.labelUid, issueStation),
      };
    },
    onSuccess: ({ label, issueStation, result }) => {
      setError(null);
      setLastIssued({ label, station: issueStation, ...result });
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Material issued", {
        description: `${label.labelUid} · ${result.quantity} ${result.uom} to ${issueStation}`,
      });
    },
    onError: (failure) => {
      const message = failure instanceof Error ? failure.message : "Issue transaction failed";
      setError(message);
      setLastIssued(null);
      toast.error("Issue failed", { description: message });
    },
  });

  const scan = useMutation({
    mutationFn: (code: string) => scanLabel(code, "issue"),
    onSuccess: (res, code) => {
      if (!res.ok) {
        setLastIssued(null);
        const message = scanErrorMessage[res.error];
        setError(message);
        toast.error("Scan rejected", { description: `${code} · ${message}` });
        return;
      }
      setError(null);
      setLastIssued(null);
      issue.mutate(res.label);
    },
    onError: (failure) => {
      const message = failure instanceof Error ? failure.message : "Unable to read this label";
      setError(message);
      setLastIssued(null);
      toast.error("Scan failed", { description: message });
    },
  });

  const busy = scan.isPending || issue.isPending;
  useEffect(() => {
    if (!busy) scannerRef.current?.focus();
  }, [busy]);

  const submitScan = (candidate = scanCode) => {
    if (!candidate.trim() || busy || !station) return;
    const code = extractLabelUid(candidate);
    if (!code) {
      setError("Label ID not found. Scan the full QR or enter a Label UID.");
      setLastIssued(null);
      scannerRef.current?.focus();
      return;
    }
    setScanCode("");
    scan.mutate(code);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Material Issue"
        description="Scan an inwarded, available pack to issue it directly to production."
        icon={<Forklift className="h-5 w-5" />}
        actions={<StatusBadge status="Active" size="lg" />}
      />

      <div className="panel p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitScan();
          }}
          className="grid items-end gap-3 lg:grid-cols-[minmax(14rem,18rem)_minmax(18rem,1fr)_auto]"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Issue station
            </label>
            <Select value={station} onValueChange={setStation} disabled={busy}>
              <SelectTrigger className="h-11" aria-label="Issue station">
                <SelectValue placeholder="Select an issue station" />
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

          <div>
            <label
              htmlFor="issue-label-scan"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Pack QR / Label UID
            </label>
            <div className="relative">
              <ScanLine className="absolute top-3.5 left-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                ref={scannerRef}
                id="issue-label-scan"
                value={scanCode}
                autoFocus
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setScanCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && extractLabelUid(event.currentTarget.value)) {
                    event.preventDefault();
                    submitScan(event.currentTarget.value);
                  }
                }}
                placeholder="Scan full QR payload or enter Label UID"
                rows={1}
                className="num min-h-11 resize-none py-3 pl-9 tracking-wide"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Full QR scans use only the Label ID. Other fields are ignored.
            </p>
          </div>

          <Button
            type="submit"
            className="h-11 px-6"
            disabled={busy || !station || !scanCode.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {scan.isPending ? "Checking…" : issue.isPending ? "Issuing…" : "Scan & Issue"}
          </Button>
        </form>

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          Only inwarded packs with available quantity can be issued. Every scan is validated before
          the issue transaction.
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            key={error}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3"
          >
            <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">Scan rejected</p>
              <p className="text-xs text-destructive/80">{error}</p>
            </div>
          </motion.div>
        ) : lastIssued ? (
          <motion.div
            key={lastIssued.label.labelUid}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="text-sm font-semibold text-success">
                  {lastIssued.label.labelUid} issued to {lastIssued.station}
                </p>
                <p className="num text-xs text-success/80">
                  {lastIssued.quantity} {lastIssued.uom} · {lastIssued.label.materialNumber}
                </p>
              </div>
            </div>
            <p className="num text-xs font-medium text-success">
              Remaining stock: {lastIssued.remaining.toLocaleString()}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="panel overflow-hidden" aria-labelledby="issued-materials-heading">
        <div className="border-b border-border px-4 py-3">
          <h2 id="issued-materials-heading" className="text-sm font-semibold">
            Issued Materials
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Successfully issued packs appear here in green.
          </p>
        </div>

        <Table className="min-w-[82rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Material Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="whitespace-nowrap">GRN</TableHead>
              <TableHead className="whitespace-nowrap">GRN Date</TableHead>
              <TableHead className="whitespace-nowrap">Label Print Date</TableHead>
              <TableHead className="whitespace-nowrap">Issue Date</TableHead>
              <TableHead className="whitespace-nowrap">Issued By</TableHead>
              <TableHead className="whitespace-nowrap text-right">Issue Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issuedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                  No material has been issued yet.
                </TableCell>
              </TableRow>
            ) : (
              issuedRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-success/30 bg-success/10 hover:bg-success/15"
                >
                  <TableCell className="num whitespace-nowrap font-medium">
                    {row.materialNumber}
                  </TableCell>
                  <TableCell className="min-w-56 max-w-sm" title={row.description}>
                    {row.description || "—"}
                  </TableCell>
                  <TableCell className="num">{row.grnNumber}</TableCell>
                  <TableCell className="num whitespace-nowrap text-xs">
                    {formatGrnDate(row.grnDate)}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-xs">
                    {formatDateTime(row.labelPrintedAt)}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-xs">
                    {formatDateTime(row.timestamp)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.operator}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right font-medium">
                    {row.quantity.toLocaleString("en-IN")} {row.uom || ""}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
