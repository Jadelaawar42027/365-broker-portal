/**
 * File: packages/shared/test/whatsapp.test.ts
 * Purpose: Tests for the WhatsApp support link (SPEC D13): message wording, URL encoding, and hiding the button
 * when the number is missing or invalid; and the "Start chat with AI agent" link on step 1, which always goes to the
 * 365 Yachts AI with a hello message; and the invite message an admin sends a broker, which has no time limit in it.
 *
 * Functions:
 * - none
 */
import { describe, expect, it } from "vitest";
import {
  buildAiAgentMessage,
  buildAiAgentWhatsAppLink,
  buildInviteMessage,
  buildInviteWhatsAppLink,
  buildSupportMessage,
  buildWhatsAppLink,
  DEFAULT_SUPPORT_CONTACT,
  normalizeWhatsAppNumber,
} from "../src/whatsapp";

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

describe("the AI agent chat link", () => {
  it("says hello with the broker's name, or without it when unknown", () => {
    expect(buildAiAgentMessage({ brokerName: " Daniel Reyes " })).toBe("Hey 365 Yachts AI, it's Daniel Reyes. I'm new here and doing my onboarding.");
    expect(buildAiAgentMessage({ brokerName: null })).toBe("Hey 365 Yachts AI. I'm new here and doing my onboarding.");
  });

  it("always opens the 365 Yachts AI's WhatsApp with the message filled in", () => {
    const link = buildAiAgentWhatsAppLink({ brokerName: "Daniel Reyes" });
    expect(link).toMatch(new RegExp(`^https://wa\\.me/${DEFAULT_SUPPORT_CONTACT.whatsappNumber}\\?text=`));
    expect(new URL(link!).searchParams.get("text")).toBe("Hey 365 Yachts AI, it's Daniel Reyes. I'm new here and doing my onboarding.");
  });
});

describe("buildInviteMessage", () => {
  it("greets the broker by first name and ends with the link, with no time limit", () => {
    const message = buildInviteMessage({ brokerName: "Charlie Seitz", inviteUrl: "https://portal.example/invite/abc", senderName: "Aj" });
    expect(message).toBe("Hi Charlie, welcome to 365 Yachts! It's Aj from 365 Yachts. Create your broker portal account here: https://portal.example/invite/abc");
    expect(message).not.toMatch(/days/);
  });

  it("opens WhatsApp to the broker's phone with the message filled in", () => {
    const link = buildInviteWhatsAppLink({ phone: "+1 615 948 3641", brokerName: "Charlie Seitz", inviteUrl: "https://portal.example/invite/abc" });
    expect(link).toMatch(/^https:\/\/wa\.me\/16159483641\?text=/);
    expect(decodeURIComponent(link!.split("text=")[1]!)).toContain("https://portal.example/invite/abc");
  });
});
