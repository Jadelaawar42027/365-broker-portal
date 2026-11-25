/**
 * File: packages/shared/test/matching.test.ts
 * Purpose: Unit tests for lead-to-broker matching: persona-tag clean-up and overrides, lead parsing (budget, boat type,
 * background), the hard filters, scoring with and without health (HEALTH_SOURCE none and mock), brokers with no persona,
 * the follow-up modifier, the tag-overlap fallback, and that do-not-mention content never reaches a reason.
 *
 * Functions:
 * - tags(overrides): a full tag set with the given fields filled and the rest null.
 * - candidate(overrides): a match candidate with sensible defaults.
 * - lead(input): a lead profile from a partial match request.
 * - judgement(brokerId, overrides): a Claude fit judgement with sensible defaults.
 */
import { describe, expect, it } from "vitest";
import {
  applyHardFilters,
  cleanPersonaTags,
  combineFactors,
  containsDoNotMention,
  DEFAULT_MATCH_WEIGHTS,
  emptyPersonaTags,
  followUpAdjustment,
  hasAnyPersonaTag,
  inferLeadBackground,
  matchRequestSchema,
  matchWeightsSchema,
  mergePersonaTags,
  normalizeBoatType,
  normalizeLanguage,
  parseBudget,
  personaSourceText,
  personaTagsPatchSchema,
  priceBandFor,
  rankCandidates,
  scoreAvailability,
  scoreCandidate,
  tagOverlapJudgement,
  toLeadProfile,
  type FitJudgement,
  type MatchCandidate,
  type MatchRequestInput,
  type PersonaTags,
} from "../src";

function tags(overrides: Partial<PersonaTags> = {}): PersonaTags {
  return { ...emptyPersonaTags(), ...overrides };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    brokerId: "b-1",
    name: "Broker One",
    active: true,
    tags: tags({ languages: [{ language: "english", fluency: "native" }], maxLeadsPerWeek: 4 }),
    health: null,
    assignmentsLast7Days: 0,
    assignmentsLast14Days: 0,
    ...overrides,
  };
}

function lead(input: Partial<MatchRequestInput> = {}) {
  return toLeadProfile(matchRequestSchema.parse({ contactId: "c-1", name: "Lead", ...input }));
}

function judgement(brokerId: string, overrides: Partial<FitJudgement> = {}): FitJudgement {
  return { brokerId, backgroundScore: 90, buyerTypeScore: null, avoidConflict: false, reason: "Navy veteran like the lead", ...overrides };
}

const navyVet = tags({
  backgroundTags: [{ tag: "veteran", branch: "navy", detail: "Surface warfare officer" }, { tag: "sport_fisherman", branch: null, detail: null }],
  storyKeywords: ["Persian Gulf deployments", "teaching his kids to fish"],
  boatTypes: ["sportfish", "center_console"],
  priceBands: ["250k_750k", "750k_2m"],
  languages: [{ language: "english", fluency: "native" }],
  followUpStyle: "chaser",
  maxLeadsPerWeek: 4,
  doNotMention: ["his divorce"],
});

const pilot = tags({
  backgroundTags: [{ tag: "pilot", branch: null, detail: "777 captain" }],
  boatTypes: ["motor_yacht"],
  priceBands: ["750k_2m", "2m_5m"],
  languages: [{ language: "german", fluency: "native" }, { language: "english", fluency: "fluent" }],
  followUpStyle: "consistent",
  maxLeadsPerWeek: 3,
});

describe("persona tags", () => {
  it("normalises persona text and returns null for an empty persona", () => {
    expect(personaSourceText("  # Persona\r\nText  ")).toBe("# Persona\nText");
    expect(personaSourceText("   ")).toBeNull();
    expect(personaSourceText(null)).toBeNull();
  });

  it("cleans an extraction: empty lists become null, languages are normalised, a bad cap is dropped", () => {
    const cleaned = cleanPersonaTags(
      tags({
        storyKeywords: [" Gulf deployments ", "gulf deployments", ""],
        boatTypes: [],
        languages: [{ language: "Español", fluency: "native" }, { language: "es", fluency: "fluent" }],
        maxLeadsPerWeek: 500,
      }),
    );
    expect(cleaned.storyKeywords).toEqual(["Gulf deployments"]);
    expect(cleaned.boatTypes).toBeNull();
    expect(cleaned.languages).toEqual([{ language: "spanish", fluency: "native" }]);
    expect(cleaned.maxLeadsPerWeek).toBeNull();
  });

  it("strips do-not-mention topics out of every other field", () => {
    const cleaned = cleanPersonaTags(
      tags({
        storyKeywords: ["Rebuilt his life after the divorce", "Gulf deployments"],
        strengths: ["Negotiation"],
        backgroundTags: [{ tag: "veteran", branch: "navy", detail: "Left the Navy during his divorce" }],
        sellingStyle: "Talks openly about his divorce",
        doNotMention: ["his divorce"],
      }),
    );
    expect(cleaned.storyKeywords).toEqual(["Gulf deployments"]);
    expect(cleaned.backgroundTags?.[0]?.detail).toBeNull();
    expect(cleaned.sellingStyle).toBeNull();
    expect(cleaned.doNotMention).toEqual(["his divorce"]);
  });

  it("drops a branch on non-veteran tags", () => {
    const cleaned = cleanPersonaTags(tags({ backgroundTags: [{ tag: "pilot", branch: "air_force", detail: null }] }));
    expect(cleaned.backgroundTags).toEqual([{ tag: "pilot", branch: null, detail: null }]);
  });

  it("lets overrides win over extracted values, including an override to null", () => {
    const merged = mergePersonaTags(navyVet, { followUpStyle: "light_touch", boatTypes: null });
    expect(merged.followUpStyle).toBe("light_touch");
    expect(merged.boatTypes).toBeNull();
    expect(merged.priceBands).toEqual(navyVet.priceBands);
    expect(mergePersonaTags(null, { maxLeadsPerWeek: 2 }).maxLeadsPerWeek).toBe(2);
  });

  it("knows when a broker has no tags at all", () => {
    expect(hasAnyPersonaTag(emptyPersonaTags())).toBe(false);
    expect(hasAnyPersonaTag(null)).toBe(false);
    expect(hasAnyPersonaTag(tags({ maxLeadsPerWeek: 3 }))).toBe(true);
  });

  it("matches do-not-mention phrases and their significant words, ignoring filler words", () => {
    expect(containsDoNotMention("Going through a DIVORCE", ["his divorce"])).toBe(true);
    expect(containsDoNotMention("Shares the airline life", ["the airline she flew for"])).toBe(true);
    expect(containsDoNotMention("Has time this week", ["his time in prison"])).toBe(false);
    expect(containsDoNotMention("Anything", null)).toBe(false);
  });

  it("requires at least one override change in a PATCH", () => {
    expect(personaTagsPatchSchema.safeParse({}).success).toBe(false);
    expect(personaTagsPatchSchema.safeParse({ clear: ["boatTypes"] }).success).toBe(true);
    expect(personaTagsPatchSchema.safeParse({ clear: ["notAField"] }).success).toBe(false);
  });
});

describe("lead parsing", () => {
  it("reads budgets in dollars, k and M, using the highest figure in a range", () => {
    expect(parseBudget("$750k")).toBe(750_000);
    expect(parseBudget("1.2M")).toBe(1_200_000);
    expect(parseBudget("500k-1M")).toBe(1_000_000);
    expect(parseBudget("750,000")).toBe(750_000);
    expect(parseBudget(450000)).toBe(450_000);
    expect(parseBudget("flexible")).toBeNull();
    expect(parseBudget("12")).toBeNull();
    expect(parseBudget(null)).toBeNull();
  });

  it("puts amounts in the right price band", () => {
    expect(priceBandFor(249_999)).toBe("under_250k");
    expect(priceBandFor(250_000)).toBe("250k_750k");
    expect(priceBandFor(1_500_000)).toBe("750k_2m");
    expect(priceBandFor(3_000_000)).toBe("2m_5m");
    expect(priceBandFor(5_000_000)).toBe("5m_plus");
  });

  it("maps free-text boat types to the controlled list", () => {
    expect(normalizeBoatType("Sport Fish")).toBe("sportfish");
    expect(normalizeBoatType("center-console")).toBe("center_console");
    expect(normalizeBoatType("Leopard catamaran")).toBe("catamaran");
    expect(normalizeBoatType("express cruiser")).toBe("express_cruiser");
    expect(normalizeBoatType("110' superyacht")).toBe("superyacht");
    expect(normalizeBoatType("something nice")).toBeNull();
  });

  it("normalises language names and codes", () => {
    expect(normalizeLanguage("ES")).toBe("spanish");
    expect(normalizeLanguage(" Spanish ")).toBe("spanish");
    expect(normalizeLanguage("Deutsch")).toBe("german");
  });

  it("infers background tags and the military branch from free text", () => {
    expect(inferLeadBackground("Retired Navy chief who fishes offshore")).toEqual({ tags: ["veteran", "sport_fisherman", "retired_second_career"], branch: "navy" });
    expect(inferLeadBackground("Airline pilot for 20 years").tags).toEqual(["pilot"]);
    expect(inferLeadBackground(null)).toEqual({ tags: [], branch: null });
  });

  it("parses the request: priority in any case, defaults for topN and hot, nulls for blanks", () => {
    const request = matchRequestSchema.parse({ contactId: "c", name: "Lead", priority: "buy now", boat_type: "  ", language: null });
    expect(request.priority).toBe("Buy Now");
    expect(request.topN).toBe(4);
    expect(request.hot).toBe(false);
    expect(request.boat_type).toBeNull();
    expect(request.language).toBeNull();
    expect(matchRequestSchema.safeParse({ contactId: "c" }).success).toBe(false);
    expect(matchRequestSchema.safeParse({ contactId: "c", name: "L", priority: "Urgent" }).success).toBe(false);
  });

  it("treats Buy Now, Active and hot leads as urgent and Nurture, Low Priority and On Hold as nurture", () => {
    expect(lead({ priority: "Active" }).urgent).toBe(true);
    expect(lead({ priority: "Nurture", hot: true })).toMatchObject({ urgent: true, nurture: false });
    expect(lead({ priority: "On Hold" })).toMatchObject({ urgent: false, nurture: true });
    expect(lead({})).toMatchObject({ urgent: false, nurture: false });
  });
});

describe("hard filters", () => {
  it("excludes inactive brokers, wrong language, price band, boat type and full capacity", () => {
    const profile = lead({ language: "Spanish", budget: "$3M", boat_type: "sportfish" });
    const { eligible, excluded } = applyHardFilters(profile, [
      candidate({ brokerId: "inactive", active: false, tags: tags({ languages: [{ language: "spanish", fluency: "native" }] }) }),
      candidate({ brokerId: "english-only", tags: navyVet }),
      candidate({ brokerId: "basic-spanish", tags: tags({ languages: [{ language: "spanish", fluency: "basic" }] }) }),
      candidate({ brokerId: "unknown-languages", tags: tags({ boatTypes: ["sportfish"] }) }),
      candidate({
        brokerId: "full",
        tags: tags({ languages: [{ language: "spanish", fluency: "native" }], maxLeadsPerWeek: 2 }),
        assignmentsLast7Days: 2,
      }),
      candidate({ brokerId: "ok", tags: tags({ languages: [{ language: "spanish", fluency: "conversational" }], priceBands: ["2m_5m"], boatTypes: ["sportfish"] }) }),
    ]);
    expect(eligible.map((entry) => entry.brokerId)).toEqual(["ok"]);
    expect(Object.fromEntries(excluded.map((entry) => [entry.brokerId, entry.reasons]))).toEqual({
      inactive: ["not_active"],
      "english-only": ["language", "price_band"],
      "basic-spanish": ["language"],
      "unknown-languages": ["language"],
      full: ["at_capacity"],
    });
  });

  it("lets a broker with unknown coverage through for an English lead, flagged as unconfirmed", () => {
    const profile = lead({ language: "English", budget: 400_000, boat_type: "catamaran" });
    const { eligible } = applyHardFilters(profile, [candidate({ tags: tags({ followUpStyle: "chaser" }) })]);
    expect(eligible).toHaveLength(1);
    const scored = scoreCandidate(profile, eligible[0]!, null, DEFAULT_MATCH_WEIGHTS, false);
    expect(scored.flags).toEqual(expect.arrayContaining(["boat_type_unconfirmed", "price_band_unconfirmed", "language_unconfirmed"]));
  });

  it("never filters on fields the lead didn't give", () => {
    const { eligible } = applyHardFilters(lead({}), [candidate({ tags: null }), candidate({ brokerId: "b-2", tags: pilot })]);
    expect(eligible).toHaveLength(2);
  });
});

describe("scoring", () => {
  const veteranLead = lead({ lead_background: "Retired Navy chief, fishes offshore", budget: "$600k", boat_type: "sportfish", priority: "Buy Now" });

  it("with no health (HEALTH_SOURCE none) drops performance, renormalises fit and availability, and flags health_not_live", () => {
    const scored = scoreCandidate(veteranLead, candidate({ tags: navyVet }), judgement("b-1"), DEFAULT_MATCH_WEIGHTS, true);
    expect(scored.flags).toContain("health_not_live");
    expect(scored.breakdown.performance).toEqual({ score: null, weight: 0, followUpScore: null });
    expect(scored.breakdown.fit.weight).toBeCloseTo(69.2, 1);
    expect(scored.breakdown.availability.weight).toBeCloseTo(30.8, 1);
    expect(scored.breakdown.fit.score).toBe(Math.round((90 * 60 + 100 * 15 + 100 * 15) / 90));
    expect(scored.breakdown.availability.score).toBe(100);
    expect(scored.breakdown.followUp.points).toBe(10);
    expect(scored.score).toBe(100);
  });

  it("with health (HEALTH_SOURCE mock or coach) includes performance at its configured weight", () => {
    const scored = scoreCandidate(
      veteranLead,
      candidate({ tags: navyVet, health: { score: 40, followUpScore: 50 } }),
      judgement("b-1"),
      DEFAULT_MATCH_WEIGHTS,
      true,
    );
    expect(scored.flags).not.toContain("health_not_live");
    expect(scored.breakdown.performance).toEqual({ score: 40, weight: 35, followUpScore: 50 });
    const base = (93 * 45 + 40 * 35 + 100 * 20) / 100;
    expect(scored.score).toBe(Math.round(base + 5));
  });

  it("renormalises without fit and flags no_persona for a broker with no tags", () => {
    const scored = scoreCandidate(veteranLead, candidate({ tags: null, health: { score: 80, followUpScore: 60 } }), null, DEFAULT_MATCH_WEIGHTS, false);
    expect(scored.flags).toEqual(expect.arrayContaining(["no_persona", "no_capacity_set", "follow_up_unknown"]));
    expect(scored.breakdown.fit).toMatchObject({ score: null, weight: 0 });
    expect(scored.breakdown.performance.weight).toBe(100);
    expect(scored.score).toBe(Math.round(80 + 0.5 * ((60 - 50) / 50) * 10));
    expect(scored.reasons).toEqual([]);
  });

  it("scores 0 and flags nothing_to_score when no factor has data", () => {
    const scored = scoreCandidate(lead({}), candidate({ tags: null }), null, DEFAULT_MATCH_WEIGHTS, false);
    expect(scored.score).toBe(0);
    expect(scored.flags).toContain("nothing_to_score");
  });

  it("flags fit_not_scored when the lead gave nothing to match on", () => {
    const scored = scoreCandidate(lead({ priority: "Active" }), candidate({ tags: navyVet }), null, DEFAULT_MATCH_WEIGHTS, false);
    expect(scored.flags).toContain("fit_not_scored");
    expect(scored.breakdown.fit.score).toBeNull();
  });

  it("halves the background score and flags an avoid conflict from Claude", () => {
    const scored = scoreCandidate(veteranLead, candidate({ tags: navyVet }), judgement("b-1", { avoidConflict: true }), DEFAULT_MATCH_WEIGHTS, true);
    expect(scored.breakdown.fit.parts.background).toBe(45);
    expect(scored.flags).toContain("possible_avoid_conflict");
  });

  it("scores availability from the last 14 days against twice the weekly cap", () => {
    expect(scoreAvailability(tags({ maxLeadsPerWeek: 4 }), 0)).toBe(100);
    expect(scoreAvailability(tags({ maxLeadsPerWeek: 4 }), 2)).toBe(75);
    expect(scoreAvailability(tags({ maxLeadsPerWeek: 4 }), 12)).toBe(0);
    expect(scoreAvailability(tags({}), 1)).toBeNull();
  });

  it("uses only weights above zero and returns no base when nothing has data", () => {
    expect(combineFactors({ fit: 80, performance: null, availability: 50 }, { ...DEFAULT_MATCH_WEIGHTS, availability: 0 })).toEqual({
      base: 80,
      applied: { fit: 100, performance: 0, availability: 0 },
    });
    expect(combineFactors({ fit: null, performance: null, availability: null }, DEFAULT_MATCH_WEIGHTS).base).toBeNull();
    expect(matchWeightsSchema.safeParse({ fit: 0, performance: 0, availability: 0, followUpPoints: 5 }).success).toBe(false);
  });

  it("ranks the shared-background broker first and falls back to tag overlap where Claude gave no judgement", () => {
    const ranked = rankCandidates(
      veteranLead,
      [
        candidate({ brokerId: "pilot", name: "Pilot", tags: { ...pilot, boatTypes: ["sportfish"], priceBands: ["250k_750k"] } }),
        candidate({ brokerId: "vet", name: "Vet", tags: navyVet }),
      ],
      new Map([["pilot", judgement("pilot", { backgroundScore: 10, reason: null })]]),
      DEFAULT_MATCH_WEIGHTS,
    );
    expect(ranked.map((entry) => entry.brokerId)).toEqual(["vet", "pilot"]);
    expect(ranked[0]!.flags).toContain("fit_from_tag_overlap");
    expect(ranked[1]!.flags).not.toContain("fit_from_tag_overlap");
    expect(ranked[0]!.reasons[0]).toBe("Fellow Navy veteran");
  });

  it("tag overlap rewards the same branch and story keywords", () => {
    const sameBranch = tagOverlapJudgement(veteranLead, candidate({ tags: navyVet }));
    const otherBranch = tagOverlapJudgement(
      veteranLead,
      candidate({ tags: { ...navyVet, backgroundTags: [{ tag: "veteran", branch: "army", detail: null }] } }),
    );
    expect(sameBranch.backgroundScore).toBeGreaterThan(otherBranch.backgroundScore);
    expect(tagOverlapJudgement(lead({ lead_background: "Loves cooking" }), candidate({ tags: navyVet })).backgroundScore).toBe(0);
  });
});

describe("follow-up modifier", () => {
  const weights = DEFAULT_MATCH_WEIGHTS;

  it("favours chasers and consistent brokers for Buy Now, Active and hot leads", () => {
    const urgent = lead({ priority: "Buy Now" });
    expect(followUpAdjustment(urgent, tags({ followUpStyle: "chaser" }), null, weights).points).toBe(10);
    expect(followUpAdjustment(urgent, tags({ followUpStyle: "consistent" }), null, weights).points).toBe(5);
    expect(followUpAdjustment(urgent, tags({ followUpStyle: "light_touch" }), null, weights).points).toBe(-5);
    expect(followUpAdjustment(urgent, tags({ followUpStyle: "wait_for_lead" }), null, weights).points).toBe(-10);
    expect(followUpAdjustment(lead({ hot: true }), tags({ followUpStyle: "chaser" }), null, weights).points).toBe(10);
  });

  it("blends in followUpScore when health is live", () => {
    const urgent = lead({ priority: "Active" });
    expect(followUpAdjustment(urgent, tags({ followUpStyle: "chaser" }), { score: 70, followUpScore: 100 }, weights).points).toBe(10);
    expect(followUpAdjustment(urgent, tags({ followUpStyle: "chaser" }), { score: 70, followUpScore: 0 }, weights).points).toBe(0);
    expect(followUpAdjustment(urgent, tags({}), { score: 70, followUpScore: 100 }, weights)).toEqual({ points: 5, flags: ["follow_up_unknown"] });
  });

  it("doesn't penalise light-touch or wait-for-lead brokers on nurture leads", () => {
    const nurture = lead({ priority: "Nurture" });
    expect(followUpAdjustment(nurture, tags({ followUpStyle: "light_touch" }), null, weights).points).toBe(0);
    expect(followUpAdjustment(nurture, tags({ followUpStyle: "wait_for_lead" }), null, weights).points).toBe(0);
    const scored = scoreCandidate(nurture, candidate({ tags: tags({ followUpStyle: "light_touch", maxLeadsPerWeek: 2 }) }), null, weights, false);
    expect(scored.reasons).toContain("Light-touch follow-up suits a nurture lead");
  });

  it("does nothing when the lead has no priority", () => {
    expect(followUpAdjustment(lead({}), tags({ followUpStyle: "wait_for_lead" }), null, weights)).toEqual({ points: 0, flags: [] });
  });

  it("scales with the configured points", () => {
    expect(followUpAdjustment(lead({ priority: "Buy Now" }), tags({ followUpStyle: "chaser" }), null, { ...weights, followUpPoints: 20 }).points).toBe(20);
  });
});

describe("reasons never leak do-not-mention content", () => {
  const veteranLead = lead({ lead_background: "Navy veteran going through a divorce", language: "Spanish", boat_type: "sportfish", budget: "600k", priority: "Buy Now" });
  const broker = candidate({
    tags: { ...navyVet, languages: [{ language: "spanish", fluency: "native" }, { language: "english", fluency: "native" }] },
  });

  it("drops a Claude reason that mentions a do-not-mention topic and fills in with safe reasons", () => {
    const scored = scoreCandidate(veteranLead, broker, judgement("b-1", { reason: "Both Navy vets who went through a divorce" }), DEFAULT_MATCH_WEIGHTS, true);
    expect(scored.reasons).toHaveLength(2);
    expect(scored.reasons.join(" ").toLowerCase()).not.toContain("divorce");
    expect(scored.reasons).toEqual(["Fellow Navy veteran", "Speaks Spanish (native)"]);
    expect(JSON.stringify(scored)).not.toMatch(/divorce/i);
  });

  it("drops any built reason that touches a do-not-mention word", () => {
    const scored = scoreCandidate(
      lead({ boat_type: "sportfish", budget: "600k" }),
      candidate({ tags: { ...navyVet, doNotMention: ["sportfish"] } }),
      null,
      DEFAULT_MATCH_WEIGHTS,
      false,
    );
    expect(scored.reasons.some((reason) => /sportfish/i.test(reason))).toBe(false);
  });

  it("never puts the do-not-mention list itself in the scored result", () => {
    const ranked = rankCandidates(veteranLead, [broker], new Map([["b-1", judgement("b-1")]]), DEFAULT_MATCH_WEIGHTS);
    expect(JSON.stringify(ranked)).not.toMatch(/his divorce/i);
  });
});
