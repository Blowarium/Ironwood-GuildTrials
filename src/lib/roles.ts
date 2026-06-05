import { MEMBERS, type Member } from "./constants";

export const GUILD_ROLES = ["guild_leader", "guild_officer", "guild_member"] as const;
export type GuildRole = (typeof GUILD_ROLES)[number];

export const ROLE_LABELS: Record<GuildRole, string> = {
  guild_leader: "Guild Leader",
  guild_officer: "Guild Officer",
  guild_member: "Guild Member",
};

export const DEFAULT_GUILD_LEADER: Member = "Blowarium";

export interface MemberRoleRow {
  member_name: Member;
  role: GuildRole;
  updated_at: string;
  updated_by: Member | null;
}

export type RolesMap = Map<Member, GuildRole>;

export function isGuildRole(value: string): value is GuildRole {
  return (GUILD_ROLES as readonly string[]).includes(value);
}

export function defaultRoleForMember(member: Member): GuildRole {
  return member === DEFAULT_GUILD_LEADER ? "guild_leader" : "guild_member";
}

export function buildDefaultRoles(): MemberRoleRow[] {
  return MEMBERS.map((member_name) => ({
    member_name,
    role: defaultRoleForMember(member_name),
    updated_at: new Date().toISOString(),
    updated_by: null,
  }));
}

export function buildRolesMap(rows: MemberRoleRow[]): RolesMap {
  const map = new Map<Member, GuildRole>();
  for (const row of rows) {
    map.set(row.member_name, row.role);
  }
  for (const m of MEMBERS) {
    if (!map.has(m)) map.set(m, defaultRoleForMember(m));
  }
  return map;
}

export function getMemberRole(map: RolesMap, member: Member | ""): GuildRole | null {
  if (!member) return null;
  return map.get(member) ?? defaultRoleForMember(member);
}
