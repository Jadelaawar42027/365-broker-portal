/**
 * File: apps/api/test/health.test.ts
 * Purpose: Checks that the API answers GET /health, the path Railway uses as its healthcheck.
 *
 * Functions:
 * - none
 */
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadApiEnv } from "../src/env";

const app = buildApp(loadApiEnv({ NODE_ENV: "test" }));

afterAll(() => app.close());

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
  });
});
