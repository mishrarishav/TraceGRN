import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PrintOutput = "Printer" | "PDF";

export function PrintOutputSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: PrintOutput;
  onChange: (value: PrintOutput) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1 text-xs font-medium text-muted-foreground">
      Print output
      <Select
        value={value}
        onValueChange={(next) => onChange(next as PrintOutput)}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Print output" className="mt-1 h-9 min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Printer">Printer</SelectItem>
          <SelectItem value="PDF">PDF</SelectItem>
        </SelectContent>
      </Select>
    </label>
  );
}
