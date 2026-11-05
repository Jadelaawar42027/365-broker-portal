/**
 * File: packages/shared/src/node/tokens.ts
 * Purpose: Creates and hashes the single-use tokens behind invite and password-reset links (SPEC D8). Only the
 * SHA-256 hash is stored. A broker's invite token is derived from its row id and the server secret instead, so the
 * admin's profile view can rebuild the same link at any time without the plain token ever being stored.
 *
 * Functions:
 * - hashToken(token): returns the hex SHA-256 hash of a token.
 * - createAccountToken(): returns a new random URL-safe token and its hash.
 * - deriveAccountToken(secret, tokenId): returns the URL-safe HMAC-SHA256 token for a token row id and its hash.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAccountToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function deriveAccountToken(secret: string, tokenId: string): { token: string; tokenHash: string } {
  const token = createHmac("sha256", secret).update(`account-token:${tokenId}`).digest("base64url");
  return { token, tokenHash: hashToken(token) };
}
