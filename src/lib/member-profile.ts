import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";
import type { MemberPreferences } from "./preferences";
import { parseXp } from "./preferences";
import { findCatalogAction } from "./ironwood-action-catalog";

export interface MemberSkillProfileRow {
  skill: Skill;
  xp_per_hour: number | null;
  preference_rank: number | null;
  ironwood_action_id: number | null;
}

export interface MemberProfile {
  member_name: Member;
  skills: MemberSkillProfileRow[];
  updated_at: string;
  updated_by: Member | null;
  /** When true, stored preference ranks are kept as-is (member set them explicitly). */
  preferences_customized: boolean;
}

export interface MemberRosterEntry {
  member_name: Member;
  role: import("./roles").GuildRole;
  profile_updated_at: string | null;
  profile_updated_by: Member | null;
  ranked_skill_count: number;
  xp_filled_count: number;
  total_skills: number;
  profile_complete: boolean;
  preferences_customized: boolean;
}

export type ProfilesMap = Map<Member, MemberProfile>;

/** Rank used when a member has not set preferences yet (all skills tied). */
export const NEUTRAL_PREFERENCE_RANK = 1;

/** Legacy auto-default: Woodcutting = 1 … Defense = 16 (before neutral defaults). */
export function legacyFactoryPreferenceRank(skill: Skill): number {
  const index = SKILLS.indexOf(skill);
  return index >= 0 ? index + 1 : 1;
}

/** @deprecated Use NEUTRAL_PREFERENCE_RANK / legacyFactoryPreferenceRank instead. */
export function defaultPreferenceRank(skill: Skill): number {
  return legacyFactoryPreferenceRank(skill);
}

export function isLegacyFactoryDefaultRanks(rows: MemberSkillProfileRow[]): boolean {
  if (rows.length !== SKILLS.length) return false;
  return SKILLS.every((skill, index) => {
    const row = rows.find((r) => r.skill === skill);
    return row?.preference_rank === index + 1;
  });
}

export function isNeutralDefaultRanks(rows: MemberSkillProfileRow[]): boolean {
  return rows.every((r) => r.preference_rank === NEUTRAL_PREFERENCE_RANK);
}

/** True when stored ranks look like the member chose them (not factory or neutral defaults). */
export function inferPreferencesCustomized(rows: MemberSkillProfileRow[]): boolean {
  const hasAnyRank = rows.some((s) => s.preference_rank != null && s.preference_rank > 0);
  if (!hasAnyRank) return false;
  if (isLegacyFactoryDefaultRanks(rows)) return false;
  if (isNeutralDefaultRanks(rows)) return false;
  return true;
}

/** Lower rank number = higher priority; ties keep SKILLS list order. */
export function compareSkillsByPreferenceRank(
  a: { skill: Skill; preference_rank: number | null },
  b: { skill: Skill; preference_rank: number | null },
): number {
  const ar = a.preference_rank ?? 999;
  const br = b.preference_rank ?? 999;
  if (ar !== br) return ar - br;
  return SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill);
}

export function emptySkillRows(): MemberSkillProfileRow[] {
  return SKILLS.map((skill) => ({
    skill,
    xp_per_hour: null,
    preference_rank: NEUTRAL_PREFERENCE_RANK,
    ironwood_action_id: null,
  }));
}

function applyNeutralRanksIfUnchanged(
  rows: MemberSkillProfileRow[],
  preferencesCustomized: boolean,
): MemberSkillProfileRow[] {
  if (preferencesCustomized) return rows;

  const hasAnyRank = rows.some((s) => s.preference_rank != null && s.preference_rank > 0);
  if (!hasAnyRank || isLegacyFactoryDefaultRanks(rows)) {
    return rows.map((row) => ({
      ...row,
      preference_rank: NEUTRAL_PREFERENCE_RANK,
    }));
  }

  return rows;
}

export function emptyProfile(member: Member): MemberProfile {
  return {
    member_name: member,
    skills: emptySkillRows(),
    updated_at: new Date().toISOString(),
    updated_by: null,
    preferences_customized: false,
  };
}

export function buildProfilesMap(rows: MemberProfile[]): ProfilesMap {
  const map = new Map<Member, MemberProfile>();
  for (const row of rows) {
    map.set(row.member_name, normalizeProfile(row));
  }
  return map;
}

export function normalizeProfile(profile: MemberProfile): MemberProfile {
  const bySkill = new Map(profile.skills.map((s) => [s.skill, s]));
  const mergedRows = SKILLS.map((skill) => {
    const existing = bySkill.get(skill);
    return {
      skill,
      xp_per_hour: existing?.xp_per_hour ?? null,
      preference_rank: existing?.preference_rank ?? null,
      ironwood_action_id: existing?.ironwood_action_id ?? null,
    };
  });

  const preferencesCustomized =
    profile.preferences_customized || inferPreferencesCustomized(mergedRows);

  return {
    ...profile,
    preferences_customized: preferencesCustomized,
    skills: applyNeutralRanksIfUnchanged(mergedRows, preferencesCustomized),
  };
}

export function profileToLegacyPreferences(profile: MemberProfile): MemberPreferences {
  const ranked = [...profile.skills]
    .filter((s) => s.preference_rank != null && s.preference_rank > 0)
    .sort(compareSkillsByPreferenceRank);

  return {
    member_name: profile.member_name,
    pref_1: ranked[0]?.skill ?? null,
    pref_2: ranked[1]?.skill ?? null,
    pref_3: ranked[2]?.skill ?? null,
    xp_pref_1: ranked[0]?.xp_per_hour ?? null,
    xp_pref_2: ranked[1]?.xp_per_hour ?? null,
    xp_pref_3: ranked[2]?.xp_per_hour ?? null,
    updated_at: profile.updated_at,
  };
}

export function profilesToLegacyPreferencesMap(profiles: ProfilesMap): Map<Member, MemberPreferences> {
  const map = new Map<Member, MemberPreferences>();
  for (const [member, profile] of profiles) {
    map.set(member, profileToLegacyPreferences(profile));
  }
  return map;
}

export function getXpPerHourForSkill(
  profile: MemberProfile | undefined,
  skill: Skill,
): number | null {
  return profile?.skills.find((s) => s.skill === skill)?.xp_per_hour ?? null;
}

export function getPreferenceRankFromProfile(
  profile: MemberProfile | undefined,
  skill: Skill,
): number | null {
  const rank = profile?.skills.find((s) => s.skill === skill)?.preference_rank;
  return rank != null && rank > 0 ? rank : null;
}

export function getPreferenceScoreFromProfile(
  profile: MemberProfile | undefined,
  skill: Skill,
): number {
  const rank = getPreferenceRankFromProfile(profile, skill);
  if (rank === 1) return 3;
  if (rank === 2) return 2;
  if (rank === 3) return 1;
  if (rank != null && rank <= 16) return Math.max(0, 4 - Math.min(rank, 4));
  return 0;
}

export function rosterStats(profile: MemberProfile | undefined): {
  ranked_skill_count: number;
  xp_filled_count: number;
  profile_complete: boolean;
} {
  if (!profile) {
    return { ranked_skill_count: 0, xp_filled_count: 0, profile_complete: false };
  }
  const ranked_skill_count = profile.skills.filter(
    (s) => s.preference_rank != null && s.preference_rank > 0,
  ).length;
  const xp_filled_count = profile.skills.filter((s) => s.xp_per_hour != null && s.xp_per_hour > 0)
    .length;
  return {
    ranked_skill_count,
    xp_filled_count,
    profile_complete: ranked_skill_count >= 3 && xp_filled_count >= ranked_skill_count,
  };
}

export interface ProfileSkillInput {
  skill: Skill;
  xpPerHour?: unknown;
  preferenceRank?: unknown;
  ironwoodActionId?: unknown;
}

export function validateAndParseProfileSkills(
  skills: ProfileSkillInput[],
): { rows: MemberSkillProfileRow[] } | { error: string } {
  if (skills.length !== SKILLS.length) {
    return { error: "Profile must include all skills." };
  }

  const rows: MemberSkillProfileRow[] = [];

  for (const input of skills) {
    if (!(SKILLS as readonly string[]).includes(input.skill)) {
      return { error: `Invalid skill: ${input.skill}` };
    }
    const xp = parseXp(input.xpPerHour);
    if (input.xpPerHour != null && input.xpPerHour !== "" && xp === null) {
      return { error: `XP/h must be a positive number for ${input.skill}.` };
    }
    let preference_rank: number | null = null;
    if (input.preferenceRank != null && input.preferenceRank !== "") {
      const n = Number(input.preferenceRank);
      if (!Number.isInteger(n) || n < 1 || n > SKILLS.length) {
        return { error: `Preference rank for ${input.skill} must be 1–${SKILLS.length}.` };
      }
      preference_rank = n;
    }
    let ironwood_action_id: number | null = null;
    if (input.ironwoodActionId != null && input.ironwoodActionId !== "") {
      const actionId = Number(input.ironwoodActionId);
      if (!Number.isInteger(actionId) || actionId <= 0) {
        return { error: `Ironwood action for ${input.skill} must be a positive integer.` };
      }
      if (!findCatalogAction(input.skill, actionId)) {
        return { error: `Unknown Ironwood action #${actionId} for ${input.skill}.` };
      }
      ironwood_action_id = actionId;
    }
    rows.push({
      skill: input.skill,
      xp_per_hour: xp,
      preference_rank,
      ironwood_action_id,
    });
  }

  return { rows: rows.sort((a, b) => a.skill.localeCompare(b.skill)) };
}

export function membersWithRankedProfiles(map: ProfilesMap): number {
  let n = 0;
  for (const m of MEMBERS) {
    const stats = rosterStats(map.get(m));
    if (stats.ranked_skill_count >= 3) n++;
  }
  return n;
}
