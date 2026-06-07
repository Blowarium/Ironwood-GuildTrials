"use client";

import { useEffect, useState } from "react";
import type { Member } from "@/lib/constants";
import { saveGuildConfig } from "@/lib/api-client";
import type { GuildConfig } from "@/lib/guild-config";
import { GUILD_BUILDINGS } from "@/lib/guild-buildings-data";
import { useDebouncedAutoSave } from "@/lib/use-auto-save";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { LastEditedNote } from "./LastEditedNote";

const HALL_FIELDS = [
  { key: "guildHallLevel" as const, configKey: "guild_hall_level" as const, buildingId: "GuildHall" as const },
  {
    key: "eventHallLevel" as const,
    configKey: "guild_event_hall_level" as const,
    buildingId: "GuildEventHall" as const,
  },
  {
    key: "trialHallLevel" as const,
    configKey: "trial_hall_level" as const,
    buildingId: "GuildTrialHall" as const,
  },
];

export function GuildCreditHallSettings({
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
  const [levels, setLevels] = useState({ guildHallLevel: 8, eventHallLevel: 6, trialHallLevel: 5 });

  useEffect(() => {
    if (!config) return;
    setLevels({
      guildHallLevel: config.guild_hall_level,
      eventHallLevel: config.guild_event_hall_level,
      trialHallLevel: config.trial_hall_level,
    });
  }, [config]);

  const levelsKey = JSON.stringify(levels);
  const autoSave = useDebouncedAutoSave({
    enabled: canEdit && config != null,
    deps: [levelsKey],
    save: async () => {
      if (
        !config ||
        (levels.guildHallLevel === config.guild_hall_level &&
          levels.eventHallLevel === config.guild_event_hall_level &&
          levels.trialHallLevel === config.trial_hall_level)
      ) {
        return null;
      }
      const { config: saved, error } = await saveGuildConfig(levels, actorMember);
      if (error) return error;
      if (saved) onSaved(saved);
      return null;
    },
  });

  function updateLevel(key: keyof typeof levels, value: number, maxLevel: number) {
    setLevels((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(maxLevel, Math.floor(value) || 0)),
    }));
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
      <p className="text-sm font-medium text-white">Credit hall levels</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Guild Hall, Event Hall, and Trial Hall drive daily quest, event, and trial credit income.
        Update these when halls are leveled in-game.
      </p>
      {config && <LastEditedNote by={config.updated_by} at={config.updated_at} compact />}
      {!canEdit ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {HALL_FIELDS.map(({ configKey, buildingId }) => (
            <div
              key={buildingId}
              className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2 text-sm"
            >
              <span className="text-slate-400">{GUILD_BUILDINGS[buildingId].name}</span>
              <p className="font-medium text-white">
                Lv.{config?.[configKey] ?? 0} / {GUILD_BUILDINGS[buildingId].maxLevel}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {HALL_FIELDS.map(({ key, buildingId }) => {
              const maxLevel = GUILD_BUILDINGS[buildingId].maxLevel;
              return (
                <label
                  key={buildingId}
                  className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2"
                >
                  <span className="text-xs text-slate-400">{GUILD_BUILDINGS[buildingId].name}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={maxLevel}
                      value={levels[key]}
                      onChange={(e) => updateLevel(key, Number(e.target.value), maxLevel)}
                      className="w-14 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-right text-sm text-white"
                    />
                    <span className="text-xs text-slate-500">/ {maxLevel}</span>
                  </div>
                </label>
              );
            })}
          </div>
          <AutoSaveIndicator status={autoSave.status} error={autoSave.error} />
        </div>
      )}
      {!canEdit && (
        <p className="mt-2 text-xs text-slate-500">
          Only Guild Leaders and Officers can change these.
        </p>
      )}
    </div>
  );
}
