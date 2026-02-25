# JSONB Field Schemas

Complete documentation for all JSONB fields in the database.

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
      choice?: {
        count: number;      // Number of spells to choose
        level: number;      // Spell level
        schools?: string[]; // ["divination", "enchantment"]
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

---

## Character Features Table

### `benefits` (JSONB, nullable)

Structured benefits for class/species/background features. This mirrors the benefits format used in the character sheet spec.

```typescript
Array<
  | { type: 'skill_proficiency'; skill: string; alternate_skill?: boolean }
  | { type: 'skill_dual_ability'; skills: string[]; ability: string }
  | { type: 'skill_half_proficiency' }
  | { type: 'skill_modifier_bonus'; skills: string[]; bonus_source: string }
  | { type: 'saving_throw_bonus'; ability: string; bonus_source: string }
  | { type: 'ability_check_bonus'; ability: string; bonus_source: string }
  | { type: 'passive_bonus'; passive_name: string; bonus: number }
  | { type: 'bonus_action'; name: string; range?: string; target?: string }
  | { type: 'feature_die'; name: string; die: string; scaling?: Record<string, string> }
>;
```

**Example (Bardic Inspiration):**
```json
[
  {
    "type": "bonus_action",
    "name": "Bardic Inspiration",
    "range": "60 ft",
    "target": "creature that can see or hear you"
  },
  {
    "type": "feature_die",
    "name": "Bardic Inspiration",
    "die": "d6",
    "scaling": {
      "5": "d8",
      "10": "d10",
      "15": "d12"
    }
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
