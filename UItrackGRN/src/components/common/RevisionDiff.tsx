import { ArrowRight } from "lucide-react";

export function RevisionDiff({
  field,
  oldValue,
  newValue,
}: {
  field: string;
  oldValue: string;
  newValue: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="rounded-lg border border-destructive/25 bg-destructive/8 p-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Previous {field}
        </p>
        <p className="num mt-1 text-lg font-semibold text-destructive line-through decoration-destructive/50">
          {oldValue}
        </p>
      </div>
      <ArrowRight className="mx-auto hidden h-5 w-5 text-muted-foreground sm:block" />
      <div className="rounded-lg border border-success/25 bg-success/8 p-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          New {field}
        </p>
        <p className="num mt-1 text-lg font-semibold text-success">{newValue}</p>
      </div>
    </div>
  );
}
