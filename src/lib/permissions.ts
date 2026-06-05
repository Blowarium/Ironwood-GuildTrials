import type { Member } from "./constants";
import type { GuildRole } from "./roles";
import { getMemberRole, type RolesMap } from "./roles";

export function isStaffRole(role: GuildRole | null | undefined): boolean {
  return role === "guild_leader" || role === "guild_officer";
}

export function isLeaderRole(role: GuildRole | null | undefined): boolean {
  return role === "guild_leader";
}

export function canManageRoles(role: GuildRole | null | undefined): boolean {
  return isLeaderRole(role);
}

export function canUseStaffTools(role: GuildRole | null | undefined): boolean {
  return isStaffRole(role);
}

export function canEditSignupFor(
  actor: Member | "",
  target: Member,
  roles: RolesMap,
  staffUnlocked = false,
): boolean {
  if (!actor) return false;
  if (actor === target) return true;
  return isStaffRole(getMemberRole(roles, actor)) && staffUnlocked;
}

export function canEditProfileFor(
  actor: Member | "",
  target: Member,
  roles: RolesMap,
  staffUnlocked = false,
): boolean {
  if (!actor) return false;
  if (actor === target) return true;
  return isLeaderRole(getMemberRole(roles, actor)) && staffUnlocked;
}

export function canDragSignup(
  actor: Member | "",
  signupMember: Member,
  roles: RolesMap,
  staffUnlocked = false,
): boolean {
  return canEditSignupFor(actor, signupMember, roles, staffUnlocked);
}

/** Role used for permission checks — staff without unlock counts as member. */
export function effectiveRole(
  member: Member | "",
  roles: RolesMap,
  staffUnlocked: boolean,
): GuildRole | null {
  if (!member) return null;
  const dbRole = getMemberRole(roles, member);
  if (!dbRole) return null;
  if (isStaffRole(dbRole) && !staffUnlocked) return "guild_member";
  return dbRole;
}
