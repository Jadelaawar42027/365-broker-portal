/**
 * File: packages/db/src/schema/views.ts
 * Purpose: Typed read access to the broker_metrics SQL view. The view itself is created by the hand-written
 * migration drizzle/0001_broker_metrics_view.sql, so it is declared here as existing.
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
