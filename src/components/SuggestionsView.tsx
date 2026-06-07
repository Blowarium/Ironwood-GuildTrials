"use client";

import { useMemo } from "react";
import type { Member, Skill } from "@/lib/constants";
import type { GuildConfig } from "@/lib/guild-config";
import { buildProfilesMap, membersWithRankedProfiles, type ProfilesMap } from "@/lib/member-profile";
import { buildOptimalSchedule, type ScheduleSuggestion } from "@/lib/schedule-optimizer";
import { formatXp } from "@/lib/trial-xp";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { formatTimeLabel } from "@/lib/trial-schedule";
import { GuildTrialHallSettings } from "./GuildTrialHallSettings";
import { SkillIcon } from "./SkillIcon";

function rankLabel(rank: number | null): string {
  if (rank === 1) return "1st choice";
  if (rank === 2) return "2nd choice";
  if (rank === 3) return "3rd choice";
  if (rank != null) return `Pref rank ${rank}`;
  return "No pref match";
}

function rankClass(rank: number | null): string {
  if (rank === 1) return "text-emerald-400";
  if (rank === 2) return "text-sky-300";
  if (rank === 3) return "text-slate-300";
  if (rank != null && rank <= 8) return "text-slate-400";
  return "text-amber-400/90";
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

export function SuggestionsView({
  signups,
  profiles,
  weekDays,
  guildConfig,
  onGuildConfigSaved,
  currentUser,
  canUseStaffTools,
  saving,
  onApplySuggestion,
  onApplyAllUnassigned,
}: {
  signups: TrialSignup[];
  profiles: import("@/lib/member-profile").MemberProfile[];
  weekDays: string[];
  guildConfig: GuildConfig | null;
  onGuildConfigSaved: (config: GuildConfig) => void;
  currentUser: Member;
  canUseStaffTools: boolean;
  saving: boolean;
  onApplySuggestion: (s: ScheduleSuggestion) => Promise<void>;
  onApplyAllUnassigned: (items: ScheduleSuggestion[]) => Promise<void>;
}) {
  const profilesMap: ProfilesMap = useMemo(
    () => buildProfilesMap(profiles),
    [profiles],
  );

  const hallLevel = guildConfig?.trial_hall_level ?? 0;

  const plan = useMemo(
    () => buildOptimalSchedule(profilesMap, signups, weekDays, hallLevel),
    [profilesMap, signups, weekDays, hallLevel],
  );

  const prefsCount = membersWithRankedProfiles(profilesMap);
  const mySuggestion = plan.suggestions.find((s) => s.member === currentUser);

  return (
    <div className="space-y-2 sm:space-y-4">
      <GuildTrialHallSettings
        config={guildConfig}
        actorMember={currentUser}
        canEdit={canUseStaffTools}
        onSaved={onGuildConfigSaved}
      />

      <div className="mobile-panel rounded-xl border border-slate-700/50 bg-[#131f36] sm:p-4">
        <h2 className="text-sm font-semibold text-white sm:text-lg">Smart schedule</h2>
        <p className="mt-0.5 hidden text-sm text-slate-400 sm:mt-1 sm:block">
          Suggests assignments for members not yet signed up this week. Each member is seated on
          their highest-ranked preferred skill that still helps complete the week — profile
          preferences come first, XP/h only breaks ties. Locked-out skills are never suggested.
          All 16 trials get coverage, then trial XP at hall level {plan.hallLevel} is filled before
          anyone is placed on a lower-ranked skill.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-6">
          <Stat label="Suggested" value={String(plan.stats.totalSuggestions)} />
          <Stat label="Skills covered" value={`${plan.stats.skillsCoveredAfterPlan}/16`} />
          <Stat
            label="XP complete (plan)"
            value={`${plan.stats.skillsXpCompleteAfterPlan}/16`}
          />
          <Stat label="Top 8 pref" value={String(plan.stats.gotTopEightChoice)} />
          <Stat label="Got 1st choice" value={String(plan.stats.gotFirstChoice)} />
          <Stat label="Solo 24h completes" value={String(plan.stats.soloCompletesCount)} />
        </div>
        {plan.suggestions.length > 0 && canUseStaffTools && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onApplyAllUnassigned(plan.suggestions)}
            className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 sm:mt-4 sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm"
          >
            Apply all suggestions to planner
          </button>
        )}
        {plan.suggestions.length > 0 && !canUseStaffTools && (
          <p className="mt-4 text-xs text-slate-500">
            Apply all is available to Guild Leaders and Officers. You can still apply your own row
            below.
          </p>
        )}
      </div>

      <section>
        <h3 className="mb-1 text-xs font-medium text-slate-400 sm:mb-2 sm:text-sm">
          Skill trial XP progress (existing + suggested)
        </h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4">
          {plan.skillProgress.map((sp) => (
            <div
              key={sp.skill}
              className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-2 py-1.5 sm:px-2.5 sm:py-2"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex min-w-0 items-center gap-0.5 text-[10px] font-medium text-slate-200 sm:gap-1 sm:text-xs">
                  <SkillIcon skill={sp.skill} size="xs" />
                  <span className="truncate">{sp.skill}</span>
                </span>
                <span className="shrink-0 text-[9px] text-slate-500 sm:text-[10px]">{sp.memberCount}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800 sm:mt-1.5 sm:h-1.5">
                <div
                  className={`h-full rounded-full ${
                    sp.percent >= 100 ? "bg-emerald-500" : "bg-sky-500"
                  }`}
                  style={{ width: `${Math.min(100, sp.percent)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[9px] text-slate-500 sm:mt-1 sm:text-[10px]">
                {formatXp(sp.contributed)} / {formatXp(sp.required)} XP
                {sp.remaining > 0 && (
                  <span className="text-amber-300/90"> · {formatXp(sp.remaining)} short</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      {prefsCount < 10 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-2 py-1.5 text-xs text-amber-200 sm:px-3 sm:py-2 sm:text-sm">
          More members should save their top 3 skills and XP/h — suggestions improve with more data.
        </p>
      )}

      {mySuggestion && (
        <div className="mobile-card rounded-lg border border-sky-500/40 bg-sky-950/30 sm:px-4 sm:py-3">
          <p className="text-xs text-slate-300 sm:text-sm">
            Your suggestion:{" "}
            <span className="inline-flex items-center gap-1 font-medium text-white">
              <SkillIcon skill={mySuggestion.skill} size="xs" className="sm:hidden" />
              <SkillIcon skill={mySuggestion.skill} size="sm" className="hidden sm:block" />
              {mySuggestion.skill}
            </span>
            <span className="text-slate-500">
              {" "}
              · {formatDayLabel(mySuggestion.plannedDate, true)}{" "}
              <span className={rankClass(mySuggestion.preferenceRank)}>
                {rankLabel(mySuggestion.preferenceRank)}
              </span>
            </span>
          </p>
          {mySuggestion.xpPerHour != null && (
            <p className="mt-0.5 hidden text-sm text-slate-400 sm:block">
              {formatXp(mySuggestion.xpPerHour)} XP/h →{" "}
              {formatXp(mySuggestion.trialXpContribution)} trial XP (
              <span className={soloClass(mySuggestion.soloCompletes)}>
                {soloLabel(mySuggestion.soloCompletes)}
              </span>
              )
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => onApplySuggestion(mySuggestion)}
            className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 sm:mt-2 sm:w-auto sm:py-1.5 sm:text-xs"
          >
            Apply my suggestion
          </button>
        </div>
      )}

      {plan.alreadyScheduled.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-slate-400 sm:mb-2 sm:text-sm">
            Already scheduled ({plan.alreadyScheduled.length})
          </h3>
          <div className="space-y-1 md:hidden">
            {plan.alreadyScheduled.map((s) => (
              <div
                key={s.id}
                className="mobile-card rounded-lg border border-slate-700/50 bg-slate-900/40"
              >
                <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-200">
                  <span className="font-medium">{s.member_name}</span>
                  <span className="text-slate-500">·</span>
                  <SkillIcon skill={s.skill as Skill} size="xs" />
                  <span className="text-slate-300">{s.skill}</span>
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatDayLabel(s.planned_date, true)}{" "}
                  {s.planned_start_at ? formatTimeLabel(s.planned_start_at, true) : ""}
                </p>
              </div>
            ))}
          </div>
          <div className="mobile-scroll-x hidden overflow-x-auto rounded-xl border border-slate-700/50 md:block">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-900/50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2">Member</th>
                  <th className="px-3 py-2">Skill</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {plan.alreadyScheduled.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/50">
                    <td className="px-3 py-2 text-slate-200">{s.member_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <SkillIcon skill={s.skill as Skill} size="xs" />
                        {s.skill}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {formatDayLabel(s.planned_date, true)}{" "}
                      {s.planned_start_at ? formatTimeLabel(s.planned_start_at, true) : ""}
                    </td>
                  </tr>
                ))}
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
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-900/50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2">Member</th>
                  <th className="px-3 py-2">Skill</th>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Trial XP (5%)</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
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
                      {s.xpPerHour != null ? (
                        <span className={soloClass(s.soloCompletes)}>
                          {formatXp(s.trialXpContribution)}
                          <span className="text-slate-500"> ({soloLabel(s.soloCompletes)})</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/50 px-2 py-1 sm:px-3 sm:py-2">
      <p className="truncate text-[9px] uppercase tracking-wide text-slate-500 sm:text-[10px]">{label}</p>
      <p className="text-sm font-bold text-white sm:text-lg">{value}</p>
    </div>
  );
}
