import type { Member, Skill } from "./constants";
import type { SchedulePlan } from "./schedule-optimizer";
import { formatGuildHourLabel } from "./trial-schedule";
import { buildTrialApplyLink, getAppBaseUrl } from "./trial-apply-link";
import { formatGuildDayLabel, formatGuildWeekTabLabel } from "./weeks";
import { rankLabel } from "./suggestion-labels";

export type DiscordSuggestionPostKind = "weekly" | "reminder";

const MAX_CHUNK = 1900;

function chunkLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_CHUNK && current) {
      chunks.push(current);
      current = line;
    } else if (line.length > MAX_CHUNK) {
      if (current) chunks.push(current);
      chunks.push(line.slice(0, MAX_CHUNK));
      current = "";
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

function suggestionLine(
  member: Member,
  skill: Skill,
  plannedDate: string,
  plannedStartAt: string,
  weekStart: string,
  baseUrl: string,
): string {
  const link = buildTrialApplyLink(weekStart, member, baseUrl);
  const day = formatGuildDayLabel(plannedDate, true);
  const time = formatGuildHourLabel(plannedStartAt);
  return `**${member}** — ${skill} · ${day} ${time} · [Schedule trial](${link})`;
}

export function buildDiscordSuggestionMessages(
  plan: SchedulePlan,
  weekStart: string,
  kind: DiscordSuggestionPostKind,
  baseUrl = getAppBaseUrl(),
): string[] {
  const weekLabel = formatGuildWeekTabLabel(weekStart);
  const suggestions =
    kind === "reminder"
      ? plan.suggestions
      : plan.suggestions;

  const header =
    kind === "weekly"
      ? `**Guild Trials — ${weekLabel}**\nSmart suggestions for members not yet on the planner. Open your link to pick a day & start time:`
      : `**Guild Trials reminder — ${weekLabel}**\nThese members still need a trial slot this week:`;

  const lines: string[] = [header, ""];

  if (suggestions.length === 0) {
    lines.push("_Everyone with a profile is already scheduled — nice work!_");
  } else {
    for (const s of suggestions) {
      lines.push(
        suggestionLine(s.member, s.skill, s.plannedDate, s.plannedStartAt, weekStart, baseUrl) +
          ` _(${rankLabel(s.preferenceRank)})_`,
      );
    }
  }

  const scheduled = plan.alreadyScheduled;
  if (scheduled.length > 0 && kind === "weekly") {
    lines.push("", "**Already scheduled**");
    for (const s of scheduled) {
      const day = formatGuildDayLabel(s.planned_date, true);
      const time = s.planned_start_at ? formatGuildHourLabel(s.planned_start_at) : "";
      lines.push(`• ${s.member_name} — ${s.skill} · ${day}${time ? ` ${time}` : ""}`);
    }
  }

  const suggestedMembers = new Set(suggestions.map((s) => s.member));
  const scheduledMembers = new Set(scheduled.map((s) => s.member_name));
  const needsProfile = plan.totalMembers - suggestedMembers.size - scheduledMembers.size;
  if (needsProfile > 0 && kind === "weekly") {
    lines.push("", "_Some members need a profile with top skills & XP/h before a suggestion can be made._");
  }

  lines.push("", `Planner: ${baseUrl}`);

  return chunkLines(lines);
}

export function buildDiscordSuggestionSummary(plan: SchedulePlan): {
  suggestionCount: number;
  scheduledCount: number;
} {
  return {
    suggestionCount: plan.suggestions.length,
    scheduledCount: plan.alreadyScheduled.length,
  };
}
