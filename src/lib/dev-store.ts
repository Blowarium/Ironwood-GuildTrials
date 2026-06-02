import type { Member, Skill, TrialStatus } from "./constants";
import { DEFAULT_GUILD_CONFIG, type GuildConfig } from "./guild-config";
import type { MemberPreferences } from "./preferences";
import type { SkillWeekCompletion, TrialSignup } from "./types";

const signups = new Map<string, TrialSignup>();
const completions = new Map<string, SkillWeekCompletion>();
const preferences = new Map<string, MemberPreferences>();
let guildConfig: GuildConfig = { ...DEFAULT_GUILD_CONFIG };
let nextSignupId = 1;

function memberKey(weekStart: string, memberName: string) {
  return `${weekStart}:${memberName}`;
}

function completionKey(weekStart: string, skill: string) {
  return `${weekStart}:${skill}`;
}

export const devStore = {
  list(weekStart: string): TrialSignup[] {
    return [...signups.values()].filter((s) => s.week_start === weekStart);
  },

  listCompletions(weekStart: string): SkillWeekCompletion[] {
    return [...completions.values()].filter(
      (c) => c.week_start === weekStart && c.completed,
    );
  },

  findMemberSignup(weekStart: string, memberName: string): TrialSignup | undefined {
    return signups.get(memberKey(weekStart, memberName));
  },

  upsert(
    data: Omit<TrialSignup, "id" | "created_at" | "updated_at">,
  ): TrialSignup {
    const mk = memberKey(data.week_start, data.member_name);
    const existing = signups.get(mk);
    const now = new Date().toISOString();

    const row: TrialSignup = existing
      ? { ...existing, ...data, updated_at: now }
      : {
          id: nextSignupId++,
          ...data,
          created_at: now,
          updated_at: now,
        };
    signups.set(mk, row);
    return row;
  },

  setSkillCompletion(
    weekStart: string,
    skill: Skill,
    completed: boolean,
    markedBy: Member | null,
  ): SkillWeekCompletion | null {
    const k = completionKey(weekStart, skill);
    if (!completed) {
      completions.delete(k);
      return null;
    }
    const row: SkillWeekCompletion = {
      week_start: weekStart,
      skill,
      completed: true,
      marked_by: markedBy,
      updated_at: new Date().toISOString(),
    };
    completions.set(k, row);
    return row;
  },

  patchStatus(id: number, memberName: string, status: TrialStatus): TrialSignup | null {
    for (const [k, v] of signups) {
      if (v.id === id && v.member_name === memberName) {
        const updated = { ...v, status, updated_at: new Date().toISOString() };
        signups.set(k, updated);
        return updated;
      }
    }
    return null;
  },

  removeById(id: number, memberName: string): boolean {
    for (const [k, v] of signups) {
      if (v.id === id && v.member_name === memberName) {
        signups.delete(k);
        return true;
      }
    }
    return false;
  },

  listPreferences(): MemberPreferences[] {
    return [...preferences.values()].sort((a, b) =>
      a.member_name.localeCompare(b.member_name),
    );
  },

  setPreferences(
    memberName: Member,
    pref1: Skill | null,
    pref2: Skill | null,
    pref3: Skill | null,
    xp1: number | null,
    xp2: number | null,
    xp3: number | null,
  ): MemberPreferences {
    const row: MemberPreferences = {
      member_name: memberName,
      pref_1: pref1,
      pref_2: pref2,
      pref_3: pref3,
      xp_pref_1: xp1,
      xp_pref_2: xp2,
      xp_pref_3: xp3,
      updated_at: new Date().toISOString(),
    };
    preferences.set(memberName, row);
    return row;
  },

  getGuildConfig(): GuildConfig {
    return guildConfig;
  },

  setGuildConfig(level: number): GuildConfig {
    guildConfig = {
      trial_hall_level: level,
      updated_at: new Date().toISOString(),
    };
    return guildConfig;
  },
};
