import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { TraceStep } from "@/types";

export function Timeline({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="relative pl-8">
      <motion.span
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="brand-gradient absolute top-2 bottom-2 left-3 w-0.5 origin-top rounded-full"
      />
      <div className="space-y-5">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.09, duration: 0.3 }}
            className="relative"
          >
            <span className="absolute top-3 -left-[1.4rem] flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <div className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{s.title}</h4>
                <StatusBadge status={s.status} />
              </div>
              <div className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                <span>{s.date}</span>
                <span>{s.time}</span>
                <span className="truncate">{s.user}</span>
                <span className="truncate">{s.station}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
