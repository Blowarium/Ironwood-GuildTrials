import type { Member } from "./constants";
import type { SchedulePlan } from "./schedule-optimizer";
import { formatGuildHourLabel } from "./trial-schedule";
import { buildTrialApplyLink, getAppBaseUrl } from "./trial-apply-link";
import { formatGuildDayLabel, formatGuildWeekTabLabel } from "./weeks";

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

function memberScheduleLine(
  member: Member,
  weekStart: string,
  baseUrl: string,
): string {
  const link = buildTrialApplyLink(weekStart, member, baseUrl);
  return `**${member}** — [Schedule your trial](${link})`;
}

function unscheduledMembers(plan: SchedulePlan, members: readonly Member[]): Member[] {
  const scheduledMembers = new Set(plan.alreadyScheduled.map((s) => s.member_name));
  return [...members]
    .filter((m) => !scheduledMembers.has(m))
    .sort((a, b) => a.localeCompare(b));
}

export function buildDiscordSuggestionMessages(
  plan: SchedulePlan,
  members: readonly Member[],
  weekStart: string,
  kind: DiscordSuggestionPostKind,
  baseUrl = getAppBaseUrl(),
): string[] {
  const weekLabel = formatGuildWeekTabLabel(weekStart);
  const unscheduled = unscheduledMembers(plan, members);

  const header =
    kind === "weekly"
      ? `**Guild Trials — ${weekLabel}**\nMembers not yet on the planner this week — use your personal link below. The suggested skill and time are calculated **when you open the link**, based on current signups and mark-done status (not frozen at post time).`
      : `**Guild Trials reminder — ${weekLabel}**\nThese members still need a trial slot. Open your link for the **current** suggestion:`;

  const lines: string[] = [header, ""];

  if (unscheduled.length === 0) {
    lines.push("_Everyone is already scheduled this week — nice work!_");
  } else {
    for (const member of unscheduled) {
      lines.push(memberScheduleLine(member, weekStart, baseUrl));
    }
  }

  const scheduled = plan.alreadyScheduled;
  if (scheduled.length > 0 && kind === "weekly") {
    lines.push(
      "",
      `**Already on the planner** (${scheduled.length} — snapshot when this was posted)`,
    );
    for (const s of scheduled) {
      const day = formatGuildDayLabel(s.planned_date, true);
      const time = s.planned_start_at ? formatGuildHourLabel(s.planned_start_at) : "";
      lines.push(`• ${s.member_name} — ${s.skill} · ${day}${time ? ` ${time}` : ""}`);
    }
  }

  const suggestedNow = new Set(plan.suggestions.map((s) => s.member));
  const withoutSuggestion = unscheduled.filter((m) => !suggestedNow.has(m));
  if (withoutSuggestion.length > 0) {
    lines.push(
      "",
      `_Note: ${withoutSuggestion.length} member${withoutSuggestion.length === 1 ? "" : "s"} may need profile updates (top skills, XP/h, or fewer locked-out skills) before a suggestion can be made._`,
    );
  }

  lines.push("", `Planner: ${baseUrl}`);

  return chunkLines(lines);
}

export function buildDiscordSuggestionSummary(
  plan: SchedulePlan,
  members: readonly Member[],
): {
  suggestionCount: number;
  scheduledCount: number;
  unscheduledCount: number;
} {
  const unscheduled = unscheduledMembers(plan, members);
  return {
    /** Unscheduled members included in the post (each gets a personal link). */
    suggestionCount: unscheduled.length,
    scheduledCount: plan.alreadyScheduled.length,
    unscheduledCount: unscheduled.length,
  };
}
