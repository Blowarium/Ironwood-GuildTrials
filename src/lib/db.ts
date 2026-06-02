import { neon, NeonQueryFunction } from "@neondatabase/serverless";

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (week_start, member_name)
    )
  `;

  await db`
    ALTER TABLE trial_signups
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned'
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_trial_signups_week
    ON trial_signups (week_start)
  `;

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
      CONSTRAINT guild_config_singleton CHECK (id = 1)
    )
  `;
}
