// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const apiProxy = process.env["TRACKGRN_API_PROXY"] ?? "http://127.0.0.1:5025";
const githubPages = process.env["TRACKGRN_GITHUB_PAGES"] === "1";
const githubPagesBasePath = "/TraceGRN";

export default defineConfig({
  nitro: githubPages ? false : undefined,
  vite: {
    base: githubPages ? `${githubPagesBasePath}/` : "/",
    server: {
      proxy: {
        "/api": apiProxy,
        "/downloads": apiProxy,
        "/health": apiProxy,
      },
    },
  },
  tanstackStart: {
    router: githubPages ? { basepath: githubPagesBasePath } : undefined,
    spa: githubPages
      ? {
          enabled: true,
          maskPath: "/",
          prerender: { outputPath: "/404", crawlLinks: false },
        }
      : undefined,
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
