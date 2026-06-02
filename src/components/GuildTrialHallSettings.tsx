"use client";

import { useEffect, useState } from "react";
import { saveGuildConfig } from "@/lib/api-client";
import type { GuildConfig } from "@/lib/guild-config";
import { formatXp, trialXpRequired } from "@/lib/trial-xp";

export function GuildTrialHallSettings({
  config,
  onSaved,
}: {
  config: GuildConfig | null;
  onSaved: (config: GuildConfig) => void;
}) {
  const [level, setLevel] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (config) setLevel(config.trial_hall_level);
  }, [config]);

  const xpPerTrial = trialXpRequired(level);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { config: saved, error } = await saveGuildConfig(level);
    setSaving(false);
    if (error) return;
    if (saved) {
      onSaved(saved);
      setMessage("Hall level saved.");
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-3">
      <p className="text-sm font-medium text-white">Guild Trial Hall level</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Trial XP needed per skill:{" "}
        <span className="text-sky-300">8,000 × (level + 1)</span> ={" "}
        <span className="font-medium text-white">{formatXp(xpPerTrial)} XP</span>
        <span className="text-slate-500"> · members contribute 5% of skill XP earned in 24h</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={99}
          value={level}
          onChange={(e) => setLevel(Math.max(0, Number(e.target.value) || 0))}
          className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save level"}
        </button>
      </div>
      {message && <p className="mt-1 text-xs text-emerald-300">{message}</p>}
    </div>
  );
}
