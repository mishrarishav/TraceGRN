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
    id = `WEB-${crypto.randomUUID()}`;
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
}

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
  overrideDuplicate = false,
) {
  const body = new FormData();
  body.append("file", file);
  if (mappingTemplateId) body.append("mappingTemplateId", mappingTemplateId);
  body.append("overrideDuplicate", String(overrideDuplicate));
  return apiRequest<ImportPreviewResponse>("/imports/preview", { method: "POST", body });
}
export const commitGRNImport = (batchId: string) =>
  apiRequest<{ batchId: string; status: string; applied: number }>(`/imports/${batchId}/commit`, {
    method: "POST",
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
  try {
    const label = await apiRequest<MaterialLabel>(
      `/labels/${encodeURIComponent(code.trim())}?purpose=${purpose}`,
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
  apiRequest<{ ok: true; simulated: boolean; printer: string; printCount: number }>(
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
  plantConfiguration: Record<string, string>;
  importConfiguration: Record<string, string | number | boolean>;
  printing: {
    mode: string;
    printerName: string;
    host?: string;
    port: number;
    dpi: number;
    hardwareReady: boolean;
  };
}
export const getConfiguration = () => apiRequest<SystemConfiguration>("/configuration");
export const saveConfiguration = (request: unknown) =>
  apiRequest<void>("/configuration", { method: "PUT", body: JSON.stringify(request) });
