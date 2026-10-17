/**
 * File: packages/db/src/seed/training-content.ts
 * Purpose: Training content from the 365 Broker Onboarding Manual, Volume One (Edition 2026): Part 0 and Modules 01 to
 * 06 as short lessons that keep the manual's wording and callouts, multiple-choice questions answerable from the lesson
 * text alone, and the Volume Two parts as "coming soon" chapters. DBPR fees and bond figures carry a "verify before
 * publishing" admin note; the disputed Module 03 co-broke example is kept out of the questions.
 *
 * Functions:
 * - none
 */

export type TrainingSeedQuestion = {
  lesson: number;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  adminNote?: string;
};

export type TrainingSeedLesson = {
  title: string;
  bodyMd: string;
  adminNote?: string;
  videoPlaceholder?: boolean;
};

export type TrainingSeedChapter = {
  volume: 1 | 2;
  code: string;
  title: string;
  summary: string;
  scheduleLabel?: string;
  lessons: TrainingSeedLesson[];
  questions: TrainingSeedQuestion[];
};

const VERIFY_DBPR = "Verify before publishing: DBPR fees and bond amounts change. Check the current figures on the DBPR site.";

const PART_0: TrainingSeedChapter = {
  volume: 1,
  code: "0",
  title: "Start Here",
  summary: "How to use the manual, the 365 Standard, your first 90 days",
  lessons: [
    {
      title: "How to use this manual",
      bodyMd: `You are holding Volume One of a two-volume manual. This volume gets you legal, paid, measured, and productive. Volume Two is everything you will spend the rest of your career referring back to.

## The two volumes

| Volume | Covers | When you use it |
|---|---|---|
| **Volume One** · Onboarding Manual · Parts 0–I · Modules 01–06 | The 365 Standard, your first 90 days, week-one setup, licensing, commission structure, KPIs, and the quick start checklist. | Your first month, then once a quarter to re-check your numbers against the benchmarks. |
| **Volume Two** · Master Reference · Parts II–X · Modules 07–63 | The market, product mastery, the broker's craft, the sales engine, deal execution, brand and retention, competitive positioning, and the reference vault. | Every day, forever. Before calls, during deals, at the dock. |

## One numbering system

The two volumes share a single numbering scheme. Modules run 01 through 63 straight across both books, and Parts run 0 through IX. When any module points you to "Module 34" or "Part VI," that reference resolves the same way whichever volume you are holding. Nothing is duplicated between them.

## How to use Volume One

- **Day one: read it straight through.** It is short by design. Forty minutes end to end, and you will understand what is expected of you, how you get paid, and what you have to do this week.
- **Week one: work the checklist.** Module 06 is the operational spine of your first month. Tick it off in order. If you complete it on schedule you will be functional inside thirty days.
- **Then move to Volume Two.** Weeks two through four are product knowledge and process — Parts II and III of the Master Reference. Module 06 tells you exactly what to read and when.
- **Come back monthly.** Module 05 holds the KPIs your monthly performance review is built on. Read your own numbers against it before the review, not during it.

## How it is built

- **Numbered throughout** — every part and module carries a number that is unique across both volumes. When a module points you elsewhere, it names the number.
- **Contents** — the table of contents at the front lists every part and module with its page number.
- **Checklists** — every checklist is printed with tick boxes. Work down them with a pen; that is what they are for.
- **Searchable edition** — a web version of this volume is maintained alongside it with identical numbering. Ask your Sales Executive for the link.`,
    },
    {
      title: "What the callouts mean",
      bodyMd: `The manual marks its most important lines with five callouts. You will see them in every lesson. Here is what each one means.

> [!HOUSE RULE]
> A 365 Yachts policy. Not a suggestion. If you cannot follow it on a deal, call your Sales Executive before you proceed.

> [!NEVER]
> An action that creates legal, financial, or reputational exposure for you and the firm. There is no version of this that is fine.

> [!EDGE]
> Where we outperform. Use these deliberately — they are the reasons a seller signs with us instead of the brokerage down the dock.

> [!WATCH]
> A common failure point. Most deals that die, die here.

> [!FIELD NOTE]
> Practical intelligence from brokers who have done this hundreds of times. The stuff nobody writes down.`,
    },
    {
      title: "The 365 Standard",
      bodyMd: `We are not selling vessels. We are placing clients into a legacy asset and a lifestyle, and we are doing it with a level of precision the industry has not been forced to match.

## The five commitments

| Commitment | What it means in practice |
|---|---|
| Trust | The client hears the bad news from us first. Every time. A survey finding, a soft comp, a lien — we bring it before they find it. |
| Exclusivity | Curated, not catalogued. We never send a client eleven boats. We send three, and we know why each one is on the list. |
| Precision | Contracts clean, dates correct, HINs verified, deposits wired. Paperwork errors are self-inflicted losses. |
| Bespoke | Every client gets a search built around how they actually intend to use the boat, not around what we happen to have listed. |
| Performance | Activity is measured, coached, and rewarded. Effort is not the same as production, and we are honest with each other about the difference. |

## The three sentences that define our positioning

Say it this way.

- **On who we are:** "365 Yachts is a Palm Beach–based international brokerage built for owners who want their transaction handled at the standard of a private banking relationship, not a boat lot."
- **On why a seller lists with us:** "You get an exclusive, an honest number backed by real sold comps, a marketing package built to travel internationally, and a broker who is required to update you every week whether there is news or not."
- **On why a buyer works with us:** "We will show you three boats, not thirty. We will tell you which one we would not buy, and why. And we will have already called the listing broker before you get in the car."

## What we do not do

> [!NEVER]
> - Quote a listing price we cannot defend with sold comps.
> - Send a client to a boat we have not confirmed is still available and in the condition represented.
> - Downplay a survey finding to protect a commission.
> - Accept a deposit by any method other than wire.
> - Speak poorly of a competing brokerage or broker. We win on execution, not commentary.`,
    },
    {
      title: "Your first 90 days",
      bodyMd: `The brokers who make it past year one all did roughly the same things in the first ninety days. Here they are.

- **Days 1–7 — Get legal, get logged in, get loud.** Paperwork submitted, licensing started, all four platforms accessed. Build your contact list: everyone you know who owns a boat, works on boats, or is wealthy enough to buy one. Target 100 names in the CRM by day seven.
- **Days 8–21 — Learn the product until it is automatic.** Part III of this manual. You should be able to identify a Viking from a Hatteras at 200 yards, explain the difference between a planing and displacement hull to a stranger, and name the four common diesel manufacturers without hesitating. Walk docks. Ask captains questions.
- **Days 15–30 — First inventory calls.** Call on listings. Call FSBOs. Call expired listings. Your objective is not to sell — it is to have 50 real conversations with boat people and build the muscle. Book your first showing, even if it is not your listing.
- **Days 30–60 — First listing signed.** Run a real market analysis. Deliver a listing presentation. Get a Central Exclusive signed and posted correctly. One listing changes everything — it makes you a broker with inventory instead of a broker with hopes.
- **Days 60–90 — First offer written.** Write an offer. Any reasonable offer. Get a P&S executed, a deposit wired, and a survey scheduled. You will make mistakes on your first deal; make them with your Sales Executive on the phone, not alone.
- **Day 90 — Incentive eligibility review.** Bonuses, referral rewards, and performance incentives become available ninety days after your agreement is executed, provided you have closed a minimum of two deals. Book the review.

> [!FIELD NOTE]
> Inventory is bait. The more listings you carry, the more inbound calls you take, and inbound calls are how you meet buyers you would never have found cold. A broker with six listings does not work harder than a broker with one — they work with more leverage.`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "What does Volume One of the manual cover?",
      options: ["The full product and sales reference you use every day", "Getting you legal, paid, measured, and productive in your first month", "Charter brokerage and new construction", "The surveyor directory and haul-out yards"],
      correct: 1,
      explanation: "Volume One gets you legal, paid, measured, and productive. Volume Two is the Master Reference you keep coming back to.",
    },
    {
      lesson: 0,
      prompt: "A module tells you to see \"Module 34\". Which volume is it in?",
      options: ["It depends on which volume you are holding", "Always Volume One", "Module numbers run 01 to 63 straight across both volumes, so the number points to one place", "You need to check the searchable edition to know"],
      correct: 2,
      explanation: "The two volumes share one numbering system. A reference resolves the same way whichever volume you are holding.",
    },
    {
      lesson: 0,
      prompt: "Which module is the operational spine of your first month?",
      options: ["Module 06 — the Quick Start Checklist", "Module 05 — KPIs", "Module 02 — Licensing", "Module 34 in Volume Two"],
      correct: 0,
      explanation: "Week one: work the checklist. Module 06 is the operational spine of your first month — tick it off in order.",
    },
    {
      lesson: 0,
      prompt: "When should you read your own numbers against Module 05's KPIs?",
      options: ["During the monthly review, with your manager", "Once a year", "Only if you miss a target", "Before the monthly review, not during it"],
      correct: 3,
      explanation: "Come back monthly: read your own numbers against Module 05 before the review, not during it.",
    },
    {
      lesson: 1,
      prompt: "What does a NEVER callout mark?",
      options: ["A common failure point where most deals die", "An action that creates legal, financial, or reputational exposure — there is no version of it that is fine", "A 365 policy you can skip with a good reason", "Where 365 outperforms other brokerages"],
      correct: 1,
      explanation: "NEVER marks actions that create legal, financial, or reputational exposure for you and the firm.",
    },
    {
      lesson: 1,
      prompt: "You can't follow a HOUSE RULE on a deal. What do you do?",
      options: ["Call your Sales Executive before you proceed", "Proceed and explain afterwards", "Follow it next time", "Ask the other broker what they would do"],
      correct: 0,
      explanation: "A HOUSE RULE is a 365 policy, not a suggestion. If you cannot follow it on a deal, call your Sales Executive before you proceed.",
    },
    {
      lesson: 1,
      prompt: "What does a WATCH callout warn you about?",
      options: ["Where we outperform the competition", "Practical tips nobody writes down", "A common failure point — most deals that die, die here", "A policy you must follow"],
      correct: 2,
      explanation: "WATCH marks a common failure point. Most deals that die, die here.",
    },
    {
      lesson: 2,
      prompt: "Under the Exclusivity commitment, how many boats do we send a client?",
      options: ["Every boat that matches their budget", "Eleven, so they have plenty of choice", "One — the best match", "Three, and we know why each one is on the list"],
      correct: 3,
      explanation: "Curated, not catalogued. We never send a client eleven boats. We send three, and we know why each one is on the list.",
    },
    {
      lesson: 2,
      prompt: "A survey turns up a problem the client hasn't noticed yet. What does the Trust commitment say?",
      options: ["Wait to see whether the client asks", "Bring it to the client before they find it — they hear the bad news from us first", "Let the surveyor tell them", "Mention it after closing"],
      correct: 1,
      explanation: "Trust: the client hears the bad news from us first. Every time.",
    },
    {
      lesson: 2,
      prompt: "A buyer wants to pay their deposit. Which method do we accept?",
      options: ["Wire only", "Wire or certified check", "Any method with a written receipt", "Card payment through the CRM"],
      correct: 0,
      explanation: "What we do not do: accept a deposit by any method other than wire.",
    },
    {
      lesson: 3,
      prompt: "How many names should be in your CRM by day seven?",
      options: ["25", "50", "100", "250"],
      correct: 2,
      explanation: "Days 1–7: build your contact list. Target 100 names in the CRM by day seven.",
    },
    {
      lesson: 3,
      prompt: "When do bonuses, referral rewards, and performance incentives become available?",
      options: ["From your first day", "After your first listing is signed", "After one year with the firm", "Ninety days after your agreement is executed, provided you have closed at least two deals"],
      correct: 3,
      explanation: "Day 90 is the incentive eligibility review: incentives become available ninety days after your agreement is executed, provided you have closed a minimum of two deals.",
    },
  ],
};

const MODULE_01: TrainingSeedChapter = {
  volume: 1,
  code: "01",
  title: "Week One Setup",
  summary: "Documents, platforms, the 365 email rule",
  lessons: [
    {
      title: "Your week-one documents",
      bodyMd: `Welcome to 365 Yachts. You have joined a team delivering seamless, tech-forward luxury yacht sales to an ultra-high-net-worth clientele. Everything below must be complete before you take your first client call.

## Documents to submit

Send all of the following to **info@365yachts.org**:

- Photo identification / driver's license
- Broker or salesperson license and bond copy, if applicable
- Personal professional bio summary, written by you
- Professional headshot
- Executed Employment Contract and NDA
- Completed W-9

## Also in week one

- Review and familiarize yourself with brand standards and company policies.
- Read this volume end to end, then begin Part II of the Master Reference.
- Book a one-on-one with your Sales Executive to set your commission tier and personal targets.`,
    },
    {
      title: "Your platforms and the 365 email rule",
      bodyMd: `You will receive credentials for four platforms. Each one has a first action to do straight away.

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Install the 365 brand signature block with logo |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel | CRM. Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

> [!HOUSE RULE]
> All client communication runs through your 365 Yachts email address with the brand signature. This is a compliance and brand-consistency requirement, not a preference. Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.`,
    },
    {
      title: "GoHighLevel CRM walkthrough",
      videoPlaceholder: true,
      adminNote: "Placeholder for Shelly's GoHighLevel walkthrough video. Add it from this lesson's Video section before publishing.",
      bodyMd: `GoHighLevel is the CRM where your leads, pipeline, follow-up tasks, and campaigns live. Your first action in it is to load your first 100 contacts.

Watch the walkthrough above, then log in and follow along.`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "Where do you send your week-one onboarding documents?",
      options: ["Your Sales Executive's personal email", "info@365yachts.org", "shelly@365yachts.org", "Upload them to YachtCloser"],
      correct: 1,
      explanation: "Send all of the week-one documents to info@365yachts.org.",
    },
    {
      lesson: 0,
      prompt: "Which of these is NOT on the week-one document list?",
      options: ["Completed W-9", "Professional headshot", "A list of boats you have sold before", "Executed Employment Contract and NDA"],
      correct: 2,
      explanation: "The list is: photo ID, license and bond copy if applicable, your bio, headshot, Employment Contract and NDA, and the W-9.",
    },
    {
      lesson: 0,
      prompt: "When must the week-one setup be complete?",
      options: ["Before you take your first client call", "By the end of your first month", "Before your first closing", "Before your 90-day review"],
      correct: 0,
      explanation: "Everything in Module 01 must be complete before you take your first client call.",
    },
    {
      lesson: 0,
      prompt: "Who do you book a one-on-one with in week one to set your commission tier and personal targets?",
      options: ["The DBPR", "Your CPA", "A senior broker", "Your Sales Executive"],
      correct: 3,
      explanation: "Also in week one: book a one-on-one with your Sales Executive to set your commission tier and personal targets.",
    },
    {
      lesson: 1,
      prompt: "A client emails your personal address about a listing. What does the house rule say?",
      options: ["Client business runs through your 365 Yachts email — never personal email", "Personal email is fine if you copy the office", "Reply by text instead", "It's fine for existing clients"],
      correct: 0,
      explanation: "All client communication runs through your 365 Yachts email with the brand signature. No personal email for client business, ever.",
    },
    {
      lesson: 1,
      prompt: "Are texts and calls with clients allowed?",
      options: ["No, only email is allowed", "Only after the deal closes", "Yes — they're fine and encouraged, but anything that constitutes a record goes through the corporate account", "Only with written permission"],
      correct: 2,
      explanation: "Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.",
    },
    {
      lesson: 1,
      prompt: "Which platform do you use for contracts, e-signature, listing agreements, and closing statements?",
      options: ["GoHighLevel", "YachtCloser", "BoatWizard / YachtWorld", "365 Yachts Email"],
      correct: 1,
      explanation: "YachtCloser handles contracts, e-signature, listing agreements, deals, and closing statements.",
    },
    {
      lesson: 1,
      prompt: "What is your first action in BoatWizard / YachtWorld?",
      options: ["Load your first 100 contacts", "Install the brand signature", "Review a sample deal file", "Log in and run one practice search"],
      correct: 3,
      explanation: "BoatWizard / YachtWorld is the MLS. First action: log in, run one practice search.",
    },
    {
      lesson: 1,
      prompt: "Which platform is the CRM for leads, pipeline, follow-up tasks, and campaigns?",
      options: ["GoHighLevel", "YachtCloser", "BoatWizard", "YachtWorld"],
      correct: 0,
      explanation: "GoHighLevel is the CRM. Your first action is to load your first 100 contacts.",
    },
  ],
};

const MODULE_02: TrainingSeedChapter = {
  volume: 1,
  code: "02",
  title: "Licensing & Compliance",
  summary: "DBPR, salesperson vs broker, client funds",
  lessons: [
    {
      title: "Who needs a license",
      bodyMd: `Florida regulates yacht and ship brokers under **Chapter 326, Florida Statutes**, administered by the **Department of Business and Professional Regulation (DBPR)**.

A license is required to sell or offer to sell any used vessel over **32 feet**.

There are two kinds of license: **salesperson** and **broker**. The next lesson shows how they differ.`,
    },
    {
      title: "Salesperson vs broker",
      adminNote: VERIFY_DBPR,
      bodyMd: `Most new hires start as a **salesperson**, working under 365's employing broker. Here's what's different.

| | Salesperson | Broker |
|---|---|---|
| Surety bond | $10,000 | $25,000 |
| Initial application fee | $551 | $551 |
| Renewal fee | $500 | $500 |
| Change of affiliation | $100 | $100 |
| Escrow account | Not required — operates under employing broker | Must maintain an escrow account at a Florida financial institution |
| License held by | The employing broker, until employment ends | The individual |
| Term | Temporary 90-day license issued first; permanent two-year license once background checks clear. Renewal notice arrives at least 60 days before expiration. | |

> [!WATCH]
> Fee and bond amounts are set by DBPR and change. Verify current figures on the DBPR site before you write a check. The table above reflects the schedule published as of this edition.`,
    },
    {
      title: "Getting licensed",
      bodyMd: `## Process

- **New to Florida brokerage** — Register with DBPR through the online license portal. Complete application, fingerprints, surety bond, and fee. You will receive a temporary 90-day license while background checks process.
- **Transferring an existing license** — Request a license transfer through DBPR to associate your license with 365 Yachts Inc. Notify your Sales Executive the day you submit.
- **Renewal** — Two-year cycle. Watch for the DBPR notice 60 days out. Do not let a license lapse — you cannot legally take a listing or write an offer with an expired credential.

## Official links

- DBPR Yacht & Ship Licensing — applications, forms, requirements
- DBPR Yacht & Ship FAQs — bond amounts, fees, license terms
- Chapter 326, Florida Statutes — the Florida Yacht and Ship Brokers Act`,
    },
    {
      title: "Client funds",
      bodyMd: `Client deposits are where careers end. The rule is simple and has no exceptions.

> [!NEVER]
> Never hold client funds personally, in any form, for any reason. All deposits go to the brokerage escrow account by wire. A salesperson who takes a deposit into a personal account has committed a licensing violation that ends careers.

This is also one of the things 365 does not do, from the 365 Standard: we never accept a deposit by any method other than wire.`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "Which Florida law regulates yacht and ship brokers?",
      options: ["Chapter 475, Florida Statutes", "Chapter 326, Florida Statutes", "The Federal Maritime Act", "Florida Boating Regulations Part VI"],
      correct: 1,
      explanation: "Florida regulates yacht and ship brokers under Chapter 326, Florida Statutes — the Florida Yacht and Ship Brokers Act.",
    },
    {
      lesson: 0,
      prompt: "Which agency administers yacht and ship broker licensing in Florida?",
      options: ["The US Coast Guard", "The Florida Fish and Wildlife Commission", "The Department of Business and Professional Regulation (DBPR)", "The IRS"],
      correct: 2,
      explanation: "Chapter 326 is administered by the Department of Business and Professional Regulation (DBPR).",
    },
    {
      lesson: 0,
      prompt: "A license is required to sell or offer to sell any used vessel over what length?",
      options: ["20 feet", "26 feet", "40 feet", "32 feet"],
      correct: 3,
      explanation: "A license is required to sell or offer to sell any used vessel over 32 feet.",
    },
    {
      lesson: 1,
      prompt: "How large a surety bond does a Florida yacht salesperson need?",
      options: ["$10,000", "$25,000", "$5,000", "$50,000"],
      correct: 0,
      explanation: "$25,000 is the broker bond. Salespeople work under 365's employing broker, so their bond is smaller: $10,000.",
      adminNote: VERIFY_DBPR,
    },
    {
      lesson: 1,
      prompt: "Who holds a salesperson's license?",
      options: ["The salesperson", "The employing broker, until employment ends", "DBPR keeps it on file", "The Sales Executive"],
      correct: 1,
      explanation: "A salesperson's license is held by the employing broker until employment ends. A broker holds their own.",
    },
    {
      lesson: 1,
      prompt: "Does a salesperson need their own escrow account?",
      options: ["Yes, at any US bank", "Yes, at a Florida financial institution", "No — they operate under the employing broker's", "Only for deals over $1M"],
      correct: 2,
      explanation: "Salespeople don't need one; they operate under the employing broker. Brokers must keep an escrow account at a Florida financial institution.",
    },
    {
      lesson: 1,
      prompt: "What license do you get first when you apply?",
      options: ["A permanent two-year license", "A one-year provisional license", "A license that never expires", "A temporary 90-day license, then a permanent two-year license once background checks clear"],
      correct: 3,
      explanation: "A temporary 90-day license is issued first; the permanent two-year license follows once background checks clear.",
    },
    {
      lesson: 1,
      prompt: "Before you pay a DBPR fee or buy a bond, what should you do?",
      options: ["Verify the current figures on the DBPR site — they change", "Use the figures in the manual; they never change", "Ask another broker what they paid", "Pay the broker amount to be safe"],
      correct: 0,
      explanation: "Fee and bond amounts are set by DBPR and change. Verify current figures before you write a check.",
    },
    {
      lesson: 2,
      prompt: "You already hold a Florida license. What do you do to work at 365?",
      options: ["Apply for a brand new license", "Nothing — it transfers automatically", "Request a license transfer through DBPR and notify your Sales Executive the day you submit", "Ask the client to confirm your license"],
      correct: 2,
      explanation: "Request a license transfer through DBPR to associate your license with 365 Yachts Inc. Notify your Sales Executive the day you submit.",
    },
    {
      lesson: 2,
      prompt: "Your license expired last week. Can you write an offer today?",
      options: ["Yes, there's a 30-day grace period", "No — you cannot legally take a listing or write an offer with an expired credential", "Yes, if the employing broker signs it", "Only for a client you already represent"],
      correct: 1,
      explanation: "Do not let a license lapse — you cannot legally take a listing or write an offer with an expired credential. Watch for the DBPR notice 60 days out.",
    },
    {
      lesson: 3,
      prompt: "A buyer wants to put down their deposit today. How do you take it?",
      options: ["Zelle to my personal account, then I forward it", "A check made out to me", "A wire to the 365 Yachts escrow account", "Cash, with a written receipt"],
      correct: 2,
      explanation: "All deposits go to the brokerage escrow account by wire. Never hold client funds personally, in any form, for any reason.",
    },
  ],
};

const MODULE_03: TrainingSeedChapter = {
  volume: 1,
  code: "03",
  title: "Commission Structure",
  summary: "Tiers, co-broke math, in-house leads",
  lessons: [
    {
      title: "Commission tiers",
      bodyMd: `Ten percent is the industry-standard gross commission on a brokerage sale. Co-brokered deals split 50/50 between the two brokerages. What varies is your share of the house side — and that is a function of production.

## Industry-standard tiers

| Tier | Broker | House | Who sits here |
|---|---|---|---|
| Junior broker / assistant | 30–40% | 70–60% | Unlicensed or newly licensed, supported on every deal |
| New broker | 50% | 50% | Licensed, building first pipeline |
| Standard tier | 60% | 40% | Producing consistently, self-sufficient on deal mechanics |
| Top performer | 70–80% | 30–20% | Consistent production or a large portfolio, averaging $10M–$15M+ in annual sales |

> [!HOUSE RULE]
> Your personal split is set individually with your Sales Executive based on experience and performance, formalized in writing with agreed terms, and executed by both parties in your new-hire contract. Nothing in this manual overrides your signed agreement.`,
    },
    {
      title: "Worked examples",
      adminNote:
        "Verify before publishing: the prior manual illustrated the $500,000 co-broke as $12,500 gross to the 365 side and $7,500 net at 60%, which implies 2.5% per side, not 5%. The example here uses the standard 10% gross / 50-50 co-broke math. Confirm which figure is intended. No quiz question uses this example.",
      bodyMd: `## Co-brokered deal — 60/40 broker

- Sale price: $500,000
- Gross commission at 10%: $50,000
- Co-brokerage split 50/50 — 5% to each brokerage side
- 365 Yachts side: $25,000
- Your payout at 60%: $15,000
- House at 40%: $10,000

## Solo deal — listing and buyer, 60/40

- Full 10% commission stays in house
- Example gross commission: $10,000
- Your payout at 60%: $6,000
- House at 40%: $4,000

> [!FIELD NOTE]
> The math that matters: a solo deal pays you roughly twice what the same boat pays you co-broked. That is the entire argument for building your own listing inventory rather than living off other brokers' boats. One listing you also sell is worth two you only bring the buyer to.`,
    },
    {
      title: "In-house leads, bonuses and partnership",
      bodyMd: `## In-house lead assignments

Brokers are assigned pre-qualified leads generated by 365 Yachts marketing and digital outreach campaigns. These are delivered at no cost to you and frequently represent high-intent buyers or sellers. Commission on in-house assigned deals follows a tiered structure:

- 30% broker / 70% house
- 40% broker / 60% house
- 50% broker / 50% house

Tiers reward performance and ensure consistency in lead follow-up and conversion. Higher percentages are offered to monthly top performers, or awarded by the Sales Executive to winners of specified sales competition campaigns.

## Bonuses, incentives & partnership

- **Performance incentives** — bonuses, referral rewards, and other performance-based incentives become available within ninety (90) days of execution of your agreement by both parties, provided you have closed a minimum of two (2) deals.
- **Partnership and strategic opportunities** — 365 Yachts actively welcomes discussions on partnership collaboration and strategic business opportunities, and wants you rewarded for any connection you bring. Send a full detailed overview and contact information to shelly@365yachts.org for review.

> [!HOUSE RULE]
> All commission payments are processed after funds are received and contracts are complete — same-day wire transfer.`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "What is the industry-standard gross commission on a brokerage sale?",
      options: ["5%", "8%", "10%", "15%"],
      correct: 2,
      explanation: "Ten percent is the industry-standard gross commission on a brokerage sale.",
    },
    {
      lesson: 0,
      prompt: "How is a co-brokered deal split between the two brokerages?",
      options: ["50/50", "60/40 in favour of the listing side", "70/30 in favour of the buyer side", "It's negotiated every time"],
      correct: 0,
      explanation: "Co-brokered deals split 50/50 between the two brokerages.",
    },
    {
      lesson: 0,
      prompt: "In the industry-standard tiers, what is the broker's share at the standard tier?",
      options: ["50%", "60%", "70–80%", "30–40%"],
      correct: 1,
      explanation: "Standard tier: 60% broker, 40% house — producing consistently, self-sufficient on deal mechanics.",
    },
    {
      lesson: 0,
      prompt: "Who sits in the top-performer tier (70–80% to the broker)?",
      options: ["Anyone licensed for over a year", "Brokers who bring their own leads", "Newly licensed brokers building a pipeline", "Consistent producers or large portfolios, averaging $10M–$15M+ in annual sales"],
      correct: 3,
      explanation: "Top performers have consistent production or a large portfolio, averaging $10M–$15M+ in annual sales.",
    },
    {
      lesson: 0,
      prompt: "The manual's tier table and your signed agreement disagree. Which one applies?",
      options: ["The manual", "Whichever pays you more", "Your signed agreement — nothing in the manual overrides it", "The industry-standard table"],
      correct: 2,
      explanation: "Your personal split is set individually and executed in your contract. Nothing in this manual overrides your signed agreement.",
    },
    {
      lesson: 1,
      prompt: "On a solo deal (you list and sell the boat), how much of the 10% commission stays in house?",
      options: ["Half of it", "The full 10%", "5%", "It depends on the buyer"],
      correct: 1,
      explanation: "On a solo deal the full 10% commission stays in house, then splits between you and the house at your tier.",
    },
    {
      lesson: 1,
      prompt: "Why does the field note say to build your own listing inventory?",
      options: ["A solo deal pays you roughly twice what the same boat pays you co-broked", "Listings are required for your license", "Co-broke deals are not allowed at 365", "Buyers only work with listing brokers"],
      correct: 0,
      explanation: "A solo deal pays you roughly twice what the same boat pays co-broked. One listing you also sell is worth two you only bring the buyer to.",
    },
    {
      lesson: 2,
      prompt: "What do in-house assigned leads cost you?",
      options: ["A flat monthly fee", "10% of your commission", "Nothing — they are delivered at no cost to you", "They are paid for by the buyer"],
      correct: 2,
      explanation: "In-house leads come from 365 marketing and digital outreach, delivered at no cost to you.",
    },
    {
      lesson: 2,
      prompt: "How are higher in-house lead percentages earned?",
      options: ["By seniority", "They are offered to monthly top performers, or awarded to winners of sales competitions", "By paying for premium leads", "Automatically after six months"],
      correct: 1,
      explanation: "Higher percentages are offered to monthly top performers, or awarded by the Sales Executive to winners of specified sales competitions.",
    },
    {
      lesson: 2,
      prompt: "When and how are commissions paid?",
      options: ["Monthly, by check", "At the end of each quarter", "Before closing, as an advance", "After funds are received and contracts are complete — same-day wire"],
      correct: 3,
      explanation: "All commission payments are processed after funds are received and contracts are complete — same-day wire transfer.",
    },
    {
      lesson: 2,
      prompt: "You know someone who could be a strategic partner for 365. What do you do?",
      options: ["Send a full detailed overview and contact information to shelly@365yachts.org", "Keep it to yourself — it's outside your role", "Post it in the CRM as a lead", "Ask them to call the front desk"],
      correct: 0,
      explanation: "365 welcomes partnership discussions and wants you rewarded for any connection you bring. Send the overview to shelly@365yachts.org.",
    },
  ],
};

const MODULE_04: TrainingSeedChapter = {
  volume: 1,
  code: "04",
  title: "Commission Income Management",
  summary: "Tax set-aside, runway, managing the lumps",
  lessons: [
    {
      title: "How you get paid",
      bodyMd: `You are paid in irregular lumps, taxed as an independent contractor, and carried by nothing in between. More new brokers leave this business for financial reasons than for lack of ability. This module is here because we would rather you last.

## Why this is in the manual

Most brokerages will not have this conversation with you. We do, because a broker worrying about rent does not prospect well, does not hold firm in a negotiation, and takes the wrong listing at the wrong price. Your financial stability is a performance issue, not a private one.

## The three facts about how you get paid

| Fact | What it means for you |
|---|---|
| 1. It is lumpy, not monthly | You may close nothing for two months and then close twice in a week. Your expenses do not work that way. The gap between those two rhythms is what has to be managed. |
| 2. Nothing is withheld | Commission arrives gross. No income tax withheld, no self-employment tax withheld. The money in your account is not all yours, and the bill arrives whether you set it aside or not. |
| 3. It lags the work by months | The prospecting you do in January pays in April. Which means the month you feel richest is the month you are most tempted to stop doing the thing that made you rich. |`,
    },
    {
      title: "The second account",
      bodyMd: `## The first thing to do — before your first commission

Open a second bank account. Not an investment account, not something clever. A plain second checking or savings account at the same bank, so transfers are instant.

1. **Commission arrives in your main account** — The full gross amount, same-day wire.
2. **Same day, move the tax portion to the second account** — Before you look at the balance, before you plan anything. Same day, every time, no exceptions.
3. **Treat the second account as not yours** — Because it is not. It belongs to the IRS and you are holding it.
4. **What remains is your actual income** — Budget from that number and only that number.

> [!WATCH]
> The single most common financial failure in commission sales is spending a gross commission as though it were net. A $15,000 payout is not $15,000 of income. Brokers who learn this in April of their second year learn it expensively.

## What to set aside

As a 1099 contractor you owe federal income tax and self-employment tax, and you generally pay both through quarterly estimated payments rather than at year end.

### Get this from a professional

The correct set-aside percentage depends on your total income, filing status, deductions, state of residence, and other factors specific to you. Nobody at 365 Yachts — including your Sales Executive — can tell you what your number is. Engage a CPA in your first month, before your first commission, not at tax time. A CPA who understands independent contractors will pay for themselves several times over in your first year.

What we can tell you is the structure to ask your CPA about:

- What percentage of each gross commission should I set aside?
- Do I need to make quarterly estimated payments, and on what dates?
- What can I legitimately deduct — mileage, dockage for showings, phone, licensing and bond, professional dues, home office, marketing?
- Should I be operating as a sole proprietor or an entity?
- What records do I need to keep, and in what form?`,
    },
    {
      title: "Runway",
      bodyMd: `Runway is how many months you could cover your fixed costs with no commission at all. It is the most important number in your first two years, and most brokers have never calculated it.

- **6–9** — Months of runway recommended before you start
- **90** — Days minimum from first prospecting call to first close
- **3** — Months minimum to rebuild after a dry spell

Ninety days is the realistic floor between starting and closing, and that assumes everything goes right. Deals die at survey. Closings slip. A boat you were counting on goes to a cash buyer. Runway is what lets you keep working the process instead of panicking and taking a listing at a price that will never sell.

> [!FIELD NOTE]
> Brokers with no runway make identifiable mistakes: they overprice listings to win them, they chase unqualified buyers because they cannot afford to disqualify anyone, and they push for a close the client is not ready for. Clients feel all three. Financial pressure is visible from the other side of the table, and it costs deals. Protecting your runway is protecting your judgement.`,
    },
    {
      title: "Managing the lumps",
      bodyMd: `- **Pay yourself a salary.** After tax set-aside, move a fixed monthly amount to your spending account and leave the rest. Smooth your own income. Live on the salary, not on the closings.
- **Set the salary on a bad year.** Base it on what you would earn in a slow year, not your best month. Anything above it is surplus, not lifestyle.
- **Rebuild runway first.** After a big close, the first call on the surplus is restoring your months of runway. The reward comes after the buffer, not instead of it.
- **Keep fixed costs low early.** Every fixed monthly commitment shortens your runway and raises the number you must close to survive. Year one is not the year to add them.

## The trap of the good month

The most dangerous month in a broker's year is the one right after a large close. Two things happen at once: fixed costs go up, and prospecting stops. Ninety days later the pipeline is empty and the lifestyle is not.

> [!HOUSE RULE]
> Prospect hardest in the week you close. It is the least natural time to do it and the most important. Your pipeline is the only thing standing between a good month and a bad quarter — and it is built ninety days before you need it.

### Not financial advice

This module is practical guidance on how commission income behaves, not financial, tax, or investment advice. Percentages, deductions, entity structure, and payment schedules are specific to you and belong with a qualified CPA or financial adviser.`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "Why does 365 treat your financial stability as a performance issue?",
      options: ["Because the firm pays your taxes", "A broker worrying about rent prospects poorly, folds in negotiation, and takes the wrong listing at the wrong price", "Because it affects your commission tier", "It doesn't — it's a private matter"],
      correct: 1,
      explanation: "A broker worrying about rent does not prospect well, does not hold firm in a negotiation, and takes the wrong listing at the wrong price.",
    },
    {
      lesson: 0,
      prompt: "How much tax is withheld from a commission payment?",
      options: ["None — commission arrives gross", "Federal income tax only", "Self-employment tax only", "A flat 20%"],
      correct: 0,
      explanation: "Nothing is withheld. Commission arrives gross — no income tax and no self-employment tax withheld.",
    },
    {
      lesson: 0,
      prompt: "Prospecting you do in January typically pays in which month?",
      options: ["January", "February", "April", "December"],
      correct: 2,
      explanation: "Commission lags the work by months: the prospecting you do in January pays in April.",
    },
    {
      lesson: 1,
      prompt: "A commission lands in your main account. What do you do first?",
      options: ["Pay down any debts", "Check the balance and plan your month", "Wait until quarter end to deal with tax", "Same day, move the tax portion to the second account — before you look at the balance"],
      correct: 3,
      explanation: "Same day, move the tax portion to the second account — before you look at the balance, before you plan anything.",
    },
    {
      lesson: 1,
      prompt: "What kind of second account does the manual recommend?",
      options: ["A plain checking or savings account at the same bank, so transfers are instant", "An investment account so the money grows", "A joint account with your Sales Executive", "A business credit card"],
      correct: 0,
      explanation: "Not an investment account, not something clever — a plain second account at the same bank, so transfers are instant.",
    },
    {
      lesson: 1,
      prompt: "Who can tell you the right percentage of each commission to set aside for tax?",
      options: ["Your Sales Executive", "The manual — it's 30%", "A CPA — nobody at 365 can tell you your number", "Another broker at your tier"],
      correct: 2,
      explanation: "The set-aside depends on factors specific to you. Nobody at 365 — including your Sales Executive — can tell you. Engage a CPA in your first month.",
    },
    {
      lesson: 1,
      prompt: "What is the single most common financial failure in commission sales?",
      options: ["Not opening an LLC", "Spending a gross commission as though it were net", "Paying taxes too early", "Taking too few listings"],
      correct: 1,
      explanation: "Spending a gross commission as though it were net. A $15,000 payout is not $15,000 of income.",
    },
    {
      lesson: 2,
      prompt: "What is runway?",
      options: ["The time between listing and sale", "Your pipeline of active buyers", "Your monthly commission target", "How many months you could cover your fixed costs with no commission at all"],
      correct: 3,
      explanation: "Runway is how many months you could cover your fixed costs with no commission at all.",
    },
    {
      lesson: 2,
      prompt: "How many months of runway does the manual recommend before you start?",
      options: ["1–2", "3", "6–9", "12–18"],
      correct: 2,
      explanation: "6–9 months of runway are recommended before you start; ninety days is the minimum from first call to first close.",
    },
    {
      lesson: 3,
      prompt: "What should your monthly salary to yourself be based on?",
      options: ["What you would earn in a slow year", "Your best month so far", "Your average closing", "Your Sales Executive's target for you"],
      correct: 0,
      explanation: "Set the salary on a bad year: base it on what you'd earn in a slow year. Anything above it is surplus, not lifestyle.",
    },
    {
      lesson: 3,
      prompt: "When does the house rule say to prospect hardest?",
      options: ["At the start of each quarter", "In the week you close", "During boat show season", "When your pipeline is empty"],
      correct: 1,
      explanation: "Prospect hardest in the week you close. Your pipeline is built ninety days before you need it.",
    },
  ],
};

const MODULE_05: TrainingSeedChapter = {
  volume: 1,
  code: "05",
  title: "KPIs & Performance Benchmarks",
  summary: "The numbers you're measured on, CRM hygiene",
  lessons: [
    {
      title: "The numbers we track",
      bodyMd: `Consistency and accountability are what separate brokers who last from brokers who visit. These are the metrics we track.

| Benchmark | Metric |
|---|---|
| 25+ | New qualified leads per month |
| 4× | Follow-ups per prospect, weekly |
| 1–3 | New listings signed per month |
| 3+ | Showings scheduled per week |
| 2–5 | Offers presented per month |
| 1–2 | Closed sales per month |

## Performance reviews

Performance reviews are conducted monthly with sales leadership to help you stay on track, overcome hurdles, and optimize your conversion funnel. You may schedule a private one-on-one session with your Sales Team Manager at any time for an individual strategy session or additional training. Use it. The brokers who ask for coaching outperform the brokers who wait to be coached.`,
    },
    {
      title: "CRM hygiene",
      bodyMd: `Daily, non-negotiable.

- Every conversation logged as a note the same day it happens.
- Every contact carries a next action with a date. No contact sits without one.
- Pipeline stage updated the moment reality changes, not at month end.

> [!WATCH]
> The single most common cause of a broker washing out is a CRM full of names and empty of next actions. If a lead has no scheduled follow-up, that lead does not exist. Twenty-five new leads a month with no follow-up produces nothing; ten with disciplined follow-up produces a career.`,
    },
    {
      title: "How to read your own numbers",
      bodyMd: `When a number is low, the cause is usually one of these.

| If this is low | The real problem is usually | Fix |
|---|---|---|
| New leads | Not enough outbound activity or no referral ask | Inventory calls, dock walking, ask every client for two names |
| Showings | Sending too many boats, or unqualified buyers | Send three, not thirty. Qualify financing on call one. Vol. Two, Modules 26 and 34. |
| Offers | Not asking for the offer | Vol. Two, Module 36 — trial closes. Ask on every showing. |
| Closes | Offers dying at survey or on price | Vol. Two, Modules 35 and 39 — objections and negotiation |
| Listings | No market analysis, or pricing to please the seller | Vol. Two, Modules 22 and 37 — run real comps, present them |`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "How many new qualified leads per month is the benchmark?",
      options: ["10+", "25+", "50+", "100+"],
      correct: 1,
      explanation: "The benchmark is 25+ new qualified leads per month.",
    },
    {
      lesson: 0,
      prompt: "How often should you follow up with each prospect?",
      options: ["4× a week", "Once a week", "Once a month", "Only when they reply"],
      correct: 0,
      explanation: "The benchmark is 4× follow-ups per prospect, weekly.",
    },
    {
      lesson: 0,
      prompt: "How many showings should you have scheduled per week?",
      options: ["1", "2", "3+", "10+"],
      correct: 2,
      explanation: "The benchmark is 3+ showings scheduled per week.",
    },
    {
      lesson: 0,
      prompt: "How often are performance reviews held with sales leadership?",
      options: ["Quarterly", "Once a year", "Only when targets are missed", "Monthly"],
      correct: 3,
      explanation: "Performance reviews are conducted monthly with sales leadership. You can also book a one-on-one with your Sales Team Manager at any time.",
    },
    {
      lesson: 0,
      prompt: "How many closed sales per month is the benchmark?",
      options: ["1–2", "3–5", "At least 5", "One per quarter"],
      correct: 0,
      explanation: "The benchmark is 1–2 closed sales per month, with 2–5 offers presented.",
    },
    {
      lesson: 1,
      prompt: "When do you log a conversation in the CRM?",
      options: ["At the end of the week", "Before the monthly review", "As a note the same day it happens", "Only if it leads to a showing"],
      correct: 2,
      explanation: "CRM hygiene: every conversation logged as a note the same day it happens.",
    },
    {
      lesson: 1,
      prompt: "A contact in your CRM has no next action. What does the manual say?",
      options: ["That's fine for cold leads", "Every contact carries a next action with a date — no contact sits without one", "Delete the contact", "Add one at month end"],
      correct: 1,
      explanation: "Every contact carries a next action with a date. If a lead has no scheduled follow-up, that lead does not exist.",
    },
    {
      lesson: 1,
      prompt: "What is the single most common cause of a broker washing out?",
      options: ["Too few listings", "Not enough boat knowledge", "Low commission split", "A CRM full of names and empty of next actions"],
      correct: 3,
      explanation: "A CRM full of names and empty of next actions. Ten leads with disciplined follow-up produce a career; twenty-five with none produce nothing.",
    },
    {
      lesson: 2,
      prompt: "Your showings are low. What's usually the real problem?",
      options: ["Sending too many boats, or unqualified buyers", "Not enough listings", "Prices are too high", "Not enough boat shows"],
      correct: 0,
      explanation: "Low showings usually mean sending too many boats or unqualified buyers. Send three, not thirty, and qualify financing on call one.",
    },
    {
      lesson: 2,
      prompt: "Your offers are low. What's the fix?",
      options: ["Lower your listing prices", "Ask for the offer on every showing", "Send more boats per buyer", "Wait for the buyer to raise it"],
      correct: 1,
      explanation: "Low offers usually mean you're not asking for the offer. Use trial closes and ask on every showing.",
    },
  ],
};

const MODULE_06: TrainingSeedChapter = {
  volume: 1,
  code: "06",
  title: "Quick Start Checklist",
  summary: "Weeks 1–4, ticked off as you go",
  lessons: [
    {
      title: "Weeks 1 and 2",
      bodyMd: `Tick these off in order. If you complete this list on schedule you will be functional inside a month.

## Week 1 — Administrative & access

- All onboarding documents submitted to info@365yachts.org
- Employment contract and NDA executed
- W-9 submitted
- Licensing application filed or transfer requested with DBPR
- 365 email active, brand signature installed
- Logged into BoatWizard, YachtCloser, and GoHighLevel
- Commission tier confirmed in writing with Sales Executive
- Read Parts 0–I of this manual

## Week 2 — Product & market knowledge

- Read Part III of the Master Reference in full — types, hulls, engines, systems, builders
- Can name the six hull types and what each is good for
- Can name the top five sportfish, center console, and motor yacht builders
- Walked at least two marinas and spoken to three captains or dockmasters
- 100 contacts loaded into GoHighLevel with next actions
- Ran three practice searches in BoatWizard MLS
- Ran one practice SoldBoats comp search`,
    },
    {
      title: "Weeks 3 and 4, then every week",
      bodyMd: `## Week 3 — Live activity

- Read Parts V and VI of the Master Reference — scripts, objections, deal execution
- Made 50 outbound calls to boat owners, FSBOs, or expired listings
- Shadowed a showing with a senior broker
- Built and sent one three-boat buyer package by email and by text
- Completed one full market analysis for a real prospect
- Delivered one listing presentation

## Week 4 — First transaction mechanics

- Walked through a YachtCloser listing agreement start to finish with a manager
- Walked through a YachtCloser deal and P&S with a manager
- Posted a practice listing in BoatWizard (or a real one)
- Saved the surveyor and haul-out yard directory to your phone
- First listing signed or first offer written

## Ongoing — every week, forever

- 25+ new qualified leads added this month
- Every active prospect touched 4× this week
- 3+ showings scheduled this week
- Every listing client updated, news or no news
- CRM notes current, every contact carries a dated next action
- Monthly performance review booked with sales leadership`,
    },
    {
      title: "What comes next and who to call",
      bodyMd: `## What comes next

That is Volume One. Everything from here — the market, the boats, the craft, the scripts, the deal mechanics, the reference vault — lives in Volume Two, the Master Reference, Parts II through IX, Modules 07 through 63. Your week-two through week-four reading is in there. Ask your Sales Executive for your copy and the link to the searchable edition.

Volume One made you legal, paid, and measured. Volume Two makes you good.

## Who to call

**Shelly Melcher** — Co-Founder · CEO · Licensed Employing Broker · Sales Director

- Direct: 561-445-9241
- Email: shelly@365yachts.org
- Web: 365yachts.org · 365YachtMatch.com

> [!HOUSE RULE]
> For any question about a deal, a client, a contract, or your commission — call. Do not guess on anything that touches a client's money or the firm's compliance. Nobody has ever been criticized here for asking.

> [!FIELD NOTE]
> The brokers who last read Part III until the product knowledge is automatic, and skim Part V for thirty seconds before every call. Those two habits, done consistently, outperform natural talent in this business every time.`,
    },
  ],
  questions: [
    {
      lesson: 0,
      prompt: "In which week of the checklist do you file your licensing application or request a DBPR transfer?",
      options: ["Week 1", "Week 2", "Week 3", "Week 4"],
      correct: 0,
      explanation: "Licensing application filed or transfer requested with DBPR is a Week 1 item, under Administrative & access.",
    },
    {
      lesson: 0,
      prompt: "What should you have read by the end of Week 1?",
      options: ["The whole Master Reference", "Parts V and VI of the Master Reference", "Parts 0–I of this manual", "Nothing yet — reading starts in Week 2"],
      correct: 2,
      explanation: "Week 1 ends with: read Parts 0–I of this manual.",
    },
    {
      lesson: 0,
      prompt: "Which Week 2 item is about the CRM?",
      options: ["Ran one practice SoldBoats comp search", "100 contacts loaded into GoHighLevel with next actions", "Logged into YachtCloser", "Built a three-boat buyer package"],
      correct: 1,
      explanation: "Week 2: 100 contacts loaded into GoHighLevel with next actions.",
    },
    {
      lesson: 0,
      prompt: "In Week 2, how many marinas should you walk and how many captains or dockmasters should you speak to?",
      options: ["One marina, one captain", "Five marinas, ten captains", "No marina visits until Week 4", "At least two marinas and three captains or dockmasters"],
      correct: 3,
      explanation: "Week 2: walked at least two marinas and spoken to three captains or dockmasters.",
    },
    {
      lesson: 1,
      prompt: "How many outbound calls does Week 3 ask for?",
      options: ["10", "25", "50", "100"],
      correct: 2,
      explanation: "Week 3: made 50 outbound calls to boat owners, FSBOs, or expired listings.",
    },
    {
      lesson: 1,
      prompt: "Which of these is a Week 4 item?",
      options: ["Walked through a YachtCloser deal and P&S with a manager", "W-9 submitted", "Read Part III of the Master Reference", "Shadowed a showing with a senior broker"],
      correct: 0,
      explanation: "Week 4 is first transaction mechanics, including walking through a YachtCloser deal and P&S with a manager.",
    },
    {
      lesson: 1,
      prompt: "Which of these is on the \"every week, forever\" list?",
      options: ["Post a practice listing", "Every listing client updated, news or no news", "Shadow a senior broker", "Run a practice MLS search"],
      correct: 1,
      explanation: "Ongoing, every week: every listing client updated, news or no news.",
    },
    {
      lesson: 2,
      prompt: "You're unsure about something that touches a client's money. What does the house rule say?",
      options: ["Make your best judgement and move on", "Ask the client what they'd prefer", "Check online forums", "Call — do not guess on anything that touches a client's money or the firm's compliance"],
      correct: 3,
      explanation: "For any question about a deal, a client, a contract, or your commission — call. Nobody has ever been criticized here for asking.",
    },
    {
      lesson: 2,
      prompt: "Which two habits does the field note say outperform natural talent?",
      options: ["Reading Part III until product knowledge is automatic, and skimming Part V for thirty seconds before every call", "Cold calling daily and attending every boat show", "Posting on social media and networking events", "Working weekends and taking every lead"],
      correct: 0,
      explanation: "The brokers who last read Part III until it's automatic, and skim Part V for thirty seconds before every call.",
    },
  ],
};

const VOLUME_TWO: TrainingSeedChapter[] = [
  ["II", "The Market", "The industry, current conditions, the South Florida ecosystem, and the economics behind it.", "Week 2"],
  ["III", "Product Mastery", "Yacht types, hulls, engines, systems, builders, design, and maintenance intervals.", "Week 2"],
  ["IV", "The Broker's Craft", "Responsibilities, ethics, compliance, valuation, surveys, financing, Florida tax, maritime law.", "Week 3"],
  ["V", "The Sales Engine", "Pipeline, discovery, the script library, objections, listing presentations, negotiation, follow-up.", "Week 3"],
  ["VI", "Deal Execution", "Contract anatomy, deal timeline, escrow and deposits, wire fraud, survey day, closing.", "Week 4"],
  ["VII", "Brand & Retention", "The listing launch, listing quality, digital marketing and SEO, personal brand, client retention.", "Month 2"],
  ["VIII", "Expanding Your Book", "Charter brokerage and new construction — two revenue lines beyond pre-owned.", "When producing"],
  ["IX", "Competitive Position", "How 365 wins, and word-for-word talk tracks for competitive questions.", "Before 1st listing pitch"],
  ["X", "Reference Vault", "Surveyor directory, haul-out yards, glossary, tools, links, contacts, standing figures.", "At the dock"],
].map(([code, title, summary, scheduleLabel]) => ({ volume: 2 as const, code: code!, title: title!, summary: summary!, scheduleLabel, lessons: [], questions: [] }));

export const TRAINING_SEED_CHAPTERS: readonly TrainingSeedChapter[] = [PART_0, MODULE_01, MODULE_02, MODULE_03, MODULE_04, MODULE_05, MODULE_06, ...VOLUME_TWO];
