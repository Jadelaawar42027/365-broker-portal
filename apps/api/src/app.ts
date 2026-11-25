/**
 * File: apps/api/src/app.ts
 * Purpose: Builds the Fastify application (validation, error handling, auth, OpenAPI and every route, including the
 * API-key lead-matching routes) without starting it, so tests can call it with app.inject() and server.ts can listen on a
 * port. Tests can pass their own Claude stand-in (matchAi), coach connection (coachDb), coach store and background runner.
 * With COACH_DATABASE_URL set it opens ONE coach_portal connection, shared by the lead-matching health adapter (which only
 * queries it when HEALTH_SOURCE is coach) and the Coaching section's store, and closes it with the app.
 *
 * Functions:
 * - buildApp(input): creates the Fastify instance with the given dependencies (opening the shared coach_portal connection
 *   and building the coach store on it when COACH_DATABASE_URL is set and none is given) and returns it ready to use.
 */
import { createDb, type Database } from "@bp/db";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { createAuth, type Auth } from "./auth";
import type { AppDeps } from "./deps";
import { registerAuthGuard } from "./plugins/auth-guard";
import { registerErrorHandler } from "./plugins/error-handler";
import { registerOpenApi } from "./plugins/openapi";
import { registerOriginCheck } from "./plugins/origin-check";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerBrokerStepRoutes } from "./routes/broker-steps";
import { registerContractRoutes } from "./routes/contracts";
import { registerFileRoutes } from "./routes/files";
import { registerHealthRoutes } from "./routes/health";
import { registerInviteRoutes } from "./routes/invites";
import { registerMatchRoutes } from "./routes/match";
import { registerMeRoutes } from "./routes/me";
import { registerMeCoachingRoutes } from "./routes/me-coaching";
import { registerMyAccountRoutes } from "./routes/my-accounts";
import { registerPasswordResetRoutes } from "./routes/password-reset";
import { registerTrainingRoutes } from "./routes/training";
import { createBackgroundTasks, type BackgroundTasks } from "./services/background-tasks";
import { createCoachStore, type CoachStore } from "./services/coaching/store";
import { createMailer, type Mailer } from "./services/mailer";
import { createMatchAiFromEnv, type MatchAi } from "./services/match/claude";
import { createIntegrations, type Integrations } from "./services/provisioning/integrations";

export type BuildAppInput = Omit<AppDeps, "auth" | "mailer" | "now" | "integrations" | "wakeProvisioning" | "matchAi" | "coachDb" | "background" | "coach"> & {
  coach?: CoachStore | null;
  auth?: Auth;
  mailer?: Mailer;
  now?: () => Date;
  integrations?: Integrations;
  wakeProvisioning?: () => void;
  matchAi?: MatchAi | null;
  coachDb?: Database | null;
  background?: BackgroundTasks;
};

export async function buildApp(input: BuildAppInput): Promise<FastifyInstance> {
  const { env } = input;
  const coachConnection = input.coachDb === undefined && env.COACH_DATABASE_URL ? createDb(env.COACH_DATABASE_URL, { max: 3 }) : null;
  const coachDb = input.coachDb !== undefined ? input.coachDb : (coachConnection?.db ?? null);
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
    routerOptions: { maxParamLength: 4000 },
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("deps", {
    ...input,
    auth: input.auth ?? createAuth({ db: input.db, env }),
    mailer: input.mailer ?? createMailer(env, app.log),
    now: input.now ?? (() => new Date()),
    integrations: input.integrations ?? createIntegrations(env),
    wakeProvisioning: input.wakeProvisioning ?? (() => undefined),
    matchAi: input.matchAi !== undefined ? input.matchAi : createMatchAiFromEnv(env),
    coachDb,
    background: input.background ?? createBackgroundTasks(app.log),
    coach: input.coach !== undefined ? input.coach : coachDb ? createCoachStore(coachDb) : null,
  });

  if (coachConnection) app.addHook("onClose", async () => coachConnection.close());

  registerErrorHandler(app);
  registerOriginCheck(app, env.WEB_ORIGIN);
  registerAuthGuard(app);
  await registerOpenApi(app, env);

  registerHealthRoutes(app);
  await registerAuthRoutes(app);
  registerInviteRoutes(app);
  registerPasswordResetRoutes(app);
  registerMeRoutes(app);
  registerMeCoachingRoutes(app);
  registerMyAccountRoutes(app);
  registerBrokerStepRoutes(app);
  registerContractRoutes(app);
  registerTrainingRoutes(app);
  await registerFileRoutes(app);
  await registerAdminRoutes(app);
  registerMatchRoutes(app);

  await app.ready();
  return app;
}
