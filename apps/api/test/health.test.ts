/**
 * File: apps/api/test/health.test.ts
 * Purpose: Checks GET /health (Railway's healthcheck), the JSON 404 for unknown routes and the OpenAPI docs page.
 *
 * Functions:
 * - none
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "./helpers/context";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx?.close());

describe("GET /health", () => {
  it("returns 200 when the database answers", async () => {
    const response = await ctx.call("GET", "/health");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const response = await ctx.call("GET", "/nope");
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "not_found" });
  });
});

describe("OpenAPI", () => {
  it("serves Swagger UI at /docs and lists the routes", async () => {
    expect((await ctx.call("GET", "/docs")).statusCode).toBeLessThan(400);
    const spec = (await ctx.call("GET", "/docs/json")).json() as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/v1/me/steps", "/v1/admin/brokers", "/v1/admin/broker-steps/{id}/approve"]),
    );
    expect(Object.keys(spec.paths)).not.toContain("/health");
  });
});
