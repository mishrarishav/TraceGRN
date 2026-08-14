/**
 * Mock service layer.
 *
 * Every function here is the single integration seam for the future
 * ASP.NET Core Web API. Replace the body of each function with a `fetch`
 * against `API_BASE_URL` — components never need to change.
 */
import {
  auditEvents,
  dashboard,
  grns,
  importBatches,
  importRows,
  inventory,
  labels,
  materials,
  revisions,
  stations,
  traceResults,
  transactions,
  users,
} from "@/mocks/data";
import type {
  AuditEvent,
  DashboardData,
  GRNHeader,
  GRNRevision,
  ImportBatch,
  ImportRowResult,
  InventoryRow,
  Material,
  MaterialLabel,
  MaterialTransaction,
  Station,
  TraceResult,
  User,
} from "@/types";

export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "/api";

const delay = <T,>(data: T, ms = 320): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms));

export const getDashboardData = (): Promise<DashboardData> => delay(dashboard);

export const getGRNs = (): Promise<GRNHeader[]> => delay(grns);

export const getGRNById = (id: string): Promise<GRNHeader | undefined> =>
  delay(grns.find((g) => g.grnNumber === id));

export const getMaterials = (): Promise<Material[]> => delay(materials);

export const getMaterialById = (id: string): Promise<Material | undefined> =>
  delay(materials.find((m) => m.materialNumber === id));

export const uploadGRNMock = (fileName: string): Promise<ImportBatch> =>
  delay({ ...importBatches[0]!, fileName }, 700);

export const getImportPreview = (): Promise<ImportRowResult[]> => delay(importRows);

export const getImportBatches = (): Promise<ImportBatch[]> => delay(importBatches);

export const getLabels = (): Promise<MaterialLabel[]> => delay(labels);

export const getRevisions = (): Promise<GRNRevision[]> => delay(revisions);

export const getInventory = (): Promise<InventoryRow[]> => delay(inventory);

export const getTransactions = (): Promise<MaterialTransaction[]> => delay(transactions);

export const getUsers = (): Promise<User[]> => delay(users);

export const getStations = (): Promise<Station[]> => delay(stations);

export const getAuditLogs = (): Promise<AuditEvent[]> => delay(auditEvents);

export type ScanOutcome =
  | { ok: true; label: MaterialLabel }
  | { ok: false; error: "NOT_FOUND" | "ALREADY_ISSUED"; label?: MaterialLabel | undefined };

export const scanLabel = async (code: string): Promise<ScanOutcome> => {
  await delay(null, 420);
  const found = labels.find((l) => l.labelUid.toLowerCase() === code.trim().toLowerCase());
  if (!found) return { ok: false, error: "NOT_FOUND" };
  if (found.status === "Issued") return { ok: false, error: "ALREADY_ISSUED", label: found };
  return { ok: true, label: found };
};

export const inwardMaterial = async (labelUid: string): Promise<{ ok: true; labelUid: string }> => {
  await delay(null, 450);
  const found = labels.find((l) => l.labelUid === labelUid);
  if (found) found.status = "Inwarded";
  return { ok: true, labelUid };
};

export const issueMaterial = async (
  labelUid: string,
): Promise<{ ok: true; quantity: number; remaining: number; uom: string }> => {
  await delay(null, 450);
  const found = labels.find((l) => l.labelUid === labelUid);
  if (found) {
    found.status = "Issued";
    found.issuedAt = new Date().toISOString();
    found.issuedBy = "Rahul Sharma";
  }
  const material = materials.find((m) => m.materialNumber === found?.materialNumber);
  const qty = found?.quantity ?? 1000;
  if (material) material.available = Math.max(0, material.available - qty);
  return { ok: true, quantity: qty, remaining: material?.available ?? 7000, uom: found?.uom ?? "PCS" };
};

export const searchTraceability = async (query: string): Promise<TraceResult | null> => {
  await delay(null, 500);
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const direct = traceResults.find((t) => t.labelUid.toLowerCase() === q);
  if (direct) return direct;
  const byLabel = labels.find(
    (l) =>
      l.labelUid.toLowerCase() === q ||
      l.grnNumber === q ||
      l.materialNumber.toLowerCase() === q ||
      l.batch.toLowerCase() === q,
  );
  if (!byLabel) return null;
  const base = traceResults[0]!;
  const steps =
    byLabel.status === "Issued" ? base.steps : base.steps.slice(0, byLabel.status === "Generated" ? 2 : 5);
  return {
    labelUid: byLabel.labelUid,
    materialNumber: byLabel.materialNumber,
    description: byLabel.description,
    grnNumber: byLabel.grnNumber,
    quantity: byLabel.quantity,
    uom: byLabel.uom,
    batch: byLabel.batch,
    currentStatus: byLabel.status,
    steps,
  };
};

export const getReports = () =>
  delay([
    { id: "grn", name: "GRN Report", description: "GRN headers with received, issued and available quantity", icon: "receipt" },
    { id: "inventory", name: "Material Inventory Report", description: "Material-wise stock balance across GRNs", icon: "warehouse" },
    { id: "labels", name: "Label Status Report", description: "Label lifecycle status by GRN and material", icon: "qr" },
    { id: "issues", name: "Issue History", description: "Store-to-production issue transactions", icon: "forklift" },
    { id: "operators", name: "Operator Activity", description: "Scan volume and accuracy per operator", icon: "users" },
    { id: "imports", name: "Import History", description: "SAP Excel import batches and outcomes", icon: "upload" },
    { id: "revisions", name: "GRN Revision Report", description: "Quantity revisions with approval status", icon: "history" },
    { id: "trace", name: "Traceability Report", description: "Full label journey from GRN to production", icon: "route" },
  ]);
