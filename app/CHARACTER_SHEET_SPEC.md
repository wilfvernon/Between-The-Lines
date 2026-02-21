# Character Sheet Database Schema

## Architecture Overview

### Data Categories
1. **Persistent (Database)**: Core character data that defines the character
2. **Calculated (Runtime)**: Derived from persistent data using game rules
3. **Session State (Frontend only)**: Temporary values that reset on reload/rest

---

## Database Schema

### Table: `characters`

```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Basic Identity
  name VARCHAR(255) NOT NULL,
  full_name TEXT, -- Long form name for display (e.g., "Hazel Whisperwind the Brave")
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 20), -- Total character level
  class VARCHAR(100) NOT NULL, -- Primary class or "Fighter 3 / Wizard 2" for multiclass
  subclass VARCHAR(100),
  species VARCHAR(100) NOT NULL,
  background VARCHAR(100),
  
  -- Character Image & Bio
  image_url TEXT, -- URL to character portrait
  bio TEXT, -- Character biography/description
  
  -- Core Stats (stored values only)
  max_hp INTEGER NOT NULL,
  speed INTEGER DEFAULT 30,
  
  -- Hit Dice (max by die type)
  hit_dice_d6 INTEGER DEFAULT 0,
  hit_dice_d8 INTEGER DEFAULT 0,
  hit_dice_d10 INTEGER DEFAULT 0,
  hit_dice_d12 INTEGER DEFAULT 0,
  
  -- Inspiration
  has_inspiration BOOLEAN DEFAULT false,
  
  -- Ability Scores (raw scores only, modifiers calculated)
  strength INTEGER NOT NULL CHECK (strength BETWEEN 1 AND 30),
  dexterity INTEGER NOT NULL CHECK (dexterity BETWEEN 1 AND 30),
  constitution INTEGER NOT NULL CHECK (constitution BETWEEN 1 AND 30),
  intelligence INTEGER NOT NULL CHECK (intelligence BETWEEN 1 AND 30),
  wisdom INTEGER NOT NULL CHECK (wisdom BETWEEN 1 AND 30),
  charisma INTEGER NOT NULL CHECK (charisma BETWEEN 1 AND 30),
  
  -- Save Proficiencies (booleans, bonuses calculated)
  save_strength BOOLEAN DEFAULT false,
  save_dexterity BOOLEAN DEFAULT false,
  save_constitution BOOLEAN DEFAULT false,
  save_intelligence BOOLEAN DEFAULT false,
  save_wisdom BOOLEAN DEFAULT false,
  save_charisma BOOLEAN DEFAULT false,
  
  -- Spellcasting
  spellcasting_ability VARCHAR(3), -- 'int', 'wis', 'cha', or NULL
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
```

---

### Table: `character_classes` (Optional - For strict multiclass handling)

**Note**: For simplicity with 6 characters, storing class as a string like "Fighter 3 / Wizard 2" works fine. If you need structured access to individual class levels later, implement this table:

```sql
CREATE TABLE character_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  
  class_name VARCHAR(100) NOT NULL, -- 'Fighter', 'Wizard', etc.
  subclass_name VARCHAR(100),
  class_level INTEGER NOT NULL CHECK (class_level BETWEEN 1 AND 20),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(character_id, class_name)
);
```

**For now**: Recommend using the simple string approach until you need proper multiclass queries.

---

### Table: `character_skills`

```sql
CREATE TABLE character_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  
  skill_name VARCHAR(50) NOT NULL, -- 'Acrobatics', 'Arcana', etc.
  expertise BOOLEAN DEFAULT false, -- true = expertise, false = proficient only
  
  UNIQUE(character_id, skill_name)
);
```

**Note**: 
- Only skills with proficiency or expertise are stored
- If a skill is not in this table, the character is not proficient
- Skill bonuses are calculated as:
  - Base: ability modifier (from parent ability)
  - +proficiency bonus (always, since we only store proficient skills)
  - +proficiency bonus again if `expertise = true`

---

### Table: `spells` (Reference Data)

```sql
CREATE TABLE spells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 9),
  school VARCHAR(50), -- 'Evocation', 'Abjuration', etc.
  casting_time VARCHAR(100),
  range VARCHAR(50),
  components VARCHAR(20), -- 'V, S, M'
  duration VARCHAR(100),
  description TEXT NOT NULL,
  higher_levels TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Table: `character_spells`

```sql
CREATE TABLE character_spells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  spell_id UUID NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
  
  is_prepared BOOLEAN DEFAULT false, -- for prepared casters
  always_prepared BOOLEAN DEFAULT false, -- species/subclass spells
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(character_id, spell_id)
);
```

**Note**: If a spell exists in `character_spells`, the character knows it (it's in their spellbook for wizards, or known for other casters)

**Session State (not stored)**:
- Current spell slots used per level
- Reset on long rest

**Calculated**:
- Max spell slots per level (from class + level)
- Spell attack bonus (proficiency + casting ability mod)
- Spell save DC (8 + proficiency + casting ability mod)

---

### Table: `character_features`

```sql
CREATE TABLE character_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'class', 'species', 'background', 'feat'
  description TEXT,
  
  -- Usage tracking (for limited-use features)
  max_uses INTEGER, -- NULL for unlimited features
  reset_on VARCHAR(20), -- 'short', 'long', 'dawn', NULL
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Session State (not stored)**:
- Current uses remaining
- Reset based on `reset_on` value

---

### Table: `feats` (Reference Data)

```sql
CREATE TABLE feats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  prerequisites TEXT, -- e.g., "Strength 13 or higher"
  benefits JSONB, -- structured benefits data
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Table: `character_feats`

```sql
CREATE TABLE character_feats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  feat_id UUID NOT NULL REFERENCES feats(id) ON DELETE CASCADE,
  
  source VARCHAR(50), -- 'level', 'background', 'species'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(character_id, feat_id)
);
```

---

### Table: `magic_items` (Reference Data)

```sql
CREATE TABLE magic_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(50), -- 'weapon', 'armor', 'wondrous', 'potion', etc.
  rarity VARCHAR(50), -- 'common', 'uncommon', 'rare', 'very rare', 'legendary'
  requires_attunement BOOLEAN DEFAULT false,
  description TEXT NOT NULL,
  properties JSONB, -- weapon stats, armor AC, special abilities, etc.
  image_url TEXT, -- Optional image for the magic item
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Table: `character_inventory`

```sql
CREATE TABLE character_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  
  -- For magic items (reference)
  magic_item_id UUID REFERENCES magic_items(id) ON DELETE CASCADE,
  
  -- For mundane items (fetch from API, store only the reference)
  mundane_item_name VARCHAR(255), -- e.g., "Rope (50 ft)", "Backpack"
  
  -- Common fields
  quantity INTEGER DEFAULT 1,
  equipped BOOLEAN DEFAULT false,
  attuned BOOLEAN DEFAULT false, -- only for magic items
  notes TEXT, -- custom notes about this specific item
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Either magic_item_id OR mundane_item_name must be set
  CHECK (
    (magic_item_id IS NOT NULL AND mundane_item_name IS NULL) OR
    (magic_item_id IS NULL AND mundane_item_name IS NOT NULL)
  )
);
```

**Note**: 
- Mundane items (rope, rations, etc.) are fetched from external API and only stored by name
- Magic items are fully defined in `magic_items` table with all stats and properties
- Item details (weight, damage, AC, etc.) come from the API for mundane items or `magic_items` table for magical ones

---

### Table: `character_currency`

```sql
CREATE TABLE character_currency (
  character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  
  gold INTEGER DEFAULT 0,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

---

### Table: `character_senses`

```sql
CREATE TABLE character_senses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  
  sense_type VARCHAR(50) NOT NULL, -- 'darkvision', 'blindsight', etc.
  range INTEGER NOT NULL, -- in feet
  notes TEXT,
  
  UNIQUE(character_id, sense_type)
);
```

**Calculated**:
- Passive Perception: 10 + Wisdom(Perception) bonus

---

### Table: `character_class_specific`

```sql
CREATE TABLE character_class_specific (
  character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  
  -- JSONB for flexible class-specific data
  data JSONB NOT NULL DEFAULT '{}',
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Examples of `data` structure:**

```javascript
// Wizard
{
  "spellbook": ["Alarm", "Shield", "Magic Missile", ...], // all known spells
  "arcane_recovery_used": false // session state could go here or frontend
}

// Warlock
{
  "invocations": ["Agonizing Blast", "Devil's Sight"],
  "pact_type": "Pact of the Tome"
}

// Monk
{
  "ki_points_max": 5
}

// Sorcerer
{
  "sorcery_points_max": 5,
  "metamagic": ["Quickened Spell", "Twinned Spell"]
}
```

---

## Calculated Values (Not Stored)

These are derived at runtime from the persistent data:

### From Ability Scores
```javascript
abilityModifier = Math.floor((score - 10) / 2)
proficiencyBonus = Math.ceil(level / 4) + 1
```

### Combat Stats
```javascript
// Initiative
initiative = dexterityModifier

// Saving Throws
savingThrowBonus = abilityModifier + (isProficient ? proficiencyBonus : 0)

// Skill Bonuses
skillBonus = abilityModifier + (proficient ? proficiencyBonus : 0) + (expertise ? proficiencyBonus : 0)

// AC (base, modified by equipped armor + items)
ac = calculateFromArmor(inventory, dexterityModifier)

// Passive Perception
passivePerception = 10 + wisdomPerceptionBonus
```

### Spellcasting
```javascript
// From character.spellcasting_ability and level
castingModifier = abilityScores[spellcastingAbility].modifier
spellAttackBonus = proficiencyBonus + castingModifier
spellSaveDC = 8 + proficiencyBonus + castingModifier

// Spell slots by level (from class tables)
maxSpellSlots = getSpellSlotsForClassLevel(class, level)
```

---

## Session State (Frontend Only)

These values reset and are NOT persisted to the database:

```javascript
sessionState = {
  // Combat
  currentHP: number,        // resets to max on long rest
  tempHP: number,           // cleared on long rest
  
  // Spellcasting
  spellSlotsUsed: {
    1: number,
    2: number,
    // ... per spell level
  },
  
  // Features
  featureUsesRemaining: {
    [featureId]: number
  },
  
  // Conditions/Buffs (future)
  activeConditions: [],
  temporaryMaxHPBonus: number
}
```

---

## Data Requirements Summary

| Field | Stored | Calculated | Session |
|-------|--------|------------|---------|
| Name, Level, Class, Species | ✓ | | |
| Ability Scores (raw) | ✓ | | |
| Ability Modifiers | | ✓ | |
| Max HP (base) | ✓ | | |
| Current HP | | | ✓ |
| Temp HP | | | ✓ |
| AC | | ✓ | |
| Initiative | | ✓ | |
| Save Proficiencies | ✓ | | |
| Save Bonuses | | ✓ | |
| Skill Proficiencies | ✓ | | |
| Skill Bonuses | | ✓ | |
| Spells Known | ✓ | | |
| Spell Slots Max | | ✓ | |
| Spell Slots Used | | | ✓ |
| Spell Attack/DC | | ✓ | |
| Features | ✓ | | |
| Feature Uses | | | ✓ |
| Inventory Items | ✓ | | |
| Passive Perception | | ✓ | |

---

## Nested JSON Representation

When fetched from the database, the character data is assembled into this structure:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Elara Moonwhisper",
  "level": 5,
  "class": "Wizard",
  "subclass": "School of Evocation",
  "species": "High Elf",
  "background": "Sage",
  
  "hp": {
    "max": 32
  },
  
  "speed": 30,
  
  "abilityScores": {
    "strength": {
      "score": 8,
      "proficient": false
    },
    "dexterity": {
      "score": 14,
      "proficient": true
    },
    "constitution": {
      "score": 13,
      "proficient": false
    },
    "intelligence": {
      "score": 18,
      "proficient": true
    },
    "wisdom": {
      "score": 12,
      "proficient": true
    },
    "charisma": {
      "score": 10,
      "proficient": false
    }
  },
  
  "spellcasting": {
    "ability": "int"
  },
  
  "skills": [
    {
      "id": "skill-1",
      "name": "Arcana",
      "expertise": true
    },
    {
      "id": "skill-2",
      "name": "Investigation",
      "expertise": false
    },
    {
      "id": "skill-3",
      "name": "Perception",
      "expertise": false
    }
  ],
  
  "spells": [
    {
      "id": "char-spell-1",
      "spellId": "spell-uuid-1",
      "name": "Fire Bolt",
      "level": 0,
      "school": "Evocation",
      "description": "You hurl a mote of fire at a creature or object within range...",
      "prepared": true,
      "alwaysPrepared": false
    },
    {
      "id": "char-spell-2",
      "spellId": "spell-uuid-2",
      "name": "Mage Hand",
      "level": 0,
      "school": "Conjuration",
      "description": "A spectral, floating hand appears at a point you choose...",
      "prepared": true,
      "alwaysPrepared": false
    },
    {
      "id": "char-spell-3",
      "spellId": "spell-uuid-3",
      "name": "Shield",
      "level": 1,
      "school": "Abjuration",
      "description": "An invisible barrier of magical force appears and protects you...",
      "prepared": true,
      "alwaysPrepared": false
    },
    {
      "id": "char-spell-4",
      "spellId": "spell-uuid-4",
      "name": "Magic Missile",
      "level": 1,
      "school": "Evocation",
      "description": "You create three glowing darts of magical force...",
      "prepared": true,
      "alwaysPrepared": false
    },
    {
      "id": "char-spell-5",
      "spellId": "spell-uuid-5",
      "name": "Detect Magic",
      "level": 1,
      "school": "Divination",
      "description": "For the duration, you sense the presence of magic within 30 feet...",
      "prepared": false,
      "alwaysPrepared": false
    },
    {
      "id": "char-spell-6",
      "spellId": "spell-uuid-6",
      "name": "Misty Step",
      "level": 2,
      "school": "Conjuration",
      "description": "Briefly surrounded by silvery mist, you teleport up to 30 feet...",
      "prepared": true,
      "alwaysPrepared": true
    }
  ],
  
  "features": [
    {
      "id": "feature-1",
      "name": "Arcane Recovery",
      "source": "class",
      "description": "Once per day when you finish a short rest, you can recover expended spell slots with a combined level equal to or less than half your wizard level (rounded up).",
      "maxUses": 1,
      "resetOn": "long"
    },
    {
      "id": "feature-2",
      "name": "Sculpt Spells",
      "source": "class",
      "description": "When you cast an evocation spell that affects other creatures, you can choose a number of them equal to 1 + the spell's level. The chosen creatures automatically succeed on their saving throws.",
      "maxUses": null,
      "resetOn": null
    },
    {
      "id": "feature-3",
      "name": "Fey Ancestry",
      "source": "species",
      "description": "You have advantage on saving throws against being charmed, and magic can't put you to sleep.",
      "maxUses": null,
      "resetOn": null
    },
    {
      "id": "feature-4",
      "name": "Trance",
      "source": "species",
      "description": "Elves don't need to sleep. Instead, they meditate deeply for 4 hours a day.",
      "maxUses": null,
      "resetOn": null
    }
  ],
  
  "feats": [
    {
      "id": "char-feat-1",
      "featId": "feat-uuid-1",
      "name": "War Caster",
      "description": "You have advantage on Constitution saving throws to maintain concentration. You can perform somatic components even when holding weapons or a shield. You can use a reaction to cast a spell at a creature instead of making an opportunity attack.",
      "source": "level"
    }
  ],
  
  "inventory": [
    {
      "id": "inv-1",
      "mundaneItemName": "Quarterstaff",
      "magicItemId": null,
      "quantity": 1,
      "equipped": true,
      "attuned": false,
      "notes": null,
      "itemDetails": {
        "name": "Quarterstaff",
        "type": "weapon",
        "damage": "1d6 bludgeoning (1d8 versatile)",
        "weight": 4.0,
        "properties": ["versatile"]
      }
    },
    {
      "id": "inv-2",
      "mundaneItemName": "Studded Leather Armor",
      "magicItemId": null,
      "quantity": 1,
      "equipped": true,
      "attuned": false,
      "notes": null,
      "itemDetails": {
        "name": "Studded Leather Armor",
        "type": "armor",
        "ac": 12,
        "weight": 13.0,
        "properties": ["light"]
      }
    },
    {
      "id": "inv-3",
      "mundaneItemName": null,
      "magicItemId": "magic-item-uuid-1",
      "quantity": 1,
      "equipped": false,
      "attuned": true,
      "notes": "4 charges remaining",
      "itemDetails": {
        "name": "Wand of Magic Missiles",
        "type": "wondrous",
        "rarity": "uncommon",
        "requiresAttunement": true,
        "description": "This wand has 7 charges. You can use an action to expend 1 or more charges to cast magic missile.",
        "properties": {
          "maxCharges": 7,
          "recharge": "1d6+1 at dawn"
        }
      }
    },
    {
      "id": "inv-4",
      "mundaneItemName": "Potion of Healing",
      "magicItemId": null,
      "quantity": 3,
      "equipped": false,
      "attuned": false,
      "notes": null,
      "itemDetails": {
        "name": "Potion of Healing",
        "type": "potion",
        "effect": "2d4+2 HP",
        "weight": 0.5
      }
    },
    {
      "id": "inv-5",
      "mundaneItemName": "Rope, Hempen (50 feet)",
      "magicItemId": null,
      "quantity": 1,
      "equipped": false,
      "attuned": false,
      "notes": null,
      "itemDetails": {
        "name": "Rope, Hempen (50 feet)",
        "type": "adventuring gear",
        "weight": 10.0,
        "cost": 1
      }
    }
  ],
  
  "currency": {
    "gold": 247
  },
  
  "senses": [
    {
      "id": "sense-1",
      "type": "darkvision",
      "range": 60,
      "notes": "From High Elf heritage"
    }
  ],
  
  "classSpecific": {
    "spellbook": [
      "Fire Bolt",
      "Mage Hand",
      "Prestidigitation",
      "Ray of Frost",
      "Alarm",
      "Detect Magic",
      "Shield",
      "Magic Missile",
      "Mage Armor",
      "Identify",
      "Misty Step",
      "Scorching Ray",
      "Flaming Sphere"
    ],
    "arcaneRecoveryUsed": false
  },
  
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-02-20T14:22:00Z"
}
```

### Notes on JSON Structure

1. **Nested Objects**: Ability scores are nested with their save proficiencies for easy access
2. **Arrays**: Skills, spells, features, feats, inventory, and senses are all arrays for easy iteration
3. **Null Values**: Fields like `maxUses` and `resetOn` can be null for unlimited/passive features
4. **Type Safety**: Consistent property names across similar items (e.g., all items have `id`, `name`, `description`)
5. **Frontend Enhancement**: This structure will be augmented with calculated values and session state when loaded into the frontend application

---

## Implementation Notes

### Row Level Security (Supabase)
```sql
-- Users can only access their own characters
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own characters"
  ON characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own characters"
  ON characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own characters"
  ON characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  USING (auth.uid() = user_id);

-- Repeat for all related tables, using character_id → characters.user_id
```

### Indexes
```sql
CREATE INDEX idx_characters_user_id ON characters(user_id);
CREATE INDEX idx_character_spells_character_id ON character_spells(character_id);
CREATE INDEX idx_character_skills_character_id ON character_skills(character_id);
CREATE INDEX idx_character_inventory_character_id ON character_inventory(character_id);
```

### Future Considerations
- **Spell reference data**: Separate `spells` table with full spell details (descriptions, components, etc.)
- **Item reference data**: Separate `items` table for templated items
- **Character versions**: Track changes over time for multi-session games
- **Party/Campaign**: Link characters to campaigns with shared state
