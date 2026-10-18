/**
 * File: apps/api/src/app.ts
 * Purpose: Builds the Fastify application (validation, error handling, auth, OpenAPI and every route) without
 * starting it, so tests can call it with app.inject() and server.ts can listen on a port.
 *
 * Functions:
 * - buildApp(input): creates the Fastify instance with the given dependencies and returns it ready to use.
 */
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
import { registerMeRoutes } from "./routes/me";
import { registerMyAccountRoutes } from "./routes/my-accounts";
import { registerPasswordResetRoutes } from "./routes/password-reset";
import { registerTrainingRoutes } from "./routes/training";
import { createMailer, type Mailer } from "./services/mailer";
import { createIntegrations, type Integrations } from "./services/provisioning/integrations";

export type BuildAppInput = Omit<AppDeps, "auth" | "mailer" | "now" | "integrations" | "wakeProvisioning"> & {
  auth?: Auth;
  mailer?: Mailer;
  now?: () => Date;
  integrations?: Integrations;
  wakeProvisioning?: () => void;
};

export async function buildApp(input: BuildAppInput): Promise<FastifyInstance> {
  const { env } = input;
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
  });

  registerErrorHandler(app);
  registerOriginCheck(app, env.WEB_ORIGIN);
  registerAuthGuard(app);
  await registerOpenApi(app, env);

  registerHealthRoutes(app);
  await registerAuthRoutes(app);
  registerInviteRoutes(app);
  registerPasswordResetRoutes(app);
  registerMeRoutes(app);
  registerMyAccountRoutes(app);
  registerBrokerStepRoutes(app);
  registerContractRoutes(app);
  registerTrainingRoutes(app);
  await registerFileRoutes(app);
  await registerAdminRoutes(app);

  await app.ready();
  return app;
}
