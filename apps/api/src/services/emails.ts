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
 * - reminderEmail(input): nudges a broker about their next step.
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
