/**
 * File: packages/shared/test/whatsapp.test.ts
 * Purpose: Tests for the WhatsApp support link (SPEC D13): message wording, URL encoding, and hiding the button
 * when the number is missing or invalid.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import { buildSupportMessage, buildWhatsAppLink, normalizeWhatsAppNumber } from "../src/whatsapp";

describe("buildSupportMessage", () => {
  it("names the broker and the step", () => {
    expect(
      buildSupportMessage({ contactName: "Shelly", brokerName: "Daniel Reyes", step: { position: 5, title: "Upload your W-9" } }),
    ).toBe("Hi Shelly, it's Daniel Reyes. I need help with step 5: Upload your W-9.");
  });

  it("supports a topic for screens without a step", () => {
    expect(buildSupportMessage({ contactName: "Shelly", brokerName: "Daniel Reyes", topic: "creating my account" })).toBe(
      "Hi Shelly, it's Daniel Reyes. I need help creating my account.",
    );
  });

  it("works without a broker name or a contact name", () => {
    expect(buildSupportMessage({ contactName: " " })).toBe("Hi there. I need some help with my onboarding.");
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with the message URL-encoded", () => {
    const message = "Hi Shelly, it's Daniel Reyes. I need help with step 2: Sign your Employment Contract & NDA.";
    const link = buildWhatsAppLink({ number: "15614459241", message });
    expect(link).toBe(`https://wa.me/15614459241?text=${encodeURIComponent(message)}`);
    expect(link).toContain("%26");
    expect(link).not.toContain(" ");
    expect(new URL(link!).searchParams.get("text")).toBe(message);
  });

  it("returns null so the button hides when the number is missing or not digits only", () => {
    for (const number of [undefined, null, "", "  ", "+15614459241", "(561) 445-9241", "1234567", "1234567890123456"]) {
      expect(buildWhatsAppLink({ number, message: "hi" })).toBeNull();
    }
  });

  it("trims surrounding spaces", () => {
    expect(normalizeWhatsAppNumber(" 15614459241 ")).toBe("15614459241");
  });
});
