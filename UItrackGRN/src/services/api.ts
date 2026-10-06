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
import { createRuntimeId } from "@/lib/id";
import { extractLabelUid } from "@/lib/label-scan";

export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] || "/api";
export const PRINT_AGENT_INSTALLER_URL = `${API_BASE_URL.replace(/\/api\/?$/, "")}/downloads/TrackGRN-PrintAgent.msi`;
export const APP_VERSION = "1.1.2";
const ACCESS_TOKEN_KEY = "trackgrn-access-token";
const REFRESH_TOKEN_KEY = "trackgrn-refresh-token";
const USER_KEY = "trackgrn-user";

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  employeeCode: string;
  role: string;
  roleDisplay: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  user: CurrentUser;
}

export interface ApiProblem {
  title?: string;
  detail?: string;
  status?: number;
  code?: ScanError;
  label?: MaterialLabel;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly problem?: ApiProblem,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function getStoredUser(): CurrentUser | null {
  const value = browserStorage()?.getItem(USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as CurrentUser;
  } catch {
    clearSession();
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(browserStorage()?.getItem(ACCESS_TOKEN_KEY));
}

function saveSession(session: LoginResponse) {
  const storage = browserStorage();
  if (!storage) return;
  storage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  const storage = browserStorage();
  storage?.removeItem(ACCESS_TOKEN_KEY);
  storage?.removeItem(REFRESH_TOKEN_KEY);
  storage?.removeItem(USER_KEY);
}

async function parseProblem(response: Response): Promise<ApiProblem> {
  try {
    return (await response.json()) as ApiProblem;
  } catch {
    return { title: response.statusText, status: response.status };
  }
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = browserStorage()?.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearSession();
    return false;
  }
  saveSession((await response.json()) as LoginResponse);
  return true;
}

async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const storage = browserStorage();
  const headers = new Headers(init.headers);
  const token = storage?.getItem(ACCESS_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Device-Id", getDeviceId());
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return apiRequest<T>(path, init, false);
  }
  if (!response.ok) {
    const problem = await parseProblem(response);
    const validation = problem.errors ? Object.values(problem.errors).flat()[0] : undefined;
    throw new ApiError(
      validation ?? problem.detail ?? problem.title ?? "Request failed",
      response.status,
      problem,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function getDeviceId() {
  const storage = browserStorage();
  if (!storage) return "TRACKGRN-WEB";
  let id = storage.getItem("trackgrn-device-id");
  if (!id) {
    id = `WEB-${createRuntimeId("device")}`;
    storage.setItem("trackgrn-device-id", id);
  }
  return id;
}

export async function login(username: string, password: string) {
  const session = await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  saveSession(session);
  return session;
}

export async function logout() {
  const refreshToken = browserStorage()?.getItem(REFRESH_TOKEN_KEY);
  try {
    if (refreshToken) {
      await apiRequest<void>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    }
  } finally {
    clearSession();
  }
}

export const getCurrentUser = () => apiRequest<CurrentUser>("/auth/me");
export const getDashboardData = () => apiRequest<DashboardData>("/dashboard");

export async function getGRNs(): Promise<GRNHeader[]> {
  const response = await apiRequest<{ items: GRNHeader[] }>("/grns?pageSize=500");
  return response.items;
}
export const getGRNById = (id: string) => apiRequest<GRNHeader>(`/grns/${encodeURIComponent(id)}`);

export async function getMaterials(): Promise<Material[]> {
  const response = await apiRequest<{ items: Material[] }>("/materials?pageSize=500");
  return response.items;
}
export async function getMaterialById(id: string) {
  return (await getMaterials()).find((material) => material.materialNumber === id);
}
export const createMaterial = (request: MaterialMutation) =>
  apiRequest<{ id: string }>("/materials", { method: "POST", body: JSON.stringify(request) });
export const updateMaterial = (id: string, request: MaterialMutation) =>
  apiRequest<void>(`/materials/${id}`, { method: "PUT", body: JSON.stringify(request) });
export const deactivateMaterial = (id: string) =>
  apiRequest<void>(`/materials/${id}`, { method: "DELETE" });

export interface MaterialMutation {
  materialNumber: string;
  description: string;
  uom: string;
  packingStandard: number;
  isActive: boolean;
  partNumber?: string;
  defaultBinLocation?: string;
  openingQuantity?: number | null;
}

export interface VendorMutation {
  vendorCode: string;
  vendorName: string;
  aliases: string[];
  isActive: boolean;
}

export const getVendors = (includeInactive = false) =>
  apiRequest<import("@/types").Vendor[]>(
    `/vendors${includeInactive ? "?includeInactive=true" : ""}`,
  );
export const createVendor = (request: VendorMutation) =>
  apiRequest<{ id: string }>("/vendors", { method: "POST", body: JSON.stringify(request) });
export const updateVendor = (id: string, request: VendorMutation) =>
  apiRequest<void>(`/vendors/${id}`, { method: "PUT", body: JSON.stringify(request) });
export const deactivateVendor = (id: string) =>
  apiRequest<void>(`/vendors/${id}`, { method: "DELETE" });

export interface ImportPreviewResponse {
  batch: ImportBatch;
  rows: ImportRowResult[];
}
export interface ImportOptions {
  identificationStrategy: { id: string; name: string; selectedFields: string[] };
  mappingTemplates: { id: string; name: string; isDefault: boolean }[];
}
export const getImportOptions = () => apiRequest<ImportOptions>("/imports/options");
export function previewGRNImport(
  file: File,
  mappingTemplateId?: string,
  selection?: {
    sheetName: string;
    headerRowNumber: number;
    mapping: Record<string, string>;
  },
  overrideDuplicate = false,
) {
  const body = new FormData();
  body.append("file", file);
  if (mappingTemplateId) body.append("mappingTemplateId", mappingTemplateId);
  if (selection) {
    body.append("sheetName", selection.sheetName);
    body.append("headerRowNumber", String(selection.headerRowNumber));
    body.append("mappingJson", JSON.stringify(selection.mapping));
  }
  body.append("overrideDuplicate", String(overrideDuplicate));
  return apiRequest<ImportPreviewResponse>("/imports/preview", { method: "POST", body });
}
export interface ImportFieldDefinition {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}
export interface ImportSheetInspection {
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  previewTruncated: boolean;
  rows: string[][];
}
export interface ImportInspection {
  fileName: string;
  extension: string;
  sheets: ImportSheetInspection[];
  selectedSheetName: string;
  selectedHeaderRow: number;
  matchedTemplate: { id: string; name: string; confidence: number } | null;
  mapping: Record<string, string>;
  fields: ImportFieldDefinition[];
  requiredMapped: number;
  requiredTotal: number;
  readyForImport: boolean;
}
export interface ImportProfileMutation {
  templateId?: string;
  name: string;
  fileName: string;
  sheetName: string;
  headerRowNumber: number;
  mapping: Record<string, string>;
  headers: string[];
}
export type ImportDuplicateAction = "Skip" | "Proceed";
export interface ImportDuplicateDecision {
  rowId: string;
  action: ImportDuplicateAction;
}
export function inspectGRNImport(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<ImportInspection>("/imports/inspect", { method: "POST", body });
}
export const saveImportProfile = (request: ImportProfileMutation) =>
  apiRequest<{ id: string; name: string; mapping: Record<string, string>; sheetAliases: string[] }>(
    "/imports/profiles",
    { method: "POST", body: JSON.stringify(request) },
  );
export const commitGRNImport = (
  batchId: string,
  duplicateDecisions: ImportDuplicateDecision[] = [],
) =>
  apiRequest<{
    batchId: string;
    status: string;
    applied: number;
    skippedDuplicates: number;
    proceededDuplicates: number;
  }>(`/imports/${batchId}/commit`, {
    method: "POST",
    body: JSON.stringify({ duplicateDecisions }),
  });
export const getImportBatches = () => apiRequest<ImportBatch[]>("/imports");
export const getImportBatch = (id: string) => apiRequest<ImportPreviewResponse>(`/imports/${id}`);

export const getLabels = () => apiRequest<MaterialLabel[]>("/labels?limit=2000");
export const getRevisions = () => apiRequest<GRNRevision[]>("/revisions");
export const getInventory = () => apiRequest<InventoryRow[]>("/inventory");
export const getTransactions = () => apiRequest<MaterialTransaction[]>("/transactions");
export const getUsers = () => apiRequest<User[]>("/users");
export const getStations = () => apiRequest<Station[]>("/stations");
export const getAuditLogs = () => apiRequest<AuditEvent[]>("/audit");

export interface UserMutation {
  name: string;
  employeeCode: string;
  username: string;
  role: string;
  password?: string;
  isActive: boolean;
}
export const createUser = (request: UserMutation) =>
  apiRequest<{ id: string }>("/users", { method: "POST", body: JSON.stringify(request) });
export const updateUser = (id: string, request: UserMutation) =>
  apiRequest<void>(`/users/${id}`, { method: "PUT", body: JSON.stringify(request) });
export const resetUserPassword = (id: string, newPassword: string, confirmPassword: string) =>
  apiRequest<{ userId: string; revokedSessions: number }>(`/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword, confirmPassword }),
  });
export const deactivateUser = (id: string) =>
  apiRequest<void>(`/users/${id}`, { method: "DELETE" });

export interface StationMutation {
  code: string;
  name: string;
  type: string;
  location?: string;
  device?: string;
  isActive: boolean;
}
export const createStation = (request: StationMutation) =>
  apiRequest<{ id: string }>("/stations", { method: "POST", body: JSON.stringify(request) });
export const updateStation = (id: string, request: StationMutation) =>
  apiRequest<void>(`/stations/${id}`, { method: "PUT", body: JSON.stringify(request) });
export const deactivateStation = (id: string) =>
  apiRequest<void>(`/stations/${id}`, { method: "DELETE" });

export type ScanPurpose = "lookup" | "inward" | "issue";
export type ScanError =
  "NOT_FOUND" | "ALREADY_ISSUED" | "ALREADY_INWARDED" | "NOT_INWARDED" | "BLOCKED" | "CANCELLED";
export type ScanOutcome =
  { ok: true; label: MaterialLabel } | { ok: false; error: ScanError; label?: MaterialLabel };

export const scanErrorMessage: Record<ScanError, string> = {
  NOT_FOUND: "Label not found in system",
  ALREADY_ISSUED: "Label already issued to production",
  ALREADY_INWARDED: "Label already inwarded",
  NOT_INWARDED: "Label must be inwarded before issue",
  BLOCKED: "Label is blocked and cannot be processed",
  CANCELLED: "Label is cancelled and cannot be processed",
};

export async function scanLabel(
  code: string,
  purpose: ScanPurpose = "lookup",
): Promise<ScanOutcome> {
  const labelUid = extractLabelUid(code);
  if (!labelUid) throw new Error("Label ID not found. Scan the full QR or enter a Label UID.");
  try {
    const label = await apiRequest<MaterialLabel>(
      `/labels/${encodeURIComponent(labelUid)}?purpose=${purpose}`,
    );
    return { ok: true, label };
  } catch (error) {
    if (error instanceof ApiError && error.problem?.code) {
      return error.problem.label
        ? { ok: false, error: error.problem.code, label: error.problem.label }
        : { ok: false, error: error.problem.code };
    }
    throw error;
  }
}

export const inwardMaterial = (labelUid: string, stationCode = "STORE-INWARD-01") =>
  apiRequest<{ ok: true; labelUid: string }>("/inward", {
    method: "POST",
    body: JSON.stringify({ labelUid, stationCode, deviceId: getDeviceId() }),
  });

export const issueMaterial = (labelUid: string, stationCode: string) =>
  apiRequest<{ ok: true; quantity: number; remaining: number; uom: string }>("/issues", {
    method: "POST",
    body: JSON.stringify({ labelUid, stationCode, deviceId: getDeviceId() }),
  });

export const printLabel = (labelUid: string, reason?: string, stationCode?: string) =>
  apiRequest<{ ok: true; printer: string; printCount: number; status: string }>(
    `/labels/${encodeURIComponent(labelUid)}/print`,
    { method: "POST", body: JSON.stringify({ reason, stationCode }) },
  );
export const printLabelBatch = (labelUids: string[], reason = "Batch print") =>
  apiRequest<{ requested: number; results: { labelUid: string; success: boolean }[] }>(
    "/labels/print-batch",
    { method: "POST", body: JSON.stringify({ labelUids, reason }) },
  );
export const generateLabels = (grnLineId: string, remarks?: string) =>
  apiRequest<{ generated: number; quantity: number; labelUids: string[] }>("/labels/generate", {
    method: "POST",
    body: JSON.stringify({ grnLineId, remarks }),
  });

export const searchTraceability = async (query: string): Promise<TraceResult | null> => {
  try {
    return await apiRequest<TraceResult>(`/traceability?q=${encodeURIComponent(query.trim())}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const getReports = () =>
  apiRequest<{ id: string; name: string; description: string; icon: string }[]>("/reports");

export interface ReportPage<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}

export interface IssueReportOptions {
  materials: { id: string; materialNumber: string; description: string }[];
  issuers: { id: string; name: string }[];
}

export interface IssueReportFilters {
  from?: string;
  toExclusive?: string;
  materialId?: string;
  issuedById?: string;
  page?: number;
  pageSize?: number;
}

export interface ImportReportRow {
  batchId: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  totalRows: number;
  newRows: number;
  updated: number;
  unchanged: number;
  warnings: number;
  rejected: number;
  status: string;
}

export interface ImportReportFilters {
  from?: string;
  toExclusive?: string;
  page?: number;
  pageSize?: number;
}

function reportQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
}

export const getIssueReportOptions = () =>
  apiRequest<IssueReportOptions>("/reports/issues/options");

export const getIssueReport = (filters: IssueReportFilters) =>
  apiRequest<ReportPage<MaterialTransaction>>(`/reports/issues?${reportQuery({ ...filters })}`);

export const getImportReport = (filters: ImportReportFilters) =>
  apiRequest<ReportPage<ImportReportRow>>(`/reports/imports?${reportQuery({ ...filters })}`);

export async function downloadReport(
  reportId: string,
  filters: { from?: string; to?: string; plant?: string; format: "xlsx" | "csv" },
) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
  const headers = new Headers({ "X-Device-Id": getDeviceId() });
  const token = browserStorage()?.getItem(ACCESS_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(
    `${API_BASE_URL}/reports/${encodeURIComponent(reportId)}/export?${query.toString()}`,
    { headers },
  );
  if (!response.ok) {
    const problem = await parseProblem(response);
    throw new ApiError(
      problem.detail ?? problem.title ?? "Report generation failed",
      response.status,
      problem,
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const matched = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const fileName = matched?.[1]
    ? decodeURIComponent(matched[1].replaceAll('"', ""))
    : `TrackGRN-${reportId}.${filters.format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return fileName;
}

export interface SystemConfiguration {
  identificationStrategy: {
    id: string;
    name: string;
    strategyType: string;
    selectedFields: string[];
  };
  mappingTemplates: {
    id: string;
    name: string;
    mapping: Record<string, string>;
    isDefault: boolean;
    isActive: boolean;
  }[];
  businessRules: Record<string, boolean>;
  labelConfiguration: Record<string, string | number | boolean>;
  plantConfiguration: {
    defaultPlant: string;
    defaultStorageLocation: string;
    timeZone: string;
    clientName: string;
    clientLogoDataUrl: string;
  };
  importConfiguration: Record<string, string | number | boolean>;
  printing: {
    mode: string;
    printerName: string;
    host: string | null;
    port: number;
    dpi: number;
    connectionTimeoutSeconds: number;
    hardwareReady: boolean;
  };
}
export const getConfiguration = () => apiRequest<SystemConfiguration>("/configuration");

export interface SystemBranding {
  appName: string;
  version: string;
  clientName: string;
  clientLogoDataUrl: string;
}

export const getSystemBranding = () => apiRequest<SystemBranding>("/system/branding");
export const saveConfiguration = (request: unknown) =>
  apiRequest<void>("/configuration", { method: "PUT", body: JSON.stringify(request) });

export interface PrinterTestResult {
  ok: true;
  labelUid: string;
  mode: string;
  printer: string;
  dpi: number;
}

export const testPrinter = () =>
  apiRequest<PrinterTestResult>("/configuration/printer/test", { method: "POST" });

export interface PrinterConfigurationRequest {
  mode: "WindowsSpooler" | "RawTcp" | "LocalAgent";
  printerName: string;
  host: string | null;
  port: number;
  dpi: number;
  connectionTimeoutSeconds: number;
}

export const configureAndTestPrinter = (request: PrinterConfigurationRequest) =>
  apiRequest<PrinterTestResult & { saved: true; host: string | null; port: number }>(
    "/configuration/printer/configure-and-test",
    { method: "POST", body: JSON.stringify(request) },
  );

export interface PrinterDiscoveryResult {
  scannedAt: string;
  scannedHosts: number;
  networks: {
    interfaceName: string;
    localAddress: string;
    subnet: string;
  }[];
  printers: {
    host: string;
    port: number;
    printerName: string;
    source: string;
    latencyMs: number;
  }[];
}

export const discoverNetworkPrinters = () =>
  apiRequest<PrinterDiscoveryResult>("/configuration/printer/discover");

export interface PrintAgentDiscoveryResult {
  scannedAt: string;
  scannedHosts: number;
  networks: PrinterDiscoveryResult["networks"];
  agents: {
    host: string;
    port: number;
    machineName: string;
    version: string;
    source: string;
    latencyMs: number;
    printers: string[];
  }[];
}

export const discoverPrintAgents = () =>
  apiRequest<PrintAgentDiscoveryResult>("/configuration/printer/agents/discover");
