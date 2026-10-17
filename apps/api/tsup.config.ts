/**
 * File: apps/api/tsup.config.ts
 * Purpose: Builds the API into one ESM bundle in dist/ for `pnpm --filter @bp/api start`. Workspace packages
 * (@bp/*) are bundled in because they ship TypeScript source; npm dependencies stay external.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@bp\//],
});
