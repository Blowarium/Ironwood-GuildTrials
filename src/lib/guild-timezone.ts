/**
 * Ironwood guild clock — fixed UTC+2 for scheduling, sync, and week boundaries.
 * User-facing time labels use the browser's local timezone via displayFormatLabel.
 */
export const GUILD_TIMEZONE = "Etc/GMT-2";

const GUILD_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

export const GUILD_DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD on the guild clock for an instant. */
export function guildDateFromInstant(iso: string | Date): string {
  const t = new Date(iso).getTime() + GUILD_UTC_OFFSET_MS;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hour/minute on the guild clock for an instant. */
export function guildTimeParts(iso: string | Date): { hours: number; minutes: number } {
  const t = new Date(iso).getTime() + GUILD_UTC_OFFSET_MS;
  const d = new Date(t);
  return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
}

/** UTC instant for a guild-local calendar date and time. */
export function guildInstantFromLocal(
  dateIso: string,
  hours: number,
  minutes: number,
  seconds = 0,
): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  if (!y || !m || !d) return new Date(0).toISOString();
  return new Date(
    Date.UTC(y, m - 1, d, hours, minutes, seconds) - GUILD_UTC_OFFSET_MS,
  ).toISOString();
}

/** UTC instant for guild-local midnight on `dateIso`. */
export function guildMidnight(dateIso: string): Date {
  return new Date(guildInstantFromLocal(dateIso, 0, 0));
}

/** Day of week on the guild clock: 0 = Sunday … 6 = Saturday. */
export function guildDayOfWeek(iso: string | Date): number {
  const t = new Date(iso).getTime() + GUILD_UTC_OFFSET_MS;
  return new Date(t).getUTCDay();
}

/** Add calendar days on the guild clock. */
export function guildAddDays(dateIso: string, days: number): string {
  const anchor = guildMidnight(dateIso).getTime() + days * GUILD_DAY_MS;
  return guildDateFromInstant(new Date(anchor));
}

/** Monday YYYY-MM-DD of the guild week containing `at`, plus `weekOffset` weeks. */
export function guildWeekStart(at: Date = new Date(), weekOffset = 0): string {
  const today = guildDateFromInstant(at);
  const day = guildDayOfWeek(at);
  const mondayDelta = day === 0 ? -6 : 1 - day;
  return guildAddDays(today, mondayDelta + weekOffset * 7);
}

export function guildFormatLabel(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: GUILD_TIMEZONE,
  }).format(new Date(iso));
}

/** Format an instant in the user's local timezone (display only). */
export function displayFormatLabel(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
}

/** Short timezone name for the user's locale, e.g. "CEST" or "GMT-5". */
export function formatDisplayTimeZoneShort(at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "local";
}
