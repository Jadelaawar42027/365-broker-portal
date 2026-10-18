/**
 * File: packages/db/src/schema/enums.ts
 * Purpose: Postgres enum types, built from the value lists in @bp/shared so the database and the code agree.
 *
 * Functions:
 * - none
 */
import {
  BROKER_LEVELS,
  BROKER_STATUSES,
  PROVISIONING_ACTIONS,
  PROVISIONING_SYSTEMS,
  PROVISIONING_TASK_STATUSES,
  STEP_KINDS,
  STEP_STAGES,
  STEP_STATUSES,
  TOKEN_PURPOSES,
  USER_ROLES,
} from "@bp/shared";
import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const brokerLevelEnum = pgEnum("broker_level", BROKER_LEVELS);
export const brokerStatusEnum = pgEnum("broker_status", BROKER_STATUSES);
export const stepStatusEnum = pgEnum("step_status", STEP_STATUSES);
export const stepKindEnum = pgEnum("step_kind", STEP_KINDS);
export const stepStageEnum = pgEnum("step_stage", STEP_STAGES);
export const tokenPurposeEnum = pgEnum("token_purpose", TOKEN_PURPOSES);
export const provisioningSystemEnum = pgEnum("provisioning_system", PROVISIONING_SYSTEMS);
export const provisioningActionEnum = pgEnum("provisioning_action", PROVISIONING_ACTIONS);
export const provisioningTaskStatusEnum = pgEnum("provisioning_task_status", PROVISIONING_TASK_STATUSES);
