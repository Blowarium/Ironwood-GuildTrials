"use client";

import type { ScheduledUpgrade } from "@/lib/guild-buildings-schedule";
import {
  formatMaterialAmount,
  getUpgradeMaterialsProgress,
  type PlannerMaterialDeposits,
} from "@/lib/guild-buildings-materials";

export function UpgradeStepMaterialsCell({
  step,
  deposits,
  canEdit,
  onDepositChange,
  onMarkReady,
  onClear,
}: {
  step: ScheduledUpgrade;
  deposits: PlannerMaterialDeposits;
  canEdit: boolean;
  onDepositChange?: (stepKey: string, materialId: string, amount: number) => void;
  onMarkReady?: (stepKey: string) => void;
  onClear?: (stepKey: string) => void;
}) {
  const progress = getUpgradeMaterialsProgress(step, deposits);

  if (progress.totalCount === 0) {
    return <span className="text-xs text-slate-600">—</span>;
  }

  return (
    <div className="min-w-[180px] space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            progress.isComplete
              ? "bg-emerald-900/40 text-emerald-300"
              : progress.completeCount > 0
                ? "bg-amber-900/30 text-amber-200"
                : "bg-slate-800 text-slate-400"
          }`}
        >
          {progress.isComplete
            ? "Ready"
            : `${progress.completeCount}/${progress.totalCount} filled`}
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
        {canEdit && onClear && progress.completeCount > 0 && (
          <button
            type="button"
            onClick={() => onClear(progress.stepKey)}
            className="text-[10px] text-slate-500 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {progress.items.map((item) => (
          <li key={item.id} className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`shrink-0 ${item.complete ? "text-emerald-400" : "text-slate-600"}`}
              title={item.complete ? "Filled" : "Not filled"}
            >
              {item.complete ? "✓" : "○"}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-300" title={item.name}>
              {item.name}
            </span>
            {canEdit && onDepositChange ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <input
                  type="number"
                  min={0}
                  max={item.required}
                  value={deposits[progress.stepKey]?.[item.id] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    onDepositChange(progress.stepKey, item.id, Number(e.target.value) || 0)
                  }
                  className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-right text-[10px] text-white"
                />
                <span className="text-[10px] text-slate-500">
                  / {formatMaterialAmount(item.required)}
                </span>
              </div>
            ) : (
              <span
                className={`shrink-0 tabular-nums ${item.complete ? "text-emerald-300" : "text-slate-400"}`}
              >
                {formatMaterialAmount(item.deposited)}/{formatMaterialAmount(item.required)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
