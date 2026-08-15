import type { ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterDef {
  key: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

export function FilterBar({
  filters,
  extra,
  onReset,
}: {
  filters: FilterDef[];
  extra?: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-2 p-3">
      <span className="mr-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Filter className="h-3.5 w-3.5" /> Filters
      </span>
      {filters.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {f.label}</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {extra}
      {onReset ? (
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onReset}>
          <X className="h-3.5 w-3.5" /> Reset
        </Button>
      ) : null}
    </div>
  );
}
