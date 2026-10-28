/**
 * File: apps/web/src/lib/steps.ts
 * Purpose: Helpers for showing onboarding steps: turning the numbered instructions into a list, describing which
 * files are accepted, checking a picked file before it is uploaded, and grouping steps by stage.
 *
 * Functions:
 * - parseInstructionSteps(markdown): returns the text of each "1. …" line, or the non-empty lines if none are numbered.
 * - describeAcceptedTypes(types): "PDF, JPG or PNG" style wording for a list of MIME types.
 * - checkFileBeforeUpload(file, rules): returns an error message for a wrong type, empty or oversized file, or null.
 * - checkImageDimensions(file, minPx): returns an error message when an image is narrower or shorter than minPx, or null (also null for PDFs and images the browser can't read).
 * - groupByStage(steps): returns [{ stage, stageTitle, number, steps }] in the order the stages first appear; the number is the stage's place in STEP_STAGES, so "Start here" is 0 and "Paperwork" is 1.
 */
import { formatFileSize, STEP_STAGES } from "@bp/shared";

const TYPE_NAMES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

export function parseInstructionSteps(markdown: string): string[] {
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  const numbered = lines.map((line) => /^\d+[.)]\s+(.*)$/.exec(line)?.[1]).filter((line): line is string => Boolean(line));
  return numbered.length > 0 ? numbered : lines;
}

export function describeAcceptedTypes(types: readonly string[]): string {
  const names = [...new Set(types.map((type) => TYPE_NAMES[type] ?? type))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function checkFileBeforeUpload(
  file: { name: string; type: string; size: number },
  rules: { acceptedTypes: readonly string[]; maxSizeBytes: number },
): string | null {
  if (!rules.acceptedTypes.includes(file.type)) {
    return `"${file.name}" isn't a ${describeAcceptedTypes(rules.acceptedTypes)} file.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > rules.maxSizeBytes) {
    return `"${file.name}" is ${formatFileSize(file.size)}. The limit is ${formatFileSize(rules.maxSizeBytes)}.`;
  }
  return null;
}

export async function checkImageDimensions(file: Blob & { name: string; type: string }, minPx: number): Promise<string | null> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (width < minPx || height < minPx) {
      return `"${file.name}" is ${width} × ${height} pixels. Use a photo at least ${minPx} × ${minPx}.`;
    }
    return null;
  } catch {
    return null;
  }
}

export function groupByStage<T extends { stage: string; stageTitle: string }>(steps: readonly T[]) {
  const groups: { stage: string; stageTitle: string; number: number; steps: T[] }[] = [];
  for (const step of steps) {
    let group = groups.find((candidate) => candidate.stage === step.stage);
    if (!group) {
      const index = (STEP_STAGES as readonly string[]).indexOf(step.stage);
      group = { stage: step.stage, stageTitle: step.stageTitle, number: index === -1 ? groups.length + 1 : index, steps: [] };
      groups.push(group);
    }
    group.steps.push(step);
  }
  return groups;
}
