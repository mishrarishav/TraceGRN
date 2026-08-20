import { cn } from "@/lib/utils";
import type { MaterialLabel } from "@/types";

/** Deterministic pseudo QR matrix so the preview looks like a real code. */
function matrix(seed: string, size = 21) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < size * size; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push(((h >> 8) & 1) === 1);
  }
  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  return cells.map((v, i) => {
    const r = Math.floor(i / size);
    const c = i % size;
    if (finder(r, c)) {
      const rr = r < 7 ? r : r - (size - 7);
      const cc = c < 7 ? c : c - (size - 7);
      const edge = rr === 0 || rr === 6 || cc === 0 || cc === 6;
      const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
      return edge || core;
    }
    return v;
  });
}

export function QRCodeArt({ value, className }: { value: string; className?: string }) {
  const size = 21;
  const cells = matrix(value, size);
  return (
    <div
      className={cn("grid aspect-square w-full bg-white p-1", className)}
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      aria-label={`QR code for ${value}`}
      role="img"
    >
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-slate-900" : "bg-white"} />
      ))}
    </div>
  );
}

export function QRPreview({
  label,
  config,
  className,
}: {
  label: MaterialLabel;
  config?: {
    companyName?: string;
    showBatch?: boolean;
    showGrnDate?: boolean;
    showDescription?: boolean;
    showBin?: boolean;
  };
  className?: string;
}) {
  const c = {
    companyName: "TrackGRN",
    showBatch: true,
    showGrnDate: true,
    showDescription: true,
    showBin: true,
    ...config,
  };
  return (
    <div
      className={cn(
        "w-full max-w-xs rounded-lg border-2 border-dashed border-border bg-white p-3 text-slate-900 shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-300 pb-2">
        <span className="text-sm font-bold tracking-tight">{c.companyName}</span>
        <span className="font-mono text-[10px] text-slate-500">MATERIAL LABEL</span>
      </div>
      <div className="mt-3 flex gap-3">
        <div className="w-24 shrink-0">
          <QRCodeArt value={label.labelUid} />
          <p className="mt-1 text-center font-mono text-[9px]">{label.labelUid}</p>
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-[11px] leading-tight">
          <Row k="GRN" v={label.grnNumber} />
          <Row k="Material" v={label.materialNumber} strong />
          {c.showDescription ? (
            <p className="truncate text-[10px] text-slate-600">{label.description}</p>
          ) : null}
          <Row k="Qty" v={`${label.quantity.toLocaleString("en-IN")} ${label.uom}`} strong />
          {c.showBatch ? <Row k="Batch" v={label.batch} /> : null}
          {c.showGrnDate ? <Row k="GRN Date" v={label.grnDate} /> : null}
          {c.showBin ? <Row k="Bin" v={label.binSequence} /> : null}
        </div>
      </div>
      <div className="mt-2 border-t border-slate-300 pt-1 text-center font-mono text-[9px] text-slate-500">
        Material Traceability System · Plant 1000
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{k}</span>
      <span className={cn("truncate font-mono", strong && "font-bold")}>{v}</span>
    </div>
  );
}
