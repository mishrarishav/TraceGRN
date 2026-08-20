import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { Download, WifiOff, X } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { AppFooter } from "@/components/layout/AppFooter";
import { Button } from "@/components/ui/button";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const clearPrompt = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <TopHeader />
        {offline ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <WifiOff className="h-4 w-4" />
            <span className="font-medium">You are offline.</span>
            <span className="text-destructive/80">
              Issue transactions require an active connection.
            </span>
          </div>
        ) : null}
        {installPrompt ? (
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2 text-sm">
            <Download className="h-4 w-4 text-primary" />
            <span className="flex-1 truncate">
              Install <span className="font-semibold">TrackGRN</span> for a full-screen scanner
              experience.
            </span>
            <Button size="sm" variant="outline" onClick={() => void install()}>
              Install App
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setInstallPrompt(null)}
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          data-testid="app-content-scroll"
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6"
        >
          {children}
        </motion.main>
        <AppFooter />
      </div>
      <MobileNav />
    </div>
  );
}
