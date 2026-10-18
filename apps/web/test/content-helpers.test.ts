/**
 * File: apps/web/test/content-helpers.test.ts
 * Purpose: Unit tests for the step helpers (instructions, accepted types, file checks, stage groups), the persona
 * Markdown reader and the brokers CSV export.
 *
 * Functions:
 * - none
 */
import type { BrokerListRow } from "@bp/shared";
import { describe, expect, it } from "vitest";
import { personaTemplate } from "../src/lib/content";
import { buildBrokersCsv } from "../src/lib/csv";
import { parseMarkdownBlocks } from "../src/lib/markdown";
import { checkFileBeforeUpload, describeAcceptedTypes, groupByStage, parseInstructionSteps } from "../src/lib/steps";

describe("step helpers", () => {
  it("reads numbered instructions", () => {
    expect(parseInstructionSteps("1. Download it.\n2. Sign it.\n\n3. Upload it.")).toEqual(["Download it.", "Sign it.", "Upload it."]);
    expect(parseInstructionSteps("Just do it.\nThen tell us.")).toEqual(["Just do it.", "Then tell us."]);
  });

  it("names accepted file types like the mockup", () => {
    expect(describeAcceptedTypes(["application/pdf", "image/jpeg", "image/png"])).toBe("PDF, JPG or PNG");
    expect(describeAcceptedTypes(["image/jpeg", "image/png"])).toBe("JPG or PNG");
    expect(describeAcceptedTypes(["application/pdf"])).toBe("PDF");
  });

  it("checks a file before uploading it", () => {
    const rules = { acceptedTypes: ["application/pdf"], maxSizeBytes: 10 * 1024 * 1024 };
    expect(checkFileBeforeUpload({ name: "w9.pdf", type: "application/pdf", size: 1000 }, rules)).toBeNull();
    expect(checkFileBeforeUpload({ name: "w9.docx", type: "application/msword", size: 1000 }, rules)).toBe('"w9.docx" isn\'t a PDF file.');
    expect(checkFileBeforeUpload({ name: "empty.pdf", type: "application/pdf", size: 0 }, rules)).toBe('"empty.pdf" is empty.');
    expect(checkFileBeforeUpload({ name: "big.pdf", type: "application/pdf", size: 12 * 1024 * 1024 }, rules)).toBe('"big.pdf" is 12 MB. The limit is 10 MB.');
  });

  it("groups steps by stage in order, keeping each stage's fixed number", () => {
    const groups = groupByStage([
      { key: "a", stage: "paperwork", stageTitle: "Paperwork" },
      { key: "b", stage: "paperwork", stageTitle: "Paperwork" },
      { key: "c", stage: "your_tools", stageTitle: "Your tools" },
    ]);
    expect(groups.map((group) => [group.number, group.stageTitle, group.steps.length])).toEqual([
      [1, "Paperwork", 2],
      [3, "Your tools", 1],
    ]);
  });
});

describe("parseMarkdownBlocks", () => {
  it("reads headings, paragraphs and lists, and never HTML", () => {
    expect(parseMarkdownBlocks("# Persona: Kevin\n\n## Background\nUS Army veteran.\nSportfish.\n\n- calm\n- direct\n<script>x</script>")).toEqual([
      { type: "heading", level: 1, text: "Persona: Kevin" },
      { type: "heading", level: 2, text: "Background" },
      { type: "paragraph", text: "US Army veteran. Sportfish." },
      { type: "list", items: ["calm", "direct"] },
      { type: "paragraph", text: "<script>x</script>" },
    ]);
  });

  it("fills the persona template with the broker's name", () => {
    expect(personaTemplate("Kevin Osei").startsWith("# Persona: Kevin Osei\n")).toBe(true);
  });
});

describe("buildBrokersCsv", () => {
  it("writes a header and quotes awkward values", () => {
    const row: BrokerListRow = {
      brokerId: "b",
      name: 'Osei, Kevin "KO"',
      email: "kevin@example.com",
      level: "junior",
      status: "active",
      joinedAt: "2026-08-18",
      onboardedAt: "2026-08-27",
      leftAt: null,
      inHouseSplit: 40,
      selfGeneratedSplit: 60,
      tenureDays: 60,
      daysToOnboard: 9,
      stepsApproved: 11,
      stepsTotal: 11,
      stepsWaitingReview: 0,
      lastActivityAt: null,
    };
    expect(
      buildBrokersCsv([
        row,
        { ...row, name: "Kevin", training: { chaptersPassed: 3, chaptersTotal: 7, avgBestScore: 79 } },
        { ...row, name: "Nina", email: null, inHouseSplit: null, selfGeneratedSplit: 65 },
      ]),
    ).toBe(
      "name,email,level,status,joined_at,onboarded_at,left_at,tenure_days,days_to_onboard,steps_approved,steps_total,in_house_split_pct,self_generated_split_pct,chapters_passed,chapters_total,avg_quiz_score\n" +
        '"Osei, Kevin ""KO""",kevin@example.com,junior,active,2026-08-18,2026-08-27,,60,9,11,11,40,60,,,\n' +
        "Kevin,kevin@example.com,junior,active,2026-08-18,2026-08-27,,60,9,11,11,40,60,3,7,79\n" +
        "Nina,,junior,active,2026-08-18,2026-08-27,,60,9,11,11,,65,,,\n",
    );
  });
});
