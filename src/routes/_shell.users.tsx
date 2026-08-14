import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { getUsers } from "@/services/api";
import type { User } from "@/types";

export const Route = createFileRoute("/_shell/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — TraceFlow" },
      { name: "description", content: "Manage plant operators, store managers and administrators with role-based access." },
      { property: "og:title", content: "Users & Roles — TraceFlow" },
      { property: "og:description", content: "Role-based access for plant users." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: getUsers });

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "User",
      render: (u) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {u.name.split(" ").map((n) => n[0]).join("")}
          </span>
          <div>
            <p className="font-medium">{u.name}</p>
            <p className="num text-xs text-muted-foreground">{u.employeeCode}</p>
          </div>
        </div>
      ),
    },
    { key: "username", header: "Username", render: (u) => <span className="num">{u.username}</span> },
    { key: "role", header: "Role", render: (u) => <StatusBadge status={u.role === "Admin" ? "Active" : "Unchanged"} className="capitalize" /> },
    { key: "roleName", header: "Assigned Role", render: (u) => u.role },
    { key: "login", header: "Last Login", render: (u) => <span className="num text-xs text-muted-foreground">{u.lastLogin}</span> },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        description="Access control for store operators, managers and administrators."
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button className="gap-2" onClick={() => toast.info("User creation is disabled in the demo build.")}>
            <UserPlus className="h-4 w-4" /> Add User
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Users" value={data.length} tone="primary" />
        <StatCard label="Active" value={data.filter((u) => u.status === "Active").length} tone="success" />
        <StatCard label="Operators" value={data.filter((u) => u.role === "Store Operator").length} />
        <StatCard label="Admins" value={data.filter((u) => u.role === "Admin").length} tone="warning" />
      </div>
      {isLoading ? <LoadingSkeleton /> : <DataTable rows={data} columns={columns} searchKeys={(u) => `${u.name} ${u.username} ${u.employeeCode} ${u.role}`} />}
    </div>
  );
}
