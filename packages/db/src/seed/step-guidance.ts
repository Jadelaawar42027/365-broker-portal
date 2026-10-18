/**
 * File: packages/db/src/seed/step-guidance.ts
 * Purpose: The short guidance for each onboarding step (SPEC D28), taken from Modules 01, 02 and 06 (week one) of the
 * 365 Broker Onboarding Manual: 3 to 5 plain "What to do" bullets, one-line NEVER / WATCH / HOUSE RULE callouts, the
 * manual's original text for the "Read the full section" panel, empty video slots, and the optional knowledge check.
 * Bond and fee figures stay in the full text only, next to the manual's WATCH that they change.
 *
 * Functions:
 * - none
 */
import type { GuidanceCallout } from "@bp/shared";

export type StepGuidanceSeed = {
  todoItems: string[];
  callouts: GuidanceCallout[];
  fullTextMd: string;
  videoSlots?: string[];
  checkQuestions?: { prompt: string; options: string[]; correct: number; explanation: string }[];
};

const WEEK_ONE_INTRO = `Welcome to 365 Yachts. You have joined a team delivering seamless, tech-forward luxury yacht sales to an ultra-high-net-worth clientele. Everything below must be complete before you take your first client call.`;

const DOCUMENTS_TO_SUBMIT = `## Documents to submit

- Photo identification / driver's license
- Broker or salesperson license and bond copy, if applicable
- Personal professional bio summary, written by you
- Professional headshot
- Executed Employment Contract and NDA
- Completed W-9`;

const LICENSE_TABLE = `## Salesperson vs. broker

| | Salesperson | Broker |
|---|---|---|
| Surety bond | $10,000 | $25,000 |
| Initial application fee | $551 | $551 |
| Renewal fee | $500 | $500 |
| Change of affiliation | $100 | $100 |
| Escrow account | Not required — operates under employing broker | Must maintain an escrow account at a Florida financial institution |
| License held by | The employing broker, until employment ends | The individual |
| Term | Temporary 90-day license issued first; permanent two-year license once background checks clear | Renewal notice arrives at least 60 days before expiration |`;

const FEES_WATCH: GuidanceCallout = { kind: "WATCH", text: "DBPR fees and bond amounts change. Check the current figures on the DBPR site before you pay." };
const FEES_WATCH_FULL = `> [!WATCH]
> Fee and bond amounts are set by DBPR and change. Verify current figures on the DBPR site before you write a check. The table above reflects the schedule published as of this edition.`;

const PLATFORM_TABLE = `## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Install the 365 brand signature block with logo |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |`;

export const STEP_GUIDANCE: Readonly<Record<string, StepGuidanceSeed>> = {
  photo_id: {
    todoItems: [
      "Use your driver's license or passport.",
      "Lay it flat in good light, with all four corners showing.",
      "Check that every word is readable.",
      "Upload it here. A phone photo is fine.",
    ],
    callouts: [],
    fullTextMd: `${WEEK_ONE_INTRO}\n\n${DOCUMENTS_TO_SUBMIT}`,
  },
  contract_nda: {
    todoItems: [
      "Download the contract and the NDA below.",
      "Read both in full.",
      "Sign and date every place marked for you.",
      "Upload the signed pages here, as a PDF scan or clear photos.",
    ],
    callouts: [{ kind: "HOUSE RULE", text: "Your commission split is set in this contract. Nothing in the manual overrides your signed agreement." }],
    fullTextMd: `${DOCUMENTS_TO_SUBMIT}

## Week 1 checklist (Module 06)

- Employment contract and NDA executed

> [!HOUSE RULE]
> Your personal split is set individually with your Sales Executive based on experience and performance, formalized in writing with agreed terms, and executed by both parties in your new-hire contract. Nothing in this manual overrides your signed agreement.`,
  },
  bio: {
    todoItems: [
      "Write 100 to 200 words, in the first person.",
      "Say where you come from and what you know about boats.",
      "Name the kind of clients you love working with.",
      "No prices, no promises, no emojis.",
    ],
    callouts: [],
    fullTextMd: `${DOCUMENTS_TO_SUBMIT}

The bio is a **personal professional bio summary, written by you**. Clients read it before they call you.`,
  },
  headshot: {
    todoItems: [
      "Stand against a plain, light background.",
      "Shoulders up, facing the camera, in daylight.",
      "No sunglasses, hats or filters.",
      "Upload it here.",
    ],
    callouts: [],
    fullTextMd: `${DOCUMENTS_TO_SUBMIT}

Your headshot goes on your profile, your 365 email signature and our marketing.`,
  },
  w9: {
    todoItems: [
      "Download the blank W-9 below.",
      "Fill in your name, address and tax ID.",
      "Sign and date it.",
      "Upload it here. A phone photo is fine.",
    ],
    callouts: [],
    fullTextMd: `${DOCUMENTS_TO_SUBMIT}

## Why we need it (Module 04)

You are paid in irregular lumps, taxed as an independent contractor, and carried by nothing in between.

**Nothing is withheld.** Commission arrives gross. No income tax withheld, no self-employment tax withheld. The money in your account is not all yours, and the bill arrives whether you set it aside or not.`,
  },
  license_situation: {
    todoItems: [
      "Florida needs a license to sell any used boat over 32 feet.",
      "New to Florida brokerage? Pick the new license option.",
      "Already hold a Florida yacht and ship license? Pick transfer.",
      "Not sure? Pick \"Not licensed yet\" and we'll help.",
    ],
    callouts: [],
    fullTextMd: `Florida regulates yacht and ship brokers under Chapter 326, Florida Statutes, administered by the Department of Business and Professional Regulation (DBPR). A license is required to sell or offer to sell any used vessel over 32 feet.

${LICENSE_TABLE}

${FEES_WATCH_FULL}`,
  },
  dbpr_filing: {
    todoItems: [
      "New license: apply on the DBPR portal, with fingerprints, bond and fee.",
      "You get a temporary 90-day license while checks run.",
      "Transfer: request it through DBPR to 365 Yachts Inc.",
      "Tell your Sales Executive the day you submit.",
      "Upload the confirmation here.",
    ],
    callouts: [FEES_WATCH],
    videoSlots: ["How to file your DBPR application"],
    fullTextMd: `## Process

- **New to Florida brokerage** — Register with DBPR through the online license portal. Complete application, fingerprints, surety bond, and fee. You will receive a temporary 90-day license while background checks process.
- **Transferring an existing license** — Request a license transfer through DBPR to associate your license with 365 Yachts Inc. Notify your Sales Executive the day you submit.
- **Renewal** — Two-year cycle. Watch for the DBPR notice 60 days out. Do not let a license lapse — you cannot legally take a listing or write an offer with an expired credential.

## Official links

- DBPR Yacht & Ship Licensing — applications, forms, requirements
- DBPR Yacht & Ship FAQs — bond amounts, fees, license terms
- Chapter 326, Florida Statutes — the Florida Yacht and Ship Brokers Act

## Week 1 checklist (Module 06)

- Licensing application filed or transfer requested with DBPR

${FEES_WATCH_FULL}`,
  },
  license_bond: {
    todoItems: [
      "Find your license (temporary or permanent) and your surety bond.",
      "Check your name and license number are readable on both.",
      "Upload both here. You can add up to 5 files.",
    ],
    callouts: [
      { kind: "NEVER", text: "Never hold client funds personally. Every deposit goes to the brokerage escrow account by wire." },
      FEES_WATCH,
    ],
    fullTextMd: `${LICENSE_TABLE}

> [!NEVER]
> Never hold client funds personally, in any form, for any reason. All deposits go to the brokerage escrow account by wire. A salesperson who takes a deposit into a personal account has committed a licensing violation that ends careers.

${FEES_WATCH_FULL}`,
    checkQuestions: [
      {
        prompt: "Where must a client's deposit go?",
        options: ["Your personal account until closing", "The brokerage escrow account, by wire", "A check made out to you", "Cash, held by the seller"],
        correct: 1,
        explanation:
          "Never hold client funds personally. All deposits go to the brokerage escrow account by wire. Taking a deposit into a personal account is a licensing violation that ends careers.",
      },
    ],
  },
  email_signature: {
    todoItems: [
      "Sign in to your 365 Yachts email.",
      "Install the 365 brand signature with the logo.",
      "Send yourself a test email to check it.",
      "From now on, use this address for all client email.",
    ],
    callouts: [{ kind: "HOUSE RULE", text: "All client email goes through your 365 address with the brand signature. Texts and calls are fine." }],
    fullTextMd: `${PLATFORM_TABLE}

> [!HOUSE RULE]
> All client communication runs through your 365 Yachts email address with the brand signature. This is a compliance and brand-consistency requirement, not a preference. Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.

## Week 1 checklist (Module 06)

- 365 email active, brand signature installed`,
  },
  platform_logins: {
    todoItems: [
      "BoatWizard (the MLS): log in and run one practice search.",
      "YachtCloser (contracts): log in and review a sample deal file.",
      "GoHighLevel (the CRM): log in and start loading your contacts.",
      "Aim for 100 contacts in the CRM by day seven.",
    ],
    callouts: [],
    videoSlots: ["GoHighLevel CRM walkthrough", "BoatWizard walkthrough", "YachtCloser walkthrough"],
    fullTextMd: `${PLATFORM_TABLE}

## Week 1 checklist (Module 06)

- Logged into BoatWizard, YachtCloser, and GoHighLevel

## Days 1–7 (Your first 90 days)

**Get legal, get logged in, get loud** — Paperwork submitted, licensing started, all four platforms accessed. Build your contact list: everyone you know who owns a boat, works on boats, or is wealthy enough to buy one. Target 100 names in the CRM by day seven.`,
  },
};
