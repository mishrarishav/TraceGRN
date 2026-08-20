import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createVendor,
  deactivateVendor,
  getVendors,
  updateVendor,
  type VendorMutation,
} from "@/services/api";
import type { Vendor } from "@/types";

export const Route = createFileRoute("/_shell/vendors")({
  head: () => ({
    meta: [
      { title: "Vendor Master — TrackGRN" },
      { name: "description", content: "SAP vendor codes, canonical names and accepted aliases." },
    ],
  }),
  component: VendorsPage,
});

const emptyForm: VendorMutation = {
  vendorCode: "",
  vendorName: "",
  aliases: [],
  isActive: true,
};

function VendorsPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["vendors"], queryFn: getVendors });
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorMutation>(emptyForm);
  const [aliasesText, setAliasesText] = useState("");
  const [open, setOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vendors"] });

  const save = useMutation({
    mutationFn: async () => {
      const request = {
        ...form,
        aliases: aliasesText
          .split(/[,\n]/)
          .map((alias) => alias.trim())
          .filter(Boolean),
      };
      if (selected) await updateVendor(selected.id, request);
      else await createVendor(request);
    },
    onSuccess: () => {
      void refresh();
      setOpen(false);
      toast.success(selected ? "Vendor updated" : "Vendor created");
    },
    onError: (error) => toast.error("Unable to save vendor", { description: error.message }),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateVendor(id),
    onSuccess: () => {
      void refresh();
      setOpen(false);
      toast.success("Vendor deactivated");
    },
    onError: (error) => toast.error("Unable to deactivate vendor", { description: error.message }),
  });

  const edit = (vendor: Vendor) => {
    setSelected(vendor);
    setForm({
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      aliases: vendor.aliases,
      isActive: vendor.status === "Active",
    });
    setAliasesText(vendor.aliases.join(", "));
    setOpen(true);
  };

  const columns: Column<Vendor>[] = [
    {
      key: "code",
      header: "SAP Vendor Code",
      render: (vendor) => (
        <span className="num font-semibold text-primary">{vendor.vendorCode}</span>
      ),
    },
    { key: "name", header: "Vendor Name", render: (vendor) => vendor.vendorName },
    {
      key: "aliases",
      header: "Accepted Aliases",
      render: (vendor) => (
        <span className="text-xs text-muted-foreground">{vendor.aliases.join(", ") || "—"}</span>
      ),
      className: "max-w-[320px]",
    },
    {
      key: "grns",
      header: "GRNs",
      render: (vendor) => <span className="num">{vendor.grnCount}</span>,
    },
    { key: "status", header: "Status", render: (vendor) => <StatusBadge status={vendor.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Master"
        description="SAP vendor codes with canonical names and duplicate-name aliases."
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <Button
            className="gap-2"
            onClick={() => {
              setSelected(null);
              setForm(emptyForm);
              setAliasesText("");
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Vendors"
          value={data.filter((vendor) => vendor.status === "Active").length}
          tone="primary"
        />
        <StatCard
          label="Accepted Aliases"
          value={data.reduce((sum, vendor) => sum + vendor.aliases.length, 0)}
        />
        <StatCard
          label="Linked GRNs"
          value={data.reduce((sum, vendor) => sum + vendor.grnCount, 0)}
          tone="success"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={data}
          columns={columns}
          searchKeys={(vendor) =>
            `${vendor.vendorCode} ${vendor.vendorName} ${vendor.aliases.join(" ")}`
          }
          onRowClick={edit}
          emptyMessage="No vendors found."
        />
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected ? selected.vendorCode : "Add vendor"}</SheetTitle>
            <SheetDescription>
              Use aliases when SAP exports the same vendor name differently.
            </SheetDescription>
          </SheetHeader>
          <form
            className="space-y-4 px-4 pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Field label="SAP vendor code">
              <Input
                aria-label="SAP vendor code"
                required
                value={form.vendorCode}
                onChange={(event) => setForm({ ...form, vendorCode: event.target.value })}
              />
            </Field>
            <Field label="Canonical vendor name">
              <Input
                aria-label="Canonical vendor name"
                required
                value={form.vendorName}
                onChange={(event) => setForm({ ...form, vendorName: event.target.value })}
              />
            </Field>
            <Field label="Aliases (comma or new line separated)">
              <textarea
                aria-label="Vendor aliases"
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={aliasesText}
                onChange={(event) => setAliasesText(event.target.value)}
              />
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.isActive}
                onCheckedChange={(isActive) => setForm({ ...form, isActive })}
              />
              Active vendor
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save Vendor"}
              </Button>
              {selected?.status === "Active" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deactivate.mutate(selected.id)}
                >
                  Deactivate
                </Button>
              ) : null}
            </div>
          </form>
        </SheetContent>
      </Sheet>
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
