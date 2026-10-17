/**
 * File: packages/db/vitest.config.ts
 * Purpose: Vitest settings for @bp/db. Integration tests start a Postgres container, so hooks get a generous timeout.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
