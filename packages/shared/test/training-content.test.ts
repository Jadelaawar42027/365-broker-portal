/**
 * File: packages/shared/test/training-content.test.ts
 * Purpose: Unit tests for lesson video links (YouTube, Loom and Vimeo only) and the lesson Markdown reader with the
 * manual's callouts and tables.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { estimateReadMinutes, parseInline, parseLessonMarkdown } from "../src/training/lesson-markdown";
import { parseEmbedVideoUrl } from "../src/training/video-embed";

describe("parseEmbedVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.loom.com/share/0a1b2c3d4e5f60718293a4b5c6d7e8f9", "loom", "https://www.loom.com/embed/0a1b2c3d4e5f60718293a4b5c6d7e8f9"],
    ["https://vimeo.com/123456789", "vimeo", "https://player.vimeo.com/video/123456789"],
    ["https://player.vimeo.com/video/123456789?h=abc", "vimeo", "https://player.vimeo.com/video/123456789"],
  ])("accepts %s", (url, provider, embedUrl) => {
    expect(parseEmbedVideoUrl(url)).toMatchObject({ provider, embedUrl });
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=<script>",
    "https://vimeo.com/channels/staffpicks",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (url) => {
    expect(parseEmbedVideoUrl(url)).toBeNull();
  });
});

describe("parseLessonMarkdown", () => {
  it("reads headings, paragraphs, lists, a table and callouts like lesson 2b", () => {
    const markdown = [
      "Florida licenses two kinds of yacht seller under Chapter 326. Most new hires start",
      "as a **salesperson**, working under 365's employing broker.",
      "",
      "| | Salesperson | Broker |",
      "| --- | --- | --- |",
      "| Surety bond | $10,000 | $25,000 |",
      "",
      "> [!WATCH]",
      "> DBPR sets fees and bond amounts and they change.",
      "",
      "> [!HOUSE RULE] Prospect hardest in the week you close.",
      "",
      "## Process",
      "1. Register with DBPR.",
      "2. Notify your Sales Executive.",
      "- one",
      "- two",
    ].join("\n");
    const blocks = parseLessonMarkdown(markdown);
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "table", "callout", "callout", "heading", "list", "list"]);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      inlines: [
        { type: "text", text: "Florida licenses two kinds of yacht seller under Chapter 326. Most new hires start as a " },
        { type: "strong", text: "salesperson" },
        { type: "text", text: ", working under 365's employing broker." },
      ],
    });
    expect(blocks[1]).toMatchObject({ type: "table", rows: [[[{ text: "Surety bond" }], [{ text: "$10,000" }], [{ text: "$25,000" }]]] });
    expect(blocks[2]).toMatchObject({ type: "callout", kind: "WATCH", blocks: [{ type: "paragraph" }] });
    expect(blocks[3]).toMatchObject({ type: "callout", kind: "HOUSE RULE" });
    expect(blocks[5]).toMatchObject({ type: "list", ordered: true });
    expect(blocks[6]).toMatchObject({ type: "list", ordered: false });
  });

  it("only links to https addresses and keeps any HTML as plain text", () => {
    expect(parseInline("See [DBPR](https://www.myfloridalicense.com/) and [bad](javascript:alert(1)) <b>x</b> *now*")).toEqual([
      { type: "text", text: "See " },
      { type: "link", text: "DBPR", href: "https://www.myfloridalicense.com/" },
      { type: "text", text: " and [bad](javascript:alert(1)) <b>x</b> " },
      { type: "em", text: "now" },
    ]);
  });

  it("estimates reading time at 200 words a minute", () => {
    expect(estimateReadMinutes("word ".repeat(450))).toBe(2);
    expect(estimateReadMinutes("short")).toBe(1);
  });
});
