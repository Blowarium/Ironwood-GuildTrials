import {
  GUILD_DAY_MS,
  guildAddDays,
  guildDateFromInstant,
  guildDayOfWeek,
  guildInstantFromLocal,
  IRONWOOD_DAILY_RESET_HOUR,
  snapToLastDailyReset,
} from "./guild-timezone";

export { IRONWOOD_DAILY_RESET_HOUR, GUILD_DAY_MS, snapToLastDailyReset };

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
