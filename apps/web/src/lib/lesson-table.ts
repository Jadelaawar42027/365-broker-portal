/**
 * File: apps/web/src/lib/lesson-table.ts
 * Purpose: Layout help for tables in lesson text: a row that leaves its last cells empty lets the last filled cell
 * span them, the way the manual's tables are laid out (mockup 2b, "First license").
 *
 * Functions:
 * - rowCells(row): the row's cells with trailing empty cells merged into the last filled one, each with its colSpan.
 */
import type { Inline } from "@bp/shared";

export function rowCells(row: Inline[][]): { cell: Inline[]; span: number }[] {
  const filled = row.findLastIndex((cell) => cell.some((item) => item.text.trim()));
  const keep = Math.max(filled, 0);
  return row.slice(0, keep + 1).map((cell, index) => ({ cell, span: index === keep ? row.length - keep : 1 }));
}
