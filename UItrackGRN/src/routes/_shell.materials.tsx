import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { ExportButton } from "@/components/common/ExportButton";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatCard } from "@/components/common/StatCard";
import {
  MasterDataBulkUpload,
  type BulkRowParseResult,
  type BulkUploadColumn,
} from "@/components/common/MasterDataBulkUpload";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createMaterial,
  deactivateMaterial,
  getMaterials,
  updateMaterial,
  type MaterialMutation,
} from "@/services/api";
import type { Material } from "@/types";

const materialBulkColumns: BulkUploadColumn[] = [
  {
    key: "materialNumber",
    label: "Material Number",
    required: true,
    aliases: ["Material", "Material Code"],
  },
  { key: "description", label: "Description", required: true },
  { key: "uom", label: "UOM", required: true, aliases: ["Unit", "Unit of Measure"] },
  {
    key: "packingStandard",
    label: "Pack Quantity",
    required: true,
    aliases: ["Pack Qty", "Packing Standard"],
  },
  { key: "partNumber", label: "Part Number", aliases: ["Part No"] },
  { key: "defaultBinLocation", label: "Default Bin", aliases: ["Bin", "Bin Location"] },
  { key: "openingQuantity", label: "Opening Quantity", aliases: ["Opening Qty"] },
  { key: "isActive", label: "Active", aliases: ["Is Active", "Status"] },
];

const materialTemplateRows = [
  ["M1", "Sample material", "PCS", "200", "PART-001", "A-01", "1000", "TRUE"],
];

export const Route = createFileRoute("/_shell/materials")({
  head: () => ({
    meta: [
      { title: "Materials — TrackGRN" },
      {
        name: "description",
        content: "Material master with received, issued and available quantity across all GRNs.",
      },
      { property: "og:title", content: "Materials — TrackGRN" },
      { property: "og:description", content: "Material master and live stock position." },
    ],
  }),
  component: MaterialsPage,
});

function MaterialsPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["materials"], queryFn: getMaterials });
  const [uom, setUom] = useState("All");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<Material | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<MaterialMutation>({
    materialNumber: "",
    description: "",
    uom: "PCS",
    packingStandard: 1,
    partNumber: "",
    defaultBinLocation: "",
    openingQuantity: null,
    isActive: true,
  });
  const existingMaterialIds = useMemo(() => {
    const result = new Map<string, string>();
    data.forEach((material) => {
      if (material.id) result.set(material.materialNumber.trim().toUpperCase(), material.id);
    });
    return result;
  }, [data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["materials"] });
  const save = useMutation({
    mutationFn: async () => {
      if (selected?.id) await updateMaterial(selected.id, form);
      else await createMaterial(form);
    },
    onSuccess: () => {
      void refresh();
      setEditorOpen(false);
      toast.success(selected ? "Material updated" : "Material created");
    },
    onError: (error) => toast.error("Unable to save material", { description: error.message }),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateMaterial(id),
    onSuccess: () => {
      void refresh();
      setEditorOpen(false);
      toast.success("Material deactivated");
    },
    onError: (error) =>
      toast.error("Unable to deactivate material", { description: error.message }),
  });

  const edit = (material: Material) => {
    setSelected(material);
    setForm({
      materialNumber: material.materialNumber,
      description: material.description,
      uom: material.uom,
      packingStandard: material.packingStandard,
      partNumber: material.partNumber ?? "",
      defaultBinLocation: material.defaultBinLocation ?? "",
      openingQuantity: material.openingQuantity ?? null,
      isActive: material.status !== "Inactive",
    });
    setEditorOpen(true);
  };

  const filtered = data.filter(
    (m) => (uom === "All" || m.uom === uom) && (status === "All" || m.status === status),
  );

  const columns: Column<Material>[] = [
    {
      key: "mat",
      header: "Material",
      render: (m) => <span className="num font-semibold text-primary">{m.materialNumber}</span>,
    },
    {
      key: "desc",
      header: "Description",
      render: (m) => m.description,
      className: "max-w-[280px] truncate",
    },
    {
      key: "part",
      header: "Part No",
      render: (m) => <span className="num">{m.partNumber || "—"}</span>,
    },
    {
      key: "bin",
      header: "Default Bin",
      render: (m) => <span className="num">{m.defaultBinLocation || "—"}</span>,
    },
    { key: "uom", header: "UoM", render: (m) => <span className="num">{m.uom}</span> },
    {
      key: "pack",
      header: "Pack Qty",
      sortValue: (m) => m.packingStandard,
      render: (m) => <span className="num">{m.packingStandard}</span>,
    },
    {
      key: "recv",
      header: "Received",
      sortValue: (m) => m.totalReceived,
      render: (m) => <span className="num">{m.totalReceived.toLocaleString()}</span>,
    },
    {
      key: "iss",
      header: "Issued",
      sortValue: (m) => m.totalIssued,
      render: (m) => <span className="num text-warning">{m.totalIssued.toLocaleString()}</span>,
    },
    {
      key: "avail",
      header: "Available",
      sortValue: (m) => m.available,
      render: (m) => (
        <div className="w-28">
          <span className="num text-sm font-medium text-success">
            {m.available.toLocaleString()}
          </span>
          <Progress
            value={(m.available / Math.max(1, m.totalReceived)) * 100}
            className="mt-1 h-1.5"
          />
        </div>
      ),
    },
    { key: "grn", header: "Latest GRN", render: (m) => <span className="num">{m.latestGrn}</span> },
    { key: "status", header: "Status", render: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materials"
        description="Consolidated material position across every imported GRN."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <>
            <MasterDataBulkUpload
              entityName="Material"
              entityNamePlural="Materials"
              templateFileName="trackgrn-material-master-template.csv"
              columns={materialBulkColumns}
              templateRows={materialTemplateRows}
              existingIds={existingMaterialIds}
              parseRow={parseMaterialBulkRow}
              uploadRow={async (request, existingId) => {
                if (existingId) await updateMaterial(existingId, request);
                else await createMaterial(request);
              }}
              onComplete={refresh}
            />
            <ExportButton name="materials" />
            <Button
              className="gap-2"
              onClick={() => {
                setSelected(null);
                setForm({
                  materialNumber: "",
                  description: "",
                  uom: "PCS",
                  packingStandard: 1,
                  partNumber: "",
                  defaultBinLocation: "",
                  openingQuantity: null,
                  isActive: true,
                });
                setEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Material
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Materials" value={filtered.length} tone="primary" />
        <StatCard
          label="Total Received"
          value={filtered.reduce((a, m) => a + m.totalReceived, 0).toLocaleString()}
        />
        <StatCard
          label="Total Issued"
          value={filtered.reduce((a, m) => a + m.totalIssued, 0).toLocaleString()}
          tone="warning"
        />
        <StatCard
          label="Available"
          value={filtered.reduce((a, m) => a + m.available, 0).toLocaleString()}
          tone="success"
        />
      </div>

      <FilterBar
        filters={[
          {
            key: "uom",
            label: "UoM",
            options: ["All", "PC", "PCS", "KG", "M", "L", "SET"],
            value: uom,
            onChange: setUom,
          },
          {
            key: "status",
            label: "Status",
            options: ["All", "Available", "Blocked", "Partial"],
            value: status,
            onChange: setStatus,
          },
        ]}
        onReset={() => {
          setUom("All");
          setStatus("All");
        }}
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(m) => `${m.materialNumber} ${m.description} ${m.latestGrn}`}
          onRowClick={edit}
          emptyMessage="No materials match the current filters."
        />
      )}

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="num">
              {selected ? selected.materialNumber : "Add material"}
            </SheetTitle>
            <SheetDescription>
              Material master values are validated and stored in SQL Server.
            </SheetDescription>
          </SheetHeader>
          <form
            className="space-y-4 px-4 pb-6"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Material number">
              <Input
                aria-label="Material number"
                required
                value={form.materialNumber}
                onChange={(event) => setForm({ ...form, materialNumber: event.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                aria-label="Description"
                required
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="UOM">
                <Input
                  aria-label="UOM"
                  required
                  value={form.uom}
                  onChange={(event) => setForm({ ...form, uom: event.target.value })}
                />
              </Field>
              <Field label="Pack Qty">
                <Input
                  aria-label="Pack Qty"
                  required
                  min={0.0001}
                  step="any"
                  type="number"
                  value={form.packingStandard}
                  onChange={(event) =>
                    setForm({ ...form, packingStandard: Number(event.target.value) })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Part number">
                <Input
                  aria-label="Part number"
                  value={form.partNumber ?? ""}
                  onChange={(event) => setForm({ ...form, partNumber: event.target.value })}
                />
              </Field>
              <Field label="Default bin">
                <Input
                  aria-label="Default bin"
                  value={form.defaultBinLocation ?? ""}
                  onChange={(event) => setForm({ ...form, defaultBinLocation: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Opening/reference quantity">
              <Input
                aria-label="Opening/reference quantity"
                min={0}
                step="any"
                type="number"
                value={form.openingQuantity ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    openingQuantity: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
              />
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.isActive}
                onCheckedChange={(isActive) => setForm({ ...form, isActive })}
              />
              Active material
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save Material"}
              </Button>
              {selected?.id && selected.status !== "Inactive" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deactivate.mutate(selected.id!)}
                >
                  Deactivate
                </Button>
              ) : null}
            </div>
            {selected ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Received" value={selected.totalReceived.toLocaleString()} />
                  <StatCard
                    label="Issued"
                    value={selected.totalIssued.toLocaleString()}
                    tone="warning"
                  />
                  <StatCard
                    label="Available"
                    value={selected.available.toLocaleString()}
                    tone="success"
                  />
                  <StatCard
                    label="Pack Qty"
                    value={`${selected.packingStandard} ${selected.uom}`}
                  />
                </div>
                <div className="panel space-y-2 p-4 text-sm">
                  <Row k="Unit of Measure" v={selected.uom} />
                  <Row k="Part Number" v={selected.partNumber || "—"} />
                  <Row k="Default Bin" v={selected.defaultBinLocation || "—"} />
                  <Row
                    k="Opening/Reference Qty"
                    v={selected.openingQuantity?.toLocaleString() ?? "—"}
                  />
                  <Row k="Latest GRN" v={selected.latestGrn} />
                  <Row
                    k="Estimated Labels"
                    v={String(Math.ceil(selected.totalReceived / selected.packingStandard))}
                  />
                </div>
                <Link
                  to="/traceability"
                  search={{ q: selected.materialNumber }}
                  className="block rounded-lg border border-border bg-surface p-4 text-sm transition-colors hover:bg-accent"
                >
                  Trace this material end-to-end →
                </Link>
              </>
            ) : null}
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="num font-medium">{v}</span>
    </div>
  );
}

function parseMaterialBulkRow(
  record: Record<string, string>,
): BulkRowParseResult<MaterialMutation> {
  const materialNumber = record["materialNumber"].trim().toUpperCase();
  const description = record["description"].trim();
  const uom = record["uom"].trim().toUpperCase();
  const partNumber = record["partNumber"].trim();
  const defaultBinLocation = record["defaultBinLocation"].trim();
  const packingStandard = Number(record["packingStandard"]);
  const openingQuantity = record["openingQuantity"].trim()
    ? Number(record["openingQuantity"])
    : null;
  const active = parseActive(record["isActive"]);
  const errors: string[] = [];

  if (!materialNumber) errors.push("Material Number is required.");
  else if (materialNumber.length > 100)
    errors.push("Material Number cannot exceed 100 characters.");
  if (!description) errors.push("Description is required.");
  else if (description.length > 500) errors.push("Description cannot exceed 500 characters.");
  if (!uom) errors.push("UOM is required.");
  else if (uom.length > 20) errors.push("UOM cannot exceed 20 characters.");
  if (!Number.isFinite(packingStandard) || packingStandard <= 0) {
    errors.push("Pack Quantity must be a number greater than zero.");
  }
  if (openingQuantity !== null && (!Number.isFinite(openingQuantity) || openingQuantity < 0)) {
    errors.push("Opening Quantity must be blank or a non-negative number.");
  }
  if (partNumber.length > 100) errors.push("Part Number cannot exceed 100 characters.");
  if (defaultBinLocation.length > 100) errors.push("Default Bin cannot exceed 100 characters.");
  if (active.error) errors.push(active.error);

  return {
    key: materialNumber,
    value: {
      materialNumber,
      description,
      uom,
      packingStandard,
      partNumber,
      defaultBinLocation,
      openingQuantity,
      isActive: active.value,
    },
    errors,
  };
}

function parseActive(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["true", "yes", "y", "1", "active"].includes(normalized)) {
    return { value: true, error: "" };
  }
  if (["false", "no", "n", "0", "inactive"].includes(normalized)) {
    return { value: false, error: "" };
  }
  return { value: true, error: "Active must be TRUE/YES/1 or FALSE/NO/0." };
}
