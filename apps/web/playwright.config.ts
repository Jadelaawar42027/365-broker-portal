/**
 * File: apps/web/playwright.config.ts
 * Purpose: Playwright end-to-end settings. Resets the isolated broker_portal_e2e database, then starts the same dev
 * servers as `pnpm dev` on their own ports (API 4100, web 3100) so a normal `pnpm dev` can keep running. Emails go to
 * an outbox folder the tests read. Desktop journeys run at 1280px; the mobile journey runs at 390px.
 *
 * Functions:
 * - none
 */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_PORT = 3100;
const API_PORT = 4100;
export const E2E_OUTBOX = path.join(here, "test-results", "e2e-outbox");

const E2E_ENV: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://bp:bp@localhost:5432/broker_portal_e2e",
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
  API_INTERNAL_URL: `http://localhost:${API_PORT}`,
  PORT: String(API_PORT),
  LOG_LEVEL: "warn",
  BETTER_AUTH_SECRET: "e2e-secret-that-is-long-enough-for-better-auth",
  S3_ENDPOINT: "http://localhost:8333",
  S3_REGION: "us-east-1",
  S3_BUCKET: "broker-files",
  S3_ACCESS_KEY_ID: "bp-local-key",
  S3_SECRET_ACCESS_KEY: "bp-local-secret",
  S3_FORCE_PATH_STYLE: "true",
  STORAGE_UPLOAD_MODE: "direct",
  E2E_CORS_ORIGINS: `http://localhost:${WEB_PORT},http://localhost:3000`,
  RESEND_API_KEY: "",
  EMAIL_OUTBOX_DIR: E2E_OUTBOX,
  SUPPORT_CONTACT_NAME: "Shelly",
  SUPPORT_WHATSAPP_NUMBER: "15614459241",
  SEED_OWNER_NAME: "Shelly Melcher",
  SEED_OWNER_EMAIL: "owner@e2e.test",
  SEED_OWNER_PASSWORD: "e2e-owner-password",
  SEED_SAMPLE_PASSWORD: "sample-broker-pass",
  NEXT_DIST_DIR: ".next-e2e",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "desktop",
      testIgnore: /\.mobile\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /\.mobile\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: "pnpm --dir ../.. --filter @bp/db e2e:reset && pnpm --dir ../.. --filter @bp/api dev",
      url: `http://localhost:${API_PORT}/health`,
      env: E2E_ENV,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `pnpm exec next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: E2E_ENV,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
