"use client";

import { useState } from "react";
import { GUILD_BUILDINGS, formatCoins, formatCredits } from "@/lib/guild-buildings-data";
import type { ScenarioComparisonRow } from "@/lib/guild-buildings-schedule";
import { strategyDef, type UpgradeStrategyId } from "@/lib/guild-buildings-strategies";
import { DEFAULT_GUILD_MEMBER_COUNT } from "@/lib/guild-buildings-data";
import { ScenarioStrategyPills } from "./ScenarioStrategyPills";
import { LastEditedNote } from "./LastEditedNote";
import { UpgradeStepMaterialsCell } from "./UpgradeStepMaterialsCell";
import type { Member } from "@/lib/constants";
import type { PlannerMaterialDeposits } from "@/lib/guild-buildings-materials";

export function GuildUpgradePathPanel({
  detailScenario,
  remainingCredits,
  selectedStrategy,
  preferredStrategy,
  onSelectStrategy,
  canSelectStrategy,
  canSetPreferred,
  onSavePreferred,
  preferredUpdatedBy,
  preferredUpdatedAt,
  actorMember,
  showMechanics,
  mechanicsItems,
  materialDeposits,
  canEditMaterials,
  onMaterialDepositChange,
  onMarkStepMaterialsReady,
  onClearStepMaterials,
}: {
  detailScenario: ScenarioComparisonRow;
  remainingCredits: number;
  selectedStrategy: UpgradeStrategyId;
  preferredStrategy: UpgradeStrategyId;
  onSelectStrategy?: (id: UpgradeStrategyId) => void;
  canSelectStrategy: boolean;
  canSetPreferred: boolean;
  onSavePreferred?: () => Promise<void>;
  preferredUpdatedBy?: Member | null;
  preferredUpdatedAt?: string;
  actorMember?: Member;
  showMechanics?: boolean;
  mechanicsItems?: string[];
  materialDeposits?: PlannerMaterialDeposits;
  canEditMaterials?: boolean;
  onMaterialDepositChange?: (stepKey: string, materialId: string, amount: number) => void;
  onMarkStepMaterialsReady?: (stepKey: string) => void;
  onClearStepMaterials?: (stepKey: string) => void;
}) {
  const detailSchedule = detailScenario.schedule;
  const [savingPreferred, setSavingPreferred] = useState(false);
  const [preferredMessage, setPreferredMessage] = useState<string | null>(null);
  const isPreferred = selectedStrategy === preferredStrategy;

  async function handleSavePreferred() {
    if (!onSavePreferred) return;
    setSavingPreferred(true);
    setPreferredMessage(null);
    try {
      await onSavePreferred();
      setPreferredMessage("Guild preferred path saved.");
    } catch (err) {
      setPreferredMessage(err instanceof Error ? err.message : "Could not save preferred path.");
    } finally {
      setSavingPreferred(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4">
      <p className="text-sm font-medium text-sky-200">
        {canSelectStrategy ? "Upgrade order" : "Guild upgrade plan"}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {canSelectStrategy
          ? "Preview strategies below. Save one as the guild's official path — members only see that plan."
          : "Official upgrade path chosen by guild officers."}
      </p>

      {!canSelectStrategy && (
        <div className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
          <p className="text-sm font-medium text-emerald-200">{detailSchedule.strategyName}</p>
          <p className="mt-0.5 text-xs text-slate-400">{detailScenario.strategyDescription}</p>
        </div>
      )}

      {canSelectStrategy && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">
              Guild preferred:
            </span>
            <span className="text-xs font-medium text-emerald-300">
              {strategyDef(preferredStrategy).name}
            </span>
            {preferredUpdatedAt && (
              <LastEditedNote by={preferredUpdatedBy ?? null} at={preferredUpdatedAt} compact />
            )}
          </div>
          <div className="mt-3">
            <ScenarioStrategyPills
              mode="select"
              accent="sky"
              selected={selectedStrategy}
              preferred={preferredStrategy}
              onSelect={onSelectStrategy}
            />
          </div>
          {canSetPreferred && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSavePreferred}
                disabled={savingPreferred || isPreferred}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {savingPreferred
                  ? "Saving…"
                  : isPreferred
                    ? "Current guild preferred path"
                    : "Save as guild preferred path"}
              </button>
              {!isPreferred && actorMember && (
                <span className="text-xs text-slate-500">
                  Saves &quot;{detailSchedule.strategyName}&quot; for all members
                </span>
              )}
            </div>
          )}
          {preferredMessage && (
            <p
              className={`mt-2 text-xs ${preferredMessage.includes("Could not") ? "text-red-300" : "text-emerald-300"}`}
            >
              {preferredMessage}
            </p>
          )}
        </>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-sky-800/30 bg-sky-950/30 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Credits still needed</p>
          <p className="mt-1 text-sm font-semibold text-amber-200">{formatCredits(remainingCredits)}</p>
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

      {canSelectStrategy && (
        <>
          <p className="mt-4 text-sm font-medium text-sky-200">{detailSchedule.strategyName}</p>
          <p className="mt-1 text-xs text-slate-400">{detailScenario.strategyDescription}</p>
        </>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Building</th>
              <th className="py-2 pr-3">Upgrade</th>
              <th className="py-2 pr-3">Cost</th>
              <th className="py-2 pr-3">Materials</th>
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
                <td className="py-2 pr-3 align-top">
                  <UpgradeStepMaterialsCell
                    step={step}
                    deposits={materialDeposits ?? {}}
                    canEdit={canEditMaterials ?? false}
                    onDepositChange={onMaterialDepositChange}
                    onMarkReady={onMarkStepMaterialsReady}
                    onClear={onClearStepMaterials}
                  />
                </td>
                <td className="py-2 pr-3 text-sky-300">{step.date}</td>
                <td className="py-2 text-slate-500">+{Math.round(step.dayOffset)}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showMechanics && mechanicsItems && mechanicsItems.length > 0 && (
        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
            Income & coin mechanics
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
            {mechanicsItems.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
