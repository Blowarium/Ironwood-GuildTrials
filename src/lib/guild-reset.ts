import {
  GUILD_DAY_MS,
  guildAddDays,
  guildDateFromInstant,
  guildDayOfWeek,
  guildInstantFromLocal,
  guildTimeParts,
} from "./guild-timezone";

/** Ironwood guild daily reset — 02:00 UTC+2. */
export const IRONWOOD_DAILY_RESET_HOUR = 2;

/** Most recent daily reset at or before `at` (guild clock). */
export function snapToLastDailyReset(at: Date): Date {
  const date = guildDateFromInstant(at);
  const { hours, minutes } = guildTimeParts(at);
  const pastResetToday =
    hours > IRONWOOD_DAILY_RESET_HOUR ||
    (hours === IRONWOOD_DAILY_RESET_HOUR && minutes >= 0);
  const resetDate = pastResetToday ? date : guildAddDays(date, -1);
  return new Date(guildInstantFromLocal(resetDate, IRONWOOD_DAILY_RESET_HOUR, 0));
}

/** Next daily reset strictly after `at` (guild clock). */
export function nextDailyResetAfter(at: Date): Date {
  const last = snapToLastDailyReset(at);
  return new Date(last.getTime() + GUILD_DAY_MS);
}

/**
 * Trial week identity: Monday 02:00 UTC+2 that opened the current week.
 * Returns epoch ms of that instant (stable comparison key).
 */
export function trialWeekResetKey(at: Date): number {
  const lastReset = snapToLastDailyReset(at);
  const resetDate = guildDateFromInstant(lastReset);
  const day = guildDayOfWeek(guildInstantFromLocal(resetDate, 12, 0));
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const mondayDate = guildAddDays(resetDate, mondayOffset);
  return new Date(guildInstantFromLocal(mondayDate, IRONWOOD_DAILY_RESET_HOUR, 0)).getTime();
}

export function formatDailyResetLabel(): string {
  return `${String(IRONWOOD_DAILY_RESET_HOUR).padStart(2, "0")}:00 UTC+2`;
}

export { GUILD_DAY_MS };
