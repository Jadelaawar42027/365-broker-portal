/**
 * File: apps/api/scripts/sample-leads.ts
 * Purpose: Three made-up inbound leads for trying lead matching against the six matching sample brokers
 * (`pnpm db:seed -- --match-samples`): a Navy veteran after a sportfish (Buy Now, hot), a Spanish-speaking family after
 * an express cruiser (Active) and a retired doctor couple who want a cruising catamaran (Nurture). Used by
 * match-sample-leads.ts and the matching tests. Fictional people only.
 *
 * Functions:
 * - none
 */
import type { MatchRequestInput } from "@bp/shared";

export const SAMPLE_LEADS: MatchRequestInput[] = [
  {
    contactId: "sample-lead-veteran",
    name: "Mike Turner",
    budget: "$600k",
    boat_type: "sportfish",
    location: "Jupiter, FL",
    language: "English",
    priority: "Buy Now",
    hot: true,
    lead_background: "Retired US Navy chief, 22 years, served on destroyers. Fishes offshore for mahi and wants a boat for tournaments with his son.",
    notes: "Ready to buy this month, has financing approved.",
  },
  {
    contactId: "sample-lead-spanish",
    name: "Ana Morales",
    budget: 900000,
    boat_type: "express cruiser",
    location: "Miami, FL",
    language: "Spanish",
    priority: "Active",
    hot: false,
    lead_background: "Family from Caracas, owns an import business. Two kids; wants weekends in Bimini.",
    notes: "Prefers WhatsApp and Spanish.",
  },
  {
    contactId: "sample-lead-cruisers",
    name: "Helen Park",
    budget: "around 450k",
    boat_type: "catamaran",
    location: "Stuart, FL",
    language: "English",
    priority: "Nurture",
    hot: false,
    lead_background: "Retired anesthesiologist and her husband; want to cruise the Bahamas and maybe live aboard for a year.",
    notes: "No rush, planning for next winter.",
  },
];
