/**
 * File: apps/web/src/lib/content.ts
 * Purpose: Fixed copy shown on screens: the short Part 0 welcome (the 365 Standard, its NEVERs and the manual's text)
 * and the "first 90 days" plan from the onboarding manual (1d, SPEC D28), the onboarding
 * stages summary on the welcome screen (1a), and the empty persona template from docs/templates/persona-template.md.
 *
 * Functions:
 * - personaTemplate(name): the persona template with the broker's name filled in.
 */
import type { GuidanceCallout } from "@bp/shared";

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

export const WELCOME_STANDARD: { lede: string; todoItems: string[]; callouts: GuidanceCallout[]; fullTextMd: string } = {
  lede: "We are not selling vessels. We are placing clients into a legacy asset and a lifestyle, with a level of precision the industry has not been forced to match.",
  todoItems: [
    "Tell the client the bad news first, every time.",
    "Send three boats, not eleven, and know why each one is there.",
    "Keep contracts clean, HINs verified and deposits wired.",
    "Build every search around how the client will use the boat.",
    "Be honest about activity versus production.",
  ],
  callouts: [
    { kind: "NEVER", text: "Quote a listing price you can't defend with sold comps." },
    { kind: "NEVER", text: "Send a client to a boat you haven't confirmed is available and as described." },
    { kind: "NEVER", text: "Downplay a survey finding to protect a commission." },
    { kind: "NEVER", text: "Accept a deposit by any method other than wire." },
    { kind: "NEVER", text: "Speak poorly of a competing brokerage or broker." },
    { kind: "HOUSE RULE", text: "Any question about a deal, a client, a contract or your commission: call. Don't guess." },
  ],
  fullTextMd: `## The 365 Standard

We are not selling vessels. We are placing clients into a legacy asset and a lifestyle, and we are doing it with a level of precision the industry has not been forced to match.

## The five commitments

| Commitment | What it means in practice |
|---|---|
| Trust | The client hears the bad news from us first. Every time. A survey finding, a soft comp, a lien — we bring it before they find it. |
| Exclusivity | Curated, not catalogued. We never send a client eleven boats. We send three, and we know why each one is on the list. |
| Precision | Contracts clean, dates correct, HINs verified, deposits wired. Paperwork errors are self-inflicted losses. |
| Bespoke | Every client gets a search built around how they actually intend to use the boat, not around what we happen to have listed. |
| Performance | Activity is measured, coached, and rewarded. Effort is not the same as production, and we are honest with each other about the difference. |

## The three sentences that define our positioning

- **On who we are:** "365 Yachts is a Palm Beach–based international brokerage built for owners who want their transaction handled at the standard of a private banking relationship, not a boat lot."
- **On why a seller lists with us:** "You get an exclusive, an honest number backed by real sold comps, a marketing package built to travel internationally, and a broker who is required to update you every week whether there is news or not."
- **On why a buyer works with us:** "We will show you three boats, not thirty. We will tell you which one we would not buy, and why. And we will have already called the listing broker before you get in the car."

## What we do not do

> [!NEVER]
> Quote a listing price we cannot defend with sold comps. Send a client to a boat we have not confirmed is still available and in the condition represented. Downplay a survey finding to protect a commission. Accept a deposit by any method other than wire. Speak poorly of a competing brokerage or broker. We win on execution, not commentary.

> [!HOUSE RULE]
> For any question about a deal, a client, a contract, or your commission — call. Do not guess on anything that touches a client's money or the firm's compliance. Nobody has ever been criticized here for asking.`,
};
