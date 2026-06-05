import type { TrialStatus } from "./constants";
import type { TrialSignup } from "./types";
import { parseISODate, toISODate } from "./weeks";

export const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

/** Default trial start: 08:00 local on the chosen day. */
export function defaultStartAtForDate(dateIso: string): string {
  const d = parseISODate(dateIso);
  if (Number.isNaN(d.getTime())) {
    const fallback = parseISODate(new Date().toISOString().slice(0, 10));
    fallback.setHours(8, 0, 0, 0);
    return fallback.toISOString();
  }
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

export function buildStartAt(dateIso: string, hours: number, minutes: number): string {
  if (!dateIso) return defaultStartAtForDate(new Date().toISOString().slice(0, 10));
  const d = parseISODate(dateIso);
  if (Number.isNaN(d.getTime())) return defaultStartAtForDate(dateIso);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function buildStartAtFromDayFraction(dateIso: string, fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const totalMinutes = Math.floor(clamped * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return buildStartAt(dateIso, hours, minutes);
}

export function dateFromStartAt(iso: string): string {
  return toISODate(new Date(iso));
}

export function formatTimeLabel(iso: string, short = false): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: !short,
  }).format(new Date(iso));
}

export function formatDateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function getTrialEndAt(startIso: string): Date {
  return new Date(new Date(startIso).getTime() + TRIAL_DURATION_MS);
}

/** Status derived from wall clock vs 24h trial window. */
export function getEffectiveStatus(signup: TrialSignup, now = new Date()): TrialStatus {
  const start = new Date(signup.planned_start_at);
  const end = getTrialEndAt(signup.planned_start_at);
  if (now < start) return "planned";
  if (now < end) return "active";
  return "completed";
}

export function syncSignupStatus(signup: TrialSignup, now = new Date()): TrialSignup {
  return { ...signup, status: getEffectiveStatus(signup, now) };
}

export function syncSignups(signups: TrialSignup[], now = new Date()): TrialSignup[] {
  return signups.map((s) => syncSignupStatus(s, now));
}

/** 0–100 position of trial start within its start-day column. */
export function startPercentInDay(startIso: string): number {
  const d = new Date(startIso);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return (minutes / (24 * 60)) * 100;
}

/** How much of the 24h trial remains visible in the start-day column (percent height). */
export function heightPercentInStartDay(startIso: string): number {
  const startPct = startPercentInDay(startIso);
  return Math.max(8, 100 - startPct);
}

export function timeInputValue(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function applyTimeToDate(dateIso: string, timeValue: string): string {
  const [h, m] = timeValue.split(":").map(Number);
  return buildStartAt(dateIso, h || 0, m || 0);
}

export function normalizeSignupTiming(signup: Partial<TrialSignup> & Pick<TrialSignup, "planned_date">): {
  planned_date: string;
  planned_start_at: string;
} {
  const planned_start_at =
    signup.planned_start_at && signup.planned_start_at.length > 0
      ? signup.planned_start_at
      : defaultStartAtForDate(signup.planned_date);
  const planned_date = dateFromStartAt(planned_start_at);
  return { planned_date, planned_start_at };
}
