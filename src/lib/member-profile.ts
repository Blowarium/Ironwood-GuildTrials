import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";
import type { MemberPreferences } from "./preferences";
import { parseXp } from "./preferences";

export interface MemberSkillProfileRow {
  skill: Skill;
  xp_per_hour: number | null;
  preference_rank: number | null;
}

export interface MemberProfile {
  member_name: Member;
  skills: MemberSkillProfileRow[];
  updated_at: string;
  updated_by: Member | null;
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
}

export type ProfilesMap = Map<Member, MemberProfile>;

export function emptySkillRows(): MemberSkillProfileRow[] {
  return SKILLS.map((skill) => ({
    skill,
    xp_per_hour: null,
    preference_rank: null,
  }));
}

export function emptyProfile(member: Member): MemberProfile {
  return {
    member_name: member,
    skills: emptySkillRows(),
    updated_at: new Date().toISOString(),
    updated_by: null,
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
  return {
    ...profile,
    skills: SKILLS.map((skill) => {
      const existing = bySkill.get(skill);
      return {
        skill,
        xp_per_hour: existing?.xp_per_hour ?? null,
        preference_rank: existing?.preference_rank ?? null,
      };
    }),
  };
}

export function profileToLegacyPreferences(profile: MemberProfile): MemberPreferences {
  const ranked = [...profile.skills]
    .filter((s) => s.preference_rank != null && s.preference_rank > 0)
    .sort((a, b) => (a.preference_rank ?? 99) - (b.preference_rank ?? 99));

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
}

export function validateAndParseProfileSkills(
  skills: ProfileSkillInput[],
): { rows: MemberSkillProfileRow[] } | { error: string } {
  if (skills.length !== SKILLS.length) {
    return { error: "Profile must include all skills." };
  }

  const rows: MemberSkillProfileRow[] = [];
  const ranks = new Set<number>();

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
      if (ranks.has(n)) {
        return { error: "Each preference rank can only be used once." };
      }
      ranks.add(n);
      preference_rank = n;
    }
    rows.push({
      skill: input.skill,
      xp_per_hour: xp,
      preference_rank,
    });
  }

  return { rows: rows.sort((a, b) => a.skill.localeCompare(b.skill)) };
}

export function applyRankOrder(skills: MemberSkillProfileRow[], orderedSkills: Skill[]): MemberSkillProfileRow[] {
  const bySkill = new Map(skills.map((s) => [s.skill, { ...s }]));
  orderedSkills.forEach((skill, index) => {
    const row = bySkill.get(skill);
    if (row) row.preference_rank = index + 1;
  });
  for (const row of bySkill.values()) {
    if (!orderedSkills.includes(row.skill)) row.preference_rank = null;
  }
  return SKILLS.map((skill) => bySkill.get(skill)!);
}

export function membersWithRankedProfiles(map: ProfilesMap): number {
  let n = 0;
  for (const m of MEMBERS) {
    const stats = rosterStats(map.get(m));
    if (stats.ranked_skill_count >= 3) n++;
  }
  return n;
}
