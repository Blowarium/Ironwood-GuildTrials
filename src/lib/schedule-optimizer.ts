import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";
import {
  getPreferenceRank,
  getPreferenceScore,
  getXpPerHourForPreference,
  type MemberPreferences,
  type PreferencesMap,
} from "./preferences";
import {
  memberContributionForSkill,
  skillXpIn24h,
  soloCompletesTrial,
  trialXpContribution as computeTrialXpContribution,
  trialXpRequired,
  type SkillXpProgress,
} from "./trial-xp";
import type { TrialSignup } from "./types";

export interface ScheduleSuggestion {
  member: Member;
  skill: Skill;
  plannedDate: string;
  preferenceRank: 1 | 2 | 3 | null;
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

function initSkillState(
  existingSignups: TrialSignup[],
  preferences: PreferencesMap,
): Map<Skill, SkillState> {
  const map = new Map<Skill, SkillState>();
  for (const sk of SKILLS) map.set(sk, { contributed: 0, memberCount: 0 });
  for (const s of existingSignups) {
    const skill = s.skill as Skill;
    const st = map.get(skill)!;
    st.memberCount += 1;
    st.contributed += memberContributionForSkill(
      preferences.get(s.member_name),
      skill,
    );
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

function memberPreferredSkills(prefs: MemberPreferences | undefined): Skill[] {
  if (!prefs) return [];
  const out: Skill[] = [];
  if (prefs.pref_1) out.push(prefs.pref_1);
  if (prefs.pref_2) out.push(prefs.pref_2);
  if (prefs.pref_3) out.push(prefs.pref_3);
  return out;
}

/** Don't pull members onto off-pref skills while a listed pref still needs coverage or XP. */
function canAssignMemberToSkill(
  member: Member,
  skill: Skill,
  preferences: PreferencesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): boolean {
  const preferred = memberPreferredSkills(preferences.get(member));
  if (preferred.length === 0) return true;
  if (preferred.includes(skill)) return true;

  for (const ps of preferred) {
    const st = skillState.get(ps)!;
    if (st.memberCount === 0 || st.contributed < required) return false;
  }
  return true;
}

function scoreMemberForSkill(
  member: Member,
  skill: Skill,
  preferences: PreferencesMap,
  remainingXp: number,
): number {
  const prefs = preferences.get(member);
  const rank = getPreferenceRank(prefs, skill);
  const pref =
    rank === 1 ? 1_000_000 : rank === 2 ? 500_000 : rank === 3 ? 250_000 : 0;
  const contrib = memberContributionForSkill(prefs, skill);
  const xpFill = remainingXp > 0 ? Math.min(contrib, remainingXp) : contrib;
  return pref + xpFill;
}

function pickMemberForSkill(
  pool: Member[],
  skill: Skill,
  preferences: PreferencesMap,
  remainingXp: number,
  skillState: Map<Skill, SkillState>,
  required: number,
): Member | null {
  const eligible = pool.filter((m) =>
    canAssignMemberToSkill(m, skill, preferences, skillState, required),
  );
  const withPref = eligible.filter(
    (m) => getPreferenceRank(preferences.get(m), skill) !== null,
  );
  const candidates = withPref.length > 0 ? withPref : eligible;
  if (candidates.length === 0) return null;

  let best: Member | null = null;
  let bestScore = -1;
  for (const member of candidates) {
    const score = scoreMemberForSkill(member, skill, preferences, remainingXp);
    if (score > bestScore || (score === bestScore && best && member.localeCompare(best) < 0)) {
      bestScore = score;
      best = member;
    }
  }
  return best;
}

function pickBestSkillForMember(
  member: Member,
  preferences: PreferencesMap,
  skillState: Map<Skill, SkillState>,
  required: number,
): Skill | null {
  const prefs = preferences.get(member);
  const ranked: Skill[] = [];
  if (prefs?.pref_1) ranked.push(prefs.pref_1);
  if (prefs?.pref_2) ranked.push(prefs.pref_2);
  if (prefs?.pref_3) ranked.push(prefs.pref_3);

  for (const skill of ranked) {
    const st = skillState.get(skill)!;
    if (st.memberCount === 0 || st.contributed < required) return skill;
  }

  let bestSkill: Skill | null = null;
  let bestScore = -Infinity;
  for (const skill of SKILLS) {
    if (!canAssignMemberToSkill(member, skill, preferences, skillState, required)) continue;
    const st = skillState.get(skill)!;
    const remaining = Math.max(0, required - st.contributed);
    const needMembers = st.memberCount === 0 ? 50_000 : 0;
    const score =
      needMembers +
      remaining * 2 +
      getPreferenceScore(prefs, skill) * 10_000 +
      memberContributionForSkill(prefs, skill);
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
  preferences: PreferencesMap,
  required: number,
): void {
  const prefs = preferences.get(member);
  const xpPerHour = getXpPerHourForPreference(prefs, skill);
  suggestions.push({
    member,
    skill,
    plannedDate,
    preferenceRank: getPreferenceRank(prefs, skill),
    preferenceScore: getPreferenceScore(prefs, skill),
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
  preferences: PreferencesMap,
): void {
  const st = skillState.get(skill)!;
  st.memberCount += 1;
  st.contributed += memberContributionForSkill(preferences.get(member), skill);
}

export function buildOptimalSchedule(
  preferences: PreferencesMap,
  existingSignups: TrialSignup[],
  weekDays: string[],
  hallLevel: number,
): SchedulePlan {
  const required = trialXpRequired(hallLevel);
  const alreadyScheduled = [...existingSignups];
  const scheduledMembers = new Set(existingSignups.map((s) => s.member_name));
  const skillState = initSkillState(existingSignups, preferences);

  const dayLoad = new Map<string, number>();
  for (const d of weekDays) dayLoad.set(d, 0);
  for (const s of existingSignups) {
    dayLoad.set(s.planned_date, (dayLoad.get(s.planned_date) ?? 0) + 1);
  }

  let pool = MEMBERS.filter((m) => !scheduledMembers.has(m));
  const suggestions: ScheduleSuggestion[] = [];

  function assign(member: Member, skill: Skill) {
    const plannedDate = pickDay(weekDays, dayLoad);
    pushSuggestion(suggestions, member, skill, plannedDate, preferences, required);
    applyAssignment(member, skill, skillState, preferences);
    pool = pool.filter((m) => m !== member);
  }

  const skillsByNeed = () =>
    [...SKILLS].sort((a, b) => {
      const ra = Math.max(0, required - (skillState.get(a)?.contributed ?? 0));
      const rb = Math.max(0, required - (skillState.get(b)?.contributed ?? 0));
      if (rb !== ra) return rb - ra;
      return (skillState.get(a)?.memberCount ?? 0) - (skillState.get(b)?.memberCount ?? 0);
    });

  // Phase 0: seat members on their top preferences when those skills still need help
  for (const member of [...pool]) {
    const skill = pickBestSkillForMember(member, preferences, skillState, required);
    if (!skill) continue;
    const prefs = preferences.get(member);
    const isListedPref =
      skill === prefs?.pref_1 || skill === prefs?.pref_2 || skill === prefs?.pref_3;
    const st = skillState.get(skill)!;
    const skillNeedsHelp = st.memberCount === 0 || st.contributed < required;
    if (isListedPref && skillNeedsHelp) assign(member, skill);
  }

  // Phase 1: at least one member per skill
  for (const skill of SKILLS) {
    if ((skillState.get(skill)?.memberCount ?? 0) > 0) continue;
    const member = pickMemberForSkill(
      pool,
      skill,
      preferences,
      required,
      skillState,
      required,
    );
    if (!member) break;
    assign(member, skill);
  }

  // Phase 2: fill XP gaps (may add multiple members per skill)
  let safety = 500;
  while (pool.length > 0 && safety-- > 0) {
    const needy = skillsByNeed().filter(
      (sk) => (skillState.get(sk)?.contributed ?? 0) < required,
    );
    if (needy.length === 0) break;
    const skill = needy[0];
    const remaining = required - (skillState.get(skill)?.contributed ?? 0);
    const member = pickMemberForSkill(
      pool,
      skill,
      preferences,
      remaining,
      skillState,
      required,
    );
    if (!member) break;
    assign(member, skill);
  }

  // Phase 3: remaining members
  for (const member of [...pool]) {
    const skill = pickBestSkillForMember(member, preferences, skillState, required);
    if (skill) assign(member, skill);
  }

  let membersWithPreferences = 0;
  for (const m of MEMBERS) {
    const p = preferences.get(m);
    if (p?.pref_1 || p?.pref_2 || p?.pref_3) membersWithPreferences++;
  }

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
      noPreferenceMatch: suggestions.filter((s) => s.preferenceRank === null).length,
      skillsCoveredAfterPlan,
      skillsXpCompleteAfterPlan,
      membersWithPreferences,
      soloCompletesCount: suggestions.filter((s) => s.soloCompletes === true).length,
    },
  };
}
