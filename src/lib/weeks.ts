import {
  displayFormatLabel,
  guildAddDays,
  guildFormatLabel,
  guildInstantFromLocal,
  guildMidnight,
  guildWeekStart,
} from "./guild-timezone";
import { weekBoundsLocal } from "./trial-schedule";

/** Monday 00:00 guild time (UTC+2) for the trial week containing `date`, plus `weekOffset` weeks. */
export function getWeekStart(date = new Date(), weekOffset = 0): string {
  return guildWeekStart(date, weekOffset);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** UTC instant for guild-local midnight on `iso` (YYYY-MM-DD). */
export function parseISODate(iso: string): Date {
  return new Date(guildInstantFromLocal(iso, 0, 0));
}

export function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => guildAddDays(weekStart, i));
}

export function formatWeekRange(weekStart: string): string {
  const { start, end } = weekBoundsLocal(weekStart);
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(new Date(end.getTime() - 1))}`;
}

export function formatDayLabel(iso: string, short = false): string {
  return guildFormatLabel(guildInstantFromLocal(iso, 12, 0), {
    weekday: short ? "short" : "long",
    month: "short",
    day: "numeric",
  });
}

export function isDateInWeek(iso: string, weekStart: string): boolean {
  const days = getWeekDays(weekStart);
  return days.includes(iso);
}

export function weekLabel(weekOffset: number): string {
  if (weekOffset === 0) return "This week";
  if (weekOffset === 1) return "Next week";
  return `+${weekOffset} weeks`;
}

/** Tab label e.g. "Week of Jun 2" (guild Monday, shown in local date). */
export function formatWeekTabLabel(weekStart: string): string {
  return `Week of ${displayFormatLabel(guildMidnight(weekStart), {
    month: "short",
    day: "numeric",
  })}`;
}

/** Trial window copy for the UI */
export const TRIAL_WINDOW_NOTE =
  "Goal: complete all 16 skill trials each week. Mark a skill done when finished — until then, more members can sign up. One 24h trial per member per week.";
