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
-- Combat mechanics columns:
--   dice: Text array of damage dice notation
--         For cantrips (level 0): [0] = char levels 1-4, [1] = 5-10, [2] = 11-16, [3] = 17-20
--         For leveled spells: [0] = base level, [1] = +1 level, [2] = +2 levels, etc.
--         Example: Fireball (3rd level) -> [0] = "8d6" (3rd), [1] = "9d6" (4th), [2] = "10d6" (5th)
--   is_attack: TRUE if spell requires a spell attack roll
--   is_save: TRUE if spell requires a saving throw
--   add_modifier: TRUE if spellcasting modifier should be added to damage
--   effect_type: Type of effect (e.g., "Healing", "Temp HP", "Lightning", "Fire", etc.)
--   save_type: Ability score abbreviation for save (e.g., "STR", "DEX", "WIS", etc.)
--   spell_lists: Array of spell list names (e.g., ["Cleric", "Druid", "Ranger"]) for preparation casters
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
  dice TEXT[],
  is_attack BOOLEAN DEFAULT false,
  is_save BOOLEAN DEFAULT false,
  add_modifier BOOLEAN DEFAULT false,
  effect_type TEXT,
  save_type TEXT,
  spell_lists TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Magic items reference table
CREATE TABLE magic_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50),
  rarity VARCHAR(50),
  requires_attunement VARCHAR(255) DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL,
  benefits JSONB,
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

-- Equipment reference table (weapons, armor, adventuring gear, tools, etc.)
-- Imported from D&D 5e API: 179 items
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_index VARCHAR(255) NOT NULL UNIQUE,  -- "longsword", "chain-mail", etc.
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),                        -- "Weapon", "Armor", "Adventuring Gear"
  weight NUMERIC(10, 2),                    -- in pounds
  cost_quantity INTEGER,
  cost_unit VARCHAR(20),                    -- "gp", "sp", "cp"
  is_weapon BOOLEAN DEFAULT false,
  is_consumable BOOLEAN DEFAULT false,
  raw_data JSONB NOT NULL,                  -- Full API response for flexibility
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
  expertise BOOLEAN DEFAULT false,
  source TEXT
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
  description TEXT,
  max_uses VARCHAR(100),
  reset_on VARCHAR(50),
  benefits JSONB,
  source JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Character feats (junction table)
CREATE TABLE character_feats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  feat_id UUID NOT NULL REFERENCES feats(id) ON DELETE CASCADE,
  source JSONB,
  choices JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Character inventory
-- NOTE: magic_item_id, equipment_id, and trinket_name are mutually exclusive (constraint enforced)
CREATE TABLE character_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  magic_item_id UUID REFERENCES magic_items(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  trinket_name TEXT,
  quantity INTEGER DEFAULT 1,
  equipped BOOLEAN DEFAULT false,
  attuned BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT inventory_item_source_check CHECK (
    (
      CASE WHEN magic_item_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN equipment_id IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN trinket_name IS NOT NULL AND length(trim(trinket_name)) > 0 THEN 1 ELSE 0 END
    ) = 1
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

-- Monster stat blocks (for summon rendering and admin imports)
-- AC/HP value columns are TEXT to support either plain numbers or formulas like ${12+spellmod}
CREATE TABLE monster_statblocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  size TEXT,
  creature_type TEXT,
  alignment TEXT,

  armor_class_value TEXT,
  armor_class_notes TEXT,
  hit_points_value TEXT,
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

-- ============================================================
-- CAMPAIGN AND STORY TABLES
-- ============================================================

-- Books (for campaign/story management)
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  cover_image_url TEXT,
  tags TEXT[] DEFAULT '{}'::text[]
);

-- Bookshelf config (front-end display preferences)
CREATE TABLE bookshelf_config (
  key TEXT PRIMARY KEY,
  display_tags TEXT[] DEFAULT '{}'::text[],
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Chapters (within books)
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User notes (private/public)
-- is_public = FALSE: only creator can view
-- is_public = TRUE: any authenticated user can view
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT notes_content_not_empty CHECK (length(trim(content)) > 0)
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
CREATE INDEX idx_character_inventory_equipment_id ON character_inventory(equipment_id);
CREATE INDEX idx_character_inventory_trinket_name ON character_inventory(trinket_name);
CREATE INDEX idx_character_senses_character_id ON character_senses(character_id);
CREATE INDEX idx_monster_statblocks_name ON monster_statblocks(name);
CREATE INDEX idx_monster_statblocks_challenge ON monster_statblocks(challenge_rating);
CREATE INDEX idx_spells_spell_lists ON spells USING GIN (spell_lists);
CREATE INDEX idx_bookshelf_config_display_tags ON bookshelf_config USING GIN (display_tags);
CREATE INDEX idx_books_tags ON books USING GIN (tags);
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_public ON notes(is_public);
CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC);
