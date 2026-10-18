/**
 * File: apps/api/src/services/contracts/pdf.ts
 * Purpose: Fills a contract template with pdf-lib (SPEC D31). Text goes where the template's field map says (the map
 * uses a top-left origin; pdf-lib uses bottom-left, so y = page height - baseline), shrinking to fit maxWidth (or the
 * column width) and centring the split percentages in their 40pt column. The agreement uses the embedded Carlito font
 * in #1B2233 (embedded whole: pdf-lib's subsetting drops Carlito glyphs), the NDA Helvetica in black. Signature images are scaled to fit their boxes. A signature certificate can
 * be appended as a final page.
 *
 * Functions:
 * - fillContract(input): returns the filled PDF bytes for a template, values and optional broker and company signature PNGs.
 * - drawTextField(page, font, field, text, color): draws one value, shrinking and centring as the field asks.
 * - drawSignature(pdf, page, field, png): stamps one signature image, scaled to fit and centred in its box.
 * - appendCertificate(bytes, lines): returns the PDF with a "Signature certificate" page added at the end.
 * - wrapText(font, text, size, maxWidth): splits text into lines that fit maxWidth.
 * - drawable(font, text): replaces any character the font can't draw with "?", so an unusual character never breaks a document.
 */
import fontkit from "@pdf-lib/fontkit";
import type { ContractFieldMap, ContractImageField, ContractTextField } from "@bp/shared";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

const MIN_FONT_SIZE = 6;
const AGREEMENT_COLOR = rgb(0x1b / 255, 0x22 / 255, 0x33 / 255);
const NDA_COLOR = rgb(0, 0, 0);

export type ContractTemplateFile = { pdf: Uint8Array; fields: ContractFieldMap; font: string; fontFile: Uint8Array | null };

function drawable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (character) => (supported.has(character.codePointAt(0)!) ? character : "?")).join("");
}

function drawTextField(page: PDFPage, font: PDFFont, field: ContractTextField, raw: string, color: RGB): void {
  const text = drawable(font, raw.trim());
  if (!text) return;
  const limit = field.maxWidth ?? field.width;
  let size = field.size;
  while (limit && size > MIN_FONT_SIZE && font.widthOfTextAtSize(text, size) > limit) size -= 0.25;
  const textWidth = font.widthOfTextAtSize(text, size);
  const x = field.align === "center" && field.width ? field.x + (field.width - textWidth) / 2 : field.x;
  page.drawText(text, { x, y: page.getHeight() - field.baseline, size, font, color });
}

async function drawSignature(pdf: PDFDocument, page: PDFPage, field: ContractImageField, png: Uint8Array): Promise<void> {
  const image = await pdf.embedPng(png);
  const [left, top, right, bottom] = field.box;
  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: left + (boxWidth - width) / 2,
    y: page.getHeight() - bottom + (boxHeight - height) / 2,
    width,
    height,
  });
}

export async function fillContract(input: {
  template: ContractTemplateFile;
  values: Record<string, string>;
  brokerSignature?: Uint8Array | null;
  companySignature?: Uint8Array | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.template.pdf);
  pdf.registerFontkit(fontkit);
  const carlito = input.template.font === "carlito" && input.template.fontFile;
  const font = carlito ? await pdf.embedFont(input.template.fontFile!, { subset: false }) : await pdf.embedFont(StandardFonts.Helvetica);
  const color = carlito ? AGREEMENT_COLOR : NDA_COLOR;
  const pages = pdf.getPages();
  for (const [name, field] of Object.entries(input.template.fields.fields)) {
    const page = pages[field.page - 1];
    if (!page) continue;
    if ("box" in field) {
      const png = name === "broker_signature" ? input.brokerSignature : name === "company_signature" ? input.companySignature : null;
      if (png) await drawSignature(pdf, page, field, png);
    } else {
      drawTextField(page, font, field, input.values[name] ?? "", color);
    }
  }
  return pdf.save();
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function appendCertificate(bytes: Uint8Array, sections: { heading: string; rows: [string, string][] }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  let page = pdf.addPage([612, 792]);
  let y = 792 - 64;
  const left = 56;
  const labelWidth = 150;
  const valueWidth = 612 - left * 2 - labelWidth;
  const navy = rgb(0x0a / 255, 0x1f / 255, 0x3d / 255);
  const grey = rgb(0.35, 0.38, 0.45);

  page.drawText("Signature certificate", { x: left, y, size: 20, font: bold, color: navy });
  y -= 18;
  page.drawText(drawable(regular, "365 Yachts Inc. · electronic signature record"), { x: left, y, size: 10, font: regular, color: grey });
  y -= 26;

  for (const section of sections) {
    if (y < 120) {
      page = pdf.addPage([612, 792]);
      y = 792 - 64;
    }
    page.drawText(drawable(bold, section.heading), { x: left, y, size: 12, font: bold, color: navy });
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: 612 - left, y }, thickness: 0.5, color: grey });
    y -= 14;
    for (const [label, value] of section.rows) {
      const valueFont = /SHA-256/.test(label) ? mono : regular;
      const valueSize = /SHA-256/.test(label) ? 8 : 9.5;
      const lines = wrapText(valueFont, drawable(valueFont, value || "-"), valueSize, valueWidth);
      if (y - lines.length * 12 < 56) {
        page = pdf.addPage([612, 792]);
        y = 792 - 64;
      }
      page.drawText(label, { x: left, y, size: 9.5, font: bold, color: grey });
      for (const [index, line] of lines.entries()) {
        page.drawText(line, { x: left + labelWidth, y: y - index * 12, size: valueSize, font: valueFont, color: rgb(0.1, 0.13, 0.2) });
      }
      y -= Math.max(1, lines.length) * 12 + 5;
    }
    y -= 12;
  }
  return pdf.save();
}
