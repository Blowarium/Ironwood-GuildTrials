"use client";

import { formatCredits } from "@/lib/guild-buildings-data";
import type { ScheduledUpgrade } from "@/lib/guild-buildings-schedule";

export function UpgradeStepCreditsCell({ step }: { step: ScheduledUpgrade }) {
  const ready = step.creditsBefore >= step.creditCost;

  return (
    <div className="min-w-0 space-y-1 sm:min-w-[120px]">
      <span
        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          ready ? "bg-emerald-900/40 text-emerald-300" : "bg-amber-900/30 text-amber-200"
        }`}
      >
        {ready ? "Ready" : "Saving up"}
      </span>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className={`shrink-0 ${ready ? "text-emerald-400" : "text-slate-600"}`}>
          {ready ? "✓" : "○"}
        </span>
        <span className="text-slate-300">Guild credits</span>
        <span
          className={`ml-auto shrink-0 tabular-nums ${
            ready ? "text-emerald-300" : "text-amber-200/90"
          }`}
          title={`Projected bank at upgrade date: ${formatCredits(step.creditsBefore)} · cost ${formatCredits(step.creditCost)}`}
        >
          {formatCredits(step.creditsBefore)}/{formatCredits(step.creditCost)}
        </span>
      </div>
    </div>
  );
}
