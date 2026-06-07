import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";
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
import { buildStartAt } from "./trial-schedule";
import type { TrialSignup } from "./types";

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

export interface SchedulePlan {
  suggestions: ScheduleSuggestion[];
  alreadyScheduled: TrialSignup[];
  trialXpRequired: number;
  hallLevel: number;
  skillProgress: SkillXpProgress[];
  stats: {
    totalSuggestions: number;
    gotFirstChoice: number;
    gotSecondChoice: number;
    gotThirdChoice: number;
    gotTopEightChoice: number;
    noPreferenceMatch: number;
    skillsCoveredAfterPlan: number;
    skillsXpCompleteAfterPlan: number;
    membersWithPreferences: number;
    soloCompletesCount: number;
  };
}

type SkillState = { contributed: number; memberCount: number };

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

/** Stagger start times within a day (every 2h) to reduce overlap on the timeline. */
function pickStartAt(day: string, dayLoad: Map<string, number>): string {
  const count = dayLoad.get(day) ?? 0;
  const hour = Math.min(22, 6 + (count % 9) * 2);
  return buildStartAt(day, hour, 0);
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

function allTrialsComplete(skillState: Map<Skill, SkillState>, required: number): boolean {
  return SKILLS.every((sk) => {
    const st = skillState.get(sk)!;
    return st.memberCount > 0 && st.contributed >= required;
  });
}

/**
 * Don't seat a member on a lower-ranked skill while a higher-ranked pref trial
 * still needs coverage or trial XP.
 */
function canAssignMemberToSkill(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): boolean {
  if (isSkillLockedForMember(profiles.get(member), skill)) return false;

  const preferred = memberPreferredSkills(profiles.get(member));
  if (preferred.length === 0) return true;
  if (preferred.includes(skill)) return true;

  for (const ps of preferred) {
    const st = skillState.get(ps)!;
    if (st.memberCount === 0 || st.contributed < required) return false;
  }
  return true;
}

/** 2 = uncovered, 1 = needs XP, 0 = complete */
function assignmentNeedTier(st: SkillState, required: number): number {
  if (st.memberCount === 0) return 2;
  if (st.contributed < required) return 1;
  return 0;
}

/**
 * Score a member→skill pairing. Preference rank dominates within the same need tier;
 * XP/h only breaks ties. Uncovered skills beat XP gaps; XP gaps beat already-complete skills.
 */
function scoreAssignment(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  trialsComplete: boolean,
): number {
  if (!canAssignMemberToSkill(member, skill, profiles, skillState, required)) return -1;

  const st = skillState.get(skill)!;
  const needTier = assignmentNeedTier(st, required);
  if (needTier === 0 && !trialsComplete) return -1;

  const rank = getPreferenceRankFromProfile(profiles.get(member), skill);
  const pref = preferenceBonus(rank);
  const xp = memberContributionForSkill(profiles.get(member), skill);

  if (trialsComplete && needTier === 0) {
    return pref * 1_000_000 + xp;
  }

  const remaining = Math.max(0, required - st.contributed);
  return needTier * 1_000_000_000_000 + pref * 1_000_000_000 + xp * 1_000 + remaining;
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
 * Each step picks the best member→skill pair globally:
 * 1. Cover every skill (at least one member each)
 * 2. Fill trial XP gaps until all skills meet the hall requirement
 * 3. Seat any remaining members on their best available preference
 *
 * Within each need tier, profile preference rank is primary; XP/h breaks ties only.
 */
export function buildOptimalSchedule(
  profiles: ProfilesMap,
  existingSignups: TrialSignup[],
  weekDays: string[],
  hallLevel: number,
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

  let pool = MEMBERS.filter((m) => !scheduledMembers.has(m));
  const suggestions: ScheduleSuggestion[] = [];

  function assign(member: Member, skill: Skill) {
    const plannedDate = pickDay(weekDays, dayLoad);
    const plannedStartAt = pickStartAt(plannedDate, dayLoad);
    pushSuggestion(suggestions, member, skill, plannedDate, plannedStartAt, profiles, required);
    applyAssignment(member, skill, skillState, profiles);
    pool = pool.filter((m) => m !== member);
  }

  let safety = 500;
  while (pool.length > 0 && safety-- > 0) {
    const trialsComplete = allTrialsComplete(skillState, required);
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
          trialsComplete,
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

  const membersWithPreferences = membersWithRankedProfiles(profiles);
  const skillProgress = buildSkillProgress(skillState, required);
  const skillsCoveredAfterPlan = skillProgress.filter((s) => s.memberCount > 0).length;
  const skillsXpCompleteAfterPlan = skillProgress.filter((s) => s.remaining <= 0).length;

  return {
    suggestions: suggestions.sort((a, b) => a.member.localeCompare(b.member)),
    alreadyScheduled,
    trialXpRequired: required,
    hallLevel,
    skillProgress,
    stats: {
      totalSuggestions: suggestions.length,
      gotFirstChoice: suggestions.filter((s) => s.preferenceRank === 1).length,
      gotSecondChoice: suggestions.filter((s) => s.preferenceRank === 2).length,
      gotThirdChoice: suggestions.filter((s) => s.preferenceRank === 3).length,
      gotTopEightChoice: suggestions.filter(
        (s) => s.preferenceRank != null && s.preferenceRank <= 8,
      ).length,
      noPreferenceMatch: suggestions.filter((s) => s.preferenceRank == null).length,
      skillsCoveredAfterPlan,
      skillsXpCompleteAfterPlan,
      membersWithPreferences,
      soloCompletesCount: suggestions.filter((s) => s.soloCompletes === true).length,
    },
  };
}
