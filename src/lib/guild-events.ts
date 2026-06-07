import type { Skill } from "./constants";
import { guildInstantFromLocal } from "./guild-timezone";
import { formatDateTimeLabel, WEEK_DURATION_MS, weekBoundsLocal } from "./trial-schedule";

export type GuildEventType = "gathering" | "crafting" | "combat";

export type GuildEventPhase = "active" | "cooldown";

/** Rotating order: Gathering → Crafting → Combat. */
export const GUILD_EVENT_ORDER: GuildEventType[] = ["gathering", "crafting", "combat"];

export const GUILD_EVENT_LABELS: Record<GuildEventType, string> = {
  gathering: "Gathering Event",
  crafting: "Crafting Event",
  combat: "Combat Event",
};

export const GUILD_EVENT_DURATION_MS = 48 * 60 * 60 * 1000;
export const GUILD_EVENT_COOLDOWN_MS = 36 * 60 * 60 * 1000;
export const GUILD_EVENT_SLOT_MS = GUILD_EVENT_DURATION_MS + GUILD_EVENT_COOLDOWN_MS;
export const GUILD_EVENT_ROTATION_MS = GUILD_EVENT_SLOT_MS * GUILD_EVENT_ORDER.length;

/**
 * 48h active + 36h cooldown slots chain from the anchor. Every other event ends at
 * 14:00 UTC+2; the others end at 02:00 UTC+2 (daily reset).
 */
export const GUILD_EVENT_END_HOURS_UTC2 = [2, 14] as const;

/** Next known event start: 7 Jun 2026 02:00 UTC+2 — Gathering Event. */
export const GUILD_EVENT_ANCHOR: { at: Date; type: GuildEventType } = {
  at: new Date(guildInstantFromLocal("2026-06-07", 2, 0)),
  type: "gathering",
};

export interface GuildEventInterval {
  type: GuildEventType;
  phase: GuildEventPhase;
  startAt: Date;
  endAt: Date;
}

export interface GuildEventWeekSegment extends GuildEventInterval {
  leftPercent: number;
  widthPercent: number;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function guildEventForSkill(skill: Skill): GuildEventType {
  switch (skill) {
    case "Woodcutting":
    case "Mining":
    case "Farming":
    case "Fishing":
    case "Delving":
    case "Exploring":
      return "gathering";
    case "One-handed":
    case "Two-handed":
    case "Ranged":
    case "Defense":
      return "combat";
    default:
      return "crafting";
  }
}

function eventTypeForSlot(slotsFromAnchor: number): GuildEventType {
  const anchorIndex = GUILD_EVENT_ORDER.indexOf(GUILD_EVENT_ANCHOR.type);
  const index = mod(slotsFromAnchor + anchorIndex, GUILD_EVENT_ORDER.length);
  return GUILD_EVENT_ORDER[index];
}

/** All event phases (active + cooldown) overlapping [rangeStart, rangeEnd). */
export function guildEventIntervalsInRange(rangeStart: Date, rangeEnd: Date): GuildEventInterval[] {
  const { at: anchorAt } = GUILD_EVENT_ANCHOR;
  const anchorMs = anchorAt.getTime();
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  let slotStartMs =
    anchorMs + Math.floor((startMs - anchorMs) / GUILD_EVENT_SLOT_MS) * GUILD_EVENT_SLOT_MS;
  if (slotStartMs > startMs) slotStartMs -= GUILD_EVENT_SLOT_MS;

  const intervals: GuildEventInterval[] = [];

  while (slotStartMs < endMs) {
    const slotsFromAnchor = Math.round((slotStartMs - anchorMs) / GUILD_EVENT_SLOT_MS);
    const type = eventTypeForSlot(slotsFromAnchor);

    const activeEnd = slotStartMs + GUILD_EVENT_DURATION_MS;
    const slotEnd = slotStartMs + GUILD_EVENT_SLOT_MS;

    if (activeEnd > startMs && slotStartMs < endMs) {
      intervals.push({
        type,
        phase: "active",
        startAt: new Date(slotStartMs),
        endAt: new Date(activeEnd),
      });
    }

    if (slotEnd > startMs && activeEnd < endMs) {
      intervals.push({
        type,
        phase: "cooldown",
        startAt: new Date(activeEnd),
        endAt: new Date(slotEnd),
      });
    }

    slotStartMs += GUILD_EVENT_SLOT_MS;
  }

  return intervals;
}

export function timeRangeSegmentInWeek(
  rangeStart: Date,
  rangeEnd: Date,
  weekStartIso: string,
): { leftPercent: number; widthPercent: number } | null {
  if (rangeEnd <= rangeStart) return null;

  const { start: weekStart, end: weekEnd } = weekBoundsLocal(weekStartIso);
  if (rangeEnd <= weekStart || rangeStart >= weekEnd) return null;

  const visStart = rangeStart > weekStart ? rangeStart : weekStart;
  const visEnd = rangeEnd < weekEnd ? rangeEnd : weekEnd;
  const leftPercent = ((visStart.getTime() - weekStart.getTime()) / WEEK_DURATION_MS) * 100;
  const widthPercent = ((visEnd.getTime() - visStart.getTime()) / WEEK_DURATION_MS) * 100;

  return {
    leftPercent,
    widthPercent: Math.max(0.2, widthPercent),
  };
}

export function guildEventSegmentsInWeek(weekStartIso: string): GuildEventWeekSegment[] {
  const { start, end } = weekBoundsLocal(weekStartIso);
  const pad = GUILD_EVENT_ROTATION_MS;
  const rangeStart = new Date(start.getTime() - pad);
  const rangeEnd = new Date(end.getTime() + pad);

  const segments: GuildEventWeekSegment[] = [];

  for (const interval of guildEventIntervalsInRange(rangeStart, rangeEnd)) {
    const layout = timeRangeSegmentInWeek(interval.startAt, interval.endAt, weekStartIso);
    if (!layout) continue;
    segments.push({ ...interval, ...layout });
  }

  return segments;
}

export function formatGuildEventSegmentLabel(segment: GuildEventInterval): string {
  if (segment.phase === "cooldown") {
    return `Cooldown · ${formatDateTimeLabel(segment.startAt.toISOString())} → ${formatDateTimeLabel(segment.endAt.toISOString())}`;
  }
  return `${GUILD_EVENT_LABELS[segment.type]} · ${formatDateTimeLabel(segment.startAt.toISOString())} → ${formatDateTimeLabel(segment.endAt.toISOString())}`;
}

export function activeGuildEventAt(at = new Date()): GuildEventInterval | null {
  const intervals = guildEventIntervalsInRange(
    new Date(at.getTime() - GUILD_EVENT_DURATION_MS),
    new Date(at.getTime() + 1),
  );
  return intervals.find((i) => i.phase === "active" && i.startAt <= at && i.endAt > at) ?? null;
}

/** Next active-phase end strictly after `at` (02:00 or 14:00 UTC+2 depending on rotation slot). */
export function nextGuildEventActiveEndAfter(at: Date): Date | null {
  const intervals = guildEventIntervalsInRange(
    at,
    new Date(at.getTime() + GUILD_EVENT_ROTATION_MS * 2),
  );
  let best: Date | null = null;
  for (const interval of intervals) {
    if (interval.phase !== "active") continue;
    if (interval.endAt.getTime() <= at.getTime()) continue;
    if (!best || interval.endAt.getTime() < best.getTime()) best = interval.endAt;
  }
  return best;
}
