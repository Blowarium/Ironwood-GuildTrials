import type { TrialStatus } from "./constants";
import type { TrialSignup } from "./types";
import {
  GUILD_DAY_MS,
  GUILD_TIMEZONE,
  guildDateFromInstant,
  guildFormatLabel,
  guildInstantFromLocal,
  guildMidnight,
  guildTimeParts,
} from "./guild-timezone";

export const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
export const WEEK_DURATION_MS = 7 * TRIAL_DURATION_MS;

export function weekBoundsLocal(weekStartIso: string): { start: Date; end: Date } {
  const start = guildMidnight(weekStartIso);
  const end = new Date(start.getTime() + WEEK_DURATION_MS);
  return { start, end };
}

/** Map 0–1 position on the week bar to a guild-local start timestamp (Mon 00:00 → next Mon 00:00). */
export function buildStartAtFromWeekFraction(weekStartIso: string, fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const { start } = weekBoundsLocal(weekStartIso);
  return new Date(start.getTime() + Math.floor(clamped * WEEK_DURATION_MS)).toISOString();
}

/** Default trial start: 08:00 guild time on the chosen day. */
export function defaultStartAtForDate(dateIso: string): string {
  if (!dateIso || Number.isNaN(guildMidnight(dateIso).getTime())) {
    return guildInstantFromLocal(guildDateFromInstant(new Date()), 8, 0);
  }
  return guildInstantFromLocal(dateIso, 8, 0);
}

export function buildStartAt(dateIso: string, hours: number, minutes: number): string {
  if (!dateIso) return defaultStartAtForDate(guildDateFromInstant(new Date()));
  if (Number.isNaN(guildMidnight(dateIso).getTime())) return defaultStartAtForDate(dateIso);
  return guildInstantFromLocal(dateIso, hours, minutes);
}

export function buildStartAtFromDayFraction(dateIso: string, fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const totalMinutes = Math.floor(clamped * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return buildStartAt(dateIso, hours, minutes);
}

export function dateFromStartAt(iso: string): string {
  return guildDateFromInstant(iso);
}

export function formatTimeLabel(iso: string, short = false): string {
  return guildFormatLabel(iso, {
    hour: "numeric",
    minute: "2-digit",
    hour12: !short,
  });
}

export function formatDateTimeLabel(iso: string): string {
  return guildFormatLabel(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const { hours, minutes } = guildTimeParts(startIso);
  return ((hours * 60 + minutes) / (24 * 60)) * 100;
}

/** How much of the 24h trial remains visible in the start-day column (percent height). */
export function heightPercentInStartDay(startIso: string): number {
  const startPct = startPercentInDay(startIso);
  return Math.max(8, 100 - startPct);
}

export interface TrialDaySegment {
  signup: TrialSignup;
  plannedStartAt: string;
  plannedEndAt: Date;
  topPercent: number;
  heightPercent: number;
  isStartSegment: boolean;
  isEndSegment: boolean;
}

function dayBoundsLocal(dateIso: string): { start: Date; end: Date } {
  const start = guildMidnight(dateIso);
  const end = new Date(start.getTime() + GUILD_DAY_MS);
  return { start, end };
}

/** Visual slice of a 24h trial within one calendar day column. */
export function trialSegmentForDay(signup: TrialSignup, dayIso: string): TrialDaySegment | null {
  const { planned_start_at } = normalizeSignupTiming(signup);
  const start = new Date(planned_start_at);
  const end = getTrialEndAt(planned_start_at);
  if (Number.isNaN(start.getTime())) return null;

  const { start: dayStart, end: dayEnd } = dayBoundsLocal(dayIso);
  if (end <= dayStart || start >= dayEnd) return null;

  const segStart = start > dayStart ? start : dayStart;
  const segEnd = end < dayEnd ? end : dayEnd;
  const dayMs = GUILD_DAY_MS;

  const topPercent = ((segStart.getTime() - dayStart.getTime()) / dayMs) * 100;
  const heightPercent = ((segEnd.getTime() - segStart.getTime()) / dayMs) * 100;

  return {
    signup,
    plannedStartAt: planned_start_at,
    plannedEndAt: end,
    topPercent,
    heightPercent: Math.max(4, heightPercent),
    isStartSegment: start >= dayStart && start < dayEnd,
    isEndSegment: end > dayStart && end <= dayEnd,
  };
}

export function formatTrialWindowLabel(startIso: string): string {
  const end = getTrialEndAt(startIso);
  return `${formatDateTimeLabel(startIso)} → ${formatDateTimeLabel(end.toISOString())}`;
}

export interface TrialWeekSegment {
  signup: TrialSignup;
  plannedStartAt: string;
  plannedEndAt: Date;
  leftPercent: number;
  widthPercent: number;
}

export interface StackedTrialWeekSegment extends TrialWeekSegment {
  lane: number;
  laneCount: number;
}

function segmentsOverlap(a: TrialWeekSegment, b: TrialWeekSegment): boolean {
  return (
    a.leftPercent < b.leftPercent + b.widthPercent &&
    b.leftPercent < a.leftPercent + a.widthPercent
  );
}

/** Assign vertical lanes so overlapping trials on the same skill row do not cover each other. */
export function stackTrialWeekSegments(segments: TrialWeekSegment[]): StackedTrialWeekSegment[] {
  if (segments.length === 0) return [];

  const sorted = [...segments].sort(
    (a, b) =>
      a.leftPercent - b.leftPercent ||
      b.widthPercent - a.widthPercent ||
      a.plannedStartAt.localeCompare(b.plannedStartAt),
  );
  const lanes: TrialWeekSegment[][] = [];

  for (const seg of sorted) {
    let placed = false;
    for (const lane of lanes) {
      if (!lane.some((existing) => segmentsOverlap(seg, existing))) {
        lane.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([seg]);
  }

  const laneCount = lanes.length;
  return lanes.flatMap((lane, laneIndex) =>
    lane.map((seg) => ({ ...seg, lane: laneIndex, laneCount })),
  );
}

/** Horizontal slice of a 24h trial within one Mon–Sun week column. */
export function trialSegmentInWeek(
  signup: TrialSignup,
  weekStartIso: string,
): TrialWeekSegment | null {
  const { planned_start_at } = normalizeSignupTiming(signup);
  const start = new Date(planned_start_at);
  const end = getTrialEndAt(planned_start_at);
  if (Number.isNaN(start.getTime())) return null;

  const { start: weekStart, end: weekEnd } = weekBoundsLocal(weekStartIso);
  if (end <= weekStart || start >= weekEnd) return null;

  const visStart = start > weekStart ? start : weekStart;
  const visEnd = end < weekEnd ? end : weekEnd;
  const leftPercent = ((visStart.getTime() - weekStart.getTime()) / WEEK_DURATION_MS) * 100;
  const widthPercent = ((visEnd.getTime() - visStart.getTime()) / WEEK_DURATION_MS) * 100;

  return {
    signup,
    plannedStartAt: planned_start_at,
    plannedEndAt: end,
    leftPercent,
    widthPercent: Math.max(0.35, widthPercent),
  };
}

export function timeInputValue(iso: string): string {
  const { hours, minutes } = guildTimeParts(iso);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

/** Re-export for callers that need the guild IANA zone id. */
export { GUILD_TIMEZONE };
