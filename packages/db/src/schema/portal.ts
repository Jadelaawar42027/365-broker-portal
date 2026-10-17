/**
 * File: packages/db/src/schema/portal.ts
 * Purpose: The portal's own tables: brokers, account tokens (invites and resets, SPEC D8), the onboarding step
 * template, each broker's progress rows, uploaded files (never overwritten) and the audit log.
 *
 * Functions:
 * - none
 */
import type { StepConfig } from "@bp/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import {
  brokerLevelEnum,
  brokerStatusEnum,
  stepKindEnum,
  stepStageEnum,
  stepStatusEnum,
  tokenPurposeEnum,
} from "./enums";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const brokers = pgTable(
  "brokers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    level: brokerLevelEnum("level").notNull().default("junior"),
    status: brokerStatusEnum("status").notNull().default("invited"),
    joinedAt: date("joined_at", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
    onboardedAt: date("onboarded_at", { mode: "string" }),
    leftAt: date("left_at", { mode: "string" }),
    commissionTier: text("commission_tier"),
    personaMd: text("persona_md"),
    personaUpdatedAt: timestamp("persona_updated_at", { withTimezone: true }),
    personaUpdatedBy: uuid("persona_updated_by").references(() => users.id, { onDelete: "set null" }),
    welcomeSeenAt: timestamp("welcome_seen_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("brokers_status_idx").on(table.status),
    check("brokers_left_after_joined", sql`${table.leftAt} IS NULL OR ${table.leftAt} >= ${table.joinedAt}`),
    check(
      "brokers_onboarded_after_joined",
      sql`${table.onboardedAt} IS NULL OR ${table.onboardedAt} >= ${table.joinedAt}`,
    ),
  ],
);

export const accountTokens = pgTable(
  "account_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: tokenPurposeEnum("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [index("account_tokens_user_purpose_idx").on(table.userId, table.purpose)],
);

export const onboardingSteps = pgTable("onboarding_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  position: integer("position").notNull().unique(),
  stage: stepStageEnum("stage").notNull(),
  title: text("title").notNull(),
  shortTitle: text("short_title").notNull(),
  summary: text("summary").notNull(),
  intro: text("intro").notNull(),
  kind: stepKindEnum("kind").notNull(),
  needsApproval: boolean("needs_approval").notNull(),
  instructionsMd: text("instructions_md").notNull(),
  templateFileKey: text("template_file_key"),
  videoUrl: text("video_url"),
  acceptedTypes: text("accepted_types").array().notNull().default(sql`ARRAY[]::text[]`),
  maxSizeBytes: integer("max_size_bytes").notNull().default(10 * 1024 * 1024),
  config: jsonb("config").$type<StepConfig>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
});

export const brokerSteps = pgTable(
  "broker_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => onboardingSteps.id, { onDelete: "restrict" }),
    status: stepStatusEnum("status").notNull().default("todo"),
    formData: jsonb("form_data").$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("broker_steps_broker_step_unique").on(table.brokerId, table.stepId),
    index("broker_steps_status_idx").on(table.status),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerStepId: uuid("broker_step_id")
      .notNull()
      .references(() => brokerSteps.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    version: integer("version").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [
    index("files_broker_step_version_idx").on(table.brokerStepId, table.version),
    check("files_size_positive", sql`${table.sizeBytes} > 0`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt,
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_created_at_idx").on(table.createdAt),
  ],
);
