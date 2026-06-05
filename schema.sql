-- Run once in your Neon (or Postgres) SQL console after creating the database.

CREATE TABLE IF NOT EXISTS trial_signups (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  member_name TEXT NOT NULL,
  skill TEXT NOT NULL,
  planned_date DATE NOT NULL,
  planned_start_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned',
  last_edited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_start, member_name)
);

CREATE INDEX IF NOT EXISTS idx_trial_signups_week ON trial_signups (week_start);
CREATE INDEX IF NOT EXISTS idx_trial_signups_week_skill ON trial_signups (week_start, skill);

CREATE TABLE IF NOT EXISTS member_preferences (
  member_name TEXT PRIMARY KEY,
  pref_1 TEXT,
  pref_2 TEXT,
  pref_3 TEXT,
  xp_pref_1 INTEGER,
  xp_pref_2 INTEGER,
  xp_pref_3 INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  trial_hall_level INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO guild_config (id, trial_hall_level) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

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
