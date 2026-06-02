"use client";

import type { Member, Skill } from "@/lib/constants";
import type { GuildStats } from "@/lib/stats";
import { SkillCompletionToggle } from "./SkillCompletionToggle";
import { SkillIcon } from "./SkillIcon";

export function SkillCoverageList({
  stats,
  currentUser,
  togglingSkill,
  onToggleComplete,
}: {
  stats: GuildStats;
  currentUser: Member | "";
  togglingSkill: Skill | null;
  onToggleComplete: (skill: Skill, completed: boolean) => void;
}) {
  const inProgress = stats.skillCoverage.filter((s) => s.weekState === "in_progress");

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
      <h3 className="text-sm font-semibold text-white">All 16 skills</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Goal: every skill has at least one trial each week
      </p>

      {inProgress.length > 0 && (
        <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-950/20 p-2">
          <p className="text-xs font-medium text-sky-300">
            {inProgress.length} in progress — may need another member
          </p>
          <ul className="mt-1 space-y-1">
            {inProgress.map(({ skill, contributorCount }) => (
              <li key={skill} className="flex items-center gap-2 text-xs text-sky-200/90">
                <SkillIcon skill={skill} size="xs" />
                {skill} ({contributorCount} signed up)
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {stats.skillCoverage.map((row) => (
          <li
            key={row.skill}
            className={`rounded-lg border p-2 ${
              row.weekState === "complete"
                ? "border-emerald-500/30 bg-emerald-950/15"
                : row.weekState === "in_progress"
                  ? "border-sky-500/25 bg-sky-950/10"
                  : "border-slate-700/50 bg-slate-900/30"
            }`}
          >
            <div className="flex items-start gap-2">
              <SkillIcon skill={row.skill} size="md" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-200">{row.skill}</p>
                <p className="text-[10px] text-slate-500">
                  {row.contributorCount === 0
                    ? "No signups yet"
                    : `${row.contributorCount} member${row.contributorCount === 1 ? "" : "s"} signed up`}
                </p>
              </div>
            </div>
            <div className="mt-2 pl-8">
              <SkillCompletionToggle
                skill={row.skill}
                weekState={row.weekState}
                contributorCount={row.contributorCount}
                markedBy={row.markedBy}
                disabled={!currentUser || togglingSkill === row.skill}
                onToggle={(completed) => onToggleComplete(row.skill, completed)}
              />
            </div>
          </li>
        ))}
      </ul>

      {stats.skillsCompleted === stats.totalSkills && (
        <p className="mt-3 text-center text-xs font-medium text-emerald-400">
          All 16 skill trials marked complete!
        </p>
      )}
    </div>
  );
}
