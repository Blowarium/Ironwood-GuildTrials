/** Ironwood guild daily reset — local time. */
export const IRONWOOD_DAILY_RESET_HOUR = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Most recent daily reset at or before `at`. */
export function snapToLastDailyReset(at: Date): Date {
  const d = new Date(at);
  d.setHours(IRONWOOD_DAILY_RESET_HOUR, 0, 0, 0);
  if (at.getTime() < d.getTime()) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** Next daily reset strictly after `at`. */
export function nextDailyResetAfter(at: Date): Date {
  const d = snapToLastDailyReset(at);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Trial week identity: Monday 02:00 local that opened the current week.
 * Returns epoch ms of that instant (stable comparison key).
 */
export function trialWeekResetKey(at: Date): number {
  const lastReset = snapToLastDailyReset(at);
  const day = lastReset.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(lastReset);
  monday.setDate(monday.getDate() + mondayOffset);
  return monday.getTime();
}

export function formatDailyResetLabel(): string {
  return `${String(IRONWOOD_DAILY_RESET_HOUR).padStart(2, "0")}:00 local`;
}

export { DAY_MS as GUILD_DAY_MS };
