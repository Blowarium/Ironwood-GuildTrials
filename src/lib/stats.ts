import { MEMBERS, SKILLS, type Skill } from "./constants";
import type { SkillWeekCompletion, TrialSignup } from "./types";

export type SkillWeekState = "needs_signup" | "in_progress" | "complete";

export interface SkillCoverageRow {
  skill: Skill;
  contributorCount: number;
  weekState: SkillWeekState;
  markedComplete: boolean;
  markedBy: string | null;
}

export interface GuildStats {
  /** Skills manually marked complete for the week */
  skillsCompleted: number;
  skillsCompletedPercent: number;
  totalSkills: number;
  /** Has signups but not marked complete — may need more members */
  skillsInProgress: Skill[];
  /** No signups yet */
  skillsNeedingSignup: Skill[];
  skillCoverage: SkillCoverageRow[];
  assignedCount: number;
  totalMembers: number;
  unassignedMembers: string[];
}

export function buildCompletionMap(
  completions: SkillWeekCompletion[],
): Map<Skill, SkillWeekCompletion> {
  const map = new Map<Skill, SkillWeekCompletion>();
  for (const c of completions) {
    if (c.completed) map.set(c.skill, c);
  }
  return map;
}

export function computeGuildStats(
  signups: TrialSignup[],
  completions: SkillWeekCompletion[],
): GuildStats {
  const assignedMembers = new Set(signups.map((s) => s.member_name));
  const unassignedMembers = MEMBERS.filter((m) => !assignedMembers.has(m));
  const completionMap = buildCompletionMap(completions);

  const skillCoverage: SkillCoverageRow[] = SKILLS.map((skill) => {
    const contributors = signups.filter((s) => s.skill === skill);
    const contributorCount = contributors.length;
    const marked = completionMap.get(skill);
    const markedComplete = !!marked?.completed;

    let weekState: SkillWeekState;
    if (markedComplete) {
      weekState = "complete";
    } else if (contributorCount > 0) {
      weekState = "in_progress";
    } else {
      weekState = "needs_signup";
    }

    return {
      skill,
      contributorCount,
      weekState,
      markedComplete,
      markedBy: marked?.marked_by ?? null,
    };
  });

  const skillsCompleted = skillCoverage.filter((s) => s.weekState === "complete").length;
  const totalSkills = SKILLS.length;
  const skillsCompletedPercent = Math.round((skillsCompleted / totalSkills) * 100);
  const skillsInProgress = skillCoverage
    .filter((s) => s.weekState === "in_progress")
    .map((s) => s.skill);
  const skillsNeedingSignup = skillCoverage
    .filter((s) => s.weekState === "needs_signup")
    .map((s) => s.skill);

  return {
    skillsCompleted,
    skillsCompletedPercent,
    totalSkills,
    skillsInProgress,
    skillsNeedingSignup,
    skillCoverage,
    assignedCount: signups.length,
    totalMembers: MEMBERS.length,
    unassignedMembers: [...unassignedMembers],
  };
}

export function buildCellMap(signups: TrialSignup[]): Map<string, TrialSignup[]> {
  const map = new Map<string, TrialSignup[]>();
  for (const s of signups) {
    const k = cellKey(s.skill, s.planned_date);
    const list = map.get(k) ?? [];
    list.push(s);
    map.set(k, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.member_name.localeCompare(b.member_name));
  }
  return map;
}

export function cellKey(skill: string, day: string): string {
  return `${skill}|${day}`;
}

export function signupsInCell(
  signups: TrialSignup[],
  skill: string,
  day: string,
): TrialSignup[] {
  return signups.filter((s) => s.skill === skill && s.planned_date === day);
}
