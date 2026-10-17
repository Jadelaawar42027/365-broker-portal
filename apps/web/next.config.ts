/**
 * File: apps/web/next.config.ts
 * Purpose: Next.js settings. Loads the repo-root .env in development, compiles the TypeScript workspace
 * packages, and proxies /v1/* and /api/auth/* to the API so the browser only talks to this origin (SPEC D10).
 * The proxy body limit is raised above the 10 MB upload limit so proxy-mode uploads (SPEC D11) fit. NEXT_DIST_DIR lets
 * the end-to-end test server build into its own folder next to a running `pnpm dev`.
 *
 * Functions:
 * - rewrites(): returns the API proxy rules built from API_INTERNAL_URL (defaults to the local API on port 4000).
 */
import { loadRootEnvFile } from "@bp/shared/node";
import type { NextConfig } from "next";
import { buildApiProxyRewrites } from "./src/lib/api-proxy";

loadRootEnvFile();

const nextConfig: NextConfig = {
  transpilePackages: ["@bp/shared"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { proxyClientMaxBodySize: "12mb" },
  async rewrites() {
    return buildApiProxyRewrites(process.env.API_INTERNAL_URL ?? "http://localhost:4000");
  },
};

export default nextConfig;
