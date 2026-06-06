"use client";

import { UPGRADE_STRATEGIES, type UpgradeStrategyId } from "@/lib/guild-buildings-schedule";

type Accent = "violet" | "sky";

const accentActive: Record<Accent, string> = {
  violet: "border-violet-600/60 bg-violet-900/30 text-violet-100",
  sky: "border-sky-600/60 bg-sky-900/30 text-sky-100",
};

export function ScenarioStrategyPills({
  mode,
  accent = "violet",
  selected,
  enabled,
  preferred,
  onSelect,
  onToggle,
}: {
  mode: "filter" | "select";
  accent?: Accent;
  selected?: UpgradeStrategyId;
  enabled?: Record<UpgradeStrategyId, boolean>;
  preferred?: UpgradeStrategyId;
  onSelect?: (id: UpgradeStrategyId) => void;
  onToggle?: (id: UpgradeStrategyId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {UPGRADE_STRATEGIES.map((s) => {
        const isActive =
          mode === "select" ? selected === s.id : (enabled?.[s.id] ?? false);
        const isPreferred = mode === "select" && preferred === s.id;
        return (
          <button
            key={s.id}
            type="button"
            title={s.description}
            onClick={() => {
              if (mode === "select") onSelect?.(s.id);
              else onToggle?.(s.id);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              isActive ? accentActive[accent] : "border-slate-700 text-slate-500 hover:border-slate-600"
            } ${isPreferred ? "ring-1 ring-emerald-500/60" : ""}`}
          >
            {s.name}
            {isPreferred ? " ★" : ""}
          </button>
        );
      })}
    </div>
  );
}
