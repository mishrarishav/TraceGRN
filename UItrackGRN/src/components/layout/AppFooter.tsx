import { AppLogo } from "@/components/layout/AppLogo";
import { useBranding } from "@/hooks/use-branding";

export function AppFooter() {
  const { branding } = useBranding();

  return (
    <footer
      data-testid="app-footer"
      className="z-30 mb-[57px] flex h-10 shrink-0 items-center justify-between gap-3 border-t border-border bg-background/95 px-3 text-[10px] text-muted-foreground backdrop-blur md:mb-0 sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AppLogo compact className="h-5 w-5" />
        <span className="truncate font-semibold text-foreground">TrackGRN</span>
        <span className="num rounded bg-surface px-1.5 py-0.5">v{branding.version}</span>
      </div>

      {branding.clientLogoDataUrl || branding.clientName ? (
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          {branding.clientLogoDataUrl ? (
            <img
              src={branding.clientLogoDataUrl}
              alt={branding.clientName ? `${branding.clientName} logo` : "Client logo"}
              className="h-6 max-w-24 object-contain"
            />
          ) : null}
          {branding.clientName ? (
            <span className="max-w-40 truncate font-medium text-foreground">
              {branding.clientName}
            </span>
          ) : null}
        </div>
      ) : null}

      <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 tracking-wide">
        Powered by <strong className="text-foreground">MAHAD GLOBUS INDIA</strong>
      </span>
    </footer>
  );
}
