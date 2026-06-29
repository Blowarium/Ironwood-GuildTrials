import type { DiscordSuggestionPostKind } from "./discord-suggestions";
import { buildDiscordSuggestionMessages, buildDiscordSuggestionSummary } from "./discord-suggestions";
import { postDiscordMessages } from "./discord-client";
import { readDiscordConfig } from "./discord-env";
import { loadSchedulePlanForWeek } from "./suggestion-schedule-data";
import { getWeekStart } from "./weeks";

export type DiscordPostResult =
  | {
      ok: true;
      weekStart: string;
      kind: DiscordSuggestionPostKind;
      messageCount: number;
      suggestionCount: number;
      scheduledCount: number;
    }
  | { ok: false; error: string };

export async function postDiscordSuggestionsForWeek(
  weekStart: string,
  kind: DiscordSuggestionPostKind,
): Promise<DiscordPostResult> {
  const config = readDiscordConfig();
  if (!config) {
    return {
      ok: false,
      error:
        "Discord is not configured. Set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID on the server.",
    };
  }

  const { plan, members } = await loadSchedulePlanForWeek(weekStart);
  const summary = buildDiscordSuggestionSummary(plan, members);

  if (kind === "reminder" && summary.unscheduledCount === 0) {
    return {
      ok: false,
      error: "Everyone is already scheduled this week — nothing to remind.",
    };
  }

  const chunks = buildDiscordSuggestionMessages(plan, members, weekStart, kind);
  const posted = await postDiscordMessages(
    config,
    chunks,
    config.pingMode,
    config.pingRoleId,
  );

  if (!posted.ok) return posted;

  return {
    ok: true,
    weekStart,
    kind,
    messageCount: posted.messageCount,
    suggestionCount: summary.suggestionCount,
    scheduledCount: summary.scheduledCount,
  };
}

export function resolveDiscordPostWeekStart(weekStart?: string | null): string {
  const trimmed = weekStart?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return getWeekStart(new Date(), 0);
}

export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | null,
): boolean {
  if (!cronSecret) return false;
  const expected = `Bearer ${cronSecret}`;
  return authorizationHeader === expected;
}
