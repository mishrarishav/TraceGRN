export type Role = "Admin" | "Store Manager" | "Store Operator" | "Viewer";

export type RecordStatus =
  | "New"
  | "Updated"
  | "Unchanged"
  | "Warning"
  | "Rejected"
  | "Generated"
  | "Printed"
  | "Inwarded"
  | "Issued"
  | "Blocked"
  | "Cancelled"
  | "Available"
  | "Admin Review"
  | "Active"
  | "Inactive"
  | "Partial"
  | "Completed"
  | "Pending";

export interface User {
  id: string;
  name: string;
  employeeCode: string;
  username: string;
  role: Role;
  status: "Active" | "Inactive";
  lastLogin: string;
  rowVersion?: string;
}

export interface Material {
  id?: string;
  materialNumber: string;
  description: string;
  uom: string;
  packingStandard: number;
  totalReceived: number;
  totalIssued: number;
  available: number;
  latestGrn: string;
  status: RecordStatus;
}

export interface GRNLine {
  grnLineId?: string;
  lineItem: number;
  materialNumber: string;
  description: string;
  receivedQty: number;
  packingStandard: number;
  labels: number;
  issuedQty: number;
  availableQty: number;
  batch: string;
  status: RecordStatus;
}

export interface GRNHeader {
  grnNumber: string;
  grnDate: string;
  vendor: string;
  vendorCode: string;
  poNumber: string;
  plant: string;
  storageLocation: string;
  importBatch: string;
  materials: number;
  receivedQty: number;
  issuedQty: number;
  availableQty: number;
  labelled: number;
  inwarded: number;
  status: RecordStatus;
  lastUpdated: string;
  lines: GRNLine[];
}

export interface MaterialLabel {
  grnLineId?: string;
  labelUid: string;
  grnNumber: string;
  materialNumber: string;
  description: string;
  quantity: number;
  uom: string;
  batch: string;
  grnDate: string;
  binSequence: string;
  status: RecordStatus;
  printCount: number;
  generatedAt: string;
  issuedAt?: string | undefined;
  issuedBy?: string | undefined;
}

export interface ImportRowResult {
  id: string;
  grnNumber: string;
  lineItem: number;
  materialNumber: string;
  description: string;
  quantity: number;
  previousQuantity?: number | undefined;
  issuedQuantity?: number | undefined;
  packingStandard: number;
  batch: string;
  plant: string;
  status: RecordStatus;
  reason?: string | undefined;
}

export interface ImportBatch {
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
  status: RecordStatus;
  durationSeconds: number;
  fileHash: string;
  identificationStrategy: string;
  mappingTemplate: string;
}

export interface MaterialTransaction {
  id: string;
  timestamp: string;
  type:
    | "Inward"
    | "Issue"
    | "Label Generated"
    | "Label Printed"
    | "Cancel"
    | "Block"
    | "Unblock"
    | "Adjustment"
    | "Reprint"
    | "GRN Imported"
    | "Stored";
  labelUid?: string;
  grnNumber: string;
  materialNumber: string;
  quantity: number;
  station: string;
  operator: string;
  status: RecordStatus;
}

export interface InventoryRow {
  materialNumber: string;
  description: string;
  grnNumber: string;
  received: number;
  labelled: number;
  inwarded: number;
  issued: number;
  available: number;
  blocked: number;
  packingStandard: number;
}

export interface Station {
  id?: string;
  code: string;
  name: string;
  type: "Issue Station" | "Inward Station" | "General Station";
  location: string;
  status: "Active" | "Inactive";
  device: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  entity: string;
  entityId: string;
  device: string;
  ip: string;
  status: "Success" | "Failed";
  oldValues: Record<string, string | number>;
  newValues: Record<string, string | number>;
  metadata: Record<string, string>;
}

export interface GRNRevision {
  id: string;
  grnNumber: string;
  materialNumber: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
  status: RecordStatus;
  note?: string | undefined;
}

export interface IdentificationStrategy {
  id: "A" | "B" | "C" | "D";
  name: string;
  fields: string[];
}

export interface TraceStep {
  title: string;
  date: string;
  time: string;
  user: string;
  station: string;
  status: RecordStatus;
}

export interface TraceResult {
  labelUid: string;
  materialNumber: string;
  description: string;
  grnNumber: string;
  quantity: number;
  uom: string;
  batch: string;
  currentStatus: RecordStatus;
  steps: TraceStep[];
}

export interface DashboardData {
  kpis: {
    key: string;
    label: string;
    value: number;
    suffix?: string | undefined;
    trend: number;
    tooltip: string;
    icon: string;
  }[];
  receivedVsIssued: { day: string; received: number; issued: number }[];
  topMaterials: { material: string; qty: number }[];
  importTrend: { day: string; grns: number }[];
  labelStatus: { name: string; value: number }[];
  activity: { id: string; text: string; user: string; time: string; type: string }[];
}
