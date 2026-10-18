/**
 * File: apps/api/src/services/mailer.ts
 * Purpose: Sends email. Uses Resend when RESEND_API_KEY is set, otherwise prints the email to the API log
 * (docs/SPEC.md) and, when EMAIL_OUTBOX_DIR is set (development and tests only), also saves it as a JSON file so
 * end-to-end tests can open invite and reset links. Sending never breaks a request: callers use sendSafely.
 *
 * Functions:
 * - createResendMailer(apiKey, from): returns a Mailer that posts to the Resend HTTP API (with any PDF attachments, base64).
 * - createConsoleMailer(log, outboxDir): returns a Mailer that logs each email (attachment names and sizes only) instead of sending it, saving a JSON copy in outboxDir if given.
 * - createMailer(env, log): picks the Resend or console mailer from the environment.
 * - sendSafely(mailer, log, messages): sends each message (skipping placeholder addresses of brokers invited without an email, SPEC D29), logging failures instead of throwing.
 */
import { isPlaceholderEmail } from "@bp/shared";
import type { FastifyBaseLogger } from "fastify";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApiEnv } from "../env";

export type EmailAttachment = { filename: string; content: Uint8Array };
export type EmailMessage = { to: string; subject: string; text: string; attachments?: EmailAttachment[] };
export type Mailer = { send(message: EmailMessage): Promise<void> };

export function createResendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.attachments?.length
            ? { attachments: message.attachments.map((attachment) => ({ filename: attachment.filename, content: Buffer.from(attachment.content).toString("base64") })) }
            : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
      }
    },
  };
}

export function createConsoleMailer(log: FastifyBaseLogger, outboxDir?: string): Mailer {
  return {
    async send(message) {
      const record = {
        to: message.to,
        subject: message.subject,
        text: message.text,
        attachments: (message.attachments ?? []).map((attachment) => ({ filename: attachment.filename, sizeBytes: attachment.content.byteLength })),
      };
      log.info({ email: record }, `Email (not sent, RESEND_API_KEY is empty) to ${message.to}: ${message.subject}`);
      if (outboxDir) {
        await mkdir(outboxDir, { recursive: true });
        const name = `${Date.now()}-${randomBytes(4).toString("hex")}.json`;
        await writeFile(path.join(outboxDir, name), JSON.stringify({ ...record, sentAt: new Date().toISOString() }, null, 2));
      }
    },
  };
}

export function createMailer(env: ApiEnv, log: FastifyBaseLogger): Mailer {
  return env.RESEND_API_KEY ? createResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : createConsoleMailer(log, env.EMAIL_OUTBOX_DIR);
}

export async function sendSafely(mailer: Mailer, log: FastifyBaseLogger, messages: EmailMessage[]): Promise<void> {
  for (const message of messages) {
    if (isPlaceholderEmail(message.to)) continue;
    try {
      await mailer.send(message);
    } catch (error) {
      log.error({ err: error, to: message.to, subject: message.subject }, "Email failed to send");
    }
  }
}
