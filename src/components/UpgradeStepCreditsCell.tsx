"use client";

import { formatCredits } from "@/lib/guild-buildings-data";
import type { SequentialCreditAllocation } from "@/lib/guild-buildings-credits";
import { ItemIcon } from "./ItemIcon";

export function UpgradeStepCreditsCell({
  allocation,
}: {
  allocation: SequentialCreditAllocation;
}) {
  const { deposited, required, ready, isActive } = allocation;

  if (!isActive && deposited <= 0) {
    return (
      <div className="w-max space-y-1">
        <span className="inline-block rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          Queued
        </span>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
          <span className="shrink-0 text-slate-600">○</span>
          <ItemIcon itemId="GuildCredits" size="xs" />
          <span className="text-slate-500">Credits</span>
          <span className="shrink-0 tabular-nums text-slate-600">0/{formatCredits(required)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-max space-y-1">
      <span
        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          ready ? "bg-emerald-900/40 text-emerald-300" : "bg-amber-900/30 text-amber-200"
        }`}
      >
        {ready ? "Ready" : "Saving up"}
      </span>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
        <span className={`shrink-0 ${ready ? "text-emerald-400" : "text-slate-600"}`}>
          {ready ? "✓" : "○"}
        </span>
        <ItemIcon itemId="GuildCredits" size="xs" />
        <span className="text-slate-300">Credits</span>
        <span
          className={`shrink-0 tabular-nums ${ready ? "text-emerald-300" : "text-amber-200/90"}`}
          title={`Current bank applied to this upgrade: ${formatCredits(deposited)} / ${formatCredits(required)}`}
        >
          {formatCredits(deposited)}/{formatCredits(required)}
        </span>
      </div>
    </div>
  );
}
