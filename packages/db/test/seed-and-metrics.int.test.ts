/**
 * File: packages/db/test/seed-and-metrics.int.test.ts
 * Purpose: Integration tests on a real Postgres container: the seed (content, sample commission splits, idempotency, refresh, owner login,
 * invite token), the broker_metrics view numbers, and the metrics_reader permissions (view only, nothing else).
 *
 * Functions:
 * - metricsFor(email): reads one broker's broker_metrics row by email.
 * - urlForUser(url, username, password): returns the connection URL with different credentials.
 */
import { addDays, daysBetween, todayInTimeZone } from "@bp/shared";
import { hashToken } from "@bp/shared/node";
import { verifyPassword } from "better-auth/crypto";
import { and, eq, sql as rawSql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accountTokens,
  accounts,
  brokerMetrics,
  brokerSteps,
  brokers,
  files,
  onboardingSteps,
  seedDatabase,
  upsertMetricsLogin,
  users,
} from "../src";
import { startTestDatabase } from "../src/testing";

const NOW = new Date("2026-10-17T16:00:00Z");
const OWNER = { name: "Aj", email: "Owner@Example.com", password: "owner-password-123" };
const SAMPLE_PASSWORD = "sample-broker-pass";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let firstSummary: Awaited<ReturnType<typeof seedDatabase>>;

beforeAll(async () => {
  testDb = await startTestDatabase();
  firstSummary = await seedDatabase(testDb.db, {
    owner: OWNER,
    sampleBrokers: { password: SAMPLE_PASSWORD },
    now: NOW,
    webOrigin: "http://localhost:3000/",
  });
});

afterAll(async () => {
  await testDb?.stop();
});

async function metricsFor(email: string) {
  const [row] = await testDb.db.select().from(brokerMetrics).where(eq(brokerMetrics.email, email));
  return row!;
}

function urlForUser(url: string, username: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

describe("seed", () => {
  it("creates the 10 onboarding steps in spec order, without the retired commission step", async () => {
    const steps = await testDb.db.select().from(onboardingSteps).orderBy(onboardingSteps.position);
    expect(firstSummary.stepsInserted).toBe(10);
    expect(steps.map((step) => step.key)).toEqual([
      "photo_id", "contract_nda", "bio", "headshot", "w9", "license_situation",
      "dbpr_filing", "license_bond", "email_signature", "platform_logins",
    ]);
    expect(steps.filter((step) => !step.needsApproval).map((step) => step.key)).toEqual([
      "license_situation", "email_signature", "platform_logins",
    ]);
    expect(steps.filter((step) => step.kind === "admin")).toEqual([]);
  });

  it("creates the owner with a password Better Auth can verify", async () => {
    const [owner] = await testDb.db.select().from(users).where(eq(users.email, "owner@example.com"));
    expect(owner?.role).toBe("owner");
    const [account] = await testDb.db.select().from(accounts).where(eq(accounts.userId, owner!.id));
    expect(account?.providerId).toBe("credential");
    expect(await verifyPassword({ hash: account!.password!, password: OWNER.password })).toBe(true);
    expect(await verifyPassword({ hash: account!.password!, password: "wrong-password" })).toBe(false);
  });

  it("creates three sample brokers, each with a full checklist", async () => {
    expect(firstSummary.sampleBrokers.map((sample) => sample.outcome)).toEqual(["created", "created", "created"]);
    const rows = await testDb.db
      .select({ status: brokers.status, count: rawSql<number>`count(${brokerSteps.id})::int` })
      .from(brokers)
      .leftJoin(brokerSteps, eq(brokerSteps.brokerId, brokers.id))
      .groupBy(brokers.status);
    expect(Object.fromEntries(rows.map((row) => [row.status, row.count]))).toEqual({
      onboarding: 10,
      active: 10,
      invited: 10,
    });
  });

  it("gives every sample broker both commission splits", async () => {
    const rows = await testDb.db
      .select({ email: users.email, inHouseSplit: brokers.inHouseSplit, selfGeneratedSplit: brokers.selfGeneratedSplit })
      .from(brokers)
      .innerJoin(users, eq(users.id, brokers.userId))
      .orderBy(users.email);
    expect(rows).toEqual([
      { email: "daniel.reyes@example.com", inHouseSplit: 40, selfGeneratedSplit: 50 },
      { email: "kevin.osei@example.com", inHouseSplit: 40, selfGeneratedSplit: 60 },
      { email: "marisol.vega@example.com", inHouseSplit: 50, selfGeneratedSplit: 70 },
    ]);
  });

  it("stores only the hash of Marisol's invite token, valid for 7 days", async () => {
    const link = firstSummary.inviteLinks[0]!;
    expect(link.url).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]+$/);
    const token = link.url.split("/").pop()!;
    const [row] = await testDb.db.select().from(accountTokens).where(eq(accountTokens.tokenHash, hashToken(token)));
    expect(row?.purpose).toBe("invite");
    expect(row?.expiresAt.toISOString()).toBe("2026-10-24T16:00:00.000Z");
    expect(row?.usedAt).toBeNull();
  });

  it("puts Daniel's sent-back step and review note in place", async () => {
    const [row] = await testDb.db
      .select({ status: brokerSteps.status, note: brokerSteps.reviewNote })
      .from(brokerSteps)
      .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
      .innerJoin(brokers, eq(brokers.id, brokerSteps.brokerId))
      .innerJoin(users, eq(users.id, brokers.userId))
      .where(and(eq(users.email, "daniel.reyes@example.com"), eq(onboardingSteps.key, "headshot")));
    expect(row).toEqual({
      status: "changes_requested",
      note: "Please use a photo with a plain background, shoulders up.",
    });
  });

  it("is safe to run again", async () => {
    const before = await testDb.db.select({ count: rawSql<number>`count(*)::int` }).from(brokerSteps);
    const again = await seedDatabase(testDb.db, {
      owner: OWNER,
      sampleBrokers: { password: SAMPLE_PASSWORD },
      now: NOW,
    });
    const after = await testDb.db.select({ count: rawSql<number>`count(*)::int` }).from(brokerSteps);
    expect(again).toEqual({
      stepsInserted: 0,
      stepsUpdated: 0,
      stepsGuided: 0,
      owner: "existing",
      trainingChaptersInserted: 0,
      sampleBrokers: [
        { email: "daniel.reyes@example.com", outcome: "existing" },
        { email: "kevin.osei@example.com", outcome: "existing" },
        { email: "marisol.vega@example.com", outcome: "existing" },
      ],
      inviteLinks: [],
    });
    expect(after).toEqual(before);
  });

  it("restores edited step copy with refreshSteps", async () => {
    await testDb.db.update(onboardingSteps).set({ title: "Edited" }).where(eq(onboardingSteps.key, "w9"));
    const refreshed = await seedDatabase(testDb.db, { refreshSteps: true });
    expect(refreshed.stepsUpdated).toBe(10);
    const [w9] = await testDb.db.select().from(onboardingSteps).where(eq(onboardingSteps.key, "w9"));
    expect(w9?.title).toBe("Upload your W-9");
  });
});

describe("broker_metrics view", () => {
  const today = () => todayInTimeZone(new Date());

  it("reports an onboarded active broker", async () => {
    const kevin = await metricsFor("kevin.osei@example.com");
    expect(kevin).toMatchObject({
      name: "Kevin Osei",
      level: "junior",
      status: "active",
      isActive: true,
      joinedAt: "2026-08-18",
      onboardedAt: "2026-08-27",
      leftAt: null,
      daysToOnboard: 9,
      stepsTotal: 10,
      stepsApproved: 10,
      stepsWaitingReview: 0,
    });
    expect(kevin.tenureDays).toBe(daysBetween("2026-08-18", today()));
    expect(kevin.lastActivityAt?.toISOString()).toBe("2026-08-26T14:00:00.000Z");
  });

  it("reports a broker mid-onboarding", async () => {
    const daniel = await metricsFor("daniel.reyes@example.com");
    expect(daniel).toMatchObject({
      status: "onboarding",
      isActive: false,
      joinedAt: addDays("2026-10-17", -4),
      onboardedAt: null,
      daysToOnboard: null,
      stepsTotal: 10,
      stepsApproved: 3,
      stepsWaitingReview: 1,
    });
    expect(daniel.lastActivityAt?.toISOString()).toBe("2026-10-16T16:00:00.000Z");
  });

  it("reports an invited broker with no activity", async () => {
    const marisol = await metricsFor("marisol.vega@example.com");
    expect(marisol).toMatchObject({ status: "invited", stepsApproved: 0, stepsWaitingReview: 0, lastActivityAt: null });
    expect(marisol.tenureDays).toBe(daysBetween("2026-10-17", today()));
  });

  it("stops tenure at left_at for brokers who left", async () => {
    await testDb.db.update(brokers).set({ status: "inactive", leftAt: "2026-09-30" }).where(eq(brokers.onboardedAt, "2026-08-27"));
    const kevin = await metricsFor("kevin.osei@example.com");
    expect(kevin).toMatchObject({ isActive: false, leftAt: "2026-09-30", tenureDays: 43 });
    await testDb.db.update(brokers).set({ status: "active", leftAt: null }).where(eq(brokers.onboardedAt, "2026-08-27"));
  });

  it("leaves retired steps out of the totals", async () => {
    await testDb.db.update(onboardingSteps).set({ active: false }).where(eq(onboardingSteps.key, "license_situation"));
    const daniel = await metricsFor("daniel.reyes@example.com");
    expect(daniel).toMatchObject({ stepsTotal: 9, stepsApproved: 2 });
    await testDb.db.update(onboardingSteps).set({ active: true }).where(eq(onboardingSteps.key, "license_situation"));
  });

  it("counts a new upload as activity", async () => {
    const [w9] = await testDb.db
      .select({ id: brokerSteps.id })
      .from(brokerSteps)
      .innerJoin(onboardingSteps, eq(onboardingSteps.id, brokerSteps.stepId))
      .innerJoin(brokers, eq(brokers.id, brokerSteps.brokerId))
      .innerJoin(users, eq(users.id, brokers.userId))
      .where(and(eq(users.email, "daniel.reyes@example.com"), eq(onboardingSteps.key, "w9")));
    const uploadedAt = new Date("2026-10-17T15:30:00Z");
    await testDb.db.insert(files).values({
      brokerStepId: w9!.id,
      storageKey: "brokers/test/w9/1-w9.pdf",
      fileName: "w9.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      version: 1,
      createdAt: uploadedAt,
    });
    const daniel = await metricsFor("daniel.reyes@example.com");
    expect(daniel.lastActivityAt?.toISOString()).toBe(uploadedAt.toISOString());
  });
});

describe("metrics_reader login", () => {
  const password = "metrics-password-long-enough";

  it("creates the login, then resets it on a second run", async () => {
    expect(await upsertMetricsLogin(testDb.sql, { username: "metrics_test", password })).toBe("created");
    expect(await upsertMetricsLogin(testDb.sql, { username: "metrics_test", password })).toBe("updated");
  });

  it("can read broker_metrics and nothing else", async () => {
    const reader = postgres(urlForUser(testDb.url, "metrics_test", password), { max: 1, onnotice: () => {} });
    try {
      const rows = await reader`SELECT count(*)::int AS count FROM broker_metrics`;
      expect(rows[0]?.count).toBe(3);
      await expect(reader`SELECT persona_md FROM brokers`).rejects.toThrow(/permission denied/);
      await expect(reader`SELECT email FROM users`).rejects.toThrow(/permission denied/);
      await expect(reader`SELECT * FROM files`).rejects.toThrow(/permission denied/);
      await expect(reader`DELETE FROM broker_metrics`).rejects.toThrow();
    } finally {
      await reader.end({ timeout: 5 });
    }
  });

  it("rejects unsafe usernames and short passwords", async () => {
    await expect(upsertMetricsLogin(testDb.sql, { username: "bad name; DROP", password })).rejects.toThrow(/lowercase/);
    await expect(upsertMetricsLogin(testDb.sql, { username: "metrics_test", password: "short" })).rejects.toThrow(/16 characters/);
  });

  it("handles passwords with quotes safely", async () => {
    const tricky = "it's a 'quoted' pass; --";
    await upsertMetricsLogin(testDb.sql, { username: "metrics_quote", password: tricky });
    const reader = postgres(urlForUser(testDb.url, "metrics_quote", tricky), { max: 1, onnotice: () => {} });
    try {
      const rows = await reader`SELECT count(*)::int AS count FROM broker_metrics`;
      expect(rows[0]?.count).toBe(3);
    } finally {
      await reader.end({ timeout: 5 });
    }
  });
});

describe("schema constraints", () => {
  it("allows only one progress row per broker and step", async () => {
    const [row] = await testDb.db.select().from(brokerSteps).limit(1);
    await expect(
      testDb.db.insert(brokerSteps).values({ brokerId: row!.brokerId, stepId: row!.stepId }),
    ).rejects.toThrow();
  });

  it("rejects a leaving date before the joining date", async () => {
    await expect(
      testDb.db.update(brokers).set({ leftAt: "2000-01-01" }).where(eq(brokers.onboardedAt, "2026-08-27")),
    ).rejects.toThrow();
  });
});
