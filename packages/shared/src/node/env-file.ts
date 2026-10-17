/**
 * File: packages/shared/src/node/env-file.ts
 * Purpose: Loads the repo-root .env file into process.env for local development. In production
 * (Railway) there is no file and variables come from the service settings, so a missing file is fine.
 *
 * Functions:
 * - findRootEnvFile(startDir): walks up from startDir to the folder holding pnpm-workspace.yaml; returns the path of its .env file if it exists, else null.
 * - loadRootEnvFile(startDir): loads that .env file with process.loadEnvFile (existing variables win); returns true if a file was loaded.
 */
import fs from "node:fs";
import path from "node:path";

export function findRootEnvFile(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      const envPath = path.join(dir, ".env");
      return fs.existsSync(envPath) ? envPath : null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadRootEnvFile(startDir: string = process.cwd()): boolean {
  const envPath = findRootEnvFile(startDir);
  if (!envPath) return false;
  process.loadEnvFile(envPath);
  return true;
}
