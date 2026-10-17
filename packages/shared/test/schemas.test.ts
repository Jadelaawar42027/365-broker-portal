/**
 * File: packages/shared/test/schemas.test.ts
 * Purpose: Tests for the shared Zod schemas: dates, emails, passwords, step config and per-kind form answers.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  emailSchema,
  formDataSchemaForStep,
  isoDateSchema,
  passwordSchema,
  stepConfigSchema,
} from "../src/schemas";

describe("basic schemas", () => {
  it("validates ISO dates", () => {
    expect(isoDateSchema.safeParse("2026-10-17").success).toBe(true);
    expect(isoDateSchema.safeParse("2026-13-01").success).toBe(false);
  });

  it("normalises emails", () => {
    expect(emailSchema.parse("  Daniel.Reyes@Gmail.com ")).toBe("daniel.reyes@gmail.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("requires passwords of at least 8 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long-enough").success).toBe(true);
  });

  it("rejects unknown step config keys", () => {
    expect(stepConfigSchema.safeParse({ minutes: 5 }).success).toBe(true);
    expect(stepConfigSchema.safeParse({ unknown: true }).success).toBe(false);
  });
});

describe("formDataSchemaForStep", () => {
  it("text steps enforce length limits", () => {
    const schema = formDataSchemaForStep({ kind: "text", config: { minLength: 10, maxLength: 20 } });
    expect(schema.safeParse({ text: "   too short " }).success).toBe(false);
    expect(schema.safeParse({ text: "just the right size" }).success).toBe(true);
    expect(schema.safeParse({ text: "x".repeat(21) }).success).toBe(false);
    const loose = formDataSchemaForStep({ kind: "text", config: {} });
    expect(loose.safeParse({ text: "  " }).success).toBe(false);
  });

  it("choice steps accept only listed options", () => {
    const schema = formDataSchemaForStep({
      kind: "choice",
      config: { choices: [{ value: "new", label: "New" }, { value: "transfer", label: "Transfer" }] },
    });
    expect(schema.safeParse({ choice: "transfer" }).success).toBe(true);
    expect(schema.safeParse({ choice: "other" }).success).toBe(false);
  });

  it("confirm steps need the box ticked", () => {
    const schema = formDataSchemaForStep({ kind: "confirm", config: {} });
    expect(schema.safeParse({ confirmed: true }).success).toBe(true);
    expect(schema.safeParse({ confirmed: false }).success).toBe(false);
  });

  it("checklist steps need every item ticked", () => {
    const schema = formDataSchemaForStep({
      kind: "checklist",
      config: { items: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    });
    expect(schema.safeParse({ checked: ["b", "a"] }).success).toBe(true);
    expect(schema.safeParse({ checked: ["a"] }).success).toBe(false);
  });

  it("upload and admin steps take no form data", () => {
    for (const kind of ["upload", "admin"] as const) {
      const schema = formDataSchemaForStep({ kind, config: {} });
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse({ extra: 1 }).success).toBe(false);
    }
  });
});
