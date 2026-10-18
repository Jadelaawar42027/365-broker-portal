/**
 * File: packages/shared/test/provisioning.test.ts
 * Purpose: Unit tests for the account provisioning rules (phase H2): corporate address generation (first name first,
 * firstname.lastname on a clash, then numbers; accents, punctuation, middle names, one-word names), first and last name, E.164 phone validation for the personal
 * and CRM phones, temporary passwords, the retry backoff timing, and the WhatsApp invite link.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  buildInviteWhatsAppLink,
  canRetryProvisioning,
  corporateAddressCandidate,
  corporateLocalPart,
  e164PhoneSchema,
  generateTemporaryPassword,
  provisioningBackoffMs,
  splitPersonName,
  updateBrokerRequestSchema,
} from "../src";

describe("corporate address", () => {
  it("is the first name in lowercase first", () => {
    expect(corporateAddressCandidate("Daniel Reyes", "365yachts.org", 1)).toBe("daniel@365yachts.org");
  });

  it("drops middle names and keeps the last word as the last name", () => {
    expect(corporateLocalPart("Mary Anne Elizabeth Smith")).toBe("mary.smith");
    expect(corporateLocalPart("  Jane   Q.   Doe  ")).toBe("jane.doe");
  });

  it("strips accents and punctuation", () => {
    expect(corporateLocalPart("José María O'Brien-Núñez")).toBe("jose.obriennunez");
    expect(corporateLocalPart("Zoë Åström")).toBe("zoe.astrom");
    expect(corporateLocalPart("François D'Arcy-Lévesque")).toBe("francois.darcylevesque");
  });

  it("turns special letters into plain ones", () => {
    expect(corporateLocalPart("Søren Großmann")).toBe("soren.grossmann");
    expect(corporateLocalPart("Łukasz Ødegård")).toBe("lukasz.odegard");
  });

  it("uses a one-word name on its own and gives up on a name with no usable letters", () => {
    expect(corporateLocalPart("Cher")).toBe("cher");
    expect(corporateLocalPart("李 小龍")).toBeNull();
    expect(corporateAddressCandidate("—", "365yachts.org", 1)).toBeNull();
  });

  it("falls back to firstname.lastname when the first name is taken, then adds 2, 3, ...", () => {
    expect(corporateAddressCandidate("Jane Q. Doe", "365Yachts.org", 2)).toBe("jane.doe@365yachts.org");
    expect(corporateAddressCandidate("Jane Doe", "365yachts.org", 3)).toBe("jane.doe2@365yachts.org");
    expect(corporateAddressCandidate("Jane Doe", "365yachts.org", 4)).toBe("jane.doe3@365yachts.org");
    expect(corporateAddressCandidate("José O'Brien", "365yachts.org", 1)).toBe("jose@365yachts.org");
    expect(corporateAddressCandidate("Jane Doe", "365yachts.org", 0)).toBeNull();
  });

  it("numbers a one-word name directly", () => {
    expect(corporateAddressCandidate("Cher", "365yachts.org", 1)).toBe("cher@365yachts.org");
    expect(corporateAddressCandidate("Cher", "365yachts.org", 2)).toBe("cher2@365yachts.org");
  });

  it("splits the name sent to Google and GHL into the first word and the rest", () => {
    expect(splitPersonName("Mary Anne Smith")).toEqual({ firstName: "Mary", lastName: "Anne Smith" });
    expect(splitPersonName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});

describe("phone validation", () => {
  it("accepts international numbers and stores them as E.164", () => {
    expect(e164PhoneSchema.parse("+1 (561) 555-0123")).toBe("+15615550123");
    expect(e164PhoneSchema.parse("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("refuses numbers without a country code or with letters", () => {
    expect(e164PhoneSchema.safeParse("561-555-0123").success).toBe(false);
    expect(e164PhoneSchema.safeParse("+0 561 555 0123").success).toBe(false);
    expect(e164PhoneSchema.safeParse("+1 CALL NOW").success).toBe(false);
  });

  it("lets admins set or clear the CRM phone, in E.164 only", () => {
    expect(updateBrokerRequestSchema.parse({ crmPhone: "+1 561 555 0199" })).toEqual({ crmPhone: "+15615550199" });
    expect(updateBrokerRequestSchema.parse({ crmPhone: null })).toEqual({ crmPhone: null });
    expect(updateBrokerRequestSchema.safeParse({ crmPhone: "5615550199" }).success).toBe(false);
  });
});

describe("temporary passwords", () => {
  it("are at least 16 characters with upper, lower, digit and symbol", () => {
    for (let index = 0; index < 50; index += 1) {
      const password = generateTemporaryPassword();
      expect(password.length).toBeGreaterThanOrEqual(16);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
      expect(password).toMatch(/[!@#$%^&*\-_=+?]/);
    }
    expect(generateTemporaryPassword(8).length).toBe(16);
  });

  it("are different every time", () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    expect(passwords.size).toBe(200);
  });
});

describe("retry backoff", () => {
  it("waits 30 s, then doubles, capped at an hour", () => {
    expect([1, 2, 3, 4, 5].map(provisioningBackoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(provisioningBackoffMs(20)).toBe(60 * 60 * 1000);
    expect(provisioningBackoffMs(0)).toBe(30_000);
  });

  it("allows five attempts in all", () => {
    expect([1, 2, 3, 4, 5].map(canRetryProvisioning)).toEqual([true, true, true, true, false]);
  });
});

describe("WhatsApp invite", () => {
  it("opens a chat with the personal phone and the link pre-filled", () => {
    const link = buildInviteWhatsAppLink({ phone: "+15615550123", brokerName: "Nina Castillo", inviteUrl: "https://team.365yachts.org/invite/abc" })!;
    expect(link.startsWith("https://wa.me/15615550123?text=")).toBe(true);
    const text = decodeURIComponent(link.split("text=")[1]!);
    expect(text).toContain("Hi Nina");
    expect(text).toContain("https://team.365yachts.org/invite/abc");
  });

  it("returns nothing without a usable phone", () => {
    expect(buildInviteWhatsAppLink({ phone: null, brokerName: "Nina", inviteUrl: "https://x/invite/abc" })).toBeNull();
    expect(buildInviteWhatsAppLink({ phone: "+12", brokerName: "Nina", inviteUrl: "https://x/invite/abc" })).toBeNull();
  });
});
