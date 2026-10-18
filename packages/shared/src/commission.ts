/**
 * File: packages/shared/src/commission.ts
 * Purpose: The commission structure (SPEC D29). Every broker has two splits, stored as the broker's whole percentage
 * (0 to 100): in-house leads and self-generated deals. The house share is always 100 minus it and is never entered.
 * The manual's tiers are the dropdown choices; any other value is a "Custom %".
 *
 * Functions:
 * - houseShare(brokerPct): the house's percentage for a broker percentage.
 * - isTierValue(tiers, pct): true when the percentage is one of the listed tiers (otherwise it is a custom value).
 */
import { z } from "zod";

export const IN_HOUSE_TIERS = [30, 40, 50] as const;
export const SELF_GENERATED_TIERS = [30, 40, 50, 60, 70, 80] as const;

export const commissionPctSchema = z
  .number({ error: "Enter the broker's share as a percentage." })
  .int("Use a whole percentage, like 60.")
  .min(0, "A split can't be below 0%.")
  .max(100, "A split can't be above 100%.")
  .describe("The broker's share in percent; the house keeps the rest");

export function houseShare(brokerPct: number): number {
  return 100 - brokerPct;
}

export function isTierValue(tiers: readonly number[], pct: number | null | undefined): boolean {
  return pct !== null && pct !== undefined && tiers.includes(pct);
}
