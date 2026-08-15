import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ScannerInput({
  onScan,
  busy,
  hint = "Scan QR / Label UID",
  tone = "primary",
  suggestion,
}: {
  onScan: (code: string) => void;
  busy?: boolean;
  hint?: string;
  tone?: "primary" | "success";
  suggestion?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    ref.current?.focus();
  }, [busy]);

  const submit = () => {
    if (!value.trim() || busy) return;
    onScan(value.trim());
    setValue("");
  };

  return (
    <div
      className={cn(
        "panel relative overflow-hidden p-4 sm:p-7",
        tone === "success" ? "border-success/30" : "border-primary/30",
      )}
    >
      <div className="flex flex-col items-center gap-3 sm:gap-5">
        <div className="relative flex h-16 w-16 items-center justify-center sm:h-24 sm:w-24">
          <motion.span
            className="absolute inset-0 rounded-full bg-primary/15"
            animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient text-primary-foreground shadow-[var(--shadow-float)] sm:h-16 sm:w-16">
            <ScanLine className="h-6 w-6 sm:h-8 sm:w-8" />
          </span>
        </div>

        <div className="w-full">
          <label className="mb-2 block text-center text-sm font-medium text-muted-foreground">
            {hint}
          </label>
          <Input
            ref={ref}
            value={value}
            autoFocus
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="LBL-00000000"
            className="num h-14 rounded-xl border-2 text-center text-lg tracking-widest sm:h-20 sm:text-2xl"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={submit}
              disabled={busy}
              className="h-14 flex-1 text-base font-semibold"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Lookup"}
            </Button>
            {suggestion ? (
              <Button
                variant="outline"
                className="num h-14 text-sm"
                onClick={() => {
                  setValue("");
                  onScan(suggestion);
                }}
                disabled={busy}
              >
                Simulate {suggestion}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Hardware keyboard-wedge ready · press Enter to submit
          </p>
        </div>
      </div>
    </div>
  );
}
