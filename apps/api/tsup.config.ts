/**
 * File: apps/api/tsup.config.ts
 * Purpose: Builds the API (dist/server.js) and the pre-deploy release command (dist/release.js) as ESM bundles. Workspace packages
 * (@bp/*) are bundled in because they ship TypeScript source; npm dependencies stay external.
 *
 * Functions:
 * - none
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/release.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@bp\//],
});
