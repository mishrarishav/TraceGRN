import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDot,
  Clock,
  Forklift,
  Minus,
  PackageCheck,
  Printer,
  QrCode,
  ShieldQuestion,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordStatus } from "@/types";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary" | "violet";

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/12 text-info border-info/30",
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/16 text-warning border-warning/35",
  danger: "bg-destructive/12 text-destructive border-destructive/30",
  primary: "bg-primary/12 text-primary border-primary/30",
  violet: "bg-chart-5/12 text-chart-5 border-chart-5/30",
};

const map: Record<string, { tone: Tone; icon: typeof CircleDot }> = {
  New: { tone: "primary", icon: Sparkles },
  Updated: { tone: "info", icon: CircleDot },
  Unchanged: { tone: "neutral", icon: Minus },
  Warning: { tone: "warning", icon: AlertTriangle },
  Rejected: { tone: "danger", icon: XCircle },
  Generated: { tone: "primary", icon: QrCode },
  Printed: { tone: "info", icon: Printer },
  Inwarded: { tone: "success", icon: PackageCheck },
  Issued: { tone: "violet", icon: Forklift },
  Blocked: { tone: "danger", icon: Ban },
  Cancelled: { tone: "neutral", icon: XCircle },
  Available: { tone: "success", icon: CheckCircle2 },
  "Admin Review": { tone: "warning", icon: ShieldQuestion },
  Active: { tone: "success", icon: CheckCircle2 },
  Inactive: { tone: "neutral", icon: Minus },
  Partial: { tone: "info", icon: CircleDot },
  Completed: { tone: "success", icon: CheckCircle2 },
  Pending: { tone: "warning", icon: Clock },
  Success: { tone: "success", icon: CheckCircle2 },
  Failed: { tone: "danger", icon: XCircle },
};

export function StatusBadge({
  status,
  className,
  size = "sm",
}: {
  status: RecordStatus | string;
  className?: string;
  size?: "sm" | "lg";
}) {
  const conf = map[status] ?? { tone: "neutral" as Tone, icon: CircleDot };
  const Icon = conf.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3.5 py-1.5 text-sm",
        toneClass[conf.tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {status}
    </span>
  );
}
