/**
 * File: apps/api/test/contracts-pdf.test.ts
 * Purpose: Unit tests for filling the contracts (SPEC D31) without a database: the values for each document (house
 * share = 100 minus the broker's split, formatted phone, names and dates), filling the real templates with both
 * signatures, surviving characters the font can't draw, and appending the signature certificate page.
 *
 * Functions:
 * - template(name, font, fontFile): loads one real template from docs/templates/contracts.
 * - signaturePng(): a small valid PNG to stamp as a signature.
 */
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { contractFieldMapSchema } from "@bp/shared";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { appendCertificate, fillContract } from "../src/services/contracts/pdf";
import { documentValues } from "../src/services/contracts/service";

const DIR = new URL("../../../docs/templates/contracts/", import.meta.url);
const CONTEXT = { name: "Lena Park", phone: "+15615550142", email: "lena@365yachts.org", inHouseSplit: 40, selfGeneratedSplit: 65, mailingAddress: "1 Ocean Dr, Miami FL", floridaLicenseNo: null };
const DATES = { brokerSignDate: "10/18/2026", companySignDate: "10/18/2026" };

function template(name: string, font: string, fontFile: string | null) {
  return {
    pdf: readFileSync(new URL(`${name}.pdf`, DIR)),
    fields: contractFieldMapSchema.parse(JSON.parse(readFileSync(new URL(`${name}.fields.json`, DIR), "utf8"))),
    font,
    fontFile: fontFile ? readFileSync(new URL(fontFile, DIR)) : null,
  };
}

function signaturePng(): Uint8Array {
  const crc = (bytes: Buffer) => {
    let value = ~0;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return ~value >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const pixels = Buffer.from([0, ...Array(16).fill(10), 0, ...Array(16).fill(10)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

describe("document values", () => {
  it("fills the agreement from the broker's record, with the house share as 100 minus each split", () => {
    const values = documentValues("broker_agreement", CONTEXT, DATES);
    expect(values).toMatchObject({
      broker_full_name: "Lena Park",
      broker_printed_name: "Lena Park",
      effective_date: "10/18/2026",
      in_house_broker_pct: "40",
      in_house_house_pct: "60",
      personal_broker_pct: "65",
      personal_house_pct: "35",
      broker_phone: "(561) 555-0142",
      broker_email: "lena@365yachts.org",
      florida_license_no: "",
    });
  });

  it("fills the NDA with the name twice and the sign date", () => {
    expect(documentValues("mutual_nda", CONTEXT, { brokerSignDate: "10/18/2026", companySignDate: null })).toEqual({
      broker_name: "Lena Park",
      broker_by_name: "Lena Park",
      broker_sign_date: "10/18/2026",
      company_sign_date: "",
    });
  });
});

describe("filling the PDFs", () => {
  it("fills the NDA with both signatures, survives characters Helvetica can't draw, and adds a certificate page", async () => {
    const nda = template("mutual-nda", "helvetica", null);
    const values = documentValues("mutual_nda", { ...CONTEXT, name: "Zoë Park 张" }, DATES);
    const filled = await fillContract({ template: nda, values, brokerSignature: signaturePng(), companySignature: signaturePng() });
    expect((await PDFDocument.load(filled)).getPageCount()).toBe(2);
    const final = await appendCertificate(filled, [{ heading: "Broker signature", rows: [["Name", "Zoë Park 张"]] }]);
    expect((await PDFDocument.load(final)).getPageCount()).toBe(3);
  });

  it("fills the six-page agreement with the Carlito font embedded", async () => {
    const agreement = template("broker-agreement", "carlito", "fonts/Carlito-Regular.ttf");
    const filled = await fillContract({ template: agreement, values: documentValues("broker_agreement", CONTEXT, DATES), brokerSignature: signaturePng() });
    const pdf = await PDFDocument.load(filled);
    expect(pdf.getPageCount()).toBe(6);
    expect(filled.byteLength).toBeGreaterThan(agreement.pdf.byteLength);
  });
});
