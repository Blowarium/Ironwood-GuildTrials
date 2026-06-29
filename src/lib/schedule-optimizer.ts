import { SKILLS, type Member, type Skill } from "./constants";
import {
  compareSkillsByPreferenceRank,
  getPreferenceRankFromProfile,
  getXpPerHourForSkill,
  isSkillLockedForMember,
  membersWithRankedProfiles,
  type MemberProfile,
  type ProfilesMap,
} from "./member-profile";
import {
  memberContributionForSkill,
  skillXpIn24h,
  soloCompletesTrial,
  trialXpContribution as computeTrialXpContribution,
  trialXpRequired,
  type SkillXpProgress,
} from "./trial-xp";
import { guildEventActiveStartForSkillInWeek } from "./guild-events";
import {
  buildStartAt,
  dateFromStartAt,
  snapStartAtToWholeHour,
} from "./trial-schedule";
import { buildCompletionMap } from "./stats";
import type { SkillWeekCompletion, TrialSignup } from "./types";

const EMPTY_COMPLETED_SKILLS: ReadonlySet<Skill> = new Set();

/** Skills manually marked complete for the week (mark done). */
export function completedSkillsFromCompletions(
  completions: SkillWeekCompletion[],
): ReadonlySet<Skill> {
  return new Set(buildCompletionMap(completions).keys());
}

export interface ScheduleSuggestion {
  member: Member;
  skill: Skill;
  plannedDate: string;
  plannedStartAt: string;
  preferenceRank: number | null;
  preferenceScore: number;
  xpPerHour: number | null;
  skillXp24h: number;
  trialXpContribution: number;
  soloCompletes: boolean | null;
}

export interface PreferenceAssignmentStats {
  count: number;
  gotFirstChoice: number;
  gotSecondChoice: number;
  gotThirdChoice: number;
  gotTopEightChoice: number;
  noPreferenceMatch: number;
  soloCompletesCount: number;
}

export interface SchedulePlan {
  suggestions: ScheduleSuggestion[];
  alreadyScheduled: TrialSignup[];
  trialXpRequired: number;
  hallLevel: number;
  skillProgress: SkillXpProgress[];
  /** XP progress from planner signups only (no suggestions). */
  scheduledSkillProgress: SkillXpProgress[];
  totalMembers: number;
  stats: {
    suggested: PreferenceAssignmentStats;
    scheduled: PreferenceAssignmentStats;
    /** Skills with a planner signup or mark-done (excludes suggestions-only). */
    skillsCoveredOnPlanner: number;
    /** Skills with coverage after applying suggestions to the model. */
    skillsCoveredAfterPlan: number;
    /** Trial XP met from planner signups only. */
    skillsXpCompleteOnPlanner: number;
    skillsXpCompleteAfterPlan: number;
    /** True when every skill has a planner signup or is mark-done. */
    allSkillsOnPlannerOrDone: boolean;
    /** Unmarked skills with no planner signup yet. */
    skillsMissingFromPlanner: Skill[];
    membersWithPreferences: number;
  };
}

type SkillState = { contributed: number; memberCount: number };

/** Guild-wide trial gap for a skill (ignores member preferences). */
type SkillNeed = "done" | "uncovered" | "needs_xp" | "covered";

/** Rank 1 → 16, rank 16 → 1. Higher = better preference fit. */
function preferenceBonus(rank: number | null): number {
  if (rank == null || rank < 1) return 0;
  return 17 - Math.min(rank, 16);
}

function pickDay(weekDays: string[], dayLoad: Map<string, number>): string {
  let best = weekDays[0];
  let min = dayLoad.get(best) ?? 0;
  for (const d of weekDays) {
    const load = dayLoad.get(d) ?? 0;
    if (load < min) {
      min = load;
      best = d;
    }
  }
  dayLoad.set(best, min + 1);
  return best;
}

function pickStartAt(day: string, dayLoad: Map<string, number>): string {
  const count = dayLoad.get(day) ?? 0;
  const hour = Math.min(22, 6 + (count % 9) * 2);
  return buildStartAt(day, hour, 0);
}

function pickSuggestionTiming(
  weekStart: string,
  weekDays: string[],
  skill: Skill,
  dayLoad: Map<string, number>,
): { plannedDate: string; plannedStartAt: string } {
  const eventStart = guildEventActiveStartForSkillInWeek(weekStart, skill);
  if (eventStart) {
    const plannedStartAt = snapStartAtToWholeHour(eventStart.toISOString());
    const plannedDate = dateFromStartAt(plannedStartAt);
    if (weekDays.includes(plannedDate)) {
      dayLoad.set(plannedDate, (dayLoad.get(plannedDate) ?? 0) + 1);
      return { plannedDate, plannedStartAt };
    }
  }

  const plannedDate = pickDay(weekDays, dayLoad);
  const plannedStartAt = pickStartAt(plannedDate, dayLoad);
  return { plannedDate, plannedStartAt };
}

function initSkillState(
  existingSignups: TrialSignup[],
  profiles: ProfilesMap,
): Map<Skill, SkillState> {
  const map = new Map<Skill, SkillState>();
  for (const sk of SKILLS) map.set(sk, { contributed: 0, memberCount: 0 });
  for (const s of existingSignups) {
    const skill = s.skill as Skill;
    const st = map.get(skill)!;
    st.memberCount += 1;
    st.contributed += memberContributionForSkill(profiles.get(s.member_name), skill);
  }
  return map;
}

function buildSkillProgress(
  skillState: Map<Skill, SkillState>,
  required: number,
): SkillXpProgress[] {
  return SKILLS.map((skill) => {
    const st = skillState.get(skill)!;
    const percent =
      required > 0 ? Math.min(100, Math.round((st.contributed / required) * 100)) : 100;
    return {
      skill,
      required,
      contributed: st.contributed,
      remaining: Math.max(0, required - st.contributed),
      percent,
      memberCount: st.memberCount,
    };
  });
}

function memberPreferredSkills(profile: MemberProfile | undefined): Skill[] {
  if (!profile) return [];
  return [...profile.skills]
    .filter((s) => !s.skill_locked && s.preference_rank != null && s.preference_rank > 0)
    .sort(compareSkillsByPreferenceRank)
    .map((s) => s.skill);
}

/** Every skill is mark-done or has at least one signup on the planner (suggestions do not count). */
function plannerCoversAllSkills(
  existingSignups: TrialSignup[],
  completedSkills: ReadonlySet<Skill>,
): boolean {
  const scheduledSkills = new Set(existingSignups.map((s) => s.skill as Skill));
  return SKILLS.every((skill) => completedSkills.has(skill) || scheduledSkills.has(skill));
}

function classifySkillNeed(
  skill: Skill,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): SkillNeed {
  if (completedSkills.has(skill)) return "done";
  const st = skillState.get(skill)!;
  if (st.memberCount === 0) return "uncovered";
  if (st.contributed < required) return "needs_xp";
  return "covered";
}

/** True while any skill still needs a first planner signup or more trial XP (planner signups only). */
function plannerHasPriorityWork(
  plannerSkillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  return SKILLS.some((skill) => {
    const need = classifySkillNeed(skill, plannerSkillState, required, completedSkills);
    return need === "uncovered" || need === "needs_xp";
  });
}

function skillHasAdequateXp(st: SkillState, required: number): boolean {
  return st.memberCount > 0 && st.contributed >= required;
}

/** Member ranks this skill and planner signups already project enough XP — don't stack them here. */
function isHandledPreferenceForMember(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  plannerSkillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  if (completedSkills.has(skill)) return false;
  const preferred = memberPreferredSkills(profiles.get(member));
  if (!preferred.includes(skill)) return false;
  return skillHasAdequateXp(plannerSkillState.get(skill)!, required);
}

/**
 * Highest-ranked preferred skill that still needs coverage or XP on the planner.
 * Useful for UI hints.
 */
export function preferredAssignmentSkill(
  member: Member,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill> = EMPTY_COMPLETED_SKILLS,
): Skill | null {
  const preferred = memberPreferredSkills(profiles.get(member));
  for (const skill of preferred) {
    const need = classifySkillNeed(skill, skillState, required, completedSkills);
    if (need === "uncovered" || need === "needs_xp") return skill;
  }
  return null;
}

/** Highest-ranked unlocked, unmarked skill for preference overflow. */
function pickPreferenceOverflowSkill(
  member: Member,
  profiles: ProfilesMap,
  completedSkills: ReadonlySet<Skill>,
): Skill | null {
  for (const skill of memberPreferredSkills(profiles.get(member))) {
    if (completedSkills.has(skill)) continue;
    if (isSkillLockedForMember(profiles.get(member), skill)) continue;
    return skill;
  }

  for (const skill of SKILLS) {
    if (completedSkills.has(skill)) continue;
    if (isSkillLockedForMember(profiles.get(member), skill)) continue;
    return skill;
  }

  return null;
}

function canSuggestMemberOnSkill(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  plannerSkillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
  preferenceOverflow: boolean,
): boolean {
  if (isSkillLockedForMember(profiles.get(member), skill)) return false;
  if (completedSkills.has(skill)) return false;

  if (preferenceOverflow) {
    return true;
  }

  const plannerNeed = classifySkillNeed(skill, plannerSkillState, required, completedSkills);

  if (plannerNeed === "uncovered") {
    // One suggestion per uncovered planner skill until someone is actually scheduled there.
    return (
      plannerSkillState.get(skill)!.memberCount === 0 &&
      skillState.get(skill)!.memberCount === 0
    );
  }

  if (plannerNeed === "needs_xp") {
    // Stack helpers while planner signups alone still fall short of trial XP.
    return plannerSkillState.get(skill)!.contributed < required;
  }

  if (plannerHasPriorityWork(plannerSkillState, required, completedSkills)) return false;

  if (
    isHandledPreferenceForMember(
      member,
      skill,
      profiles,
      plannerSkillState,
      required,
      completedSkills,
    )
  ) {
    return false;
  }

  return classifySkillNeed(skill, skillState, required, completedSkills) === "covered";
}

/** 4 = uncovered, 3 = needs XP, 1 = covered backup, 0 = invalid */
function assignmentPriorityTier(
  skill: Skill,
  skillState: Map<Skill, SkillState>,
  plannerSkillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
  preferenceOverflow: boolean,
): number {
  if (preferenceOverflow) return 1;

  const plannerNeed = classifySkillNeed(skill, plannerSkillState, required, completedSkills);
  if (plannerNeed === "uncovered") return 4;
  if (plannerNeed === "needs_xp") return 3;
  if (plannerNeed === "covered") return 1;
  return 0;
}

function scoreAssignment(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  plannerSkillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
  preferenceOverflow: boolean,
): number {
  if (
    !canSuggestMemberOnSkill(
      member,
      skill,
      profiles,
      skillState,
      plannerSkillState,
      required,
      completedSkills,
      preferenceOverflow,
    )
  ) {
    return -1;
  }

  const st = skillState.get(skill)!;
  const rank = getPreferenceRankFromProfile(profiles.get(member), skill);
  const pref = preferenceBonus(rank);
  const xp = memberContributionForSkill(profiles.get(member), skill);

  if (preferenceOverflow) {
    return pref * 1_000_000_000 + xp;
  }

  const tier = assignmentPriorityTier(
    skill,
    skillState,
    plannerSkillState,
    required,
    completedSkills,
    preferenceOverflow,
  );
  if (tier === 0) return -1;

  const remaining = Math.max(0, required - st.contributed);
  return tier * 1_000_000_000_000 + pref * 1_000_000_000 + xp * 1_000 + remaining;
}

function computeAssignmentPrefStats(
  assignments: { member: Member; skill: Skill }[],
  profiles: ProfilesMap,
  required: number,
): PreferenceAssignmentStats {
  let gotFirstChoice = 0;
  let gotSecondChoice = 0;
  let gotThirdChoice = 0;
  let gotTopEightChoice = 0;
  let noPreferenceMatch = 0;
  let soloCompletesCount = 0;

  for (const { member, skill } of assignments) {
    const profile = profiles.get(member);
    const rank = getPreferenceRankFromProfile(profile, skill);
    if (rank === 1) gotFirstChoice++;
    if (rank === 2) gotSecondChoice++;
    if (rank === 3) gotThirdChoice++;
    if (rank != null && rank <= 8) gotTopEightChoice++;
    if (rank == null) noPreferenceMatch++;

    const xpPerHour = getXpPerHourForSkill(profile, skill);
    if (soloCompletesTrial(xpPerHour, required)) soloCompletesCount++;
  }

  return {
    count: assignments.length,
    gotFirstChoice,
    gotSecondChoice,
    gotThirdChoice,
    gotTopEightChoice,
    noPreferenceMatch,
    soloCompletesCount,
  };
}

function pushSuggestion(
  suggestions: ScheduleSuggestion[],
  member: Member,
  skill: Skill,
  plannedDate: string,
  plannedStartAt: string,
  profiles: ProfilesMap,
  required: number,
): void {
  const profile = profiles.get(member);
  const rank = getPreferenceRankFromProfile(profile, skill);
  const xpPerHour = getXpPerHourForSkill(profile, skill);
  suggestions.push({
    member,
    skill,
    plannedDate,
    plannedStartAt,
    preferenceRank: rank,
    preferenceScore: preferenceBonus(rank),
    xpPerHour,
    skillXp24h: skillXpIn24h(xpPerHour),
    trialXpContribution: computeTrialXpContribution(xpPerHour),
    soloCompletes: soloCompletesTrial(xpPerHour, required),
  });
}

function applyAssignment(
  member: Member,
  skill: Skill,
  skillState: Map<Skill, SkillState>,
  profiles: ProfilesMap,
): void {
  const st = skillState.get(skill)!;
  st.memberCount += 1;
  st.contributed += memberContributionForSkill(profiles.get(member), skill);
}

/**
 * Build suggested assignments for unscheduled members.
 *
 * Phase 1 — while the planner still has gaps (uncovered skill or XP shortfall on signups):
 * steer members to those trials; never stack onto a ranked skill that already has enough
 * scheduled XP while planner work remains.
 *
 * Phase 2 — when every skill is mark-done or has a planner signup: seat each leftover
 * member on their highest-ranked unlocked skill (even if someone is already scheduled there).
 */
export function buildOptimalSchedule(
  profiles: ProfilesMap,
  existingSignups: TrialSignup[],
  weekDays: string[],
  hallLevel: number,
  members: readonly Member[],
  completedSkills: ReadonlySet<Skill> = EMPTY_COMPLETED_SKILLS,
): SchedulePlan {
  const required = trialXpRequired(hallLevel);
  const alreadyScheduled = [...existingSignups];
  const scheduledMembers = new Set(existingSignups.map((s) => s.member_name));
  const preferenceOverflow = plannerCoversAllSkills(existingSignups, completedSkills);
  const plannerSkillState = initSkillState(existingSignups, profiles);
  const skillState = initSkillState(existingSignups, profiles);

  const dayLoad = new Map<string, number>();
  for (const d of weekDays) dayLoad.set(d, 0);
  for (const s of existingSignups) {
    dayLoad.set(s.planned_date, (dayLoad.get(s.planned_date) ?? 0) + 1);
  }

  let pool = members.filter((m) => !scheduledMembers.has(m));
  const suggestions: ScheduleSuggestion[] = [];

  function assign(member: Member, skill: Skill) {
    const weekStart = weekDays[0];
    const { plannedDate, plannedStartAt } = pickSuggestionTiming(
      weekStart,
      weekDays,
      skill,
      dayLoad,
    );
    pushSuggestion(suggestions, member, skill, plannedDate, plannedStartAt, profiles, required);
    applyAssignment(member, skill, skillState, profiles);
    pool = pool.filter((m) => m !== member);
  }

  if (preferenceOverflow) {
    for (const member of [...pool].sort((a, b) => a.localeCompare(b))) {
      const skill = pickPreferenceOverflowSkill(member, profiles, completedSkills);
      if (skill) assign(member, skill);
    }
  } else {
    let safety = 500;
    while (pool.length > 0 && safety-- > 0) {
      let bestMember: Member | null = null;
      let bestSkill: Skill | null = null;
      let bestScore = -1;

      for (const member of pool) {
        for (const skill of SKILLS) {
          const score = scoreAssignment(
            member,
            skill,
            profiles,
            skillState,
            plannerSkillState,
            required,
            completedSkills,
            false,
          );
          if (score < 0) continue;
          if (
            score > bestScore ||
            (score === bestScore && bestMember != null && member.localeCompare(bestMember) < 0)
          ) {
            bestScore = score;
            bestMember = member;
            bestSkill = skill;
          }
        }
      }

      if (!bestMember || !bestSkill) break;
      assign(bestMember, bestSkill);
    }
  }

  const membersWithPreferences = membersWithRankedProfiles(profiles, members);
  const skillProgress = buildSkillProgress(skillState, required);
  const scheduledProgress = buildSkillProgress(plannerSkillState, required);
  const skillsCoveredOnPlanner = SKILLS.filter(
    (skill) =>
      completedSkills.has(skill) || plannerSkillState.get(skill)!.memberCount > 0,
  ).length;
  const skillsCoveredAfterPlan = skillProgress.filter((s) => s.memberCount > 0).length;
  const skillsXpCompleteOnPlanner = scheduledProgress.filter((s) => s.remaining <= 0).length;
  const skillsXpCompleteAfterPlan = skillProgress.filter((s) => s.remaining <= 0).length;
  const allSkillsOnPlannerOrDone = plannerCoversAllSkills(existingSignups, completedSkills);
  const skillsMissingFromPlanner = SKILLS.filter(
    (skill) => !completedSkills.has(skill) && plannerSkillState.get(skill)!.memberCount === 0,
  );

  const suggestedStats = computeAssignmentPrefStats(
    suggestions.map((s) => ({ member: s.member, skill: s.skill })),
    profiles,
    required,
  );
  const scheduledStats = computeAssignmentPrefStats(
    alreadyScheduled.map((s) => ({ member: s.member_name, skill: s.skill as Skill })),
    profiles,
    required,
  );

  return {
    suggestions: suggestions.sort((a, b) => a.member.localeCompare(b.member)),
    alreadyScheduled,
    trialXpRequired: required,
    hallLevel,
    skillProgress,
    scheduledSkillProgress: buildSkillProgress(plannerSkillState, required),
    totalMembers: members.length,
    stats: {
      suggested: suggestedStats,
      scheduled: scheduledStats,
      skillsCoveredOnPlanner,
      skillsCoveredAfterPlan,
      skillsXpCompleteOnPlanner,
      skillsXpCompleteAfterPlan,
      allSkillsOnPlannerOrDone,
      skillsMissingFromPlanner,
      membersWithPreferences,
    },
  };
}
