/**
 * File: packages/db/src/schema/matching.ts
 * Purpose: Tables for lead-to-broker matching. broker_persona_tags holds one row per broker with the structured tags
 * Claude extracted from their persona (source_hash says which persona text they came from) and the admin overrides,
 * which always win. match_weights keeps every change to the scoring weights (the newest row applies; with no rows the
 * defaults in @bp/shared apply), so weights change without a redeploy. match_log records each /api/match request, what
 * was recommended (with the full per-factor detail), the brokers the hard filters excluded, the weights, health source
 * and fit method used, and the setter's choice as the 365 Yachts AI reports it (the portal broker it was linked to, the
 * GoHighLevel user id and name sent, whether it was off the list, and the bot's own timestamp). Broker health snapshots are written by
 * coach-api into this database and only read here; no health table is defined in this portal.
 *
 * Functions:
 * - none
 */
import type { BackgroundTagEntry, LanguageSkill, MatchWeights, PersonaTagOverrides } from "@bp/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { brokers } from "./portal";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const brokerPersonaTags = pgTable(
  "broker_persona_tags",
  {
    brokerId: uuid("broker_id")
      .primaryKey()
      .references(() => brokers.id, { onDelete: "cascade" }),
    backgroundTags: jsonb("background_tags").$type<BackgroundTagEntry[]>(),
    storyKeywords: text("story_keywords").array(),
    boatTypes: text("boat_types").array(),
    priceBands: text("price_bands").array(),
    buyerTypesClick: text("buyer_types_click").array(),
    strengths: text("strengths").array(),
    avoidNotes: text("avoid_notes").array(),
    languages: jsonb("languages").$type<LanguageSkill[]>(),
    followUpStyle: text("follow_up_style"),
    responseSpeed: text("response_speed"),
    channels: text("channels").array(),
    sellingStyle: text("selling_style"),
    maxLeadsPerWeek: integer("max_leads_per_week"),
    availabilityText: text("availability_text"),
    doNotMention: text("do_not_mention").array(),
    sourceHash: text("source_hash"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    extractionModel: text("extraction_model"),
    extractionError: text("extraction_error"),
    manualOverrides: jsonb("manual_overrides").$type<PersonaTagOverrides>().notNull().default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "broker_persona_tags_max_leads_range",
      sql`${table.maxLeadsPerWeek} IS NULL OR ${table.maxLeadsPerWeek} BETWEEN 1 AND 50`,
    ),
  ],
);

export const matchWeights = pgTable(
  "match_weights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fit: integer("fit").notNull(),
    performance: integer("performance").notNull(),
    availability: integer("availability").notNull(),
    followUpPoints: integer("follow_up_points").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [
    index("match_weights_created_at_idx").on(table.createdAt),
    check(
      "match_weights_range",
      sql`${table.fit} BETWEEN 0 AND 100 AND ${table.performance} BETWEEN 0 AND 100 AND ${table.availability} BETWEEN 0 AND 100 AND ${table.followUpPoints} BETWEEN 0 AND 30`,
    ),
    check("match_weights_not_all_zero", sql`${table.fit} + ${table.performance} + ${table.availability} > 0`),
  ],
);

export const matchLog = pgTable(
  "match_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: text("contact_id").notNull(),
    leadName: text("lead_name").notNull(),
    request: jsonb("request").$type<Record<string, unknown>>().notNull(),
    recommendations: jsonb("recommendations").$type<Record<string, unknown>[]>().notNull(),
    excluded: jsonb("excluded").$type<Record<string, unknown>[]>().notNull().default([]),
    weights: jsonb("weights").$type<MatchWeights>().notNull(),
    healthSource: text("health_source").notNull(),
    fitMethod: text("fit_method").notNull(),
    chosenBrokerId: uuid("chosen_broker_id").references(() => brokers.id, { onDelete: "set null" }),
    chosenAt: timestamp("chosen_at", { withTimezone: true }),
    chosenBy: text("chosen_by"),
    chosenGhlUserId: text("chosen_ghl_user_id"),
    chosenBrokerName: text("chosen_broker_name"),
    chosenOffList: boolean("chosen_off_list").notNull().default(false),
    choiceTimestamp: timestamp("choice_timestamp", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("match_log_chosen_broker_idx").on(table.chosenBrokerId, table.chosenAt),
    index("match_log_contact_idx").on(table.contactId, table.createdAt),
  ],
);
