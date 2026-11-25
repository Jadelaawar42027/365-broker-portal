/**
 * File: packages/shared/src/matching/lead.ts
 * Purpose: The lead side of matching: the POST /api/match request body the 365 Yachts AI sends, and turning it into a
 * lead profile (price band from the budget, a known boat type, the language, how urgent the lead is, and the background
 * tags its free text mentions, which the tag-overlap fallback uses when Claude can't judge the match).
 *
 * Functions:
 * - canonicalPriority(value): the lead priority in its canonical spelling ("buy now" becomes "Buy Now"), or the value unchanged.
 * - optionalText(max): a schema for optional trimmed text up to max characters, where empty or missing becomes null.
 * - parseBudget(budget): a budget number or text such as "$750k", "1.2M" or "500k-1M" as dollars (the highest figure given), or null.
 * - priceBandFor(amount): the price band a dollar amount falls in.
 * - normalizeBoatType(text): the controlled boat type a free-text boat type means, or null when it isn't clear.
 * - inferLeadBackground(text): the background tags (and military branch) a lead's free text mentions.
 * - toLeadProfile(request): the lead profile the scoring uses.
 */
import { z } from "zod";
import {
  normalizeLanguage,
  type BackgroundTag,
  type BoatType,
  type MilitaryBranch,
  type PriceBand,
} from "./tags";

export const LEAD_PRIORITIES = ["Buy Now", "Active", "Nurture", "Low Priority", "On Hold"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const URGENT_PRIORITIES: readonly LeadPriority[] = ["Buy Now", "Active"];
export const NURTURE_PRIORITIES: readonly LeadPriority[] = ["Nurture", "Low Priority", "On Hold"];

export const DEFAULT_TOP_N = 4;

export function canonicalPriority(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = LEAD_PRIORITIES.find((priority) => priority.toLowerCase() === value.trim().toLowerCase());
  return match ?? value;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const matchRequestSchema = z.object({
  contactId: z.string().trim().min(1).max(200).describe("The lead's GoHighLevel contact id"),
  name: z.string().trim().min(1).max(200).describe("The lead's name"),
  budget: z
    .union([z.number().nonnegative(), z.string().trim().max(100)])
    .nullish()
    .transform((value) => value ?? null)
    .describe("Budget in dollars, or text such as \"$750k\", \"1.2M\" or \"500k-1M\""),
  boat_type: optionalText(200).describe("Boat type the lead wants, such as sportfish or catamaran"),
  location: optionalText(200),
  language: optionalText(100).describe("The lead's preferred language, such as Spanish"),
  priority: z.preprocess(canonicalPriority, z.enum(LEAD_PRIORITIES).nullish()).transform((value) => value ?? null),
  hot: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
  lead_background: optionalText(4000).describe("Free text about the lead: career, service, hobbies, story"),
  notes: optionalText(4000),
  topN: z.number().int().min(1).max(20).nullish().transform((value) => value ?? DEFAULT_TOP_N),
});
export type MatchRequestInput = z.input<typeof matchRequestSchema>;
export type MatchRequest = z.output<typeof matchRequestSchema>;

const MULTIPLIERS: Record<string, number> = { k: 1_000, thousand: 1_000, m: 1_000_000, mm: 1_000_000, million: 1_000_000, mil: 1_000_000 };

export function parseBudget(budget: number | string | null | undefined): number | null {
  if (budget === null || budget === undefined) return null;
  if (typeof budget === "number") return Number.isFinite(budget) && budget > 0 ? budget : null;
  const amounts: number[] = [];
  for (const match of budget.toLowerCase().matchAll(/(\d+(?:[.,]\d+)*)\s*(million|thousand|mil|mm|m|k)?\b/g)) {
    const digits = match[1]!;
    const suffix = match[2];
    const value = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const amount = suffix ? value * MULTIPLIERS[suffix]! : value;
    if (!suffix && amount < 1000) continue;
    amounts.push(amount);
  }
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function priceBandFor(amount: number): PriceBand {
  if (amount < 250_000) return "under_250k";
  if (amount < 750_000) return "250k_750k";
  if (amount < 2_000_000) return "750k_2m";
  if (amount < 5_000_000) return "2m_5m";
  return "5m_plus";
}

const BOAT_TYPE_PATTERNS: { type: BoatType; pattern: RegExp }[] = [
  { type: "superyacht", pattern: /\b(super ?yacht|mega ?yacht|explorer yacht|expedition yacht)\b/ },
  { type: "sportfish", pattern: /\b(sport ?fish(?:erman|ing)?|convertible|sport fisher)\b/ },
  { type: "center_console", pattern: /\b(center ?console|centre ?console|bay boat|cc)\b/ },
  { type: "express_cruiser", pattern: /\b(express(?: cruiser)?|sport ?yacht|sport cruiser|cruiser)\b/ },
  { type: "trawler", pattern: /\b(trawler|long ?range cruiser)\b/ },
  { type: "catamaran", pattern: /\b(cat|catamaran|power ?cat|sailing ?cat|multihull)\b/ },
  { type: "sailboat", pattern: /\b(sail ?boat|sailing yacht|sloop|ketch|sailing)\b/ },
  { type: "dayboat", pattern: /\b(day ?boat|bowrider|pontoon|runabout|deck boat)\b/ },
  { type: "motor_yacht", pattern: /\b(motor ?yacht|flybridge|fly bridge|yacht)\b/ },
];

export function normalizeBoatType(text: string | null | undefined): BoatType | null {
  if (!text) return null;
  const value = text.toLowerCase().replace(/[_-]/g, " ").trim();
  return BOAT_TYPE_PATTERNS.find((entry) => entry.pattern.test(value))?.type ?? null;
}

const BACKGROUND_PATTERNS: { tag: BackgroundTag; pattern: RegExp }[] = [
  { tag: "veteran", pattern: /\b(veteran|army|navy|marines?|usmc|air force|usaf|coast guard|national guard|military|deployed|navy seals?|seal team|soldier|combat)\b/ },
  { tag: "pilot", pattern: /\b(pilots?|aviator|aviation|airline|flies planes|fighter jets?|cfi)\b/ },
  { tag: "law_enforcement", pattern: /\b(police|cop|sheriff|deputy|detective|trooper|fbi|dea|law enforcement)\b/ },
  { tag: "first_responder", pattern: /\b(firefighter|fireman|paramedic|emt|first responder|fire department|fire rescue)\b/ },
  { tag: "licensed_captain", pattern: /\b(captain'?s license|licensed captain|uscg licen[cs]e|six ?pack|6 ?pack|100 ?ton)\b/ },
  { tag: "boat_owner", pattern: /\b(owns? an? (?:boat|yacht|\d+)|boat owner|current boat|trade ?in|upgrading from|owned (?:a|several) boats?)\b/ },
  { tag: "liveaboard", pattern: /\b(live ?aboard|live on (?:a|the) boat)\b/ },
  { tag: "cruiser", pattern: /\b(cruising|great loop|the loop|bahamas|island hopping|cruise the)\b/ },
  { tag: "sailor_racer", pattern: /\b(sailing|sailor|regatta|racing sailboats?|yacht club racing)\b/ },
  { tag: "sport_fisherman", pattern: /\b(fishing|fishes|fisherman|angler|tournaments?|marlin|tuna|mahi|sailfish|offshore fishing)\b/ },
  { tag: "diver", pattern: /\b(scuba|diving|diver|spearfishing|freediving)\b/ },
  { tag: "business_owner", pattern: /\b(business owner|owns? (?:a|his|her|their) (?:own )?(?:business|company)|entrepreneur|founder|ceo|self[- ]employed)\b/ },
  { tag: "medical", pattern: /\b(doctor|physician|surgeon|nurse|dentist|medical|anesthesiologist|cardiologist)\b/ },
  { tag: "engineer_tech", pattern: /\b(engineer|engineering|software|developer|tech company|programmer)\b/ },
  { tag: "finance_real_estate", pattern: /\b(finance|banker|banking|investment|investor|real estate|realtor|private equity|hedge fund|wall street|accountant|cpa)\b/ },
  { tag: "retired_second_career", pattern: /\b(retired|retiree|retirement|second career)\b/ },
  { tag: "family_boating", pattern: /\b(family|kids|children|grandkids|grandchildren)\b/ },
];

const BRANCH_PATTERNS: { branch: MilitaryBranch; pattern: RegExp }[] = [
  { branch: "marine_corps", pattern: /\b(marines?|usmc|marine corps)\b/ },
  { branch: "air_force", pattern: /\b(air force|usaf)\b/ },
  { branch: "coast_guard", pattern: /\b(coast guard|uscg)\b/ },
  { branch: "national_guard", pattern: /\bnational guard\b/ },
  { branch: "space_force", pattern: /\bspace force\b/ },
  { branch: "navy", pattern: /\b(navy|usn|seal team)\b/ },
  { branch: "army", pattern: /\b(army|army rangers?|green berets?)\b/ },
];

export function inferLeadBackground(text: string | null): { tags: BackgroundTag[]; branch: MilitaryBranch | null } {
  if (!text) return { tags: [], branch: null };
  const value = text.toLowerCase();
  const tags = BACKGROUND_PATTERNS.filter((entry) => entry.pattern.test(value)).map((entry) => entry.tag);
  const branch = BRANCH_PATTERNS.find((entry) => entry.pattern.test(value))?.branch ?? null;
  if (branch && !tags.includes("veteran")) tags.unshift("veteran");
  return { tags, branch };
}

export type LeadProfile = {
  contactId: string;
  name: string;
  budget: number | null;
  priceBand: PriceBand | null;
  boatTypeText: string | null;
  boatType: BoatType | null;
  language: string | null;
  location: string | null;
  priority: LeadPriority | null;
  hot: boolean;
  urgent: boolean;
  nurture: boolean;
  backgroundText: string | null;
  notes: string | null;
  backgroundTags: BackgroundTag[];
  branch: MilitaryBranch | null;
  topN: number;
};

export function toLeadProfile(request: MatchRequest): LeadProfile {
  const budget = parseBudget(request.budget);
  const urgent = request.hot || (request.priority !== null && URGENT_PRIORITIES.includes(request.priority));
  const nurture = !urgent && request.priority !== null && NURTURE_PRIORITIES.includes(request.priority);
  const background = inferLeadBackground([request.lead_background, request.notes].filter(Boolean).join("\n") || null);
  return {
    contactId: request.contactId,
    name: request.name,
    budget,
    priceBand: budget !== null ? priceBandFor(budget) : null,
    boatTypeText: request.boat_type,
    boatType: normalizeBoatType(request.boat_type),
    language: request.language ? normalizeLanguage(request.language) : null,
    location: request.location,
    priority: request.priority,
    hot: request.hot,
    urgent,
    nurture,
    backgroundText: request.lead_background,
    notes: request.notes,
    backgroundTags: background.tags,
    branch: background.branch,
    topN: request.topN,
  };
}
