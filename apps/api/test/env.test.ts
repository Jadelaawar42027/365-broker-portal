/**
 * File: apps/api/test/env.test.ts
 * Purpose: Unit tests for the API environment parser, including the lead-matching variables.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { loadApiEnv } from "../src/env";

const required = {
  DATABASE_URL: "postgres://bp:bp@localhost:5432/broker_portal",
  BETTER_AUTH_SECRET: "x".repeat(32),
  S3_BUCKET: "broker-files",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("loadApiEnv", () => {
  it("applies local defaults", () => {
    const env = loadApiEnv(required);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 4000,
      WEB_ORIGIN: "http://localhost:3000",
      STORAGE_UPLOAD_MODE: "direct",
      S3_FORCE_PATH_STYLE: false,
      SUPPORT_CONTACT_NAME: "365 Yachts AI",
      SUPPORT_WHATSAPP_NUMBER: "19547381542",
    });
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("reads PORT as a number and trims a trailing slash from WEB_ORIGIN", () => {
    const env = loadApiEnv({ ...required, PORT: "8080", WEB_ORIGIN: "https://team.365yachts.org/" });
    expect(env.PORT).toBe(8080);
    expect(env.WEB_ORIGIN).toBe("https://team.365yachts.org");
  });

  it("treats an empty RESEND_API_KEY as not set", () => {
    expect(loadApiEnv({ ...required, RESEND_API_KEY: "  " }).RESEND_API_KEY).toBeUndefined();
  });

  it("lists every invalid variable", () => {
    expect(() => loadApiEnv({ PORT: "abc" })).toThrow(/PORT.*DATABASE_URL|DATABASE_URL.*PORT/s);
  });

  it("rejects a short auth secret and plain http in production", () => {
    expect(() => loadApiEnv({ ...required, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadApiEnv({ ...required, NODE_ENV: "production", WEB_ORIGIN: "http://example.com" })).toThrow(
      /WEB_ORIGIN: must use https/,
    );
  });

  it("defaults lead matching to off: no Claude key, no API key, health none, the default model", () => {
    const env = loadApiEnv(required);
    expect(env).toMatchObject({ HEALTH_SOURCE: "none", MATCH_MODEL: "claude-opus-5-5" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.MATCH_API_KEY).toBeUndefined();
    expect(env.COACH_DATABASE_URL).toBeUndefined();
    expect(loadApiEnv({ ...required, HEALTH_SOURCE: "", MATCH_MODEL: "" })).toMatchObject({ HEALTH_SOURCE: "none", MATCH_MODEL: "claude-opus-5-5" });
  });

  it("reads the matching variables and rejects a short API key or an unknown health source", () => {
    const env = loadApiEnv({
      ...required,
      HEALTH_SOURCE: "coach",
      COACH_DATABASE_URL: "postgres://coach_portal:x@localhost:5432/broker_portal",
      MATCH_API_KEY: "k".repeat(24),
      MATCH_MODEL: "claude-sonnet-5-5",
    });
    expect(env).toMatchObject({ HEALTH_SOURCE: "coach", MATCH_MODEL: "claude-sonnet-5-5" });
    expect(env.COACH_DATABASE_URL).toContain("coach_portal");
    expect(() => loadApiEnv({ ...required, MATCH_API_KEY: "short" })).toThrow(/MATCH_API_KEY/);
    expect(() => loadApiEnv({ ...required, HEALTH_SOURCE: "live" })).toThrow(/HEALTH_SOURCE/);
  });

  it("refuses mock health in production", () => {
    expect(() =>
      loadApiEnv({ ...required, NODE_ENV: "production", WEB_ORIGIN: "https://team.365yachts.org", HEALTH_SOURCE: "mock" }),
    ).toThrow(/HEALTH_SOURCE: mock is for local development/);
  });
});
