/**
 * File: apps/api/test/match-claude.test.ts
 * Purpose: Unit tests for the Claude calls lead matching makes, with a stand-in Anthropic client: persona extraction
 * returns cleaned tags and uses structured output with the refusal fallback, refusals and cut-off replies throw, the fit
 * judge maps its broker refs back to ids and clamps scores, and the do-not-mention list is never sent to the fit judge.
 *
 * Functions:
 * - stubClient(reply): a stand-in client whose beta.messages.parse records each request and returns reply.
 */
import { emptyPersonaTags, matchRequestSchema, toLeadProfile, type PersonaTags } from "@bp/shared";
import { describe, expect, it, vi } from "vitest";
import { createClaudeMatchAi, createMatchAiFromEnv, DEFAULT_MATCH_MODEL } from "../src/services/match/claude";

function stubClient(reply: { stop_reason: string; parsed_output: unknown }) {
  const parse = vi.fn(async (_params: Record<string, unknown>, _options?: unknown) => reply);
  return { client: { beta: { messages: { parse } } } as never, parse };
}

const lead = toLeadProfile(
  matchRequestSchema.parse({ contactId: "c", name: "Mike", lead_background: "Retired Navy chief", boat_type: "sportfish", budget: 600000 }),
);

const brokerTags: PersonaTags = {
  ...emptyPersonaTags(),
  backgroundTags: [{ tag: "veteran", branch: "navy", detail: null }],
  storyKeywords: ["Gulf deployments"],
  doNotMention: ["his divorce"],
};

describe("createClaudeMatchAi", () => {
  it("extracts persona tags with structured output and the server-side fallback, then cleans them", async () => {
    const raw = { ...emptyPersonaTags(), boatTypes: [], languages: [{ language: "Español", fluency: "native" }], maxLeadsPerWeek: 3 };
    const { client, parse } = stubClient({ stop_reason: "end_turn", parsed_output: raw });
    const ai = createClaudeMatchAi({ model: "claude-opus-5-5", client });
    const tags = await ai.extractPersonaTags("# Persona: Carlos\n\n## Languages\nSpanish (native)");
    expect(tags.languages).toEqual([{ language: "spanish", fluency: "native" }]);
    expect(tags.boatTypes).toBeNull();
    expect(tags.maxLeadsPerWeek).toBe(3);
    const params = parse.mock.calls[0]![0];
    expect(params).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect((params.output_config as { format: unknown }).format).toBeTruthy();
    expect(JSON.stringify(params.messages)).toContain("<persona>");
  });

  it("throws on a refusal, a cut-off reply or a reply without output", async () => {
    for (const reply of [
      { stop_reason: "refusal", parsed_output: null },
      { stop_reason: "max_tokens", parsed_output: null },
      { stop_reason: "end_turn", parsed_output: null },
    ]) {
      const { client } = stubClient(reply);
      await expect(createClaudeMatchAi({ model: "m", client }).extractPersonaTags("text")).rejects.toThrow(/Claude/);
    }
  });

  it("judges fit by ref, maps refs back to broker ids, clamps scores and ignores unknown or repeated refs", async () => {
    const { client, parse } = stubClient({
      stop_reason: "end_turn",
      parsed_output: {
        matches: [
          { ref: "B1", backgroundScore: 140, buyerTypeScore: -5, avoidConflict: false, reason: "  Navy veteran like the lead.  " },
          { ref: "B1", backgroundScore: 10, buyerTypeScore: null, avoidConflict: true, reason: null },
          { ref: "B9", backgroundScore: 50, buyerTypeScore: null, avoidConflict: false, reason: null },
          { ref: "B2", backgroundScore: 20, buyerTypeScore: null, avoidConflict: true, reason: "" },
        ],
      },
    });
    const ai = createClaudeMatchAi({ model: "m", client });
    const judgements = await ai.judgeFit(lead, [
      { brokerId: "broker-a", tags: brokerTags },
      { brokerId: "broker-b", tags: { ...emptyPersonaTags(), backgroundTags: [{ tag: "pilot", branch: null, detail: null }] } },
    ]);
    expect(judgements).toEqual([
      { brokerId: "broker-a", backgroundScore: 100, buyerTypeScore: 0, avoidConflict: false, reason: "Navy veteran like the lead." },
      { brokerId: "broker-b", backgroundScore: 20, buyerTypeScore: null, avoidConflict: true, reason: null },
    ]);
    const sent = JSON.stringify(parse.mock.calls[0]![0].messages);
    expect(sent).not.toMatch(/divorce/i);
    expect(sent).not.toContain("broker-a");
    expect(sent).toContain("Retired Navy chief");
  });

  it("makes no call when there are no candidates", async () => {
    const { client, parse } = stubClient({ stop_reason: "end_turn", parsed_output: { matches: [] } });
    expect(await createClaudeMatchAi({ model: "m", client }).judgeFit(lead, [])).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it("is only created from the environment when ANTHROPIC_API_KEY is set", () => {
    expect(createMatchAiFromEnv({ ANTHROPIC_API_KEY: undefined, MATCH_MODEL: DEFAULT_MATCH_MODEL })).toBeNull();
    expect(createMatchAiFromEnv({ ANTHROPIC_API_KEY: "sk-test", MATCH_MODEL: "claude-opus-5-5" })?.model).toBe("claude-opus-5-5");
  });
});
