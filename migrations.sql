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

CREATE TABLE IF NOT EXISTS skill_week_completions (
  week_start DATE NOT NULL,
  skill TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  marked_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, skill)
);
