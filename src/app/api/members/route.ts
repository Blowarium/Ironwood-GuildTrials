import { NextRequest, NextResponse } from "next/server";
import { MEMBERS, SKILLS, type Member } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import {
  buildProfilesMap,
  emptySkillRows,
  inferPreferencesCustomized,
  isLegacyFactoryDefaultRanks,
  NEUTRAL_PREFERENCE_RANK,
  normalizeProfile,
  rosterStats,
  type MemberProfile,
  type MemberRosterEntry,
  validateAndParseProfileSkills,
  type ProfileSkillInput,
} from "@/lib/member-profile";
import {
  assertLeader,
  assertProfileEdit,
  assertStaffAuth,
  loadRolesMap,
  parseActor,
  parseRole,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";
import { buildRolesMap, getMemberRole, type MemberRoleRow } from "@/lib/roles";

function isMember(name: string): name is Member {
  return (MEMBERS as readonly string[]).includes(name);
}

async function fetchProfileFromDb(
  db: NonNullable<ReturnType<typeof getDb>>,
  memberName: Member,
): Promise<MemberProfile> {
  const metaRows = (await db`
    SELECT updated_at::text, updated_by, preferences_customized
    FROM member_profile_meta WHERE member_name = ${memberName}
  `) as { updated_at: string; updated_by: Member | null; preferences_customized: boolean }[];

  const skillRows = (await db`
    SELECT skill, xp_per_hour, preference_rank, ironwood_action_id
    FROM member_skill_profiles
    WHERE member_name = ${memberName}
  `) as {
    skill: MemberProfile["skills"][0]["skill"];
    xp_per_hour: number | null;
    preference_rank: number | null;
    ironwood_action_id: number | null;
  }[];

  return normalizeProfile({
    member_name: memberName,
    skills: skillRows.length
      ? skillRows.map((r) => ({
          skill: r.skill,
          xp_per_hour: r.xp_per_hour,
          preference_rank: r.preference_rank,
          ironwood_action_id: r.ironwood_action_id,
        }))
      : emptySkillRows(),
    updated_at: metaRows[0]?.updated_at ?? new Date(0).toISOString(),
    updated_by: metaRows[0]?.updated_by ?? null,
    preferences_customized: metaRows[0]?.preferences_customized ?? false,
  });
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const memberParam = request.nextUrl.searchParams.get("member");

  if (!db) {
    const roles = devStore.listRoles();
    const profiles = devStore.listProfiles();
    if (memberParam) {
      if (!isMember(memberParam)) {
        return NextResponse.json({ error: "Unknown member." }, { status: 400 });
      }
      return NextResponse.json({
        profile: devStore.getProfile(memberParam),
        role: devStore.getRole(memberParam),
        mode: "dev" as const,
      });
    }
    return NextResponse.json({
      roles,
      profiles,
      mode: "dev" as const,
    });
  }

  await ensureSchema();
  const roleRows = (await db`
    SELECT member_name, role, updated_at::text, updated_by
    FROM guild_member_roles
    ORDER BY member_name
  `) as MemberRoleRow[];

  const rolesMap = buildRolesMap(roleRows);

  if (memberParam) {
    if (!isMember(memberParam)) {
      return NextResponse.json({ error: "Unknown member." }, { status: 400 });
    }
    const profile = await fetchProfileFromDb(db, memberParam);
    return NextResponse.json({
      profile,
      role: getMemberRole(rolesMap, memberParam),
      mode: "database" as const,
    });
  }

  const profiles: MemberProfile[] = [];
  for (const m of MEMBERS) {
    profiles.push(await fetchProfileFromDb(db, m));
  }

  return NextResponse.json({
    roles: MEMBERS.map((member_name) => ({
      member_name,
      role: getMemberRole(rolesMap, member_name),
      updated_at: roleRows.find((r) => r.member_name === member_name)?.updated_at ?? new Date(0).toISOString(),
      updated_by: roleRows.find((r) => r.member_name === member_name)?.updated_by ?? null,
    })),
    profiles,
    mode: "database" as const,
  });
}

export async function PUT(request: NextRequest) {
  let body: {
    actorMember?: Member;
    memberName?: Member;
    skills?: ProfileSkillInput[];
    staffAuthToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const actor = parseActor(body.actorMember);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  if (!body.memberName || !isMember(body.memberName)) {
    return NextResponse.json({ error: "Unknown guild member." }, { status: 400 });
  }

  const parsed = validateAndParseProfileSkills(body.skills ?? []);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertProfileEdit(actorMember, body.memberName, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }
    const profile = devStore.setProfile(body.memberName, parsed.rows, actorMember);
    return NextResponse.json({ profile, mode: "dev" });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertProfileEdit(actorMember, body.memberName, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const existingMeta = (await db`
    SELECT preferences_customized FROM member_profile_meta WHERE member_name = ${body.memberName}
  `) as { preferences_customized: boolean }[];

  const preferencesCustomized =
    existingMeta[0]?.preferences_customized === true ||
    inferPreferencesCustomized(parsed.rows);

  await db`DELETE FROM member_skill_profiles WHERE member_name = ${body.memberName}`;
  for (const row of parsed.rows) {
    await db`
      INSERT INTO member_skill_profiles (member_name, skill, xp_per_hour, preference_rank, ironwood_action_id)
      VALUES (${body.memberName}, ${row.skill}, ${row.xp_per_hour}, ${row.preference_rank}, ${row.ironwood_action_id})
    `;
  }
  await db`
    INSERT INTO member_profile_meta (member_name, updated_by, preferences_customized)
    VALUES (${body.memberName}, ${actorMember}, ${preferencesCustomized})
    ON CONFLICT (member_name)
    DO UPDATE SET
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by,
      preferences_customized = EXCLUDED.preferences_customized
  `;

  const profile = await fetchProfileFromDb(db, body.memberName);
  return NextResponse.json({ profile, mode: "database" });
}

export async function PATCH(request: NextRequest) {
  let body: { actorMember?: Member; memberName?: Member; role?: string; staffAuthToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const actor = parseActor(body.actorMember);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  if (!body.memberName || !isMember(body.memberName)) {
    return NextResponse.json({ error: "Unknown guild member." }, { status: 400 });
  }

  const role = parseRole(body.role);
  if (!role) return NextResponse.json({ error: "Invalid role." }, { status: 400 });

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertLeader(actorMember, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }
    const row = devStore.setRole(body.memberName, role, actorMember);
    return NextResponse.json({ role: row, mode: "dev" });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertLeader(actorMember, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const rows = (await db`
    INSERT INTO guild_member_roles (member_name, role, updated_by)
    VALUES (${body.memberName}, ${role}, ${actorMember})
    ON CONFLICT (member_name)
    DO UPDATE SET role = EXCLUDED.role, updated_at = NOW(), updated_by = EXCLUDED.updated_by
    RETURNING member_name, role, updated_at::text, updated_by
  `) as MemberRoleRow[];

  return NextResponse.json({ role: rows[0], mode: "database" });
}

export async function POST(request: NextRequest) {
  let body: { actorMember?: Member; staffAuthToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const actor = parseActor(body.actorMember);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const profilesMap = buildProfilesMap(devStore.listProfiles());
    const roster: MemberRosterEntry[] = MEMBERS.map((member_name) => {
      const profile = profilesMap.get(member_name);
      const stats = rosterStats(profile);
      return {
        member_name,
        role: getMemberRole(rolesMap, member_name)!,
        profile_updated_at: profile?.updated_at ?? null,
        profile_updated_by: profile?.updated_by ?? null,
        ranked_skill_count: stats.ranked_skill_count,
        xp_filled_count: stats.xp_filled_count,
        total_skills: SKILLS.length,
        profile_complete: stats.profile_complete,
      };
    });
    return NextResponse.json({ roster, mode: "dev" });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const roster: MemberRosterEntry[] = [];
  for (const member_name of MEMBERS) {
    const profile = await fetchProfileFromDb(db, member_name);
    const stats = rosterStats(profile);
    roster.push({
      member_name,
      role: getMemberRole(rolesMap, member_name)!,
      profile_updated_at: profile.updated_at,
      profile_updated_by: profile.updated_by,
      ranked_skill_count: stats.ranked_skill_count,
      xp_filled_count: stats.xp_filled_count,
      total_skills: SKILLS.length,
      profile_complete: stats.profile_complete,
    });
  }

  return NextResponse.json({ roster, mode: "database" });
}
