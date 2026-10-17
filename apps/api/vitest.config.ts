/**
 * File: apps/api/vitest.config.ts
 * Purpose: Vitest settings for the API: a global setup that starts one SeaweedFS (S3) container for the run, long
 * timeouts for container start-up, and the 80% line-coverage floor from docs/SPEC.md.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.mjs"],
    globalSetup: ["test/helpers/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/release.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 80 },
    },
  },
});
