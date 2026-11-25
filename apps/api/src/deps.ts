/**
 * File: apps/api/src/deps.ts
 * Purpose: The dependencies every route needs (config, database, storage, mailer, auth, clock, the Google and GoHighLevel
 * clients for account provisioning, a way to wake the provisioning worker, the Claude client lead matching uses (null
 * when ANTHROPIC_API_KEY is not set), the single coach_portal connection (null unless COACH_DATABASE_URL is set),
 * shared by the broker-health adapter and the Coaching section's coach store built on it, and the runner for work done
 * after a response), and the Fastify
 * type additions that expose them as app.deps and the signed-in user as request.actor.
 *
 * Functions:
 * - none
 */
import type { Database } from "@bp/db";
import type { BrokerStatus, UserRole } from "@bp/shared";
import type { FileStorage } from "@bp/shared/node";
import type { Auth } from "./auth";
import type { CoachStore } from "./services/coaching/store";
import type { ApiEnv } from "./env";
import type { BackgroundTasks } from "./services/background-tasks";
import type { Mailer } from "./services/mailer";
import type { MatchAi } from "./services/match/claude";
import type { Integrations } from "./services/provisioning/integrations";

export type AppDeps = {
  env: ApiEnv;
  db: Database;
  storage: FileStorage;
  mailer: Mailer;
  auth: Auth;
  now: () => Date;
  integrations: Integrations;
  wakeProvisioning: () => void;
  matchAi: MatchAi | null;
  coachDb: Database | null;
  background: BackgroundTasks;
  coach: CoachStore | null;
};

export type RequestActor = {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
  brokerId: string | null;
  brokerStatus: BrokerStatus | null;
  sessionId: string;
};

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDeps;
  }
  interface FastifyRequest {
    actor: RequestActor | null;
  }
}
