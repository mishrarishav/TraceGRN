import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "**/ui-business-offline.spec.ts",
    "**/label-scan-offline.spec.ts",
    "**/label-table-offline.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer:
    process.env["TRACKGRN_OFFLINE_EXTERNAL_SERVER"] === "1"
      ? undefined
      : {
          command: "npm run dev -- --host 127.0.0.1 --port 4174",
          url: "http://127.0.0.1:4174/login",
          reuseExistingServer: false,
          timeout: 120_000,
        },
});
