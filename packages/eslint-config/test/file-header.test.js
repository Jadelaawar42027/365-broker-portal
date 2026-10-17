/**
 * File: packages/eslint-config/test/file-header.test.js
 * Purpose: Unit tests for the local file-header rules, run through ESLint's RuleTester on TypeScript sources.
 *
 * Functions:
 * - header(filePath, functionLines): builds a valid header comment for a test source file.
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";
import {
  headerListsFunctions,
  noCommentsOutsideHeader,
  requireFileHeader,
} from "../rules/file-header.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
});

const rootDir = "/repo";
const filename = "/repo/apps/api/src/example.ts";

function header(filePath, functionLines = [" * - none"]) {
  return [
    "/**",
    ` * File: ${filePath}`,
    " * Purpose: Example file.",
    " *",
    " * Functions:",
    ...functionLines,
    " */",
  ].join("\n");
}

ruleTester.run("require-file-header", requireFileHeader, {
  valid: [
    {
      code: `${header("apps/api/src/example.ts")}\nexport const value = 1;`,
      filename,
      options: [{ rootDir }],
    },
  ],
  invalid: [
    {
      code: "export const value = 1;",
      filename,
      options: [{ rootDir }],
      errors: [{ messageId: "missing" }],
    },
    {
      code: `${header("apps/api/src/other.ts")}\nexport const value = 1;`,
      filename,
      options: [{ rootDir }],
      errors: [{ messageId: "wrongPath" }],
    },
    {
      code: "/**\n * File: apps/api/src/example.ts\n */\nexport const value = 1;",
      filename,
      options: [{ rootDir }],
      errors: [{ messageId: "missingSection" }, { messageId: "missingSection" }],
    },
    {
      code: `export const value = 1;\n${header("apps/api/src/example.ts")}`,
      filename,
      options: [{ rootDir }],
      errors: [{ messageId: "missing" }],
    },
  ],
});

ruleTester.run("no-comments-outside-header", noCommentsOutsideHeader, {
  valid: [{ code: `${header("apps/api/src/example.ts")}\nexport const value = 1;`, filename }],
  invalid: [
    {
      code: `${header("apps/api/src/example.ts")}\nexport const value = 1; // one`,
      filename,
      errors: [{ messageId: "inline" }],
    },
    {
      code: `${header("apps/api/src/example.ts")}\n/* block */\nexport const value = 1;`,
      filename,
      errors: [{ messageId: "inline" }],
    },
    {
      code: "// no header\nexport const value = 1;",
      filename,
      errors: [{ messageId: "inline" }],
    },
  ],
});

ruleTester.run("header-lists-functions", headerListsFunctions, {
  valid: [
    {
      code: `${header("x.ts", [" * - add(a, b): sums.", " * - Box.constructor(): builds a box.", " * - Box.open(): opens.", " * - plugin.create(ctx): builds."])}
export function add(a: number, b: number) { return a + b; }
class Box { constructor() {} open() { return true; } }
export const plugin = { create(ctx: unknown) { return ctx; } };
export { Box };`,
      filename,
    },
    {
      code: `${header("x.ts")}\nexport const value = 1;`,
      filename,
    },
    {
      code: `${header("x.ts")}\nexport const schema = z.string().refine((value: string) => value.length > 0);`,
      filename,
    },
    {
      code: `${header("x.ts")}\nexport const table = pgTable("t", {}, (columns: unknown) => [columns]);`,
      filename,
    },
    {
      code: `${header("x.ts", [" * - make(): builds.", " * - make.run(): nested method.", " * - helper(n): inner helper."])}
export function make() { const helper = (n: number) => n; return { run() { return helper(1); } }; }`,
      filename,
    },
  ],
  invalid: [
    {
      code: `${header("x.ts")}\nexport const double = (n: number) => n * 2;`,
      filename,
      errors: [{ messageId: "unlisted" }],
    },
    {
      code: `${header("x.ts", [" * - Box.open(): opens."])}\nexport class Box { constructor() {} open() { return 1; } }`,
      filename,
      errors: [{ messageId: "unlisted" }],
    },
    {
      code: `${header("x.ts")}\nexport const cached = cache(async () => 1);`,
      filename,
      errors: [{ messageId: "unlisted" }],
    },
    {
      code: `${header("x.ts", [" * - gone(): removed."])}\nexport const value = 1;`,
      filename,
      errors: [{ messageId: "stale" }],
    },
  ],
});
