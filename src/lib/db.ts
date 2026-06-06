import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { DEFAULT_GUILD_LEADER } from "./roles";

let sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!sql) sql = neon(url);
  return sql;
}

export async function ensureSchema(): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db`
    CREATE TABLE IF NOT EXISTS trial_signups (
      id SERIAL PRIMARY KEY,
      week_start DATE NOT NULL,
      member_name TEXT NOT NULL,
      skill TEXT NOT NULL,
      planned_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      last_edited_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (week_start, member_name)
    )
  `;

  await db`ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned'`;
  await db`ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS last_edited_by TEXT`;
  await db`ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS planned_start_at TIMESTAMPTZ`;
  await db`
    UPDATE trial_signups
    SET planned_start_at = (planned_date + TIME '08:00:00') AT TIME ZONE 'UTC'
    WHERE planned_start_at IS NULL
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_trial_signups_week ON trial_signups (week_start)`;
  await db`
    CREATE INDEX IF NOT EXISTS idx_trial_signups_week_skill
    ON trial_signups (week_start, skill)
  `;

  await db`
    CREATE TABLE IF NOT EXISTS skill_week_completions (
      week_start DATE NOT NULL,
      skill TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT TRUE,
      marked_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (week_start, skill)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS member_preferences (
      member_name TEXT PRIMARY KEY,
      pref_1 TEXT,
      pref_2 TEXT,
      pref_3 TEXT,
      xp_pref_1 INTEGER,
      xp_pref_2 INTEGER,
      xp_pref_3 INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`ALTER TABLE member_preferences ADD COLUMN IF NOT EXISTS xp_pref_1 INTEGER`;
  await db`ALTER TABLE member_preferences ADD COLUMN IF NOT EXISTS xp_pref_2 INTEGER`;
  await db`ALTER TABLE member_preferences ADD COLUMN IF NOT EXISTS xp_pref_3 INTEGER`;

  await db`
    CREATE TABLE IF NOT EXISTS guild_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      trial_hall_level INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT,
      CONSTRAINT guild_config_singleton CHECK (id = 1)
    )
  `;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS updated_by TEXT`;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS guild_hall_level INTEGER NOT NULL DEFAULT 8`;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS guild_event_hall_level INTEGER NOT NULL DEFAULT 6`;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS preferred_building_strategy TEXT NOT NULL DEFAULT 'max_income'`;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS planner_credits INTEGER`;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS planner_levels TEXT`;
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS planner_material_deposits TEXT`;

  await db`
    CREATE TABLE IF NOT EXISTS guild_member_roles (
      member_name TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'guild_member',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS member_skill_profiles (
      member_name TEXT NOT NULL,
      skill TEXT NOT NULL,
      xp_per_hour INTEGER,
      preference_rank INTEGER,
      ironwood_action_id INTEGER,
      PRIMARY KEY (member_name, skill)
    )
  `;

  await db`
    ALTER TABLE member_skill_profiles
    ADD COLUMN IF NOT EXISTS ironwood_action_id INTEGER
  `;

  await db`
    CREATE TABLE IF NOT EXISTS member_profile_meta (
      member_name TEXT PRIMARY KEY,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;

  await db`
    INSERT INTO guild_member_roles (member_name, role)
    VALUES (${DEFAULT_GUILD_LEADER}, 'guild_leader')
    ON CONFLICT (member_name) DO NOTHING
  `;
}
