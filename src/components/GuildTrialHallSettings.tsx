"use client";

import { useEffect, useState } from "react";
import type { Member } from "@/lib/constants";
import { saveGuildConfig } from "@/lib/api-client";
import type { GuildConfig } from "@/lib/guild-config";
import { formatXp, trialXpRequired } from "@/lib/trial-xp";
import { useDebouncedAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { LastEditedNote } from "./LastEditedNote";

export function GuildTrialHallSettings({
  config,
  actorMember,
  canEdit,
  onSaved,
}: {
  config: GuildConfig | null;
  actorMember: Member;
  canEdit: boolean;
  onSaved: (config: GuildConfig) => void;
}) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (config) setLevel(config.trial_hall_level);
  }, [config]);

  const xpPerTrial = trialXpRequired(level);

  const autoSave = useDebouncedAutoSave({
    enabled: canEdit && config != null,
    deps: [level],
    save: async () => {
      if (!config || level === config.trial_hall_level) return null;
      const { config: saved, error } = await saveGuildConfig({ trialHallLevel: level }, actorMember);
      if (error) return error;
      if (saved) onSaved(saved);
      return null;
    },
  });

  return (
    <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-3">
      <p className="text-xs font-medium text-white sm:text-sm">Guild Trial Hall level</p>
      <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">
        <span className="sm:hidden">
          Per skill: <span className="font-medium text-white">{formatXp(xpPerTrial)} XP</span>
        </span>
        <span className="hidden sm:inline">
          Trial XP needed per skill:{" "}
          <span className="text-sky-300">8,000 × (level + 1)</span> ={" "}
          <span className="font-medium text-white">{formatXp(xpPerTrial)} XP</span>
          <span className="text-slate-500"> · members contribute 5% of skill XP earned in 24h</span>
        </span>
      </p>
      {config && <LastEditedNote by={config.updated_by} at={config.updated_at} compact />}
      {!canEdit ? (
        <p className="mt-2 text-xs text-slate-500">
          Only Guild Leaders and Officers can change this.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            max={99}
            value={level}
            onChange={(e) => setLevel(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
          />
          <AutoSaveIndicator status={autoSave.status} error={autoSave.error} />
        </div>
      )}
    </div>
  );
}
