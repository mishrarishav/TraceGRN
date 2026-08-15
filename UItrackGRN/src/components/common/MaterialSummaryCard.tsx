import { motion } from "framer-motion";
import { Boxes } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { MaterialLabel } from "@/types";

export function MaterialSummaryCard({ label }: { label: MaterialLabel }) {
  const rows: [string, string][] = [
    ["Label UID", label.labelUid],
    ["GRN Number", label.grnNumber],
    ["Material", label.materialNumber],
    ["Batch", label.batch],
    ["Quantity", `${label.quantity.toLocaleString("en-IN")} ${label.uom}`],
    ["Bin Sequence", label.binSequence],
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28 }}
      className="panel p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Boxes className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-semibold">{label.materialNumber}</p>
            <p className="text-sm text-muted-foreground">{label.description}</p>
          </div>
        </div>
        <StatusBadge status={label.status} size="lg" />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {k}
            </dt>
            <dd className="num mt-0.5 text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </motion.div>
  );
}
