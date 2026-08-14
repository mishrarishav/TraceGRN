import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Cog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_shell/configuration")({
  head: () => ({
    meta: [
      { title: "Configuration — TraceFlow" },
      { name: "description", content: "Configure import strategies, label templates, scanning rules and plant defaults." },
      { property: "og:title", content: "Configuration — TraceFlow" },
      { property: "og:description", content: "System configuration for material traceability." },
    ],
  }),
  component: ConfigurationPage,
});

function ConfigurationPage() {
  const [toggles, setToggles] = useState({
    duplicateBlock: true,
    allowReprint: true,
    requireBin: true,
    offlineQueue: false,
    autoLabel: true,
  });

  const toggle = (k: keyof typeof toggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration"
        description="Plant-level defaults for import matching, labelling and scanning behaviour."
        icon={<Cog className="h-5 w-5" />}
        actions={<Button onClick={() => toast.success("Configuration saved")}>Save Changes</Button>}
      />

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="scanning">Scanning</TabsTrigger>
          <TabsTrigger value="plant">Plant</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Field label="Default identification strategy">
              <Select defaultValue="A">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — GRN + Line Item</SelectItem>
                  <SelectItem value="B">B — GRN + Material</SelectItem>
                  <SelectItem value="C">C — GRN + Material + Batch</SelectItem>
                  <SelectItem value="D">D — Composite Hash</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Default mapping template">
              <Select defaultValue="mb51">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mb51">SAP MB51 Standard</SelectItem>
                  <SelectItem value="migo">SAP MIGO Export</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Max file size (MB)"><Input type="number" defaultValue={10} className="num" /></Field>
          </div>
          <div className="panel space-y-4 p-5">
            <Toggle label="Block duplicate file hashes" description="Reject an Excel file that was already imported." checked={toggles.duplicateBlock} onChange={() => toggle("duplicateBlock")} />
            <Toggle label="Auto-generate labels after commit" description="Create pack labels immediately after a successful import." checked={toggles.autoLabel} onChange={() => toggle("autoLabel")} />
          </div>
        </TabsContent>

        <TabsContent value="labels" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Field label="Label UID prefix"><Input defaultValue="LBL" className="num" /></Field>
            <Field label="Label size">
              <Select defaultValue="100x75">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="100x75">100 × 75 mm</SelectItem>
                  <SelectItem value="100x50">100 × 50 mm</SelectItem>
                  <SelectItem value="75x50">75 × 50 mm</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Company name on label"><Input defaultValue="TraceFlow Industries" /></Field>
          </div>
          <div className="panel space-y-4 p-5">
            <Toggle label="Allow label reprint" description="Operators can reprint damaged labels; each reprint is audited." checked={toggles.allowReprint} onChange={() => toggle("allowReprint")} />
          </div>
        </TabsContent>

        <TabsContent value="scanning" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Toggle label="Require bin selection on inward" description="Operators must pick a destination bin before confirming." checked={toggles.requireBin} onChange={() => toggle("requireBin")} />
            <Toggle label="Offline scan queue" description="Buffer scans while offline and sync when reconnected." checked={toggles.offlineQueue} onChange={() => toggle("offlineQueue")} />
          </div>
          <div className="panel space-y-4 p-5">
            <Field label="Scan debounce (ms)"><Input type="number" defaultValue={120} className="num" /></Field>
            <Field label="Session auto-clear (minutes)"><Input type="number" defaultValue={30} className="num" /></Field>
          </div>
        </TabsContent>

        <TabsContent value="plant" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Field label="Default plant"><Input defaultValue="1000" className="num" /></Field>
            <Field label="Default storage location"><Input defaultValue="RM01" className="num" /></Field>
            <Field label="Time zone">
              <Select defaultValue="ist">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ist">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="utc">UTC</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="panel space-y-2 p-5 text-sm">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Integration</p>
            <p className="num">API base · /api</p>
            <p className="num">Build · TraceFlow 1.4.0 (demo data)</p>
            <p className="text-muted-foreground">Backend integration point for ASP.NET Core Web API and MS SQL Server.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
