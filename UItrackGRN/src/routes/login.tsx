import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { KeyRound, Loader2, LogIn, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AppLogo } from "@/components/layout/AppLogo";
import { useBranding } from "@/hooks/use-branding";
import { ApiError, isAuthenticated, login } from "@/services/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — TrackGRN Material Traceability" },
      {
        name: "description",
        content: "Sign in to TrackGRN to manage GRN import, labelling and material issue.",
      },
      { property: "og:title", content: "Sign in — TrackGRN" },
      {
        property: "og:description",
        content: "Material traceability for manufacturing operations.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { branding } = useBranding();

  useEffect(() => {
    setHydrated(true);
    if (isAuthenticated()) void navigate({ to: "/" });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const session = await login(username, password);
      toast.success(`Welcome back, ${session.user.fullName}`, {
        description: `${session.user.roleDisplay} · authenticated against TrackGRN API`,
      });
      void navigate({ to: "/" });
    } catch (error) {
      toast.error("Sign in failed", {
        description: error instanceof ApiError ? error.message : "API is unavailable.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-dvh overflow-hidden lg:grid-cols-2">
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
          <div className="w-full max-w-sm rounded-2xl bg-white/95 p-4 shadow-[var(--shadow-float)]">
            <AppLogo priority className="w-full bg-transparent" />
            <p className="mt-1 text-center text-xs font-medium text-slate-600">
              Material Traceability System · v{branding.version}
            </p>
          </div>
          <div className="max-w-md">
            <h2 className="text-3xl leading-tight font-semibold">
              Every pack traced — from SAP GRN to the production line.
            </h2>
            <p className="mt-4 text-sm opacity-85">
              QR labelling, inward verification, store-to-production issue and complete revision
              history in one plant-floor grade application.
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
          <span aria-hidden="true" />
        </div>
      </div>

      <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-background p-6 pb-16">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 lg:hidden">
            <AppLogo priority className="w-56 shadow-sm" />
            <p className="mt-1 text-xs text-muted-foreground">
              Material Traceability System · v{branding.version}
            </p>
          </div>

          {branding.clientLogoDataUrl || branding.clientName ? (
            <div
              data-testid="login-client-branding"
              className="mb-6 flex min-h-20 items-center justify-center gap-3 rounded-xl border border-border bg-surface/70 p-3"
            >
              {branding.clientLogoDataUrl ? (
                <img
                  src={branding.clientLogoDataUrl}
                  alt={branding.clientName ? `${branding.clientName} logo` : "Client logo"}
                  className="max-h-14 max-w-36 object-contain"
                />
              ) : null}
              {branding.clientName ? (
                <p className="max-w-44 text-center text-sm font-semibold">{branding.clientName}</p>
              ) : null}
            </div>
          ) : null}

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your plant credentials to continue.
          </p>

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
                  required
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
                  required
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
            <Button
              type="submit"
              className="h-11 w-full gap-2 text-base"
              disabled={!hydrated || busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}{" "}
              Login
            </Button>
          </form>
        </motion.div>
        <div
          data-testid="login-footer"
          className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-between gap-3 border-t border-border bg-background/95 px-4 text-[10px] text-muted-foreground backdrop-blur"
        >
          <span>
            <strong className="text-foreground">TrackGRN</strong>{" "}
            <span className="num">v{branding.version}</span>
          </span>
          <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 tracking-wide">
            Powered by <strong className="text-foreground">MAHAD GLOBUS INDIA</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
