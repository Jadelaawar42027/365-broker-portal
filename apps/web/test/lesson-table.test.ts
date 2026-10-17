/**
 * File: apps/web/test/lesson-table.test.ts
 * Purpose: Unit tests for how lesson tables merge a row's trailing empty cells.
 *
 * Functions:
 * - cells(...texts): builds a table row from plain strings.
 */
import type { Inline } from "@bp/shared";
import { describe, expect, it } from "vitest";
import { rowCells } from "../src/lib/lesson-table";

function cells(...texts: string[]): Inline[][] {
  return texts.map((text) => (text ? [{ type: "text", text }] : []));
}

describe("rowCells", () => {
  it("keeps full rows one cell per column", () => {
    expect(rowCells(cells("Bond", "$10,000", "$25,000")).map((item) => item.span)).toEqual([1, 1, 1]);
  });

  it("lets the last filled cell span the empty ones after it", () => {
    const merged = rowCells(cells("First license", "Temporary 90-day license", ""));
    expect(merged.map((item) => item.span)).toEqual([1, 2]);
    expect(merged[1]!.cell[0]!.text).toBe("Temporary 90-day license");
  });

  it("treats whitespace-only cells as empty and keeps an all-empty row as one cell", () => {
    expect(rowCells(cells("A", " ", "")).map((item) => item.span)).toEqual([3]);
    expect(rowCells(cells("", "")).map((item) => item.span)).toEqual([2]);
  });
});
