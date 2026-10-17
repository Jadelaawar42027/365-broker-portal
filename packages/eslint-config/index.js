/**
 * File: packages/eslint-config/index.js
 * Purpose: Shared ESLint flat config for every workspace package: JS and TypeScript recommended rules
 * plus the local "bp" rules that enforce the CLAUDE.md file-header comment rule.
 *
 * Functions:
 * - none
 */
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import {
  headerListsFunctions,
  noCommentsOutsideHeader,
  requireFileHeader,
} from "./rules/file-header.js";

export const bpPlugin = {
  meta: { name: "eslint-plugin-bp" },
  rules: {
    "require-file-header": requireFileHeader,
    "no-comments-outside-header": noCommentsOutsideHeader,
    "header-lists-functions": headerListsFunctions,
  },
};

export const baseConfig = defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/.next/**",
    "**/.next-e2e/**",
    "**/coverage/**",
    "**/node_modules/**",
    "**/next-env.d.ts",
    "**/drizzle/**",
    "**/playwright-report/**",
    "**/test-results/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    plugins: { bp: bpPlugin },
    rules: {
      "bp/require-file-header": "error",
      "bp/no-comments-outside-header": "error",
      "bp/header-lists-functions": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
]);
