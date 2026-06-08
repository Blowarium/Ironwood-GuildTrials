import type { Member, Skill, TrialStatus } from "./constants";
import type { GuildConfig } from "./guild-config";
import {
  collectActiveTrialAssignments,
  mapGameDisplayNameToMember,
  type IronwoodTrialSyncPayload,
  type TrialSyncApplyResult,
} from "./ironwood-trial-sync";
import type {
  MemberProfile,
  MemberRosterEntry,
  ProfileSkillInput,
} from "./member-profile";
import type { GuildRole, MemberRoleRow } from "./roles";
import { getStaffAuthToken, storeStaffAuth, removeStaffAuth } from "./staff-auth-client";
import { defaultStartAtForDate, normalizeSignupTiming } from "./trial-schedule";
import type { SkillWeekCompletion, TrialSignup } from "./types";

function withStaffAuth<T extends { actorMember: Member }>(
  payload: T,
): T & { staffAuthToken?: string } {
  const token = getStaffAuthToken(payload.actorMember);
  return token ? { ...payload, staffAuthToken: token } : payload;
}

export async function loginStaff(
  memberName: Member,
  password: string,
): Promise<{ error?: string }> {
  const res = await fetch("/api/staff-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberName, password }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not verify password." };
  storeStaffAuth({
    member: data.member,
    role: data.role,
    token: data.token,
    expiresAt: data.expiresAt,
  });
  return {};
}

export async function logoutStaff(memberName: Member): Promise<void> {
  removeStaffAuth(memberName);
}

export async function fetchWeekData(weekStart: string): Promise<{
  signups: TrialSignup[];
  completions: SkillWeekCompletion[];
  mode: "dev" | "database";
}> {
  const res = await fetch(`/api/signups?weekStart=${encodeURIComponent(weekStart)}`);
  if (!res.ok) throw new Error("Failed to load week data");
  const data = await res.json();
  return {
    signups: (data.signups ?? []).map(normalizeSignup),
    completions: data.completions ?? [],
    mode: data.mode,
  };
}

function normalizeSignup(s: TrialSignup): TrialSignup {
  const timing = normalizeSignupTiming({
    planned_date: s.planned_date,
    planned_start_at: s.planned_start_at || defaultStartAtForDate(s.planned_date),
  });
  return { ...s, ...timing, last_edited_by: s.last_edited_by ?? null };
}

export async function saveSignup(payload: {
  weekStart: string;
  memberName: Member;
  skill: Skill;
  plannedDate: string;
  plannedStartAt?: string;
  actorMember: Member;
}): Promise<{ signup?: TrialSignup; error?: string }> {
  const res = await fetch("/api/signups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withStaffAuth(payload)),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not save." };
  return { signup: data.signup ? normalizeSignup(data.signup) : undefined };
}

export async function setSkillWeekComplete(payload: {
  weekStart: string;
  skill: Skill;
  completed: boolean;
  markedBy?: Member;
}): Promise<{ completion?: SkillWeekCompletion | null; error?: string }> {
  const res = await fetch("/api/skill-completions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not update skill." };
  return { completion: data.completion };
}

export async function patchSignupStatus(payload: {
  id: number;
  memberName: Member;
  status: TrialStatus;
  actorMember: Member;
}): Promise<{ signup?: TrialSignup; error?: string }> {
  const res = await fetch("/api/signups", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not update status." };
  return { signup: data.signup ? normalizeSignup(data.signup) : undefined };
}

export async function fetchMembersData(): Promise<{
  roles: MemberRoleRow[];
  profiles: MemberProfile[];
  mode: "dev" | "database";
}> {
  const res = await fetch("/api/members");
  if (!res.ok) throw new Error("Failed to load members");
  const data = await res.json();
  return { roles: data.roles ?? [], profiles: data.profiles ?? [], mode: data.mode };
}

export async function saveMemberProfile(payload: {
  actorMember: Member;
  memberName: Member;
  skills: ProfileSkillInput[];
}): Promise<{ profile?: MemberProfile; error?: string }> {
  const res = await fetch("/api/members", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withStaffAuth(payload)),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not save profile." };
  return { profile: data.profile };
}

export async function saveMemberRole(payload: {
  actorMember: Member;
  memberName: Member;
  role: GuildRole;
}): Promise<{ role?: MemberRoleRow; error?: string }> {
  const res = await fetch("/api/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withStaffAuth(payload)),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not update role." };
  return { role: data.role };
}

export async function fetchMemberRoster(actorMember: Member): Promise<{
  roster: MemberRosterEntry[];
  mode: "dev" | "database";
}> {
  const res = await fetch("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withStaffAuth({ actorMember })),
  });
  if (!res.ok) throw new Error("Failed to load roster");
  const data = await res.json();
  return { roster: data.roster ?? [], mode: data.mode };
}

export async function fetchGuildConfig(): Promise<{
  config: GuildConfig;
  mode: "dev" | "database";
}> {
  const res = await fetch("/api/guild-config");
  if (!res.ok) throw new Error("Failed to load guild config");
  const data = await res.json();
  return { config: data.config, mode: data.mode };
}

export async function saveGuildConfig(
  update: import("./guild-config").GuildConfigUpdate,
  actorMember: Member,
): Promise<{ config?: GuildConfig; error?: string }> {
  const res = await fetch("/api/guild-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withStaffAuth({ ...update, actorMember })),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not save guild config." };
  return { config: data.config };
}

export async function deleteSignup(payload: {
  id: number;
  memberName: Member;
  actorMember: Member;
}): Promise<{ error?: string }> {
  const token = getStaffAuthToken(payload.actorMember);
  const tokenParam = token ? `&staffAuthToken=${encodeURIComponent(token)}` : "";
  const res = await fetch(
    `/api/signups?id=${payload.id}&memberName=${encodeURIComponent(payload.memberName)}&actorMember=${encodeURIComponent(payload.actorMember)}${tokenParam}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not remove." };
  return {};
}

function startTimesClose(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= 60_000;
}

/** Upsert planner signups from an in-game Ironwood trial snapshot. */
export async function syncTrialSignupsFromGame(
  payload: IronwoodTrialSyncPayload,
  actorMember: Member,
  existingSignups: TrialSignup[] = [],
): Promise<TrialSyncApplyResult> {
  const weekStart = payload.trialWeekStart;
  const assignments = collectActiveTrialAssignments(payload);
  const byMember = new Map(
    existingSignups.filter((s) => s.week_start === weekStart).map((s) => [s.member_name, s]),
  );

  const result: TrialSyncApplyResult = {
    created: [],
    updated: [],
    unchanged: [],
    skipped: [],
    errors: [],
    payloadSource: payload.source,
  };

  const skippedNames = new Set<string>();
  function skip(displayName: string, reason: string) {
    if (skippedNames.has(displayName)) return;
    skippedNames.add(displayName);
    result.skipped.push({ displayName, reason });
  }

  if (payload.unmatchedNames?.length) {
    for (const name of payload.unmatchedNames) {
      skip(name, "Not in guild roster");
    }
  }

  for (const skillRow of payload.skills) {
    for (const member of skillRow.members) {
      if (!mapGameDisplayNameToMember(member.displayName)) {
        skip(member.displayName, "Not in guild roster");
      }
    }
  }

  const touched = new Set<Member>();
  for (const assignment of assignments) {
    if (touched.has(assignment.memberName)) continue;
    touched.add(assignment.memberName);

    const existing = byMember.get(assignment.memberName);
    const sameSkill = existing?.skill === assignment.skill;
    const sameTime =
      existing != null && startTimesClose(existing.planned_start_at, assignment.plannedStartAt);

    if (existing && sameSkill && sameTime) {
      result.unchanged.push(assignment.memberName);
      continue;
    }

    const { signup, error } = await saveSignup({
      weekStart,
      memberName: assignment.memberName,
      skill: assignment.skill,
      plannedDate: assignment.plannedDate,
      plannedStartAt: assignment.plannedStartAt,
      actorMember,
    });

    if (error || !signup) {
      result.errors.push({ member: assignment.memberName, error: error ?? "Could not save." });
      continue;
    }

    if (existing) {
      result.updated.push(assignment.memberName);
    } else {
      result.created.push(assignment.memberName);
    }
    byMember.set(assignment.memberName, signup);
  }

  return result;
}
