import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MonitorSmartphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
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
  createStation,
  deactivateStation,
  getStations,
  updateStation,
  type StationMutation,
} from "@/services/api";
import type { Station } from "@/types";

export const Route = createFileRoute("/_shell/stations")({
  head: () => ({ meta: [{ title: "Stations & Devices — TrackGRN" }] }),
  component: StationsPage,
});

const empty: StationMutation = {
  code: "",
  name: "",
  type: "Issue Station",
  location: "",
  device: "Keyboard-wedge scanner",
  isActive: true,
};

function StationsPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["stations"], queryFn: getStations });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [form, setForm] = useState<StationMutation>(empty);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["stations"] });
  const save = useMutation({
    mutationFn: async () => {
      if (editing?.id) await updateStation(editing.id, form);
      else await createStation(form);
    },
    onSuccess: () => {
      void refresh();
      setOpen(false);
      toast.success(editing ? "Station updated" : "Station created");
    },
    onError: (error) => toast.error("Unable to save station", { description: error.message }),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateStation(id),
    onSuccess: () => {
      void refresh();
      setOpen(false);
      toast.success("Station deactivated");
    },
    onError: (error) => toast.error("Unable to deactivate station", { description: error.message }),
  });
  const edit = (station: Station) => {
    setEditing(station);
    setForm({
      code: station.code,
      name: station.name,
      type: station.type,
      location: station.location,
      device: station.device,
      isActive: station.status === "Active",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stations & Devices"
        description="Registered keyboard-wedge scanner points for receiving and production issue."
        icon={<MonitorSmartphone className="h-5 w-5" />}
        actions={
          <Button
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Station
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Stations" value={data.length} tone="primary" />
        <StatCard
          label="Issue Stations"
          value={data.filter((station) => station.type === "Issue Station").length}
          tone="warning"
        />
        <StatCard
          label="Active"
          value={data.filter((station) => station.status === "Active").length}
          tone="success"
        />
      </div>
      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((station, index) => (
            <motion.button
              type="button"
              key={station.code}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="panel p-5 text-left"
              onClick={() => edit(station)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="num text-sm font-semibold text-primary">{station.code}</p>
                  <p className="text-sm font-medium">{station.name}</p>
                </div>
                <StatusBadge status={station.status} />
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <p>
                  Type · <span className="text-foreground">{station.type}</span>
                </p>
                <p>
                  Location · <span className="text-foreground">{station.location}</span>
                </p>
                <p>
                  Device · <span className="num text-foreground">{station.device}</span>
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit station" : "Add station"}</DialogTitle>
            <DialogDescription>
              Scanner model is informational; any USB/Bluetooth keyboard-wedge scanner works without
              a driver integration.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Station code">
                <Input
                  aria-label="Station code"
                  required
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                />
              </Field>
              <Field label="Station name">
                <Input
                  aria-label="Station name"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Type">
                <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
                  <SelectTrigger aria-label="Station type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Inward Station", "Issue Station", "General Station"].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Location">
                <Input
                  aria-label="Location"
                  value={form.location}
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                />
              </Field>
              <Field label="Device">
                <Input
                  aria-label="Device"
                  value={form.device}
                  onChange={(event) => setForm({ ...form, device: event.target.value })}
                />
              </Field>
              <label className="flex items-end gap-3 pb-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                />
                Active station
              </label>
            </div>
            <DialogFooter className="gap-2">
              {editing?.id && editing.status === "Active" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deactivate.mutate(editing.id!)}
                >
                  Deactivate
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save Station"}
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
