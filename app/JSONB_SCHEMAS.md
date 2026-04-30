# JSONB Field Schemas

Complete documentation for all JSONB fields in the database.

## Character Profile Columns (Non-JSON)

The character importer and Bio tab now rely on these additional `characters` table columns:

- `alt_image_url` (text): Alternate portrait/backdrop image URL for profile tab artwork.
- `languages` (text[]): Known spoken/signed languages.
- `tools` (text[]): Tool proficiencies.
- `instruments` (text[]): Musical instrument proficiencies.
- `occupation` (text): Character occupation or role.
- `age` (text): Character age descriptor.
- `height` (text): Character height descriptor.
- `likes` (text): Freeform preferences.
- `dislikes` (text): Freeform dislikes.
- `fact` (text): A notable personal fact.
- `bravery`, `charm`, `kindness`, `knowledge`, `technique` (integer): Bastion/social stat values.

Import notes:

- `languages/tools/instruments` are stored as Postgres arrays and should be sent as JavaScript arrays.
- Import UI accepts comma-separated input and converts to arrays before insert.
- `character_inventory` now uses `equipment_id` for non-magic items (legacy `mundane_item_name` is no longer used).
- Currency is no longer inserted via `character_currency` in the character importer flow.

## Characters Table

### `classes` (JSONB, NOT NULL)

Array of class objects. Order matters for primary class.

```typescript
[
  {
    class: string;      // "Fighter", "Wizard", etc.
    level: number;      // 1-20
    subclass?: string;  // "Battle Master", "Evocation", etc. (optional if low level)
  },
  // ... more classes for multiclass
]
```

**Examples:**

Single class:
```json
[
  {"class": "Rogue", "level": 3, "subclass": "Swashbuckler"}
]
```

Multiclass:
```json
[
  {"class": "Fighter", "level": 5, "subclass": "Battle Master"},
  {"class": "Wizard", "level": 3, "subclass": "Evocation"}
]
```

Low-level character without subclass yet:
```json
[
  {"class": "Cleric", "level": 2}
]
```

---

### `ability_score_improvements` (JSONB, nullable)

Array of ability score improvements from various sources (background ASI, Level 4/8/12/16/19 ASI, feats that grant bonuses, etc.). Allows auditing where ability scores came from.

```typescript
[
  {
    ability: string;    // "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"
    amount: number;     // 1, 2, or 3
    source: string;     // "Hermit", "Ability Score Improvement", "Half-Orc", "Mariner's Armor", etc.
    sourceType: string; // "background", "level", "race", "feat", "item", "other"
    level?: number;     // If sourceType is "level", which ASI (4, 8, 12, 16, 19)
  },
  // ... more improvements
]
```

**Examples:**

Hazel (Harengon Bard with Hermit background and level 3):
```json
[
  {
    "ability": "charisma",
    "amount": 2,
    "source": "Hermit",
    "sourceType": "background"
  },
  {
    "ability": "wisdom",
    "amount": 1,
    "source": "Hermit",
    "sourceType": "background"
  }
]
```

Level 5 character with level 4 ASI spent on Dex and Con:
```json
[
  {
    "ability": "dexterity",
    "amount": 2,
    "source": "Ability Score Improvement",
    "sourceType": "level",
    "level": 4
  },
  {
    "ability": "constitution",
    "amount": 1,
    "source": "Ability Score Improvement",
    "sourceType": "level",
    "level": 4
  },
  {
    "ability": "wisdom",
    "amount": 2,
    "source": "Observant",
    "sourceType": "feat"
  }
]
```

---

### `properties` (JSONB, nullable)

Flexible object for item-specific properties.

```typescript
{
  damage?: string;           // "1d8", "2d6+2", etc.
  bonus?: number | string;   // +1, +2, +3
  damageType?: string;       // "fire", "radiant", etc.
  effects?: string[];        // Array of effect descriptions
  charges?: {
    max: number;
    recharge: string;        // "dawn", "dusk", "1d6 at dawn"
  };
  // Any other item-specific properties
  [key: string]: any;
}
```

**Examples:**

Magic weapon:
```json
{
  "bonus": "+1",
  "damage": "1d8",
  "damageType": "slashing"
}
```

Wand with charges:
```json
{
  "charges": {
    "max": 7,
    "recharge": "1d6+1 at dawn"
  },
  "effects": ["Cast fireball (5th level, 1 charge)", "Cast lightning bolt (3rd level, 1 charge)"]
}
```

Hazel's Glimmercloak:
```json
{
  "modifiers": {
    "skills": {
      "stealth": "advantage"
    }
  },
  "uses": {
    "type": "charges",
    "max": "proficiency",
    "recharge": {
      "when": "dawn"
    }
  },
  "reactions": [
    {
      "name": "Glimmercloak Shift",
      "trigger": "You are hit by an attack",
      "cost": {
        "charges": 1
      },
      "effect": "You appear in an unoccupied space you can see within 30 feet of your visual imprint. The attack misses and the imprint disappears.",
      "limits": [
        "Cannot be used if the attacker relies on senses other than sight (such as blindsight).",
        "Cannot be used if the attacker can perceive illusions as false (such as truesight)."
      ]
    }
  ]
}
```

---

## Feats Table

### `benefits` (JSONB, nullable)

Structured benefits from the feat.

```typescript
{
  abilityScoreIncrease?: {
    choice?: string[];     // ["strength", "dexterity", "constitution"]
    fixed?: string;        // "strength"
    amount: number;        // 1 or 2
  };
  proficiencies?: {
    skills?: string[];     // ["stealth", "perception"]
    tools?: string[];      // ["thieves' tools"]
    weapons?: string[];    // ["longsword", "shortbow"]
    armor?: string[];      // ["medium armor", "shields"]
    languages?: string[];  // ["Elvish", "Gnomish"]
    other?: string[];      // Fallback for odd phrasing
  };
  expertise?: {
    skills?: string[];     // ["stealth", "perception"]
    tools?: string[];      // ["thieves' tools"]
    other?: string[];
  };
  spells?: {
    grants?: Array<{
      name: string;        // "mage hand"
      level?: number;      // Optional spell level
      ability?: string;    // Optional casting stat
      usage?: string;      // "once per long rest", etc.
      uses?: number;       // Number of uses (e.g., 1 for "once per long rest")
      choice?: {
        count: number;      // Number of spells to choose
        level: number;      // Spell level
        schools?: string[]; // ["divination", "enchantment"]
        uses?: number;      // Number of uses for chosen spells
      };
    }>;
  };
  spellcasting?: {
    ability?: string;      // "intelligence", "wisdom", etc.
    saveDC?: string;       // Formula or fixed DC
    attackBonus?: string;  // Formula or fixed bonus
    usage?: string;        // "once per long rest"
  };
  fightingStyles?: {
    choice?: boolean;      // True when you can choose a fighting style
    options?: string[];    // Optional explicit list of styles
  };
  bonuses?: {
    ac?: number;
    speed?: number;
    initiative?: number;
    hp?: number | { perLevel: number };
    attack?: number;
    damage?: number;
  };
  advantages?: {
    saves?: string[];      // "saving throws against being frightened"
    checks?: string[];     // "Wisdom (Perception) checks"
    conditions?: string[]; // "against being charmed"
    other?: string[];
  };
  resistances?: {
    damageTypes?: string[]; // ["fire", "cold"]
    conditions?: string[];
    other?: string[];
  };
  senses?: {
    darkvision?: number;
    blindsight?: number;
    tremorsense?: number;
    truesight?: number;
    other?: string[];
  };
  movement?: {
    speed?: number;
    climb?: number | string;
    swim?: number | string;
    fly?: number | string;
    other?: string[];
  };
  weaponMastery?: {
    choice?: number;       // Number of masteries to choose
    options?: string[];    // Explicit list of masteries
  };
  resources?: Array<{
    name: string;          // "feat" or specific feature name
    uses?: number | string;
    recharge?: string;     // "short rest", "long rest"
    notes?: string;
  }>;
  effects?: string[];      // Array of effect descriptions
  // Other feat-specific benefits
  [key: string]: any;
}
```

**Examples:**

Ability score increase feat:
```json
{
  "abilityScoreIncrease": {
    "choice": ["strength", "constitution"],
    "amount": 1
  },
  "effects": ["You have advantage on Strength checks to break objects"]
}
```

Pure combat feat:
```json
{
  "effects": [
    "When you score a critical hit with a melee weapon, you can roll one of the weapon's damage dice one additional time",
    "+1 to melee weapon attack rolls"
  ]
}
```

Spell-granting feat (Fey Touched):
```json
{
  "spells": {
    "grants": [
      {
        "name": "Misty Step",
        "uses": 1
      },
      {
        "choice": {
          "uses": 1,
          "count": 1,
          "level": 1,
          "schools": [
            "divination",
            "enchantment"
          ]
        }
      }
    ]
  },
  "effects": [
    "Your exposure to the Feywild's magic grants you the following benefits.",
    "Ability Score Increase. Increase your Intelligence, Wisdom, or Charisma score by 1, to a maximum of 20.",
    "Fey Magic. Choose one level 1 spell from the Divination or Enchantment school of magic. You always have that spell and the Misty Step spell prepared. You can cast each of these spells without expending a spell slot. Once you cast either spell in this way, you can't cast that spell in this way again until you finish a Long Rest. You can also cast these spells using spell slots you have of the appropriate level. The spells' spellcasting ability is the ability increased by this feat."
  ],
  "abilityScoreIncrease": {
    "amount": 1,
    "choice": [
      "intelligence",
      "wisdom",
      "charisma"
    ]
  }
}
```

Expertise with level-based scaling (Bard Expertise):
```json
{
  "expertise": {
    "skills": ["performance", "persuasion"]
  }
}
```

Note: For features granting expertise, use the `skill_expertise` benefit type in `character_features.benefits` (see Character Features Table section).

---

## Character Features Table


### `benefits` (JSONB, nullable)

Structured benefits for class/species/background features.

This section is aligned to the current runtime behavior in `app/src/lib/bonusEngine.js`.
Some types produce numeric bonuses in the bonus engine, while others are semantic/UI-only and are intentionally no-op in bonus aggregation.

```typescript
Array<
  // Skill/check/save numeric bonuses
  | { type: 'skill_modifier_bonus'; skills: string[]; bonus_source: string; bonus_type?: string }
  | { type: 'skill_bonus'; skills: string[]; amount: number; bonus_type?: string }
  | { type: 'ability_modifier_bonus'; abilities: string[]; bonus_source: string }
  | { type: 'save_modifier_bonus'; saves: string[]; bonus_source: string }
  | { type: 'save_bonus'; abilities: Array<'all' | string>; amount: number; bonus_type?: string }

  // AC / HP / combat math
  | { type: 'ac_bonus'; value?: number; amount?: number; bonus_type?: string; shield_ignore?: boolean }
  | { type: 'ac_override'; base: number; mods?: string[]; shields_allowed?: boolean }
  | { type: 'hp_bonus'; amount: number | 'formula'; formula?: string; bonus_type?: string }
  | { type: 'melee_weapon_attack_bonus'; bonus_source?: string; amount?: number; value?: number; weapon_property?: string; versatile?: number; bonus_type?: string }
  | { type: 'melee_weapon_damage_bonus'; amount?: number; value?: number; weapon_property?: string; versatile?: number; bonus_type?: string }

  // Initiative / movement / senses
  | { type: 'initiative_bonus'; bonus: 'proficiency' | 'proficiency_bonus' | string | number }
  | { type: 'init_bonus'; amount: 'proficiency' | 'proficiency_bonus' | string | number } // legacy alias
  | { type: 'speed'; speed_value: string; movement_type: string }
  | { type: 'speed_bonus'; speed_type?: string; amount?: number; value?: number; bonus_type?: string }
  | { type: 'sense'; sense: string; range: string | number; bonus_type?: string }

  // Resistances / immunities / advantage markers
  | { type: 'damage_resistance'; damage_types?: string[]; damage_type?: string; types?: string[] }
  | { type: 'damage_immunity'; damage_types?: string[]; damage_type?: string; types?: string[] }
  | { type: 'condition_immunity'; conditions?: string[]; condition?: string }
  | { type: 'condition_resistance'; conditions?: string[]; condition?: string; save_modifier?: 'advantage' | string }
  | { type: 'skill_advantage'; skills: string[] }
  | { type: 'saving_throw_advantage'; saves: string[] }

  // Proficiency/selection/semantic feature markers (UI-managed)
  | { type: 'skill_proficiency'; skill?: string; skills?: string[]; alternate_skill?: boolean }
  | { type: 'skill_expertise'; skills: string[]; level_scaling?: Record<string, { skills: string[] }> }
  | { type: 'skill_dual_ability'; skills: string[]; ability: string }
  | { type: 'skill_half_proficiency' }
  | { type: 'armor_proficiency'; level: 'light' | 'medium' | 'heavy' | string }
  | { type: 'shield_proficiency'; value?: boolean }
  | { type: 'bonus_action'; name: string; range?: string; target?: string; pb_multiplier?: number }
  | {
      type: 'feature_die';
      name: string;
      die: string;
      level_scaling?: Record<string, string>; // die size scaling by level
      scaling?: Record<string, string>; // legacy alias for level_scaling
      max_uses?: string | number; // preferred explicit uses source
      max?: string | number; // alias
      uses?: string | number; // alias
      count?: string | number; // alias
      value?: string | number; // alias; supports "formula"
      formula?: string; // e.g., "2*proficiency", "level/2ru"
      use_scaling?: Record<string, number>; // uses scaling by level
    }
  | {
      type: 'gauge';
      name?: string;
      threshold?: number | 'half_hp_max' | 'formula';
      formula?: string;
      max_charges?: number;
      charge_max?: number; // alias
      timeout_seconds?: number;
      reset_after_seconds?: number; // alias
      decay_seconds?: number; // alias
      auto_fill_on_damage?: boolean;
    }
  | { type: 'reaction'; name?: string; trigger?: string; effect?: string; [key: string]: any }
  | {
      type: 'select';
      select: {
        choices?: any[];
        [choiceId: string]: any;
      };
    }
  | {
      type: 'stance';
      stances: Array<{
        name: string;
        benefits?: Array<Record<string, any>>;
      }>;
    }
  | { type: 'divinity'; [key: string]: any }
>;
```

Notes:

- `saving_throw_bonus`, `ability_check_bonus`, and `passive_bonus` are older doc names and are not currently handled by the bonus engine handlers.
- `init_bonus` is a legacy alias of `initiative_bonus` and is still accepted.
- `select`, `stance`, proficiency, and action-style entries are included so they are recognized without warnings; their behavior is resolved in the Character Sheet/Actions UI logic.

**Example (Bardic Inspiration):**
```json
[
  {
    "name": "Bardic Inspiration",
    "type": "bonus_action",
    "range": "60 ft",
    "target": "creature that can see or hear you"
  },
  {
    "die": "d6",
    "name": "Bardic Inspiration",
    "type": "feature_die",
    "level_scaling": {
      "5": "d8",
      "10": "d10",
      "15": "d12"
    }
  }
]
```

**Example (Subclass die with count + size scaling):**
```json
[
  {
    "type": "feature_die",
    "name": "Psionic Energy",
    "die": "d6",
    "level_scaling": {
      "5": "d8",
      "11": "d10",
      "17": "d12"
    },
    "formula": "2*proficiency",
    "value": "formula"
  }
]
```

`feature_die` count source resolution order in runtime:

- `max_uses`, `max`, `uses`, `count`, `value`
- if `value` is `"formula"`, evaluate `formula`
- if none are present but `use_scaling` exists, resolve by highest level threshold

**Example (Limit Gauge):**
```json
[
  {
    "type": "gauge",
    "name": "Limit Gauge",
    "threshold": "half_hp_max",
    "max_charges": 3,
    "timeout_seconds": 60,
    "auto_fill_on_damage": true
  }
]
```

**Example (Bonus action with proficiency bonus multiplier):**
```json
[
  {
    "name": "Rabbit Hop",
    "type": "bonus_action",
    "pb_multiplier": 5
  }
]
```
With proficiency bonus +2, this would display as "10 ft" (2 * 5) in the short text.

**Example (Bard Expertise with level-based scaling):**
```json
[
  {
    "type": "skill_expertise",
    "skills": ["performance", "persuasion"],
    "level_scaling": {
      "9": {
        "skills": ["deception", "insight"]
      }
    }
  }
]
```

**Example (Species movement speeds):**
```json
[
  {
    "type": "speed",
    "speed_value": "30ft",
    "movement_type": "Walking"
  },
  {
    "type": "speed",
    "speed_value": "30ft",
    "movement_type": "Swimming"
  }
]
```

**Example (Initiative bonuses):**
```json
[
  {
    "type": "initiative_bonus",
    "bonus": "proficiency"
  },
  {
    "type": "initiative_bonus",
    "bonus": "charisma"
  },
  {
    "type": "initiative_bonus",
    "bonus": 2
  }
]
```
Bases: proficiency_bonus, ability name (as modifier), or flat value.

**Example (AC override formula style):**
```json
[
  {
    "type": "ac_override",
    "base": 13,
    "mods": ["dexterity"],
    "shields_allowed": true
  }
]
```

**Example (HP formula bonus):**
```json
[
  {
    "type": "hp_bonus",
    "amount": "formula",
    "formula": "2*level"
  }
]
```

**Example (Condition resistance marker):**
```json
[
  {
    "type": "condition_resistance",
    "conditions": ["poisoned"],
    "save_modifier": "advantage"
  }
]
```

---

## Character Feats Table

### `choices` (JSONB, nullable)

Character-specific selections made for a feat.

```typescript
{
  spellsChosen?: string[];   // ["misty step", "silvery barbs"]
  fightingStyle?: string;    // "Defense", "Dueling"
  abilityChoice?: string;    // "wisdom"
  toolChoice?: string;       // "thieves' tools"
  skillChoice?: string;      // "perception"
  selections?: Array<{
    id: string;              // Choice ID from DDB
    label?: string | null;   // "Choose a Spell"
    type: number;            // DDB choice type
    subType?: number | null; // DDB choice subtype
    optionValue?: number | null; // Selected option ID
    optionName?: string | null;  // Resolved option name
  }>;
  notes?: string;            // Free-form fallback
  [key: string]: any;
}
```

**Example (Fey Touched):**
```json
{
  "spellsChosen": ["misty step", "silvery barbs"],
  "abilityChoice": "wisdom"
}
```

---

## Character Class Specific Table

### `data` (JSONB, NOT NULL, default '{}')

Class-specific resources, features, and choices. Structure varies by class.

**Common patterns:**

### Spellcasters with limited spells known/prepared:
```typescript
{
  spellbook?: string[];        // Wizard: array of spell IDs in spellbook
  invocations?: string[];      // Warlock: array of invocation names
  metamagic?: string[];        // Sorcerer: array of metamagic names
  infusions?: string[];        // Artificer: array of infusion names
}
```

### Classes with points/resources:
```typescript
{
  sorceryPoints?: number;      // Sorcerer max
  kiPoints?: number;           // Monk max
  superiorityDice?: {          // Fighter Battle Master
    die: string;               // "d8", "d10", "d12"
    count: number;
  };
}
```

### Classes with special choices:
```typescript
{
  pactBoon?: string;           // Warlock: "Pact of the Chain", "Pact of the Tome", etc.
  fightingStyles?: string[];   // Fighter, Ranger, Paladin
  expertise?: string[];        // Rogue, Bard (if not in character_skills)
  channelDivinityOptions?: string[];  // Cleric
}
```

**Examples:**

Wizard 5:
```json
{
  "spellbook": [
    "uuid-for-magic-missile",
    "uuid-for-shield",
    "uuid-for-fireball",
    "uuid-for-counterspell",
    "uuid-for-detect-magic",
    "uuid-for-identify"
  ]
}
```

Warlock 3 (Pact of the Tome):
```json
{
  "pactBoon": "Pact of the Tome",
  "invocations": ["Agonizing Blast", "Book of Ancient Secrets"]
}
```

Monk 5:
```json
{
  "kiPoints": 5
}
```

Sorcerer 6:
```json
{
  "sorceryPoints": 6,
  "metamagic": ["Quickened Spell", "Twinned Spell"]
}
```

Fighter 5 (Battle Master):
```json
{
  "fightingStyle": "Dueling",
  "superiorityDice": {
    "die": "d8",
    "count": 4
  },
  "maneuvers": ["Riposte", "Precision Attack", "Disarming Attack"]
}
```

Multiclass Fighter 5 / Wizard 3:
```json
{
  "fighter": {
    "fightingStyle": "Defense"
  },
  "wizard": {
    "spellbook": ["uuid-1", "uuid-2", "uuid-3"]
  }
}
```

---

## Notes

- All JSONB fields use PostgreSQL's JSONB type for efficient indexing and querying
- Use `->` and `->>` operators to query nested values: 
  - `classes->0->>'class'` gets first class name as text
  - `data->'spellbook'` gets spellbook array as JSONB
- JSONB preserves structure but not insertion order (except arrays)
- Can add GIN indexes for complex queries: `CREATE INDEX idx_wizard_spells ON character_class_specific USING GIN ((data->'spellbook'));`
