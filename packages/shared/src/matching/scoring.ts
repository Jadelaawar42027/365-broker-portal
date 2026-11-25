/**
 * File: packages/shared/src/matching/scoring.ts
 * Purpose: Lead-to-broker scoring, kept free of I/O so it can be unit tested: hard filters (active, language, price band,
 * boat type, weekly lead cap), the fit, performance and availability factors (a factor with no data is dropped and the
 * other weights are renormalised, never filled with a made-up neutral value), the follow-up modifier for urgent and
 * nurture leads, the tag-overlap fallback used when Claude can't judge background fit, and the short reasons shown to the
 * setter, which never contain anything from the broker's do-not-mention list.
 *
 * Functions:
 * - speaksLanguage(tags, language): "yes", "no" or "unknown" for whether the broker speaks the language well enough (basic doesn't count).
 * - exclusionReasons(lead, candidate): every hard-filter rule the broker fails for this lead (empty when eligible).
 * - applyHardFilters(lead, candidates): splits the candidates into eligible brokers and excluded ones with their reasons.
 * - sharedBackground(lead, tags): the background tags the lead and broker share, and whether they served in the same branch.
 * - significantWords(text): the lowercase words of five or more letters in text.
 * - tagOverlapJudgement(lead, candidate): the fallback fit judgement from shared background tags and keyword overlap.
 * - scoreFit(lead, tags, judgement): the fit factor (0-100 or null) with its parts and flags.
 * - scoreAvailability(tags, assignmentsLast14Days): the availability factor (0-100, or null when the broker has no lead cap).
 * - followUpAdjustment(lead, tags, health, weights): the follow-up modifier in points, and its flags.
 * - combineFactors(factors, weights): the weighted 0-100 base score over the factors that have data, and each factor's applied weight.
 * - clampScore(value): a value rounded and kept between 0 and 100.
 * - backgroundReason(lead, tags): "Fellow Navy veteran" or "Shared background: pilot, diver" when they share a background.
 * - expertiseReason(lead, tags): "Works sportfish in the $750k–$2M range" style text when the broker covers the lead's boat or budget.
 * - followUpReason(lead, tags): a sentence on why the broker's follow-up style suits the lead, or null.
 * - capitalise(text): text with its first letter in upper case.
 * - buildReasons(lead, candidate, judgement, judgedByClaude, availability): up to two short reasons, with any that touch a do-not-mention topic removed.
 * - scoreCandidate(lead, candidate, judgement, weights, judgedByClaude): one broker's score, per-factor breakdown, reasons and flags.
 * - rankCandidates(lead, candidates, judgements, weights): scores every eligible broker (using the tag-overlap fallback where Claude gave no judgement) and sorts best first.
 */
import { z } from "zod";
import type { LeadProfile } from "./lead";
import {
  containsDoNotMention,
  type BackgroundTag,
  type BoatType,
  type MilitaryBranch,
  type PersonaTags,
  type PriceBand,
} from "./tags";

export const matchWeightsSchema = z
  .object({
    fit: z.number().int().min(0).max(100),
    performance: z.number().int().min(0).max(100),
    availability: z.number().int().min(0).max(100),
    followUpPoints: z.number().int().min(0).max(30).describe("Most points the follow-up modifier adds or takes away"),
  })
  .refine((weights) => weights.fit + weights.performance + weights.availability > 0, {
    message: "At least one weight must be above 0.",
  });
export type MatchWeights = z.infer<typeof matchWeightsSchema>;

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = { fit: 45, performance: 35, availability: 20, followUpPoints: 10 };

export const FIT_PART_WEIGHTS = { background: 60, buyerType: 10, boatType: 15, priceBand: 15 } as const;

export const EXCLUSION_REASONS = ["not_active", "language", "price_band", "boat_type", "at_capacity"] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export const MATCH_FLAGS = [
  "health_not_live",
  "no_persona",
  "no_capacity_set",
  "fit_not_scored",
  "fit_from_tag_overlap",
  "follow_up_unknown",
  "possible_avoid_conflict",
  "boat_type_unconfirmed",
  "price_band_unconfirmed",
  "language_unconfirmed",
  "nothing_to_score",
] as const;
export type MatchFlag = (typeof MATCH_FLAGS)[number];

export type BrokerHealth = { score: number; followUpScore: number } | null;

export type MatchCandidate = {
  brokerId: string;
  name: string;
  active: boolean;
  tags: PersonaTags | null;
  health: BrokerHealth;
  assignmentsLast7Days: number;
  assignmentsLast14Days: number;
};

export type FitJudgement = {
  brokerId: string;
  backgroundScore: number;
  buyerTypeScore: number | null;
  avoidConflict: boolean;
  reason: string | null;
};

export type FitParts = { background: number | null; buyerType: number | null; boatType: number | null; priceBand: number | null };

export type ScoredBroker = {
  brokerId: string;
  name: string;
  score: number;
  breakdown: {
    fit: { score: number | null; weight: number; parts: FitParts };
    performance: { score: number | null; weight: number; followUpScore: number | null };
    availability: {
      score: number | null;
      weight: number;
      assignmentsLast7Days: number;
      assignmentsLast14Days: number;
      maxLeadsPerWeek: number | null;
    };
    followUp: { points: number; style: PersonaTags["followUpStyle"] };
  };
  reasons: string[];
  flags: MatchFlag[];
};

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  army: "Army",
  navy: "Navy",
  air_force: "Air Force",
  marine_corps: "Marine Corps",
  coast_guard: "Coast Guard",
  space_force: "Space Force",
  national_guard: "National Guard",
};

export const BACKGROUND_LABELS: Record<BackgroundTag, string> = {
  veteran: "military veteran",
  pilot: "pilot",
  law_enforcement: "law enforcement",
  first_responder: "first responder",
  licensed_captain: "licensed captain",
  boat_owner: "boat owner",
  liveaboard: "liveaboard",
  cruiser: "cruiser",
  sailor_racer: "sailor and racer",
  sport_fisherman: "sport fisherman",
  diver: "diver",
  business_owner: "business owner",
  medical: "medical",
  engineer_tech: "engineering and tech",
  finance_real_estate: "finance and real estate",
  retired_second_career: "retired, second career",
  family_boating: "family boater",
};

export const BOAT_TYPE_LABELS: Record<BoatType, string> = {
  sportfish: "sportfish",
  center_console: "center consoles",
  express_cruiser: "express cruisers",
  motor_yacht: "motor yachts",
  trawler: "trawlers",
  catamaran: "catamarans",
  sailboat: "sailboats",
  superyacht: "superyachts",
  dayboat: "day boats",
};

export const PRICE_BAND_LABELS: Record<PriceBand, string> = {
  under_250k: "under $250k",
  "250k_750k": "$250k–$750k",
  "750k_2m": "$750k–$2M",
  "2m_5m": "$2M–$5M",
  "5m_plus": "$5M+",
};

const URGENT_STYLE_FACTORS = { chaser: 1, consistent: 0.5, light_touch: -0.5, wait_for_lead: -1 } as const;
const MAX_REASON_LENGTH = 160;
const STRONG_BACKGROUND_SCORE = 50;
const REASON_STOPWORDS = new Set(["about", "their", "there", "which", "would", "people", "buyers", "clients", "being", "where"]);

export function speaksLanguage(tags: PersonaTags | null, language: string): "yes" | "no" | "unknown" {
  const languages = tags?.languages;
  if (!languages) return "unknown";
  const entry = languages.find((skill) => skill.language === language);
  if (!entry || entry.fluency === "basic") return "no";
  return "yes";
}

export function exclusionReasons(lead: LeadProfile, candidate: MatchCandidate): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  const tags = candidate.tags;
  if (!candidate.active) reasons.push("not_active");
  if (lead.language) {
    const speaks = speaksLanguage(tags, lead.language);
    if (speaks === "no" || (speaks === "unknown" && lead.language !== "english")) reasons.push("language");
  }
  if (lead.priceBand && tags?.priceBands && !tags.priceBands.includes(lead.priceBand)) reasons.push("price_band");
  if (lead.boatType && tags?.boatTypes && !tags.boatTypes.includes(lead.boatType)) reasons.push("boat_type");
  if (tags?.maxLeadsPerWeek != null && candidate.assignmentsLast7Days >= tags.maxLeadsPerWeek) reasons.push("at_capacity");
  return reasons;
}

export function applyHardFilters(lead: LeadProfile, candidates: MatchCandidate[]) {
  const eligible: MatchCandidate[] = [];
  const excluded: { brokerId: string; name: string; reasons: ExclusionReason[] }[] = [];
  for (const candidate of candidates) {
    const reasons = exclusionReasons(lead, candidate);
    if (reasons.length === 0) eligible.push(candidate);
    else excluded.push({ brokerId: candidate.brokerId, name: candidate.name, reasons });
  }
  return { eligible, excluded };
}

export function sharedBackground(lead: LeadProfile, tags: PersonaTags | null): { tags: BackgroundTag[]; sameBranch: MilitaryBranch | null } {
  const brokerTags = tags?.backgroundTags ?? [];
  const shared = lead.backgroundTags.filter((tag) => brokerTags.some((entry) => entry.tag === tag));
  const brokerBranch = brokerTags.find((entry) => entry.tag === "veteran")?.branch ?? null;
  const sameBranch = shared.includes("veteran") && lead.branch && brokerBranch === lead.branch ? lead.branch : null;
  return { tags: shared, sameBranch };
}

export function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 5 && !REASON_STOPWORDS.has(word)),
  );
}

export function tagOverlapJudgement(lead: LeadProfile, candidate: MatchCandidate): FitJudgement {
  const tags = candidate.tags;
  const shared = sharedBackground(lead, tags);
  let score = 0;
  if (shared.tags.length > 0) score = 70 + 15 * (shared.tags.length - 1) + (shared.sameBranch ? 15 : 0);
  const leadWords = significantWords([lead.backgroundText, lead.notes].filter(Boolean).join(" "));
  const hits = (phrases: string[] | null) =>
    (phrases ?? []).filter((phrase) => [...significantWords(phrase)].some((word) => leadWords.has(word))).length;
  score += Math.min(20, 10 * hits(tags?.storyKeywords ?? null));
  score += Math.min(20, 10 * hits(tags?.buyerTypesClick ?? null));
  return { brokerId: candidate.brokerId, backgroundScore: clampScore(score), buyerTypeScore: null, avoidConflict: false, reason: null };
}

export function scoreFit(lead: LeadProfile, tags: PersonaTags | null, judgement: FitJudgement | null) {
  const flags: MatchFlag[] = [];
  const parts: FitParts = { background: null, buyerType: null, boatType: null, priceBand: null };
  if (!tags) return { score: null, parts, flags: ["no_persona"] as MatchFlag[] };
  if ((lead.backgroundText || lead.notes) && judgement) {
    parts.background = clampScore(judgement.avoidConflict ? judgement.backgroundScore / 2 : judgement.backgroundScore);
    if (judgement.avoidConflict) flags.push("possible_avoid_conflict");
    if (judgement.buyerTypeScore !== null) parts.buyerType = clampScore(judgement.buyerTypeScore);
  }
  if (lead.boatType) {
    parts.boatType = tags.boatTypes?.includes(lead.boatType) ? 100 : 0;
    if (!tags.boatTypes) flags.push("boat_type_unconfirmed");
  }
  if (lead.priceBand) {
    parts.priceBand = tags.priceBands?.includes(lead.priceBand) ? 100 : 0;
    if (!tags.priceBands) flags.push("price_band_unconfirmed");
  }
  let total = 0;
  let weight = 0;
  for (const key of Object.keys(FIT_PART_WEIGHTS) as (keyof FitParts)[]) {
    const value = parts[key];
    if (value === null) continue;
    total += value * FIT_PART_WEIGHTS[key];
    weight += FIT_PART_WEIGHTS[key];
  }
  if (weight === 0) return { score: null, parts, flags: [...flags, "fit_not_scored"] as MatchFlag[] };
  return { score: clampScore(total / weight), parts, flags };
}

export function scoreAvailability(tags: PersonaTags | null, assignmentsLast14Days: number): number | null {
  const cap = tags?.maxLeadsPerWeek;
  if (cap == null || cap <= 0) return null;
  return clampScore(100 * (1 - Math.min(1, assignmentsLast14Days / (2 * cap))));
}

export function followUpAdjustment(lead: LeadProfile, tags: PersonaTags | null, health: BrokerHealth, weights: MatchWeights) {
  const flags: MatchFlag[] = [];
  const style = tags?.followUpStyle ?? null;
  if (!lead.urgent && !lead.nurture) return { points: 0, flags };
  if (!style) flags.push("follow_up_unknown");
  if (lead.nurture) return { points: 0, flags };
  const styleFactor = style ? URGENT_STYLE_FACTORS[style] : null;
  const healthFactor = health ? (Math.max(0, Math.min(100, health.followUpScore)) - 50) / 50 : null;
  let factor = 0;
  if (styleFactor !== null && healthFactor !== null) factor = 0.5 * styleFactor + 0.5 * healthFactor;
  else if (styleFactor !== null) factor = styleFactor;
  else if (healthFactor !== null) factor = 0.5 * healthFactor;
  return { points: Math.round(factor * weights.followUpPoints * 10) / 10, flags };
}

export function combineFactors(factors: { fit: number | null; performance: number | null; availability: number | null }, weights: MatchWeights) {
  const keys = ["fit", "performance", "availability"] as const;
  const present = keys.filter((key) => factors[key] !== null && weights[key] > 0);
  const totalWeight = present.reduce((sum, key) => sum + weights[key], 0);
  const applied = { fit: 0, performance: 0, availability: 0 };
  if (totalWeight === 0) return { base: null, applied };
  let base = 0;
  for (const key of present) {
    applied[key] = Math.round((weights[key] / totalWeight) * 1000) / 10;
    base += (factors[key]! * weights[key]) / totalWeight;
  }
  return { base, applied };
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function backgroundReason(lead: LeadProfile, tags: PersonaTags | null): string | null {
  const shared = sharedBackground(lead, tags);
  if (shared.tags.length === 0) return null;
  if (shared.sameBranch) return `Fellow ${BRANCH_LABELS[shared.sameBranch]} veteran`;
  return `Shared background: ${shared.tags.map((tag) => BACKGROUND_LABELS[tag]).join(", ")}`;
}

export function expertiseReason(lead: LeadProfile, tags: PersonaTags | null): string | null {
  const boat = lead.boatType && tags?.boatTypes?.includes(lead.boatType) ? BOAT_TYPE_LABELS[lead.boatType] : null;
  const band = lead.priceBand && tags?.priceBands?.includes(lead.priceBand) ? PRICE_BAND_LABELS[lead.priceBand] : null;
  if (boat && band) return `Works ${boat} in the ${band} range`;
  if (boat) return `Works ${boat}`;
  if (band) return `Sells in the ${band} range`;
  return null;
}

export function followUpReason(lead: LeadProfile, tags: PersonaTags | null): string | null {
  const style = tags?.followUpStyle;
  if (lead.urgent && style === "chaser") return "Follows up hard, good for a hot lead";
  if (lead.urgent && style === "consistent") return "Follows up consistently";
  if (lead.nurture && (style === "light_touch" || style === "wait_for_lead")) return "Light-touch follow-up suits a nurture lead";
  return null;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildReasons(
  lead: LeadProfile,
  candidate: MatchCandidate,
  judgement: FitJudgement | null,
  judgedByClaude: boolean,
  availability: number | null,
): string[] {
  const tags = candidate.tags;
  const options: (string | null)[] = [];
  if (judgedByClaude && judgement?.reason && judgement.backgroundScore >= STRONG_BACKGROUND_SCORE) {
    options.push(judgement.reason.trim().slice(0, MAX_REASON_LENGTH));
  }
  options.push(backgroundReason(lead, tags));
  if (lead.language && lead.language !== "english" && speaksLanguage(tags, lead.language) === "yes") {
    const fluency = tags?.languages?.find((skill) => skill.language === lead.language)?.fluency;
    options.push(`Speaks ${capitalise(lead.language)}${fluency ? ` (${fluency})` : ""}`);
  }
  options.push(expertiseReason(lead, tags));
  options.push(followUpReason(lead, tags));
  if (availability !== null && availability >= 60 && tags?.maxLeadsPerWeek != null) {
    options.push(`Has room: ${candidate.assignmentsLast7Days} of ${tags.maxLeadsPerWeek} leads this week`);
  }
  const reasons: string[] = [];
  for (const option of options) {
    if (!option || reasons.includes(option) || containsDoNotMention(option, tags?.doNotMention)) continue;
    reasons.push(option);
    if (reasons.length === 2) break;
  }
  return reasons;
}

export function scoreCandidate(
  lead: LeadProfile,
  candidate: MatchCandidate,
  judgement: FitJudgement | null,
  weights: MatchWeights,
  judgedByClaude: boolean,
): ScoredBroker {
  const tags = candidate.tags;
  const fit = scoreFit(lead, tags, judgement);
  const flags: MatchFlag[] = [...fit.flags];
  if (tags && !judgedByClaude && fit.parts.background !== null) flags.push("fit_from_tag_overlap");
  const performance = candidate.health ? clampScore(candidate.health.score) : null;
  if (performance === null) flags.push("health_not_live");
  const availability = scoreAvailability(tags, candidate.assignmentsLast14Days);
  if (availability === null) flags.push("no_capacity_set");
  if (lead.language && tags && !tags.languages && lead.language === "english") flags.push("language_unconfirmed");
  const followUp = followUpAdjustment(lead, tags, candidate.health, weights);
  flags.push(...followUp.flags);
  const combined = combineFactors({ fit: fit.score, performance, availability }, weights);
  if (combined.base === null) flags.push("nothing_to_score");
  return {
    brokerId: candidate.brokerId,
    name: candidate.name,
    score: combined.base === null ? 0 : clampScore(combined.base + followUp.points),
    breakdown: {
      fit: { score: fit.score, weight: combined.applied.fit, parts: fit.parts },
      performance: { score: performance, weight: combined.applied.performance, followUpScore: candidate.health?.followUpScore ?? null },
      availability: {
        score: availability,
        weight: combined.applied.availability,
        assignmentsLast7Days: candidate.assignmentsLast7Days,
        assignmentsLast14Days: candidate.assignmentsLast14Days,
        maxLeadsPerWeek: tags?.maxLeadsPerWeek ?? null,
      },
      followUp: { points: followUp.points, style: tags?.followUpStyle ?? null },
    },
    reasons: buildReasons(lead, candidate, judgement, judgedByClaude, availability),
    flags: [...new Set(flags)],
  };
}

export function rankCandidates(
  lead: LeadProfile,
  candidates: MatchCandidate[],
  judgements: Map<string, FitJudgement> | null,
  weights: MatchWeights,
): ScoredBroker[] {
  return candidates
    .map((candidate) => {
      const claude = judgements?.get(candidate.brokerId) ?? null;
      const judgement = claude ?? (candidate.tags ? tagOverlapJudgement(lead, candidate) : null);
      return scoreCandidate(lead, candidate, judgement, weights, claude !== null);
    })
    .sort((a, b) => b.score - a.score || (b.breakdown.fit.score ?? -1) - (a.breakdown.fit.score ?? -1) || a.name.localeCompare(b.name));
}
