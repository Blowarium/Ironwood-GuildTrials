"use client";

import { useMemo, useState } from "react";
import { GUILD_BUILDING_ORDER, GUILD_BUILDINGS, formatCredits } from "@/lib/guild-buildings-data";
import {
  UPGRADE_STRATEGIES,
  buildScenarioComparison,
  type GuildBuildingLevels,
  type ScenarioComparisonRow,
  type UpgradeStrategyId,
  weeklyIncomeAtDayOffset,
} from "@/lib/guild-buildings-schedule";

function formatWeeks(days: number): string {
  return `${Math.ceil(days / 7)} wk`;
}

function formatMilestone(day: number | null): string {
  if (day === null) return "—";
  if (day <= 0) return "Already max";
  return `+${Math.round(day)}d (${formatWeeks(day)})`;
}

function bestRowIndex(values: (number | null)[], preferLower: boolean): number | null {
  const scored = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);
  if (scored.length === 0) return null;
  scored.sort((a, b) => (preferLower ? a.v - b.v : b.v - a.v));
  return scored[0].i;
}

function MilestoneCell({
  day,
  highlight,
}: {
  day: number | null;
  highlight: "best" | "worst" | null;
}) {
  const className =
    highlight === "best"
      ? "text-emerald-300"
      : highlight === "worst"
        ? "text-amber-300"
        : "text-slate-300";
  return <td className={`py-1.5 pr-2 text-xs ${className}`}>{formatMilestone(day)}</td>;
}

function ScenarioUpgradePath({ row }: { row: ScenarioComparisonRow }) {
  return (
    <details className="rounded-lg border border-slate-700/40 bg-slate-900/30">
      <summary className="cursor-pointer px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/40">
        {row.strategyName} — full upgrade order ({row.schedule.upgrades.length} steps)
      </summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Building</th>
              <th className="py-1 pr-2">Upgrade</th>
              <th className="py-1 pr-2">Cost</th>
              <th className="py-1">Day</th>
            </tr>
          </thead>
          <tbody>
            {row.schedule.upgrades.map((step, idx) => (
              <tr key={`${step.buildingId}-${step.toLevel}-${idx}`} className="border-t border-slate-800/50">
                <td className="py-1 pr-2 text-slate-500">{idx + 1}</td>
                <td className="py-1 pr-2 text-white">{GUILD_BUILDINGS[step.buildingId].name}</td>
                <td className="py-1 pr-2 text-slate-400">
                  Lv.{step.fromLevel} → {step.toLevel}
                </td>
                <td className="py-1 pr-2 text-amber-200">{formatCredits(step.creditCost)}</td>
                <td className="py-1 text-slate-500">+{Math.round(step.dayOffset)}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function GuildBuildingsScenarioCompare({
  levels,
  credits,
}: {
  levels: GuildBuildingLevels;
  credits: number;
}) {
  const [enabled, setEnabled] = useState<Record<UpgradeStrategyId, boolean>>(() =>
    Object.fromEntries(UPGRADE_STRATEGIES.map((s) => [s.id, true])) as Record<
      UpgradeStrategyId,
      boolean
    >,
  );
  const [expandedPaths, setExpandedPaths] = useState(false);

  const scenarios = useMemo(
    () => buildScenarioComparison({ levels, credits }),
    [levels, credits],
  );

  const visible = scenarios.filter((row) => enabled[row.strategy]);

  const completionDays = visible.map((r) => r.schedule.totalDays);
  const fastestIdx = bestRowIndex(completionDays, true);
  const slowestIdx = bestRowIndex(completionDays, false);

  const hallMaxDays = visible.map((r) => r.milestones.allHallsMaxDay);
  const fastestHallsIdx = bestRowIndex(hallMaxDays, true);

  const utilityMaxDays = visible.map((r) => r.milestones.allUtilityMaxDay);
  const fastestUtilityIdx = bestRowIndex(utilityMaxDays, true);

  function toggleStrategy(id: UpgradeStrategyId) {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4 rounded-xl border border-violet-800/40 bg-violet-950/15 p-4">
      <div>
        <h3 className="text-sm font-semibold text-violet-200">Compare upgrade scenarios</h3>
        <p className="mt-1 text-xs text-slate-400">
          Same starting credits and building levels, different priorities. Finishing everything
          later can be worth it if key buildings or credit halls max sooner.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {UPGRADE_STRATEGIES.map((s) => (
          <label
            key={s.id}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              enabled[s.id]
                ? "border-violet-600/60 bg-violet-900/30 text-violet-100"
                : "border-slate-700 text-slate-500"
            }`}
            title={s.description}
          >
            <input
              type="checkbox"
              checked={enabled[s.id]}
              onChange={() => toggleStrategy(s.id)}
              className="sr-only"
            />
            {s.name}
          </label>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">Select at least one scenario to compare.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Scenario</th>
                  <th className="py-2 pr-3">All maxed</th>
                  <th className="py-2 pr-3">Credit halls max</th>
                  <th className="py-2 pr-3">Utility max</th>
                  <th className="py-2 pr-3">Income @ 4 wk</th>
                  <th className="py-2 pr-3">Income @ 8 wk</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, idx) => {
                  const income4 = weeklyIncomeAtDayOffset(
                    levels,
                    row.schedule.upgrades,
                    28,
                  );
                  const income8 = weeklyIncomeAtDayOffset(
                    levels,
                    row.schedule.upgrades,
                    56,
                  );
                  return (
                    <tr key={row.strategy} className="border-b border-slate-800/60 align-top">
                      <td className="py-2 pr-3">
                        <p className="font-medium text-white">{row.strategyName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.strategyDescription}</p>
                      </td>
                      <td
                        className={`py-2 pr-3 text-xs ${
                          idx === fastestIdx
                            ? "text-emerald-300"
                            : idx === slowestIdx
                              ? "text-amber-300"
                              : "text-slate-300"
                        }`}
                      >
                        <p>{row.schedule.completionDate}</p>
                        <p className="text-slate-500">{formatWeeks(row.schedule.totalDays)}</p>
                      </td>
                      <td
                        className={`py-2 pr-3 text-xs ${
                          idx === fastestHallsIdx ? "text-emerald-300" : "text-slate-300"
                        }`}
                      >
                        {formatMilestone(row.milestones.allHallsMaxDay)}
                      </td>
                      <td
                        className={`py-2 pr-3 text-xs ${
                          idx === fastestUtilityIdx ? "text-emerald-300" : "text-slate-300"
                        }`}
                      >
                        {formatMilestone(row.milestones.allUtilityMaxDay)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-sky-300">
                        {formatCredits(income4.total)}/wk
                      </td>
                      <td className="py-2 pr-3 text-xs text-sky-300">
                        {formatCredits(income8.total)}/wk
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              When each building hits max
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-slate-700/50 text-xs text-slate-500">
                    <th className="py-1.5 pr-3">Building</th>
                    {visible.map((row) => (
                      <th key={row.strategy} className="py-1.5 pr-2 font-normal">
                        {row.strategyName.replace(" ", "\u00a0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GUILD_BUILDING_ORDER.map((buildingId) => {
                    const days = visible.map((r) => r.milestones.byBuilding[buildingId]);
                    const best = bestRowIndex(days, true);
                    const worst = bestRowIndex(
                      days.map((d) => (d === null || d <= 0 ? null : d)),
                      false,
                    );
                    return (
                      <tr key={buildingId} className="border-b border-slate-800/40">
                        <td className="py-1.5 pr-3 text-xs text-slate-300">
                          {GUILD_BUILDINGS[buildingId].name}
                        </td>
                        {visible.map((row, colIdx) => (
                          <MilestoneCell
                            key={row.strategy}
                            day={row.milestones.byBuilding[buildingId]}
                            highlight={
                              colIdx === best && days.filter((d) => d !== null && d > 0).length > 1
                                ? "best"
                                : colIdx === worst &&
                                    days.filter((d) => d !== null && d > 0).length > 1
                                  ? "worst"
                                  : null
                            }
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setExpandedPaths((v) => !v)}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              {expandedPaths ? "Hide" : "Show"} full upgrade paths
            </button>
            {expandedPaths && (
              <div className="mt-2 space-y-2">
                {visible.map((row) => (
                  <ScenarioUpgradePath key={row.strategy} row={row} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
