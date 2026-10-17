/**
 * File: packages/shared/test/files.test.ts
 * Purpose: Unit tests for the file helpers: safe file names, the storage key layout and file-size text.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { buildStorageKey, formatFileSize, safeFileName, storageKeyPrefix } from "../src/files";

describe("safeFileName", () => {
  it("keeps normal names readable", () => {
    expect(safeFileName("W9 Daniel Reyes.pdf")).toBe("W9_Daniel_Reyes.pdf");
  });

  it("strips folders, unsafe characters and leading dots", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\dan\\ID (front)?.jpg")).toBe("ID_front.jpg");
    expect(safeFileName(".hidden.png")).toBe("hidden.png");
    expect(safeFileName("résumé.pdf")).toBe("resume.pdf");
  });

  it("never returns an empty name", () => {
    expect(safeFileName("???")).toBe("file");
    expect(safeFileName("")).toBe("file");
  });

  it("caps long names but keeps the extension", () => {
    const name = safeFileName(`${"a".repeat(300)}.pdf`);
    expect(name).toHaveLength(100);
    expect(name.endsWith(".pdf")).toBe(true);
    expect(safeFileName("b".repeat(150))).toHaveLength(100);
  });
});

describe("storage keys", () => {
  it("follow brokers/{brokerId}/{stepKey}/{version}-{nonce}-{name}", () => {
    expect(buildStorageKey({ brokerId: "b1", stepKey: "w9", version: 2, nonce: "abc", fileName: "my w9.pdf" })).toBe(
      "brokers/b1/w9/2-abc-my_w9.pdf",
    );
    expect(storageKeyPrefix("b1", "w9")).toBe("brokers/b1/w9/");
  });
});

describe("formatFileSize", () => {
  it("prints B, KB and MB", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(412 * 1024)).toBe("412 KB");
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe("1.3 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
  });
});
