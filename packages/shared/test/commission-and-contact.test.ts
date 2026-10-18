/**
 * File: packages/shared/test/commission-and-contact.test.ts
 * Purpose: Unit tests for the commission structure and invite contact rules (SPEC D29): the manual's tiers, the house
 * share, telling tier values from custom ones, the E.164 phone format, and placeholder emails for brokers invited
 * without one.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  commissionPctSchema,
  e164PhoneSchema,
  houseShare,
  IN_HOUSE_TIERS,
  isPlaceholderEmail,
  isTierValue,
  placeholderEmail,
  SELF_GENERATED_TIERS,
  visibleEmail,
} from "../src";

describe("commission tiers", () => {
  it("lists the manual's in-house and self-generated tiers", () => {
    expect(IN_HOUSE_TIERS).toEqual([30, 40, 50]);
    expect(SELF_GENERATED_TIERS).toEqual([30, 40, 50, 60, 70, 80]);
  });

  it("works out the house share from the broker's percentage", () => {
    expect(houseShare(60)).toBe(40);
    expect(houseShare(0)).toBe(100);
    expect(houseShare(100)).toBe(0);
  });

  it("tells a tier value from a custom one", () => {
    expect(isTierValue(IN_HOUSE_TIERS, 40)).toBe(true);
    expect(isTierValue(IN_HOUSE_TIERS, 45)).toBe(false);
    expect(isTierValue(SELF_GENERATED_TIERS, 80)).toBe(true);
    expect(isTierValue(SELF_GENERATED_TIERS, null)).toBe(false);
  });

  it("accepts only whole percentages from 0 to 100", () => {
    expect(commissionPctSchema.safeParse(0).success).toBe(true);
    expect(commissionPctSchema.safeParse(100).success).toBe(true);
    expect(commissionPctSchema.safeParse(101).success).toBe(false);
    expect(commissionPctSchema.safeParse(62.5).success).toBe(false);
    expect(commissionPctSchema.safeParse("60").success).toBe(false);
  });
});

describe("E.164 phone", () => {
  it("strips spaces, brackets, dots and dashes", () => {
    expect(e164PhoneSchema.parse(" +1 (561) 555-0123 ")).toBe("+15615550123");
    expect(e164PhoneSchema.parse("+44.20.7946.0958")).toBe("+442079460958");
  });

  it("needs a leading + and country code, and a sensible length", () => {
    expect(e164PhoneSchema.safeParse("5615550123").success).toBe(false);
    expect(e164PhoneSchema.safeParse("+0615550123").success).toBe(false);
    expect(e164PhoneSchema.safeParse("+1234").success).toBe(false);
    expect(e164PhoneSchema.safeParse("+1234567890123456").success).toBe(false);
  });
});

describe("placeholder emails", () => {
  it("makes unique reserved-domain addresses and recognises them", () => {
    const address = placeholderEmail("ABC123");
    expect(address).toBe("pending-abc123@invite.invalid");
    expect(isPlaceholderEmail(address)).toBe(true);
    expect(isPlaceholderEmail("PENDING-X@INVITE.INVALID")).toBe(true);
    expect(isPlaceholderEmail("kevin@example.com")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });

  it("never shows a placeholder", () => {
    expect(visibleEmail(placeholderEmail("x"))).toBeNull();
    expect(visibleEmail("kevin@example.com")).toBe("kevin@example.com");
    expect(visibleEmail(null)).toBeNull();
  });
});
