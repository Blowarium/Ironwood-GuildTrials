"use client";

import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
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
import { WeekNowLine } from "./WeekNowLine";
import { guildEventForSkill } from "@/lib/guild-events";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DESKTOP_TIMELINE_HEIGHT = 56;
const ROW_PAD = 2;
const LANE_GAP = 2;
const DESKTOP_BLOCK_HEIGHT = DESKTOP_TIMELINE_HEIGHT - ROW_PAD * 2;
const TIMELINE_MIN_WIDTH = 720;
const MOBILE_TRACK_PAD = 2;
const MOBILE_LANE_GAP = 1;
const MOBILE_BLOCK_HEIGHT = 22;

function mobileTrackHeightForLanes(laneCount: number): number {
  if (laneCount <= 0) return MOBILE_BLOCK_HEIGHT + MOBILE_TRACK_PAD * 2;
  return (
    MOBILE_TRACK_PAD * 2 +
    laneCount * MOBILE_BLOCK_HEIGHT +
    (laneCount - 1) * MOBILE_LANE_GAP
  );
}

function DayColumnGuides({ weekDays }: { weekDays: string[] }) {
  return weekDays.slice(1).map((d, i) => (
    <div
      key={d}
      className="pointer-events-none absolute inset-y-0 border-l border-slate-700/35"
      style={{ left: `${((i + 1) / 7) * 100}%` }}
    />
  ));
}

function MobileSkillWeekTrack({
  skill,
  weekStart,
  weekDays,
  rowSignups,
  eventType,
  onSlotClick,
  onSignupClick,
  canOpenSignup,
}: {
  skill: Skill;
  weekStart: string;
  weekDays: string[];
  rowSignups: TrialSignup[];
  eventType: ReturnType<typeof guildEventForSkill>;
  onSlotClick: (target: CellTarget) => void;
  onSignupClick: (signup: TrialSignup) => void;
  canOpenSignup: (signup: TrialSignup) => boolean;
}) {
  const segments = stackTrialWeekSegments(
    rowSignups
      .map((signup) => trialSegmentInWeek(signup, weekStart))
      .filter((seg) => seg !== null),
  );
  const laneCount = segments.length > 0 ? segments[0].laneCount : 1;
  const trackHeight = mobileTrackHeightForLanes(laneCount);

  return (
    <div className="mt-1.5 overflow-hidden rounded border border-slate-700/40">
      <div className="relative h-5 border-b border-slate-700/30 bg-slate-950/40">
        <DayColumnGuides weekDays={weekDays} />
        <WeekNowLine weekStart={weekStart} />
        <GuildEventWeekBar weekStart={weekStart} height={20} matchType={eventType} overlay />
      </div>

      <div
        style={{ height: trackHeight }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-trial-block]")) return;
          onSlotClick(slotTargetFromEvent(skill, weekStart, e.currentTarget, e.clientX));
        }}
        className={`relative cursor-crosshair bg-gradient-to-r from-slate-900/30 to-slate-950/50 ${
          segments.length > 0
            ? "border-b border-slate-700/30"
            : "border-b border-dashed border-slate-700/40"
        }`}
      >
        <DayColumnGuides weekDays={weekDays} />
        <WeekNowLine weekStart={weekStart} />
        {segments.map((seg) => {
          const { signup, plannedStartAt, plannedEndAt, lane } = seg;
          const topPx = MOBILE_TRACK_PAD + lane * (MOBILE_BLOCK_HEIGHT + MOBILE_LANE_GAP);
          const effective = getEffectiveStatus({
            ...signup,
            planned_start_at: plannedStartAt,
          });
          const blockClass = TRIAL_BLOCK_STYLES[effective];
          const narrow = seg.widthPercent < 12;

          return (
            <button
              key={signup.id}
              type="button"
              data-trial-block
              disabled={!canOpenSignup(signup)}
              onClick={(ev) => {
                ev.stopPropagation();
                onSignupClick(signup);
              }}
              style={{
                left: `${seg.leftPercent}%`,
                width: `${seg.widthPercent}%`,
                top: topPx,
                height: MOBILE_BLOCK_HEIGHT,
              }}
              className={`absolute z-[1] min-w-[2px] overflow-hidden rounded border px-0.5 py-px text-left ${blockClass} disabled:opacity-70`}
              title={formatTrialWindowLabel(plannedStartAt)}
            >
              <span className="block truncate text-[8px] font-semibold leading-tight text-white">
                {narrow ? signup.member_name.split(" ")[0] : signup.member_name}
              </span>
              {!narrow && (
                <span className="block truncate text-[7px] leading-tight text-slate-300">
                  {formatTimeLabel(plannedStartAt, true)} →{" "}
                  {formatTimeLabel(plannedEndAt.toISOString(), true)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-7">
        {weekDays.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => onSlotClick(slotTargetForDay(skill, weekStart, i, d))}
            className="border-l border-slate-700/35 py-1 text-[9px] font-medium text-slate-400 first:border-l-0 hover:bg-sky-950/30 hover:text-sky-300"
            title={`Schedule on ${DAY_HEADERS[i]}`}
          >
            {DAY_HEADERS[i].charAt(0)}
          </button>
        ))}
      </div>
    </div>
  );
}

function timelineHeightForLanes(laneCount: number): number {
  if (laneCount <= 0) return DESKTOP_TIMELINE_HEIGHT;
  return ROW_PAD * 2 + laneCount * DESKTOP_BLOCK_HEIGHT + (laneCount - 1) * LANE_GAP;
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

function slotTargetForDay(
  skill: Skill,
  weekStart: string,
  dayIndex: number,
  plannedDate: string,
): CellTarget {
  const plannedStartAt = buildStartAtFromWeekFraction(weekStart, dayIndex / 7 + 1 / 14);
  return { skill, plannedDate, plannedStartAt };
}

function skillRowClass(weekState: SkillCoverageRow["weekState"] | undefined): string {
  if (weekState === "complete") return "bg-emerald-950/10";
  if (weekState === "in_progress") return "bg-sky-950/10";
  if (weekState === "needs_signup") return "bg-amber-950/10";
  return "";
}

function WeekTimelineHeader({
  weekDays,
  weekStart,
}: {
  weekDays: string[];
  weekStart: string;
}) {
  return (
    <div className="relative h-9 w-full">
      <WeekNowLine weekStart={weekStart} />
      {weekDays.slice(1).map((d, i) => (
        <div
          key={d}
          className="pointer-events-none absolute inset-y-0 border-l border-slate-700/35"
          style={{ left: `${((i + 1) / 7) * 100}%` }}
        />
      ))}
      {weekDays.map((d, i) => (
        <div
          key={`label-${d}`}
          className="absolute top-0 flex h-full flex-col justify-center px-1"
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

function TimelineTrackShell({
  children,
  className = "border-slate-700/50",
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "style" | "children">) {
  return (
    <div
      style={style}
      className={`relative w-full min-w-[720px] rounded-md border ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function MobileWeeklyTimeline({
  weekStart,
  weekDays,
  signups,
  skillCoverage,
  xpCoverage,
  togglingSkill,
  currentUser,
  onToggleSkillComplete,
  onSlotClick,
  onSignupClick,
  canOpenSignup,
}: {
  weekStart: string;
  weekDays: string[];
  signups: TrialSignup[];
  skillCoverage: SkillCoverageRow[];
  xpCoverage: SkillXpCoverage[];
  togglingSkill: Skill | null;
  currentUser: Member | "";
  onToggleSkillComplete: (skill: Skill, completed: boolean) => void;
  onSlotClick: (target: CellTarget) => void;
  onSignupClick: (signup: TrialSignup) => void;
  canOpenSignup: (signup: TrialSignup) => boolean;
}) {
  const coverageBySkill = new Map(skillCoverage.map((c) => [c.skill, c]));
  const xpBySkill = new Map(xpCoverage.map((c) => [c.skill, c]));

  return (
    <div className="divide-y divide-slate-800/60">
      <div className="mobile-panel space-y-1">
        <GuildEventLegend />
        <div className="relative h-6 overflow-hidden rounded border border-slate-700/40 bg-slate-950/40">
          <DayColumnGuides weekDays={weekDays} />
          <WeekNowLine weekStart={weekStart} />
          <GuildEventWeekBar weekStart={weekStart} height={24} />
        </div>
      </div>
      {SKILLS.map((skill) => {
        const cov = coverageBySkill.get(skill);
        const xp = xpBySkill.get(skill);
        const rowSignups = signups.filter((s) => s.skill === skill);
        const eventType = guildEventForSkill(skill);

        return (
          <div
            key={skill}
            className={`mobile-panel ${skillRowClass(cov?.weekState)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <SkillIcon skill={skill} size="xs" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">{skill}</p>
                  <p className="text-[10px] text-slate-500">
                    {cov && cov.contributorCount > 0
                      ? `${cov.contributorCount} signed up`
                      : "No signups"}
                    {xp && xp.adequacy !== "none" && cov?.weekState !== "complete" && (
                      <span className={adequacyClass(xp.adequacy)}>
                        {" "}
                        · {adequacyLabel(xp.adequacy)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
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
            </div>

            <MobileSkillWeekTrack
              skill={skill}
              weekStart={weekStart}
              weekDays={weekDays}
              rowSignups={rowSignups}
              eventType={eventType}
              onSlotClick={onSlotClick}
              onSignupClick={onSignupClick}
              canOpenSignup={canOpenSignup}
            />
          </div>
        );
      })}
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
    <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-[#131f36]">
      <div className="space-y-0.5 border-b border-slate-700/50 px-2 py-1 sm:space-y-1 sm:px-3 sm:py-2">
        <div className="hidden sm:block">
          <GuildEventLegend />
        </div>
        <p className="hidden text-[10px] text-slate-500 sm:block">
          One timeline per skill: Mon 00:00 → Sun 24:00 · 24h trials span across days · tap to
          assign · drag to move
        </p>
        <p className="text-[10px] text-sky-400/90 sm:hidden">
          Tap track or day to schedule · tap a trial block to edit
        </p>
      </div>

      <div className="md:hidden">
        <MobileWeeklyTimeline
          weekStart={weekStart}
          weekDays={weekDays}
          signups={signups}
          skillCoverage={skillCoverage}
          xpCoverage={xpCoverage}
          togglingSkill={togglingSkill}
          currentUser={currentUser}
          onToggleSkillComplete={onToggleSkillComplete}
          onSlotClick={onSlotClick}
          onSignupClick={onSignupClick}
          canOpenSignup={canOpenSignup}
        />
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-44" />
            <col />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-700/60">
              <th className="sticky left-0 z-10 bg-[#131f36] px-3 py-2 text-left text-xs font-medium text-slate-400">
                Skill
              </th>
              <th className="p-1 align-middle text-left text-xs font-medium text-slate-400">
                <TimelineTrackShell className="border-slate-700/50 bg-transparent">
                  <WeekTimelineHeader weekDays={weekDays} weekStart={weekStart} />
                </TimelineTrackShell>
              </th>
              <th className="sticky right-0 z-10 bg-[#131f36] px-2 py-2 text-right text-xs font-medium text-slate-500">
                Week done?
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-700/60 bg-slate-900/20">
              <td className="sticky left-0 z-10 bg-[#131f36] px-3 py-2 align-middle">
                <span className="text-xs font-medium text-slate-300">Guild Events</span>
                <p className="text-[9px] leading-tight text-slate-500">48h each</p>
              </td>
              <td className="p-1 align-middle">
                <TimelineTrackShell className="min-h-9 border-slate-700/50 bg-slate-950/40">
                  <GuildEventWeekBar weekStart={weekStart} height={36} overlay />
                  <WeekNowLine weekStart={weekStart} />
                </TimelineTrackShell>
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

              return (
                <tr
                  key={skill}
                  className={`border-b border-slate-800/50 ${skillRowClass(cov?.weekState)}`}
                >
                  <td className="sticky left-0 z-10 bg-[#131f36] px-3 py-2 align-middle">
                    <div className="flex items-start gap-2">
                      <SkillIcon skill={skill} size="lg" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-200">{skill}</span>
                        {cov && cov.contributorCount > 0 && (
                          <span className="ml-1 text-[10px] text-slate-500">
                            ({cov.contributorCount})
                          </span>
                        )}
                        {xp && xp.adequacy !== "none" && cov?.weekState !== "complete" && (
                          <p className={`mt-0.5 text-[9px] leading-tight ${adequacyClass(xp.adequacy)}`}>
                            {adequacyLabel(xp.adequacy)}
                            {xp.adequacy !== "unknown" && (
                              <span className="text-slate-500"> · {xp.percent}% XP</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-1 align-middle">
                    <TimelineTrackShell
                      style={{ height: timelineHeight }}
                      className={`cursor-crosshair bg-gradient-to-r from-slate-900/30 to-slate-950/50 transition hover:border-sky-500/40 ${
                        dimmed ? "opacity-60" : ""
                      } ${
                        segments.length > 0
                          ? "border-slate-600/80"
                          : "border-dashed border-slate-700/60"
                      }`}
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
                    >
                      <WeekNowLine weekStart={weekStart} />
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
                        const topPx = ROW_PAD + lane * (DESKTOP_BLOCK_HEIGHT + LANE_GAP);
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
                              height: DESKTOP_BLOCK_HEIGHT,
                            }}
                            className={`absolute z-[1] min-w-[2px] cursor-pointer overflow-hidden rounded border px-1 py-0.5 text-left leading-none ${blockClass}`}
                            title={formatTrialWindowLabel(plannedStartAt)}
                          >
                            <span className="mt-px block truncate text-[9px] font-semibold leading-tight text-white">
                              {signup.member_name}
                            </span>
                            <span className="block truncate text-[8px] leading-tight text-slate-300">
                              {formatTimeLabel(plannedStartAt, true)} →{" "}
                              {formatTimeLabel(plannedEndAt.toISOString(), true)}
                            </span>
                            <StatusBadge status={effective} small />
                          </button>
                        );
                      })}
                    </TimelineTrackShell>
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
