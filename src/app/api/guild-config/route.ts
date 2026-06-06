import { NextRequest, NextResponse } from "next/server";
import type { Member } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import {
  DEFAULT_GUILD_CONFIG,
  type GuildConfig,
  type GuildConfigUpdate,
} from "@/lib/guild-config";
import {
  assertStaffAuth,
  loadRolesMap,
  parseActor,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";
import { buildRolesMap } from "@/lib/roles";

function parseLevel(value: unknown, max: number): number | null {
  if (value === undefined) return null;
  const level = Math.max(0, Math.min(max, Math.floor(Number(value))));
  if (!Number.isFinite(level)) return null;
  return level;
}

function mergeUpdate(current: GuildConfig, body: GuildConfigUpdate): GuildConfig {
  const guildHall = parseLevel(body.guildHallLevel, 8);
  const eventHall = parseLevel(body.eventHallLevel, 8);
  const trialHall = parseLevel(body.trialHallLevel, 99);

  if (
    (body.guildHallLevel !== undefined && guildHall === null) ||
    (body.eventHallLevel !== undefined && eventHall === null) ||
    (body.trialHallLevel !== undefined && trialHall === null)
  ) {
    throw new Error("Invalid hall level.");
  }

  return {
    ...current,
    guild_hall_level: guildHall ?? current.guild_hall_level,
    guild_event_hall_level: eventHall ?? current.guild_event_hall_level,
    trial_hall_level: trialHall ?? current.trial_hall_level,
  };
}

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ config: devStore.getGuildConfig(), mode: "dev" as const });
  }

  await ensureSchema();
  const rows = (await db`
    SELECT
      guild_hall_level,
      guild_event_hall_level,
      trial_hall_level,
      updated_at::text,
      updated_by
    FROM guild_config WHERE id = 1
  `) as GuildConfig[];

  const config = rows[0] ?? DEFAULT_GUILD_CONFIG;
  return NextResponse.json({ config, mode: "database" as const });
}

export async function PUT(request: NextRequest) {
  let body: GuildConfigUpdate & { actorMember?: Member; staffAuthToken?: string };
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
    try {
      return NextResponse.json({
        config: devStore.setGuildConfig(body, actorMember),
        mode: "dev",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid hall level." },
        { status: 400 },
      );
    }
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const existing = (await db`
    SELECT
      guild_hall_level,
      guild_event_hall_level,
      trial_hall_level,
      updated_at::text,
      updated_by
    FROM guild_config WHERE id = 1
  `) as GuildConfig[];

  let merged: GuildConfig;
  try {
    merged = mergeUpdate(existing[0] ?? DEFAULT_GUILD_CONFIG, body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid hall level." },
      { status: 400 },
    );
  }

  const rows = (await db`
    INSERT INTO guild_config (
      id,
      guild_hall_level,
      guild_event_hall_level,
      trial_hall_level,
      updated_by
    )
    VALUES (
      1,
      ${merged.guild_hall_level},
      ${merged.guild_event_hall_level},
      ${merged.trial_hall_level},
      ${actorMember}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      guild_hall_level = EXCLUDED.guild_hall_level,
      guild_event_hall_level = EXCLUDED.guild_event_hall_level,
      trial_hall_level = EXCLUDED.trial_hall_level,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING
      guild_hall_level,
      guild_event_hall_level,
      trial_hall_level,
      updated_at::text,
      updated_by
  `) as GuildConfig[];

  return NextResponse.json({ config: rows[0], mode: "database" });
}
