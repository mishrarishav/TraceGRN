import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createUser,
  deactivateUser,
  getUsers,
  updateUser,
  type UserMutation,
} from "@/services/api";
import type { Role, User } from "@/types";

export const Route = createFileRoute("/_shell/users")({
  head: () => ({ meta: [{ title: "Users & Roles — TraceFlow" }] }),
  component: UsersPage,
});

const emptyForm: UserMutation = {
  name: "",
  employeeCode: "",
  username: "",
  role: "Store Operator",
  password: "",
  isActive: true,
};

function UsersPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserMutation>(emptyForm);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const save = useMutation({
    mutationFn: async () => {
      if (editing) await updateUser(editing.id, form);
      else await createUser(form);
    },
    onSuccess: () => {
      void refresh();
      setOpen(false);
      toast.success(editing ? "User updated" : "User created");
    },
    onError: (error) => toast.error("Unable to save user", { description: error.message }),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      void refresh();
      setOpen(false);
      toast.success("User deactivated");
    },
    onError: (error) => toast.error("Unable to deactivate user", { description: error.message }),
  });

  const edit = (user: User) => {
    setEditing(user);
    setForm({
      name: user.name,
      employeeCode: user.employeeCode,
      username: user.username,
      role: user.role,
      password: "",
      isActive: user.status === "Active",
    });
    setOpen(true);
  };

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "User",
      render: (user) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {user.name
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="num text-xs text-muted-foreground">{user.employeeCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: "username",
      header: "Username",
      render: (user) => <span className="num">{user.username}</span>,
    },
    { key: "role", header: "Assigned Role", render: (user) => user.role },
    {
      key: "login",
      header: "Last Login",
      render: (user) => <span className="num text-xs text-muted-foreground">{user.lastLogin}</span>,
    },
    { key: "status", header: "Status", render: (user) => <StatusBadge status={user.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        description="SQL-backed access control for store operators, managers and administrators."
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" /> Add User
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Users" value={data.length} tone="primary" />
        <StatCard
          label="Active"
          value={data.filter((user) => user.status === "Active").length}
          tone="success"
        />
        <StatCard
          label="Operators"
          value={data.filter((user) => user.role === "Store Operator").length}
        />
        <StatCard
          label="Admins"
          value={data.filter((user) => user.role === "Admin").length}
          tone="warning"
        />
      </div>
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={data}
          columns={columns}
          searchKeys={(user) => `${user.name} ${user.username} ${user.employeeCode} ${user.role}`}
          onRowClick={edit}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              Credentials and role are enforced by the API immediately.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editing && (form.password?.length ?? 0) < 12) {
                toast.error("Password must contain at least 12 characters");
                return;
              }
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input
                  aria-label="Full name"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Employee code">
                <Input
                  aria-label="Employee code"
                  required
                  value={form.employeeCode}
                  onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
                />
              </Field>
              <Field label="Username">
                <Input
                  aria-label="Username"
                  required
                  minLength={3}
                  autoComplete="username"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </Field>
              <Field label={editing ? "New password (optional)" : "Password"}>
                <Input
                  aria-label={editing ? "New password (optional)" : "Password"}
                  required={!editing}
                  minLength={12}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </Field>
              <Field label="Role">
                <Select
                  value={form.role}
                  onValueChange={(value) => setForm({ ...form, role: value as Role })}
                >
                  <SelectTrigger aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Admin", "Store Manager", "Store Operator", "Viewer"].map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end gap-3 pb-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                />
                <span className="text-sm">Active account</span>
              </div>
            </div>
            <DialogFooter className="gap-2">
              {editing?.status === "Active" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deactivate.mutate(editing.id)}
                >
                  Deactivate
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
