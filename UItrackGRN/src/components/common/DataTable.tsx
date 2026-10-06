import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Filter,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";
import { getTableRows, type DataTableState, type TableColumnValue } from "@/lib/table-data";

export interface Column<T> extends TableColumnValue<T> {
  header: string;
  render: (row: T, rowIndex: number) => ReactNode;
  className?: string;
  hideByDefault?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  searchable = true,
  searchKeys,
  pageSize = 8,
  onRowClick,
  toolbar,
  emptyMessage = "No records match the current filters.",
  dense = false,
  state,
  onStateChange,
}: {
  rows: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchKeys?: (row: T) => string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
  emptyMessage?: string;
  dense?: boolean;
  state?: DataTableState;
  onStateChange?: (state: DataTableState) => void;
}) {
  const [internalState, setInternalState] = useState<DataTableState>({
    query: "",
    filters: {},
    sort: null,
  });
  const view = state ?? internalState;
  const { query, sort, filters } = view;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<string[]>(
    columns.filter((c) => c.hideByDefault).map((c) => c.key),
  );

  const visible = columns.filter((c) => !hidden.includes(c.key));
  const filterCount = Object.values(filters).filter((value) => value.trim()).length;
  const updateView = (next: DataTableState) => {
    setInternalState(next);
    onStateChange?.(next);
    setPage(0);
  };
  const filtered = useMemo(
    () => getTableRows(rows, columns, view, searchKeys),
    [rows, columns, view, searchKeys],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div
      data-testid="data-table"
      className="panel flex min-h-0 max-h-[calc(100dvh-10rem)] flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background/95 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {searchable && searchKeys ? (
            <div className="relative w-full max-w-sm">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  updateView({ ...view, query: e.target.value });
                }}
                placeholder="Search records…"
                className="h-9 pl-9"
              />
            </div>
          ) : null}
          {toolbar}
          {columns.some((column) => column.filterValue) ? (
            <Button
              variant={filtersOpen ? "secondary" : "outline"}
              size="sm"
              aria-pressed={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter className="mr-1.5 h-4 w-4" /> Filters{filterCount ? ` (${filterCount})` : ""}
            </Button>
          ) : null}
          {filterCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => updateView({ ...view, filters: {} })}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            {columns.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={!hidden.includes(c.key)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(v) =>
                  setHidden((h) => (v ? h.filter((k) => k !== c.key) : [...h, c.key]))
                }
              >
                {c.header || "Actions"}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem>Done</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        data-testid="data-table-scroll"
        className="min-h-0 max-h-[min(46dvh,24rem)] flex-auto overflow-auto overscroll-contain"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface shadow-sm">
            <tr className="border-b border-border bg-surface/60 text-left">
              {visible.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    c.sortValue
                      ? sort?.key === c.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className={cn(
                    "bg-surface px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                    c.className,
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      onClick={() =>
                        updateView({
                          ...view,
                          sort:
                            sort?.key === c.key
                              ? { key: c.key, dir: sort.dir === "asc" ? "desc" : "asc" }
                              : { key: c.key, dir: "asc" },
                        })
                      }
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
            {filtersOpen ? (
              <tr className="border-b border-border bg-surface">
                {visible.map((column) => (
                  <td key={column.key} className="px-3 pb-2">
                    {column.filterValue ? (
                      <Input
                        aria-label={`Filter ${column.header}`}
                        placeholder="Filter…"
                        className="h-8 min-w-24 text-xs"
                        value={filters[column.key] ?? ""}
                        onChange={(event) =>
                          updateView({
                            ...view,
                            filters: { ...filters, [column.key]: event.target.value },
                          })
                        }
                      />
                    ) : null}
                  </td>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, visible.length)}>
                  <EmptyState title="Nothing to show" description={emptyMessage} />
                </td>
              </tr>
            ) : null}
            {slice.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-border/70 transition-colors last:border-0 hover:bg-accent/40",
                  onRowClick && "cursor-pointer",
                )}
              >
                {visible.map((c) => (
                  <td key={c.key} className={cn(dense ? "px-4 py-2" : "px-4 py-3", c.className)}>
                    {c.render(row, current * pageSize + i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        data-testid="data-table-footer"
        className="flex shrink-0 flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 text-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-muted-foreground">
          Showing <span className="num text-foreground">{slice.length}</span> of{" "}
          <span className="num text-foreground">{filtered.length}</span> records
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </Button>
          <span className="num text-xs text-muted-foreground">
            Page {current + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
