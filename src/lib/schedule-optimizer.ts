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

/** Align suggestion timing with the matching guild event active window that week. */
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

/**
 * Highest-ranked preferred skill this member should take next, given who is already
 * scheduled. Coverage (no one on the skill yet) wins over stacking XP on a skill
 * someone else is already doing.
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
    if (completedSkills.has(skill)) continue;
    if (skillState.get(skill)!.memberCount === 0) return skill;
  }
  for (const skill of preferred) {
    if (completedSkills.has(skill)) continue;
    if (skillState.get(skill)!.contributed < required) return skill;
  }
  return null;
}

/** True when every ranked preference is marked done for the week. */
function allPreferredSkillsSatisfied(
  member: Member,
  profiles: ProfilesMap,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  const preferred = memberPreferredSkills(profiles.get(member));
  if (preferred.length === 0) return true;
  return preferred.every((skill) => completedSkills.has(skill));
}

function allSkillsMarkedComplete(completedSkills: ReadonlySet<Skill>): boolean {
  return SKILLS.every((sk) => completedSkills.has(sk));
}

/** Pref skill with scheduled coverage and projected XP but not marked done yet. */
function isBlockedPreferenceSkill(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  const preferred = memberPreferredSkills(profiles.get(member));
  if (!preferred.includes(skill)) return false;
  if (completedSkills.has(skill)) return false;
  const st = skillState.get(skill)!;
  return st.memberCount > 0 && st.contributed >= required;
}


function canAssignMemberToSkill(
  member: Member,
  skill: Skill,
  profiles: ProfilesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): boolean {
  if (isSkillLockedForMember(profiles.get(member), skill)) return false;

  const st = skillState.get(skill)!;
  const skillMarkedDone = completedSkills.has(skill);
  const preferred = memberPreferredSkills(profiles.get(member));

  if (preferred.length === 0) {
    if (skillMarkedDone) return allSkillsMarkedComplete(completedSkills);
    if (st.memberCount === 0) return true;
    if (st.contributed < required) return true;
    // Backup on unmarked skills that already have projected XP from signups.
    if (!skillMarkedDone) return true;
    return allSkillsMarkedComplete(completedSkills);
  }

  const nextPref = preferredAssignmentSkill(
    member,
    profiles,
    skillState,
    required,
    completedSkills,
  );
  if (nextPref != null) {
    return skill === nextPref;
  }

  if (!allPreferredSkillsSatisfied(member, profiles, completedSkills)) {
    if (skillMarkedDone) return false;
    if (
      isBlockedPreferenceSkill(member, skill, profiles, skillState, required, completedSkills)
    ) {
      return false;
    }
    if (st.memberCount === 0) return true;
    if (st.contributed < required) return true;
    // Backup on unmarked skills with projected XP — not on blocked prefs above.
    return true;
  }

  if (skillMarkedDone) return allSkillsMarkedComplete(completedSkills);
  if (st.memberCount === 0) return true;
  if (st.contributed < required) return true;
  // All prefs marked done — seat on any remaining unmarked trial.
  return !skillMarkedDone;
}

/** 3 = uncovered, 2 = needs XP, 1 = covered but unmarked, 0 = marked done */
function assignmentNeedTier(
  skill: Skill,
  st: SkillState,
  required: number,
  completedSkills: ReadonlySet<Skill>,
): number {
  if (completedSkills.has(skill)) return 0;
  if (st.memberCount === 0) return 3;
  if (st.contributed < required) return 2;
  return 1;
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
  completedSkills: ReadonlySet<Skill>,
): number {
  if (
    !canAssignMemberToSkill(
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
  const needTier = assignmentNeedTier(skill, st, required, completedSkills);
  if (needTier === 0) return -1;

  const rank = getPreferenceRankFromProfile(profiles.get(member), skill);
  const pref = preferenceBonus(rank);
  const xp = memberContributionForSkill(profiles.get(member), skill);

  const remaining = Math.max(0, required - st.contributed);
  return needTier * 1_000_000_000_000 + pref * 1_000_000_000 + xp * 1_000 + remaining;
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
 * Each step picks the best member→skill pair globally:
 * 1. Cover every skill (at least one member each)
 * 2. Fill trial XP gaps until all skills meet the hall requirement
 * 3. Seat any remaining members on their best available preference
 *
 * Scheduled planner signups are applied first — each unscheduled member is steered
 * to their highest preferred skill that still needs coverage; once a skill has
 * someone scheduled, other members move to their next open preference.
 *
 * Skills marked done for the week are treated as complete. A skill with scheduled
 * coverage and projected XP but not marked done still counts as open — suggestions
 * prioritize uncovered skills and XP gaps first, then backup slots on other unmarked
 * trials (without stacking a member onto a preferred skill that already has coverage).
 *
 * Within each need tier, profile preference rank is primary; XP/h breaks ties only.
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
