/**
 * File: apps/api/test/start-script.test.mjs
 * Purpose: Unit tests for scripts/start.mjs, the production start command shared by the Railway api and web services:
 * which app it picks from the service name, and what it runs.
 *
 * Functions:
 * - none
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandFor, pickService } from "../../../scripts/start.mjs";

describe("pickService", () => {
  it("reads the Railway service name, with BP_SERVICE as an override", () => {
    expect(pickService({ RAILWAY_SERVICE_NAME: "api" })).toBe("api");
    expect(pickService({ RAILWAY_SERVICE_NAME: "Web" })).toBe("web");
    expect(pickService({ RAILWAY_SERVICE_NAME: "broker-portal-api" })).toBe("api");
    expect(pickService({ RAILWAY_SERVICE_NAME: "web", BP_SERVICE: "api" })).toBe("api");
  });

  it("returns null when the name doesn't say which app", () => {
    expect(pickService({ RAILWAY_SERVICE_NAME: "postgres" })).toBeNull();
    expect(pickService({})).toBeNull();
  });
});

describe("commandFor", () => {
  it("runs the built API and next start on Railway's PORT, without pnpm in between", () => {
    const api = commandFor("api", {});
    expect(api.args).toEqual(["dist/server.js"]);
    expect(api.cwd.endsWith(path.join("apps", "api"))).toBe(true);
    const web = commandFor("web", { PORT: "8080" });
    expect(web.args).toEqual(["node_modules/next/dist/bin/next", "start", "--port", "8080"]);
    expect(web.cwd.endsWith(path.join("apps", "web"))).toBe(true);
  });
});
