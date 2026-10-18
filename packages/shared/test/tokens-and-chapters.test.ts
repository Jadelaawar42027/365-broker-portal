/**
 * File: packages/shared/test/tokens-and-chapters.test.ts
 * Purpose: Tests for account token creation and hashing, and the Volume One chapter list.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { VOLUME_ONE_CHAPTERS } from "../src/chapters";
import { createAccountToken, hashToken } from "../src/node/tokens";

describe("account tokens", () => {
  it("creates unique URL-safe tokens and stores only a hash", () => {
    const first = createAccountToken();
    const second = createAccountToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toBe(hashToken(first.token));
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHash).not.toContain(first.token);
  });
});

describe("VOLUME_ONE_CHAPTERS", () => {
  it("lists the one Volume One training chapter (the onboarding modules live in the steps)", () => {
    expect(VOLUME_ONE_CHAPTERS.map((chapter) => chapter.code)).toEqual(["I"]);
    expect(VOLUME_ONE_CHAPTERS[0]?.label).toBe("I · How you get paid & measured");
  });
});
