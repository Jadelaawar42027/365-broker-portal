/**
 * File: packages/db/src/seed/index.ts
 * Purpose: Seeds a database with the 10 onboarding steps (and their short guidance, video slots and knowledge check
 * while a step has none yet), the owner account, the training chapters from the manual
 * (when asked) and (outside production) three sample brokers in different states. Safe to run again: existing steps,
 * users and chapters are left alone.
 *
 * Functions:
 * - seedDatabase(db, options): runs the whole seed in one transaction (on deploy, first removing the old Part 0 and 01–06 training drafts nobody has touched); returns a summary of what changed and any invite links created.
 * - seedSteps(tx, refresh): inserts missing onboarding steps (or overwrites them when refresh is true); returns inserted and updated counts.
 * - addMissingBrokerSteps(tx): gives every existing broker a todo row for any active step they don't have yet (e.g. step 0 "Start here", SPEC D30); returns how many rows were added.
 * - addPasswordLogin(tx, userId, password): creates the Better Auth credential account holding the hashed password.
 * - ensureOwner(tx, owner): creates the owner user and login if the email is new; returns the owner id and whether it was created.
 * - loadStepIds(tx): returns a map from step key to onboarding step id.
 * - setStepState(tx, brokerId, stepId, state): updates one broker_steps row with a seeded status and timestamps.
 * - at(isoDate, hourUtc): returns a Date on that ISO day at the given UTC hour.
 * - brokerExists(tx, email): returns true if a user with that email is already in the database.
 * - seedDaniel(tx, context): creates Daniel Reyes, mid-onboarding with one step sent back and one waiting for review.
 * - seedKevin(tx, context): creates Kevin Osei, an active broker with every step approved and a persona.
 * - seedMarisol(tx, context): creates Marisol Vega, invited but not signed up yet, with a fresh invite token.
 * - attachSampleFile(tx, context, input): uploads a placeholder file to storage (when storage is configured) and records it as version 1 of the step.
 */
import { addDays, buildStorageKey, INVITE_TTL_DAYS, todayInTimeZone, type StepStatus } from "@bp/shared";
import { createAccountToken, type FileStorage } from "@bp/shared/node";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createBroker } from "../brokers";
import type { Database, Transaction } from "../client";
import { accountTokens, accounts, brokerSteps, files, onboardingSteps, users } from "../schema";
import { SAMPLE_BIO, SAMPLE_PERSONA } from "./sample-content";
import { samplePdf, samplePng } from "./sample-files";
import { seedStepGuidance } from "./step-content";
import { ONBOARDING_STEP_SEEDS } from "./steps";
import { removeRetiredTrainingDrafts, seedTraining } from "./training";

export type SeedOptions = {
  owner?: { name: string; email: string; password: string } | null;
  sampleBrokers?: { password: string } | null;
  storage?: FileStorage | null;
  refreshSteps?: boolean;
  training?: { publish: boolean } | null;
  removeRetiredTrainingDrafts?: boolean;
  now?: Date;
  webOrigin?: string;
};

export type SeedSummary = {
  stepsInserted: number;
  stepsUpdated: number;
  stepsGuided: number;
  brokerStepsAdded: number;
  owner: "created" | "existing" | "skipped";
  trainingChaptersInserted: number;
  trainingDraftsDeleted?: string[];
  sampleBrokers: { email: string; outcome: "created" | "existing" }[];
  inviteLinks: { email: string; url: string }[];
};

type SampleContext = {
  now: Date;
  today: string;
  ownerId: string | null;
  password: string;
  webOrigin: string;
  stepIds: Map<string, string>;
  storage: FileStorage | null;
  summary: SeedSummary;
};

type StepState = {
  status: StepStatus;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  formData?: Record<string, unknown> | null;
};

export async function seedDatabase(db: Database, options: SeedOptions = {}): Promise<SeedSummary> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const summary: SeedSummary = {
      stepsInserted: 0,
      stepsUpdated: 0,
      stepsGuided: 0,
      brokerStepsAdded: 0,
      owner: "skipped",
      trainingChaptersInserted: 0,
      sampleBrokers: [],
      inviteLinks: [],
    };
    const steps = await seedSteps(tx, options.refreshSteps ?? false);
    summary.stepsInserted = steps.inserted;
    summary.stepsUpdated = steps.updated;
    summary.stepsGuided = await seedStepGuidance(tx);
    summary.brokerStepsAdded = await addMissingBrokerSteps(tx);

    if (options.removeRetiredTrainingDrafts) {
      summary.trainingDraftsDeleted = await removeRetiredTrainingDrafts(tx, now);
    }

    if (options.training) {
      summary.trainingChaptersInserted = (await seedTraining(tx, { publish: options.training.publish, now })).chaptersInserted;
    }

    let ownerId: string | null = null;
    if (options.owner) {
      const owner = await ensureOwner(tx, options.owner);
      ownerId = owner.id;
      summary.owner = owner.created ? "created" : "existing";
    }

    if (options.sampleBrokers) {
      const context: SampleContext = {
        now,
        today: todayInTimeZone(now),
        ownerId,
        password: options.sampleBrokers.password,
        webOrigin: (options.webOrigin ?? "http://localhost:3000").replace(/\/+$/, ""),
        stepIds: await loadStepIds(tx),
        storage: options.storage ?? null,
        summary,
      };
      await seedDaniel(tx, context);
      await seedKevin(tx, context);
      await seedMarisol(tx, context);
    }
    return summary;
  });
}

async function seedSteps(tx: Transaction, refresh: boolean) {
  let inserted = 0;
  let updated = 0;
  for (const step of ONBOARDING_STEP_SEEDS) {
    const rows = refresh
      ? await tx
          .insert(onboardingSteps)
          .values(step)
          .onConflictDoUpdate({ target: onboardingSteps.key, set: { ...step, updatedAt: new Date() } })
          .returning({ createdAt: onboardingSteps.createdAt, updatedAt: onboardingSteps.updatedAt })
      : await tx
          .insert(onboardingSteps)
          .values(step)
          .onConflictDoNothing({ target: onboardingSteps.key })
          .returning({ createdAt: onboardingSteps.createdAt, updatedAt: onboardingSteps.updatedAt });
    const row = rows[0];
    if (!row) continue;
    if (row.createdAt.getTime() === row.updatedAt.getTime()) inserted += 1;
    else updated += 1;
  }
  return { inserted, updated };
}

async function addMissingBrokerSteps(tx: Transaction): Promise<number> {
  const added = await tx.execute(sql`
    INSERT INTO broker_steps (broker_id, step_id)
    SELECT b.id, s.id
    FROM brokers b
    CROSS JOIN onboarding_steps s
    WHERE s.active
      AND NOT EXISTS (SELECT 1 FROM broker_steps bs WHERE bs.broker_id = b.id AND bs.step_id = s.id)
    RETURNING id
  `);
  return added.length;
}

async function addPasswordLogin(tx: Transaction, userId: string, password: string): Promise<void> {
  await tx.insert(accounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(password),
  });
}

async function ensureOwner(tx: Transaction, owner: NonNullable<SeedOptions["owner"]>) {
  const email = owner.email.trim().toLowerCase();
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { id: existing.id, created: false };
  const [created] = await tx
    .insert(users)
    .values({ name: owner.name, email, role: "owner", emailVerified: true })
    .returning({ id: users.id });
  await addPasswordLogin(tx, created!.id, owner.password);
  return { id: created!.id, created: true };
}

async function loadStepIds(tx: Transaction): Promise<Map<string, string>> {
  const rows = await tx.select({ id: onboardingSteps.id, key: onboardingSteps.key }).from(onboardingSteps);
  return new Map(rows.map((row) => [row.key, row.id]));
}

async function attachSampleFile(
  tx: Transaction,
  context: SampleContext,
  input: { brokerId: string; userId: string; stepKey: string; title: string; uploadedAt: Date; image?: boolean },
) {
  if (!context.storage) return;
  const fileName = input.image ? "headshot.png" : `${input.stepKey}.pdf`;
  const contentType = input.image ? "image/png" : "application/pdf";
  const body = input.image ? samplePng() : samplePdf(input.title);
  const storageKey = buildStorageKey({ brokerId: input.brokerId, stepKey: input.stepKey, version: 1, nonce: "seed", fileName });
  await context.storage.putObject({ key: storageKey, body, contentType });
  const [step] = await tx
    .select({ id: brokerSteps.id })
    .from(brokerSteps)
    .where(and(eq(brokerSteps.brokerId, input.brokerId), eq(brokerSteps.stepId, context.stepIds.get(input.stepKey)!)));
  await tx.insert(files).values({
    brokerStepId: step!.id,
    storageKey,
    fileName,
    mimeType: contentType,
    sizeBytes: body.byteLength,
    version: 1,
    uploadedBy: input.userId,
    createdAt: input.uploadedAt,
  });
}

async function setStepState(tx: Transaction, brokerId: string, stepId: string, state: StepState) {
  await tx
    .update(brokerSteps)
    .set({
      status: state.status,
      attempts: state.submittedAt ? 1 : 0,
      submittedAt: state.submittedAt ?? null,
      reviewedAt: state.reviewedAt ?? null,
      reviewedBy: state.reviewedBy ?? null,
      reviewNote: state.reviewNote ?? null,
      formData: state.formData ?? null,
    })
    .where(and(eq(brokerSteps.brokerId, brokerId), eq(brokerSteps.stepId, stepId)));
}

function at(isoDate: string, hourUtc: number): Date {
  return new Date(`${isoDate}T${String(hourUtc).padStart(2, "0")}:00:00Z`);
}

async function brokerExists(tx: Transaction, email: string): Promise<boolean> {
  const rows = await tx.select({ id: users.id }).from(users).where(inArray(users.email, [email]));
  return rows.length > 0;
}

async function seedDaniel(tx: Transaction, context: SampleContext) {
  const email = "daniel.reyes@example.com";
  if (await brokerExists(tx, email)) {
    context.summary.sampleBrokers.push({ email, outcome: "existing" });
    return;
  }
  const { today, ownerId, stepIds } = context;
  const { brokerId, userId } = await createBroker(tx, {
    name: "Daniel Reyes",
    email,
    phone: "+15615550123",
    level: "junior",
    status: "onboarding",
    joinedAt: addDays(today, -4),
    inHouseSplit: 40,
    selfGeneratedSplit: 50,
  });
  await addPasswordLogin(tx, userId, context.password);
  const step = (key: string) => stepIds.get(key)!;
  await setStepState(tx, brokerId, step("photo_id"), {
    status: "approved",
    submittedAt: at(addDays(today, -4), 14),
    reviewedAt: at(addDays(today, -3), 15),
    reviewedBy: ownerId,
  });
  await setStepState(tx, brokerId, step("contract_nda"), {
    status: "approved",
    submittedAt: at(addDays(today, -3), 16),
    reviewedAt: at(addDays(today, -2), 13),
    reviewedBy: ownerId,
  });
  await setStepState(tx, brokerId, step("bio"), {
    status: "submitted",
    submittedAt: at(addDays(today, -1), 14),
    formData: { text: SAMPLE_BIO },
  });
  await setStepState(tx, brokerId, step("headshot"), {
    status: "changes_requested",
    submittedAt: at(addDays(today, -2), 15),
    reviewedAt: at(addDays(today, -1), 16),
    reviewedBy: ownerId,
    reviewNote: "Please use a photo with a plain background, shoulders up.",
  });
  await setStepState(tx, brokerId, step("license_situation"), {
    status: "approved",
    submittedAt: at(addDays(today, -2), 17),
    formData: { choice: "transfer" },
  });
  const uploads = [
    { stepKey: "photo_id", title: "Photo ID", uploadedAt: at(addDays(today, -4), 14) },
    { stepKey: "contract_nda", title: "Employment Contract & NDA", uploadedAt: at(addDays(today, -3), 16) },
    { stepKey: "headshot", title: "Headshot", uploadedAt: at(addDays(today, -2), 15), image: true },
  ];
  for (const upload of uploads) await attachSampleFile(tx, context, { brokerId, userId, ...upload });
  context.summary.sampleBrokers.push({ email, outcome: "created" });
}

async function seedKevin(tx: Transaction, context: SampleContext) {
  const email = "kevin.osei@example.com";
  if (await brokerExists(tx, email)) {
    context.summary.sampleBrokers.push({ email, outcome: "existing" });
    return;
  }
  const joinedAt = "2026-08-18";
  const { brokerId, userId } = await createBroker(tx, {
    name: "Kevin Osei",
    email,
    phone: "+15615550188",
    level: "junior",
    status: "active",
    joinedAt,
    onboardedAt: "2026-08-27",
    inHouseSplit: 40,
    selfGeneratedSplit: 60,
    personaMd: SAMPLE_PERSONA,
  });
  await tx
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, userId));
  await addPasswordLogin(tx, userId, context.password);
  const formDataByKey: Record<string, Record<string, unknown>> = {
    bio: { text: SAMPLE_BIO },
    license_situation: { choice: "new" },
    email_signature: { confirmed: true },
    platform_logins: { checked: ["boatwizard", "yachtcloser", "gohighlevel"] },
  };
  for (const seed of ONBOARDING_STEP_SEEDS) {
    const day = addDays(joinedAt, Math.max(0, Math.min(9, Math.floor((seed.position - 1) * 0.9))));
    await setStepState(tx, brokerId, context.stepIds.get(seed.key)!, {
      status: "approved",
      submittedAt: seed.kind === "admin" ? null : at(day, 14),
      reviewedAt: seed.needsApproval ? at(day, 18) : null,
      reviewedBy: seed.needsApproval ? context.ownerId : null,
      formData: formDataByKey[seed.key] ?? null,
    });
    if (seed.kind === "upload") {
      await attachSampleFile(tx, context, {
        brokerId,
        userId,
        stepKey: seed.key,
        title: seed.shortTitle,
        uploadedAt: at(day, 14),
        image: seed.key === "headshot",
      });
    }
  }
  context.summary.sampleBrokers.push({ email, outcome: "created" });
}

async function seedMarisol(tx: Transaction, context: SampleContext) {
  const email = "marisol.vega@example.com";
  if (await brokerExists(tx, email)) {
    context.summary.sampleBrokers.push({ email, outcome: "existing" });
    return;
  }
  const { userId } = await createBroker(tx, {
    name: "Marisol Vega",
    email,
    level: "senior",
    status: "invited",
    joinedAt: context.today,
    inHouseSplit: 50,
    selfGeneratedSplit: 70,
  });
  const { token, tokenHash } = createAccountToken();
  await tx.insert(accountTokens).values({
    userId,
    purpose: "invite",
    tokenHash,
    expiresAt: new Date(context.now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdBy: context.ownerId,
  });
  context.summary.sampleBrokers.push({ email, outcome: "created" });
  context.summary.inviteLinks.push({ email, url: `${context.webOrigin}/invite/${token}` });
}
