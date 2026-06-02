import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import { DEFAULT_GUILD_CONFIG, type GuildConfig } from "@/lib/guild-config";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ config: devStore.getGuildConfig(), mode: "dev" as const });
  }

  await ensureSchema();
  const rows = (await db`
    SELECT trial_hall_level, updated_at::text FROM guild_config WHERE id = 1
  `) as GuildConfig[];

  const config = rows[0] ?? DEFAULT_GUILD_CONFIG;
  return NextResponse.json({ config, mode: "database" as const });
}

export async function PUT(request: NextRequest) {
  let body: { trialHallLevel: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const level = Math.max(0, Math.floor(Number(body.trialHallLevel)));
  if (!Number.isFinite(level)) {
    return NextResponse.json({ error: "Invalid hall level." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({
      config: devStore.setGuildConfig(level),
      mode: "dev",
    });
  }

  await ensureSchema();
  const rows = (await db`
    INSERT INTO guild_config (id, trial_hall_level)
    VALUES (1, ${level})
    ON CONFLICT (id)
    DO UPDATE SET trial_hall_level = EXCLUDED.trial_hall_level, updated_at = NOW()
    RETURNING trial_hall_level, updated_at::text
  `) as GuildConfig[];

  return NextResponse.json({ config: rows[0], mode: "database" });
}
