/**
 * File: apps/api/scripts/match-sample-leads.ts
 * Purpose: `pnpm match:sample-leads` sends the three sample leads (sample-leads.ts) to a running API's POST /api/match and
 * prints each recommended broker with its score, factor scores, reasons and flags (the same reply the 365 Yachts AI gets;
 * the full detail and the excluded brokers are in match_log). Needs MATCH_API_KEY; the API address
 * comes from MATCH_API_URL (default http://localhost:4000). Run `pnpm db:seed -- --match-samples` first for useful results.
 * It only reads; no choice is recorded, so it doesn't change anyone's availability.
 *
 * Functions:
 * - formatScore(value): a factor score as text, or "—" when the factor had no data.
 * - printMatch(lead, result): prints one lead's recommended brokers.
 * - main(): sends every sample lead and prints the results.
 */
import type { MatchRequestInput, MatchResponse } from "@bp/shared";
import { loadRootEnvFile } from "@bp/shared/node";
import { SAMPLE_LEADS } from "./sample-leads";

function formatScore(value: number | null): string {
  return value === null ? "—" : String(value);
}

function printMatch(lead: MatchRequestInput, result: MatchResponse): void {
  console.log(`\n=== ${lead.name} (${lead.priority ?? "no priority"}${lead.hot ? ", hot" : ""}) · match ${result.matchId} ===`);
  result.brokers.forEach((broker, index) => {
    const { fit, performance, availability } = broker.breakdown;
    console.log(`${index + 1}. ${broker.name} ${broker.score}%`);
    console.log(`   fit ${formatScore(fit)} · performance ${formatScore(performance)} · availability ${formatScore(availability)}`);
    for (const reason of broker.reasons) console.log(`   - ${reason}`);
    if (broker.flags.length > 0) console.log(`   flags: ${broker.flags.join(", ")}`);
  });
  if (result.brokers.length === 0) console.log("No broker passed the hard filters.");
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const key = process.env.MATCH_API_KEY;
  if (!key) throw new Error("MATCH_API_KEY is not set.");
  const baseUrl = (process.env.MATCH_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, "");
  for (const lead of SAMPLE_LEADS) {
    const response = await fetch(`${baseUrl}/api/match`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(lead),
    });
    if (!response.ok) throw new Error(`${lead.name}: HTTP ${response.status} ${await response.text()}`);
    printMatch(lead, (await response.json()) as MatchResponse);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
