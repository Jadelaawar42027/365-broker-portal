/**
 * File: apps/web/src/lib/api-proxy.ts
 * Purpose: Builds the Next.js rewrite rules that forward API and auth calls to the Fastify service,
 * which keeps the session cookie first-party on the web domain (SPEC D10).
 *
 * Functions:
 * - buildApiProxyRewrites(apiBaseUrl): validates the API URL and returns rewrite rules for /v1/* and /api/auth/*.
 */
export type ProxyRewrite = { source: string; destination: string };

export function buildApiProxyRewrites(apiBaseUrl: string): ProxyRewrite[] {
  let base: URL;
  try {
    base = new URL(apiBaseUrl);
  } catch {
    throw new Error(`API_INTERNAL_URL is not a valid URL: "${apiBaseUrl}"`);
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error(`API_INTERNAL_URL must use http or https: "${apiBaseUrl}"`);
  }
  const origin = base.toString().replace(/\/+$/, "");
  return [
    { source: "/v1/:path*", destination: `${origin}/v1/:path*` },
    { source: "/api/auth/:path*", destination: `${origin}/api/auth/:path*` },
  ];
}
