"use client";

import { SKILLS, TRIAL_BLOCK_STYLES, type Member, type Skill } from "@/lib/constants";
import {
  adequacyClass,
  adequacyLabel,
  type SkillXpCoverage,
} from "@/lib/skill-xp-coverage";
import {
  buildStartAtFromWeekFraction,
  dateFromStartAt,
  formatTimeLabel,
  formatTrialWindowLabel,
  getEffectiveStatus,
  stackTrialWeekSegments,
  trialSegmentInWeek,
} from "@/lib/trial-schedule";
import { SkillIcon } from "./SkillIcon";
import type { SkillCoverageRow } from "@/lib/stats";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { SkillCompletionToggle } from "./SkillCompletionToggle";
import { StatusBadge } from "./StatusBadge";
import type { CellTarget } from "./CellAssignmentModal";
import { GuildEventLegend, GuildEventWeekBar } from "./GuildEventWeekBar";
import { guildEventForSkill } from "@/lib/guild-events";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMELINE_HEIGHT = 56;
const ROW_PAD = 2;
const LANE_GAP = 2;
const BLOCK_HEIGHT = TIMELINE_HEIGHT - ROW_PAD * 2;
const TIMELINE_MIN_WIDTH = 720;
const TIMELINE_MIN_WIDTH_MOBILE = 480;

function timelineHeightForLanes(laneCount: number): number {
  if (laneCount <= 0) return TIMELINE_HEIGHT;
  return ROW_PAD * 2 + laneCount * BLOCK_HEIGHT + (laneCount - 1) * LANE_GAP;
}

function slotTargetFromEvent(
  skill: Skill,
  weekStart: string,
  el: HTMLDivElement,
  clientX: number,
): CellTarget {
  const rect = el.getBoundingClientRect();
  const fraction =
    rect.width > 0 ? Math.max(0, Math.min(0.998, (clientX - rect.left) / rect.width)) : 0;
  const plannedStartAt = buildStartAtFromWeekFraction(weekStart, fraction);
  return {
    skill,
    plannedDate: dateFromStartAt(plannedStartAt),
    plannedStartAt,
  };
}

function WeekTimelineHeader({ weekDays }: { weekDays: string[] }) {
  return (
    <div className="relative h-10 min-w-[480px] border-b border-slate-700/40 sm:min-w-[720px]">
      {weekDays.map((d, i) => (
        <div
          key={d}
          className="absolute top-0 flex h-full flex-col justify-center border-l border-slate-700/50 px-1"
          style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }}
        >
          <span className="text-[10px] font-medium text-slate-400">{DAY_HEADERS[i]}</span>
          <span className="text-[9px] text-slate-600">
            {formatDayLabel(d, true).split(" ").slice(1).join(" ")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WeeklyTimeline({
  weekStart,
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
  weekStart: string;
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
      <div className="space-y-1 border-b border-slate-700/50 px-3 py-2">
        <GuildEventLegend />
        <p className="text-[10px] text-slate-500">
          One timeline per skill: Mon 00:00 → Sun 24:00 · 24h trials span across days · tap to
          assign · drag to move
        </p>
        <p className="text-[10px] text-sky-400/90 sm:hidden">Swipe the timeline horizontally →</p>
      </div>
      <div className="mobile-scroll-x overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm sm:min-w-[940px]">
          <thead>
            <tr className="border-b border-slate-700/60">
              <th className="sticky left-0 z-10 w-24 bg-[#131f36] px-2 py-2 text-left text-xs font-medium text-slate-400 sm:w-44 sm:px-3">
                Skill
              </th>
              <th className="p-0 text-left text-xs font-medium text-slate-400">
                <WeekTimelineHeader weekDays={weekDays} />
              </th>
              <th className="sticky right-0 z-10 w-[4.5rem] bg-[#131f36] px-1 py-2 text-right text-xs font-medium text-slate-500 sm:w-24 sm:px-2">
                <span className="hidden sm:inline">Week done?</span>
                <span className="sm:hidden">Done?</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-700/60 bg-slate-900/20">
              <td className="sticky left-0 z-10 bg-[#131f36] px-2 py-2 align-middle sm:px-3">
                <span className="text-xs font-medium text-slate-300">Guild Events</span>
                <p className="hidden text-[9px] leading-tight text-slate-500 sm:block">48h each</p>
              </td>
              <td className="p-1 align-middle">
                <div className="sm:hidden">
                  <GuildEventWeekBar weekStart={weekStart} minWidth={TIMELINE_MIN_WIDTH_MOBILE} />
                </div>
                <div className="hidden sm:block">
                  <GuildEventWeekBar weekStart={weekStart} minWidth={TIMELINE_MIN_WIDTH} />
                </div>
              </td>
              <td className="sticky right-0 z-10 bg-[#131f36]" />
            </tr>
            {SKILLS.map((skill) => {
              const cov = coverageBySkill.get(skill);
              const xp = xpBySkill.get(skill);
              const rowSignups = signups.filter((s) => s.skill === skill);
              const segments = stackTrialWeekSegments(
                rowSignups
                  .map((signup) => trialSegmentInWeek(signup, weekStart))
                  .filter((seg) => seg !== null),
              );
              const laneCount = segments.length > 0 ? segments[0].laneCount : 1;
              const timelineHeight = timelineHeightForLanes(laneCount);
              const dimmed = cov?.weekState === "complete";
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
                  <td className="sticky left-0 z-10 bg-[#131f36] px-2 py-2 align-middle sm:px-3">
                    <div className="flex items-start gap-1.5 sm:gap-2">
                      <SkillIcon skill={skill} size="lg" />
                      <div className="min-w-0">
                        <span className="hidden text-sm font-medium text-slate-200 sm:inline">{skill}</span>
                        <span className="text-sm font-medium text-slate-200 sm:hidden" title={skill}>
                          {skill.split(" ")[0]}
                        </span>
                        {cov && cov.contributorCount > 0 && (
                          <span className="ml-1 text-[10px] text-slate-500">
                            ({cov.contributorCount})
                          </span>
                        )}
                        {xp && xp.adequacy !== "none" && cov?.weekState !== "complete" && (
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
                  <td className="p-1 align-middle">
                    <div
                      style={{ height: timelineHeight }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDrop(slotTargetFromEvent(skill, weekStart, e.currentTarget, e.clientX));
                      }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-trial-block]")) return;
                        onSlotClick(
                          slotTargetFromEvent(skill, weekStart, e.currentTarget, e.clientX),
                        );
                      }}
                      className={`relative w-full min-w-[480px] cursor-crosshair rounded-md border bg-gradient-to-r from-slate-900/30 to-slate-950/50 transition hover:border-sky-500/40 sm:min-w-[720px] ${
                        dimmed ? "opacity-60" : ""
                      } ${
                        segments.length > 0
                          ? "border-slate-600/80"
                          : "border-dashed border-slate-700/60"
                      }`}
                    >
                      {weekDays.slice(1).map((d, i) => (
                        <div
                          key={d}
                          className="pointer-events-none absolute bottom-0 top-0 border-l border-slate-700/35"
                          style={{ left: `${((i + 1) / 7) * 100}%` }}
                        />
                      ))}
                      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-md">
                        <GuildEventWeekBar
                          weekStart={weekStart}
                          minWidth={TIMELINE_MIN_WIDTH}
                          height={timelineHeight}
                          matchType={guildEventForSkill(skill)}
                          overlay
                        />
                      </div>
                      {segments.map((seg) => {
                        const { signup, plannedStartAt, plannedEndAt, lane } = seg;
                        const topPx = ROW_PAD + lane * (BLOCK_HEIGHT + LANE_GAP);
                        const effective = getEffectiveStatus({
                          ...signup,
                          planned_start_at: plannedStartAt,
                        });
                        const draggable = canDragSignup(signup);
                        const blockClass = TRIAL_BLOCK_STYLES[effective];

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
                              left: `${seg.leftPercent}%`,
                              width: `${seg.widthPercent}%`,
                              top: topPx,
                              height: BLOCK_HEIGHT,
                            }}
                            className={`absolute z-[1] min-w-[2px] cursor-pointer overflow-hidden rounded border px-1 py-0.5 text-left ${blockClass}`}
                            title={formatTrialWindowLabel(plannedStartAt)}
                          >
                            <span className="block truncate text-[9px] font-semibold text-white">
                              {signup.member_name}
                            </span>
                            <span className="block truncate text-[8px] text-slate-300">
                              {formatTimeLabel(plannedStartAt, true)} →{" "}
                              {formatTimeLabel(plannedEndAt.toISOString(), true)}
                            </span>
                            <StatusBadge status={effective} small />
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="sticky right-0 z-10 bg-[#131f36] px-2 py-2 align-middle">
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
