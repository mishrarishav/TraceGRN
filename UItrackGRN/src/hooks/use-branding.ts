import { useQuery } from "@tanstack/react-query";
import { APP_VERSION, getSystemBranding, type SystemBranding } from "@/services/api";

const fallbackBranding: SystemBranding = {
  appName: "TrackGRN",
  version: APP_VERSION,
  clientName: "",
  clientLogoDataUrl: "",
};

export function useBranding() {
  const query = useQuery({
    queryKey: ["branding"],
    queryFn: getSystemBranding,
    staleTime: 60_000,
    retry: 1,
    enabled: typeof window !== "undefined",
  });

  return { ...query, branding: query.data ?? fallbackBranding };
}
