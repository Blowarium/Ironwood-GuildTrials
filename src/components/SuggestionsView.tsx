"use client";

import { useMemo, useState } from "react";
import type { Member, Skill } from "@/lib/constants";
import type { GuildConfig } from "@/lib/guild-config";
import { buildProfilesMap, getPreferenceRankFromProfile, getXpPerHourForSkill, membersWithRankedProfiles, type MemberProfile, type ProfilesMap } from "@/lib/member-profile";
import { buildOptimalSchedule, completedSkillsFromCompletions, type ScheduleSuggestion } from "@/lib/schedule-optimizer";
import type { SkillXpProgress } from "@/lib/trial-xp";
import { formatXp, soloCompletesTrial, trialXpContribution } from "@/lib/trial-xp";
import type { SkillWeekCompletion, TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { formatTimeLabel } from "@/lib/trial-schedule";
import { rankClass, rankLabel } from "@/lib/suggestion-labels";
import { GuildTrialHallSettings } from "./GuildTrialHallSettings";
import {
  ScheduleSourceFilterPills,
  type ScheduleSourceId,
} from "./ScheduleSourceFilterPills";
import { SkillIcon } from "./SkillIcon";
import { DiscordSuggestionsPanel } from "./DiscordSuggestionsPanel";

function memberFraction(count: number, total: number): string {
  return `${count}/${total}`;
}

function soloLabel(solo: boolean | null): string {
  if (solo === true) return "Solo 24h ✓";
  if (solo === false) return "Needs help";
  return "XP/h unknown";
}

function soloClass(solo: boolean | null): string {
  if (solo === true) return "text-emerald-400";
  if (solo === false) return "text-amber-300";
  return "text-slate-500";
}

function trialXpForSkill(profile: MemberProfile | undefined, skill: Skill, required: number) {
  const xpPerHour = getXpPerHourForSkill(profile, skill);
  return {
    xpPerHour,
    contribution: trialXpContribution(xpPerHour),
    soloCompletes: soloCompletesTrial(xpPerHour, required),
  };
}

function TrialXpCell({
  xpPerHour,
  contribution,
  soloCompletes,
}: {
  xpPerHour: number | null;
  contribution: number;
  soloCompletes: boolean | null;
}) {
  if (xpPerHour == null) {
    return <span className="text-slate-500">—</span>;
  }
  return (
    <span className={soloClass(soloCompletes)}>
      {formatXp(contribution)}
      <span className="text-slate-500"> ({soloLabel(soloCompletes)})</span>
    </span>
  );
}

const assignmentTableColGroup = (
  <colgroup>
    <col className="w-[17%]" />
    <col className="w-[15%]" />
    <col className="w-[22%]" />
    <col className="w-[16%]" />
    <col className="w-[22%]" />
    <col className="w-[8%]" />
  </colgroup>
);

function AssignmentTableHead() {
  return (
    <thead>
      <tr className="border-b border-slate-700/60 bg-slate-900/50 text-left text-xs text-slate-500">
        <th className="px-3 py-2">Member</th>
        <th className="px-3 py-2">Skill</th>
        <th className="px-3 py-2">When</th>
        <th className="px-3 py-2">Pref</th>
        <th className="px-3 py-2">Trial XP (5%)</th>
        <th className="px-3 py-2" />
      </tr>
    </thead>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/50 px-2 py-1 sm:px-3 sm:py-2">
      <p className="truncate text-[9px] uppercase tracking-wide text-slate-500 sm:text-[10px]">
        {label}
      </p>
      <p className="text-sm font-bold text-white sm:text-lg">{value}</p>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  saving,
  onApply,
}: {
  suggestion: ScheduleSuggestion;
  saving: boolean;
  onApply: (s: ScheduleSuggestion) => void;
}) {
  return (
    <div className="mobile-card rounded-lg border border-sky-500/40 bg-sky-950/30 sm:px-4 sm:py-3">
      <p className="text-xs text-slate-300 sm:text-sm">
        Your suggested skill:{" "}
        <span className="inline-flex items-center gap-1 font-medium text-white">
          <SkillIcon skill={suggestion.skill} size="xs" className="sm:hidden" />
          <SkillIcon skill={suggestion.skill} size="sm" className="hidden sm:block" />
          {suggestion.skill}
        </span>
        <span className="text-slate-500">
          {" "}
          · {formatDayLabel(suggestion.plannedDate, true)}{" "}
          <span className={rankClass(suggestion.preferenceRank)}>
            {rankLabel(suggestion.preferenceRank)}
          </span>
        </span>
      </p>
      {suggestion.xpPerHour != null && (
        <p className="mt-0.5 hidden text-sm text-slate-400 sm:block">
          {formatXp(suggestion.xpPerHour)} XP/h → {formatXp(suggestion.trialXpContribution)} trial XP (
          <span className={soloClass(suggestion.soloCompletes)}>{soloLabel(suggestion.soloCompletes)}</span>
          )
        </p>
      )}
      <p className="mt-2 text-[10px] text-slate-500 sm:text-xs">
        Opens the schedule dialog to review — nothing is saved until you add to the planner.
      </p>
      <button
        type="button"
        disabled={saving}
        onClick={() => onApply(suggestion)}
        className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 sm:mt-3 sm:w-auto sm:py-1.5 sm:text-xs"
      >
        Review &amp; schedule
      </button>
    </div>
  );
}

function ExistingScheduleCard({ signup }: { signup: TrialSignup }) {
  return (
    <div className="mobile-card rounded-lg border border-emerald-500/30 bg-emerald-950/20 sm:px-4 sm:py-3">
      <p className="text-xs text-slate-300 sm:text-sm">
        You&apos;re already scheduled for{" "}
        <span className="inline-flex items-center gap-1 font-medium text-white">
          <SkillIcon skill={signup.skill as Skill} size="xs" className="sm:hidden" />
          <SkillIcon skill={signup.skill as Skill} size="sm" className="hidden sm:block" />
          {signup.skill}
        </span>
        <span className="text-slate-500">
          {" "}
          · {formatDayLabel(signup.planned_date, true)}{" "}
          {signup.planned_start_at ? formatTimeLabel(signup.planned_start_at, true) : ""}
        </span>
      </p>
      <p className="mt-2 text-[10px] text-slate-500 sm:text-xs">
        Edit your trial on the Planner tab if you need to change it.
      </p>
    </div>
  );
}

function SkillProgressCard({
  scheduled,
  combined,
  required,
  showScheduled,
  showSuggested,
}: {
  scheduled: SkillXpProgress;
  combined: SkillXpProgress;
  required: number;
  showScheduled: boolean;
  showSuggested: boolean;
}) {
  const scheduledXp = showScheduled ? scheduled.contributed : 0;
  const suggestedXp = showSuggested
    ? Math.max(0, combined.contributed - scheduled.contributed)
    : 0;
  const totalXp = scheduledXp + suggestedXp;
  const percent = required > 0 ? Math.min(100, Math.round((totalXp / required) * 100)) : 100;
  const scheduledPct = required > 0 ? Math.min(100, (scheduledXp / required) * 100) : 0;
  const suggestedPct = required > 0 ? Math.min(100 - scheduledPct, (suggestedXp / required) * 100) : 0;

  const memberCount =
    showScheduled && showSuggested
      ? combined.memberCount
      : showScheduled
        ? scheduled.memberCount
        : combined.memberCount - scheduled.memberCount;

  if (!showScheduled && !showSuggested) return null;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-2 py-1.5 sm:px-2.5 sm:py-2">
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex min-w-0 items-center gap-0.5 text-[10px] font-medium text-slate-200 sm:gap-1 sm:text-xs">
          <SkillIcon skill={scheduled.skill} size="xs" />
          <span className="truncate">{scheduled.skill}</span>
        </span>
        <span className="shrink-0 text-[9px] text-slate-500 sm:text-[10px]">{memberCount}</span>
      </div>
      <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-slate-800 sm:mt-1.5 sm:h-1.5">
        {showScheduled && scheduledPct > 0 && (
          <div
            className="h-full bg-sky-500"
            style={{ width: `${scheduledPct}%` }}
            title="Scheduled"
          />
        )}
        {showSuggested && suggestedPct > 0 && (
          <div
            className={`h-full ${showScheduled ? "bg-violet-500" : "bg-violet-500"}`}
            style={{ width: `${suggestedPct}%` }}
            title="Suggested"
          />
        )}
        {percent === 0 && (
          <div className="h-full w-0" />
        )}
      </div>
      <p className="mt-0.5 text-[9px] text-slate-500 sm:mt-1 sm:text-[10px]">
        {formatXp(totalXp)} / {formatXp(required)} XP
        {required - totalXp > 0 && (
          <span className="text-amber-300/90"> · {formatXp(required - totalXp)} short</span>
        )}
        {showScheduled && showSuggested && suggestedXp > 0 && (
          <span className="text-violet-300/80">
            {" "}
            · +{formatXp(suggestedXp)} suggested
          </span>
        )}
      </p>
    </div>
  );
}

export function SuggestionsView({
  signups,
  completions,
  profiles,
  weekDays,
  weekStart,
  guildConfig,
  onGuildConfigSaved,
  currentUser,
  canUseStaffTools,
  saving,
  onApplySuggestion,
  onApplyAllUnassigned,
  staffUnlocked,
  canManageDiscord,
}: {
  signups: TrialSignup[];
  completions: SkillWeekCompletion[];
  profiles: import("@/lib/member-profile").MemberProfile[];
  weekDays: string[];
  weekStart: string;
  guildConfig: GuildConfig | null;
  onGuildConfigSaved: (config: GuildConfig) => void;
  currentUser: Member;
  canUseStaffTools: boolean;
  saving: boolean;
  onApplySuggestion: (s: ScheduleSuggestion) => void;
  onApplyAllUnassigned: (items: ScheduleSuggestion[]) => Promise<void>;
  staffUnlocked: boolean;
  canManageDiscord: boolean;
}) {
  const [sourceEnabled, setSourceEnabled] = useState<Record<ScheduleSourceId, boolean>>({
    scheduled: true,
    suggested: true,
  });

  const profilesMap: ProfilesMap = useMemo(
    () => buildProfilesMap(profiles),
    [profiles],
  );

  const memberNames = useMemo(
    () => profiles.map((p) => p.member_name).sort((a, b) => a.localeCompare(b)),
    [profiles],
  );

  const hallLevel = guildConfig?.trial_hall_level ?? 0;

  const completedSkills = useMemo(
    () => completedSkillsFromCompletions(completions),
    [completions],
  );

  const plan = useMemo(
    () =>
      buildOptimalSchedule(
        profilesMap,
        signups,
        weekDays,
        hallLevel,
        memberNames,
        completedSkills,
      ),
    [profilesMap, signups, weekDays, hallLevel, memberNames, completedSkills],
  );

  const prefsCount = membersWithRankedProfiles(profilesMap, memberNames);
  const mySuggestion = plan.suggestions.find((s) => s.member === currentUser);
  const myExistingSignup = plan.alreadyScheduled.find((s) => s.member_name === currentUser);

  const showScheduled = sourceEnabled.scheduled;
  const showSuggested = sourceEnabled.suggested;
  const progressVisible = showScheduled || showSuggested;

  function toggleSource(id: ScheduleSourceId) {
    setSourceEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next.scheduled && !next.suggested) return prev;
      return next;
    });
  }

  if (!canUseStaffTools) {
    return (
      <div className="space-y-2 sm:space-y-4">
        <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-4">
          <h2 className="text-sm font-semibold text-white sm:text-lg">Your trial suggestion</h2>
          <p className="mt-0.5 text-xs text-slate-400 sm:mt-1 sm:text-sm">
            Based on your skill preferences and what the guild still needs this week.
          </p>
        </div>

        {mySuggestion ? (
          <SuggestionCard suggestion={mySuggestion} saving={saving} onApply={onApplySuggestion} />
        ) : myExistingSignup ? (
          <ExistingScheduleCard signup={myExistingSignup} />
        ) : (
          <p className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-400 sm:text-sm">
            No suggestion available — save your top skills and XP/h in your profile, or pick a
            skill manually on the Planner tab.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-4">
      {canManageDiscord && (
        <DiscordSuggestionsPanel
          currentUser={currentUser}
          weekStart={weekStart}
          canManageDiscord={canManageDiscord}
          staffUnlocked={staffUnlocked}
        />
      )}

      <GuildTrialHallSettings
        config={guildConfig}
        actorMember={currentUser}
        canEdit={canUseStaffTools}
        onSaved={onGuildConfigSaved}
      />

      <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-4">
        <h2 className="text-sm font-semibold text-white sm:text-lg">Smart schedule</h2>
        <p className="mt-0.5 hidden text-sm text-slate-400 sm:mt-1 sm:block">
          Suggests assignments for members not yet signed up this week. Existing planner
          signups are respected — if someone already scheduled a skill, others are steered
          to their next open preference instead of stacking the same trial. Skills marked
          done count as finished; scheduled coverage alone does not — unmarked skills still
          need members before overflow to lower preferences. Locked-out skills are never
          suggested. All 16 trials get coverage, then trial XP at hall level {plan.hallLevel}{" "}
          is filled before overflow placements.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          <Stat
            label="Suggested"
            value={memberFraction(plan.stats.suggested.count, plan.totalMembers)}
          />
          <Stat
            label="Scheduled"
            value={memberFraction(plan.stats.scheduled.count, plan.totalMembers)}
          />
          <Stat label="Skills covered" value={`${plan.stats.skillsCoveredAfterPlan}/16`} />
          <Stat
            label="XP complete (plan)"
            value={`${plan.stats.skillsXpCompleteAfterPlan}/16`}
          />
          <Stat
            label="Top 8 pref · suggested"
            value={memberFraction(plan.stats.suggested.gotTopEightChoice, plan.totalMembers)}
          />
          <Stat
            label="Top 8 pref · scheduled"
            value={memberFraction(plan.stats.scheduled.gotTopEightChoice, plan.totalMembers)}
          />
          <Stat
            label="1st choice · suggested"
            value={memberFraction(plan.stats.suggested.gotFirstChoice, plan.totalMembers)}
          />
          <Stat
            label="1st choice · scheduled"
            value={memberFraction(plan.stats.scheduled.gotFirstChoice, plan.totalMembers)}
          />
        </div>
        {plan.suggestions.length > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onApplyAllUnassigned(plan.suggestions)}
            className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 sm:mt-4 sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm"
          >
            Apply all suggestions to planner
          </button>
        )}
      </div>

      <section>
        <div className="mb-1 flex flex-col gap-2 sm:mb-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xs font-medium text-slate-400 sm:text-sm">
              Skill trial XP progress
            </h3>
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">
              Toggle scheduled (on planner) and suggested (smart schedule) layers.
            </p>
          </div>
          <ScheduleSourceFilterPills enabled={sourceEnabled} onToggle={toggleSource} />
        </div>
        {!progressVisible ? (
          <p className="text-xs text-slate-500 sm:text-sm">
            Select at least one layer to show progress.
          </p>
        ) : (
          <>
            {showScheduled && showSuggested && (
              <p className="mb-1.5 flex flex-wrap gap-3 text-[10px] text-slate-500 sm:mb-2 sm:text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-1.5 w-3 rounded-full bg-sky-500" />
                  Scheduled
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-1.5 w-3 rounded-full bg-violet-500" />
                  Suggested
                </span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4">
              {plan.scheduledSkillProgress.map((scheduled, i) => (
                <SkillProgressCard
                  key={scheduled.skill}
                  scheduled={scheduled}
                  combined={plan.skillProgress[i]!}
                  required={plan.trialXpRequired}
                  showScheduled={showScheduled}
                  showSuggested={showSuggested}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {prefsCount < 10 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-2 py-1.5 text-xs text-amber-200 sm:px-3 sm:py-2 sm:text-sm">
          More members should save their top 3 skills and XP/h — suggestions improve with more data.
        </p>
      )}

      {plan.alreadyScheduled.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-slate-400 sm:mb-2 sm:text-sm">
            Scheduled on planner ({plan.alreadyScheduled.length})
          </h3>
          <div className="space-y-1 md:hidden">
            {plan.alreadyScheduled.map((s) => {
              const profile = profilesMap.get(s.member_name);
              const skill = s.skill as Skill;
              const preferenceRank = getPreferenceRankFromProfile(profile, skill);
              const trialXp = trialXpForSkill(profile, skill, plan.trialXpRequired);
              return (
              <div
                key={s.id}
                className="mobile-card rounded-lg border border-slate-700/50 bg-slate-900/40"
              >
                <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-200">
                  <span className="font-medium">{s.member_name}</span>
                  <span className="text-slate-500">·</span>
                  <SkillIcon skill={skill} size="xs" />
                  <span className="text-slate-300">{s.skill}</span>
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatDayLabel(s.planned_date, true)}{" "}
                  {s.planned_start_at ? formatTimeLabel(s.planned_start_at, true) : ""}
                </p>
                <p className={`text-[10px] ${rankClass(preferenceRank)}`}>
                  {rankLabel(preferenceRank)}
                  {trialXp.xpPerHour != null && (
                    <>
                      {" "}
                      · {formatXp(trialXp.contribution)} XP (
                      <span className={soloClass(trialXp.soloCompletes)}>
                        {soloLabel(trialXp.soloCompletes)}
                      </span>
                      )
                    </>
                  )}
                </p>
              </div>
              );
            })}
          </div>
          <div className="mobile-scroll-x hidden overflow-x-auto rounded-xl border border-slate-700/50 md:block">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              {assignmentTableColGroup}
              <AssignmentTableHead />
              <tbody>
                {plan.alreadyScheduled.map((s) => {
                  const profile = profilesMap.get(s.member_name);
                  const skill = s.skill as Skill;
                  const preferenceRank = getPreferenceRankFromProfile(profile, skill);
                  const trialXp = trialXpForSkill(profile, skill, plan.trialXpRequired);
                  return (
                  <tr key={s.id} className="border-b border-slate-800/50">
                    <td className="px-3 py-2 font-medium text-slate-200">{s.member_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <SkillIcon skill={skill} size="xs" />
                        {s.skill}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {formatDayLabel(s.planned_date, true)}{" "}
                      {s.planned_start_at ? formatTimeLabel(s.planned_start_at, true) : ""}
                    </td>
                    <td className={`px-3 py-2 text-xs ${rankClass(preferenceRank)}`}>
                      {rankLabel(preferenceRank)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <TrialXpCell {...trialXp} />
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs font-medium text-slate-400 sm:mb-2 sm:text-sm">
          Suggested assignments ({plan.suggestions.length})
        </h3>
        {plan.suggestions.length === 0 ? (
          <p className="text-xs text-slate-500 sm:text-sm">Everyone is already scheduled this week.</p>
        ) : (
          <>
            <div className="space-y-1 md:hidden">
              {plan.suggestions.map((s) => (
                <div
                  key={s.member}
                  className={`mobile-card rounded-lg border border-slate-700/50 ${
                    s.member === currentUser ? "border-sky-500/40 bg-sky-950/25" : "bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-200">{s.member}</p>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onApplySuggestion(s)}
                      className="shrink-0 rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-300">
                    <SkillIcon skill={s.skill} size="xs" />
                    <span className="min-w-0 truncate">{s.skill}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      · {formatDayLabel(s.plannedDate, true)}
                    </span>
                  </p>
                  <p className={`text-[10px] ${rankClass(s.preferenceRank)}`}>
                    {rankLabel(s.preferenceRank)}
                    {s.xpPerHour != null && (
                      <>
                        {" "}
                        · {formatXp(s.trialXpContribution)} XP (
                        <span className={soloClass(s.soloCompletes)}>
                          {soloLabel(s.soloCompletes)}
                        </span>
                        )
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="mobile-scroll-x hidden overflow-x-auto rounded-xl border border-slate-700/50 md:block">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                {assignmentTableColGroup}
                <AssignmentTableHead />
                <tbody>
                  {plan.suggestions.map((s) => (
                    <tr
                      key={s.member}
                      className={`border-b border-slate-800/50 ${
                        s.member === currentUser ? "bg-sky-950/25" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-200">{s.member}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <SkillIcon skill={s.skill} size="xs" />
                          {s.skill}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {formatDayLabel(s.plannedDate, true)}{" "}
                        {formatTimeLabel(s.plannedStartAt, true)}
                      </td>
                      <td className={`px-3 py-2 text-xs ${rankClass(s.preferenceRank)}`}>
                        {rankLabel(s.preferenceRank)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <TrialXpCell
                          xpPerHour={s.xpPerHour}
                          contribution={s.trialXpContribution}
                          soloCompletes={s.soloCompletes}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => onApplySuggestion(s)}
                          className="text-xs text-sky-400 hover:underline"
                        >
                          Apply
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
