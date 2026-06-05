import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";
import {
  compareSkillsByPreferenceRank,
  getPreferenceRankFromProfile,
  getXpPerHourForSkill,
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
    noPreferenceMatch: number;
    skillsCoveredAfterPlan: number;
    skillsXpCompleteAfterPlan: number;
    membersWithPreferences: number;
    soloCompletesCount: number;
  };
}

type SkillState = { contributed: number; memberCount: number };

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

/** Rank 1 → 16, rank 16 → 1. Used to compare preference fit across ranks 1–16. */
function preferenceBonus(rank: number | null): number {
  if (rank == null || rank < 1) return 0;
  return 17 - Math.min(rank, 16);
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
    .filter((s) => s.preference_rank != null && s.preference_rank > 0)
    .sort(compareSkillsByPreferenceRank)
    .map((s) => s.skill);
}

function allTrialsComplete(skillState: Map<Skill, SkillState>, required: number): boolean {
  return SKILLS.every((sk) => {
    const st = skillState.get(sk)!;
    return st.memberCount > 0 && st.contributed >= required;
  });
}

/** Don't pull members onto off-pref skills while a higher-ranked pref still needs coverage or XP. */
function canAssignMemberToSkill(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): boolean {
  const preferred = memberPreferredSkills(profiles.get(member));
  if (preferred.length === 0) return true;
  if (preferred.includes(skill)) return true;

  for (const ps of preferred) {
    const st = skillState.get(ps)!;
    if (st.memberCount === 0 || st.contributed < required) return false;
  }
  return true;
}

function pickBestScoredMember(
  candidates: Member[],
  skill: Skill,
  profiles: ProfilesMap,
  scoreFn: (rank: number | null, xpContribution: number) => number,
): Member | null {
  let best: Member | null = null;
  let bestScore = -Infinity;
  for (const member of candidates) {
    const profile = profiles.get(member);
    const rank = getPreferenceRankFromProfile(profile, skill);
    const xp = memberContributionForSkill(profile, skill);
    const score = scoreFn(rank, xp);
    if (score > bestScore || (score === bestScore && best && member.localeCompare(best) < 0)) {
      bestScore = score;
      best = member;
    }
  }
  return best;
}

function scoreMemberPreferenceFirst(rank: number | null, xp: number): number {
  return preferenceBonus(rank) * 1_000_000 + xp;
}

/** Priority: preferences first, XP/h as tiebreaker (initial seat on an uncovered skill). */
function pickMemberForSkillCoverage(
  pool: Member[],
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): Member | null {
  const eligible = pool.filter((m) =>
    canAssignMemberToSkill(m, skill, profiles, skillState, required),
  );
  if (eligible.length === 0) return null;

  return pickBestScoredMember(eligible, skill, profiles, scoreMemberPreferenceFirst);
}

/** Same member scoring as coverage: pref rank first, XP/h tiebreaker. */
function pickMemberForSkillXpGap(
  pool: Member[],
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): Member | null {
  const eligible = pool.filter((m) =>
    canAssignMemberToSkill(m, skill, profiles, skillState, required),
  );
  if (eligible.length === 0) return null;

  return pickBestScoredMember(eligible, skill, profiles, scoreMemberPreferenceFirst);
}

/** After trials are complete (or as fallback), seat member on their highest viable pref. */
function pickBestSkillForMemberPreferences(
  member: Member,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): Skill | null {
  const profile = profiles.get(member);
  const ranked = memberPreferredSkills(profile);
  const trialsDone = allTrialsComplete(skillState, required);

  for (const skill of ranked) {
    if (!canAssignMemberToSkill(member, skill, profiles, skillState, required)) continue;
    const st = skillState.get(skill)!;
    if (trialsDone) return skill;
    if (st.memberCount === 0 || st.contributed < required) return skill;
  }

  let bestSkill: Skill | null = null;
  let bestScore = -Infinity;
  for (const skill of SKILLS) {
    if (!canAssignMemberToSkill(member, skill, profiles, skillState, required)) continue;
    const st = skillState.get(skill)!;
    const remaining = Math.max(0, required - st.contributed);
    const needMembers = st.memberCount === 0 ? 1_000_000 : 0;
    const rank = getPreferenceRankFromProfile(profile, skill);
    const xp = memberContributionForSkill(profile, skill);
    const score =
      needMembers + remaining * 2 + preferenceBonus(rank) * 10_000 + xp;
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }
  return bestSkill;
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

function skillsByNeed(
  skillState: Map<Skill, SkillState>,
  required: number,
): Skill[] {
  return [...SKILLS].sort((a, b) => {
    const sa = skillState.get(a)!;
    const sb = skillState.get(b)!;
    const uncoveredA = sa.memberCount === 0 ? 1 : 0;
    const uncoveredB = sb.memberCount === 0 ? 1 : 0;
    if (uncoveredB !== uncoveredA) return uncoveredB - uncoveredA;
    const ra = Math.max(0, required - sa.contributed);
    const rb = Math.max(0, required - sb.contributed);
    if (rb !== ra) return rb - ra;
    return sa.memberCount - sb.memberCount;
  });
}

/**
 * Build suggested assignments for unscheduled members.
 *
 * Priority order:
 * 1. Complete all trials — every skill gets coverage, then enough trial XP
 * 2. Preferences — members seated on highest-ranked pref first; pref rank beats XP when picking who
 * 3. XP/h — used to pick which skill still needs help and as a tiebreaker only
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

  // Phase 1: at least one member per skill (all 16 trials have coverage)
  // 1a — member-first: seat each member on their highest-ranked pref that still has no one
  for (const member of [...pool]) {
    for (const skill of memberPreferredSkills(profiles.get(member))) {
      if ((skillState.get(skill)?.memberCount ?? 0) > 0) continue;
      if (!canAssignMemberToSkill(member, skill, profiles, skillState, required)) continue;
      assign(member, skill);
      break;
    }
  }

  // 1b — fill any remaining uncovered skills (pref rank first, XP/h tiebreak)
  for (const skill of SKILLS) {
    if ((skillState.get(skill)?.memberCount ?? 0) > 0) continue;
    const member = pickMemberForSkillCoverage(
      pool,
      skill,
      profiles,
      skillState,
      required,
    );
    if (!member) continue;
    assign(member, skill);
  }

  // Phase 2: fill trial XP gaps until every skill meets the hall requirement
  let safety = 500;
  while (pool.length > 0 && safety-- > 0) {
    const needy = skillsByNeed(skillState, required).filter(
      (sk) => (skillState.get(sk)?.contributed ?? 0) < required,
    );
    if (needy.length === 0) break;
    const skill = needy[0];
    const member = pickMemberForSkillXpGap(
      pool,
      skill,
      profiles,
      skillState,
      required,
    );
    if (!member) break;
    assign(member, skill);
  }

  // Phase 3: remaining members — highest ranked pref once trials are done, else best fallback
  for (const member of [...pool]) {
    const skill = pickBestSkillForMemberPreferences(
      member,
      profiles,
      skillState,
      required,
    );
    if (skill) assign(member, skill);
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
      noPreferenceMatch: suggestions.filter((s) => s.preferenceRank == null).length,
      skillsCoveredAfterPlan,
      skillsXpCompleteAfterPlan,
      membersWithPreferences,
      soloCompletesCount: suggestions.filter((s) => s.soloCompletes === true).length,
    },
  };
}
