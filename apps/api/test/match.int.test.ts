/**
 * File: apps/api/test/match.int.test.ts
 * Purpose: Integration tests for lead matching against a real Postgres, with the six matching sample brokers and a stand-in
 * for Claude: the API-key check (Bearer or X-API-Key), the exact reply shape the 365 Yachts AI expects (dry-run GHL ids
 * left out), ranking for the three sample leads with HEALTH_SOURCE none and mock, the tag-overlap fallback when Claude
 * fails, hard-filter exclusions logged to match_log, do-not-mention content never leaking, recording listed, off-list and
 * "none" choices (and the weekly cap they feed), persona saves re-extracting tags only when the text changed, admin
 * overrides, re-extract, the backfill and the scoring weights.
 *
 * Functions:
 * - brokerIdFor(email): the broker id of a sample broker.
 * - match(lead, headers): POSTs a lead to /api/match with the API key; returns the response.
 * - choose(matchId, body): POSTs a choice for a match with the API key; returns the response.
 * - setEnv(changes): changes the running app's environment for one test.
 * - judgeFit(lead, candidates): the stand-in fit judge: 95 for veterans, 85 for Spanish-speaking finance brokers, 10 otherwise, with a reason that names a do-not-mention topic.
 */
import {
  auditLog,
  brokerPersonaTags,
  brokers,
  matchLog,
  seedMatchSamples,
  users,
  MATCH_SAMPLE_FIXTURE_MODEL,
} from "@bp/db";
import {
  emptyPersonaTags,
  matchResponseSchema,
  type FitJudgement,
  type LeadProfile,
  type MatchRequestInput,
  type MatchResponse,
} from "@bp/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_LEADS } from "../scripts/sample-leads";
import type { FitCandidate, MatchAi } from "../src/services/match/claude";
import { createTestContext, OWNER, type TestContext } from "./helpers/context";

const API_KEY = "test-match-api-key-1234567890";
const [VETERAN_LEAD, SPANISH_LEAD, CRUISER_LEAD] = SAMPLE_LEADS as [MatchRequestInput, MatchRequestInput, MatchRequestInput];

let ctx: TestContext;
let owner: string;
const ids: Record<string, string> = {};

async function judgeFit(_lead: LeadProfile, candidates: FitCandidate[]): Promise<FitJudgement[]> {
  return candidates.map((candidate) => {
    const veteran = candidate.tags.backgroundTags?.some((entry) => entry.tag === "veteran") ?? false;
    const finance = candidate.tags.backgroundTags?.some((entry) => entry.tag === "finance_real_estate") ?? false;
    return {
      brokerId: candidate.brokerId,
      backgroundScore: veteran ? 95 : finance ? 85 : 10,
      buyerTypeScore: null,
      avoidConflict: false,
      reason: veteran ? "Navy veteran like the lead; both went through a divorce" : null,
    };
  });
}

const fakeAi = {
  model: "fake-claude",
  extractPersonaTags: vi.fn(async (_markdown: string) => ({ ...emptyPersonaTags(), followUpStyle: "chaser" as const, maxLeadsPerWeek: 2 })),
  judgeFit: vi.fn(judgeFit),
} satisfies MatchAi;

function brokerIdFor(email: string): string {
  return ids[email]!;
}

async function match(lead: MatchRequestInput, headers: Record<string, string> = { authorization: `Bearer ${API_KEY}` }) {
  return ctx.call("POST", "/api/match", { body: lead, headers });
}

async function choose(matchId: string, body: Record<string, unknown>) {
  return ctx.call("POST", `/api/match/${matchId}/choice`, { body, headers: { "x-api-key": API_KEY } });
}

function setEnv(changes: Record<string, unknown>) {
  Object.assign(ctx.app.deps.env as Record<string, unknown>, changes);
}

beforeAll(async () => {
  ctx = await createTestContext({ env: { MATCH_API_KEY: API_KEY }, matchAi: fakeAi });
  owner = await ctx.login(OWNER.email, OWNER.password);
  await ctx.db.transaction((tx) => seedMatchSamples(tx, { now: new Date(), password: null, reviewedBy: null }));
  const rows = await ctx.db.select({ id: brokers.id, email: users.email }).from(brokers).innerJoin(users, eq(users.id, brokers.userId));
  for (const row of rows) ids[row.email] = row.id;
  await ctx.db.update(brokers).set({ ghlUserId: "ghl-tom-1" }).where(eq(brokers.id, brokerIdFor("tom.brennan@example.com")));
  await ctx.db.update(brokers).set({ ghlUserId: "dry-run-ghl-marcus" }).where(eq(brokers.id, brokerIdFor("marcus.bell@example.com")));
});
afterAll(async () => {
  await ctx?.close();
});
beforeEach(() => {
  setEnv({ HEALTH_SOURCE: "none", MATCH_API_KEY: API_KEY });
  fakeAi.judgeFit.mockImplementation(judgeFit);
  fakeAi.extractPersonaTags.mockClear();
});

describe("POST /api/match authentication", () => {
  it("accepts the key as Authorization: Bearer or as X-API-Key", async () => {
    expect((await match(VETERAN_LEAD)).statusCode).toBe(200);
    expect((await match(VETERAN_LEAD, { "x-api-key": API_KEY })).statusCode).toBe(200);
    expect((await match(VETERAN_LEAD, { authorization: "Bearer wrong", "x-api-key": API_KEY })).statusCode).toBe(200);
  });

  it("rejects a missing or wrong key with 401", async () => {
    expect((await match(VETERAN_LEAD, {})).statusCode).toBe(401);
    expect((await match(VETERAN_LEAD, { "x-api-key": "wrong" })).statusCode).toBe(401);
    expect((await match(VETERAN_LEAD, { authorization: API_KEY })).statusCode).toBe(401);
    expect((await ctx.call("POST", "/api/match/00000000-0000-0000-0000-000000000000/choice", { body: { brokerId: null } })).statusCode).toBe(401);
  });

  it("answers 503 when MATCH_API_KEY isn't set", async () => {
    setEnv({ MATCH_API_KEY: undefined });
    const response = await match(VETERAN_LEAD);
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("matching_not_configured");
  });

  it("validates the lead", async () => {
    expect((await match({ name: "No id" } as MatchRequestInput)).statusCode).toBe(400);
    expect((await match({ ...VETERAN_LEAD, priority: "Urgent" as never })).statusCode).toBe(400);
  });
});

describe("POST /api/match results", () => {
  it("returns exactly the shape the bot expects, best match first", async () => {
    const response = await match(VETERAN_LEAD);
    const body = response.json() as MatchResponse;
    expect(Object.keys(body).sort()).toEqual(["brokers", "matchId"]);
    expect(matchResponseSchema.parse(body)).toEqual(body);
    for (const broker of body.brokers) {
      expect(Object.keys(broker).every((key) => ["id", "name", "score", "breakdown", "reasons", "flags", "ghlUserId"].includes(key))).toBe(true);
      expect(Object.keys(broker.breakdown).sort()).toEqual(["availability", "fit", "performance"]);
      expect(broker.reasons.length).toBeLessThanOrEqual(2);
    }
    expect(body.brokers.map((broker) => broker.name)).toEqual(["Tom Brennan", "Marcus Bell", "Derek Lang"]);
  });

  it("sends ghlUserId only when it is a real GoHighLevel id, never a dry-run placeholder", async () => {
    const { brokers: ranked } = (await match(VETERAN_LEAD)).json() as MatchResponse;
    expect(ranked.find((broker) => broker.name === "Tom Brennan")?.ghlUserId).toBe("ghl-tom-1");
    expect(ranked.find((broker) => broker.name === "Marcus Bell")).not.toHaveProperty("ghlUserId");
    expect(ranked.find((broker) => broker.name === "Derek Lang")).not.toHaveProperty("ghlUserId");
  });

  it("with HEALTH_SOURCE none, leaves performance null and flags health_not_live; the empty persona is flagged no_persona", async () => {
    const { brokers: ranked } = (await match(VETERAN_LEAD)).json() as MatchResponse;
    for (const broker of ranked) {
      expect(broker.breakdown.performance).toBeNull();
      expect(broker.flags).toContain("health_not_live");
    }
    const derek = ranked.find((broker) => broker.name === "Derek Lang")!;
    expect(derek.flags).toContain("no_persona");
    expect(derek.breakdown.fit).toBeNull();
  });

  it("with HEALTH_SOURCE mock, gives every broker a stable performance score", async () => {
    setEnv({ HEALTH_SOURCE: "mock" });
    const first = (await match(VETERAN_LEAD)).json() as MatchResponse;
    const second = (await match(VETERAN_LEAD)).json() as MatchResponse;
    for (const broker of first.brokers) {
      expect(broker.breakdown.performance).toEqual(expect.any(Number));
      expect(broker.flags).not.toContain("health_not_live");
    }
    expect(second.brokers.map((broker) => broker.breakdown.performance)).toEqual(first.brokers.map((broker) => broker.breakdown.performance));
  });

  it("never sends do-not-mention content, even when Claude's reason contains it", async () => {
    const response = await match(VETERAN_LEAD);
    expect(response.body).not.toMatch(/divorce/i);
    const tom = (response.json() as MatchResponse).brokers[0]!;
    expect(tom.reasons[0]).toBe("Fellow Navy veteran");
  });

  it("filters by language and boat type, and logs the exclusions, weights and full breakdown to match_log", async () => {
    const body = (await match(SPANISH_LEAD)).json() as MatchResponse;
    expect(body.brokers.map((broker) => broker.name)).toEqual(["Carlos Ruiz"]);
    expect(body.brokers[0]!.reasons).toContain("Speaks Spanish (native)");
    const [logged] = await ctx.db.select().from(matchLog).where(eq(matchLog.id, body.matchId));
    expect(logged).toMatchObject({ contactId: "sample-lead-spanish", leadName: "Ana Morales", healthSource: "none", fitMethod: "claude" });
    expect(logged!.weights).toEqual({ fit: 45, performance: 35, availability: 20, followUpPoints: 10 });
    const excluded = Object.fromEntries(logged!.excluded.map((entry) => [entry.brokerId, entry.reasons]));
    expect(excluded[brokerIdFor("tom.brennan@example.com")]).toContain("language");
    expect(excluded[brokerIdFor("marcus.bell@example.com")]).toEqual(["price_band", "boat_type"]);
    expect(JSON.stringify(logged!.recommendations)).not.toContain("Carlos Ruiz");
    expect(logged!.recommendations[0]).toMatchObject({ brokerId: brokerIdFor("carlos.ruiz@example.com"), breakdown: { fit: { parts: expect.any(Object) } } });
  });

  it("falls back to tag overlap when the Claude call fails", async () => {
    fakeAi.judgeFit.mockRejectedValueOnce(new Error("overloaded"));
    const body = (await match(VETERAN_LEAD)).json() as MatchResponse;
    expect(body.brokers[0]!.name).toBe("Tom Brennan");
    expect(body.brokers[0]!.flags).toContain("fit_from_tag_overlap");
    const [logged] = await ctx.db.select({ fitMethod: matchLog.fitMethod }).from(matchLog).where(eq(matchLog.id, body.matchId));
    expect(logged!.fitMethod).toBe("tag_overlap");
  });

  it("puts the light-touch sailor first for the nurture cruising lead", async () => {
    const body = (await match(CRUISER_LEAD)).json() as MatchResponse;
    expect(body.brokers[0]!.name).toBe("Grace Whitfield");
    expect(body.brokers[0]!.reasons[0]).toMatch(/^Shared background: /);
    expect(body.brokers[0]!.reasons[1]).toBe("Works catamarans in the $250k–$750k range");
    expect(body.brokers[0]!.score).toBeGreaterThan(50);
  });
});

describe("POST /api/match/:matchId/choice", () => {
  it("records a listed pick with who picked it, the GHL id, name and the bot's timestamp", async () => {
    const { matchId, brokers: ranked } = (await match(VETERAN_LEAD)).json() as MatchResponse;
    const tom = ranked[0]!;
    const response = await choose(matchId, {
      brokerId: tom.id,
      pickedBy: "Karim",
      timestamp: "2026-11-25T15:00:00.000Z",
      brokerName: tom.name,
      ghlUserId: tom.ghlUserId,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, brokerId: tom.id, fromRecommendations: true, offList: false });
    const [logged] = await ctx.db.select().from(matchLog).where(eq(matchLog.id, matchId));
    expect(logged).toMatchObject({ chosenBrokerId: tom.id, chosenBy: "Karim", chosenGhlUserId: "ghl-tom-1", chosenBrokerName: "Tom Brennan", chosenOffList: false });
    expect(logged!.choiceTimestamp?.toISOString()).toBe("2026-11-25T15:00:00.000Z");
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, matchId), eq(auditLog.action, "match.choice_recorded")));
    expect(audits).toHaveLength(1);
  });

  it("links an off-list pick through brokers.ghl_user_id", async () => {
    const { matchId } = (await match(SPANISH_LEAD)).json() as MatchResponse;
    const response = await choose(matchId, { brokerId: null, offList: true, pickedBy: "Shelly", timestamp: new Date().toISOString(), brokerName: "Tom Brennan", ghlUserId: "ghl-tom-1" });
    expect(response.json()).toMatchObject({ brokerId: brokerIdFor("tom.brennan@example.com"), fromRecommendations: false, offList: true });
  });

  it("records an off-list pick it can't link without failing", async () => {
    const { matchId } = (await match(SPANISH_LEAD)).json() as MatchResponse;
    const response = await choose(matchId, { brokerId: null, offList: true, pickedBy: "Shelly", brokerName: "Martin Somebody", ghlUserId: "ghl-unknown" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ brokerId: null, offList: true });
    const [logged] = await ctx.db.select().from(matchLog).where(eq(matchLog.id, matchId));
    expect(logged).toMatchObject({ chosenBrokerId: null, chosenGhlUserId: "ghl-unknown", chosenBrokerName: "Martin Somebody", chosenOffList: true });
    expect(logged!.chosenAt).not.toBeNull();
  });

  it("records 'none' with no broker", async () => {
    const { matchId } = (await match(SPANISH_LEAD)).json() as MatchResponse;
    const response = await choose(matchId, { brokerId: null, pickedBy: "Karim", timestamp: new Date().toISOString() });
    expect(response.json()).toMatchObject({ ok: true, brokerId: null, fromRecommendations: false, offList: false });
    const [logged] = await ctx.db.select().from(matchLog).where(eq(matchLog.id, matchId));
    expect(logged).toMatchObject({ chosenBrokerId: null, chosenBy: "Karim", chosenGhlUserId: null });
  });

  it("answers 404 for an unknown match and 400 for a malformed id", async () => {
    expect((await choose("00000000-0000-0000-0000-000000000000", { brokerId: null, pickedBy: "Karim" })).statusCode).toBe(404);
    expect((await choose("not-a-uuid", { brokerId: null })).statusCode).toBe(400);
  });

  it("counts picks against the weekly lead cap, so a full broker is excluded", async () => {
    const grace = brokerIdFor("grace.whitfield@example.com");
    for (let i = 0; i < 2; i += 1) {
      const { matchId } = (await match(CRUISER_LEAD)).json() as MatchResponse;
      await choose(matchId, { brokerId: grace, pickedBy: "Karim", brokerName: "Grace Whitfield" });
    }
    const body = (await match(CRUISER_LEAD)).json() as MatchResponse;
    expect(body.brokers.map((broker) => broker.id)).not.toContain(grace);
    const [logged] = await ctx.db.select({ excluded: matchLog.excluded }).from(matchLog).where(eq(matchLog.id, body.matchId));
    expect(logged!.excluded).toContainEqual({ brokerId: grace, reasons: ["at_capacity"] });
  });
});

describe("persona tags", () => {
  it("re-extracts after a persona save only when the text changed, and clears tags for an empty persona", async () => {
    const derek = brokerIdFor("derek.lang@example.com");
    const save = (markdown: string) => ctx.call("PUT", `/v1/admin/brokers/${derek}/persona`, { cookie: owner, body: { markdown } });
    expect((await save("# Persona: Derek Lang\n\n## Background\nFormer Army medic.")).statusCode).toBe(200);
    await ctx.app.deps.background.settle();
    expect(fakeAi.extractPersonaTags).toHaveBeenCalledTimes(1);
    const [row] = await ctx.db.select().from(brokerPersonaTags).where(eq(brokerPersonaTags.brokerId, derek));
    expect(row).toMatchObject({ followUpStyle: "chaser", maxLeadsPerWeek: 2, extractionModel: "fake-claude", extractionError: null });
    await save("# Persona: Derek Lang\n\n## Background\nFormer Army medic.\n");
    await ctx.app.deps.background.settle();
    expect(fakeAi.extractPersonaTags).toHaveBeenCalledTimes(1);
    const view = (await ctx.call("GET", `/v1/admin/brokers/${derek}/persona-tags`, { cookie: owner })).json();
    expect(view).toMatchObject({ status: "current", aiConfigured: true, effective: { followUpStyle: "chaser" } });
    await save("");
    await ctx.app.deps.background.settle();
    const cleared = (await ctx.call("GET", `/v1/admin/brokers/${derek}/persona-tags`, { cookie: owner })).json();
    expect(cleared).toMatchObject({ status: "no_persona", extracted: null });
    const actions = (await ctx.db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.entityId, derek))).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["persona_tags.extracted", "persona_tags.cleared"]));
  });

  it("keeps the old tags and records the error when extraction fails", async () => {
    const marcus = brokerIdFor("marcus.bell@example.com");
    fakeAi.extractPersonaTags.mockRejectedValueOnce(new Error("Claude declined the persona extraction request."));
    const refreshed = (await ctx.call("POST", `/v1/admin/brokers/${marcus}/persona-tags/refresh`, { cookie: owner })).json();
    expect(refreshed.outcome).toBe("failed");
    expect(refreshed.view).toMatchObject({ status: "failed", extractionModel: MATCH_SAMPLE_FIXTURE_MODEL, effective: { followUpStyle: "wait_for_lead" } });
  });

  it("lets overrides win, audits them and clears them again", async () => {
    const tom = brokerIdFor("tom.brennan@example.com");
    const patch = (body: unknown) => ctx.call("PATCH", `/v1/admin/brokers/${tom}/persona-tags`, { cookie: owner, body });
    const set = await patch({ set: { followUpStyle: "wait_for_lead", languages: [{ language: "Español", fluency: "fluent" }] } });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toMatchObject({
      overrides: { followUpStyle: "wait_for_lead", languages: [{ language: "spanish", fluency: "fluent" }] },
      effective: { followUpStyle: "wait_for_lead" },
      extracted: { followUpStyle: "chaser" },
    });
    const spanish = (await match(SPANISH_LEAD)).json() as MatchResponse;
    expect(spanish.brokers.map((broker) => broker.id)).toContain(tom);
    const cleared = await patch({ clear: ["followUpStyle", "languages"] });
    expect(cleared.json()).toMatchObject({ overrides: {}, effective: { followUpStyle: "chaser" } });
    expect((await patch({ set: { maxLeadsPerWeek: 0 } })).statusCode).toBe(400);
    expect((await patch({})).statusCode).toBe(400);
    const audits = await ctx.db.select().from(auditLog).where(and(eq(auditLog.entityId, tom), eq(auditLog.action, "persona_tags.overrides_updated")));
    expect(audits).toHaveLength(2);
  });

  it("is admin-only", async () => {
    const broker = await ctx.createBroker({ email: "nosy.broker@example.com", status: "active" });
    const tom = brokerIdFor("tom.brennan@example.com");
    expect((await ctx.call("GET", `/v1/admin/brokers/${tom}/persona-tags`, { cookie: broker.cookie })).statusCode).toBe(403);
    expect((await ctx.call("PUT", "/v1/admin/match/weights", { cookie: broker.cookie, body: { fit: 1, performance: 1, availability: 1, followUpPoints: 1 } })).statusCode).toBe(403);
  });

  it("backfills every broker with a persona in the background", async () => {
    const response = await ctx.call("POST", "/v1/admin/persona-tags/backfill", { cookie: owner, body: { force: true } });
    expect(response.json()).toEqual({ started: true, brokers: 5 });
    await ctx.app.deps.background.settle();
    const rows = await ctx.db.select({ model: brokerPersonaTags.extractionModel }).from(brokerPersonaTags);
    expect(rows.filter((row) => row.model === "fake-claude").length).toBe(5);
  });
});

describe("scoring weights", () => {
  it("start at the defaults and take effect on the next match after a change", async () => {
    const before = (await ctx.call("GET", "/v1/admin/match/weights", { cookie: owner })).json();
    expect(before).toMatchObject({ isDefault: true, weights: { fit: 45, performance: 35, availability: 20, followUpPoints: 10 } });
    const saved = await ctx.call("PUT", "/v1/admin/match/weights", { cookie: owner, body: { fit: 60, performance: 30, availability: 10, followUpPoints: 5 } });
    expect(saved.json()).toMatchObject({ isDefault: false, updatedByName: OWNER.name, weights: { fit: 60 } });
    expect((await ctx.call("PUT", "/v1/admin/match/weights", { cookie: owner, body: { fit: 0, performance: 0, availability: 0, followUpPoints: 5 } })).statusCode).toBe(400);
    const { matchId } = (await match(VETERAN_LEAD)).json() as MatchResponse;
    const [logged] = await ctx.db.select({ weights: matchLog.weights }).from(matchLog).where(eq(matchLog.id, matchId));
    expect(logged!.weights).toEqual({ fit: 60, performance: 30, availability: 10, followUpPoints: 5 });
  });
});
