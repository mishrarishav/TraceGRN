import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Activity,
  Boxes,
  Clock,
  Forklift,
  Layers,
  Package,
  QrCode,
  Receipt,
  Warehouse,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { KPICard } from "@/components/common/KPICard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { getDashboardData } from "@/services/api";

export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — TraceFlow" },
      {
        name: "description",
        content: "Live GRN, labelling, inward and issue metrics for plant material traceability.",
      },
      { property: "og:title", content: "Operations Dashboard — TraceFlow" },
      { property: "og:description", content: "Live GRN, labelling, inward and issue metrics." },
    ],
  }),
  component: DashboardPage,
});

const icons: Record<string, typeof Receipt> = {
  receipt: Receipt,
  layers: Layers,
  package: Package,
  warehouse: Warehouse,
  forklift: Forklift,
  qr: QrCode,
  clock: Clock,
  alert: AlertTriangle,
};

const chartTooltip = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.6rem",
    color: "var(--color-popover-foreground)",
    fontSize: "12px",
  },
} as const;

function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardData });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description="Plant 1000 · Shift A · Material flow from SAP GRN import to production issue"
        icon={<Activity className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/import">Import SAP GRN</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/issue">Open Issue Scanner</Link>
            </Button>
          </>
        }
      />

      {isLoading || !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.kpis.map((k, i) => {
              const Icon = icons[k.icon] ?? Boxes;
              return (
                <KPICard
                  key={k.key}
                  label={k.label}
                  value={k.value}
                  trend={k.trend}
                  tooltip={k.tooltip}
                  index={i}
                  icon={<Icon className="h-4.5 w-4.5" />}
                />
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold">Received vs Issued — last 7 days</h2>
              <p className="mb-4 text-xs text-muted-foreground">Quantity in units</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.receivedVsIssued}>
                    <defs>
                      <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gIss" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-5)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RTooltip {...chartTooltip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="received"
                      name="Received"
                      stroke="var(--color-chart-1)"
                      fill="url(#gRec)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="issued"
                      name="Issued"
                      stroke="var(--color-chart-5)"
                      fill="url(#gIss)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="text-sm font-semibold">Label Status</h2>
              <p className="mb-4 text-xs text-muted-foreground">Current label lifecycle split</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.labelStatus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      stroke="var(--color-card)"
                      isAnimationActive={false}
                    >
                      {data.labelStatus.map((item, i) => (
                        <Cell
                          key={item.name}
                          fill={`var(--color-chart-${(i % 5) + 1})`}
                          aria-label={`${item.name}: ${item.value} labels`}
                        />
                      ))}
                    </Pie>
                    <RTooltip {...chartTooltip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-5">
              <h2 className="text-sm font-semibold">Top Materials by Received Qty</h2>
              <div className="mt-4 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topMaterials} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="material"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={54}
                    />
                    <RTooltip {...chartTooltip} cursor={{ fill: "var(--color-accent)" }} />
                    <Bar
                      dataKey="qty"
                      name="Received"
                      fill="var(--color-chart-2)"
                      radius={[0, 6, 6, 0]}
                      barSize={14}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="text-sm font-semibold">Daily GRN Import Trend</h2>
              <div className="mt-4 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.importTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RTooltip {...chartTooltip} />
                    <Line
                      type="monotone"
                      dataKey="grns"
                      name="GRNs"
                      stroke="var(--color-chart-3)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="text-sm font-semibold">Recent Activity</h2>
              <ul className="mt-4 space-y-4">
                {data.activity.map((a) => (
                  <li key={a.id} className="relative border-l border-border pl-4">
                    <span className="absolute top-1.5 -left-[4.5px] h-2 w-2 rounded-full bg-primary" />
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug">{a.text}</p>
                      <StatusBadge status={a.type} />
                    </div>
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {a.user} · {a.time}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
