/**
 * File: apps/web/src/lib/content.ts
 * Purpose: Fixed copy shown on screens: the "first 90 days" plan from the onboarding manual (1d), the onboarding
 * stages summary on the welcome screen (1a), and the empty persona template from docs/templates/persona-template.md.
 *
 * Functions:
 * - personaTemplate(name): the persona template with the broker's name filled in.
 */
export const FIRST_90_DAYS = [
  { days: "Days 1–7", title: "Get legal, logged in, loud", body: "100 names loaded into GoHighLevel." },
  { days: "Days 8–21", title: "Learn the product", body: "Hulls, engines, builders. Walk the docks." },
  { days: "Days 15–30", title: "First inventory calls", body: "50 real conversations. Book a first showing." },
  { days: "Days 30–60", title: "First listing signed", body: "Market analysis, listing presentation, Central Exclusive." },
  { days: "Days 60–90", title: "First offer written", body: "P&S executed, deposit wired, survey scheduled." },
  { days: "Day 90", title: "Incentive review", body: "Bonuses open once you've closed 2 deals." },
] as const;

export const ONBOARDING_STAGES = [
  { title: "Paperwork", body: "ID, contract & NDA, W-9, bio and headshot" },
  { title: "Your Florida license", body: "File with DBPR or transfer your license to 365" },
  { title: "Your tools", body: "365 email, BoatWizard, YachtCloser and GoHighLevel" },
] as const;

export function personaTemplate(name: string): string {
  return `# Persona: ${name}

## Background
Where they come from before yachting, and anything in their story clients relate to.

## Personality and communication style


## Strengths


## Clients they click with


## Clients to avoid pairing them with


## Languages


## Wins from good matches


## Notes
Anything else admins should know when routing leads.
`;
}
