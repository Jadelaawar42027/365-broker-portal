/**
 * File: apps/web/next.config.ts
 * Purpose: Next.js settings. Loads the repo-root .env in development, compiles the TypeScript workspace
 * packages, and proxies /v1/* and /api/auth/* to the API so the browser only talks to this origin (SPEC D10).
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
  async rewrites() {
    return buildApiProxyRewrites(process.env.API_INTERNAL_URL ?? "http://localhost:4000");
  },
};

export default nextConfig;
