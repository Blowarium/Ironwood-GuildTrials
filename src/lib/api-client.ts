import type { Member, Skill, TrialStatus } from "./constants";
import type { GuildConfig } from "./guild-config";
import type { MemberPreferences } from "./preferences";
import type { SkillWeekCompletion, TrialSignup } from "./types";

export async function fetchWeekData(weekStart: string): Promise<{
  signups: TrialSignup[];
  completions: SkillWeekCompletion[];
  mode: "dev" | "database";
}> {
  const res = await fetch(`/api/signups?weekStart=${encodeURIComponent(weekStart)}`);
  if (!res.ok) throw new Error("Failed to load week data");
  const data = await res.json();
  return {
    signups: data.signups,
    completions: data.completions ?? [],
    mode: data.mode,
  };
}

export async function saveSignup(payload: {
  weekStart: string;
  memberName: Member;
  skill: Skill;
  plannedDate: string;
  status?: TrialStatus;
}): Promise<{ signup?: TrialSignup; error?: string }> {
  const res = await fetch("/api/signups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not save." };
  return { signup: data.signup };
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

export async function patchSignupStatus(
  id: number,
  memberName: Member,
  status: TrialStatus,
): Promise<{ signup?: TrialSignup; error?: string }> {
  const res = await fetch("/api/signups", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, memberName, status }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not update status." };
  return { signup: data.signup };
}

export async function fetchAllPreferences(): Promise<{
  preferences: MemberPreferences[];
  mode: "dev" | "database";
}> {
  const res = await fetch("/api/preferences");
  if (!res.ok) throw new Error("Failed to load preferences");
  const data = await res.json();
  return { preferences: data.preferences ?? [], mode: data.mode };
}

export async function saveMemberPreferences(payload: {
  memberName: Member;
  pref1: Skill | null;
  pref2: Skill | null;
  pref3: Skill | null;
  xp1?: string | null;
  xp2?: string | null;
  xp3?: string | null;
}): Promise<{ preferences?: MemberPreferences; error?: string }> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memberName: payload.memberName,
      pref1: payload.pref1,
      pref2: payload.pref2,
      pref3: payload.pref3,
      xp1: payload.xp1,
      xp2: payload.xp2,
      xp3: payload.xp3,
    }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not save preferences." };
  return { preferences: data.preferences };
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
  trialHallLevel: number,
): Promise<{ config?: GuildConfig; error?: string }> {
  const res = await fetch("/api/guild-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trialHallLevel }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not save guild config." };
  return { config: data.config };
}

export async function deleteSignup(
  id: number,
  memberName: Member,
): Promise<{ error?: string }> {
  const res = await fetch(
    `/api/signups?id=${id}&memberName=${encodeURIComponent(memberName)}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Could not remove." };
  return {};
}
