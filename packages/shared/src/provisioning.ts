/**
 * File: packages/shared/src/provisioning.ts
 * Purpose: Pure rules for account provisioning (phase H2): the broker's corporate address (firstname, then firstname.lastname
 * when that is taken, then firstname.lastname2, 3, ...; accents and punctuation stripped, middle names dropped), the first and last name sent to Google and
 * GoHighLevel, random temporary passwords, the retry backoff and the account status shown to admins.
 *
 * Functions:
 * - asciiLetters(word): lowercases a word, turns accented and special letters into plain ones and drops everything else.
 * - splitPersonName(fullName): { firstName, lastName } where lastName is every word after the first ("" for one word).
 * - corporateLocalPart(fullName): "firstname.lastname" from the first and last word of a name, or null when nothing usable is left.
 * - corporateAddressCandidate(fullName, domain, index): the index-th address to try (1 → jane@, 2 → jane.doe@, 3 → jane.doe2@, ...; one-word names: jane@, jane2@, ...), or null.
 * - randomIndex(max): a uniformly random whole number from 0 to max - 1, from the platform's secure random source.
 * - generateTemporaryPassword(length): a random password (at least 16 characters) with upper, lower, digit and symbol characters.
 * - provisioningBackoffMs(attempts): how long to wait after the given number of failed attempts (30 s doubling, capped at 1 hour).
 * - canRetryProvisioning(attempts): true while fewer than PROVISIONING_MAX_ATTEMPTS attempts were made.
 */
import { PROVISIONING_MAX_ATTEMPTS } from "./constants";

export const ACCOUNT_STATUSES = ["not_configured", "not_set_up", "pending", "created", "failed", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  not_configured: "Not configured",
  not_set_up: "Not set up",
  pending: "Pending",
  created: "Created",
  failed: "Failed",
  suspended: "Suspended",
};

export const PROVISIONING_SYSTEM_LABELS = { google: "Google Workspace", ghl: "GoHighLevel" } as const;

const SPECIAL_LETTERS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  þ: "th",
  ı: "i",
};

function asciiLetters(word: string): string {
  return word
    .toLowerCase()
    .replace(/[ßæœøđðłþı]/g, (letter) => SPECIAL_LETTERS[letter] ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}

export function corporateLocalPart(fullName: string): string | null {
  const words = fullName
    .trim()
    .split(/\s+/)
    .map(asciiLetters)
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0]!;
  return `${words[0]}.${words[words.length - 1]}`;
}

export function corporateAddressCandidate(fullName: string, domain: string, index: number): string | null {
  const full = corporateLocalPart(fullName);
  if (!full || index < 1) return null;
  const first = full.split(".")[0]!;
  const hasLastName = full.includes(".");
  let local: string;
  if (index === 1) local = first;
  else if (!hasLastName) local = `${first}${index}`;
  else if (index === 2) local = full;
  else local = `${full}${index - 1}`;
  return `${local}@${domain.trim().toLowerCase()}`;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+?";
const ALL_CHARACTERS = UPPER + LOWER + DIGITS + SYMBOLS;

function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0]! < limit) return buffer[0]! % max;
  }
}

export function generateTemporaryPassword(length = 20): string {
  const size = Math.max(16, length);
  const characters = [UPPER, LOWER, DIGITS, SYMBOLS].map((set) => set[randomIndex(set.length)]!);
  while (characters.length < size) characters.push(ALL_CHARACTERS[randomIndex(ALL_CHARACTERS.length)]!);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [characters[index], characters[swap]] = [characters[swap]!, characters[index]!];
  }
  return characters.join("");
}

export const PROVISIONING_BASE_DELAY_MS = 30_000;
export const PROVISIONING_MAX_DELAY_MS = 60 * 60 * 1000;

export function provisioningBackoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(PROVISIONING_BASE_DELAY_MS * 2 ** exponent, PROVISIONING_MAX_DELAY_MS);
}

export function canRetryProvisioning(attempts: number): boolean {
  return attempts < PROVISIONING_MAX_ATTEMPTS;
}
