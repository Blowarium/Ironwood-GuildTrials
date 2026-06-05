import { NextRequest, NextResponse } from "next/server";
import type { Member } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import { DEFAULT_GUILD_CONFIG, type GuildConfig } from "@/lib/guild-config";
import {
  assertStaffAuth,
  loadRolesMap,
  parseActor,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";
import { buildRolesMap } from "@/lib/roles";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ config: devStore.getGuildConfig(), mode: "dev" as const });
  }

  await ensureSchema();
  const rows = (await db`
    SELECT trial_hall_level, updated_at::text, updated_by
    FROM guild_config WHERE id = 1
  `) as GuildConfig[];

  const config = rows[0] ?? DEFAULT_GUILD_CONFIG;
  return NextResponse.json({ config, mode: "database" as const });
}

export async function PUT(request: NextRequest) {
  let body: { trialHallLevel: number; actorMember?: Member; staffAuthToken?: string };
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

  const level = Math.max(0, Math.floor(Number(body.trialHallLevel)));
  if (!Number.isFinite(level)) {
    return NextResponse.json({ error: "Invalid hall level." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }
    return NextResponse.json({
      config: devStore.setGuildConfig(level, actorMember),
      mode: "dev",
    });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const rows = (await db`
    INSERT INTO guild_config (id, trial_hall_level, updated_by)
    VALUES (1, ${level}, ${actorMember})
    ON CONFLICT (id)
    DO UPDATE SET
      trial_hall_level = EXCLUDED.trial_hall_level,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING trial_hall_level, updated_at::text, updated_by
  `) as GuildConfig[];

  return NextResponse.json({ config: rows[0], mode: "database" });
}
