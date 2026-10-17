/**
 * File: apps/web/playwright.config.ts
 * Purpose: Playwright end-to-end settings. Starts `pnpm dev` from the repo root (web + API) unless it is
 * already running, and runs every spec on desktop Chrome and a 390px phone viewport.
 *
 * Functions:
 * - none
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "pnpm --dir ../.. dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
