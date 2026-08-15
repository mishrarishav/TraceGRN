import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConfiguration, saveConfiguration } from "@/services/api";

export const Route = createFileRoute("/_shell/configuration")({
  head: () => ({ meta: [{ title: "Configuration — TraceFlow" }] }),
  component: ConfigurationPage,
});

const strategyMap = {
  GrnAndSapLine: { name: "GRN Number + SAP Line Item", fields: ["GRNNumber", "SAPLineItemNumber"] },
  GrnAndMaterial: { name: "GRN Number + Material Number", fields: ["GRNNumber", "MaterialNumber"] },
  GrnMaterialAndSapLine: {
    name: "GRN + Material + SAP Line Item",
    fields: ["GRNNumber", "MaterialNumber", "SAPLineItemNumber"],
  },
  Custom: {
    name: "Composite identity",
    fields: ["GRNNumber", "MaterialNumber", "SAPLineItemNumber", "Plant"],
  },
} as const;

interface FormState {
  strategyType: keyof typeof strategyMap;
  businessRules: {
    requireInwardBeforeIssue: boolean;
    allowLabelReprint: boolean;
    requireReprintReason: boolean;
    allowDuplicateInward: boolean;
    requireStationForIssue: boolean;
    allowGrnRevisionAfterLabelsGenerated: boolean;
    allowGrnRevisionAfterMaterialIssued: boolean;
    requireAdminReviewForQuantityDecrease: boolean;
  };
  labelConfiguration: {
    uidPrefix: string;
    labelSize: string;
    companyName: string;
    qrSize: number;
    showBatch: boolean;
    showGrnDate: boolean;
    showDescription: boolean;
    showBinSequence: boolean;
  };
  plantConfiguration: { defaultPlant: string; defaultStorageLocation: string; timeZone: string };
  importConfiguration: {
    maxFileSizeMb: number;
    blockDuplicateFileHashes: boolean;
    autoGenerateLabels: boolean;
  };
}

const initial: FormState = {
  strategyType: "GrnAndMaterial",
  businessRules: {
    requireInwardBeforeIssue: true,
    allowLabelReprint: true,
    requireReprintReason: true,
    allowDuplicateInward: false,
    requireStationForIssue: true,
    allowGrnRevisionAfterLabelsGenerated: true,
    allowGrnRevisionAfterMaterialIssued: false,
    requireAdminReviewForQuantityDecrease: true,
  },
  labelConfiguration: {
    uidPrefix: "LBL",
    labelSize: "100x75",
    companyName: "TraceFlow Industries",
    qrSize: 160,
    showBatch: true,
    showGrnDate: true,
    showDescription: true,
    showBinSequence: true,
  },
  plantConfiguration: {
    defaultPlant: "1000",
    defaultStorageLocation: "RM01",
    timeZone: "Asia/Kolkata",
  },
  importConfiguration: {
    maxFileSizeMb: 10,
    blockDuplicateFileHashes: true,
    autoGenerateLabels: true,
  },
};

function ConfigurationPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["configuration"], queryFn: getConfiguration });
  const [form, setForm] = useState<FormState>(initial);
  useEffect(() => {
    if (!data) return;
    setForm({
      strategyType: data.identificationStrategy.strategyType as keyof typeof strategyMap,
      businessRules: {
        ...initial.businessRules,
        ...data.businessRules,
      } as FormState["businessRules"],
      labelConfiguration: {
        ...initial.labelConfiguration,
        ...data.labelConfiguration,
      } as FormState["labelConfiguration"],
      plantConfiguration: {
        ...initial.plantConfiguration,
        ...data.plantConfiguration,
      } as FormState["plantConfiguration"],
      importConfiguration: {
        ...initial.importConfiguration,
        ...data.importConfiguration,
      } as FormState["importConfiguration"],
    });
  }, [data]);
  const save = useMutation({
    mutationFn: () => {
      const strategy = strategyMap[form.strategyType];
      return saveConfiguration({
        identificationStrategy: {
          name: strategy.name,
          strategyType: form.strategyType,
          selectedFields: strategy.fields,
        },
        businessRules: form.businessRules,
        labelConfiguration: form.labelConfiguration,
        plantConfiguration: form.plantConfiguration,
        importConfiguration: form.importConfiguration,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["configuration"] });
      toast.success("Configuration saved to SQL Server");
    },
    onError: (error) => toast.error("Configuration save failed", { description: error.message }),
  });
  if (isLoading) return <LoadingSkeleton rows={6} />;

  const businessToggle = (key: keyof FormState["businessRules"]) =>
    setForm({ ...form, businessRules: { ...form.businessRules, [key]: !form.businessRules[key] } });
  const importToggle = (key: "blockDuplicateFileHashes" | "autoGenerateLabels") =>
    setForm({
      ...form,
      importConfiguration: { ...form.importConfiguration, [key]: !form.importConfiguration[key] },
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration"
        description="Database-backed plant defaults for import, labels, scanning and hardware."
        icon={<Cog className="h-5 w-5" />}
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        }
      />
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="scanning">Scanning</TabsTrigger>
          <TabsTrigger value="plant">Plant & Hardware</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Field label="Active identification strategy">
              <Select
                value={form.strategyType}
                onValueChange={(strategyType) =>
                  setForm({ ...form, strategyType: strategyType as FormState["strategyType"] })
                }
              >
                <SelectTrigger aria-label="Default identification strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(strategyMap).map(([key, strategy]) => (
                    <SelectItem key={key} value={key}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <p className="font-medium">Business identity fields</p>
              <p className="num mt-1 text-muted-foreground">
                {strategyMap[form.strategyType].fields.join(" + ")}
              </p>
            </div>
            <Field label="Default mapping template">
              <Input
                readOnly
                aria-label="Default mapping template"
                value={
                  data?.mappingTemplates.find((template) => template.isDefault)?.name ??
                  "Not configured"
                }
              />
            </Field>
            <Field label="Max file size (MB)">
              <Input
                type="number"
                aria-label="Max file size (MB)"
                min={1}
                max={10}
                value={form.importConfiguration.maxFileSizeMb}
                onChange={(event) =>
                  setForm({
                    ...form,
                    importConfiguration: {
                      ...form.importConfiguration,
                      maxFileSizeMb: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </div>
          <div className="panel space-y-4 p-5">
            <Toggle
              label="Block duplicate file hashes"
              description="Reject an Excel file that was already imported."
              checked={form.importConfiguration.blockDuplicateFileHashes}
              onChange={() => importToggle("blockDuplicateFileHashes")}
            />
            <Toggle
              label="Auto-generate labels after commit"
              description="Create delta pack labels immediately after a successful import."
              checked={form.importConfiguration.autoGenerateLabels}
              onChange={() => importToggle("autoGenerateLabels")}
            />
            <Toggle
              label="Admin review for quantity decrease"
              description="Flag lower quantities before reconciling unprocessed labels."
              checked={form.businessRules.requireAdminReviewForQuantityDecrease}
              onChange={() => businessToggle("requireAdminReviewForQuantityDecrease")}
            />
          </div>
        </TabsContent>

        <TabsContent value="labels" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Field label="Label UID prefix">
              <Input
                value={form.labelConfiguration.uidPrefix}
                onChange={(event) =>
                  setForm({
                    ...form,
                    labelConfiguration: {
                      ...form.labelConfiguration,
                      uidPrefix: event.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Label size">
              <Select
                value={form.labelConfiguration.labelSize}
                onValueChange={(labelSize) =>
                  setForm({
                    ...form,
                    labelConfiguration: { ...form.labelConfiguration, labelSize },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["100x75", "100x50", "75x50"].map((size) => (
                    <SelectItem key={size} value={size}>
                      {size} mm
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Company name">
              <Input
                value={form.labelConfiguration.companyName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    labelConfiguration: {
                      ...form.labelConfiguration,
                      companyName: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </div>
          <div className="panel space-y-4 p-5">
            <Toggle
              label="Allow label reprint"
              description="Every reprint requires a reason and creates an audit entry."
              checked={form.businessRules.allowLabelReprint}
              onChange={() => businessToggle("allowLabelReprint")}
            />
            <Toggle
              label="Require reprint reason"
              description="Prevents unaudited duplicate labels."
              checked={form.businessRules.requireReprintReason}
              onChange={() => businessToggle("requireReprintReason")}
            />
          </div>
        </TabsContent>

        <TabsContent value="scanning" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Toggle
              label="Require inward before issue"
              description="Only inwarded packs can be issued."
              checked={form.businessRules.requireInwardBeforeIssue}
              onChange={() => businessToggle("requireInwardBeforeIssue")}
            />
            <Toggle
              label="Require issue station"
              description="Issue requires an active station from the station master."
              checked={form.businessRules.requireStationForIssue}
              onChange={() => businessToggle("requireStationForIssue")}
            />
            <Toggle
              label="Allow duplicate inward"
              description="Keep disabled to prevent the same physical pack being received twice."
              checked={form.businessRules.allowDuplicateInward}
              onChange={() => businessToggle("allowDuplicateInward")}
            />
          </div>
          <div className="panel p-5 text-sm text-muted-foreground">
            Scanners use keyboard-wedge mode. Configure the scanner to append Enter/CR; no vendor
            SDK is required. Issue remains online-only to prevent duplicate material consumption.
          </div>
        </TabsContent>

        <TabsContent value="plant" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-4 p-5">
            <Field label="Default plant">
              <Input
                value={form.plantConfiguration.defaultPlant}
                onChange={(event) =>
                  setForm({
                    ...form,
                    plantConfiguration: {
                      ...form.plantConfiguration,
                      defaultPlant: event.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Default storage location">
              <Input
                value={form.plantConfiguration.defaultStorageLocation}
                onChange={(event) =>
                  setForm({
                    ...form,
                    plantConfiguration: {
                      ...form.plantConfiguration,
                      defaultStorageLocation: event.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Time zone">
              <Input
                value={form.plantConfiguration.timeZone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    plantConfiguration: {
                      ...form.plantConfiguration,
                      timeZone: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </div>
          <div className="panel space-y-2 p-5 text-sm">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Printer adapter
            </p>
            <p className="num">Mode · {data?.printing.mode}</p>
            <p className="num">Printer · {data?.printing.printerName}</p>
            <p className="num">
              Endpoint ·{" "}
              {data?.printing.host
                ? `${data.printing.host}:${data.printing.port}`
                : "Simulation (ZPL generated, not transmitted)"}
            </p>
            <p className="text-muted-foreground">
              For a Zebra/network printer set API Printing:Mode to RawTcp and configure its plant
              LAN IP. For an installed USB/Windows printer use WindowsSpooler and its exact printer
              name. The same tested ZPL print action is used without a UI change.
            </p>
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
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
