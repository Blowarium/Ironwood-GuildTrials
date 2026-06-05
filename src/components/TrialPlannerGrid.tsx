"use client";

import { SKILLS, type Member, type Skill } from "@/lib/constants";
import { SkillIcon } from "./SkillIcon";
import { buildCellMap, cellKey, type SkillCoverageRow } from "@/lib/stats";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillCompletionToggle } from "./SkillCompletionToggle";
import { StatusBadge } from "./StatusBadge";
import type { CellTarget } from "./CellAssignmentModal";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_NAMES_VISIBLE = 2;

export function TrialPlannerGrid({
  weekDays,
  signups,
  currentUser,
  skillCoverage,
  togglingSkill,
  onToggleSkillComplete,
  onCellClick,
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
  togglingSkill: Skill | null;
  onToggleSkillComplete: (skill: Skill, completed: boolean) => void;
  onCellClick: (target: CellTarget) => void;
  onSignupClick: (signup: TrialSignup) => void;
  onDragStart: (signup: TrialSignup) => void;
  onDrop: (target: CellTarget) => void;
  canDragSignup: (signup: TrialSignup) => boolean;
  canOpenSignup: (signup: TrialSignup) => boolean;
}) {
  const cellMap = buildCellMap(signups);
  const coverageBySkill = new Map(skillCoverage.map((c) => [c.skill, c]));

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#131f36]">
      <table className="w-full min-w-[800px] border-collapse text-sm">
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
                <td className="sticky left-0 z-10 bg-[#131f36] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SkillIcon skill={skill} size="lg" />
                    <div>
                      <span className="font-medium text-slate-200">{skill}</span>
                      {cov && cov.contributorCount > 0 && (
                        <span className="ml-1 text-[10px] text-slate-500">
                          ({cov.contributorCount})
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                {weekDays.map((day) => {
                  const inCell = cellMap.get(cellKey(skill, day)) ?? [];
                  const hasMine = inCell.some((s) => s.member_name === currentUser);
                  const dimmed = cov?.weekState === "complete";
                  return (
                    <td key={day} className="p-0.5 align-top">
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          onDrop({ skill, plannedDate: day });
                        }}
                        className={`flex min-h-[56px] w-full flex-col gap-0.5 rounded-md border p-0.5 transition hover:border-sky-500/50 hover:bg-slate-800/40 ${
                          dimmed ? "opacity-60" : ""
                        } ${
                          inCell.length > 0
                            ? hasMine
                              ? "border-sky-500/30 bg-sky-950/20"
                              : "border-slate-600/80 bg-slate-900/40"
                            : "border-dashed border-slate-700/60 bg-slate-900/20"
                        }`}
                      >
                        {inCell.slice(0, MAX_NAMES_VISIBLE).map((signup) => {
                          const draggable = canDragSignup(signup);
                          return (
                          <button
                            key={signup.id}
                            type="button"
                            draggable={draggable}
                            onDragStart={(e) => {
                              if (!draggable) {
                                e.preventDefault();
                                return;
                              }
                              e.stopPropagation();
                              e.dataTransfer.setData(
                                "application/json",
                                JSON.stringify(signup),
                              );
                              onDragStart(signup);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canOpenSignup(signup)) onSignupClick(signup);
                            }}
                            className={`w-full rounded px-1 py-0.5 text-left ${
                              signup.member_name === currentUser
                                ? "bg-sky-900/50"
                                : "hover:bg-slate-800/80"
                            }`}
                          >
                            <span className="block max-w-full truncate text-[10px] font-medium text-white">
                              {signup.member_name}
                            </span>
                            <StatusBadge status={signup.status} small />
                          </button>
                          );
                        })}
                        {inCell.length > MAX_NAMES_VISIBLE && (
                          <button
                            type="button"
                            onClick={() => onCellClick({ skill, plannedDate: day })}
                            className="text-[10px] text-sky-400 hover:underline"
                          >
                            +{inCell.length - MAX_NAMES_VISIBLE} more
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onCellClick({ skill, plannedDate: day })}
                          className={`mt-auto w-full rounded py-0.5 text-[10px] ${
                            inCell.length === 0
                              ? "text-slate-600 hover:text-slate-400"
                              : "text-slate-500 hover:text-sky-400"
                          }`}
                        >
                          {inCell.length === 0 ? "+" : "Add"}
                        </button>
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
  );
}
