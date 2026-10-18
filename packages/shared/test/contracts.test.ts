/**
 * File: packages/shared/test/contracts.test.ts
 * Purpose: Unit tests for the contract-signing helpers (SPEC D31): Eastern-time contract dates, the signature image
 * check, both real field maps in docs/templates/contracts, the signing request rules, and phone formatting.
 *
 * Functions:
 * - none
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contractDate, contractFieldMapSchema, formatPhoneForDocument, isPngDataUrl, signContractsRequestSchema } from "../src";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("contract helpers", () => {
  it("prints the signing date in Florida time as MM/DD/YYYY", () => {
    expect(contractDate(new Date("2026-10-18T03:00:00Z"))).toBe("10/17/2026");
    expect(contractDate(new Date("2026-10-18T16:00:00Z"))).toBe("10/18/2026");
  });

  it("accepts only PNG data URLs as signatures", () => {
    expect(isPngDataUrl(PNG)).toBe(true);
    expect(isPngDataUrl("data:image/jpeg;base64,abc=")).toBe(false);
    expect(isPngDataUrl("not a data url")).toBe(false);
  });

  it("reads both real field maps, each with broker and company signature boxes", () => {
    for (const name of ["broker-agreement", "mutual-nda"]) {
      const map = contractFieldMapSchema.parse(JSON.parse(readFileSync(new URL(`../../../docs/templates/contracts/${name}.fields.json`, import.meta.url), "utf8")));
      expect(map.fields.broker_signature).toMatchObject({ kind: "signature-image" });
      expect(map.fields.company_signature).toMatchObject({ kind: "signature-image" });
      expect(map.fields.broker_sign_date).toBeDefined();
    }
  });

  it("needs a mailing address, both confirmations, the e-sign consent and a PNG signature to sign", () => {
    const valid = { mailingAddress: "1200 Brickell Bay Dr, Miami FL", phoneConfirmed: true, emailConfirmed: true, consent: true, signature: { method: "drawn", pngDataUrl: PNG } };
    expect(signContractsRequestSchema.safeParse(valid).success).toBe(true);
    expect(signContractsRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(signContractsRequestSchema.safeParse({ ...valid, mailingAddress: "x" }).success).toBe(false);
    expect(signContractsRequestSchema.safeParse({ ...valid, signature: { method: "drawn", pngDataUrl: "data:image/jpeg;base64,abc=" } }).success).toBe(false);
  });

  it("formats US phones for the agreement and leaves others as stored", () => {
    expect(formatPhoneForDocument("+15615550123")).toBe("(561) 555-0123");
    expect(formatPhoneForDocument("+442079460958")).toBe("+442079460958");
    expect(formatPhoneForDocument(null)).toBe("");
  });
});
