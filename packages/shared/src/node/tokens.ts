/**
 * File: packages/shared/src/node/tokens.ts
 * Purpose: Creates and hashes the single-use tokens behind invite and password-reset links (SPEC D8). Only the
 * SHA-256 hash is stored; the plain token appears once, in the emailed link.
 *
 * Functions:
 * - hashToken(token): returns the hex SHA-256 hash of a token.
 * - createAccountToken(): returns a new random URL-safe token and its hash.
 */
import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAccountToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}
