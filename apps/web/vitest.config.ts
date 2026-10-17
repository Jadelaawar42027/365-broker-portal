/**
 * File: apps/web/vitest.config.ts
 * Purpose: Vitest settings for the web app's unit tests; keeps Playwright specs in e2e/ out of Vitest.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
