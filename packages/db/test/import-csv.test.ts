/**
 * File: packages/db/test/import-csv.test.ts
 * Purpose: Unit tests for reading brokers.csv: the CSV parser, row validation with line numbers, date formats, the optional commission split columns, and
 * matching imported file names to onboarding steps.
 *
 * Functions:
 * - none
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normaliseDate, parseBrokerCsv, parseCsv } from "../src/import/csv";
import { matchStepKey } from "../src/import/importer";

const HEADER = "name,email,phone,level,status,joined_at,onboarded_at,left_at,commission_tier";

describe("parseCsv", () => {
  it("handles quotes, commas, line breaks inside quotes, CRLF and a BOM", () => {
    const text = '﻿a,b\r\n"Osei, Kevin","said ""hi""\nthere"\r\n\r\nlast,\n';
    expect(parseCsv(text)).toEqual([["a", "b"], ["Osei, Kevin", 'said "hi"\nthere'], ["last", ""]]);
  });
});

describe("normaliseDate", () => {
  it("accepts ISO and US dates", () => {
    expect(normaliseDate("2026-03-11")).toBe("2026-03-11");
    expect(normaliseDate("3/11/2026")).toBe("2026-03-11");
    expect(normaliseDate("  ")).toBeNull();
    expect(() => normaliseDate("11 March")).toThrow();
  });
});

describe("parseBrokerCsv", () => {
  it("reads the example file in docs/templates", () => {
    const example = fs.readFileSync(fileURLToPath(new URL("../../../docs/templates/brokers-import-example.csv", import.meta.url)), "utf8");
    const { rows, errors } = parseBrokerCsv(example);
    expect(errors).toEqual([]);
    expect(rows.map((row) => [row.email, row.status, row.commissionTier, row.inHouseSplit, row.selfGeneratedSplit])).toEqual([
      ["jane.example@365yachts.org", "active", "60/40", 50, 70],
      ["john.sample@365yachts.org", "active", "50/50", 40, 50],
      ["alex.former@365yachts.org", "inactive", "50/50", null, null],
    ]);
    expect(rows[2]).toMatchObject({ line: 4, leftAt: "2026-06-15", level: "junior" });
  });

  it("reports every problem with its line number", () => {
    const text = [
      HEADER,
      "Ok Person,ok@example.com,,Senior,Onboarding,2026-10-01,,,",
      "X,not-an-email,,captain,retired,someday,,,",
      "Active No Date,active@example.com,,junior,active,2026-01-01,,,",
      "Backwards,back@example.com,,junior,inactive,2026-05-01,2026-04-01,2026-03-01,",
      "Dup,OK@example.com,,junior,onboarding,2026-10-01,,,",
    ].join("\n");
    const { rows, errors } = parseBrokerCsv(text);
    expect(rows.map((row) => [row.email, row.level, row.status])).toEqual([["ok@example.com", "senior", "onboarding"]]);
    expect(errors.map((error) => error.line)).toEqual([3, 4, 5, 6]);
    expect(errors[0]!.message).toMatch(/name is missing.*email.*level.*status.*joined_at "someday"/);
    expect(errors[1]!.message).toBe("active brokers need onboarded_at");
    expect(errors[2]!.message).toBe("onboarded_at is before joined_at; left_at is before joined_at");
    expect(errors[3]!.message).toBe("email repeats line 2");
  });

  it("treats the commission split columns as optional and checks them when present", () => {
    const withoutSplits = parseBrokerCsv([HEADER, "Ok Person,ok@example.com,,junior,onboarding,2026-10-01,,,"].join("\n"));
    expect(withoutSplits.errors).toEqual([]);
    expect(withoutSplits.rows[0]).toMatchObject({ inHouseSplit: null, selfGeneratedSplit: null });
    const text = [
      `${HEADER},in_house_split,self_generated_split`,
      "Ok Person,ok@example.com,,junior,onboarding,2026-10-01,,,,40,60%",
      "Too Much,much@example.com,,junior,onboarding,2026-10-01,,,,140,60",
      "Fraction,frac@example.com,,junior,onboarding,2026-10-01,,,,40,62.5",
    ].join("\n");
    const { rows, errors } = parseBrokerCsv(text);
    expect(rows.map((row) => [row.email, row.inHouseSplit, row.selfGeneratedSplit])).toEqual([["ok@example.com", 40, 60]]);
    expect(errors).toEqual([
      { line: 3, message: 'in_house_split "140" must be a whole number from 0 to 100' },
      { line: 4, message: 'self_generated_split "62.5" must be a whole number from 0 to 100' },
    ]);
  });

  it("rejects a file with missing columns or no content", () => {
    expect(parseBrokerCsv("name,email\nA,a@b.co").errors[0]!.message).toMatch(/Missing columns: phone, level/);
    expect(parseBrokerCsv("").errors[0]!.message).toBe("The file is empty.");
  });
});

describe("matchStepKey", () => {
  const keys = ["photo_id", "w9", "contract_nda", "license_bond"];
  it("matches exact names and names with a suffix", () => {
    expect(matchStepKey("w9", keys)).toBe("w9");
    expect(matchStepKey("contract_nda-page2", keys)).toBe("contract_nda");
    expect(matchStepKey("Photo_ID", keys)).toBe("photo_id");
    expect(matchStepKey("w9form", keys)).toBeNull();
    expect(matchStepKey("passport", keys)).toBeNull();
  });
});
