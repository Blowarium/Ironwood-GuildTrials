import { IRONWOOD_DAILY_RESET_HOUR } from "./guild-timezone";

/** Vercel cron (UTC): Monday 00:00 — guild weekly reset at Mon 02:00 UTC+2. */
export const DISCORD_WEEKLY_CRON_UTC = "0 0 * * 1";

/** Vercel cron (UTC): Wednesday 10:00 — Wed 12:00 UTC+2 mid-week reminder. */
export const DISCORD_REMINDER_CRON_UTC = "0 10 * * 3";

export function formatDiscordCronScheduleLine(): string {
  const resetHour = String(IRONWOOD_DAILY_RESET_HOUR).padStart(2, "0");
  return `Cron (UTC): weekly Mon 00:00 · reminder Wed 10:00 (Mon ${resetHour}:00 weekly reset · Wed 12:00 reminder, guild UTC+2).`;
}
