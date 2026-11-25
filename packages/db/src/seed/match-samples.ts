/**
 * File: packages/db/src/seed/match-samples.ts
 * Purpose: Six made-up active brokers for trying lead matching locally (`pnpm db:seed -- --match-samples`, never in
 * production): a Navy veteran, an airline pilot, a Spanish speaker, a light-touch sailor, a firefighter who waits for
 * leads to call, and one whose persona is empty. Their personas follow docs/templates/persona-template.md with the
 * broker persona form's answers. Each filled persona also gets its tags as a fixture (extraction_model "seed-fixture"),
 * so matching works without an Anthropic key; `pnpm match:backfill -- --force` re-extracts them with Claude.
 * Fictional people only; never real broker data.
 *
 * Functions:
 * - personaHash(markdown): the sha256 of the persona's normalised text, the same hash the API stores as source_hash.
 * - seedMatchSamples(tx, options): creates the six brokers (skipping any whose email exists) with every onboarding step approved, and their fixture tags; returns each email with "created" or "existing".
 */
import { cleanPersonaTags, personaSourceText, type PersonaTags } from "@bp/shared";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { approveAllSteps, createBroker } from "../brokers";
import type { Transaction } from "../client";
import { accounts, brokerPersonaTags, users } from "../schema";
import { sha256 } from "./contract-templates";

type MatchSample = { name: string; email: string; phone: string; personaMd: string | null; tags: PersonaTags | null };

export const MATCH_SAMPLE_FIXTURE_MODEL = "seed-fixture";

const TOM_PERSONA = `# Persona: Tom Brennan

## Background
US Navy veteran, 20 years as a surface warfare officer; retired as a Commander. Grew up fishing the Outer Banks with his dad. Before yachting he ran logistics for a shipyard in Norfolk. Relatable stories: deployments in the Persian Gulf, learning to drive ships before he could drive a car, teaching his kids to fish.

## Personality and communication style
Direct and organised, calls rather than texts. Follow-up style: "I follow up hard: every lead gets a call the same day and I keep going until I get an answer." Replies within the hour during the day. Channels: phone calls first, then text and email. Selling style: consultative and numbers-driven, lays out sold comps.

## Strengths
Sportfish and center console knowledge, sea trials, negotiation, running surveys.

## Clients they click with
Veterans and active-duty military, first-time buyers who want a straight talker, offshore fishermen.

## Clients to avoid pairing them with
Buyers who want lots of small talk and slow back-and-forth by text.

## Languages
English (native).

## Wins from good matches
Aug 2026 - paired with a retired Marine; closed a 42' Yellowfin in three weeks.

## Notes
Boat types: sportfish, center consoles, express cruisers. Price ranges: $250k–$750k and $750k–$2M. Availability: weekdays and Saturday mornings, Fort Lauderdale to Jupiter. Max new leads per week: 4. Things not to mention to leads: his divorce.
`;

const LISA_PERSONA = `# Persona: Lisa Hartmann

## Background
Former airline captain, 22 years flying the 777; still holds her ATP and flies a Cessna on weekends. Grew up in Hamburg, Germany, and moved to Florida in her twenties. USCG 100-ton licensed captain. Relatable stories: flying through storms, check rides, how pre-flight checklists carry over to boat surveys.

## Personality and communication style
Calm, precise, checklist-driven. Follow-up style: "I follow up consistently, but it slips when I'm busy with showings." Replies the same day. Channels: email first, then phone. Selling style: the educator, walks buyers through systems and running costs.

## Strengths
Motor yachts, systems and electronics, explaining maintenance budgets, large-yacht closings.

## Clients they click with
Pilots and aviation people, engineers, detail-oriented buyers, first-time big-yacht buyers.

## Clients to avoid pairing them with
Buyers who want a fast, pushy deal.

## Languages
German (native), English (fluent).

## Wins from good matches
Jun 2026 - paired with a retired airline pilot; sold a 65' Hatteras motor yacht.

## Notes
Boat types: motor yachts, superyachts, trawlers. Price ranges: $750k–$2M, $2M–$5M, $5M+. Availability: Tuesday to Saturday, Miami and Fort Lauderdale. Max new leads per week: 3. Things not to mention to leads: the airline she flew for.
`;

const CARLOS_PERSONA = `# Persona: Carlos Ruiz

## Background
Born in Bogotá, Colombia, moved to Miami at 15. Twelve years in private banking for Latin American families before yachting. Owns a 38' express cruiser he takes to Bimini with his wife and kids. Relatable stories: emigrating as a teenager, weekends in Bimini with the family.

## Personality and communication style
Warm and energetic, on WhatsApp all day. Follow-up style: "I follow up hard: every lead hears from me the same day and every few days after." Replies within minutes. Channels: WhatsApp, text, phone. Selling style: relationship-first, hosts buyers on his own boat.

## Strengths
Latin American and international buyers, financing and wire logistics, express cruisers and motor yachts.

## Clients they click with
Spanish-speaking families, Latin American buyers, finance and business people, first-time owners with kids.

## Clients to avoid pairing them with
Buyers who only want to communicate by email.

## Languages
Spanish (native), English (fluent), Portuguese (conversational).

## Wins from good matches
Sep 2026 - Venezuelan family buying their first boat; closed a 45' Sea Ray entirely in Spanish.

## Notes
Boat types: express cruisers, motor yachts, center consoles. Price ranges: $250k–$750k and $750k–$2M. Availability: seven days a week, Miami and Key Biscayne. Max new leads per week: 5. Things not to mention to leads: nothing specific.
`;

const GRACE_PERSONA = `# Persona: Grace Whitfield

## Background
Retired ICU nurse after 25 years. Lived aboard a 40' catamaran for three years, cruising the Bahamas and the Exumas. Races on Wednesday nights at her yacht club. Relatable stories: three years living aboard, crossing the Gulf Stream at night, learning to sail in her fifties.

## Personality and communication style
Gentle, patient, never pushy. Follow-up style: "Light touch: I check in once, then let them come to me." Replies the next day. Channels: email and text. Selling style: low-pressure, lets buyers set the pace.

## Strengths
Catamarans and sailboats, cruising set-ups, liveaboard planning, first-time cruisers.

## Clients they click with
Couples planning to cruise or live aboard, retirees, medical professionals, sailors.

## Clients to avoid pairing them with
Buyers in a hurry who want daily calls; sportfish buyers.

## Languages
English (native), French (basic).

## Wins from good matches
Jul 2026 - retired doctor couple; sold a 44' Leopard catamaran after six months of patient conversations.

## Notes
Boat types: catamarans, sailboats, trawlers. Price ranges: under $250k and $250k–$750k. Availability: Monday to Thursday, Stuart and Palm Beach. Max new leads per week: 2. Things not to mention to leads: her late husband's illness.
`;

const MARCUS_PERSONA = `# Persona: Marcus Bell

## Background
18 years with Miami-Dade Fire Rescue as a firefighter and paramedic. Fishes kingfish tournaments out of Key Largo and owns a 26' center console. Relatable stories: tournament wins, the crew from his fire station who fish with him.

## Personality and communication style
Laid-back and friendly, prefers buyers to reach out first. Follow-up style: "I'd rather not follow up at all; if they're serious they'll call back." Replies the same day. Channels: phone and text. Selling style: casual, talks fishing first and boats second.

## Strengths
Center consoles, tournament set-ups, outboards and electronics.

## Clients they click with
First responders and police, weekend fishermen, blue-collar buyers, first-time owners.

## Clients to avoid pairing them with
Luxury buyers who expect white-glove service.

## Languages
English (native), Spanish (conversational).

## Wins from good matches
May 2026 - a fellow firefighter bought a 28' Regulator after a day fishing together.

## Notes
Boat types: center consoles, sportfish, day boats. Price ranges: under $250k and $250k–$750k. Availability: days off between 24-hour shifts, the Keys and Homestead. Max new leads per week: 3. Things not to mention to leads: his workers' comp claim.
`;

export const MATCH_SAMPLES: MatchSample[] = [
  {
    name: "Tom Brennan",
    email: "tom.brennan@example.com",
    phone: "+15615550201",
    personaMd: TOM_PERSONA,
    tags: {
      backgroundTags: [
        { tag: "veteran", branch: "navy", detail: "Surface warfare officer, 20 years, retired Commander" },
        { tag: "sport_fisherman", branch: null, detail: "Grew up fishing the Outer Banks" },
      ],
      storyKeywords: ["Persian Gulf deployments", "drove ships before he could drive a car", "teaching his kids to fish", "fishing the Outer Banks"],
      boatTypes: ["sportfish", "center_console", "express_cruiser"],
      priceBands: ["250k_750k", "750k_2m"],
      buyerTypesClick: ["Veterans and active-duty military", "First-time buyers who want a straight talker", "Offshore fishermen"],
      strengths: ["Sportfish and center console knowledge", "Sea trials", "Negotiation", "Running surveys"],
      avoidNotes: ["Buyers who want lots of small talk and slow back-and-forth by text"],
      languages: [{ language: "english", fluency: "native" }],
      followUpStyle: "chaser",
      responseSpeed: "within_hour",
      channels: ["call", "text", "email"],
      sellingStyle: "Consultative and numbers-driven, lays out sold comps",
      maxLeadsPerWeek: 4,
      availabilityText: "Weekdays and Saturday mornings, Fort Lauderdale to Jupiter",
      doNotMention: ["his divorce"],
    },
  },
  {
    name: "Lisa Hartmann",
    email: "lisa.hartmann@example.com",
    phone: "+15615550202",
    personaMd: LISA_PERSONA,
    tags: {
      backgroundTags: [
        { tag: "pilot", branch: null, detail: "Captain on the 777 for 22 years, still flies a Cessna" },
        { tag: "licensed_captain", branch: null, detail: "USCG 100-ton" },
      ],
      storyKeywords: ["flying through storms", "check rides", "pre-flight checklists and boat surveys", "grew up in Hamburg, Germany"],
      boatTypes: ["motor_yacht", "superyacht", "trawler"],
      priceBands: ["750k_2m", "2m_5m", "5m_plus"],
      buyerTypesClick: ["Pilots and aviation people", "Engineers", "Detail-oriented buyers", "First-time big-yacht buyers"],
      strengths: ["Motor yachts", "Systems and electronics", "Explaining maintenance budgets", "Large-yacht closings"],
      avoidNotes: ["Buyers who want a fast, pushy deal"],
      languages: [
        { language: "german", fluency: "native" },
        { language: "english", fluency: "fluent" },
      ],
      followUpStyle: "consistent",
      responseSpeed: "same_day",
      channels: ["email", "call"],
      sellingStyle: "The educator: walks buyers through systems and running costs",
      maxLeadsPerWeek: 3,
      availabilityText: "Tuesday to Saturday, Miami and Fort Lauderdale",
      doNotMention: ["the airline she flew for"],
    },
  },
  {
    name: "Carlos Ruiz",
    email: "carlos.ruiz@example.com",
    phone: "+15615550203",
    personaMd: CARLOS_PERSONA,
    tags: {
      backgroundTags: [
        { tag: "finance_real_estate", branch: null, detail: "Twelve years in private banking" },
        { tag: "boat_owner", branch: null, detail: "Owns a 38' express cruiser" },
        { tag: "family_boating", branch: null, detail: "Takes his wife and kids to Bimini" },
      ],
      storyKeywords: ["emigrated from Colombia as a teenager", "weekends in Bimini with the family"],
      boatTypes: ["express_cruiser", "motor_yacht", "center_console"],
      priceBands: ["250k_750k", "750k_2m"],
      buyerTypesClick: ["Spanish-speaking families", "Latin American buyers", "Finance and business people", "First-time owners with kids"],
      strengths: ["Latin American and international buyers", "Financing and wire logistics", "Express cruisers and motor yachts"],
      avoidNotes: ["Buyers who only want to communicate by email"],
      languages: [
        { language: "spanish", fluency: "native" },
        { language: "english", fluency: "fluent" },
        { language: "portuguese", fluency: "conversational" },
      ],
      followUpStyle: "chaser",
      responseSpeed: "within_minutes",
      channels: ["whatsapp", "text", "call"],
      sellingStyle: "Relationship-first, hosts buyers on his own boat",
      maxLeadsPerWeek: 5,
      availabilityText: "Seven days a week, Miami and Key Biscayne",
      doNotMention: null,
    },
  },
  {
    name: "Grace Whitfield",
    email: "grace.whitfield@example.com",
    phone: "+15615550204",
    personaMd: GRACE_PERSONA,
    tags: {
      backgroundTags: [
        { tag: "medical", branch: null, detail: "Retired ICU nurse, 25 years" },
        { tag: "liveaboard", branch: null, detail: "Three years aboard a 40' catamaran" },
        { tag: "cruiser", branch: null, detail: "Bahamas and the Exumas" },
        { tag: "sailor_racer", branch: null, detail: "Wednesday night club racing" },
        { tag: "retired_second_career", branch: null, detail: null },
      ],
      storyKeywords: ["three years living aboard", "crossing the Gulf Stream at night", "learned to sail in her fifties"],
      boatTypes: ["catamaran", "sailboat", "trawler"],
      priceBands: ["under_250k", "250k_750k"],
      buyerTypesClick: ["Couples planning to cruise or live aboard", "Retirees", "Medical professionals", "Sailors"],
      strengths: ["Catamarans and sailboats", "Cruising set-ups", "Liveaboard planning", "First-time cruisers"],
      avoidNotes: ["Buyers in a hurry who want daily calls", "Sportfish buyers"],
      languages: [
        { language: "english", fluency: "native" },
        { language: "french", fluency: "basic" },
      ],
      followUpStyle: "light_touch",
      responseSpeed: "next_day",
      channels: ["email", "text"],
      sellingStyle: "Low-pressure, lets buyers set the pace",
      maxLeadsPerWeek: 2,
      availabilityText: "Monday to Thursday, Stuart and Palm Beach",
      doNotMention: ["her late husband's illness"],
    },
  },
  {
    name: "Derek Lang",
    email: "derek.lang@example.com",
    phone: "+15615550205",
    personaMd: null,
    tags: null,
  },
  {
    name: "Marcus Bell",
    email: "marcus.bell@example.com",
    phone: "+15615550206",
    personaMd: MARCUS_PERSONA,
    tags: {
      backgroundTags: [
        { tag: "first_responder", branch: null, detail: "Firefighter and paramedic, Miami-Dade Fire Rescue, 18 years" },
        { tag: "sport_fisherman", branch: null, detail: "Kingfish tournaments out of Key Largo" },
        { tag: "boat_owner", branch: null, detail: "Owns a 26' center console" },
      ],
      storyKeywords: ["kingfish tournament wins", "fishes with the crew from his fire station"],
      boatTypes: ["center_console", "sportfish", "dayboat"],
      priceBands: ["under_250k", "250k_750k"],
      buyerTypesClick: ["First responders and police", "Weekend fishermen", "Blue-collar buyers", "First-time owners"],
      strengths: ["Center consoles", "Tournament set-ups", "Outboards and electronics"],
      avoidNotes: ["Luxury buyers who expect white-glove service"],
      languages: [
        { language: "english", fluency: "native" },
        { language: "spanish", fluency: "conversational" },
      ],
      followUpStyle: "wait_for_lead",
      responseSpeed: "same_day",
      channels: ["call", "text"],
      sellingStyle: "Casual: talks fishing first and boats second",
      maxLeadsPerWeek: 3,
      availabilityText: "Days off between 24-hour shifts, the Keys and Homestead",
      doNotMention: ["his workers' comp claim"],
    },
  },
];

export function personaHash(markdown: string | null): string | null {
  const text = personaSourceText(markdown);
  return text ? sha256(new TextEncoder().encode(text)) : null;
}

export async function seedMatchSamples(
  tx: Transaction,
  options: { now: Date; password: string | null; reviewedBy: string | null },
): Promise<{ email: string; outcome: "created" | "existing" }[]> {
  const results: { email: string; outcome: "created" | "existing" }[] = [];
  for (const sample of MATCH_SAMPLES) {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, sample.email));
    if (existing) {
      results.push({ email: sample.email, outcome: "existing" });
      continue;
    }
    const { brokerId, userId } = await createBroker(tx, {
      name: sample.name,
      email: sample.email,
      phone: sample.phone,
      level: "senior",
      status: "active",
      joinedAt: "2026-06-01",
      onboardedAt: "2026-06-12",
      inHouseSplit: 40,
      selfGeneratedSplit: 60,
      personaMd: sample.personaMd,
    });
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
    if (options.password) {
      await tx.insert(accounts).values({
        userId,
        accountId: userId,
        providerId: "credential",
        password: await hashPassword(options.password),
      });
    }
    await approveAllSteps(tx, { brokerId, reviewedBy: options.reviewedBy, note: "Sample broker for lead matching", now: options.now });
    if (sample.tags) {
      await tx.insert(brokerPersonaTags).values({
        brokerId,
        ...cleanPersonaTags(sample.tags),
        sourceHash: personaHash(sample.personaMd),
        extractedAt: options.now,
        extractionModel: MATCH_SAMPLE_FIXTURE_MODEL,
      });
    }
    results.push({ email: sample.email, outcome: "created" });
  }
  return results;
}
