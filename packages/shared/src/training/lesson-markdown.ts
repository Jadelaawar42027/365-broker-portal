/**
 * File: packages/shared/src/training/lesson-markdown.ts
 * Purpose: Reads lesson text written in a small, safe Markdown dialect: headings, paragraphs with **bold**, *italic*
 * and https links, bullet and numbered lists, tables, and the manual's callouts written as `> [!WATCH]`, `> [!NEVER]`,
 * `> [!HOUSE RULE]`, `> [!EDGE]` or `> [!FIELD NOTE]` followed by `> ` lines. It returns plain data, so no HTML from
 * a lesson can reach the page. Also estimates reading time.
 *
 * Functions:
 * - parseInline(text): splits a line into text, strong, em and link pieces.
 * - parseLessonMarkdown(markdown): returns the lesson as heading, paragraph, list, table and callout blocks.
 * - splitTableRow(line): the trimmed cells of a `| a | b |` row.
 * - estimateReadMinutes(markdown): whole minutes to read the text at 200 words a minute (at least 1).
 */
import { READ_WORDS_PER_MINUTE } from "../constants";

export const CALLOUT_KINDS = ["WATCH", "NEVER", "HOUSE RULE", "EDGE", "FIELD NOTE"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export type Inline = { type: "text" | "strong" | "em"; text: string } | { type: "link"; text: string; href: string };

export type LessonBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "callout"; kind: CalloutKind; blocks: LessonBlock[] };

export function parseInline(text: string): Inline[] {
  const pieces: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) pieces.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) pieces.push({ type: "strong", text: match[1] });
    else if (match[2] !== undefined) pieces.push({ type: "em", text: match[2] });
    else pieces.push({ type: "link", text: match[3]!, href: match[4]! });
    last = match.index! + match[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", text: text.slice(last) });
  return pieces;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function parseLessonMarkdown(markdown: string): LessonBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: LessonBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const callout = /^>\s*\[!(WATCH|NEVER|HOUSE RULE|EDGE|FIELD NOTE)\]\s*(.*)$/i.exec(trimmed);
    if (callout) {
      const inner: string[] = callout[2] ? [callout[2]] : [];
      index += 1;
      while (index < lines.length && lines[index]!.trim().startsWith(">")) {
        inner.push(lines[index]!.trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "callout", kind: callout[1]!.toUpperCase() as CalloutKind, blocks: parseLessonMarkdown(inner.join("\n")) });
      continue;
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length as 2 | 3, text: heading[2]! });
      index += 1;
      continue;
    }
    if (trimmed.startsWith("|") && lines[index + 1] && /^\|?\s*:?-{3,}/.test(lines[index + 1]!.trim())) {
      const header = splitTableRow(trimmed).map(parseInline);
      index += 2;
      const rows: Inline[][][] = [];
      while (index < lines.length && lines[index]!.trim().startsWith("|")) {
        rows.push(splitTableRow(lines[index]!).map(parseInline));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/;
    const numbered = /^\d+[.)]\s+(.*)$/;
    if (bullet.test(trimmed) || numbered.test(trimmed)) {
      const ordered = numbered.test(trimmed);
      const pattern = ordered ? numbered : bullet;
      const items: Inline[][] = [];
      while (index < lines.length && pattern.test(lines[index]!.trim())) {
        items.push(parseInline(pattern.exec(lines[index]!.trim())![1]!));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index]!.trim();
      if (!next || next.startsWith(">") || next.startsWith("#") || next.startsWith("|") || bullet.test(next) || numbered.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}

export function estimateReadMinutes(markdown: string): number {
  const words = markdown.replace(/[#>|*\-[\]!()]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / READ_WORDS_PER_MINUTE));
}
