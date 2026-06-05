"use client";

import { useMemo } from "react";
import type { Member, Skill } from "@/lib/constants";
import type { GuildConfig } from "@/lib/guild-config";
import { buildProfilesMap, membersWithRankedProfiles, type ProfilesMap } from "@/lib/member-profile";
import { buildOptimalSchedule, type ScheduleSuggestion } from "@/lib/schedule-optimizer";
import { formatXp, TRIAL_XP_FROM_SKILL_XP_RATE } from "@/lib/trial-xp";
import type { TrialSignup } from "@/lib/types";
import { formatDayLabel } from "@/lib/weeks";
import { formatTimeLabel } from "@/lib/trial-schedule";
import { GuildTrialHallSettings } from "./GuildTrialHallSettings";
import { SkillIcon } from "./SkillIcon";

function rankLabel(rank: 1 | 2 | 3 | null): string {
  if (rank === 1) return "1st choice";
  if (rank === 2) return "2nd choice";
  if (rank === 3) return "3rd choice";
  return "No pref match";
}

function rankClass(rank: 1 | 2 | 3 | null): string {
  if (rank === 1) return "text-emerald-400";
  if (rank === 2) return "text-sky-300";
  if (rank === 3) return "text-slate-300";
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
    <div className="space-y-4">
      <GuildTrialHallSettings
        config={guildConfig}
        actorMember={currentUser}
        canEdit={canUseStaffTools}
        onSaved={onGuildConfigSaved}
      />

      <div className="rounded-xl border border-slate-700/50 bg-[#131f36] p-4">
        <h2 className="text-lg font-semibold text-white">Smart schedule</h2>
        <p className="mt-1 text-sm text-slate-400">
          Suggests assignments for members not yet signed up this week. Covers all 16 skills when
          possible, favors preferred picks, and uses each member&apos;s XP/h (5% of skill XP earned
          in 24h counts as trial XP) to estimate completion (
          {formatXp(plan.trialXpRequired)} trial XP per skill at hall level {plan.hallLevel}).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Suggested" value={String(plan.stats.totalSuggestions)} />
          <Stat label="Skills covered" value={`${plan.stats.skillsCoveredAfterPlan}/16`} />
          <Stat
            label="XP complete (plan)"
            value={`${plan.stats.skillsXpCompleteAfterPlan}/16`}
          />
          <Stat label="Solo 24h completes" value={String(plan.stats.soloCompletesCount)} />
          <Stat label="Got 1st choice" value={String(plan.stats.gotFirstChoice)} />
        </div>
        {plan.suggestions.length > 0 && canUseStaffTools && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onApplyAllUnassigned(plan.suggestions)}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
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
        <h3 className="mb-2 text-sm font-medium text-slate-400">
          Skill trial XP progress (existing + suggested)
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {plan.skillProgress.map((sp) => (
            <div
              key={sp.skill}
              className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-200">
                  <SkillIcon skill={sp.skill} size="xs" />
                  {sp.skill}
                </span>
                <span className="text-[10px] text-slate-500">{sp.memberCount} assigned</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${
                    sp.percent >= 100 ? "bg-emerald-500" : "bg-sky-500"
                  }`}
                  style={{ width: `${Math.min(100, sp.percent)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
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
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          More members should save their top 3 skills and XP/h — suggestions improve with more data.
        </p>
      )}

      {mySuggestion && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 px-4 py-3">
          <p className="text-sm text-slate-300">
            Your suggestion:{" "}
            <span className="inline-flex items-center gap-1 font-medium text-white">
              <SkillIcon skill={mySuggestion.skill} size="sm" />
              {mySuggestion.skill}
            </span>{" "}
            on {formatDayLabel(mySuggestion.plannedDate)} (
            <span className={rankClass(mySuggestion.preferenceRank)}>
              {rankLabel(mySuggestion.preferenceRank)}
            </span>
            {mySuggestion.xpPerHour != null && (
              <>
                {" "}
                · {formatXp(mySuggestion.xpPerHour)} XP/h →{" "}
                {formatXp(mySuggestion.trialXpContribution)} trial XP (
                {Math.round(TRIAL_XP_FROM_SKILL_XP_RATE * 100)}% of{" "}
                {formatXp(mySuggestion.skillXp24h)} skill XP) (
                <span className={soloClass(mySuggestion.soloCompletes)}>
                  {soloLabel(mySuggestion.soloCompletes)}
                </span>
                )
              </>
            )}
            )
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => onApplySuggestion(mySuggestion)}
            className="mt-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
          >
            Apply my suggestion
          </button>
        </div>
      )}

      {plan.alreadyScheduled.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-slate-400">
            Already scheduled ({plan.alreadyScheduled.length})
          </h3>
          <div className="overflow-hidden rounded-xl border border-slate-700/50">
            <table className="w-full text-sm">
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
        <h3 className="mb-2 text-sm font-medium text-slate-400">
          Suggested assignments ({plan.suggestions.length})
        </h3>
        {plan.suggestions.length === 0 ? (
          <p className="text-sm text-slate-500">Everyone is already scheduled this week.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-700/50">
            <table className="w-full text-sm">
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
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
