import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cog,
  Download,
  FileText,
  ImageUp,
  Laptop,
  Printer,
  Radar,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { PrintOutputSelect, type PrintOutput } from "@/components/common/PrintOutputSelect";
import { createTestLabel } from "@/lib/label-content";
import { openLabelPdf } from "@/lib/label-pdf";
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
import {
  configureAndTestPrinter,
  discoverNetworkPrinters,
  discoverPrintAgents,
  getConfiguration,
  PRINT_AGENT_INSTALLER_URL,
  saveConfiguration,
  testPrinter,
  type PrinterConfigurationRequest,
  type PrinterDiscoveryResult,
  type PrintAgentDiscoveryResult,
} from "@/services/api";

export const Route = createFileRoute("/_shell/configuration")({
  head: () => ({ meta: [{ title: "Configuration — TrackGRN" }] }),
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
  plantConfiguration: {
    defaultPlant: string;
    defaultStorageLocation: string;
    timeZone: string;
    clientName: string;
    clientLogoDataUrl: string;
  };
  importConfiguration: {
    maxFileSizeMb: number;
    blockDuplicateFileHashes: boolean;
    autoGenerateLabels: boolean;
  };
}

type PrinterFormState = PrinterConfigurationRequest;

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
    companyName: "TrackGRN Industries",
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
    clientName: "",
    clientLogoDataUrl: "",
  },
  importConfiguration: {
    maxFileSizeMb: 10,
    blockDuplicateFileHashes: true,
    autoGenerateLabels: true,
  },
};

const initialPrinter: PrinterFormState = {
  mode: "WindowsSpooler",
  printerName: "ZDesigner ZD230-203dpi ZPL",
  host: null,
  port: 9100,
  dpi: 203,
  connectionTimeoutSeconds: 5,
};

function ConfigurationPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["configuration"], queryFn: getConfiguration });
  const [form, setForm] = useState<FormState>(initial);
  const [printerForm, setPrinterForm] = useState<PrinterFormState>(initialPrinter);
  const [printOutput, setPrintOutput] = useState<PrintOutput>("Printer");
  const [discovery, setDiscovery] = useState<PrinterDiscoveryResult | null>(null);
  const [agentDiscovery, setAgentDiscovery] = useState<PrintAgentDiscoveryResult | null>(null);
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
    const supportedMode = ["WindowsSpooler", "RawTcp", "LocalAgent"].includes(data.printing.mode)
      ? (data.printing.mode as PrinterFormState["mode"])
      : "WindowsSpooler";
    setPrinterForm({
      mode: supportedMode,
      printerName: data.printing.printerName,
      host: data.printing.host,
      port: data.printing.port,
      dpi: data.printing.dpi,
      connectionTimeoutSeconds: data.printing.connectionTimeoutSeconds ?? 5,
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
      void queryClient.invalidateQueries({ queryKey: ["branding"] });
      toast.success("Configuration saved to SQL Server");
    },
    onError: (error) => toast.error("Configuration save failed", { description: error.message }),
  });
  const printerTest = useMutation({
    mutationFn: testPrinter,
    onSuccess: (result) =>
      toast.success("Test label sent to printer", {
        description: `${result.labelUid} → ${result.printer} (${result.mode}, ${result.dpi} dpi)`,
      }),
    onError: (error) => toast.error("Test label print failed", { description: error.message }),
  });
  const configurePrinter = useMutation({
    mutationFn: () => configureAndTestPrinter(printerForm),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["configuration"] });
      toast.success("Printer saved and test label dispatched", {
        description: `${result.printer}${result.host ? ` · ${result.host}:${result.port}` : ""} · ${result.dpi} dpi`,
      });
    },
    onError: (error) =>
      toast.error("Printer was not saved", {
        description: `${error.message} Check the printer IP, port, power and LAN connectivity.`,
      }),
  });
  const discoverPrinters = useMutation({
    mutationFn: discoverNetworkPrinters,
    onSuccess: (result) => {
      setDiscovery(result);
      if (result.printers.length > 0) {
        toast.success(`${result.printers.length} possible network printer(s) found`);
      } else {
        toast.info("No Raw TCP printer found", {
          description: `Scanned ${result.scannedHosts} LAN addresses on port 9100.`,
        });
      }
    },
    onError: (error) => toast.error("Printer discovery failed", { description: error.message }),
  });
  const discoverAgents = useMutation({
    mutationFn: discoverPrintAgents,
    onSuccess: (result) => {
      setAgentDiscovery(result);
      if (result.agents.length > 0) {
        toast.success(`${result.agents.length} installed Print Agent(s) found`);
      } else {
        toast.info("No TrackGRN Print Agent found", {
          description: "Install the MSI on the printer laptop, then scan again.",
        });
      }
    },
    onError: (error) => toast.error("Print Agent discovery failed", { description: error.message }),
  });
  if (isLoading) return <LoadingSkeleton rows={6} />;

  const businessToggle = (key: keyof FormState["businessRules"]) =>
    setForm({ ...form, businessRules: { ...form.businessRules, [key]: !form.businessRules[key] } });
  const importToggle = (key: "blockDuplicateFileHashes" | "autoGenerateLabels") =>
    setForm({
      ...form,
      importConfiguration: { ...form.importConfiguration, [key]: !form.importConfiguration[key] },
    });

  const uploadClientLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) {
      toast.error("Unsupported client logo", { description: "Use a PNG, JPEG, or WebP image." });
      return;
    }
    if (file.size > 1_000_000) {
      toast.error("Client logo is too large", { description: "Maximum allowed size is 1 MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setForm((current) => ({
        ...current,
        plantConfiguration: {
          ...current.plantConfiguration,
          clientLogoDataUrl: reader.result as string,
        },
      }));
      toast.success("Client logo ready", {
        description: "Save Changes to store it in SQL Server.",
      });
    };
    reader.onerror = () => toast.error("Client logo could not be read");
    reader.readAsDataURL(file);
  };

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
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Client branding
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The saved name and logo appear on login, header, and footer for every user.
              </p>
            </div>
            <Field label="Client name">
              <Input
                aria-label="Client name"
                maxLength={100}
                placeholder="Client organization name"
                value={form.plantConfiguration.clientName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    plantConfiguration: {
                      ...form.plantConfiguration,
                      clientName: event.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Client logo">
              <div className="rounded-lg border border-dashed border-border bg-surface/60 p-3">
                <div className="flex min-h-20 items-center justify-center rounded-md bg-background p-3">
                  {form.plantConfiguration.clientLogoDataUrl ? (
                    <img
                      src={form.plantConfiguration.clientLogoDataUrl}
                      alt="Client logo preview"
                      className="max-h-16 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No client logo uploaded</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    id="client-logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={uploadClientLogo}
                  />
                  <Button type="button" variant="outline" size="sm" className="gap-2" asChild>
                    <label htmlFor="client-logo-upload" className="cursor-pointer">
                      <ImageUp className="h-4 w-4" /> Upload logo
                    </label>
                  </Button>
                  {form.plantConfiguration.clientLogoDataUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() =>
                        setForm({
                          ...form,
                          plantConfiguration: {
                            ...form.plantConfiguration,
                            clientLogoDataUrl: "",
                          },
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">
                    PNG, JPEG, or WebP · max 1 MB
                  </span>
                </div>
              </div>
            </Field>
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Plant defaults
              </p>
            </div>
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
          <div className="panel space-y-4 p-5 text-sm">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Printer connection
            </p>
            <PrintOutputSelect value={printOutput} onChange={setPrintOutput} />
            {printOutput === "PDF" ? (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium">Test label PDF</p>
                <p className="text-xs text-muted-foreground">
                  Open a 100 x 75 mm test label in a new window, then download or print it from the
                  PDF viewer. No Print Agent is needed for PDF export.
                </p>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => {
                    try {
                      openLabelPdf([createTestLabel()], form.plantConfiguration);
                      toast.success("Test label PDF opened");
                    } catch (error) {
                      toast.error("PDF export failed", {
                        description:
                          error instanceof Error ? error.message : "Unable to create the PDF.",
                      });
                    }
                  }}
                >
                  <FileText className="h-4 w-4" /> Open Test PDF
                </Button>
              </div>
            ) : (
              <>
                {printerForm.mode === "RawTcp" ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          <Wifi className="h-4 w-4 text-primary" /> Find printer on this LAN
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Scans the API machine&apos;s active local subnet for Zebra/RAW TCP port
                          9100.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => discoverPrinters.mutate()}
                        disabled={discoverPrinters.isPending}
                      >
                        <Radar
                          className={
                            discoverPrinters.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"
                          }
                        />
                        {discoverPrinters.isPending ? "Scanning LAN…" : "Find Printer IP"}
                      </Button>
                    </div>
                    {discovery ? (
                      <div className="mt-3 space-y-2 border-t border-primary/15 pt-3">
                        <p className="text-xs text-muted-foreground">
                          Scanned {discovery.scannedHosts} addresses
                          {discovery.networks.length > 0
                            ? ` · ${discovery.networks.map((network) => `${network.interfaceName} ${network.subnet}`).join(", ")}`
                            : " · no active private LAN detected"}
                        </p>
                        {discovery.printers.length > 0 ? (
                          discovery.printers.map((printer) => (
                            <div
                              key={`${printer.host}:${printer.port}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2"
                            >
                              <div>
                                <p className="num font-medium">
                                  {printer.host}:{printer.port}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {printer.source} · responded in {printer.latencyMs} ms
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setPrinterForm({
                                    ...printerForm,
                                    mode: "RawTcp",
                                    printerName: printer.printerName,
                                    host: printer.host,
                                    port: printer.port,
                                  });
                                  toast.success(`Selected printer ${printer.host}`);
                                }}
                              >
                                Use this printer
                              </Button>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No device accepted port 9100. A USB-only printer has no network IP;
                            connect Ethernet/Wi-Fi or use the Windows shared-printer mode.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Field label="Connection mode">
                  <Select
                    value={printerForm.mode}
                    onValueChange={(mode) =>
                      setPrinterForm({
                        ...printerForm,
                        mode: mode as PrinterFormState["mode"],
                        host: null,
                        port:
                          mode === "RawTcp"
                            ? 9100
                            : mode === "LocalAgent"
                              ? 17891
                              : printerForm.port,
                      })
                    }
                  >
                    <SelectTrigger aria-label="Printer connection mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RawTcp">Network printer (IP / port 9100)</SelectItem>
                      <SelectItem value="LocalAgent">Print locally via installed Agent</SelectItem>
                      <SelectItem value="WindowsSpooler">USB or Windows shared printer</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {printerForm.mode === "LocalAgent" ? (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          <Laptop className="h-4 w-4 text-primary" /> Print from another Windows
                          laptop
                        </p>
                        <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                          Download and install the Agent as Administrator on the laptop where the
                          USB or Windows printer is connected. It starts automatically with Windows.
                        </p>
                      </div>
                      <Button type="button" variant="outline" className="gap-2" asChild>
                        <a href={PRINT_AGENT_INSTALLER_URL} download>
                          <Download className="h-4 w-4" /> Download MSI
                        </a>
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-3">
                      <p className="text-xs text-muted-foreground">
                        After installation, keep that laptop and printer powered on and on this LAN.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => discoverAgents.mutate()}
                        disabled={discoverAgents.isPending}
                      >
                        <Radar
                          className={discoverAgents.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                        />
                        {discoverAgents.isPending ? "Scanning LAN…" : "Find Installed Print Agents"}
                      </Button>
                    </div>
                    {agentDiscovery ? (
                      <div className="space-y-2 border-t border-primary/15 pt-3">
                        <p className="text-xs text-muted-foreground">
                          Scanned {agentDiscovery.scannedHosts} addresses · found{" "}
                          {agentDiscovery.agents.length} agent(s)
                        </p>
                        {agentDiscovery.agents.length > 0 ? (
                          agentDiscovery.agents.map((agent) => (
                            <div
                              key={`${agent.host}:${agent.port}`}
                              className="rounded-md border border-border bg-background p-3"
                            >
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-medium">{agent.machineName}</p>
                                  <p className="num text-xs text-muted-foreground">
                                    {agent.host}:{agent.port} · Agent v{agent.version} ·{" "}
                                    {agent.latencyMs} ms
                                  </p>
                                </div>
                              </div>
                              {agent.printers.length > 0 ? (
                                <div className="space-y-2">
                                  {agent.printers.map((printerName) => (
                                    <div
                                      key={printerName}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface p-2"
                                    >
                                      <span className="text-xs font-medium">{printerName}</span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => {
                                          setPrinterForm({
                                            ...printerForm,
                                            mode: "LocalAgent",
                                            host: agent.host,
                                            port: agent.port,
                                            printerName,
                                          });
                                          toast.success(
                                            `Selected ${printerName} on ${agent.machineName}`,
                                          );
                                        }}
                                      >
                                        Use this printer
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Agent is online, but Windows reported no installed printer queues.
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No Agent found. Install the MSI on the printer laptop and allow the
                            Windows private-network prompt, then scan again.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Field
                  label={
                    printerForm.mode === "WindowsSpooler" || printerForm.mode === "LocalAgent"
                      ? "Exact Windows printer queue"
                      : "Printer display name"
                  }
                >
                  <Input
                    aria-label="Printer name"
                    placeholder={
                      printerForm.mode === "WindowsSpooler" || printerForm.mode === "LocalAgent"
                        ? "ZDesigner ZD230-203dpi ZPL or \\\\PC\\Share"
                        : "Zebra Receiving Bay"
                    }
                    value={printerForm.printerName}
                    onChange={(event) =>
                      setPrinterForm({ ...printerForm, printerName: event.target.value })
                    }
                  />
                </Field>
                {printerForm.mode === "RawTcp" || printerForm.mode === "LocalAgent" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={
                        printerForm.mode === "LocalAgent"
                          ? "Print Agent laptop IP / hostname"
                          : "Printer IP / hostname"
                      }
                    >
                      <Input
                        aria-label={
                          printerForm.mode === "LocalAgent"
                            ? "Print Agent IP or hostname"
                            : "Printer IP or hostname"
                        }
                        inputMode="decimal"
                        placeholder={
                          printerForm.mode === "LocalAgent" ? "192.168.1.24" : "192.168.1.50"
                        }
                        value={printerForm.host ?? ""}
                        onChange={(event) =>
                          setPrinterForm({ ...printerForm, host: event.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label={printerForm.mode === "LocalAgent" ? "Agent port" : "Raw TCP port"}
                    >
                      <Input
                        aria-label="Printer port"
                        type="number"
                        min={1}
                        max={65535}
                        value={printerForm.port}
                        onChange={(event) =>
                          setPrinterForm({ ...printerForm, port: Number(event.target.value) })
                        }
                      />
                    </Field>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Printer resolution">
                    <Select
                      value={String(printerForm.dpi)}
                      onValueChange={(dpi) => setPrinterForm({ ...printerForm, dpi: Number(dpi) })}
                    >
                      <SelectTrigger aria-label="Printer resolution">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="203">203 dpi</SelectItem>
                        <SelectItem value="300">300 dpi</SelectItem>
                        <SelectItem value="600">600 dpi</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {printerForm.mode === "RawTcp" || printerForm.mode === "LocalAgent" ? (
                    <Field label="Connection timeout">
                      <Input
                        aria-label="Printer connection timeout"
                        type="number"
                        min={1}
                        max={30}
                        value={printerForm.connectionTimeoutSeconds}
                        onChange={(event) =>
                          setPrinterForm({
                            ...printerForm,
                            connectionTimeoutSeconds: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-surface p-3 text-xs">
                  <p className="font-medium">Currently saved</p>
                  <p className="num mt-1 text-muted-foreground">
                    {data?.printing.mode} · {data?.printing.printerName}
                    {data?.printing.host ? ` · ${data.printing.host}:${data.printing.port}` : ""}
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    Network mode sends directly to a printer IP. Local Agent mode sends through the
                    selected Windows laptop, so the site can be opened and printed from any phone or
                    computer on the same network.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={() => configurePrinter.mutate()}
                    disabled={configurePrinter.isPending}
                  >
                    <Printer className="h-4 w-4" />
                    {configurePrinter.isPending ? "Connecting…" : "Save & Test Printer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => printerTest.mutate()}
                    disabled={printerTest.isPending || !data?.printing.hardwareReady}
                  >
                    <Printer className="h-4 w-4" />
                    {printerTest.isPending ? "Sending…" : "Test Current Printer"}
                  </Button>
                </div>
              </>
            )}
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
