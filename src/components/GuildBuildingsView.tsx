"use client";

import { useMemo, useState } from "react";
import type { Member } from "@/lib/constants";
import {
  GUILD_BUILDING_ORDER,
  GUILD_BUILDINGS,
  type GuildBuildingId,
  type GuildBuildingLevels,
  formatCoins,
  formatCredits,
  totalRemainingUpgradeCredits,
  weeklyGuildBankCoins,
  DEFAULT_GUILD_MEMBER_COUNT,
} from "@/lib/guild-buildings-data";
import type { GuildConfig } from "@/lib/guild-config";
import { mergeBuildingLevelsWithConfig } from "@/lib/guild-config";
import {
  buildScenarioComparison,
  DEFAULT_GUILD_BUILDING_LEVELS,
  DEFAULT_GUILD_CREDITS,
  eventsPerWeek,
  type UpgradeStrategyId,
  weeklyCreditIncome,
} from "@/lib/guild-buildings-schedule";
import { formatDailyResetLabel } from "@/lib/guild-reset";
import { GuildCreditHallSettings } from "./GuildCreditHallSettings";
import { GuildBuildingsScenarioCompare } from "./GuildBuildingsScenarioCompare";
import { ScenarioStrategyPills } from "./ScenarioStrategyPills";

const STORAGE_KEY = "ironwood-guild-buildings-state";

const CREDIT_HALL_IDS: GuildBuildingId[] = ["GuildHall", "GuildEventHall", "GuildTrialHall"];

function loadLocalBuildingLevels(): GuildBuildingLevels {
  if (typeof window === "undefined") return DEFAULT_GUILD_BUILDING_LEVELS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GUILD_BUILDING_LEVELS;
    const parsed = JSON.parse(raw) as { levels: GuildBuildingLevels };
    return { ...DEFAULT_GUILD_BUILDING_LEVELS, ...parsed.levels };
  } catch {
    return DEFAULT_GUILD_BUILDING_LEVELS;
  }
}

function loadLocalCredits(): number {
  if (typeof window === "undefined") return DEFAULT_GUILD_CREDITS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GUILD_CREDITS;
    const parsed = JSON.parse(raw) as { credits: number };
    return Number(parsed.credits) || DEFAULT_GUILD_CREDITS;
  } catch {
    return DEFAULT_GUILD_CREDITS;
  }
}

function stripCreditHalls(levels: GuildBuildingLevels): Partial<GuildBuildingLevels> {
  const copy = { ...levels };
  for (const id of CREDIT_HALL_IDS) delete copy[id];
  return copy;
}

function IncomeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-200">{formatCredits(value)}/wk</span>
    </div>
  );
}

export function GuildBuildingsView({
  guildConfig,
  currentUser,
  canEditHalls,
  onGuildConfigSaved,
}: {
  guildConfig: GuildConfig | null;
  currentUser: Member;
  canEditHalls: boolean;
  onGuildConfigSaved: (config: GuildConfig) => void;
}) {
  const [localLevels, setLocalLevels] = useState<GuildBuildingLevels>(loadLocalBuildingLevels);
  const [credits, setCredits] = useState(loadLocalCredits);
  const [detailStrategy, setDetailStrategy] = useState<UpgradeStrategyId>("max_income");

  const levels = useMemo(
    () => mergeBuildingLevelsWithConfig(localLevels, guildConfig),
    [localLevels, guildConfig],
  );

  const scenarios = useMemo(
    () => buildScenarioComparison({ levels, credits }),
    [levels, credits],
  );

  const detailScenario = useMemo(
    () => scenarios.find((row) => row.strategy === detailStrategy) ?? scenarios[0],
    [scenarios, detailStrategy],
  );

  const detailSchedule = detailScenario.schedule;

  const incomeNow = useMemo(() => weeklyCreditIncome(levels), [levels]);
  const bankCoinsNow = useMemo(() => weeklyGuildBankCoins(levels.GuildBank), [levels.GuildBank]);
  const remainingCredits = useMemo(() => totalRemainingUpgradeCredits(levels), [levels]);

  function updateLevel(id: GuildBuildingId, value: number) {
    if (CREDIT_HALL_IDS.includes(id)) return;
    setLocalLevels((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(8, Math.floor(value) || 0)),
    }));
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ levels: stripCreditHalls(localLevels), credits }),
    );
  }

  function resetDefaults() {
    setLocalLevels(DEFAULT_GUILD_BUILDING_LEVELS);
    setCredits(DEFAULT_GUILD_CREDITS);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
        <h2 className="text-base font-semibold text-white">Guild Buildings — Credit Planner</h2>
        <p className="mt-1 text-sm text-slate-400">
          Optimal upgrade path to max all buildings, assuming full daily quests, events, and
          trials. Credit formulas from in-game guild building mechanics.
        </p>
      </div>

      <GuildCreditHallSettings
        config={guildConfig}
        actorMember={currentUser}
        canEdit={canEditHalls}
        onSaved={onGuildConfigSaved}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-white">Current buildings</p>
            {canEditHalls && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveState}
                  className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-600"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Reset to alliance defaults
                </button>
              </div>
            )}
          </div>
          {!canEditHalls && (
            <p className="mb-3 text-xs text-slate-500">
              Only Guild Leaders and Officers can edit building levels and guild credits.
            </p>
          )}

          <div className="mb-4">
            <label className="text-xs text-slate-400">Guild credits in bank</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={credits}
                disabled={!canEditHalls}
                onChange={(e) => setCredits(Math.max(0, Number(e.target.value) || 0))}
                className="w-32 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {GUILD_BUILDING_ORDER.map((id) => {
              const def = GUILD_BUILDINGS[id];
              const lv = levels[id];
              const maxed = lv >= def.maxLevel;
              const fromConfig = CREDIT_HALL_IDS.includes(id);
              return (
                <label
                  key={id}
                  className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2"
                >
                  <span className="text-sm text-slate-200">
                    {def.name}
                    {fromConfig && (
                      <span className="ml-1 text-xs text-slate-500">(officer setting)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={def.maxLevel}
                      value={lv}
                      disabled={!canEditHalls || fromConfig || (maxed && id === "GuildHall")}
                      onChange={(e) => updateLevel(id, Number(e.target.value))}
                      className="w-14 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-right text-sm text-white disabled:opacity-50"
                    />
                    <span className="text-xs text-slate-500">/ {def.maxLevel}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
            <p className="text-sm font-medium text-white">Weekly income (now)</p>
            <div className="mt-2 space-y-1">
              <IncomeRow label="Daily quests" value={incomeNow.dailyQuests} />
              <IncomeRow
                label={`Events (~${eventsPerWeek()} active/wk)`}
                value={incomeNow.events}
              />
              <IncomeRow label="Trials (16 skills)" value={incomeNow.trials} />
              <div className="border-t border-slate-700/50 pt-1">
                <IncomeRow label="Total credits" value={incomeNow.total} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/15 p-4">
            <p className="text-sm font-medium text-yellow-100">Guild Bank coins (now)</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {DEFAULT_GUILD_MEMBER_COUNT} members × level × 1,000 × 13 / day
            </p>
            <p className="mt-2 text-lg font-semibold text-yellow-200">
              {formatCoins(bankCoinsNow)}/wk
            </p>
            <p className="text-xs text-slate-500">Paid to players, not Guild Credits</p>
          </div>
        </div>
      </div>

      <GuildBuildingsScenarioCompare levels={levels} scenarios={scenarios} />

      <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4">
        <p className="text-sm font-medium text-sky-200">Upgrade order</p>
        <p className="mt-1 text-xs text-slate-400">
          Pick a strategy to see its timeline, upgrade steps, credit income, and Guild Bank coin
          payouts.
        </p>
        <div className="mt-3">
          <ScenarioStrategyPills
            mode="select"
            accent="sky"
            selected={detailStrategy}
            onSelect={setDetailStrategy}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-sky-800/30 bg-sky-950/30 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Credits still needed</p>
            <p className="mt-1 text-sm font-semibold text-amber-200">
              {formatCredits(remainingCredits)}
            </p>
          </div>
          <div className="rounded-lg border border-sky-800/30 bg-sky-950/30 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Weeks to max all</p>
            <p className="mt-1 text-sm font-semibold text-white">
              ~{Math.ceil(detailSchedule.totalDays / 7)} weeks
            </p>
          </div>
          <div className="rounded-lg border border-sky-800/30 bg-sky-950/30 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">All maxed by</p>
            <p className="mt-1 text-sm font-semibold text-sky-300">{detailSchedule.completionDate}</p>
          </div>
          <div className="rounded-lg border border-sky-800/30 bg-sky-950/30 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Weekly credits after</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">
              {formatCredits(detailSchedule.weeklyIncomeAtEnd.total)}/wk
            </p>
          </div>
          <div className="rounded-lg border border-yellow-800/30 bg-yellow-950/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Bank coins (path)</p>
            <p className="mt-1 text-sm font-semibold text-yellow-200">
              {formatCoins(detailSchedule.totalBankCoinsOnPath)}
            </p>
            <p className="text-[11px] text-slate-500">{DEFAULT_GUILD_MEMBER_COUNT} members total</p>
          </div>
          <div className="rounded-lg border border-yellow-800/30 bg-yellow-950/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Weekly bank coins after</p>
            <p className="mt-1 text-sm font-semibold text-yellow-200">
              {formatCoins(detailSchedule.weeklyBankCoinsAtEnd)}/wk
            </p>
            <p className="text-[11px] text-slate-500">
              up from {formatCoins(detailSchedule.weeklyBankCoinsAtStart)}/wk
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm font-medium text-sky-200">{detailSchedule.strategyName}</p>
        <p className="mt-1 text-xs text-slate-400">{detailScenario.strategyDescription}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Building</th>
                <th className="py-2 pr-3">Upgrade</th>
                <th className="py-2 pr-3">Cost</th>
                <th className="py-2 pr-3">Target date</th>
                <th className="py-2">Day</th>
              </tr>
            </thead>
            <tbody>
              {detailSchedule.upgrades.map((step, idx) => (
                <tr key={`${step.buildingId}-${step.toLevel}-${idx}`} className="border-b border-slate-800/60">
                  <td className="py-2 pr-3 text-slate-500">{idx + 1}</td>
                  <td className="py-2 pr-3 text-white">{GUILD_BUILDINGS[step.buildingId].name}</td>
                  <td className="py-2 pr-3 text-slate-300">
                    Lv.{step.fromLevel} → Lv.{step.toLevel}
                  </td>
                  <td className="py-2 pr-3 text-amber-200">{formatCredits(step.creditCost)}</td>
                  <td className="py-2 pr-3 text-sky-300">{step.date}</td>
                  <td className="py-2 text-slate-500">+{Math.round(step.dayOffset)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Income & coin mechanics
        </summary>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-slate-400">
          <li>
            Guild credits — daily quests: Guild Hall level × 20 × 13 — paid at{" "}
            {formatDailyResetLabel()}
          </li>
          <li>
            Guild credits — events: Event Hall level × 400 per completed event (~
            {eventsPerWeek()}/wk active)
          </li>
          <li>
            Guild credits — trials: Trial Hall level × 50 × 16 per week — Mon{" "}
            {formatDailyResetLabel()}
          </li>
          <li>
            Player coins — Guild Bank: level × 1,000 × 13 per member per day (
            {DEFAULT_GUILD_MEMBER_COUNT} members each receive the full amount)
          </li>
          <li>Upgrade costs (credits): 100 → 1k → 5k → 10k → 25k → 50k → 100k → 150k</li>
          {detailSchedule.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
