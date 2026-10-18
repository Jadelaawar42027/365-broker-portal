/**
 * File: packages/db/src/seed/contract-templates.ts
 * Purpose: Loads the blank contract templates (SPEC D31) from docs/templates/contracts into contract_templates: the
 * Broker Agreement (filled with the Carlito font, stored with it) and the Mutual NDA (Helvetica). A new version is
 * added only when the PDF or its field map changes; the new version becomes the active one and older versions stay,
 * so documents already generated keep pointing at the exact template they were made from.
 *
 * Functions:
 * - findContractTemplatesDir(override): the folder holding the templates, from an explicit path, CONTRACT_TEMPLATES_DIR, or by walking up from the working directory and this file; null when not found.
 * - sha256(bytes): the hex SHA-256 of some bytes.
 * - canonicalJson(value): JSON text with object keys sorted, so the same field map compares equal however Postgres stored it.
 * - seedContractTemplates(tx, dir): stores any new or changed template as a new active version; returns the keys that got a new version.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_TITLES, contractFieldMapSchema, type ContractTemplateKey } from "@bp/shared";
import { and, desc, eq, ne } from "drizzle-orm";
import type { Transaction } from "../client";
import { contractTemplates } from "../schema";

const TEMPLATE_FILES: Record<ContractTemplateKey, { pdf: string; fields: string; font: "carlito" | "helvetica"; fontFile: string | null }> = {
  broker_agreement: { pdf: "broker-agreement.pdf", fields: "broker-agreement.fields.json", font: "carlito", fontFile: "fonts/Carlito-Regular.ttf" },
  mutual_nda: { pdf: "mutual-nda.pdf", fields: "mutual-nda.fields.json", font: "helvetica", fontFile: null },
};

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function findContractTemplatesDir(override?: string | null): string | null {
  const explicit = override ?? process.env.CONTRACT_TEMPLATES_DIR;
  if (explicit) return existsSync(path.join(explicit, TEMPLATE_FILES.broker_agreement.pdf)) ? explicit : null;
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let current = start;
    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = path.join(current, "docs", "templates", "contracts");
      if (existsSync(path.join(candidate, TEMPLATE_FILES.broker_agreement.pdf))) return candidate;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

export async function seedContractTemplates(tx: Transaction, dir: string): Promise<string[]> {
  const added: string[] = [];
  for (const [key, files] of Object.entries(TEMPLATE_FILES) as [ContractTemplateKey, (typeof TEMPLATE_FILES)[ContractTemplateKey]][]) {
    const pdf = readFileSync(path.join(dir, files.pdf));
    const fields = contractFieldMapSchema.parse(JSON.parse(readFileSync(path.join(dir, files.fields), "utf8")));
    const fontFile = files.fontFile ? readFileSync(path.join(dir, files.fontFile)) : null;
    const pdfSha256 = sha256(pdf);
    const [latest] = await tx.select().from(contractTemplates).where(eq(contractTemplates.key, key)).orderBy(desc(contractTemplates.version)).limit(1);
    if (latest && latest.pdfSha256 === pdfSha256 && canonicalJson(latest.fields) === canonicalJson(fields)) continue;
    const version = (latest?.version ?? 0) + 1;
    const [inserted] = await tx
      .insert(contractTemplates)
      .values({ key, version, title: CONTRACT_TITLES[key].title, pdf, pdfSha256, fields, font: files.font, fontFile, active: true })
      .returning({ id: contractTemplates.id });
    await tx.update(contractTemplates).set({ active: false }).where(and(eq(contractTemplates.key, key), ne(contractTemplates.id, inserted!.id)));
    added.push(`${key} v${version}`);
  }
  return added;
}
