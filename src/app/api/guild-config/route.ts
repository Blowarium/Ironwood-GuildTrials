import { NextRequest, NextResponse } from "next/server";
import type { Member } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import {
  DEFAULT_GUILD_CONFIG,
  normalizeGuildConfigRow,
  stripCreditHallsFromLevels,
  type GuildConfig,
  type GuildConfigUpdate,
} from "@/lib/guild-config";
import { DEFAULT_GUILD_BUILDING_LEVELS } from "@/lib/guild-buildings-schedule";
import { parsePreferredBuildingStrategy } from "@/lib/guild-buildings-strategies";
import { parsePlannerMaterialDepositsJson } from "@/lib/guild-buildings-materials";
import { parsePlannerCoinDepositsJson } from "@/lib/guild-buildings-coins";
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

  let plannerCredits = current.planner_credits;
  let plannerCreditsAsOf = current.planner_credits_as_of;
  if (body.plannerCredits !== undefined) {
    plannerCredits = Math.max(0, Math.floor(Number(body.plannerCredits)));
    plannerCreditsAsOf = new Date().toISOString();
  }

  let plannerLevels = current.planner_levels;
  if (body.plannerLevels !== undefined) {
    plannerLevels = stripCreditHallsFromLevels({
      ...DEFAULT_GUILD_BUILDING_LEVELS,
      ...body.plannerLevels,
    });
  }

  let plannerMaterialDeposits = current.planner_material_deposits;
  if (body.plannerMaterialDeposits !== undefined) {
    plannerMaterialDeposits = parsePlannerMaterialDepositsJson(body.plannerMaterialDeposits);
  }

  let plannerCoinDeposits = current.planner_coin_deposits;
  if (body.plannerCoinDeposits !== undefined) {
    plannerCoinDeposits = parsePlannerCoinDepositsJson(body.plannerCoinDeposits);
  }

  return {
    ...current,
    guild_hall_level: guildHall ?? current.guild_hall_level,
    guild_event_hall_level: eventHall ?? current.guild_event_hall_level,
    trial_hall_level: trialHall ?? current.trial_hall_level,
    preferred_building_strategy:
      body.preferredBuildingStrategy !== undefined
        ? parsePreferredBuildingStrategy(body.preferredBuildingStrategy)
        : current.preferred_building_strategy,
    planner_credits: plannerCredits,
    planner_credits_as_of: plannerCreditsAsOf,
    planner_levels: plannerLevels,
    planner_material_deposits: plannerMaterialDeposits,
    planner_coin_deposits: plannerCoinDeposits,
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
      preferred_building_strategy,
      planner_credits,
      planner_credits_as_of::text,
      planner_levels,
      planner_material_deposits,
      planner_coin_deposits,
      updated_at::text,
      updated_by
    FROM guild_config WHERE id = 1
  `) as Record<string, unknown>[];

  const config = normalizeGuildConfigRow(rows[0] ?? DEFAULT_GUILD_CONFIG);
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
      preferred_building_strategy,
      planner_credits,
      planner_credits_as_of::text,
      planner_levels,
      planner_material_deposits,
      planner_coin_deposits,
      updated_at::text,
      updated_by
    FROM guild_config WHERE id = 1
  `) as Record<string, unknown>[];

  let merged: GuildConfig;
  try {
    merged = mergeUpdate(normalizeGuildConfigRow(existing[0] ?? DEFAULT_GUILD_CONFIG), body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid hall level." },
      { status: 400 },
    );
  }

  const plannerLevelsJson =
    merged.planner_levels == null ? null : JSON.stringify(merged.planner_levels);
  const plannerMaterialDepositsJson =
    merged.planner_material_deposits == null
      ? null
      : JSON.stringify(merged.planner_material_deposits);
  const plannerCoinDepositsJson =
    merged.planner_coin_deposits == null ? null : JSON.stringify(merged.planner_coin_deposits);

  const rows = (await db`
    INSERT INTO guild_config (
      id,
      guild_hall_level,
      guild_event_hall_level,
      trial_hall_level,
      preferred_building_strategy,
      planner_credits,
      planner_credits_as_of,
      planner_levels,
      planner_material_deposits,
      planner_coin_deposits,
      updated_by
    )
    VALUES (
      1,
      ${merged.guild_hall_level},
      ${merged.guild_event_hall_level},
      ${merged.trial_hall_level},
      ${merged.preferred_building_strategy},
      ${merged.planner_credits},
      ${merged.planner_credits_as_of},
      ${plannerLevelsJson},
      ${plannerMaterialDepositsJson},
      ${plannerCoinDepositsJson},
      ${actorMember}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      guild_hall_level = EXCLUDED.guild_hall_level,
      guild_event_hall_level = EXCLUDED.guild_event_hall_level,
      trial_hall_level = EXCLUDED.trial_hall_level,
      preferred_building_strategy = EXCLUDED.preferred_building_strategy,
      planner_credits = EXCLUDED.planner_credits,
      planner_credits_as_of = EXCLUDED.planner_credits_as_of,
      planner_levels = EXCLUDED.planner_levels,
      planner_material_deposits = EXCLUDED.planner_material_deposits,
      planner_coin_deposits = EXCLUDED.planner_coin_deposits,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING
      guild_hall_level,
      guild_event_hall_level,
      trial_hall_level,
      preferred_building_strategy,
      planner_credits,
      planner_credits_as_of::text,
      planner_levels,
      planner_material_deposits,
      planner_coin_deposits,
      updated_at::text,
      updated_by
  `) as Record<string, unknown>[];

  return NextResponse.json({ config: normalizeGuildConfigRow(rows[0]), mode: "database" });
}
