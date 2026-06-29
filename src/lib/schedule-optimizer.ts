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
    skillsCoveredAfterPlan: number;
    skillsXpCompleteAfterPlan: number;
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

/** True while any skill still needs a first signup or more trial XP. */
function guildHasPriorityWork(
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  return SKILLS.some((skill) => {
    const need = classifySkillNeed(skill, skillState, required, completedSkills);
    return need === "uncovered" || need === "needs_xp";
  });
}

function skillHasAdequateXp(st: SkillState, required: number): boolean {
  return st.memberCount > 0 && st.contributed >= required;
}

/** Member ranks this skill and signups already project enough XP — don't stack them here. */
function isHandledPreferenceForMember(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  if (completedSkills.has(skill)) return false;
  const preferred = memberPreferredSkills(profiles.get(member));
  if (!preferred.includes(skill)) return false;
  return skillHasAdequateXp(skillState.get(skill)!, required);
}

/**
 * Highest-ranked preferred skill that still needs coverage or XP (ignores covered prefs).
 * Useful for UI hints — not used to hard-block other assignments.
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

function canSuggestMemberOnSkill(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  if (isSkillLockedForMember(profiles.get(member), skill)) return false;

  const need = classifySkillNeed(skill, skillState, required, completedSkills);
  if (need === "done") return false;

  if (need === "uncovered" || need === "needs_xp") return true;

  // Covered but not marked done — backup slots only after guild priority work is finished.
  if (guildHasPriorityWork(skillState, required, completedSkills)) return false;
  if (
    isHandledPreferenceForMember(
      member,
      skill,
      profiles,
      skillState,
      required,
      completedSkills,
    )
  ) {
    return false;
  }
  return true;
}

/** 4 = uncovered, 3 = needs XP, 1 = covered backup, 0 = invalid */
function assignmentPriorityTier(
  skill: Skill,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): number {
  const need = classifySkillNeed(skill, skillState, required, completedSkills);
  switch (need) {
    case "uncovered":
      return 4;
    case "needs_xp":
      return 3;
    case "covered":
      return 1;
    default:
      return 0;
  }
}

function scoreAssignment(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): number {
  if (
    !canSuggestMemberOnSkill(
      member,
      skill,
      profiles,
      skillState,
      required,
      completedSkills,
    )
  ) {
    return -1;
  }

  const st = skillState.get(skill)!;
  const tier = assignmentPriorityTier(skill, skillState, required, completedSkills);
  if (tier === 0) return -1;

  const rank = getPreferenceRankFromProfile(profiles.get(member), skill);
  const pref = preferenceBonus(rank);
  const xp = memberContributionForSkill(profiles.get(member), skill);
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
 * Respects existing planner signups and mark-done flags, then each step picks the
 * best member→skill pair globally:
 *
 * 1. Cover every unmarked skill (no signup yet)
 * 2. Fill trial XP gaps on unmarked skills (projected XP below hall requirement)
 * 3. Seat remaining members on backup slots for covered-but-unmarked trials — never
 *    on a ranked preference that already has sufficient scheduled XP
 *
 * Within each tier, preference rank is primary; XP/h breaks ties.
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
          required,
          completedSkills,
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

  const membersWithPreferences = membersWithRankedProfiles(profiles, members);
  const skillProgress = buildSkillProgress(skillState, required);
  const skillsCoveredAfterPlan = skillProgress.filter((s) => s.memberCount > 0).length;
  const skillsXpCompleteAfterPlan = skillProgress.filter((s) => s.remaining <= 0).length;

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
    scheduledSkillProgress: buildSkillProgress(initSkillState(existingSignups, profiles), required),
    totalMembers: members.length,
    stats: {
      suggested: suggestedStats,
      scheduled: scheduledStats,
      skillsCoveredAfterPlan,
      skillsXpCompleteAfterPlan,
      membersWithPreferences,
    },
  };
}
