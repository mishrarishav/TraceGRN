import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { formatLabelDate, labelQrPayload } from "@/lib/label-content";
import type { MaterialLabel } from "@/types";

export function QRCodeArt({ value, className }: { value: string; className?: string }) {
  return (
    <div
      className={cn("aspect-square w-full bg-white p-1", className)}
      aria-label={`QR code for ${value}`}
      role="img"
    >
      <QRCodeSVG
        value={value}
        level="M"
        bgColor="#ffffff"
        fgColor="#0f172a"
        marginSize={0}
        className="h-full w-full"
      />
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
    brandLogoDataUrl?: string;
    brandName?: string;
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
  const qrPayload = labelQrPayload(label);
  return (
    <div
      className={cn(
        "aspect-[4/3] w-full max-w-xs rounded-lg border-2 border-dashed border-border bg-white p-2.5 text-slate-900 shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
        <span className="text-sm font-bold tracking-tight">{c.companyName}</span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {c.brandLogoDataUrl ? (
            <img
              src={c.brandLogoDataUrl}
              alt={c.brandName ? `${c.brandName} logo` : "Client logo"}
              className="max-h-6 max-w-24 object-contain"
            />
          ) : null}
          <span className="font-mono text-[9px] text-slate-500">MATERIAL LABEL</span>
        </div>
      </div>
      <div className="mt-2 flex gap-2.5">
        <div className="w-[5.25rem] shrink-0">
          <QRCodeArt value={qrPayload} />
          <span className="sr-only">QR payload: {qrPayload}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 text-[10px] leading-tight">
          <Row k="GRN" v={label.grnNumber} />
          <Row k="Material" v={label.materialNumber} strong />
          {c.showDescription ? (
            <p className="truncate text-[9px] text-slate-600">{label.description}</p>
          ) : null}
          <Row k="Qty" v={`${label.quantity.toLocaleString("en-IN")} ${label.uom}`} strong />
          {c.showBatch ? <Row k="Batch" v={label.batch} /> : null}
          {c.showGrnDate ? <Row k="GRN Date" v={formatLabelDate(label.grnDate)} /> : null}
          {c.showBin ? <Row k="Bin" v={label.binSequence} /> : null}
        </div>
      </div>
      <div className="mt-1.5 border-t border-slate-300 pt-1 text-center font-mono text-[9px] text-slate-500">
        Material Traceability System · Sanand Plant
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
