/**
 * File: packages/db/src/schema/steps.ts
 * Purpose: Extra content attached to an onboarding step (SPEC D28): its video slots (each empty, an embed from YouTube,
 * Loom or Vimeo, or an MP4 uploaded to the bucket) and its optional knowledge check (up to 3 multiple-choice questions
 * a broker must answer correctly before submitting the step). New tables only; nothing existing changes.
 *
 * Functions:
 * - none
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { onboardingSteps } from "./portal";
import { videoProviderEnum, videoSourceEnum } from "./training";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const stepVideos = pgTable(
  "step_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stepId: uuid("step_id")
      .notNull()
      .references(() => onboardingSteps.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    source: videoSourceEnum("source"),
    provider: videoProviderEnum("provider"),
    storageKey: text("storage_key"),
    embedUrl: text("embed_url"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    durationSeconds: integer("duration_seconds"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("step_videos_step_position_idx").on(table.stepId, table.position),
    check(
      "step_videos_source_fields",
      sql`(${table.source} IS NULL AND ${table.storageKey} IS NULL AND ${table.embedUrl} IS NULL) OR (${table.source} = 'upload' AND ${table.storageKey} IS NOT NULL) OR (${table.source} = 'embed' AND ${table.embedUrl} IS NOT NULL)`,
    ),
  ],
);

export const stepQuestions = pgTable(
  "step_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stepId: uuid("step_id")
      .notNull()
      .references(() => onboardingSteps.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    explanation: text("explanation").notNull().default(""),
    createdAt,
    updatedAt,
  },
  (table) => [index("step_questions_step_idx").on(table.stepId, table.position)],
);

export const stepQuestionOptions = pgTable(
  "step_question_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => stepQuestions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => [index("step_question_options_question_idx").on(table.questionId, table.position)],
);
