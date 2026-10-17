/**
 * File: packages/shared/test/env-file.test.ts
 * Purpose: Unit tests for the root .env discovery helper, using throwaway folders on disk.
 *
 * Functions:
 * - makeRepo(withEnv): creates a temp folder that looks like the repo root, optionally with a .env file; returns its path.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRootEnvFile, loadRootEnvFile } from "../src/node/env-file";

const created: string[] = [];

function makeRepo(withEnv: boolean): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bp-env-"));
  created.push(root);
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  fs.mkdirSync(path.join(root, "apps", "api"), { recursive: true });
  if (withEnv) fs.writeFileSync(path.join(root, ".env"), "BP_TEST_ENV_VALUE=from-file\n");
  return root;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.BP_TEST_ENV_VALUE;
});

describe("findRootEnvFile", () => {
  it("finds the .env at the workspace root from a nested folder", () => {
    const root = makeRepo(true);
    expect(findRootEnvFile(path.join(root, "apps", "api"))).toBe(path.join(root, ".env"));
  });

  it("returns null when the root has no .env", () => {
    const root = makeRepo(false);
    expect(findRootEnvFile(path.join(root, "apps", "api"))).toBeNull();
  });
});

describe("loadRootEnvFile", () => {
  it("loads variables from the root .env", () => {
    const root = makeRepo(true);
    expect(loadRootEnvFile(path.join(root, "apps", "api"))).toBe(true);
    expect(process.env.BP_TEST_ENV_VALUE).toBe("from-file");
  });

  it("does nothing and returns false without a file", () => {
    const root = makeRepo(false);
    expect(loadRootEnvFile(root)).toBe(false);
    expect(process.env.BP_TEST_ENV_VALUE).toBeUndefined();
  });
});
