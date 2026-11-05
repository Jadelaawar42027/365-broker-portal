/**
 * File: packages/shared/test/tokens-and-chapters.test.ts
 * Purpose: Tests for account token creation and hashing (random tokens, and the broker invite tokens derived from a row
 * id and the server secret), and the Volume One chapter list.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { VOLUME_ONE_CHAPTERS } from "../src/chapters";
import { createAccountToken, deriveAccountToken, hashToken } from "../src/node/tokens";

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

  it("derives the same URL-safe token every time for one row id and secret, and a different one otherwise", () => {
    const secret = "test-secret-that-is-at-least-32-characters-long";
    const id = "6f1c2c43-1a7f-4a52-9a3e-1d9b6c7e2f10";
    const first = deriveAccountToken(secret, id);
    expect(deriveAccountToken(secret, id)).toEqual(first);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toBe(hashToken(first.token));
    expect(deriveAccountToken(secret, "0b8f8d0e-5d2c-4f5e-8a4a-3f0e9c1b2a77").token).not.toBe(first.token);
    expect(deriveAccountToken(`${secret}-other`, id).token).not.toBe(first.token);
  });
});

describe("VOLUME_ONE_CHAPTERS", () => {
  it("lists the one Volume One training chapter (the onboarding modules live in the steps)", () => {
    expect(VOLUME_ONE_CHAPTERS.map((chapter) => chapter.code)).toEqual(["I"]);
    expect(VOLUME_ONE_CHAPTERS[0]?.label).toBe("I · How you get paid & measured");
  });
});
