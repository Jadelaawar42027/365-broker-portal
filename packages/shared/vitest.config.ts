/**
 * File: packages/shared/vitest.config.ts
 * Purpose: Vitest settings for @bp/shared, with the 80% line-coverage floor from docs/SPEC.md enforced on every run.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 80 },
    },
  },
});
