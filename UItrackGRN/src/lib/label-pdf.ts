import { jsPDF } from "jspdf";
import qrcode from "qrcode-generator";
import { formatLabelDate, labelQrPayload } from "@/lib/label-content";
import type { MaterialLabel } from "@/types";

interface LabelPdfBranding {
  clientName?: string;
  clientLogoDataUrl?: string;
}

const PAGE_SIZE: [number, number] = [100, 75];
qrcode.stringToBytes = (value) => Array.from(new TextEncoder().encode(value));

function text(value: string) {
  return value.replace(/\p{Cc}/gu, " ").replace(/[\u2013\u2014]/g, "-");
}

/** One vector label per physical 100 x 75 mm page; no printer/API calls. */
export function createLabelPdf(labels: MaterialLabel[], branding: LabelPdfBranding = {}) {
  if (!labels.length) throw new Error("Select at least one label to export.");
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: PAGE_SIZE,
    compress: true,
  });
  pdf.setProperties({ title: "TrackGRN Material Labels", creator: "TrackGRN" });
  pdf.viewerPreferences({ PrintScaling: "None" });

  labels.forEach((label, index) => {
    if (index > 0) pdf.addPage(PAGE_SIZE, "landscape");
    pdf.setTextColor(0);
    pdf.setDrawColor(150);
    pdf.setLineWidth(0.2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("TrackGRN", 5, 9);
    if (branding.clientLogoDataUrl) {
      const image = pdf.getImageProperties(branding.clientLogoDataUrl);
      const scale = Math.min(25 / image.width, 7 / image.height);
      const width = image.width * scale;
      pdf.addImage(branding.clientLogoDataUrl, 95 - width, 3, width, image.height * scale);
    } else if (branding.clientName) {
      pdf.setFontSize(8);
      const name = text(branding.clientName);
      pdf.setFontSize(Math.min(8, (8 * 45) / Math.max(45, pdf.getTextWidth(name))));
      pdf.text(name, 95, 9, { align: "right" });
    }
    pdf.line(5, 12, 95, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("MATERIAL LABEL", 5, 16);

    const qr = qrcode(0, "M");
    qr.addData(labelQrPayload(label));
    qr.make();
    const modules = qr.getModuleCount();
    const quietZone = 4;
    const cell = 34 / (modules + quietZone * 2);
    pdf.setFillColor("#000000");
    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        if (qr.isDark(row, column)) {
          pdf.rect(5 + (column + quietZone) * cell, 20 + (row + quietZone) * cell, cell, cell, "F");
        }
      }
    }

    let y = 21;
    const field = (name: string, value: string, bold = false) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.text(name, 44, y);
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(8);
      const content = text(value);
      pdf.setFontSize(Math.min(8, (8 * 51) / Math.max(51, pdf.getTextWidth(content))));
      pdf.text(content, 44, y + 3.5);
      y += 8;
    };
    field("GRN", label.grnNumber);
    field("Material", label.materialNumber, true);
    field("Quantity", `${label.quantity} ${label.uom}`, true);
    field("Batch", label.batch || "-");
    field("GRN Date / Pack", `${formatLabelDate(label.grnDate)} / ${label.binSequence}`);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    const description: string[] = pdf.splitTextToSize(text(label.description), 34);
    const lines = description.slice(0, 3);
    if (description.length > 3) lines[2] = `${lines[2]!.slice(0, -3)}...`;
    if (lines.length) pdf.text(lines, 5, 57, { lineHeightFactor: 1.15 });
    pdf.setFontSize(6);
    pdf.text(`Label ID: ${text(label.labelUid)}`, 5, 67, { maxWidth: 90 });
    pdf.line(5, 69, 95, 69);
    pdf.setFontSize(6);
    pdf.text("Material Traceability System - Sanand Plant", 50, 72, { align: "center" });
  });

  return pdf;
}

/** Open synchronously from the click handler so the browser permits the new window. */
export function openLabelPdf(labels: MaterialLabel[], branding: LabelPdfBranding = {}) {
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("Allow pop-ups for TrackGRN to open the label PDF.");
  preview.opener = null;
  let objectUrl: string | undefined;
  try {
    const pdf = createLabelPdf(labels, branding);
    const fileName =
      labels.length === 1
        ? `TrackGRN-${labels[0]!.labelUid.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`
        : `TrackGRN-labels-${labels.length}.pdf`;
    objectUrl = URL.createObjectURL(pdf.output("blob"));
    preview.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>TrackGRN Label PDF</title>
      <style>body{margin:0;background:#e5e7eb;color:#111827;font-family:Arial,sans-serif}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;background:white;flex-wrap:wrap}
      p{margin:4px 0 0;font-size:12px;color:#4b5563}a{background:#0f766e;color:white;border-radius:6px;padding:10px 16px;text-decoration:none;white-space:nowrap}
      iframe{width:100%;height:calc(100dvh - 90px);border:0;display:block}</style></head>
      <body><header><div><strong>Label PDF</strong><p id="details"></p>
      <p>Print at Actual size / 100% using 100 x 75 mm paper.</p></div><a id="download">Download PDF</a></header>
      <iframe title="Label PDF preview"></iframe></body></html>`);
    preview.document.close();
    preview.document.getElementById("details")!.textContent =
      `${labels.length} label(s) - one label per page`;
    const download = preview.document.getElementById("download") as HTMLAnchorElement;
    download.href = objectUrl;
    download.download = fileName;
    preview.document.querySelector("iframe")!.src = objectUrl;
    // Keep the Blob alive while the preview is open, including after route changes.
    const url = objectUrl;
    const closeCheck = window.setInterval(() => {
      if (preview.closed) {
        URL.revokeObjectURL(url);
        window.clearInterval(closeCheck);
      }
    }, 1000);
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    preview.close();
    throw error;
  }
}
