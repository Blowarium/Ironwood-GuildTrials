import { MEMBERS, SKILLS, type Member, type Skill, type TrialStatus } from "./constants";
import { DEFAULT_GUILD_CONFIG, type GuildConfig } from "./guild-config";
import {
  emptyProfile,
  normalizeProfile,
  type MemberProfile,
  type MemberSkillProfileRow,
} from "./member-profile";
import type { MemberPreferences } from "./preferences";
import {
  buildDefaultRoles,
  defaultRoleForMember,
  type GuildRole,
  type MemberRoleRow,
} from "./roles";
import type { SkillWeekCompletion, TrialSignup } from "./types";
import { defaultStartAtForDate, getEffectiveStatus, normalizeSignupTiming } from "./trial-schedule";

const signups = new Map<string, TrialSignup>();
const completions = new Map<string, SkillWeekCompletion>();
const preferences = new Map<string, MemberPreferences>();
const roles = new Map<string, MemberRoleRow>(
  buildDefaultRoles().map((r) => [r.member_name, r]),
);
const profileMeta = new Map<string, { updated_at: string; updated_by: Member | null }>();
const skillProfiles = new Map<string, MemberSkillProfileRow[]>();
let guildConfig: GuildConfig = { ...DEFAULT_GUILD_CONFIG };
let nextSignupId = 1;

function memberKey(weekStart: string, memberName: string) {
  return `${weekStart}:${memberName}`;
}

function completionKey(weekStart: string, skill: string) {
  return `${weekStart}:${skill}`;
}

function profileKey(memberName: string, skill: string) {
  return `${memberName}:${skill}`;
}

function getProfileRows(memberName: Member): MemberSkillProfileRow[] {
  const rows = skillProfiles.get(memberName);
  if (rows) return rows;
  return emptyProfile(memberName).skills;
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
    const timing = normalizeSignupTiming({
      planned_date: data.planned_date,
      planned_start_at: data.planned_start_at || defaultStartAtForDate(data.planned_date),
    });
    const status = getEffectiveStatus({
      ...data,
      ...timing,
      id: existing?.id ?? 0,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });

    const row: TrialSignup = existing
      ? { ...existing, ...data, ...timing, status, updated_at: now }
      : {
          id: nextSignupId++,
          ...data,
          ...timing,
          status,
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

  patchStatus(
    id: number,
    memberName: string,
    status: TrialStatus,
    actorMember: Member | null,
  ): TrialSignup | null {
    for (const [k, v] of signups) {
      if (v.id === id && v.member_name === memberName) {
        const updated: TrialSignup = {
          ...v,
          status,
          last_edited_by: actorMember ?? v.last_edited_by,
          updated_at: new Date().toISOString(),
        };
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

  listRoles(): MemberRoleRow[] {
    return MEMBERS.map((member_name) => {
      const row = roles.get(member_name);
      if (row) return row;
      return {
        member_name,
        role: defaultRoleForMember(member_name),
        updated_at: new Date().toISOString(),
        updated_by: null,
      };
    });
  },

  setRole(memberName: Member, role: GuildRole, updatedBy: Member | null): MemberRoleRow {
    const row: MemberRoleRow = {
      member_name: memberName,
      role,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    roles.set(memberName, row);
    return row;
  },

  getRole(memberName: Member): GuildRole {
    return roles.get(memberName)?.role ?? defaultRoleForMember(memberName);
  },

  listProfiles(): MemberProfile[] {
    return MEMBERS.map((member_name) => this.getProfile(member_name));
  },

  getProfile(memberName: Member): MemberProfile {
    const meta = profileMeta.get(memberName);
    return normalizeProfile({
      member_name: memberName,
      skills: getProfileRows(memberName),
      updated_at: meta?.updated_at ?? new Date(0).toISOString(),
      updated_by: meta?.updated_by ?? null,
    });
  },

  setProfile(
    memberName: Member,
    skills: MemberSkillProfileRow[],
    updatedBy: Member | null,
  ): MemberProfile {
    skillProfiles.set(memberName, skills);
    const now = new Date().toISOString();
    profileMeta.set(memberName, { updated_at: now, updated_by: updatedBy });
    return this.getProfile(memberName);
  },

  getGuildConfig(): GuildConfig {
    return guildConfig;
  },

  setGuildConfig(update: import("./guild-config").GuildConfigUpdate, updatedBy: Member | null): GuildConfig {
    const next = { ...guildConfig };
    if (update.guildHallLevel !== undefined) {
      next.guild_hall_level = Math.max(0, Math.min(8, Math.floor(Number(update.guildHallLevel)) || 0));
    }
    if (update.eventHallLevel !== undefined) {
      next.guild_event_hall_level = Math.max(
        0,
        Math.min(8, Math.floor(Number(update.eventHallLevel)) || 0),
      );
    }
    if (update.trialHallLevel !== undefined) {
      next.trial_hall_level = Math.max(0, Math.min(99, Math.floor(Number(update.trialHallLevel)) || 0));
    }
    guildConfig = {
      ...next,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    return guildConfig;
  },
};
