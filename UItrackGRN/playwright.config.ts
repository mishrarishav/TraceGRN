import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/documentation.spec.ts",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
  },
  webServer: [
    {
      command: "bin\\Debug\\net8.0\\APItrackGRN.Api.exe --urls http://127.0.0.1:5025",
      cwd: "../APItrackGRN/src/APItrackGRN.Api",
      url: "http://127.0.0.1:5025/health/live",
      env: { ASPNETCORE_ENVIRONMENT: "Testing" },
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173/login",
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
