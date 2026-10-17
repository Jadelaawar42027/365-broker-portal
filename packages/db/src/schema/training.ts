/**
 * File: packages/db/src/schema/training.ts
 * Purpose: Training tables (phase G): chapters (Volume One parts and modules, Volume Two as coming-soon), lessons, an
 * optional video per lesson (uploaded to the bucket or embedded from YouTube, Loom or Vimeo), each broker's lesson
 * progress and watched seconds, the question bank with options, and quiz attempts with their answers. All additive.
 *
 * Functions:
 * - none
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import {
  CHAPTER_STATUSES,
  DEFAULT_PASS_MARK,
  DEFAULT_QUESTIONS_PER_ATTEMPT,
  QUESTION_SOURCES,
  QUIZ_ATTEMPT_STATUSES,
  RETAKE_POLICIES,
  VIDEO_PROVIDERS,
  VIDEO_SOURCES,
} from "@bp/shared";
import { users } from "./auth";
import { brokers } from "./portal";

export const chapterStatusEnum = pgEnum("chapter_status", CHAPTER_STATUSES);
export const retakePolicyEnum = pgEnum("retake_policy", RETAKE_POLICIES);
export const videoSourceEnum = pgEnum("video_source", VIDEO_SOURCES);
export const videoProviderEnum = pgEnum("video_provider", VIDEO_PROVIDERS);
export const quizAttemptStatusEnum = pgEnum("quiz_attempt_status", QUIZ_ATTEMPT_STATUSES);
export const questionSourceEnum = pgEnum("question_source", QUESTION_SOURCES);

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    volume: integer("volume").notNull().default(1),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    position: integer("position").notNull(),
    passMark: integer("pass_mark").notNull().default(DEFAULT_PASS_MARK),
    questionsPerAttempt: integer("questions_per_attempt").notNull().default(DEFAULT_QUESTIONS_PER_ATTEMPT),
    retakePolicy: retakePolicyEnum("retake_policy").notNull().default("reread"),
    status: chapterStatusEnum("status").notNull().default("draft"),
    scheduleLabel: text("schedule_label"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("chapters_volume_position_idx").on(table.volume, table.position),
    check("chapters_pass_mark_range", sql`${table.passMark} BETWEEN 1 AND 100`),
    check("chapters_questions_positive", sql`${table.questionsPerAttempt} > 0`),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    readMinutes: integer("read_minutes").notNull().default(2),
    adminNote: text("admin_note"),
    videoPlaceholder: boolean("video_placeholder").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [index("lessons_chapter_position_idx").on(table.chapterId, table.position)],
);

export const lessonVideos = pgTable(
  "lesson_videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .unique()
      .references(() => lessons.id, { onDelete: "cascade" }),
    source: videoSourceEnum("source").notNull(),
    provider: videoProviderEnum("provider").notNull(),
    storageKey: text("storage_key"),
    embedUrl: text("embed_url"),
    durationSeconds: integer("duration_seconds"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    mimeType: text("mime_type"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [
    check(
      "lesson_videos_source_fields",
      sql`(${table.source} = 'upload' AND ${table.storageKey} IS NOT NULL) OR (${table.source} = 'embed' AND ${table.embedUrl} IS NOT NULL)`,
    ),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [unique("lesson_progress_broker_lesson_unique").on(table.brokerId, table.lessonId)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    explanation: text("explanation").notNull().default(""),
    source: questionSourceEnum("source").notNull().default("human"),
    adminNote: text("admin_note"),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [index("questions_chapter_idx").on(table.chapterId, table.position)],
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => [index("question_options_question_idx").on(table.questionId, table.position)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: quizAttemptStatusEnum("status").notNull().default("in_progress"),
    questionIds: uuid("question_ids").array().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    correctCount: integer("correct_count"),
    totalCount: integer("total_count").notNull(),
    scorePct: integer("score_pct"),
    passed: boolean("passed"),
    retakeWaivedAt: timestamp("retake_waived_at", { withTimezone: true }),
    retakeWaivedBy: uuid("retake_waived_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("quiz_attempts_broker_chapter_idx").on(table.brokerId, table.chapterId),
    unique("quiz_attempts_broker_chapter_number_unique").on(table.brokerId, table.chapterId, table.attemptNumber),
  ],
);

export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    optionId: uuid("option_id").references(() => questionOptions.id, { onDelete: "set null" }),
    isCorrect: boolean("is_correct"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("attempt_answers_attempt_question_unique").on(table.attemptId, table.questionId)],
);
