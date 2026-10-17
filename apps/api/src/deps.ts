/**
 * File: apps/api/src/deps.ts
 * Purpose: The dependencies every route needs (config, database, storage, mailer, auth, clock), and the Fastify
 * type additions that expose them as app.deps and the signed-in user as request.actor.
 *
 * Functions:
 * - none
 */
import type { Database } from "@bp/db";
import type { BrokerStatus, UserRole } from "@bp/shared";
import type { FileStorage } from "@bp/shared/node";
import type { Auth } from "./auth";
import type { ApiEnv } from "./env";
import type { Mailer } from "./services/mailer";

export type AppDeps = {
  env: ApiEnv;
  db: Database;
  storage: FileStorage;
  mailer: Mailer;
  auth: Auth;
  now: () => Date;
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
