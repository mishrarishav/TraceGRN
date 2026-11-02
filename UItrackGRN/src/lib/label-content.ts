import type { MaterialLabel } from "@/types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLabelDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) return `${dateOnly[3]!}-${dateOnly[2]!}-${dateOnly[1]!.slice(-2)}`;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${pad(parsed.getDate())}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getFullYear() % 100)}`;
}

/** Encode only the durable identifier, including when an old label has a legacy payload. */
export function labelQrPayload(label: MaterialLabel) {
  return label.labelUid.trim().toUpperCase();
}

export function createTestLabel(): MaterialLabel {
  const now = new Date();
  return {
    labelUid: `TEST-${now.getTime()}`,
    grnNumber: "TEST-NO-DB",
    materialNumber: "M06030952",
    description: "TRACKGRN ZEBRA PRINTER TEST",
    quantity: 200,
    uom: "PC",
    batch: "TEST-BATCH",
    grnDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    binSequence: "01 of 1",
    status: "Generated",
    printCount: 0,
    generatedAt: now.toISOString(),
  };
}
