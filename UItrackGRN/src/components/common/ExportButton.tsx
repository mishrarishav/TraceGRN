import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadReport } from "@/services/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExportButton({ name = "records" }: { name?: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const reportId = name.startsWith("grn-")
    ? "grn"
    : name.startsWith("trace-")
      ? "trace"
      : name === "grns"
        ? "grn"
        : name === "audit-log"
          ? "audit"
          : name === "materials"
            ? "materials"
            : name === "import-history" || name === "import-preview"
              ? "imports"
              : name;
  const exportFile = async (format: "xlsx" | "csv") => {
    setIsExporting(true);
    try {
      const fileName = await downloadReport(reportId, { format });
      toast.success("Report downloaded", { description: fileName });
    } catch (error) {
      toast.error("Export failed", {
        description: error instanceof Error ? error.message : "Unable to generate report",
      });
    } finally {
      setIsExporting(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={isExporting}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void exportFile("xlsx")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportFile("csv")}>
          <FileText className="mr-2 h-4 w-4" /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
