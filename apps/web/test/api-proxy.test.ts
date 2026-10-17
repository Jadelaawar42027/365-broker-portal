/**
 * File: apps/web/test/api-proxy.test.ts
 * Purpose: Unit tests for the API proxy rewrite builder used by next.config.ts.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { buildApiProxyRewrites } from "../src/lib/api-proxy";

describe("buildApiProxyRewrites", () => {
  it("forwards /v1 and /api/auth to the API", () => {
    expect(buildApiProxyRewrites("http://localhost:4000")).toEqual([
      { source: "/v1/:path*", destination: "http://localhost:4000/v1/:path*" },
      { source: "/api/auth/:path*", destination: "http://localhost:4000/api/auth/:path*" },
    ]);
  });

  it("drops trailing slashes so paths are not doubled", () => {
    const [first] = buildApiProxyRewrites("http://api.railway.internal:8080/");
    expect(first?.destination).toBe("http://api.railway.internal:8080/v1/:path*");
  });

  it("rejects an invalid URL with the variable name", () => {
    expect(() => buildApiProxyRewrites("api:4000")).toThrow(/API_INTERNAL_URL/);
    expect(() => buildApiProxyRewrites("nonsense")).toThrow(/API_INTERNAL_URL/);
  });
});
