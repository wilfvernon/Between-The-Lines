-- ============================================================
-- Migration: Create monster_statblocks table
-- Stores parsed monster blocks plus raw source text for re-parsing.
-- ============================================================

CREATE TABLE IF NOT EXISTS monster_statblocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  size TEXT,
  creature_type TEXT,
  alignment TEXT,

  armor_class_value INTEGER,
  armor_class_notes TEXT,
  hit_points_value INTEGER,
  hit_points_formula TEXT,

  speed JSONB DEFAULT '{}'::jsonb,

  strength INTEGER,
  dexterity INTEGER,
  constitution INTEGER,
  intelligence INTEGER,
  wisdom INTEGER,
  charisma INTEGER,

  saving_throws JSONB DEFAULT '{}'::jsonb,
  skills JSONB DEFAULT '{}'::jsonb,
  damage_immunities TEXT[] DEFAULT '{}'::text[],
  damage_resistances TEXT[] DEFAULT '{}'::text[],
  damage_vulnerabilities TEXT[] DEFAULT '{}'::text[],
  condition_immunities TEXT[] DEFAULT '{}'::text[],
  senses JSONB DEFAULT '{}'::jsonb,
  passive_perception INTEGER,
  languages TEXT[] DEFAULT '{}'::text[],

  challenge_rating TEXT,
  experience_points INTEGER,

  traits JSONB DEFAULT '[]'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  bonus_actions JSONB DEFAULT '[]'::jsonb,
  reactions JSONB DEFAULT '[]'::jsonb,
  legendary_actions_intro TEXT,
  legendary_actions JSONB DEFAULT '[]'::jsonb,

  source_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monster_statblocks_name ON monster_statblocks(name);
CREATE INDEX IF NOT EXISTS idx_monster_statblocks_challenge ON monster_statblocks(challenge_rating);
