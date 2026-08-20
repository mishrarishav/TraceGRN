import { defineConfig, devices } from "@playwright/test";

const apiOrigin = process.env["TRACKGRN_API_ORIGIN"] ?? "http://127.0.0.1:5025";
const uiPort = process.env["TRACKGRN_UI_PORT"] ?? "4173";
const uiOrigin = `http://127.0.0.1:${uiPort}`;
const apiExecutable =
  process.env["TRACKGRN_API_EXECUTABLE"] ?? "bin\\Debug\\net8.0\\APItrackGRN.Api.exe";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: [
    ...(process.env["TRACKGRN_GENERATE_DOCUMENTATION"] === "1" ? [] : ["**/documentation.spec.ts"]),
    "**/ui-business-offline.spec.ts",
  ],
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  timeout: process.env["TRACKGRN_VISIBLE_DEMO"] === "1" ? 90_000 : 30_000,
  expect: { timeout: 7_500 },
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: uiOrigin,
    launchOptions: process.env["TRACKGRN_VISIBLE_DEMO"] === "1" ? { slowMo: 650 } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
  },
  webServer: [
    {
      command: `${apiExecutable} --urls ${apiOrigin}`,
      cwd: "../APItrackGRN/src/APItrackGRN.Api",
      url: `${apiOrigin}/health/live`,
      env: { ASPNETCORE_ENVIRONMENT: "Testing" },
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${uiPort}`,
      url: `${uiOrigin}/login`,
      env: { TRACKGRN_API_PROXY: apiOrigin },
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "zebra-mc9300",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 480, height: 800 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
