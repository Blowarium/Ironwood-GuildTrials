import { SKILLS, type Skill } from "./constants";
import type { ProfilesMap } from "./member-profile";
import type { SkillCoverageRow } from "./stats";
import { memberContributionForSkill, trialXpRequired } from "./trial-xp";
import type { TrialSignup } from "./types";

export type SkillXpAdequacy = "enough" | "needs_more" | "unknown" | "none";

export interface SkillXpCoverage {
  skill: Skill;
  required: number;
  contributed: number;
  remaining: number;
  percent: number;
  memberCount: number;
  adequacy: SkillXpAdequacy;
  hasUnknownXp: boolean;
}

export function computeSkillXpCoverage(
  signups: TrialSignup[],
  profiles: ProfilesMap,
  hallLevel: number,
): SkillXpCoverage[] {
  const required = trialXpRequired(hallLevel);

  return SKILLS.map((skill) => {
    const contributors = signups.filter((s) => s.skill === skill);
    let contributed = 0;
    let hasUnknownXp = false;

    for (const s of contributors) {
      const profile = profiles.get(s.member_name);
      const xp = profile
        ? memberContributionForSkill(profile, skill)
        : memberContributionForSkill(undefined, skill);
      if (xp <= 0) hasUnknownXp = true;
      contributed += xp;
    }

    const remaining = Math.max(0, required - contributed);
    const percent = required > 0 ? Math.min(100, Math.round((contributed / required) * 100)) : 100;

    let adequacy: SkillXpAdequacy;
    if (contributors.length === 0) {
      adequacy = "none";
    } else if (remaining <= 0) {
      adequacy = "enough";
    } else if (hasUnknownXp) {
      adequacy = "unknown";
    } else {
      adequacy = "needs_more";
    }

    return {
      skill,
      required,
      contributed,
      remaining,
      percent,
      memberCount: contributors.length,
      adequacy,
      hasUnknownXp,
    };
  });
}

/** Skills with no signups, or in progress but XP still short of the trial target. */
export function skillsNeedingSignupAttention(
  skillCoverage: SkillCoverageRow[],
  xpCoverage: SkillXpCoverage[],
): Skill[] {
  const adequacyBySkill = new Map(xpCoverage.map((x) => [x.skill, x.adequacy]));

  return skillCoverage
    .filter((row) => {
      if (row.weekState === "complete") return false;
      if (row.weekState === "needs_signup") return true;
      return (
        row.weekState === "in_progress" &&
        adequacyBySkill.get(row.skill) === "needs_more"
      );
    })
    .map((row) => row.skill);
}

export function adequacyLabel(adequacy: SkillXpAdequacy): string {
  switch (adequacy) {
    case "enough":
      return "XP should be enough";
    case "needs_more":
      return "May need more members";
    case "unknown":
      return "XP/h missing — unclear";
    case "none":
      return "No signups yet";
  }
}

export function adequacyClass(adequacy: SkillXpAdequacy): string {
  switch (adequacy) {
    case "enough":
      return "text-emerald-400";
    case "needs_more":
      return "text-amber-300";
    case "unknown":
      return "text-sky-300";
    case "none":
      return "text-slate-500";
  }
}
