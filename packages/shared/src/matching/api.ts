/**
 * File: packages/shared/src/matching/api.ts
 * Purpose: The HTTP contract for lead matching: the POST /api/match response and the choice body, exactly as the 365 Yachts
 * AI (the 365-whatsapp-bot service, brokerMatch.js) sends and expects them, plus the admin persona-tags view and its
 * override edits, the backfill, and the scoring weights. Response schemas strip unknown keys, so do-not-mention content
 * and persona notes can only reach the bot through the fields listed here; the full per-factor detail stays in match_log.
 *
 * Functions:
 * - none
 */
import { z } from "zod";
import { MATCH_FLAGS, matchWeightsSchema } from "./scoring";
import { PERSONA_TAG_FIELDS, personaTagOverridesSchema, personaTagsSchema, type PersonaTagField } from "./tags";

export const HEALTH_SOURCES = ["none", "mock", "coach"] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];

export const FIT_METHODS = ["claude", "tag_overlap", "none"] as const;
export type FitMethod = (typeof FIT_METHODS)[number];

const nullableScore = z.number().nullable();

export const matchBrokerSchema = z.object({
  id: z.string().describe("The portal's broker id"),
  name: z.string(),
  score: z.number().int().describe("0-100, higher is a better match"),
  breakdown: z.object({
    fit: nullableScore.describe("0-100, or null when the broker has no persona or the lead gave nothing to match on"),
    performance: nullableScore.describe("0-100 health score, or null while health is not live"),
    availability: nullableScore.describe("0-100, or null when the broker has no weekly lead cap"),
  }),
  reasons: z.array(z.string()).describe("One or two short reasons to give the setter"),
  flags: z.array(z.enum(MATCH_FLAGS)),
  ghlUserId: z.string().optional().describe("The broker's GoHighLevel user id; left out when unknown or a dry-run placeholder"),
});
export type MatchBroker = z.infer<typeof matchBrokerSchema>;

export const matchResponseSchema = z.object({
  matchId: z.string(),
  brokers: z.array(matchBrokerSchema).describe("Best match first, at most topN"),
});
export type MatchResponse = z.infer<typeof matchResponseSchema>;

export const matchChoiceRequestSchema = z.object({
  brokerId: z.string().trim().max(100).nullish().transform((value) => value || null).describe("The portal's id for a listed broker; null for none or an off-list pick"),
  pickedBy: z.string().trim().max(120).nullish().transform((value) => value || "unknown").describe("Who made the call, such as Karim"),
  timestamp: z.string().trim().max(60).nullish().transform((value) => value || null).describe("When the pick was made (ISO 8601), as the bot saw it"),
  brokerName: z.string().trim().max(200).nullish().transform((value) => value || null),
  ghlUserId: z.string().trim().max(100).nullish().transform((value) => value || null).describe("The picked broker's GoHighLevel user id; absent for none"),
  offList: z.boolean().nullish().transform((value) => value ?? false).describe("True when the broker was not on the recommended list"),
});
export type MatchChoiceRequest = z.infer<typeof matchChoiceRequestSchema>;

export const matchChoiceResponseSchema = z.object({
  ok: z.literal(true),
  matchId: z.string(),
  brokerId: z.string().nullable().describe("The portal broker the pick was linked to, or null for none or an unknown broker"),
  fromRecommendations: z.boolean(),
  offList: z.boolean(),
  chosenAt: z.string(),
});

export const PERSONA_TAGS_STATUSES = ["current", "stale", "failed", "pending", "no_persona"] as const;
export type PersonaTagsStatus = (typeof PERSONA_TAGS_STATUSES)[number];

export const personaTagsViewSchema = z.object({
  brokerId: z.string(),
  status: z.enum(PERSONA_TAGS_STATUSES).describe("current: tags match the saved persona; stale: the persona changed since; pending: never extracted"),
  extracted: personaTagsSchema.nullable(),
  overrides: personaTagOverridesSchema,
  effective: personaTagsSchema,
  extractedAt: z.string().nullable(),
  extractionModel: z.string().nullable(),
  extractionError: z.string().nullable(),
  aiConfigured: z.boolean().describe("False when ANTHROPIC_API_KEY is not set, so tags can't be extracted"),
});
export type PersonaTagsView = z.infer<typeof personaTagsViewSchema>;

export const personaTagsPatchSchema = z
  .object({
    set: personaTagOverridesSchema.optional().describe("Fields to override; an override always wins over the extracted value"),
    clear: z
      .array(z.enum(PERSONA_TAG_FIELDS as [PersonaTagField, ...PersonaTagField[]]))
      .optional()
      .describe("Fields whose override is removed, so the extracted value applies again"),
  })
  .refine((body) => Object.keys(body.set ?? {}).length > 0 || (body.clear ?? []).length > 0, {
    message: "Send at least one field to set or clear.",
  });
export type PersonaTagsPatch = z.infer<typeof personaTagsPatchSchema>;

export const personaTagsBackfillRequestSchema = z.object({
  force: z.boolean().optional().describe("Re-extract even brokers whose persona hasn't changed"),
});

export const personaTagsBackfillResponseSchema = z.object({
  started: z.literal(true),
  brokers: z.number().int().describe("Brokers with a persona that will be checked"),
});

export const matchWeightsResponseSchema = z.object({
  weights: matchWeightsSchema,
  isDefault: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedByName: z.string().nullable(),
});
export type MatchWeightsResponse = z.infer<typeof matchWeightsResponseSchema>;
