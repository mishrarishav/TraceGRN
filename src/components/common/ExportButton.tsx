import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExportButton({ name = "records" }: { name?: string }) {
  const fire = (kind: string) =>
    toast.success(`${kind} export queued`, { description: `${name} will download shortly (demo mode).` });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => fire("Excel")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => fire("CSV")}>
          <FileText className="mr-2 h-4 w-4" /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => fire("Print")}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
