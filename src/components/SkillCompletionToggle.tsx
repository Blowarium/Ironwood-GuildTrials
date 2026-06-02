"use client";

import type { SkillWeekState } from "@/lib/stats";
import type { Skill } from "@/lib/constants";

const STATE_LABELS: Record<SkillWeekState, string> = {
  needs_signup: "Needs signup",
  in_progress: "In progress",
  complete: "Week complete",
};

const STATE_STYLES: Record<SkillWeekState, string> = {
  needs_signup: "border-amber-500/40 text-amber-300",
  in_progress: "border-sky-500/40 text-sky-300",
  complete: "border-emerald-500/40 text-emerald-300 bg-emerald-950/30",
};

export function SkillCompletionToggle({
  skill,
  weekState,
  contributorCount,
  markedBy,
  compact,
  disabled,
  onToggle,
}: {
  skill: Skill;
  weekState: SkillWeekState;
  contributorCount: number;
  markedBy: string | null;
  compact?: boolean;
  disabled?: boolean;
  onToggle: (completed: boolean) => void;
}) {
  const isComplete = weekState === "complete";

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-1"}>
      <label
        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 transition hover:bg-slate-800/60 ${
          STATE_STYLES[weekState]
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        title={`Mark ${skill} trial complete for this week`}
      >
        <input
          type="checkbox"
          checked={isComplete}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-500 accent-emerald-500"
        />
        <span className={`font-medium ${compact ? "text-[10px]" : "text-xs"}`}>
          {isComplete ? "Done" : "Mark done"}
        </span>
      </label>
      {!compact && (
        <p className="text-[10px] text-slate-500">
          {STATE_LABELS[weekState]}
          {contributorCount > 0 && ` · ${contributorCount} signed up`}
          {markedBy && isComplete && ` · by ${markedBy}`}
        </p>
      )}
      {compact && weekState === "in_progress" && (
        <span className="text-[10px] text-sky-400">+more?</span>
      )}
    </div>
  );
}
