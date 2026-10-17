/**
 * File: packages/shared/test/api-contract.test.ts
 * Purpose: Tests for the HTTP contract schemas: response schemas drop fields they don't list (the persona-leak
 * guard), and request schemas enforce the rules the screens rely on (including the two required commission splits).
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  acceptInviteRequestSchema,
  brokerListQuerySchema,
  createBrokerRequestSchema,
  meResponseSchema,
  PRODUCT_NAME,
  sendBackRequestSchema,
  submitStepRequestSchema,
  updateBrokerRequestSchema,
} from "../src";

describe("response schemas", () => {
  it("strip fields that are not part of the contract, such as persona notes", () => {
    const parsed = meResponseSchema.parse({
      user: { id: "u", name: "Dan", email: "d@x.com", phone: null, role: "broker", personaMd: "secret" },
      broker: {
        id: "b",
        level: "junior",
        status: "onboarding",
        joinedAt: "2026-10-13",
        onboardedAt: null,
        inHouseSplit: 40,
        selfGeneratedSplit: 60,
        showWelcome: false,
        personaMd: "secret",
      },
      support: { name: "Shelly", whatsappNumber: null },
    });
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(PRODUCT_NAME).toBe("365 Yachts Broker Portal");
  });
});

describe("request schemas", () => {
  it("accept an invite with a name, a password and a phone number", () => {
    const valid = { name: "Daniel Reyes", password: "long-enough", phone: "(561) 000-0000" };
    expect(acceptInviteRequestSchema.safeParse(valid).success).toBe(true);
    expect(acceptInviteRequestSchema.safeParse({ ...valid, phone: "call me" }).success).toBe(false);
    expect(acceptInviteRequestSchema.safeParse({ ...valid, name: "D" }).success).toBe(false);
  });

  it("need at least one field to update a broker", () => {
    expect(updateBrokerRequestSchema.safeParse({}).success).toBe(false);
    expect(updateBrokerRequestSchema.safeParse({ leftAt: null }).success).toBe(true);
    expect(updateBrokerRequestSchema.safeParse({ joinedAt: "2026-02-30" }).success).toBe(false);
  });

  it("need both commission splits, as whole percentages from 0 to 100, to invite a broker", () => {
    const valid = { name: "Daniel Reyes", email: "dan@example.com", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 };
    expect(createBrokerRequestSchema.safeParse(valid).success).toBe(true);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: 0, selfGeneratedSplit: 100 }).success).toBe(true);
    const { inHouseSplit: _inHouse, ...withoutInHouse } = valid;
    expect(createBrokerRequestSchema.safeParse(withoutInHouse).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, selfGeneratedSplit: 101 }).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: -1 }).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: 42.5 }).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: "40" }).success).toBe(false);
  });

  it("let an admin change one commission split at a time, within 0 to 100", () => {
    expect(updateBrokerRequestSchema.safeParse({ selfGeneratedSplit: 70 }).success).toBe(true);
    expect(updateBrokerRequestSchema.safeParse({ inHouseSplit: 120 }).success).toBe(false);
    expect(updateBrokerRequestSchema.safeParse({ inHouseSplit: null }).success).toBe(false);
  });

  it("need a real note to send a step back", () => {
    expect(sendBackRequestSchema.safeParse({ note: "   " }).success).toBe(false);
    expect(sendBackRequestSchema.parse({ note: "  Sign it  " }).note).toBe("Sign it");
  });

  it("limit a submission to 5 files and validate list filters", () => {
    const file = { storageKey: "k", fileName: "a.pdf" };
    expect(submitStepRequestSchema.safeParse({ files: Array(5).fill(file) }).success).toBe(true);
    expect(submitStepRequestSchema.safeParse({ files: Array(6).fill(file) }).success).toBe(false);
    expect(brokerListQuerySchema.safeParse({ status: "active", level: "senior", search: " vet " }).data?.search).toBe("vet");
    expect(brokerListQuerySchema.safeParse({ status: "retired" }).success).toBe(false);
  });
});
