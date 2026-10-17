/**
 * File: apps/web/src/lib/format.ts
 * Purpose: Text formatting for the screens, always in Florida time so the server and the browser print the same
 * thing: dates, relative times ("2 hours ago"), greetings, initials and ordinals.
 *
 * Functions:
 * - firstName(name): the first word of a full name.
 * - initials(name): up to two capital letters for an avatar.
 * - formatDate(iso): "Oct 13, 2026" from an ISO date or timestamp.
 * - formatShortDate(iso): "Aug 18".
 * - formatLongDate(now): "Saturday, October 17".
 * - formatTime(iso): "10:42".
 * - relativeTime(iso, now): "just now", "2 hours ago", "yesterday", "3 days ago", or a date for older times.
 * - formatSentAt(iso, now): "Today, 10:42", "Yesterday, 16:05" or "Oct 13, 10:42".
 * - greeting(now): "Good morning", "Good afternoon" or "Good evening" by Florida time.
 * - ordinal(n): "1st", "2nd", "3rd", "4th"...
 * - toDate(iso): turns a date-only ISO string into a Date at Florida noon, and a timestamp into a Date.
 * - floridaDay(date): the "YYYY-MM-DD" day of a Date in Florida.
 */
const TIME_ZONE = "America/New_York";

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0]];
  return letters.filter(Boolean).join("").toUpperCase();
}

function toDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-05:00`) : new Date(iso);
}

function floridaDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(toDate(iso));
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" }).format(toDate(iso));
}

export function formatLongDate(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" }).format(now);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  const dayGap = Math.round((toDate(floridaDay(now)).getTime() - toDate(floridaDay(then)).getTime()) / 86400000);
  if (dayGap === 0) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  if (dayGap === 1) return "yesterday";
  if (dayGap < 7) return `${dayGap} days ago`;
  return formatDate(iso);
}

export function formatSentAt(iso: string, now: Date): string {
  const then = new Date(iso);
  const dayGap = Math.round((toDate(floridaDay(now)).getTime() - toDate(floridaDay(then)).getTime()) / 86400000);
  if (dayGap === 0) return `Today, ${formatTime(iso)}`;
  if (dayGap === 1) return `Yesterday, ${formatTime(iso)}`;
  return `${formatShortDate(iso)}, ${formatTime(iso)}`;
}

export function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
