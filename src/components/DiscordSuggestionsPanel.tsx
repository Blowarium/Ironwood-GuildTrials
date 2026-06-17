"use client";

import { useCallback, useEffect, useState } from "react";
import type { Member } from "@/lib/constants";
import {
  fetchDiscordPostStatus,
  postDiscordSuggestions,
  type DiscordPostKind,
} from "@/lib/api-client";
import { getStaffAuthToken } from "@/lib/staff-auth-client";
import { formatWeekTabLabel, getWeekStart } from "@/lib/weeks";

export function DiscordSuggestionsPanel({
  currentUser,
  weekStart,
  canManageDiscord,
  staffUnlocked,
}: {
  currentUser: Member;
  weekStart: string;
  /** Guild Leader or Guild Officer (database role). */
  canManageDiscord: boolean;
  staffUnlocked: boolean;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [posting, setPosting] = useState<DiscordPostKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDiscordPostStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  const post = useCallback(
    async (kind: DiscordPostKind) => {
      if (!staffUnlocked) {
        setError("Unlock officer access to post to Discord.");
        return;
      }
      setPosting(kind);
      setError(null);
      setMessage(null);
      const token = getStaffAuthToken(currentUser);
      const result = await postDiscordSuggestions({
        actorMember: currentUser,
        staffAuthToken: token ?? undefined,
        weekStart,
        kind,
      });
      setPosting(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      const label = kind === "weekly" ? "Weekly suggestions" : "Mid-week reminder";
      setMessage(
        `${label} posted for ${formatWeekTabLabel(result.weekStart ?? weekStart)} — ${result.suggestionCount ?? 0} suggestion(s), ${result.messageCount ?? 1} message(s).`,
      );
    },
    [currentUser, staffUnlocked, weekStart],
  );

  if (!canManageDiscord) return null;

  return (
    <div className="mobile-panel rounded-xl border border-indigo-500/30 bg-indigo-950/20 sm:p-4">
      <h3 className="text-sm font-semibold text-white">Discord announcements</h3>
      <p className="mt-1 text-xs text-slate-400">
        Post smart suggestions with a personal link that opens the schedule dialog on the weekly
        planner. Requires a Discord bot on the server (
        <code className="text-slate-500">DISCORD_BOT_TOKEN</code>,{" "}
        <code className="text-slate-500">DISCORD_CHANNEL_ID</code>).
      </p>

      {configured === false && (
        <p className="mt-2 text-xs text-amber-300">
          Discord bot is not configured on this deployment yet.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={posting !== null || configured === false || !staffUnlocked}
          onClick={() => post("weekly")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {posting === "weekly" ? "Posting…" : "Post to Discord now"}
        </button>
        <button
          type="button"
          disabled={posting !== null || configured === false || !staffUnlocked}
          onClick={() => post("reminder")}
          className="rounded-lg border border-indigo-500/50 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-950/40 disabled:opacity-50"
        >
          {posting === "reminder" ? "Posting…" : "Mid-week reminder"}
        </button>
      </div>

      {!staffUnlocked && (
        <p className="mt-2 text-xs text-amber-300">
          Unlock officer access to post to Discord.
        </p>
      )}

      <p className="mt-2 text-[10px] text-slate-500">
        Cron (UTC): weekly Sun 22:00 · reminder Wed 10:00 (Mon 00:00 / Wed 12:00 guild time). Set{" "}
        <code className="text-slate-600">CRON_SECRET</code> and{" "}
        <code className="text-slate-600">DISCORD_PING_MODE</code> (role/everyone/none).
      </p>

      {message && <p className="mt-2 text-xs text-emerald-300">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function discordPostWeekStartLabel(): string {
  return formatWeekTabLabel(getWeekStart(new Date(), 0));
}
