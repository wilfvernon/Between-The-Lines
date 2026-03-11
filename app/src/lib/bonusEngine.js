/**
 * BONUS ENGINE - Core Architecture
 * 
 * This file handles ALL bonus collection and derivation.
 * Output: derivedStats with FINAL ability scores and modifiers including ALL bonuses.
 * 
 * Modules consuming this:
 *   - CharacterSheet.jsx uses derivedStats for ALL displays (skills, saves, AC, etc.)
 *   - SkillsTab, AbilitiesTab, etc. ALWAYS use derived modifiers
 *   - Never use character.strength/dexterity/etc. for display - use derivedStats.derived.modifiers
 * 
 * Bonus sources:
 *   - Features with benefits (e.g., "Scholar of Yore" +CHA to History)
 *   - Magic items with bonuses
 *   - Ability Score Improvements (ASIs)
 *   - Manual overrides
 */

const abilityOrder = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma'
];

const abilityModifier = (score) => Math.floor((score - 10) / 2);

const emptyAbilityMap = () => abilityOrder.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

const emptySourceMap = () => abilityOrder.reduce((acc, key) => ({ ...acc, [key]: [] }), {});

const normalizeSpeedType = (value) => (value || '').toLowerCase();

const normalizeAbilityReference = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return null;

  const shortToLong = {
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma'
  };

  if (abilityOrder.includes(key)) return key;
  return shortToLong[key] || null;
};

const normalizeBenefitType = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const normalizeBenefitsInput = (benefits) => {
  if (Array.isArray(benefits)) return benefits;
  if (benefits && typeof benefits === 'object' && benefits.type) return [benefits];
  if (benefits && typeof benefits === 'object' && Array.isArray(benefits.benefits)) {
    return benefits.benefits;
  }
  if (typeof benefits === 'string') {
    try {
      const parsed = JSON.parse(benefits);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && parsed.type) return [parsed];
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.benefits)) return parsed.benefits;
    } catch {
      return [];
    }
  }
  return [];
};

const toSenseMap = (senses = []) => senses.reduce((acc, sense) => {
  if (!sense?.sense_type) return acc;
  const key = sense.sense_type;
  const range = typeof sense.range === 'number' ? sense.range : 0;
  acc[key] = Math.max(acc[key] || 0, range);
  return acc;
}, {});

const normalizeBonus = (bonus, source) => {
  if (!bonus || typeof bonus !== 'object') return null;
  if (typeof bonus.target !== 'string') return null;
  if (typeof bonus.value !== 'number') return null;

  const {
    target,
    value,
    type,
    source: inlineSource,
    ...rest
  } = bonus;

  return {
    ...rest,
    target,
    value,
    type: type || 'untyped',
    source: source || inlineSource || { label: 'Unknown' }
  };
};

/**
 * Resolve a modifier reference to a numeric value
 * e.g., "charisma_modifier", "proficiency_bonus", "wisdom_modifier_doubled"
 */
const resolveModifierValue = (modifierString, baseCharacterData = {}) => {
  if (!modifierString || typeof modifierString !== 'string') return 0;

  // Handle proficiency bonus reference
  if (modifierString === 'proficiency_bonus') {
    return baseCharacterData.proficiency || 2;
  }

  // Handle ability modifier references like "charisma_modifier", "wisdom_modifier"
  const modifierMatch = modifierString.match(/^(\w+)_modifier(?:_(\w+))?$/);
  if (modifierMatch) {
    const ability = modifierMatch[1];
    const modifier = modifierMatch[2]; // e.g., "doubled", "halved"
    
    const abilityScore = baseCharacterData[ability] || 10;
    let value = abilityModifier(abilityScore);

    if (modifier === 'doubled') value *= 2;
    if (modifier === 'halved') value = Math.floor(value / 2);

    return value;
  }

  return 0;
};

/**
 * Get the appropriate level for scaling a benefit
 * Returns character level for most benefits, class level if specified
 */
const getScalingLevel = (baseCharacterData = {}, source = {}) => {
  // If source specifies a class, use that class's level
  if (source?.class && baseCharacterData.classes) {
    const targetClass = source.class.toLowerCase();
    const classEntry = baseCharacterData.classes.find(c => 
      (c.class || c.definition?.name || '').toLowerCase() === targetClass
    );
    if (classEntry) {
      return classEntry.level || classEntry.definition?.level || 1;
    }
  }
  
  // Default to character level
  return baseCharacterData.level || 1;
};

/**
 * Evaluate a formula string with context variables
 * Supports formulas like "2*level", "level+constitution_modifier", etc.
 */
const evaluateFormula = (formula, baseCharacterData = {}, source = {}) => {
  if (!formula || typeof formula !== 'string') return 0;
  
  // Build context from baseCharacterData
  const context = {
    level: getScalingLevel(baseCharacterData, source),
    proficiency: baseCharacterData.proficiency || 2,
    constitution_modifier: abilityModifier(baseCharacterData.constitution || 10),
    wisdom_modifier: abilityModifier(baseCharacterData.wisdom || 10),
    dexterity_modifier: abilityModifier(baseCharacterData.dexterity || 10),
    strength_modifier: abilityModifier(baseCharacterData.strength || 10),
    intelligence_modifier: abilityModifier(baseCharacterData.intelligence || 10),
    charisma_modifier: abilityModifier(baseCharacterData.charisma || 10),
    max_hp: baseCharacterData.maxHP || 0,
    shield_bonus: baseCharacterData.shield_bonus || 0
  };
  
  try {
    // Create a safer evaluation by only allowing alphanumeric identifiers and basic math
    // Replace context variables in the formula
    let evaluatedFormula = formula;
    Object.entries(context).forEach(([key, value]) => {
      // Replace whole word matches of context keys
      evaluatedFormula = evaluatedFormula.replace(new RegExp(`\\b${key}\\b`, 'g'), value);
    });
    
    // Only allow numbers, operators, and parentheses
    if (!/^[\d+\-*/(). ]*$/.test(evaluatedFormula)) {
      console.warn(`[bonusEngine] Formula contains invalid characters: ${formula}`);
      return 0;
    }
    
    // Evaluate the formula safely
    const result = Function(`'use strict'; return (${evaluatedFormula})`)();
    const finalValue = Number.isInteger(result) ? result : Math.floor(result);
    return finalValue;
  } catch (e) {
    console.warn(`[bonusEngine] Error evaluating formula "${formula}":`, e.message);
    return 0;
  }
};

/**
 * Handler registry for converting benefit structures to bonuses
 * Each handler returns an array of bonus objects or empty array
 */
const benefitHandlers = {
  /**
   * skill_modifier_bonus: Adds a modifier bonus to skill checks
   * Structure: { type: "skill_modifier_bonus", skills: ["skill1", "skill2"], bonus_source: "charisma_modifier" }
   */
  skill_modifier_bonus: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.skills) || !benefit.bonus_source) return [];
    
    const value = resolveModifierValue(benefit.bonus_source, baseCharacterData);
    if (value === 0) return [];

    return benefit.skills.map(skill => ({
      target: `skill.${skill}`,
      value,
      type: 'untyped',
      source
    }));
  },

  /**
   * skill_bonus: Adds a flat bonus to skill checks
   * Structure: { type: "skill_bonus", skills: ["perception", "insight"] | ["all"], amount: 1 }
   */
  skill_bonus: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.skills) || typeof benefit.amount !== 'number') return [];
    
    const allSkills = [
      'acrobatics', 'animal handling', 'arcana', 'athletics', 'deception', 'history',
      'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
      'performance', 'persuasion', 'religion', 'sleight of hand', 'stealth', 'survival'
    ];

    const skillsToBonus = benefit.skills.includes('all') 
      ? allSkills
      : benefit.skills;

    return skillsToBonus.map(skill => ({
      target: `skill.${skill}`,
      value: benefit.amount,
      type: benefit.bonus_type || 'untyped',
      source
    }));
  },

  /**
   * ability_modifier_bonus: Adds a modifier bonus to ability checks
   * Structure: { type: "ability_modifier_bonus", abilities: ["wisdom", "charisma"], bonus_source: "proficiency_bonus" }
   */
  ability_modifier_bonus: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.abilities) || !benefit.bonus_source) return [];

    const value = resolveModifierValue(benefit.bonus_source, baseCharacterData);
    if (value === 0) return [];

    return benefit.abilities.map(ability => ({
      target: `ability.${ability}`,
      value,
      type: 'untyped',
      source
    }));
  },

  /**
   * save_modifier_bonus: Adds a modifier bonus to saving throws
   * Structure: { type: "save_modifier_bonus", saves: ["wisdom", "dexterity"], bonus_source: "charisma_modifier" }
   */
  save_modifier_bonus: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.saves) || !benefit.bonus_source) return [];

    const value = resolveModifierValue(benefit.bonus_source, baseCharacterData);
    if (value === 0) return [];

    return benefit.saves.map(save => ({
      target: `save.${save}`,
      value,
      type: 'untyped',
      source
    }));
  },

  /**
   * save_bonus: Adds a flat bonus to saving throws
   * Structure: { type: "save_bonus", abilities: ["wisdom", "dexterity"] | ["all"], amount: 1 }
   */
  save_bonus: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.abilities) || typeof benefit.amount !== 'number') return [];
    
    const allAbilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

    const abilitiesToBonus = benefit.abilities.includes('all') 
      ? allAbilities
      : benefit.abilities;

    return abilitiesToBonus.map(ability => ({
      target: `save.${ability}`,
      value: benefit.amount,
      type: benefit.bonus_type || 'untyped',
      source
    }));
  },

  /**
   * skill_proficiency: Grants proficiency in a skill
   * Structure: { type: "skill_proficiency", skills: ["history"], alternate_skill?: boolean }
   * Currently tracked via features/proficiencies, not bonuses
   * Marked for future implementation in character sheet
   */
  skill_proficiency: (benefit, baseCharacterData = {}, source) => {
    // Proficiencies are handled separately, not as numeric bonuses
    // This is here as documentation for future proficiency tracking
    return [];
  },

  /**
   * skill_expertise: Grants expertise (double proficiency) in skills
   * Structure: { type: "skill_expertise", skills: ["performance", "persuasion"], level_scaling?: { "9": { skills: [...] } } }
   * Currently tracked via features, not bonuses
   * level_scaling is level-based (e.g., Bard gains more expertise at level 9)
   */
  skill_expertise: (benefit, baseCharacterData = {}, source) => {
    // Expertise is handled in SkillsTab UI layer
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * skill_dual_ability: Adds an additional ability modifier to a skill
   * Example: Scholar of Yore adds CHA to History and Religion
   * Handled directly by SkillsTab via dynamic calculation, not as numeric bonuses
   */
  skill_dual_ability: (benefit, baseCharacterData = {}, source) => {
    // Dual ability calculations are handled in SkillsTab UI layer
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * skill_half_proficiency: Add half proficiency bonus to unproficient skills
   * Example: Jack of All Trades grants half PB to skills you lack proficiency in
   * Handled directly by SkillsTab via dynamic calculation, not as numeric bonuses
   */
  skill_half_proficiency: (benefit, baseCharacterData = {}, source) => {
    // Half proficiency calculations are handled in SkillsTab UI layer
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * ac_bonus: Flat bonus to armor class
   * Structure: { type: "ac_bonus", value: 2 }
   */
  ac_bonus: (benefit, baseCharacterData = {}, source) => {
    // Support both 'value' and 'amount' property names
    const bonusValue = benefit.value !== undefined ? benefit.value : benefit.amount;
    if (typeof bonusValue !== 'number') return [];
    return [{
      target: 'ac',
      value: bonusValue,
      type: benefit.bonus_type || 'untyped',
      source
    }];
  },

  /**
   * ac_override: Replaces AC formula with base + listed ability modifiers (+ shield if allowed)
   * Structure: { type: "ac_override", base: 13, mods: ["CON"], shields_allowed: true }
   */
  ac_override: (benefit, baseCharacterData = {}, source) => {
    if (typeof benefit.base !== 'number') return [];

    const normalizedMods = Array.isArray(benefit.mods)
      ? benefit.mods
          .map(normalizeAbilityReference)
          .filter(Boolean)
      : [];

    return [{
      target: 'ac_override',
      value: benefit.base,
      type: 'override',
      mods: normalizedMods,
      shieldsAllowed: Boolean(benefit.shields_allowed),
      shieldBonus: Number(baseCharacterData.shield_bonus) || 0,
      source
    }];
  },

  /**
   * armor_proficiency: Grants or upgrades armor proficiency
   * Structure: { type: "armor_proficiency", level: "light"|"medium"|"heavy" }
   * Handled in CharacterSheet proficiency logic, not as numeric bonuses
   */
  armor_proficiency: (benefit, baseCharacterData = {}, source) => {
    // Armor proficiency is handled in isArmorProficient() function
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * shield_proficiency: Grants shield proficiency
   * Structure: { type: "shield_proficiency", value: true }
   * Handled in CharacterSheet proficiency logic, not as numeric bonuses
   */
  shield_proficiency: (benefit, baseCharacterData = {}, source) => {
    // Shield proficiency is handled in isShieldProficient() function
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * bonus_action: Grants a bonus action ability
   * Handled in ActionsTab UI layer for display, not as numeric bonuses
   */
  bonus_action: (benefit, baseCharacterData = {}, source) => {
    // Bonus actions are handled in ActionsTab UI layer
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * feature_die: Grants a feature die ability
   * Structure: { type: "feature_die", name: "Bardic Inspiration", die: "d6", level_scaling?: { "5": "d8", "10": "d10" } }
   * Handled in ActionsTab UI layer for display, not as numeric bonuses
   */
  feature_die: (benefit, baseCharacterData = {}, source) => {
    // Feature die abilities are handled in ActionsTab UI layer
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * hp_bonus: Adds to maximum HP
   * Structure: { type: "hp_bonus", amount: number | "formula", formula?: "2*level" }
   * Supports both flat amounts and formulas like "2*level", "level+constitution_modifier"
   */
  hp_bonus: (benefit, baseCharacterData = {}, source) => {
    if (!benefit.amount && benefit.amount !== 0) return [];
    
    let value;
    if (benefit.amount === 'formula' && benefit.formula) {
      // Evaluate formula with character context
      value = evaluateFormula(benefit.formula, baseCharacterData, source);
    } else if (typeof benefit.amount === 'number') {
      value = benefit.amount;
    } else if (typeof benefit.amount === 'string' && !isNaN(benefit.amount)) {
      value = parseInt(benefit.amount, 10);
    } else {
      return [];
    }
    
    if (value === 0) return [];
    
    const bonus = {
      target: 'maxHP',
      value,
      type: benefit.bonus_type || 'feature',
      source
    };
    return [bonus];
  },

  /**
   * reaction: Grants a reaction ability
   * Handled in ActionsTab UI layer for display, not as numeric bonuses
   */
  reaction: (benefit, baseCharacterData = {}, source) => {
    // Reactions are handled in ActionsTab UI layer
    // This is here so collectBonuses doesn't warn about unknown types
    return [];
  },

  /**
   * speed: Grants a movement speed
   * Structure: { type: "speed", speed_value: "30ft", movement_type: "Walking" }
   * Parses speed_value and normalizes movement_type to create speed bonuses
   */
  speed: (benefit, baseCharacterData = {}, source) => {
    if (!benefit.speed_value || !benefit.movement_type) return [];
    
    // Parse speed value (e.g., "30ft" -> 30)
    const speedMatch = benefit.speed_value.match(/\d+/);
    if (!speedMatch) return [];
    const value = parseInt(speedMatch[0], 10);
    
    // Normalize movement type (e.g., "Walking" -> "walk")
    const movementType = normalizeSpeedType(benefit.movement_type);
    if (!movementType) return [];
    
    return [{
      target: `speed.${movementType}`,
      value,
      type: 'base',
      source
    }];
  },

  /**
   * initiative_bonus: Adds a bonus to initiative
   * Structure: { type: "initiative_bonus", bonus: "proficiency" | "charisma" | number }
   * bonus can be:
   *   - "proficiency": adds proficiency bonus
   *   - ability name like "charisma", "dexterity": adds that ability's modifier
   *   - flat number: adds that value directly
   */
  initiative_bonus: (benefit, baseCharacterData = {}, source) => {
    if (benefit.bonus === undefined || benefit.bonus === null) return [];
    
    let value = 0;
    let initiativeAbility = null;
    
    if (typeof benefit.bonus === 'number') {
      // Flat value
      value = benefit.bonus;
    } else if (typeof benefit.bonus === 'string') {
      const bonusKey = benefit.bonus.trim().toLowerCase();
      // Check if it's "proficiency"
      if (bonusKey === 'proficiency' || bonusKey === 'proficiency_bonus') {
        value = baseCharacterData.proficiency || 2;
      } else if (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(bonusKey)) {
        // Mark as ability-linked so final value can use derived modifiers.
        initiativeAbility = bonusKey;
        const abilityScore = baseCharacterData[bonusKey] || 10;
        value = abilityModifier(abilityScore);
      } else {
        // Try resolving as a modifier string (e.g., "charisma_modifier_doubled")
        value = resolveModifierValue(bonusKey, baseCharacterData);
      }
    }
    
    if (value === 0) return [];
    
    return [{
      target: 'initiative',
      value,
      initiativeAbility,
      type: 'untyped',
      source
    }];
  },

  /**
   * init_bonus: Adds a bonus to initiative
   * Structure: { type: "init_bonus", amount: "proficiency" | "charisma" | number }
   * amount can be:
   *   - "proficiency": adds proficiency bonus
   *   - ability name like "charisma", "dexterity": adds that ability's modifier
   *   - flat number: adds that value directly
   */
  init_bonus: (benefit, baseCharacterData = {}, source) => {
    if (benefit.amount === undefined || benefit.amount === null) return [];
    
    let value = 0;
    let initiativeAbility = null;
    
    if (typeof benefit.amount === 'number') {
      // Flat value
      value = benefit.amount;
    } else if (typeof benefit.amount === 'string') {
      const amountKey = benefit.amount.trim().toLowerCase();
      // Check if it's "proficiency"
      if (amountKey === 'proficiency' || amountKey === 'proficiency_bonus') {
        value = baseCharacterData.proficiency || 2;
      } else if (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(amountKey)) {
        // Mark as ability-linked so final value can use derived modifiers.
        initiativeAbility = amountKey;
        const abilityScore = baseCharacterData[amountKey] || 10;
        value = abilityModifier(abilityScore);
      } else {
        // Try resolving as a modifier string (e.g., "charisma_modifier_doubled")
        value = resolveModifierValue(amountKey, baseCharacterData);
      }
    }
    
    if (value === 0) return [];
    
    return [{
      target: 'initiative',
      value,
      initiativeAbility,
      type: 'untyped',
      source
    }];
  },

  /**
   * skill_advantage: Grants advantage on skill checks
   * Structure: { type: "skill_advantage", skills: ["stealth", "perception"] }
   * Returns special advantage markers instead of numeric bonuses
   */
  skill_advantage: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.skills) || benefit.skills.length === 0) return [];
    
    return benefit.skills.map(skill => {
      // Normalize skill name: lowercase and replace spaces/apostrophes with underscores
      const normalizedSkill = String(skill || '')
        .toLowerCase()
        .replace(/[\s']/g, '_');
      
      return {
        target: `advantage.skill.${normalizedSkill}`,
        value: 1,
        type: 'advantage',
        source
      };
    });
  },

  /**
   * saving_throw_advantage: Grants advantage on saving throws
   * Structure: { type: "saving_throw_advantage", saves: ["wisdom", "dexterity"] }
   * Returns special advantage markers instead of numeric bonuses
   */
  saving_throw_advantage: (benefit, baseCharacterData = {}, source) => {
    if (!Array.isArray(benefit.saves) || benefit.saves.length === 0) return [];
    
    return benefit.saves.map(save => {
      // Normalize save name: lowercase for consistency
      const normalizedSave = String(save || '').toLowerCase();
      
      return {
        target: `advantage.save.${normalizedSave}`,
        value: 1,
        type: 'advantage',
        source
      };
    });
  },

  /**
   * speed_bonus: Adds or subtracts from movement speed
   * Structure: { type: "speed_bonus", speed_type: "walk"|"fly"|"climb"|"swim", amount: 10 }
   */
  speed_bonus: (benefit, baseCharacterData = {}, source) => {
    // Support both 'value' and 'amount' property names
    const bonusValue = benefit.amount !== undefined ? benefit.amount : benefit.value;
    if (typeof bonusValue !== 'number') return [];
    const speedType = normalizeSpeedType(benefit.speed_type || 'walk');
    if (!speedType) return [];
    
    return [{
      target: `speed.${speedType}`,
      value: bonusValue,
      type: benefit.bonus_type || 'untyped',
      source
    }];
  },

  /**
   * sense: Grants or improves a sense range
   * Structure: { type: "sense", sense: "Darkvision", range: "60ft." }
   */
  sense: (benefit, baseCharacterData = {}, source) => {
    const senseType = String(benefit.sense || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (!senseType) return [];

    let rangeValue = 0;
    if (typeof benefit.range === 'number') {
      rangeValue = benefit.range;
    } else if (typeof benefit.range === 'string') {
      const match = benefit.range.match(/\d+/);
      rangeValue = match ? Number.parseInt(match[0], 10) : 0;
    }

    if (!Number.isFinite(rangeValue) || rangeValue <= 0) return [];

    return [{
      target: `sense.${senseType}`,
      value: rangeValue,
      type: benefit.bonus_type || 'untyped',
      source
    }];
  },

  /**
   * melee_weapon_attack_bonus: Adds a modifier bonus to melee weapon attack rolls
   * Structures:
   *   - { type: "melee_weapon_attack_bonus", bonus_source: "charisma_modifier" }
   *   - { type: "melee_weapon_attack_bonus", amount: 2, weapon_property: "versatile", versatile: 1 }
   */
  melee_weapon_attack_bonus: (benefit, baseCharacterData = {}, source) => {
    let value = 0;

    if (benefit.bonus_source) {
      value = resolveModifierValue(benefit.bonus_source, baseCharacterData);
    } else if (typeof benefit.amount === 'number') {
      value = benefit.amount;
    } else if (typeof benefit.value === 'number') {
      value = benefit.value;
    }

    if (value === 0) return [];

    return [{
      target: 'melee_weapon_attack',
      value,
      weaponProperty: benefit.weapon_property || benefit.weaponProperty || benefit.weapon_propery || null,
      versatileHands: Number.isFinite(Number(benefit.versatile)) ? Number(benefit.versatile) : null,
      type: benefit.bonus_type || 'untyped',
      source
    }];
  },

  /**
   * melee_weapon_damage_bonus: Adds a modifier bonus to melee weapon damage rolls
   * Structure: { type: "melee_weapon_damage_bonus", amount: 2, weapon_property: "versatile", versatile: 2 }
   */
  melee_weapon_damage_bonus: (benefit, baseCharacterData = {}, source) => {
    const value = typeof benefit.amount === 'number'
      ? benefit.amount
      : (typeof benefit.value === 'number' ? benefit.value : 0);

    if (value === 0) return [];

    return [{
      target: 'melee_weapon_damage',
      value,
      weaponProperty: benefit.weapon_property || benefit.weaponProperty || benefit.weapon_propery || null,
      versatileHands: Number.isFinite(Number(benefit.versatile)) ? Number(benefit.versatile) : null,
      type: benefit.bonus_type || 'untyped',
      source
    }];
  },

  /**
   * stance: Mutually exclusive stance system
   * Only the active stance's nested benefits apply
   * Structure: { type: "stance", stances: [{ name: "X", benefits: [...] }, ...] }
   * NOTE: Stance benefits are applied conditionally by the UI layer based on active stance
   * This handler just documents the structure; actual bonus collection happens in CharacterSheet
   */
  stance: (benefit, baseCharacterData = {}, source) => {
    // Stances are handled at the UI/CharacterSheet level, not here
    // This is documented for reference only
    return [];
  }
};

/**
 * Convert a single benefit object to bonus objects
 * Returns an array of bonuses (may be empty if handler doesn't apply)
 */
const convertBenefitToBonus = (benefit, baseCharacterData = {}, source) => {
  if (!benefit || typeof benefit !== 'object' || !benefit.type) return [];

  const normalizedType = normalizeBenefitType(benefit.type);
  const handler = benefitHandlers[normalizedType];
  if (!handler) {
    console.warn(`[bonusEngine] Unknown benefit type: ${benefit.type} (normalized: ${normalizedType})`);
    return [];
  }

  return handler(benefit, baseCharacterData, source);
};

/**
 * Process an array of benefits and convert to bonuses
 */
const processBenefits = (benefits, baseCharacterData = {}, source) => {
  const normalizedBenefits = normalizeBenefitsInput(benefits);
  if (!normalizedBenefits.length) return [];
  
  return normalizedBenefits.flatMap(benefit => 
    convertBenefitToBonus(benefit, baseCharacterData, source)
  );
};

export const collectBonuses = ({ items = [], features = [], baseCharacterData = {}, overrides = [] } = {}) => {
  const collected = [];

  const pushBonus = (bonus, source) => {
    const normalized = normalizeBonus(bonus, source);
    if (normalized) collected.push(normalized);
  };

  const collectFromList = (list, sourceType) => {
    list.forEach((entry) => {
      if (!entry) return;
      
      const source = {
        type: sourceType,
        id: entry.id,
        label: entry.name || entry.label || entry.title || 'Unknown'
      };

      // Collect traditional bonuses (for backward compatibility)
      if (Array.isArray(entry.bonuses)) {
        entry.bonuses.forEach((bonus) => pushBonus(bonus, source));
      } else if (entry.bonus) {
        pushBonus(entry.bonus, source);
      }

      // Process benefits (new structured format)
      const benefitBonuses = processBenefits(entry.benefits, baseCharacterData, source);
      benefitBonuses.forEach(bonus => pushBonus(bonus, source));

      // Support single benefit shape if present
      const singleBenefitBonuses = processBenefits(entry.benefit, baseCharacterData, source);
      singleBenefitBonuses.forEach(bonus => pushBonus(bonus, source));
    });
  };

  collectFromList(items, 'item');
  collectFromList(features, 'feature');

  if (Array.isArray(overrides)) {
    overrides.forEach((bonus) => pushBonus(bonus, { type: 'override', label: 'Override' }));
  }

  return collected;
};

export const deriveCharacterStats = ({ base, bonuses = [] }) => {
  const totals = {
    abilities: emptyAbilityMap(),
    maxHP: 0,
    ac: 0,
    acOverrides: [],
    initiative: 0,
    passivePerception: 0,
    skills: {},
    saves: {},
    speeds: {},
    senses: {},
    advantages: {
      skills: {},
      saves: {}
    }
  };

  const sources = {
    abilities: emptySourceMap(),
    maxHP: [],
    ac: [],
    acOverrides: [],
    initiative: [],
    passivePerception: [],
    skills: {},
    saves: {},
    speeds: {},
    senses: {},
    advantages: {
      skills: {},
      saves: {}
    }
  };

  bonuses.forEach((bonus) => {
    if (!bonus) return;

    // Handle advantage targets
    if (bonus.target.startsWith('advantage.skill.')) {
      const skill = bonus.target.replace('advantage.skill.', '');
      if (!sources.advantages.skills[skill]) sources.advantages.skills[skill] = [];
      sources.advantages.skills[skill].push(bonus);
      totals.advantages.skills[skill] = true;
      return;
    }

    if (bonus.target.startsWith('advantage.save.')) {
      const save = bonus.target.replace('advantage.save.', '');
      if (!sources.advantages.saves[save]) sources.advantages.saves[save] = [];
      sources.advantages.saves[save].push(bonus);
      totals.advantages.saves[save] = true;
      return;
    }

    if (bonus.target.startsWith('ability.')) {
      const ability = bonus.target.replace('ability.', '');
      if (ability in totals.abilities) {
        totals.abilities[ability] += bonus.value;
        sources.abilities[ability].push(bonus);
      }
      return;
    }

    if (bonus.target === 'maxHP') {
      totals.maxHP += bonus.value;
      sources.maxHP.push(bonus);
      return;
    }

    if (bonus.target === 'ac') {
      totals.ac += bonus.value;
      sources.ac.push(bonus);
      return;
    }

    if (bonus.target === 'ac_override') {
      totals.acOverrides.push(bonus);
      sources.acOverrides.push(bonus);
      return;
    }

    if (bonus.target === 'initiative') {
      totals.initiative += bonus.value;
      sources.initiative.push(bonus);
      return;
    }

    if (bonus.target === 'passivePerception') {
      totals.passivePerception += bonus.value;
      sources.passivePerception.push(bonus);
      return;
    }

    if (bonus.target.startsWith('skill.')) {
      const skill = bonus.target.replace('skill.', '');
      totals.skills[skill] = (totals.skills[skill] || 0) + bonus.value;
      sources.skills[skill] = [...(sources.skills[skill] || []), bonus];
      return;
    }

    if (bonus.target.startsWith('save.')) {
      const save = bonus.target.replace('save.', '');
      totals.saves[save] = (totals.saves[save] || 0) + bonus.value;
      sources.saves[save] = [...(sources.saves[save] || []), bonus];
      return;
    }

    if (bonus.target.startsWith('speed.')) {
      const speedType = normalizeSpeedType(bonus.target.replace('speed.', ''));
      if (speedType) {
        totals.speeds[speedType] = (totals.speeds[speedType] || 0) + bonus.value;
        sources.speeds[speedType] = [...(sources.speeds[speedType] || []), bonus];
      }
      return;
    }

    if (bonus.target.startsWith('sense.')) {
      const senseType = normalizeSpeedType(bonus.target.replace('sense.', ''));
      if (senseType) {
        totals.senses[senseType] = Math.max(totals.senses[senseType] || 0, bonus.value);
        sources.senses[senseType] = [...(sources.senses[senseType] || []), bonus];
      }
    }
  });

  const derivedAbilities = abilityOrder.reduce((acc, key) => {
    const baseScore = base?.abilities?.[key] ?? 0;
    return { ...acc, [key]: baseScore + totals.abilities[key] };
  }, {});

  const derivedModifiers = abilityOrder.reduce((acc, key) => {
    return { ...acc, [key]: abilityModifier(derivedAbilities[key]) };
  }, {});

  // Resolve initiative bonuses after derived modifiers are known.
  const resolvedInitiativeBonus = sources.initiative.reduce((sum, bonus) => {
    if (bonus?.initiativeAbility && derivedModifiers[bonus.initiativeAbility] !== undefined) {
      return sum + (derivedModifiers[bonus.initiativeAbility] || 0);
    }
    return sum + (bonus?.value || 0);
  }, 0);
  totals.initiative = resolvedInitiativeBonus;

  const baseAC = (base?.acBase ?? 0) + totals.ac;
  let finalAC = baseAC;

  if (totals.acOverrides.length > 0) {
    const overrideValues = totals.acOverrides.map((overrideBonus) => {
      const abilityMods = Array.isArray(overrideBonus.mods)
        ? overrideBonus.mods.reduce((sum, abilityKey) => sum + (derivedModifiers[abilityKey] || 0), 0)
        : 0;
      const shieldBonus = overrideBonus.shieldsAllowed ? (overrideBonus.shieldBonus || 0) : 0;
      return (overrideBonus.value || 0) + abilityMods + shieldBonus;
    });

    finalAC = Math.max(...overrideValues) + totals.ac;
  }

  const derived = {
    abilities: derivedAbilities,
    modifiers: derivedModifiers,
    maxHP: (base?.maxHP ?? 0) + totals.maxHP,
    proficiency: base?.proficiency ?? 0,
    ac: finalAC,
    // Initiative = derived dexterity modifier + initiative bonuses from features
    initiative: (derivedModifiers.dexterity || 0) + resolvedInitiativeBonus,
    passivePerception: (base?.passivePerceptionBase ?? 0) + totals.passivePerception,
    advantages: totals.advantages
  };

  const baseSensesMap = toSenseMap(base?.senses || []);
  const mergedSenses = {
    ...baseSensesMap,
    ...Object.keys(totals.senses).reduce((acc, key) => {
      acc[key] = Math.max(baseSensesMap[key] || 0, totals.senses[key]);
      return acc;
    }, {})
  };

  const derivedSenses = Object.entries(mergedSenses)
    .filter(([, range]) => range > 0)
    .map(([sense_type, range]) => ({ sense_type, range }));

  const baseSpeeds = base?.speeds && typeof base.speeds === 'object'
    ? base.speeds
    : {};

  const derivedSpeeds = { ...baseSpeeds };
  Object.keys(totals.speeds).forEach((type) => {
    derivedSpeeds[type] = (derivedSpeeds[type] || 0) + totals.speeds[type];
  });

  derived.senses = derivedSenses;
  derived.speeds = derivedSpeeds;

  return {
    derived,
    totals,
    sources
  };
};

/**
 * Export benefit handlers for extension and testing
 * Add new benefit types by assigning to this registry
 */
export const registerBenefitHandler = (type, handler) => {
  benefitHandlers[type] = handler;
};

export const getBenefitHandlers = () => benefitHandlers;
