/**
 * File: packages/shared/src/matching/tags.ts
 * Purpose: The structured persona tags used for lead matching: the controlled vocabularies, the Zod schema Claude's
 * extraction must fill (unknown values are null, never guessed), clean-up of an extraction, merging admin overrides over
 * extracted values (overrides always win), and the do-not-mention guard that keeps sensitive topics out of anything a
 * setter or lead could read.
 *
 * Functions:
 * - emptyPersonaTags(): a tag set with every field null.
 * - personaSourceText(markdown): the persona text normalised for hashing (trimmed, \n line endings), or null when empty.
 * - normalizeLanguage(input): a language name or code as the lowercase English name ("es" and "Español" become "spanish").
 * - containsDoNotMention(text, doNotMention): true when text repeats a do-not-mention phrase or one of its significant words.
 * - cleanStrings(values, doNotMention): trimmed, de-duplicated strings without do-not-mention content; null when none are left.
 * - uniqueOrNull(values): the values without repeats; null when empty.
 * - cleanText(value, doNotMention): the trimmed text, or null when empty or when it touches a do-not-mention topic.
 * - cleanPersonaTags(raw): trims and de-duplicates values, turns empty values into null, normalises languages, drops an out-of-range lead cap and strips do-not-mention content from every other field.
 * - mergePersonaTags(extracted, overrides): the effective tags, taking each overridden field from the overrides.
 * - hasAnyPersonaTag(tags): true when at least one field has a value.
 */
import { z } from "zod";

export const BACKGROUND_TAGS = [
  "veteran",
  "pilot",
  "law_enforcement",
  "first_responder",
  "licensed_captain",
  "boat_owner",
  "liveaboard",
  "cruiser",
  "sailor_racer",
  "sport_fisherman",
  "diver",
  "business_owner",
  "medical",
  "engineer_tech",
  "finance_real_estate",
  "retired_second_career",
  "family_boating",
] as const;
export type BackgroundTag = (typeof BACKGROUND_TAGS)[number];

export const MILITARY_BRANCHES = ["army", "navy", "air_force", "marine_corps", "coast_guard", "space_force", "national_guard"] as const;
export type MilitaryBranch = (typeof MILITARY_BRANCHES)[number];

export const BOAT_TYPES = [
  "sportfish",
  "center_console",
  "express_cruiser",
  "motor_yacht",
  "trawler",
  "catamaran",
  "sailboat",
  "superyacht",
  "dayboat",
] as const;
export type BoatType = (typeof BOAT_TYPES)[number];

export const PRICE_BANDS = ["under_250k", "250k_750k", "750k_2m", "2m_5m", "5m_plus"] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export const FOLLOW_UP_STYLES = ["chaser", "consistent", "light_touch", "wait_for_lead"] as const;
export type FollowUpStyle = (typeof FOLLOW_UP_STYLES)[number];

export const RESPONSE_SPEEDS = ["within_minutes", "within_hour", "same_day", "next_day", "slower"] as const;
export type ResponseSpeed = (typeof RESPONSE_SPEEDS)[number];

export const CONTACT_CHANNELS = ["call", "text", "whatsapp", "email", "video", "in_person"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const LANGUAGE_FLUENCIES = ["native", "fluent", "conversational", "basic"] as const;
export type LanguageFluency = (typeof LANGUAGE_FLUENCIES)[number];

export const backgroundTagSchema = z.object({
  tag: z.enum(BACKGROUND_TAGS),
  branch: z.enum(MILITARY_BRANCHES).nullable().describe("Military branch, only for the veteran tag; null otherwise or when not stated"),
  detail: z.string().nullable().describe("A few words of specifics, such as the role or years; null when not stated"),
});
export type BackgroundTagEntry = z.infer<typeof backgroundTagSchema>;

export const languageSkillSchema = z.object({
  language: z.string().describe("Lowercase English name of the language, such as spanish"),
  fluency: z.enum(LANGUAGE_FLUENCIES).nullable(),
});
export type LanguageSkill = z.infer<typeof languageSkillSchema>;

export const personaTagsSchema = z.object({
  backgroundTags: z.array(backgroundTagSchema).nullable(),
  storyKeywords: z.array(z.string()).nullable().describe("Short relatable life-story hooks a buyer could bond over"),
  boatTypes: z.array(z.enum(BOAT_TYPES)).nullable(),
  priceBands: z.array(z.enum(PRICE_BANDS)).nullable(),
  buyerTypesClick: z.array(z.string()).nullable(),
  strengths: z.array(z.string()).nullable(),
  avoidNotes: z.array(z.string()).nullable(),
  languages: z.array(languageSkillSchema).nullable(),
  followUpStyle: z.enum(FOLLOW_UP_STYLES).nullable(),
  responseSpeed: z.enum(RESPONSE_SPEEDS).nullable(),
  channels: z.array(z.enum(CONTACT_CHANNELS)).nullable(),
  sellingStyle: z.string().nullable(),
  maxLeadsPerWeek: z.number().int().nullable(),
  availabilityText: z.string().nullable(),
  doNotMention: z.array(z.string()).nullable(),
});
export type PersonaTags = z.infer<typeof personaTagsSchema>;
export type PersonaTagField = keyof PersonaTags;

export const PERSONA_TAG_FIELDS = Object.keys(personaTagsSchema.shape) as PersonaTagField[];

export const personaTagOverridesSchema = personaTagsSchema.partial();
export type PersonaTagOverrides = z.infer<typeof personaTagOverridesSchema>;

export const MAX_LEADS_PER_WEEK_LIMIT = 50;

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "english",
  eng: "english",
  ingles: "english",
  inglés: "english",
  es: "spanish",
  spa: "spanish",
  español: "spanish",
  espanol: "spanish",
  castellano: "spanish",
  pt: "portuguese",
  português: "portuguese",
  portugues: "portuguese",
  fr: "french",
  français: "french",
  francais: "french",
  it: "italian",
  italiano: "italian",
  de: "german",
  deutsch: "german",
  ru: "russian",
  русский: "russian",
  zh: "mandarin",
  chinese: "mandarin",
  nl: "dutch",
  ar: "arabic",
  he: "hebrew",
  el: "greek",
};

const DO_NOT_MENTION_STOPWORDS = new Set([
  "about",
  "anything",
  "avoid",
  "bring",
  "brings",
  "client",
  "clients",
  "dont",
  "don't",
  "from",
  "have",
  "into",
  "lead",
  "leads",
  "mention",
  "never",
  "please",
  "talk",
  "that",
  "their",
  "them",
  "there",
  "they",
  "things",
  "this",
  "time",
  "topic",
  "topics",
  "with",
  "your",
]);

export function emptyPersonaTags(): PersonaTags {
  return Object.fromEntries(PERSONA_TAG_FIELDS.map((field) => [field, null])) as PersonaTags;
}

export function personaSourceText(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const text = markdown.replace(/\r\n?/g, "\n").trim();
  return text.length > 0 ? text : null;
}

export function normalizeLanguage(input: string): string {
  const key = input.trim().toLowerCase();
  return LANGUAGE_ALIASES[key] ?? key;
}

export function containsDoNotMention(text: string, doNotMention: readonly string[] | null | undefined): boolean {
  if (!doNotMention || doNotMention.length === 0) return false;
  const haystack = text.toLowerCase();
  const words = new Set(haystack.split(/[^\p{L}\p{N}']+/u).filter(Boolean));
  return doNotMention.some((item) => {
    const phrase = item.trim().toLowerCase();
    if (!phrase) return false;
    if (haystack.includes(phrase)) return true;
    return phrase
      .split(/[^\p{L}\p{N}']+/u)
      .filter((word) => word.length >= 4 && !DO_NOT_MENTION_STOPWORDS.has(word))
      .some((word) => words.has(word));
  });
}

function cleanStrings(values: readonly string[] | null, doNotMention: readonly string[] | null): string[] | null {
  if (!values) return null;
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const text = value.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key) || containsDoNotMention(text, doNotMention)) continue;
    seen.add(key);
    kept.push(text);
  }
  return kept.length > 0 ? kept : null;
}

function uniqueOrNull<T>(values: readonly T[] | null): T[] | null {
  if (!values) return null;
  const unique = [...new Set(values)];
  return unique.length > 0 ? unique : null;
}

function cleanText(value: string | null, doNotMention: readonly string[] | null): string | null {
  const text = value?.trim() ?? "";
  if (!text || containsDoNotMention(text, doNotMention)) return null;
  return text;
}

export function cleanPersonaTags(raw: PersonaTags): PersonaTags {
  const doNotMention = cleanStrings(raw.doNotMention, null);
  const backgroundSeen = new Set<string>();
  const backgroundTags = (raw.backgroundTags ?? [])
    .filter((entry) => {
      const key = `${entry.tag}:${entry.branch ?? ""}`;
      if (backgroundSeen.has(key)) return false;
      backgroundSeen.add(key);
      return true;
    })
    .map((entry) => ({
      tag: entry.tag,
      branch: entry.tag === "veteran" ? entry.branch : null,
      detail: cleanText(entry.detail, doNotMention),
    }));
  const languageSeen = new Set<string>();
  const languages = (raw.languages ?? [])
    .map((entry) => ({ language: normalizeLanguage(entry.language), fluency: entry.fluency }))
    .filter((entry) => {
      if (!entry.language || languageSeen.has(entry.language)) return false;
      languageSeen.add(entry.language);
      return true;
    });
  const cap = raw.maxLeadsPerWeek;
  return {
    backgroundTags: backgroundTags.length > 0 ? backgroundTags : null,
    storyKeywords: cleanStrings(raw.storyKeywords, doNotMention),
    boatTypes: uniqueOrNull(raw.boatTypes),
    priceBands: uniqueOrNull(raw.priceBands),
    buyerTypesClick: cleanStrings(raw.buyerTypesClick, doNotMention),
    strengths: cleanStrings(raw.strengths, doNotMention),
    avoidNotes: cleanStrings(raw.avoidNotes, null),
    languages: languages.length > 0 ? languages : null,
    followUpStyle: raw.followUpStyle,
    responseSpeed: raw.responseSpeed,
    channels: uniqueOrNull(raw.channels),
    sellingStyle: cleanText(raw.sellingStyle, doNotMention),
    maxLeadsPerWeek: cap !== null && Number.isInteger(cap) && cap >= 1 && cap <= MAX_LEADS_PER_WEEK_LIMIT ? cap : null,
    availabilityText: cleanText(raw.availabilityText, doNotMention),
    doNotMention,
  };
}

export function mergePersonaTags(extracted: PersonaTags | null, overrides: PersonaTagOverrides | null | undefined): PersonaTags {
  const merged = { ...(extracted ?? emptyPersonaTags()) } as Record<PersonaTagField, unknown>;
  for (const field of PERSONA_TAG_FIELDS) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, field) && overrides[field] !== undefined) {
      merged[field] = overrides[field];
    }
  }
  return merged as PersonaTags;
}

export function hasAnyPersonaTag(tags: PersonaTags | null): boolean {
  if (!tags) return false;
  return PERSONA_TAG_FIELDS.some((field) => {
    const value = tags[field];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
  });
}
