-- ============================================================
-- D&D Character Sheet Database Schema
-- For Supabase PostgreSQL
-- WARNING: This is for documentation. Use Supabase UI or migrations for creation.
-- Table order and constraints may differ from production.
-- ============================================================

-- ============================================================
-- REFERENCE TABLES (No dependencies)
-- ============================================================

-- Spells reference table
-- Note: casting_time is TEXT (not VARCHAR) to accommodate long descriptions like
-- "1 reaction, which you take when you see a creature within 60 feet of you..."
CREATE TABLE spells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 9),
  school VARCHAR(50),
  casting_time TEXT,
  range VARCHAR(50),
  components TEXT,
  duration VARCHAR(100),
  description TEXT NOT NULL,
  higher_levels TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Magic items reference table
CREATE TABLE magic_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50),
  rarity VARCHAR(50),
  requires_attunement VARCHAR(255),
  description TEXT NOT NULL,
  properties JSONB,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Feats reference table
CREATE TABLE feats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  prerequisites TEXT,
  benefits JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- MAIN CHARACTER TABLE
-- ============================================================

CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  full_name TEXT,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 20),
  classes JSONB NOT NULL,
  species VARCHAR(255) NOT NULL,
  background VARCHAR(255),
  image_url TEXT,
  bio TEXT,
  max_hp INTEGER NOT NULL,
  speed INTEGER DEFAULT 30,
  strength INTEGER NOT NULL CHECK (strength >= 1 AND strength <= 30),
  dexterity INTEGER NOT NULL CHECK (dexterity >= 1 AND dexterity <= 30),
  constitution INTEGER NOT NULL CHECK (constitution >= 1 AND constitution <= 30),
  intelligence INTEGER NOT NULL CHECK (intelligence >= 1 AND intelligence <= 30),
  wisdom INTEGER NOT NULL CHECK (wisdom >= 1 AND wisdom <= 30),
  charisma INTEGER NOT NULL CHECK (charisma >= 1 AND charisma <= 30),
  save_strength BOOLEAN DEFAULT false,
  save_dexterity BOOLEAN DEFAULT false,
  save_constitution BOOLEAN DEFAULT false,
  save_intelligence BOOLEAN DEFAULT false,
  save_wisdom BOOLEAN DEFAULT false,
  save_charisma BOOLEAN DEFAULT false,
  spellcasting_ability VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ability_score_improvements JSONB DEFAULT '[]'::jsonb
);

-- ============================================================
-- CHARACTER RELATIONSHIP TABLES
-- ============================================================

-- Character skills (proficiencies and expertise only)
CREATE TABLE character_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  expertise BOOLEAN DEFAULT false
);

-- Character spells (prepared status tracking)
CREATE TABLE character_spells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  spell_id UUID NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
  is_prepared BOOLEAN DEFAULT false,
  always_prepared BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Character features (class, race, background features)
CREATE TABLE character_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL,
  description TEXT,
  max_uses INTEGER,
  reset_on VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Character feats (junction table)
CREATE TABLE character_feats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  feat_id UUID NOT NULL REFERENCES feats(id) ON DELETE CASCADE,
  source VARCHAR(50),
  choices JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Character inventory
CREATE TABLE character_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  magic_item_id UUID REFERENCES magic_items(id) ON DELETE CASCADE,
  mundane_item_name VARCHAR(255),
  quantity INTEGER DEFAULT 1,
  equipped BOOLEAN DEFAULT false,
  attuned BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CHECK (
    (magic_item_id IS NOT NULL AND mundane_item_name IS NULL) OR
    (magic_item_id IS NULL AND mundane_item_name IS NOT NULL)
  )
);

-- Character currency
CREATE TABLE character_currency (
  character_id UUID NOT NULL PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  gold INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Character senses (darkvision, blindsight, etc.)
CREATE TABLE character_senses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  sense_type VARCHAR(50) NOT NULL,
  range INTEGER NOT NULL,
  notes TEXT
);

-- Character class-specific data (wizard spellbook, ki points, etc.)
-- data format examples:
-- Wizard: {"spellbook": ["spell_id_1", "spell_id_2", ...]}
-- Warlock: {"invocations": ["Agonizing Blast", ...], "pactBoon": "Pact of the Tome"}
-- Monk: {"kiPoints": 3}, Sorcerer: {"sorceryPoints": 3}, etc.
CREATE TABLE character_class_specific (
  character_id UUID NOT NULL PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- CAMPAIGN AND STORY TABLES
-- ============================================================

-- Books (for campaign/story management)
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  cover_image_url TEXT
);

-- Chapters (within books)
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_characters_user_id ON characters(user_id);
CREATE INDEX idx_character_skills_character_id ON character_skills(character_id);
CREATE INDEX idx_character_spells_character_id ON character_spells(character_id);
CREATE INDEX idx_character_spells_spell_id ON character_spells(spell_id);
CREATE INDEX idx_character_features_character_id ON character_features(character_id);
CREATE INDEX idx_character_feats_character_id ON character_feats(character_id);
CREATE INDEX idx_character_feats_feat_id ON character_feats(feat_id);
CREATE INDEX idx_character_inventory_character_id ON character_inventory(character_id);
CREATE INDEX idx_character_inventory_magic_item_id ON character_inventory(magic_item_id);
CREATE INDEX idx_character_senses_character_id ON character_senses(character_id);
