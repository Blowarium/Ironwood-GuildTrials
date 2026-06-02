import { MEMBERS, SKILLS, type Member, type Skill } from "./constants";

export interface MemberPreferences {
  member_name: Member;
  pref_1: Skill | null;
  pref_2: Skill | null;
  pref_3: Skill | null;
  xp_pref_1: number | null;
  xp_pref_2: number | null;
  xp_pref_3: number | null;
  updated_at: string;
}

export type PreferencesMap = Map<Member, MemberPreferences>;

export function getPreferenceRank(
  prefs: MemberPreferences | undefined,
  skill: Skill,
): 1 | 2 | 3 | null {
  if (!prefs) return null;
  if (prefs.pref_1 === skill) return 1;
  if (prefs.pref_2 === skill) return 2;
  if (prefs.pref_3 === skill) return 3;
  return null;
}

export function getPreferenceScore(prefs: MemberPreferences | undefined, skill: Skill): number {
  const rank = getPreferenceRank(prefs, skill);
  if (rank === 1) return 3;
  if (rank === 2) return 2;
  if (rank === 3) return 1;
  return 0;
}

export function getXpPerHourForPreference(
  prefs: MemberPreferences | undefined,
  skill: Skill,
): number | null {
  if (!prefs) return null;
  if (prefs.pref_1 === skill) return prefs.xp_pref_1;
  if (prefs.pref_2 === skill) return prefs.xp_pref_2;
  if (prefs.pref_3 === skill) return prefs.xp_pref_3;
  return null;
}

export function buildPreferencesMap(rows: MemberPreferences[]): PreferencesMap {
  const map = new Map<Member, MemberPreferences>();
  for (const row of rows) {
    map.set(row.member_name, row);
  }
  return map;
}

export function emptyPreferences(member: Member): MemberPreferences {
  return {
    member_name: member,
    pref_1: null,
    pref_2: null,
    pref_3: null,
    xp_pref_1: null,
    xp_pref_2: null,
    xp_pref_3: null,
    updated_at: new Date().toISOString(),
  };
}

function parseXp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function validatePreferences(
  pref1: Skill | "",
  pref2: Skill | "",
  pref3: Skill | "",
  xp1?: unknown,
  xp2?: unknown,
  xp3?: unknown,
): string | null {
  const chosen = [pref1, pref2, pref3].filter(Boolean) as Skill[];
  if (new Set(chosen).size !== chosen.length) {
    return "Each preference must be a different skill.";
  }
  for (const s of chosen) {
    if (!(SKILLS as readonly string[]).includes(s)) return "Invalid skill.";
  }
  const xps = [parseXp(xp1), parseXp(xp2), parseXp(xp3)];
  if (pref1 && !xps[0]) {
    /* XP optional but encouraged */
  }
  if ((pref1 && xps[0] === null && xp1 !== "" && xp1 != null) ||
      (pref2 && xps[1] === null && xp2 !== "" && xp2 != null) ||
      (pref3 && xps[2] === null && xp3 !== "" && xp3 != null)) {
    return "XP/h must be a positive number.";
  }
  return null;
}

export function membersWithAnyPreference(map: PreferencesMap): number {
  let n = 0;
  for (const m of MEMBERS) {
    const p = map.get(m);
    if (p?.pref_1 || p?.pref_2 || p?.pref_3) n++;
  }
  return n;
}

export { parseXp };
