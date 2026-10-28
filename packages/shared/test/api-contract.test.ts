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
  commissionChangeRequestSchema,
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
    const valid = { name: "Daniel Reyes", password: "long-enough", phone: "(561) 555-0123" };
    expect(acceptInviteRequestSchema.parse(valid).phone).toBe("+15615550123");
    expect(acceptInviteRequestSchema.parse({ ...valid, phone: "+44 20 7946 0958" }).phone).toBe("+442079460958");
    expect(acceptInviteRequestSchema.safeParse({ ...valid, phone: "call me" }).success).toBe(false);
    expect(acceptInviteRequestSchema.safeParse({ ...valid, phone: "(561) 000-0000" }).success).toBe(false);
    expect(acceptInviteRequestSchema.safeParse({ ...valid, phone: "-------" }).success).toBe(false);
    expect(acceptInviteRequestSchema.safeParse({ ...valid, name: "D" }).success).toBe(false);
  });

  it("need at least one field to update a broker", () => {
    expect(updateBrokerRequestSchema.safeParse({}).success).toBe(false);
    expect(updateBrokerRequestSchema.safeParse({ leftAt: null }).success).toBe(true);
    expect(updateBrokerRequestSchema.safeParse({ joinedAt: "2026-02-30" }).success).toBe(false);
  });

  it("need both commission splits, as whole percentages from 0 to 100, to invite a broker", () => {
    const valid = { name: "Daniel Reyes", phone: "+15615550123", email: "dan@example.com", level: "junior", inHouseSplit: 40, selfGeneratedSplit: 60 };
    expect(createBrokerRequestSchema.safeParse(valid).success).toBe(true);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: 0, selfGeneratedSplit: 100 }).success).toBe(true);
    const { inHouseSplit: _inHouse, ...withoutInHouse } = valid;
    expect(createBrokerRequestSchema.safeParse(withoutInHouse).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, selfGeneratedSplit: 101 }).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: -1 }).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: 42.5 }).success).toBe(false);
    expect(createBrokerRequestSchema.safeParse({ ...valid, inHouseSplit: "40" }).success).toBe(false);
  });

  it("invite with a name, an E.164 phone, a level and both splits; the email is optional", () => {
    const valid = { name: "Nina Castillo", phone: "+1 (561) 555-0123", level: "senior", inHouseSplit: 50, selfGeneratedSplit: 70 };
    const parsed = createBrokerRequestSchema.parse(valid);
    expect(parsed.phone).toBe("+15615550123");
    expect(parsed.email).toBeUndefined();
    expect(createBrokerRequestSchema.safeParse({ ...valid, phone: "(561) 555-0123" }).success).toBe(false);
    const { phone: _phone, ...withoutPhone } = valid;
    expect(createBrokerRequestSchema.safeParse(withoutPhone).success).toBe(false);
  });

  it("change a commission split with both percentages, an optional start date and note", () => {
    expect(commissionChangeRequestSchema.safeParse({ inHouseSplit: 40, selfGeneratedSplit: 65 }).success).toBe(true);
    expect(commissionChangeRequestSchema.safeParse({ inHouseSplit: 40, selfGeneratedSplit: 65, effectiveFrom: "2026-10-01", note: "Top performer" }).success).toBe(true);
    expect(commissionChangeRequestSchema.safeParse({ selfGeneratedSplit: 65 }).success).toBe(false);
    expect(commissionChangeRequestSchema.safeParse({ inHouseSplit: 120, selfGeneratedSplit: 65 }).success).toBe(false);
    expect(commissionChangeRequestSchema.safeParse({ inHouseSplit: 40, selfGeneratedSplit: 65, effectiveFrom: "2026-02-30" }).success).toBe(false);
  });

  it("no longer change commission splits through the broker edit", () => {
    expect(updateBrokerRequestSchema.safeParse({ selfGeneratedSplit: 70 }).success).toBe(false);
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
