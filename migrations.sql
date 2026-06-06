-- Run if you deployed a version with one-member-per-skill-day slot locking.

ALTER TABLE trial_signups
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planned';

ALTER TABLE trial_signups DROP CONSTRAINT IF EXISTS trial_signups_week_skill_day_key;
ALTER TABLE trial_signups DROP CONSTRAINT IF EXISTS trial_signups_week_start_skill_planned_date_key;

CREATE INDEX IF NOT EXISTS idx_trial_signups_week_skill ON trial_signups (week_start, skill);

CREATE TABLE IF NOT EXISTS member_preferences (
  member_name TEXT PRIMARY KEY,
  pref_1 TEXT,
  pref_2 TEXT,
  pref_3 TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE member_preferences ADD COLUMN IF NOT EXISTS xp_pref_1 INTEGER;
ALTER TABLE member_preferences ADD COLUMN IF NOT EXISTS xp_pref_2 INTEGER;
ALTER TABLE member_preferences ADD COLUMN IF NOT EXISTS xp_pref_3 INTEGER;

CREATE TABLE IF NOT EXISTS guild_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  trial_hall_level INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO guild_config (id, trial_hall_level) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS planned_start_at TIMESTAMPTZ;
UPDATE trial_signups
SET planned_start_at = (planned_date + TIME '08:00:00') AT TIME ZONE 'UTC'
WHERE planned_start_at IS NULL;

ALTER TABLE trial_signups ADD COLUMN IF NOT EXISTS last_edited_by TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS guild_hall_level INTEGER NOT NULL DEFAULT 8;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS guild_event_hall_level INTEGER NOT NULL DEFAULT 6;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS preferred_building_strategy TEXT NOT NULL DEFAULT 'max_income';
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS planner_credits INTEGER;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS planner_levels TEXT;

CREATE TABLE IF NOT EXISTS guild_member_roles (
  member_name TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'guild_member',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO guild_member_roles (member_name, role)
VALUES ('Blowarium', 'guild_leader')
ON CONFLICT (member_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS member_skill_profiles (
  member_name TEXT NOT NULL,
  skill TEXT NOT NULL,
  xp_per_hour INTEGER,
  preference_rank INTEGER,
  ironwood_action_id INTEGER,
  PRIMARY KEY (member_name, skill)
);

CREATE TABLE IF NOT EXISTS member_profile_meta (
  member_name TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS skill_week_completions (
  week_start DATE NOT NULL,
  skill TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  marked_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, skill)
);

ALTER TABLE member_skill_profiles ADD COLUMN IF NOT EXISTS ironwood_action_id INTEGER;
