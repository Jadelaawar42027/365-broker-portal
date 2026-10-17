/**
 * File: apps/api/test/env.test.ts
 * Purpose: Unit tests for the API environment parser.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { loadApiEnv } from "../src/env";

describe("loadApiEnv", () => {
  it("applies local defaults", () => {
    expect(loadApiEnv({})).toEqual({
      NODE_ENV: "development",
      API_HOST: "0.0.0.0",
      PORT: 4000,
      LOG_LEVEL: "info",
    });
  });

  it("reads PORT as a number, as Railway sets it", () => {
    expect(loadApiEnv({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("lists every invalid variable", () => {
    expect(() => loadApiEnv({ PORT: "abc", NODE_ENV: "staging" })).toThrow(/PORT.*NODE_ENV|NODE_ENV.*PORT/);
  });
});
