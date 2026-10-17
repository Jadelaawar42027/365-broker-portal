/**
 * File: packages/db/src/seed/sample-files.ts
 * Purpose: Builds tiny, valid placeholder files (a one-page PDF and a PNG) for the sample brokers' uploaded steps,
 * so file previews and downloads work in local development without any real documents.
 *
 * Functions:
 * - escapePdfText(text): escapes characters that are special inside a PDF string.
 * - samplePdf(title): returns a one-page PDF that prints the title and "Sample document - not a real record".
 * - pngChunk(type, data): returns one PNG chunk with its length and CRC.
 * - samplePng(width, height): returns a solid navy PNG of the given size.
 */
import { crc32, deflateSync } from "node:zlib";

function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, (character) => `\\${character}`);
}

export function samplePdf(title: string): Uint8Array {
  const stream = `BT /F1 24 Tf 72 720 Td (${escapePdfText(title)}) Tj 0 -36 Td /F1 14 Tf (Sample document - not a real record) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

export function samplePng(width = 240, height = 300): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [10, 31, 61]).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", pixels),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
