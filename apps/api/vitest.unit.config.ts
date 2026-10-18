/**
 * File: apps/api/vitest.unit.config.ts
 * Purpose: Vitest settings for the API's unit tests only (`pnpm test:unit`): every test file except the *.int.test.ts
 * integration tests and health.test.ts (which starts the whole app with a database), without the global setup that
 * starts a storage container.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.mjs"],
    exclude: ["test/**/*.int.test.ts", "test/health.test.ts", "node_modules/**"],
  },
});
