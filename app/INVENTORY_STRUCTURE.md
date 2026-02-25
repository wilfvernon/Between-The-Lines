# Inventory Structure Reference

## Overview

The character inventory is stored in `character.inventory[]`, an array of item objects from D&D Beyond's character data format. Each item contains a rich `definition` object with full mechanical details.

---

## Inventory Item Structure

### Top-Level Item Properties

```javascript
{
  id: number,                           // Unique item instance ID
  entityTypeId: number,                 // D&D Beyond entity type classifier
  definition: { ... },                  // ⭐ MAIN MECHANICAL DATA
  definitionId: number,                 // Reference to definition
  definitionTypeId: number,             // Type classifier
  displayAsAttack: boolean | null,      // UI hint (some items can be attack actions)
  quantity: number,                     // Stack size (default 1)
  isAttuned: boolean,                   // Magic item attunement status
  equipped: boolean,                    // Currently equipped/carried
  equippedEntityTypeId: number | null,  // If equipped, what entity owns it (e.g., character)
  equippedEntityId: number | null,      // If equipped, entity instance ID
  chargesUsed: number,                  // For items with limited uses
  limitedUse: null,                     // D&D Beyond uses this for charges/recharge info
  containerEntityId: number | null,     // If in a container, container's ID
  containerEntityTypeId: number | null, // Container type
  containerDefinitionKey: string | null,// Container reference key
  currency: null,                       // (unused in current schema)
  originEntityTypeId: null,             // (unused)
  originEntityId: null,                 // (unused)
  originDefinitionKey: null             // (unused)
}
```

### Definition Object (The Important Part)

The `definition` contains all the mechanical details about the item:

```javascript
{
  // Identity & Classification
  id: number,                           // Definition ID (global for this item type)
  baseTypeId: number,                   // D&D Beyond type grouping
  entityTypeId: number,                 // Entity type classifier
  definitionKey: string,                // "baseTypeId:id" format
  name: string,                         // Item name: "Dagger", "Hat of Disguise", "Longsword"
  type: string,                         // Category: "Dagger", "Light Armor", "Wondrous item"
  filterType: string,                   // UI filter category: "Weapon", "Armor", etc.
  subType: string | null,               // Additional classification
  
  // Basic Properties
  weight: number,                       // Weight in lbs
  weightMultiplier: number,             // (scaling factor, usually 1)
  capacity: null | number,              // Container capacity
  capacityWeight: number,               // Container weight limit
  stackable: boolean,                   // Can be stacked in inventory
  bundleSize: number,                   // Bundle grouping size
  isContainer: boolean,                 // Can hold items
  isConsumable: boolean,                // One-time use item
  isCustomItem: boolean,                // DM custom content
  isHomebrew: boolean,                  // Third-party/homebrew
  isLegacy: boolean,                    // Old version
  
  // Cost & Rarity
  cost: number | null,                  // Price in gold
  rarity: string,                       // "Common", "Uncommon", "Rare", etc. (magic items)
  
  // UI/Flavor
  snippet: string | null,               // Short description
  description: string,                  // Full HTML description
  avatarUrl: string | null,             // Small image URL
  largeAvatarUrl: string | null,        // Large image URL
  tags: string[],                       // ["Damage", "Combat"], ["Deception", "Headwear"]
  sources: Array<{                      // D&D source books
    sourceId: number,
    pageNumber: number | null,
    sourceType: number                  // 1 = official, 2 = homebrew
  }>,
  
  // WEAPON PROPERTIES ⭐ (if type is weapon)
  // ============================================
  canEquip: boolean,                    // Can be equipped/wielded
  damage: {                             // ⭐ DAMAGE DICE INFO
    diceCount: number,                  // e.g., 1
    diceValue: number,                  // e.g., 4 (for d4), 6 (for d6), etc.
    diceMultiplier: number | null,      // Multiplier (usually null)
    fixedValue: number | null,          // Fixed damage (usually null)
    diceString: string                  // "1d4", "1d6", "2d6", etc. ⭐ USE THIS
  },
  damageType: string,                   // "Piercing", "Slashing", "Bludgeoning", etc.
  fixedDamage: string | null,           // Alternative damage format (rarely used)
  attackType: number | null,            // 1 = melee weapon, null = not a weapon
  categoryId: number | null,            // Weapon category (1 = melee, etc.)
  
  // Weapon Properties (Finesse, Light, Thrown, etc.)
  properties: Array<{                   // ⭐ PROPERTY MECHANICS
    id: number,
    name: string,                       // "Finesse", "Light", "Thrown", "Versatile", etc.
    description: string,                // Full HTML description of property
    notes: string | null
  }>,
  
  // Range & Reach
  range: number | null,                 // Melee range in feet (or throw range)
  longRange: number | null,             // Long range (for thrown/ranged weapons)
  
  // Special Weapon Info
  baseItemId: number | null,            // For magic weapons, the base item
  baseArmorName: string | null,         // For armor, the base type
  strengthRequirement: number | null,   // STR requirement for equip
  isMonkWeapon: boolean,                // Can be used with monk abilities
  weaponBehaviors: Array<any>,          // Advanced weapon mechanics
  levelInfusionGranted: number | null,  // If artificer infusion, level granted
  
  // ARMOR PROPERTIES ⭐ (if type is armor)
  // ============================================
  armorClass: number | null,            // AC value (e.g., 11 for Leather)
  armorTypeId: number | null,           // 1 = light, 2 = medium, 3 = heavy
  stealthCheck: number | null,          // 1 = disadvantage on stealth, null = normal
  gearTypeId: number | null,            // Equipment type classifier
  
  // Magic Item Properties ⭐
  // ============================================
  magic: boolean,                       // Is magic item
  canAttune: boolean,                   // Requires attunement
  attunementDescription: string | null, // Attunement requirements
  
  // Item Mechanics
  grantedModifiers: Array<any>,         // Bonuses granted by item (e.g., +1 to AC)
  
  // Availability
  canBeAddedToInventory: boolean        // Can be added by player
}
```

---

## Identifying Weapons vs. Armor vs. Other Items

### Identifying Weapons

```javascript
// ✅ Item is a weapon if ANY of these match:
const isWeapon = (item) => {
  const def = item.definition;
  return (
    def.attackType === 1                    // Explicit weapon marker
    || def.categoryId === 1                 // Melee category
    || def.damage?.diceString              // Has damage dice
    || (def.properties?.length > 0 && 
        def.properties.some(p => 
          ['Finesse', 'Light', 'Heavy', 'Versatile', 'Reach'].includes(p.name)
        ))
  );
};
```

**Key Weapon Properties:**
- **Finesse**: Use STR or DEX (player chooses)
- **Light**: Can dual-wield as bonus action
- **Versatile**: Use 1d6 one-handed, 1d8 two-handed
- **Reach**: 10 ft range instead of 5 ft
- **Thrown**: Can throw for ranged attack
- **Heavy**: Disadvantage for small creatures
- **Two-Handed**: Requires both hands

### Identifying Armor

```javascript
const isArmor = (item) => {
  const def = item.definition;
  return def.type.includes('Armor') || def.armorTypeId !== null;
};

// Light armor (AC = 10 + DEX): Leather, Studded Leather, etc.
// Medium armor (AC = 10 + DEX, max +2): Hide, Chain Shirt, Breastplate, etc.
// Heavy armor (AC fixed): Chain Mail, Plate, etc.
const armorType = (item) => {
  const def = item.definition;
  if (def.armorTypeId === 1) return 'Light';
  if (def.armorTypeId === 2) return 'Medium';
  if (def.armorTypeId === 3) return 'Heavy';
  return 'Unknown';
};
```

### Identifying Magic Items

```javascript
const isMagicItem = (item) => {
  const def = item.definition;
  return def.magic || def.canAttune || def.rarity !== 'Common';
};

// Magic items that might grant bonuses:
// - +1 Longsword → name contains "+1", "magic", rarity check
// - Wand of Magic Missiles → grantedModifiers check
// - Hat of Disguise → special ability (in description)
```

---

## Working with Weapons for the Actions Tab

### Extracting Attack Information

```javascript
function extractWeaponAttackInfo(weaponItem, character, derivedStats) {
  const def = weaponItem.definition;
  
  // Weapon name
  const name = def.name;
  
  // Determine ability modifier
  // Finesse weapons: use STR or DEX (prefer DEX)
  const hasFinesse = def.properties?.some(p => p.name === 'Finesse');
  const isRanged = def.range > 5 || def.longRange;
  
  let abilityUsed = hasFinesse ? 'dexterity' : 'strength';
  if (hasFinesse && derivedStats.derived.modifiers.dexterity >= derivedStats.derived.modifiers.strength) {
    abilityUsed = 'dexterity';
  } else if (!hasFinesse && isRanged) {
    abilityUsed = 'dexterity';
  } else {
    abilityUsed = 'strength';
  }
  
  // Calculate bonuses
  const abilityMod = derivedStats.derived.modifiers[abilityUsed];
  const proficiencyBonus = character.proficiencyBonus || 2; // default to level 1
  const toHitBonus = abilityMod + proficiencyBonus;
  const damageBonus = abilityMod;
  
  // Special case: Light weapons don't add ability mod to bonus action attacks
  const hasLight = def.properties?.some(p => p.name === 'Light');
  
  // Build attack info
  const attackInfo = {
    name,
    damage: def.damage?.diceString || 'unknown',        // "1d8"
    damageType: def.damageType || 'unknown',            // "Bludgeoning"
    toHit: toHitBonus,                                  // +5 (for display as "+5")
    damageBonus,                                        // +3
    abilityUsed,                                        // "strength" or "dexterity"
    equipped: weaponItem.equipped,
    range: def.range || 5,                              // melee range or thrown range
    properties: def.properties?.map(p => p.name) || [], // ["Finesse", "Light"]
    versatile: def.properties?.some(p => p.name === 'Versatile'),
    versatileDamage: '1d8',                             // if versatile, 2-handed option
    isRanged,
    isMagic: def.magic,
    magicBonus: def.magic ? (def.name.includes('+2') ? 2 : (def.name.includes('+1') ? 1 : 0)) : 0
  };
  
  return attackInfo;
}
```

### Magic Weapon Bonuses

Magic weapons often have bonuses encoded in their names or in `grantedModifiers`:

```javascript
function extractMagicBonus(weaponItem) {
  const def = weaponItem.definition;
  
  // Check name: "+1 Longsword", "+2 Dagger", etc.
  const nameMatch = def.name.match(/\+(\d+)/);
  if (nameMatch) {
    return parseInt(nameMatch[1], 10);
  }
  
  // Check grantedModifiers (less common, but possible)
  if (def.grantedModifiers?.length > 0) {
    // grantedModifiers is complex; for now, assume +1 if present
    return 1;
  }
  
  return 0; // Not magic or magic bonus unknown
}
```

---

## Unarmed Strike Attack (Always Available)

```javascript
function buildUnarmedStrike(character, derivedStats) {
  // Standard D&D 5e unarmed strike: 1d4 bludgeoning
  // Can be 1d8 or 1d10 for monks depending on level
  
  const proficiencyBonus = character.proficiencyBonus || 2;
  const strMod = derivedStats.derived.modifiers.strength;
  const dexMod = derivedStats.derived.modifiers.dexterity;
  
  // Most characters use STR; some classes/subclasses use DEX or are trained differently
  const abilityMod = Math.max(strMod, dexMod);
  const toHit = abilityMod + proficiencyBonus;
  
  // Monks get larger unarmed die based on level
  let damageDie = '1d4';
  const classes = character.classes || [];
  const monkClass = classes.find(c => c.definition?.name?.toLowerCase() === 'monk');
  if (monkClass) {
    const level = monkClass.levels;
    if (level >= 17) damageDie = '1d10';
    else if (level >= 11) damageDie = '1d8';
    else if (level >= 5) damageDie = '1d6';
    // else 1d4 (below 5)
  }
  
  return {
    name: 'Unarmed Strike',
    damage: damageDie,
    damageType: 'Bludgeoning',
    toHit,
    damageBonus: abilityMod,
    abilityUsed: abilityMod > 0 ? (strMod >= dexMod ? 'strength' : 'dexterity') : 'strength',
    range: 5,
    properties: [],
    isUnarmed: true
  };
}
```

---

## Special Mechanics: Shove & Grapple

These use ability checks, not inherent character properties, but are referenced in Actions tab:

```javascript
function buildSpecialActions(character, derivedStats) {
  const profBonus = character.proficiencyBonus || 2;
  const strMod = derivedStats.derived.modifiers.strength;
  const athleticsProf = character.skills?.athletics?.isProficient || false;
  
  const athleticsBonus = strMod + (athleticsProf ? profBonus : 0);
  
  return [
    {
      name: 'Shove (Prone)',
      dc: 'opposed Athletics check',
      bonus: athleticsBonus,
      description: 'Use Athletics to knock a creature prone (within reach)',
      range: 5,
      type: 'action'
    },
    {
      name: 'Grapple',
      dc: 'opposed Athletics check',
      bonus: athleticsBonus,
      description: 'Use Athletics to grapple a creature (within reach)',
      range: 5,
      type: 'action'
    }
  ];
}
```

---

## Equipped Weapons to Display

Filter inventory for weapons where `equipped === true`:

```javascript
function getEquippedWeapons(character) {
  return character.inventory
    .filter(item => {
      const def = item.definition;
      const isWeapon = def.attackType === 1 || def.damage?.diceString;
      return isWeapon && item.equipped;
    })
    .map(item => extractWeaponAttackInfo(item, character, derivedStats));
}

// Typical combat scenario:
// - Longsword in main hand (equipped)
// - Shield in off-hand (equipped, not a weapon)
// - Dagger in belt (equipped, can be drawn)
// - Backpack of other gear (not equipped)
```

---

## Example: Full Attack Options List

```javascript
function buildAttackOptions(character, derivedStats) {
  const attacks = [];
  
  // Add unarmed strike (always available, often first)
  attacks.push(buildUnarmedStrike(character, derivedStats));
  
  // Add equipped weapons
  const equippedWeapons = character.inventory
    .filter(item => {
      const def = item.definition;
      return (def.attackType === 1 || def.damage?.diceString) && item.equipped;
    });
  
  equippedWeapons.forEach(item => {
    attacks.push(extractWeaponAttackInfo(item, character, derivedStats));
  });
  
  // Note: UI may also show:
  // - Prepared spells with casting bonus/DC
  // - Shove/Grapple special actions
  // - Class-specific actions (Bardic Inspiration, etc.)
  
  return attacks;
}
```

---

## Common Weapon Examples in D&D 5e

### Simple Melee Weapons

| Weapon | Damage | Properties | Notes |
|--------|--------|-----------|-------|
| Club | 1d4 bludgeoning | Light | Bonus action with light second weapon |
| Dagger | 1d4 piercing | Finesse, Light, Thrown (20/60) | Can use DEX or STR |
| Greatclub | 1d8 bludgeoning | Two-handed | Requires both hands |
| Handaxe | 1d6 slashing | Light, Thrown (20/60) | Bonus action if light weapon |
| Javelin | 1d6 piercing | Melee, Thrown (30/120) | Can throw |
| Light Hammer | 1d4 bludgeoning | Light, Thrown (20/60) | Bonus action if light weapon |
| Mace | 1d6 bludgeoning | — | Simple melee weapon |
| Quarterstaff | 1d6 bludgeoning | Versatile (1d8) | Can use as 1d8 two-handed |
| Sickle | 1d4 slashing | Light | Bonus action if light weapon |
| Spear | 1d6 piercing | Melee, Thrown (20/60), Versatile (1d8) | Can throw or use two-handed |

### Simple Ranged Weapons

| Weapon | Damage | Properties | Notes |
|--------|--------|-----------|-------|
| Dart | 1d4 piercing | Finesse, Thrown (20/60) | Can use DEX or STR |
| Shortbow | 1d6 piercing | Ammunition, Two-handed | Requires arrows |
| Sling | 1d4 bludgeoning | Ammunition | Requires stones |

### Martial Melee Weapons

| Weapon | Damage | Properties | Notes |
|--------|--------|-----------|-------|
| Battleaxe | 1d8 slashing | Versatile (1d10) | Can use two-handed for more damage |
| Flail | 1d8 bludgeoning | — | — |
| Glaive | 1d10 slashing | Heavy, Reach, Two-handed | 10 ft reach instead of 5 ft |
| Greataxe | 1d12 slashing | Heavy, Two-handed | Highest melee damage |
| Greatsword | 2d6 slashing | Heavy, Two-handed | High damage, popular |
| Halberd | 1d10 slashing | Heavy, Reach, Two-handed | 10 ft reach |
| Lance | 1d12 piercing | Reach, Special | Only effective on mounted attacks |
| Longsword | 1d8 slashing | Versatile (1d10) | Most iconic weapon |
| Maul | 2d6 bludgeoning | Heavy, Two-handed | Highest bludgeoning damage |
| Morningstar | 1d8 piercing | — | Simple martial melee |
| Pike | 1d10 piercing | Heavy, Reach, Two-handed | 10 ft reach |
| Rapier | 1d8 piercing | Finesse | Uses DEX or STR elegantly |
| Scimitar | 1d6 slashing | Finesse, Light | Light but only 1d6 |
| Shortsword | 1d6 piercing | Finesse, Light | Most versatile dual-wield option |
| Trident | 1d6 piercing | Melee, Thrown (20/60), Versatile (1d8) | Can throw |
| War Pick | 1d8 piercing | — | — |
| Warhammer | 1d8 bludgeoning | Versatile (1d10) | Can use two-handed |
| Whip | 1d4 slashing | Finesse, Reach | 10 ft reach, finesse |

### Martial Ranged Weapons

| Weapon | Damage | Properties | Notes |
|--------|--------|-----------|-------|
| Blowgun | 1 piercing | Ammunition | Requires darts, minimal damage |
| Crossbow, hand | 1d6 piercing | Ammunition, Light | Can use with shield |
| Crossbow, heavy | 1d10 piercing | Ammunition, Heavy, Loading, Two-handed | Requires loading action |
| Longbow | 1d8 piercing | Ammunition, Heavy, Two-handed | Requires arrows |

---

## Logic for Actions Tab Weapon/Attack Display

### Filtering Logic

```javascript
const shouldDisplayWeapon = (weaponItem, character) => {
  const def = weaponItem.definition;
  
  // Always show equipped weapons
  if (weaponItem.equipped) return true;
  
  // Optional: Show unequipped weapons that are commonly used (e.g., daggers)
  // This is a UI choice—some apps show everything, some only equipped
  
  return false;
};
```

### Sorting/Priority

Suggested order for display:

1. **Equipped weapons** (in order they appear in inventory)
2. **Unarmed strike** (if no equipped melee weapons)
3. **Special actions** (Shove, Grapple)
4. **Prepared spells** (with casting bonus, DC, range)
5. **Class-specific bonus actions** (Bardic Inspiration, Cunning Action, etc.)

### UI Considerations

- **Compact display**: One line per attack option showing:
  - Weapon name
  - To-hit bonus
  - Damage dice + bonus
  - Example: `Longsword +5 to hit, 1d8+3 slashing`
  
- **Click to expand** (optional):
  - Shows properties (Finesse, Light, Versatile, etc.)
  - Shows versatile option if available
  - Navigate to full Inventory tab or Spells tab

---

## References

- **D&D 5e Official Rules**: PHB Chapter 9 (Combat)
- **Weapon Properties**: PHB p. 147 (weapons table with properties)
- **Attack Rolls & Damage**: PHB p. 194–195
- **Ability Score Modifiers**: PHB p. 77
- **Proficiency Bonus**: PHB p. 11
- **Armor Class**: PHB p. 14

---

## Code Patterns for Integration

### Pattern 1: Extract All Attack Options

```javascript
function getAllAttackOptions(character, derivedStats) {
  const allAttacks = [];
  
  // Unarmed
  allAttacks.push(buildUnarmedStrike(character, derivedStats));
  
  // Equipped weapons
  character.inventory?.forEach(item => {
    if (item.equipped && (item.definition.attackType === 1 || item.definition.damage?.diceString)) {
      allAttacks.push(extractWeaponAttackInfo(item, character, derivedStats));
    }
  });
  
  // Return sorted by relevance (equipped first, unarmed second if needed)
  return allAttacks;
}
```

### Pattern 2: Format Attack for Display

```javascript
function formatAttackForDisplay(attack) {
  const { name, toHit, damage, damageBonus, damageType } = attack;
  const toHitStr = toHit >= 0 ? '+' + toHit : toHit.toString();
  const bonusStr = damageBonus >= 0 ? '+' + damageBonus : damageBonus.toString();
  
  return `${name} ${toHitStr} to hit, ${damage}${bonusStr} ${damageType}`;
}

// Output: "Longsword +5 to hit, 1d8+3 slashing"
```

### Pattern 3: Quick Reference for UI State

```javascript
const actionTypeLabels = {
  ATTACK: 'Attack',
  SPELL: 'Spell',
  ACTION: 'Action',
  BONUS: 'Bonus Action',
  REACTION: 'Reaction'
};

const rangeLabels = {
  5: 'Melee (5 ft)',
  10: 'Reach (10 ft)',
  30: 'Medium (30 ft)',
  60: 'Long (60 ft)',
  120: 'Extreme (120 ft)'
};
```

---

## Notes for Implementation

1. **Proficiency Bonus**: Calculate as `Math.ceil(level / 4) + 1` if not already on character object
2. **Ability Modifiers**: Always use `derivedStats.derived.modifiers` (includes magic bonuses)
3. **Magic Weapons**: Parse name for +1, +2, +3; rarely stored elsewhere
4. **Dual-Wield**: Light weapons can make bonus action attacks; first attack uses ability mod, second doesn't (house rule often allows it)
5. **Versatile Weapons**: Quarterstaff, Longsword, etc. show both 1d6 and 1d8 options in UI
6. **Reach Weapons**: Glaive, Halberd, Pike, Lance have 10 ft range; display prominently
7. **Thrown Weapons**: Show range like "20/60" (normal/disadvantage)
8. **Unarmed Scaling**: Only Monks get larger unarmed dice; others always 1d4
9. **Special Actions**: Shove/Grapple use Athletics (STR) check, not guaranteed to hit

---

Generated: February 24, 2026
Character Data Source: D&D Beyond JSON format (corrin.json, hazel.json)
