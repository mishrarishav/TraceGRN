import { AppLogo } from "@/components/layout/AppLogo";
import { cn } from "@/lib/utils";

export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <AppLogo
        compact={collapsed}
        priority
        className={collapsed ? "h-10 w-10" : "w-[158px] shadow-sm"}
      />
      <span className="sr-only">TrackGRN Material Traceability System</span>
    </div>
  );
}
