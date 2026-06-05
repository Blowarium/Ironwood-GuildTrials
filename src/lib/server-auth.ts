import { MEMBERS, type Member } from "./constants";
import {
  canEditProfileFor,
  canEditSignupFor,
  canManageRoles,
  isLeaderRole,
  isStaffRole,
} from "./permissions";
import { verifyStaffToken } from "./staff-auth-server";
import { buildRolesMap, getMemberRole, isGuildRole, type GuildRole, type MemberRoleRow } from "./roles";

export type ActorResult =
  | { ok: true; actor: Member }
  | { ok: false; error: string; status: number };

export function parseActor(value: unknown): Member | null {
  if (typeof value !== "string" || !(MEMBERS as readonly string[]).includes(value)) {
    return null;
  }
  return value as Member;
}

export function parseStaffToken(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  return value;
}

export async function loadRolesMap(
  db: NonNullable<ReturnType<typeof import("./db").getDb>>,
): Promise<Map<Member, GuildRole>> {
  const rows = (await db`
    SELECT member_name, role, updated_at::text, updated_by
    FROM guild_member_roles
  `) as MemberRoleRow[];
  return buildRolesMap(rows);
}

export function requireActor(actor: Member | null): ActorResult {
  if (!actor) return { ok: false, error: "actorMember is required.", status: 400 };
  return { ok: true, actor };
}

export function assertStaffAuth(
  actor: Member,
  roles: Map<Member, GuildRole>,
  staffToken: string | null,
): true | { error: string; status: number } {
  const role = getMemberRole(roles, actor);
  if (!isStaffRole(role)) {
    return { error: "Guild Leader or Officer access required.", status: 403 };
  }
  if (!staffToken) {
    return { error: "Staff password verification required.", status: 403 };
  }
  const payload = verifyStaffToken(staffToken);
  if (!payload || payload.member !== actor || payload.role !== role) {
    return { error: "Invalid or expired staff session. Sign in again.", status: 403 };
  }
  return true;
}

export function assertLeaderAuth(
  actor: Member,
  roles: Map<Member, GuildRole>,
  staffToken: string | null,
): true | { error: string; status: number } {
  const role = getMemberRole(roles, actor);
  if (!isLeaderRole(role)) {
    return { error: "Guild Leader access required.", status: 403 };
  }
  return assertStaffAuth(actor, roles, staffToken);
}

export function assertStaff(
  actor: Member,
  roles: Map<Member, GuildRole>,
  staffToken: string | null,
): true | { error: string; status: number } {
  return assertStaffAuth(actor, roles, staffToken);
}

export function assertLeader(
  actor: Member,
  roles: Map<Member, GuildRole>,
  staffToken: string | null,
): true | { error: string; status: number } {
  return assertLeaderAuth(actor, roles, staffToken);
}

export function assertSignupEdit(
  actor: Member,
  target: Member,
  roles: Map<Member, GuildRole>,
  staffToken: string | null,
): true | { error: string; status: number } {
  if (actor === target) return true;
  const staffCheck = assertStaffAuth(actor, roles, staffToken);
  if (staffCheck !== true) return staffCheck;
  if (!canEditSignupFor(actor, target, roles, true)) {
    return { error: "You can only edit your own signup.", status: 403 };
  }
  return true;
}

export function assertProfileEdit(
  actor: Member,
  target: Member,
  roles: Map<Member, GuildRole>,
  staffToken: string | null,
): true | { error: string; status: number } {
  if (actor === target) return true;
  const leaderCheck = assertLeaderAuth(actor, roles, staffToken);
  if (leaderCheck !== true) return leaderCheck;
  if (!canEditProfileFor(actor, target, roles, true)) {
    return { error: "You can only edit your own profile.", status: 403 };
  }
  return true;
}

export function parseRole(value: unknown): GuildRole | null {
  return typeof value === "string" && isGuildRole(value) ? value : null;
}
