import type { Member } from "./constants";
import { ensureSchema, getDb } from "./db";
import { devStore } from "./dev-store";
import { DEFAULT_GUILD_CONFIG, normalizeGuildConfigRow } from "./guild-config";
import { listGuildMemberNames } from "./guild-members";
import {
  buildProfilesMap,
  normalizeProfile,
  emptySkillRows,
  type MemberProfile,
} from "./member-profile";
import { buildOptimalSchedule, completedSkillsFromCompletions, type SchedulePlan } from "./schedule-optimizer";
import type { SkillWeekCompletion, TrialSignup } from "./types";
import { getWeekDays } from "./weeks";

async function fetchProfileFromDb(
  db: NonNullable<ReturnType<typeof getDb>>,
  memberName: Member,
): Promise<MemberProfile> {
  const metaRows = (await db`
    SELECT updated_at::text, updated_by, preferences_customized
    FROM member_profile_meta WHERE member_name = ${memberName}
  `) as { updated_at: string; updated_by: Member | null; preferences_customized: boolean }[];

  const skillRows = (await db`
    SELECT skill, xp_per_hour, preference_rank, ironwood_action_id, skill_locked
    FROM member_skill_profiles
    WHERE member_name = ${memberName}
  `) as MemberProfile["skills"];

  return normalizeProfile({
    member_name: memberName,
    skills: skillRows.length ? skillRows : emptySkillRows(),
    updated_at: metaRows[0]?.updated_at ?? new Date(0).toISOString(),
    updated_by: metaRows[0]?.updated_by ?? null,
    preferences_customized: metaRows[0]?.preferences_customized ?? false,
  });
}

async function fetchGuildConfigFromDb(
  db: NonNullable<ReturnType<typeof getDb>>,
): Promise<number> {
  const rows = (await db`
    SELECT trial_hall_level FROM guild_config WHERE id = 1
  `) as { trial_hall_level: number }[];
  if (!rows.length) return DEFAULT_GUILD_CONFIG.trial_hall_level;
  return Number(rows[0].trial_hall_level) || DEFAULT_GUILD_CONFIG.trial_hall_level;
}

function buildPlan(
  members: Member[],
  profiles: MemberProfile[],
  signups: TrialSignup[],
  completions: SkillWeekCompletion[],
  weekStart: string,
  hallLevel: number,
): SchedulePlan {
  return buildOptimalSchedule(
    buildProfilesMap(profiles),
    signups,
    getWeekDays(weekStart),
    hallLevel,
    members,
    completedSkillsFromCompletions(completions),
  );
}

export async function loadSchedulePlanForWeek(weekStart: string): Promise<{
  plan: SchedulePlan;
  members: Member[];
  weekStart: string;
}> {
  const db = getDb();

  if (!db) {
    const members = devStore.listMemberNames();
    const profiles = devStore.listProfiles();
    const signups = devStore.list(weekStart);
    const completions = devStore.listCompletions(weekStart);
    const hallLevel = devStore.getGuildConfig().trial_hall_level ?? 0;
    return {
      plan: buildPlan(members, profiles, signups, completions, weekStart, hallLevel),
      members,
      weekStart,
    };
  }

  await ensureSchema();
  const members = await listGuildMemberNames(db);
  const profiles: MemberProfile[] = [];
  for (const m of members) {
    profiles.push(await fetchProfileFromDb(db, m));
  }

  const signupRows = (await db`
    SELECT
      id, week_start::text, member_name, skill, planned_date::text,
      status, planned_start_at::text, last_edited_by,
      created_at::text, updated_at::text
    FROM trial_signups
    WHERE week_start = ${weekStart}::date
  `) as TrialSignup[];

  const completionRows = (await db`
    SELECT week_start::text, skill, completed, marked_by, updated_at::text
    FROM skill_week_completions
    WHERE week_start = ${weekStart}::date
  `) as SkillWeekCompletion[];

  const hallLevel = await fetchGuildConfigFromDb(db);

  return {
    plan: buildPlan(members, profiles, signupRows, completionRows, weekStart, hallLevel),
    members,
    weekStart,
  };
}
