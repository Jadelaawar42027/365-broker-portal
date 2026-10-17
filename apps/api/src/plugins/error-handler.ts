/**
 * File: apps/api/src/plugins/error-handler.ts
 * Purpose: Turns every thrown error into a consistent JSON response { error, message, issues? }: Zod validation
 * errors become 400, rejected step transitions 409, HttpErrors keep their status, and anything unexpected is
 * logged and returned as a generic 500 without internal details.
 *
 * Functions:
 * - registerErrorHandler(app): installs the error and not-found handlers.
 */
import { StepTransitionError } from "@bp/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { HttpError } from "../errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: "validation_error",
        message: error.validation[0]?.message ?? "Some fields are not valid.",
        issues: error.validation.map((issue) => ({
          path: [error.validationContext, ...String(issue.instancePath).split("/").filter(Boolean)].join("."),
          message: issue.message ?? "Invalid value",
        })),
      });
    }
    if (error instanceof StepTransitionError) {
      return reply.status(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause }, "Response did not match its schema");
      return reply.status(500).send({ error: "internal_error", message: "Something went wrong on our side." });
    }
    const status = error.statusCode ?? 500;
    if (status < 500) {
      return reply.status(status).send({ error: error.code ?? "bad_request", message: error.message });
    }
    request.log.error({ err: error }, "Unhandled error");
    return reply.status(500).send({ error: "internal_error", message: "Something went wrong on our side." });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: "not_found", message: `Route ${request.method} ${request.url} not found.` });
  });
}
