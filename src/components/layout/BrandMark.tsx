import { ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-[var(--shadow-panel)]">
        <ScanBarcode className="h-5 w-5" />
      </span>
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">TraceFlow</p>
          <p className="truncate text-[11px] text-muted-foreground">Material Traceability System</p>
        </div>
      ) : null}
    </div>
  );
}
