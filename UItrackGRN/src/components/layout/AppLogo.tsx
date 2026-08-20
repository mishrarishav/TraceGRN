import { cn } from "@/lib/utils";

export function AppLogo({
  compact = false,
  className,
  priority = false,
}: {
  compact?: boolean;
  className?: string;
  priority?: boolean;
}) {
  if (compact) {
    return (
      <img
        src="/favicon.ico"
        alt="TrackGRN"
        width={40}
        height={40}
        loading={priority ? "eager" : "lazy"}
        className={cn("h-10 w-10 object-contain", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "relative block aspect-[3/1] overflow-hidden rounded-lg bg-white/95",
        className,
      )}
      role="img"
      aria-label="TrackGRN"
    >
      <img
        src="/branding/AppLogo.png"
        alt=""
        loading={priority ? "eager" : "lazy"}
        className="pointer-events-none absolute inset-x-0 top-0 w-full max-w-none -translate-y-[27%] select-none"
      />
    </span>
  );
}
