"use client";

import type { Member, Skill } from "@/lib/constants";
import type { GuildStats } from "@/lib/stats";
import {
  adequacyClass,
  adequacyLabel,
  type SkillXpCoverage,
} from "@/lib/skill-xp-coverage";
import { formatXp } from "@/lib/trial-xp";
import { SkillCompletionToggle } from "./SkillCompletionToggle";
import { SkillIcon } from "./SkillIcon";
import { LastEditedNote } from "./LastEditedNote";

function RecapBox({
  title,
  tone,
  skills,
}: {
  title: string;
  tone: "emerald" | "amber";
  skills: Skill[];
}) {
  if (skills.length === 0) return null;
  const styles =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
      : "border-amber-500/30 bg-amber-950/20 text-amber-200";
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${styles}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {skills.map((skill) => (
          <li
            key={skill}
            className="flex items-center gap-0.5 rounded bg-black/20 px-1 py-0.5 text-[10px]"
            title={skill}
          >
            <SkillIcon skill={skill} size="xs" />
            <span className="hidden sm:inline">{skill}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SkillCoverageList({
  stats,
  xpCoverage,
  currentUser,
  togglingSkill,
  onToggleComplete,
}: {
  stats: GuildStats;
  xpCoverage: SkillXpCoverage[];
  currentUser: Member | "";
  togglingSkill: Skill | null;
  onToggleComplete: (skill: Skill, completed: boolean) => void;
}) {
  const xpBySkill = new Map(xpCoverage.map((x) => [x.skill, x]));
  const done = stats.skillCoverage.filter((s) => s.weekState === "complete");
  const needsSignup = stats.skillCoverage.filter((s) => s.weekState === "needs_signup");
  const inProgress = stats.skillCoverage.filter((s) => s.weekState === "in_progress");

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-3">
      <h3 className="text-sm font-semibold text-white">All 16 skills</h3>
      <p className="text-[10px] text-slate-500">Mark done when the guild trial is finished</p>

      <div className="mt-2 space-y-2">
        <RecapBox title={`Done (${done.length})`} tone="emerald" skills={done.map((s) => s.skill)} />
        <RecapBox
          title={`Needs signup (${needsSignup.length})`}
          tone="amber"
          skills={needsSignup.map((s) => s.skill)}
        />
        {inProgress.length > 0 && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">
              In progress ({inProgress.length})
            </p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {inProgress.map(({ skill, contributorCount }) => (
                <li
                  key={skill}
                  className="flex items-center gap-0.5 rounded bg-black/20 px-1 py-0.5 text-[10px] text-sky-200"
                  title={`${skill} — ${contributorCount} signed up`}
                >
                  <SkillIcon skill={skill} size="xs" />
                  <span className="hidden sm:inline">{skill}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
        {stats.skillCoverage.map((row) => {
          const xp = xpBySkill.get(row.skill);
          return (
          <li
            key={row.skill}
            className={`rounded-md border px-2 py-1.5 ${
              row.weekState === "complete"
                ? "border-emerald-500/25 bg-emerald-950/10"
                : row.weekState === "in_progress"
                  ? "border-sky-500/20 bg-sky-950/10"
                  : "border-slate-700/40 bg-slate-900/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <SkillIcon skill={row.skill} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{row.skill}</p>
                <p className="text-[9px] text-slate-500">
                  {row.contributorCount === 0
                    ? "No signups"
                    : `${row.contributorCount} signed up`}
                  {xp && xp.adequacy !== "none" && (
                    <span className={` · ${adequacyClass(xp.adequacy)}`}>
                      {" "}
                      {adequacyLabel(xp.adequacy)}
                      {xp.required > 0 && ` (${formatXp(xp.contributed)}/${formatXp(xp.required)} XP)`}
                    </span>
                  )}
                </p>
                {row.markedBy && row.weekState === "complete" && (
                  <LastEditedNote by={row.markedBy} compact />
                )}
              </div>
              <SkillCompletionToggle
                skill={row.skill}
                weekState={row.weekState}
                contributorCount={row.contributorCount}
                markedBy={row.markedBy}
                compact
                disabled={!currentUser || togglingSkill === row.skill}
                onToggle={(completed) => onToggleComplete(row.skill, completed)}
              />
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
