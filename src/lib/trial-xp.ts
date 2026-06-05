import type { Skill } from "./constants";
import { getXpPerHourForSkill, type MemberProfile } from "./member-profile";

/** XP required to complete one skill trial for the week. */
export function trialXpRequired(hallLevel: number): number {
  const level = Math.max(0, Math.floor(hallLevel));
  return 8000 * (level + 1);
}

/** Share of skill XP earned during a trial that counts toward the guild trial bar. */
export const TRIAL_XP_FROM_SKILL_XP_RATE = 0.05;

/** Skill XP earned in one 24h trial at the given hourly rate. */
export function skillXpIn24h(xpPerHour: number | null | undefined): number {
  if (!xpPerHour || xpPerHour <= 0) return 0;
  return xpPerHour * 24;
}

/** Trial XP contributed in one 24h trial (5% of skill XP earned). */
export function trialXpContribution(xpPerHour: number | null | undefined): number {
  const skillXp = skillXpIn24h(xpPerHour);
  if (skillXp <= 0) return 0;
  return Math.round(skillXp * TRIAL_XP_FROM_SKILL_XP_RATE);
}

export function memberContributionForSkill(
  profile: MemberProfile | undefined,
  skill: Skill,
): number {
  return trialXpContribution(getXpPerHourForSkill(profile, skill));
}

export function formatXp(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function soloCompletesTrial(
  xpPerHour: number | null | undefined,
  required: number,
): boolean | null {
  const contrib = trialXpContribution(xpPerHour);
  if (contrib <= 0) return null;
  return contrib >= required;
}

export interface SkillXpProgress {
  skill: Skill;
  required: number;
  contributed: number;
  remaining: number;
  percent: number;
  memberCount: number;
}
