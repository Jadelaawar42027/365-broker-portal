/**
 * File: packages/db/src/schema/portal.ts
 * Purpose: The portal's own tables: brokers (with the mailing address and Florida license number given when signing
 * the agreements, SPEC D31, and the accounts provisioned for them in phase H2: corporate email, CRM phone, Google Workspace and
 * GoHighLevel user ids), their commission history (SPEC D29: one row per change of the two splits,
 * in-house leads % and self-generated deals %; the latest row is the current split; the older split columns on brokers
 * and commission_tier are kept but no longer used), account tokens (invites and resets, SPEC D8; a broker invite has no expiry, so expires_at is null until it is replaced), the onboarding step
 * template (with its short guidance: What to do bullets, callouts and the manual's full text), each broker's progress rows, uploaded files (never overwritten), the audit log, and the provisioning tasks that create, suspend, unsuspend or link a broker's Google and GoHighLevel accounts (at most one open task per broker, system and action).
 *
 * Functions:
 * - none
 */
import type { GuidanceCallout, StepConfig } from "@bp/shared";
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import {
  brokerLevelEnum,
  brokerStatusEnum,
  provisioningActionEnum,
  provisioningSystemEnum,
  provisioningTaskStatusEnum,
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
    mailingAddress: text("mailing_address"),
    floridaLicenseNo: text("florida_license_no"),
    corporateEmail: text("corporate_email").unique(),
    crmPhone: text("crm_phone"),
    googleUserId: text("google_user_id"),
    ghlUserId: text("ghl_user_id"),
    inHouseSplit: integer("in_house_split"),
    selfGeneratedSplit: integer("self_generated_split"),
    personaMd: text("persona_md"),
    personaUpdatedAt: timestamp("persona_updated_at", { withTimezone: true }),
    personaUpdatedBy: uuid("persona_updated_by").references(() => users.id, { onDelete: "set null" }),
    welcomeSeenAt: timestamp("welcome_seen_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("brokers_status_idx").on(table.status),
    check("brokers_in_house_split_range", sql`${table.inHouseSplit} IS NULL OR ${table.inHouseSplit} BETWEEN 0 AND 100`),
    check(
      "brokers_self_generated_split_range",
      sql`${table.selfGeneratedSplit} IS NULL OR ${table.selfGeneratedSplit} BETWEEN 0 AND 100`,
    ),
    check("brokers_left_after_joined", sql`${table.leftAt} IS NULL OR ${table.leftAt} >= ${table.joinedAt}`),
    check(
      "brokers_onboarded_after_joined",
      sql`${table.onboardedAt} IS NULL OR ${table.onboardedAt} >= ${table.joinedAt}`,
    ),
  ],
);

export const commissionHistory = pgTable(
  "commission_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    inHousePct: integer("in_house_pct"),
    selfGeneratedPct: integer("self_generated_pct"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt,
  },
  (table) => [
    index("commission_history_broker_idx").on(table.brokerId, table.effectiveFrom, table.createdAt),
    check("commission_history_in_house_range", sql`${table.inHousePct} IS NULL OR ${table.inHousePct} BETWEEN 0 AND 100`),
    check(
      "commission_history_self_generated_range",
      sql`${table.selfGeneratedPct} IS NULL OR ${table.selfGeneratedPct} BETWEEN 0 AND 100`,
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
    expiresAt: timestamp("expires_at", { withTimezone: true }),
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
  todoItems: text("todo_items").array(),
  callouts: jsonb("callouts").$type<GuidanceCallout[]>(),
  fullTextMd: text("full_text_md"),
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

export const provisioningTasks = pgTable(
  "provisioning_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    system: provisioningSystemEnum("system").notNull(),
    action: provisioningActionEnum("action").notNull(),
    status: provisioningTaskStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("provisioning_tasks_due_idx").on(table.status, table.nextAttemptAt),
    index("provisioning_tasks_broker_idx").on(table.brokerId, table.system, table.createdAt),
    uniqueIndex("provisioning_tasks_one_open_idx")
      .on(table.brokerId, table.system, table.action)
      .where(sql`${table.status} IN ('pending', 'running')`),
    check("provisioning_tasks_attempts_range", sql`${table.attempts} >= 0`),
  ],
);
