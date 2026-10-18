/**
 * File: packages/shared/src/chapters.ts
 * Purpose: The Volume One training chapter list, shown greyed out on the locked training page (SPEC D6). Volume One's
 * onboarding material lives in the onboarding steps, so training has one chapter: How you get paid & measured (SPEC D28).
 *
 * Functions:
 * - none
 */
export type Chapter = { code: string; title: string; label: string };

export const VOLUME_ONE_CHAPTERS: readonly Chapter[] = [
  { code: "I", title: "How you get paid & measured", label: "I · How you get paid & measured" },
];
