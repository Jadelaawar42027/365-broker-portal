/**
 * File: apps/api/src/services/emails.ts
 * Purpose: The wording of every email the portal sends, as plain text. Pure functions so they are easy to test
 * and to change without touching the routes.
 *
 * Functions:
 * - firstName(name): returns the first word of a full name.
 * - signOff(support): the closing lines with the support contact.
 * - inviteEmail(input): invitation to create a broker account.
 * - adminInviteEmail(input): invitation to create an admin account.
 * - passwordResetEmail(input): link to choose a new password.
 * - stepSentBackEmail(input): tells a broker a step needs a fix, with the reviewer's note.
 * - stepApprovedEmail(input): tells a broker a step was approved.
 * - onboardingCompleteBrokerEmail(input): congratulates a broker on finishing onboarding.
 * - onboardingCompleteAdminEmail(input): tells admins a broker finished onboarding.
 * - brokerNeedsHelpAdminEmail(input): tells admins a broker picked an answer that asks for help (a step's alertChoices), with their phone and a profile link.
 * - reminderEmail(input): nudges a broker about their next step.
 * - contractsSignedEmail(input): sends a broker their signed agreements (attached), or says they're waiting for the countersignature (SPEC D31).
 * - countersignNeededEmail(input): tells the company signer a broker's agreements are waiting for her countersignature.
 * - resignNeededEmail(input): tells a broker their agreements changed and must be signed again.
 */
import { INVITE_TTL_DAYS, PASSWORD_RESET_TTL_HOURS } from "@bp/shared";

type Support = { name: string; whatsappNumber: string | null };
type Email = { subject: string; text: string };

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function signOff(support: Support): string {
  const whatsapp = support.whatsappNumber ? ` Message ${support.name} on WhatsApp: https://wa.me/${support.whatsappNumber}` : "";
  return `Stuck at any point?${whatsapp || ` Reply to this email and ${support.name} will help.`}\n\n365 Yachts`;
}

export function inviteEmail(input: { name: string; link: string; support: Support }): Email {
  return {
    subject: "Welcome to 365 Yachts - create your account",
    text: [
      `Welcome aboard, ${firstName(input.name)}.`,
      "",
      "Getting set up takes about a week. We give you one step at a time, so you always know exactly what to do next.",
      "",
      `Create your account here (the link works for ${INVITE_TTL_DAYS} days):`,
      input.link,
      "",
      signOff(input.support),
    ].join("\n"),
  };
}

export function adminInviteEmail(input: { name: string; link: string; invitedBy: string }): Email {
  return {
    subject: "You've been added as a 365 Yachts portal admin",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `${input.invitedBy} added you as an admin on the 365 Yachts broker portal.`,
      `Create your account here (the link works for ${INVITE_TTL_DAYS} days):`,
      input.link,
      "",
      "365 Yachts",
    ].join("\n"),
  };
}

export function passwordResetEmail(input: { name: string; link: string; support: Support }): Email {
  return {
    subject: "Choose a new password for the 365 Yachts portal",
    text: [
      `Hi ${firstName(input.name)},`,
      "",
      `Use this link to choose a new password. It works once, for ${PASSWORD_RESET_TTL_HOURS} hours:`,
      input.link,
      "",
      "If you didn't ask for this, you can ignore this email - your password stays the same.",
      "",
      signOff(input.support),
    ].join("\n"),
  };
}

export function stepSentBackEmail(input: {
  brokerName: string;
  stepTitle: string;
  note: string;
  reviewerName: string;
  link: string;
  support: Support;
}): Email {
  return {
    subject: `Please fix and resend: ${input.stepTitle}`,
    text: [
      `Hi ${firstName(input.brokerName)},`,
      "",
      `${input.reviewerName} sent one step back: ${input.stepTitle}.`,
      `"${input.note}"`,
      "",
      `Fix it and resend here: ${input.link}`,
      "",
      signOff(input.support),
    ].join("\n"),
  };
}

export function stepApprovedEmail(input: { brokerName: string; stepTitle: string; link: string; support: Support }): Email {
  return {
    subject: `Approved: ${input.stepTitle}`,
    text: [
      `Hi ${firstName(input.brokerName)},`,
      "",
      `Good news - "${input.stepTitle}" is approved.`,
      `See your next step: ${input.link}`,
      "",
      signOff(input.support),
    ].join("\n"),
  };
}

export function onboardingCompleteBrokerEmail(input: { brokerName: string; link: string }): Email {
  return {
    subject: "You're officially a 365 broker",
    text: [
      `Congratulations, ${firstName(input.brokerName)}!`,
      "",
      "All your onboarding steps are approved. Welcome to the team.",
      input.link,
      "",
      "365 Yachts",
    ].join("\n"),
  };
}

export function onboardingCompleteAdminEmail(input: { brokerName: string; link: string }): Email {
  return {
    subject: `${input.brokerName} finished onboarding`,
    text: [`${input.brokerName} has every onboarding step approved and is now active.`, "", input.link].join("\n"),
  };
}

export function brokerNeedsHelpAdminEmail(input: { brokerName: string; stepTitle: string; answer: string; phone: string | null; link: string }): Email {
  return {
    subject: `${input.brokerName} asked for help: ${input.stepTitle}`,
    text: [
      `${input.brokerName} answered "${input.stepTitle}" with:`,
      `"${input.answer}"`,
      "",
      `Please get in touch with them${input.phone ? ` (${input.phone})` : ""} to work out the next steps together.`,
      "",
      input.link,
    ].join("\n"),
  };
}

export function reminderEmail(input: {
  brokerName: string;
  stepTitle: string | null;
  message: string | null;
  link: string;
  support: Support;
}): Email {
  const nudge = input.stepTitle ? `Your next step is waiting: ${input.stepTitle}.` : "You have onboarding steps waiting.";
  return {
    subject: input.stepTitle ? `Reminder: ${input.stepTitle}` : "Reminder: your 365 onboarding",
    text: [
      `Hi ${firstName(input.brokerName)},`,
      "",
      nudge,
      ...(input.message ? ["", input.message] : []),
      "",
      `Pick up where you left off: ${input.link}`,
      "",
      signOff(input.support),
    ].join("\n"),
  };
}

export function contractsSignedEmail(input: { brokerName: string; fullySigned: boolean; link: string }): Email {
  return input.fullySigned
    ? {
        subject: "Your signed Broker Agreement and NDA",
        text: [
          `Hi ${firstName(input.brokerName)},`,
          "",
          "Your Broker Agreement and NDA are signed by you and by 365 Yachts. Both signed copies are attached, and you can download them any time from step 2 of your onboarding:",
          input.link,
          "",
          "365 Yachts",
        ].join("\n"),
      }
    : {
        subject: "We received your signed agreements",
        text: [
          `Hi ${firstName(input.brokerName)},`,
          "",
          "Thanks for signing your Broker Agreement and NDA. Shelly will countersign them shortly, and we'll email you the fully signed copies.",
          input.link,
          "",
          "365 Yachts",
        ].join("\n"),
      };
}

export function countersignNeededEmail(input: { brokerName: string; link: string }): Email {
  return {
    subject: `${input.brokerName} signed their agreements: countersignature needed`,
    text: [
      `${input.brokerName} signed the Broker Agreement and NDA. They're waiting for your countersignature (auto-signing is off or your company signature isn't set up).`,
      "",
      "Countersign both with one click:",
      input.link,
    ].join("\n"),
  };
}

export function resignNeededEmail(input: { brokerName: string; reason: string; link: string }): Email {
  return {
    subject: "Please sign your agreements again",
    text: [
      `Hi ${firstName(input.brokerName)},`,
      "",
      `Your Broker Agreement and NDA need a new signature: ${input.reason}. The earlier documents were voided and kept on file.`,
      "",
      "Review and sign the updated documents here:",
      input.link,
      "",
      "365 Yachts",
    ].join("\n"),
  };
}
