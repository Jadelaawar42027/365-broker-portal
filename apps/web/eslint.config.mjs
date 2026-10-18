/**
 * File: apps/web/eslint.config.mjs
 * Purpose: ESLint config for the Next.js app: the workspace base config plus the Next.js, React Hooks
 * and accessibility (jsx-a11y) rules, with browser globals for client code. Uploaded training videos have no caption
 * files yet (SPEC Phase G decisions), so the caption rule is off for that one player.
 *
 * Functions:
 * - none
 */
import { baseConfig } from "@bp/eslint-config";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: ["src/components/training/lesson-video.tsx", "src/components/broker/step-videos.tsx"],
    rules: { "jsx-a11y/media-has-caption": "off" },
  },
]);
