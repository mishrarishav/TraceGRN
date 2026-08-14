import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Factory, KeyRound, Loader2, LogIn, ScanBarcode, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — TraceFlow Material Traceability" },
      { name: "description", content: "Sign in to TraceFlow to manage GRN import, labelling and material issue." },
      { property: "og:title", content: "Sign in — TraceFlow" },
      { property: "og:description", content: "Material traceability for manufacturing operations." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => {
      toast.success("Welcome back, Rahul", { description: "Signed in to Plant 1000 · Shift A" });
      void navigate({ to: "/" });
    }, 700);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="brand-gradient absolute inset-0 opacity-90" />
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(0deg, transparent 24%, rgba(255,255,255,.35) 25%, rgba(255,255,255,.35) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.35) 75%, rgba(255,255,255,.35) 76%, transparent 77%), linear-gradient(90deg, transparent 24%, rgba(255,255,255,.35) 25%, rgba(255,255,255,.35) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.35) 75%, rgba(255,255,255,.35) 76%, transparent 77%)",
            backgroundSize: "64px 64px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <ScanBarcode className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-semibold">TraceFlow</p>
              <p className="text-xs opacity-80">Material Traceability System</p>
            </div>
          </div>
          <div className="max-w-md">
            <h2 className="text-3xl leading-tight font-semibold">
              Every pack traced — from SAP GRN to the production line.
            </h2>
            <p className="mt-4 text-sm opacity-85">
              QR labelling, inward verification, store-to-production issue and complete revision history in one
              plant-floor grade application.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {[
                ["867", "Rows / import"],
                ["142", "Labels / day"],
                ["100%", "Traceability"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl bg-white/10 p-3 backdrop-blur">
                  <p className="num text-xl font-semibold">{v}</p>
                  <p className="text-[11px] opacity-80">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs opacity-75">
            <Factory className="h-4 w-4" /> Plant 1000 · Store Operations
          </p>
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-background p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground">
              <ScanBarcode className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">TraceFlow</p>
              <p className="text-xs text-muted-foreground">Material Traceability System</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use your plant credentials to continue.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <UserRound className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 pl-9"
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <KeyRound className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-9"
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox defaultChecked /> Remember me
              </label>
              <button type="button" className="text-sm text-primary hover:underline">
                Need help?
              </button>
            </div>
            <Button type="submit" className="h-11 w-full gap-2 text-base" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Login
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-border bg-surface p-4">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <ShieldCheck className="h-3.5 w-3.5" /> Demo credentials
            </p>
            <div className="num mt-2 grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Username</span>
              <span className="font-medium">admin</span>
              <span className="text-muted-foreground">Password</span>
              <span className="font-medium">admin123</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
