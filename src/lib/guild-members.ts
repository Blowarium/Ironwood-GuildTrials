import { MEMBERS, type Member } from "./constants";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { devStore } from "./dev-store";
import { buildRolesMap, getMemberRole, type MemberRoleRow } from "./roles";

export const MEMBER_NAME_MIN = 2;
export const MEMBER_NAME_MAX = 32;
const MEMBER_NAME_RE = /^[A-Za-z0-9_-]+$/;

export type ValidateMemberNameResult =
  | { ok: true; name: Member }
  | { ok: false; error: string };

export function validateMemberName(raw: string): ValidateMemberNameResult {
  const trimmed = raw.trim();
  if (trimmed.length < MEMBER_NAME_MIN || trimmed.length > MEMBER_NAME_MAX) {
    return {
      ok: false,
      error: `Name must be ${MEMBER_NAME_MIN}–${MEMBER_NAME_MAX} characters.`,
    };
  }
  if (!MEMBER_NAME_RE.test(trimmed)) {
    return {
      ok: false,
      error: "Name may only use letters, numbers, underscore, and hyphen.",
    };
  }
  return { ok: true, name: trimmed };
}

export function memberNameExists(members: readonly string[], name: string): boolean {
  const lower = name.toLowerCase();
  return members.some((m) => m.toLowerCase() === lower);
}

export async function listGuildMemberNames(
  db: NeonQueryFunction<false, false> | null,
): Promise<string[]> {
  if (!db) return devStore.listMemberNames();
  const rows = (await db`
    SELECT member_name FROM guild_members ORDER BY member_name
  `) as { member_name: string }[];
  return rows.map((r) => r.member_name);
}

export async function isActiveMember(
  db: NeonQueryFunction<false, false> | null,
  name: string,
): Promise<boolean> {
  const members = await listGuildMemberNames(db);
  return members.includes(name);
}

export async function assertActiveMember(
  db: NeonQueryFunction<false, false> | null,
  name: string,
): Promise<true | { error: string; status: number }> {
  if (!(await isActiveMember(db, name))) {
    return { error: "Unknown guild member.", status: 400 };
  }
  return true;
}

export async function seedGuildMembersIfEmpty(
  db: NeonQueryFunction<false, false>,
): Promise<void> {
  const countRows = (await db`
    SELECT COUNT(*)::int AS n FROM guild_members
  `) as { n: number }[];
  if ((countRows[0]?.n ?? 0) > 0) return;

  for (const memberName of MEMBERS) {
    await db`
      INSERT INTO guild_members (member_name)
      VALUES (${memberName})
      ON CONFLICT (member_name) DO NOTHING
    `;
  }
}

export async function purgeMemberData(
  db: NeonQueryFunction<false, false>,
  memberName: string,
): Promise<void> {
  await db`DELETE FROM trial_signups WHERE member_name = ${memberName}`;
  await db`DELETE FROM member_preferences WHERE member_name = ${memberName}`;
  await db`DELETE FROM guild_member_roles WHERE member_name = ${memberName}`;
  await db`DELETE FROM member_skill_profiles WHERE member_name = ${memberName}`;
  await db`DELETE FROM member_profile_meta WHERE member_name = ${memberName}`;
}

export async function purgeNonMemberData(
  db: NeonQueryFunction<false, false>,
): Promise<void> {
  const allowed = await listGuildMemberNames(db);
  await db`DELETE FROM trial_signups WHERE NOT (member_name = ANY(${allowed}))`;
  await db`DELETE FROM member_preferences WHERE NOT (member_name = ANY(${allowed}))`;
  await db`DELETE FROM guild_member_roles WHERE NOT (member_name = ANY(${allowed}))`;
  await db`DELETE FROM member_skill_profiles WHERE NOT (member_name = ANY(${allowed}))`;
  await db`DELETE FROM member_profile_meta WHERE NOT (member_name = ANY(${allowed}))`;
}

async function leaderCountExcluding(
  db: NeonQueryFunction<false, false> | null,
  members: readonly string[],
  exclude?: string,
): Promise<number> {
  let count = 0;
  if (!db) {
    for (const m of members) {
      if (m === exclude) continue;
      if (devStore.getRole(m as Member) === "guild_leader") count++;
    }
    return count;
  }

  const roleRows = (await db`
    SELECT member_name, role, updated_at::text, updated_by
    FROM guild_member_roles
  `) as MemberRoleRow[];
  const rolesMap = buildRolesMap(roleRows, members);

  for (const m of members) {
    if (m === exclude) continue;
    if (getMemberRole(rolesMap, m) === "guild_leader") count++;
  }
  return count;
}

export type ManageMemberResult =
  | { ok: true; members: string[] }
  | { ok: false; error: string; status: number };

export async function addGuildMember(
  db: NeonQueryFunction<false, false> | null,
  rawName: string,
  actor: Member,
): Promise<ManageMemberResult> {
  const parsed = validateMemberName(rawName);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const members = await listGuildMemberNames(db);
  if (memberNameExists(members, parsed.name)) {
    return { ok: false, error: "That member is already on the roster.", status: 409 };
  }

  if (!db) {
    devStore.addMember(parsed.name, actor);
    return { ok: true, members: devStore.listMemberNames() };
  }

  await db`
    INSERT INTO guild_members (member_name, created_by)
    VALUES (${parsed.name}, ${actor})
  `;
  await db`
    INSERT INTO guild_member_roles (member_name, role, updated_by)
    VALUES (${parsed.name}, 'guild_member', ${actor})
    ON CONFLICT (member_name) DO NOTHING
  `;

  return { ok: true, members: await listGuildMemberNames(db) };
}

export async function removeGuildMember(
  db: NeonQueryFunction<false, false> | null,
  memberName: Member,
  actor: Member,
): Promise<ManageMemberResult> {
  const members = await listGuildMemberNames(db);
  if (!members.includes(memberName)) {
    return { ok: false, error: "Unknown guild member.", status: 400 };
  }
  if (memberName === actor) {
    return { ok: false, error: "You cannot remove yourself from the roster.", status: 400 };
  }
  if (members.length <= 1) {
    return { ok: false, error: "The guild must have at least one member.", status: 400 };
  }

  const role = !db ? devStore.getRole(memberName) : getMemberRole(
    buildRolesMap(
      (await db`
        SELECT member_name, role, updated_at::text, updated_by
        FROM guild_member_roles
      `) as MemberRoleRow[],
      members,
    ),
    memberName,
  );

  if (role === "guild_leader") {
    const leaders = await leaderCountExcluding(db, members, memberName);
    if (leaders < 1) {
      return {
        ok: false,
        error: "Assign another Guild Leader before removing this member.",
        status: 400,
      };
    }
  }

  if (!db) {
    devStore.removeMember(memberName);
    return { ok: true, members: devStore.listMemberNames() };
  }

  await purgeMemberData(db, memberName);
  await db`DELETE FROM guild_members WHERE member_name = ${memberName}`;

  return { ok: true, members: await listGuildMemberNames(db) };
}
