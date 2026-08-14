import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  FileStack,
  Forklift,
  History,
  QrCode,
  Receipt,
  Route as RouteIcon,
  Upload,
  Users,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getReports } from "@/services/api";

export const Route = createFileRoute("/_shell/reports")({
  head: () => ({
    meta: [
      { title: "Reports — TraceFlow" },
      { name: "description", content: "Generate GRN, inventory, label, issue and traceability reports for any date range." },
      { property: "og:title", content: "Reports — TraceFlow" },
      { property: "og:description", content: "Operational and traceability reporting." },
    ],
  }),
  component: ReportsPage,
});

const icons: Record<string, typeof Receipt> = {
  receipt: Receipt,
  warehouse: Warehouse,
  qr: QrCode,
  forklift: Forklift,
  users: Users,
  upload: Upload,
  history: History,
  route: RouteIcon,
};

function ReportsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["reports"], queryFn: getReports });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Export operational and traceability data for audits and management review."
        icon={<FileStack className="h-5 w-5" />}
      />

      <div className="panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">From date</Label>
          <Input type="date" defaultValue="2026-02-01" className="num" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">To date</Label>
          <Input type="date" defaultValue="2026-02-28" className="num" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Plant</Label>
          <Select defaultValue="1000">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">Plant 1000</SelectItem>
              <SelectItem value="1100">Plant 1100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Format</Label>
          <Select defaultValue="xlsx">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.map((r, i) => {
            const Icon = icons[r.icon] ?? FileStack;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="panel flex flex-col p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{r.name}</h3>
                <p className="mt-1 flex-1 text-xs text-muted-foreground">{r.description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => toast.success("Report queued", { description: `${r.name} will download shortly.` })}
                >
                  Generate
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
