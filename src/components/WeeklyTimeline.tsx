"use client";

import { SKILLS, type Member, type Skill } from "@/lib/constants";
import {
  adequacyClass,
  adequacyLabel,
  type SkillXpCoverage,
} from "@/lib/skill-xp-coverage";
import {
  formatTimeLabel,
  getEffectiveStatus,
  heightPercentInStartDay,
  startPercentInDay,
} from "@/lib/trial-schedule";
import { SkillIcon } from "./SkillIcon";
import type { SkillCoverageRow } from "@/lib/stats";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillCompletionToggle } from "./SkillCompletionToggle";
import { StatusBadge } from "./StatusBadge";
import type { CellTarget } from "./CellAssignmentModal";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BAR_HEIGHT = 128;

function clickToTarget(
  skill: Skill,
  day: string,
  e: React.MouseEvent<HTMLDivElement>,
): CellTarget {
  const rect = e.currentTarget.getBoundingClientRect();
  const fraction = (e.clientY - rect.top) / rect.height;
  const clamped = Math.max(0, Math.min(0.98, fraction));
  return { skill, plannedDate: day, dayFraction: clamped };
}

export function WeeklyTimeline({
  weekDays,
  signups,
  currentUser,
  skillCoverage,
  xpCoverage,
  togglingSkill,
  onToggleSkillComplete,
  onSlotClick,
  onSignupClick,
  onDragStart,
  onDrop,
  canDragSignup,
  canOpenSignup,
}: {
  weekDays: string[];
  signups: TrialSignup[];
  currentUser: Member | "";
  skillCoverage: SkillCoverageRow[];
  xpCoverage: SkillXpCoverage[];
  togglingSkill: Skill | null;
  onToggleSkillComplete: (skill: Skill, completed: boolean) => void;
  onSlotClick: (target: CellTarget) => void;
  onSignupClick: (signup: TrialSignup) => void;
  onDragStart: (signup: TrialSignup) => void;
  onDrop: (target: CellTarget) => void;
  canDragSignup: (signup: TrialSignup) => boolean;
  canOpenSignup: (signup: TrialSignup) => boolean;
}) {
  const coverageBySkill = new Map(skillCoverage.map((c) => [c.skill, c]));
  const xpBySkill = new Map(xpCoverage.map((c) => [c.skill, c]));

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36]">
      <p className="border-b border-slate-700/50 px-3 py-2 text-[10px] text-slate-500">
        Each column is one day (24h). Click a time slot to assign · trials auto-update to Active /
        Completed
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-700/60">
              <th className="sticky left-0 z-10 bg-[#131f36] px-3 py-2 text-left text-xs font-medium text-slate-400">
                Skill
              </th>
              {weekDays.map((d, i) => (
                <th
                  key={d}
                  className="px-1 py-2 text-center text-xs font-medium text-slate-400"
                >
                  {DAY_HEADERS[i]}
                  <span className="block text-[10px] font-normal text-slate-600">
                    {formatDayLabel(d, true).split(" ").slice(1).join(" ")}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-xs font-medium text-slate-500">
                Week done?
              </th>
            </tr>
          </thead>
          <tbody>
            {SKILLS.map((skill) => {
              const cov = coverageBySkill.get(skill);
              const xp = xpBySkill.get(skill);
              const rowSignups = signups.filter((s) => s.skill === skill);
              const rowClass =
                cov?.weekState === "complete"
                  ? "bg-emerald-950/10"
                  : cov?.weekState === "in_progress"
                    ? "bg-sky-950/10"
                    : cov?.weekState === "needs_signup"
                      ? "bg-amber-950/10"
                      : "";

              return (
                <tr key={skill} className={`border-b border-slate-800/50 ${rowClass}`}>
                  <td className="sticky left-0 z-10 bg-[#131f36] px-3 py-2 align-top">
                    <div className="flex items-start gap-2">
                      <SkillIcon skill={skill} size="lg" />
                      <div className="min-w-0">
                        <span className="font-medium text-slate-200">{skill}</span>
                        {cov && cov.contributorCount > 0 && (
                          <span className="ml-1 text-[10px] text-slate-500">
                            ({cov.contributorCount})
                          </span>
                        )}
                        {xp && xp.adequacy !== "none" && (
                          <p className={`mt-0.5 text-[9px] leading-tight ${adequacyClass(xp.adequacy)}`}>
                            {adequacyLabel(xp.adequacy)}
                            {xp.adequacy !== "unknown" && (
                              <span className="text-slate-500">
                                {" "}
                                · {xp.percent}% XP
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const inDay = rowSignups.filter((s) => s.planned_date === day);
                    const dimmed = cov?.weekState === "complete";
                    return (
                      <td key={day} className="p-0.5 align-top">
                        <div
                          style={{ height: BAR_HEIGHT }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            onDrop(clickToTarget(skill, day, e));
                          }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest("[data-trial-block]")) return;
                            onSlotClick(clickToTarget(skill, day, e));
                          }}
                          className={`relative w-full cursor-crosshair rounded-md border bg-gradient-to-b from-slate-900/30 to-slate-950/50 transition hover:border-sky-500/40 ${
                            dimmed ? "opacity-60" : ""
                          } ${
                            inDay.length > 0
                              ? "border-slate-600/80"
                              : "border-dashed border-slate-700/60"
                          }`}
                        >
                          {[0, 6, 12, 18].map((h) => (
                            <div
                              key={h}
                              className="pointer-events-none absolute left-0 right-0 border-t border-slate-700/30"
                              style={{ top: `${(h / 24) * 100}%` }}
                            />
                          ))}
                          {inDay.map((signup) => {
                            const top = startPercentInDay(signup.planned_start_at);
                            const height = heightPercentInStartDay(signup.planned_start_at);
                            const effective = getEffectiveStatus(signup);
                            const draggable = canDragSignup(signup);
                            return (
                              <button
                                key={signup.id}
                                type="button"
                                data-trial-block
                                draggable={draggable}
                                onDragStart={(ev) => {
                                  if (!draggable) {
                                    ev.preventDefault();
                                    return;
                                  }
                                  ev.stopPropagation();
                                  onDragStart(signup);
                                }}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (canOpenSignup(signup)) onSignupClick(signup);
                                }}
                                style={{
                                  top: `${top}%`,
                                  height: `${height}%`,
                                }}
                                className={`absolute left-0.5 right-0.5 z-[1] overflow-hidden rounded border px-0.5 py-0.5 text-left ${
                                  signup.member_name === currentUser
                                    ? "border-sky-400/60 bg-sky-900/70"
                                    : "border-orange-500/40 bg-orange-950/50 hover:bg-orange-950/70"
                                }`}
                                title={`${signup.member_name} · ${formatTimeLabel(signup.planned_start_at)}`}
                              >
                                <span className="block truncate text-[9px] font-semibold text-white">
                                  {signup.member_name}
                                </span>
                                <span className="block text-[8px] text-slate-300">
                                  {formatTimeLabel(signup.planned_start_at, true)}
                                </span>
                                <StatusBadge status={effective} small />
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 align-top">
                    {cov && (
                      <SkillCompletionToggle
                        skill={skill}
                        weekState={cov.weekState}
                        contributorCount={cov.contributorCount}
                        markedBy={cov.markedBy}
                        compact
                        disabled={!currentUser || togglingSkill === skill}
                        onToggle={(completed) => onToggleSkillComplete(skill, completed)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
