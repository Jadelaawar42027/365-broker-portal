/**
 * File: apps/api/src/services/mailer.ts
 * Purpose: Sends email. Uses Resend when RESEND_API_KEY is set, otherwise prints the email to the API log
 * (docs/SPEC.md). Sending never breaks a request: callers use sendSafely after their database work commits.
 *
 * Functions:
 * - createResendMailer(apiKey, from): returns a Mailer that posts to the Resend HTTP API.
 * - createConsoleMailer(log): returns a Mailer that logs each email instead of sending it.
 * - createMailer(env, log): picks the Resend or console mailer from the environment.
 * - sendSafely(mailer, log, messages): sends each message, logging failures instead of throwing.
 */
import type { FastifyBaseLogger } from "fastify";
import type { ApiEnv } from "../env";

export type EmailMessage = { to: string; subject: string; text: string };
export type Mailer = { send(message: EmailMessage): Promise<void> };

export function createResendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
      }
    },
  };
}

export function createConsoleMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send(message) {
      log.info({ email: message }, `Email (not sent, RESEND_API_KEY is empty) to ${message.to}: ${message.subject}`);
    },
  };
}

export function createMailer(env: ApiEnv, log: FastifyBaseLogger): Mailer {
  return env.RESEND_API_KEY ? createResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : createConsoleMailer(log);
}

export async function sendSafely(mailer: Mailer, log: FastifyBaseLogger, messages: EmailMessage[]): Promise<void> {
  for (const message of messages) {
    try {
      await mailer.send(message);
    } catch (error) {
      log.error({ err: error, to: message.to, subject: message.subject }, "Email failed to send");
    }
  }
}
