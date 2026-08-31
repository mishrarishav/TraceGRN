import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FileStack, Loader2, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  getImportReport,
  getIssueReport,
  getIssueReportOptions,
  type ImportReportRow,
} from "@/services/api";
import type { MaterialTransaction } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/reports")({
  head: () => ({
    meta: [
      { title: "Reports — TrackGRN" },
      {
        name: "description",
        content: "Issue transactions and Smart GRN import history in tabular reports.",
      },
      { property: "og:title", content: "Reports — TrackGRN" },
      {
        property: "og:description",
        content: "Filterable issue reporting and Smart GRN import history.",
      },
    ],
  }),
  component: ReportsPage,
});

const ISSUE_PAGE_SIZE = 25;
const IMPORT_PAGE_SIZE = 15;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateOnly(value?: string | null) {
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

function reportDateBounds(from: string, to: string) {
  const bounds: { from?: string; toExclusive?: string } = {};
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime())) bounds.from = start.toISOString();
  }
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(end.getTime())) {
      end.setDate(end.getDate() + 1);
      bounds.toExclusive = end.toISOString();
    }
  }
  return bounds;
}

function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [issuedById, setIssuedById] = useState("");
  const [issuePage, setIssuePage] = useState(1);
  const [importPage, setImportPage] = useState(1);
  const invalidDateRange = Boolean(from && to && from > to);
  const dateBounds = useMemo(() => reportDateBounds(from, to), [from, to]);

  const optionsQuery = useQuery({
    queryKey: ["issue-report-options"],
    queryFn: getIssueReportOptions,
  });
  const issueQuery = useQuery({
    queryKey: ["issue-report", from, to, materialId, issuedById, issuePage],
    queryFn: () =>
      getIssueReport({
        ...dateBounds,
        ...(materialId ? { materialId } : {}),
        ...(issuedById ? { issuedById } : {}),
        page: issuePage,
        pageSize: ISSUE_PAGE_SIZE,
      }),
    enabled: !invalidDateRange,
  });
  const importQuery = useQuery({
    queryKey: ["import-report", from, to, importPage],
    queryFn: () =>
      getImportReport({
        ...dateBounds,
        page: importPage,
        pageSize: IMPORT_PAGE_SIZE,
      }),
    enabled: !invalidDateRange,
  });

  const resetFilters = () => {
    setFrom("");
    setTo("");
    setMaterialId("");
    setIssuedById("");
    setIssuePage(1);
    setImportPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description="Issue report and Smart GRN import history in one tabular view."
        icon={<FileStack className="h-5 w-5" />}
      />

      <section className="panel p-4" aria-labelledby="report-filters-heading">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="report-filters-heading" className="text-sm font-semibold">
              Report Filters
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Date range applies to both tables. Material and Issued By apply to Issue Report.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetFilters}
            disabled={!from && !to && !materialId && !issuedById}
          >
            <RotateCcw className="h-4 w-4" /> Clear Filters
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-from-date" className="text-xs text-muted-foreground">
              From Date
            </Label>
            <Input
              id="report-from-date"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setIssuePage(1);
                setImportPage(1);
              }}
              className="num"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-to-date" className="text-xs text-muted-foreground">
              To Date
            </Label>
            <Input
              id="report-to-date"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setIssuePage(1);
                setImportPage(1);
              }}
              className="num"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Material</Label>
            <MaterialFilter
              value={materialId}
              onValueChange={(value) => {
                setMaterialId(value);
                setIssuePage(1);
              }}
              options={optionsQuery.data?.materials ?? []}
              loading={optionsQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Issued By</Label>
            <Select
              value={issuedById || "all"}
              onValueChange={(value) => {
                setIssuedById(value === "all" ? "" : value);
                setIssuePage(1);
              }}
            >
              <SelectTrigger aria-label="Issued By filter">
                <SelectValue placeholder="All issuers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All issuers</SelectItem>
                {(optionsQuery.data?.issuers ?? []).map((issuer) => (
                  <SelectItem key={issuer.id} value={issuer.id}>
                    {issuer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {invalidDateRange ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            To Date must be the same as or later than From Date.
          </p>
        ) : null}
      </section>

      <IssueReportSection
        rows={issueQuery.data?.items ?? []}
        total={issueQuery.data?.total ?? 0}
        page={issuePage}
        loading={issueQuery.isLoading || issueQuery.isFetching}
        error={issueQuery.error}
        onPageChange={setIssuePage}
      />

      <ImportHistorySection
        rows={importQuery.data?.items ?? []}
        total={importQuery.data?.total ?? 0}
        page={importPage}
        loading={importQuery.isLoading || importQuery.isFetching}
        error={importQuery.error}
        onPageChange={setImportPage}
      />
    </div>
  );
}

function MaterialFilter({
  value,
  onValueChange,
  options,
  loading,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { id: string; materialNumber: string; description: string }[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Material filter"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? `${selected.materialNumber} · ${selected.description}` : "All materials"}
          </span>
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search material code or description…" />
          <CommandList>
            <CommandEmpty>No material found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all materials"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                All materials
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.materialNumber} ${option.description}`}
                  onSelect={() => {
                    onValueChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("h-4 w-4", value === option.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0">
                    <span className="num block font-medium">{option.materialNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function IssueReportSection({
  rows,
  total,
  page,
  loading,
  error,
  onPageChange,
}: {
  rows: MaterialTransaction[];
  total: number;
  page: number;
  loading: boolean;
  error: Error | null;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="issue-report-heading">
      <ReportSectionHeader
        id="issue-report-heading"
        title="Issue Report"
        description="Material issued to production, newest transaction first."
        total={total}
        loading={loading}
      />
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
          {error ? (
            <MessageRow colSpan={8} message={error.message} destructive />
          ) : rows.length === 0 ? (
            <MessageRow
              colSpan={8}
              message={
                loading ? "Loading issue report…" : "No issue transactions match the filters."
              }
            />
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="num whitespace-nowrap font-medium">
                  {row.materialNumber}
                </TableCell>
                <TableCell className="min-w-56 max-w-sm" title={row.description}>
                  {row.description || "—"}
                </TableCell>
                <TableCell className="num whitespace-nowrap">{row.grnNumber}</TableCell>
                <TableCell className="num whitespace-nowrap text-xs">
                  {formatDateOnly(row.grnDate)}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-xs">
                  {formatDateTime(row.labelPrintedAt)}
                </TableCell>
                <TableCell className="num whitespace-nowrap text-xs">
                  {formatDateTime(row.timestamp)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.operator}</TableCell>
                <TableCell className="num whitespace-nowrap text-right font-medium">
                  {row.quantity.toLocaleString("en-IN")} {row.uom}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ReportPagination
        page={page}
        pageSize={ISSUE_PAGE_SIZE}
        total={total}
        disabled={loading}
        onPageChange={onPageChange}
      />
    </section>
  );
}

function ImportHistorySection({
  rows,
  total,
  page,
  loading,
  error,
  onPageChange,
}: {
  rows: ImportReportRow[];
  total: number;
  page: number;
  loading: boolean;
  error: Error | null;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="smart-import-history-heading">
      <ReportSectionHeader
        id="smart-import-history-heading"
        title="Smart GRN Import History"
        description="Every SAP GRN file imported, with uploader, time and row-level outcome counts."
        total={total}
        loading={loading}
      />
      <Table className="min-w-[78rem]">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Imported At</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="whitespace-nowrap">Imported By</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">New</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead className="text-right">Unchanged</TableHead>
            <TableHead className="text-right">Warnings</TableHead>
            <TableHead className="text-right">Rejected</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <MessageRow colSpan={11} message={error.message} destructive />
          ) : rows.length === 0 ? (
            <MessageRow
              colSpan={11}
              message={
                loading ? "Loading import history…" : "No Smart GRN imports match the date range."
              }
            />
          ) : (
            rows.map((row) => (
              <TableRow key={row.batchId}>
                <TableCell className="num whitespace-nowrap text-xs">
                  {formatDateTime(row.uploadedAt)}
                </TableCell>
                <TableCell className="min-w-56 max-w-sm truncate font-medium" title={row.fileName}>
                  {row.fileName}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.uploadedBy}</TableCell>
                <TableCell className="num max-w-48 truncate text-xs" title={row.batchId}>
                  {row.batchId}
                </TableCell>
                <TableCell className="num text-right">
                  {row.totalRows.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="num text-right text-primary">{row.newRows}</TableCell>
                <TableCell className="num text-right text-info">{row.updated}</TableCell>
                <TableCell className="num text-right">{row.unchanged}</TableCell>
                <TableCell className="num text-right text-warning">{row.warnings}</TableCell>
                <TableCell className="num text-right text-destructive">{row.rejected}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ReportPagination
        page={page}
        pageSize={IMPORT_PAGE_SIZE}
        total={total}
        disabled={loading}
        onPageChange={onPageChange}
      />
    </section>
  );
}

function ReportSectionHeader({
  id,
  title,
  description,
  total,
  loading,
}: {
  id: string;
  title: string;
  description: string;
  total: number;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div>
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        <span className="num font-medium text-foreground">
          {total.toLocaleString("en-IN")}
        </span>{" "}
        records
      </span>
    </div>
  );
}

function MessageRow({
  colSpan,
  message,
  destructive = false,
}: {
  colSpan: number;
  message: string;
  destructive?: boolean;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={cn("h-20 text-center text-muted-foreground", destructive && "text-destructive")}
      >
        {message}
      </TableCell>
    </TableRow>
  );
}

function ReportPagination({
  page,
  pageSize,
  total,
  disabled,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        Showing <span className="num text-foreground">{start}</span>–
        <span className="num text-foreground">{end}</span> of{" "}
        <span className="num text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="num min-w-20 text-center text-muted-foreground">
          Page {page} / {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
