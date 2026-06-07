"use client";

import { formatCoins } from "@/lib/guild-buildings-data";
import {
  getUpgradeCoinsProgress,
  type PlannerCoinDeposits,
} from "@/lib/guild-buildings-coins";
import type { ScheduledUpgrade } from "@/lib/guild-buildings-schedule";

export function UpgradeStepCoinsCell({
  step,
  deposits,
  canEdit,
  onDepositChange,
  onMarkReady,
  onClear,
}: {
  step: ScheduledUpgrade;
  deposits: PlannerCoinDeposits;
  canEdit: boolean;
  onDepositChange?: (stepKey: string, amount: number) => void;
  onMarkReady?: (stepKey: string) => void;
  onClear?: (stepKey: string) => void;
}) {
  const progress = getUpgradeCoinsProgress(step, deposits);

  if (!progress) {
    return <span className="text-xs text-slate-600">—</span>;
  }

  return (
    <div className="min-w-0 space-y-1 sm:min-w-[140px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            progress.isComplete
              ? "bg-emerald-900/40 text-emerald-300"
              : progress.deposited > 0
                ? "bg-amber-900/30 text-amber-200"
                : "bg-slate-800 text-slate-400"
          }`}
        >
          {progress.isComplete ? "Ready" : "Not ready"}
        </span>
        {canEdit && onMarkReady && !progress.isComplete && (
          <button
            type="button"
            onClick={() => onMarkReady(progress.stepKey)}
            className="text-[10px] text-sky-400 hover:underline"
          >
            Mark ready
          </button>
        )}
        {canEdit && onClear && progress.deposited > 0 && (
          <button
            type="button"
            onClick={() => onClear(progress.stepKey)}
            className="text-[10px] text-slate-500 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span
          className={`shrink-0 ${progress.isComplete ? "text-emerald-400" : "text-slate-600"}`}
        >
          {progress.isComplete ? "✓" : "○"}
        </span>
        <span className="text-slate-300">Guild coins</span>
        {canEdit && onDepositChange ? (
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <input
              type="number"
              min={0}
              max={progress.required}
              value={deposits[progress.stepKey] ?? ""}
              placeholder="0"
              onChange={(e) =>
                onDepositChange(progress.stepKey, Number(e.target.value) || 0)
              }
              className="w-20 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right text-[10px] text-white"
            />
            <span className="text-[10px] text-slate-500">/ {formatCoins(progress.required)}</span>
          </div>
        ) : (
          <span
            className={`ml-auto shrink-0 tabular-nums ${
              progress.isComplete ? "text-emerald-300" : "text-yellow-200/90"
            }`}
          >
            {formatCoins(progress.deposited)}/{formatCoins(progress.required)}
          </span>
        )}
      </div>
    </div>
  );
}
