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
  skillTitles,
}: {
  title: string;
  tone: "emerald" | "amber" | "sky";
  skills: Skill[];
  skillTitles?: Record<string, string>;
}) {
  const styles =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
      : tone === "sky"
        ? "border-sky-500/30 bg-sky-950/20 text-sky-300"
        : "border-amber-500/30 bg-amber-950/20 text-amber-200";
  const chipText = tone === "sky" ? "text-sky-200" : undefined;

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${styles}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide">{title}</p>
      {skills.length === 0 ? (
        <p className="mt-1 text-[10px] opacity-70">None</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1">
          {skills.map((skill) => (
            <li
              key={skill}
              className={`flex items-center gap-0.5 rounded bg-black/20 px-1 py-0.5 text-[10px] ${chipText ?? ""}`}
              title={skillTitles?.[skill] ?? skill}
            >
              <SkillIcon skill={skill} size="xs" />
              <span className="hidden sm:inline">{skill}</span>
            </li>
          ))}
        </ul>
      )}
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
    <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-3">
      <h3 className="text-xs font-semibold text-white sm:text-sm">Skill status</h3>
      <p className="hidden text-[10px] text-slate-500 sm:block">Mark done when the guild trial is finished</p>

      <div className="mt-1.5 space-y-1 sm:mt-2 sm:space-y-2">
        <RecapBox
          title={`Needs signup (${needsSignup.length})`}
          tone="amber"
          skills={needsSignup.map((s) => s.skill)}
        />
        <RecapBox
          title={`Signed up (${inProgress.length})`}
          tone="sky"
          skills={inProgress.map((s) => s.skill)}
          skillTitles={Object.fromEntries(
            inProgress.map((s) => {
              const active = stats.skillsActiveNow.includes(s.skill);
              const scheduled = stats.skillsScheduledOnly.includes(s.skill);
              const tag = active ? "active now" : scheduled ? "scheduled" : "signed up";
              return [s.skill, `${s.skill} — ${s.contributorCount} signed up · ${tag}`];
            }),
          )}
        />
        <RecapBox
          title={`Done (${done.length})`}
          tone="emerald"
          skills={done.map((s) => s.skill)}
        />
      </div>

      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:mt-3">
        All skills
      </p>
      <ul className="mt-1 grid gap-1 sm:mt-1.5 sm:grid-cols-2 sm:gap-1.5 xl:grid-cols-1">
        {stats.skillCoverage.map((row) => {
          const xp = xpBySkill.get(row.skill);
          return (
          <li
            key={row.skill}
            className={`rounded-md border px-1.5 py-1 sm:px-2 sm:py-1.5 ${
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
                  {xp && xp.adequacy !== "none" && row.weekState !== "complete" && (
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
