/**
 * File: apps/api/src/plugins/origin-check.ts
 * Purpose: A CSRF guard for /v1: state-changing requests sent by a browser must come from the web app's origin.
 * Requests with no Origin header (server-to-server, tests) are allowed; session cookies are also SameSite=Lax.
 *
 * Functions:
 * - registerOriginCheck(app, webOrigin): rejects non-GET /v1 requests whose Origin header is not webOrigin.
 */
import type { FastifyInstance } from "fastify";
import { forbidden } from "../errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function registerOriginCheck(app: FastifyInstance, webOrigin: string): void {
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith("/v1/")) return;
    const origin = request.headers.origin;
    if (origin && origin !== webOrigin) {
      throw forbidden("This request did not come from the 365 Yachts portal.");
    }
  });
}
