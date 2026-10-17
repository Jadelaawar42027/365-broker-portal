/**
 * File: packages/db/src/schema/views.ts
 * Purpose: Typed read access to the broker_metrics and broker_training_metrics SQL views. The views are created by the
 * hand-written migrations drizzle/0001_broker_metrics_view.sql and drizzle/0003_broker_training_metrics_view.sql, so
 * they are declared here as existing.
 *
 * Functions:
 * - none
 */
import { boolean, date, integer, pgView, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brokerLevelEnum, brokerStatusEnum } from "./enums";

export const brokerMetrics = pgView("broker_metrics", {
  brokerId: uuid("broker_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  level: brokerLevelEnum("level").notNull(),
  status: brokerStatusEnum("status").notNull(),
  isActive: boolean("is_active").notNull(),
  joinedAt: date("joined_at", { mode: "string" }).notNull(),
  onboardedAt: date("onboarded_at", { mode: "string" }),
  leftAt: date("left_at", { mode: "string" }),
  daysToOnboard: integer("days_to_onboard"),
  tenureDays: integer("tenure_days").notNull(),
  stepsTotal: integer("steps_total").notNull(),
  stepsApproved: integer("steps_approved").notNull(),
  stepsWaitingReview: integer("steps_waiting_review").notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
}).existing();

export const brokerTrainingMetrics = pgView("broker_training_metrics", {
  brokerId: uuid("broker_id").notNull(),
  chaptersTotal: integer("chapters_total").notNull(),
  chaptersPassed: integer("chapters_passed").notNull(),
  avgBestScore: integer("avg_best_score"),
  avgFirstAttemptScore: integer("avg_first_attempt_score"),
  quizAttempts: integer("quiz_attempts").notNull(),
  lastTrainingAt: timestamp("last_training_at", { withTimezone: true }),
}).existing();
