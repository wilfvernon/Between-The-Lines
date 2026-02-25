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

  return {
    target: bonus.target,
    value: bonus.value,
    type: bonus.type || 'untyped',
    source: source || bonus.source || { label: 'Unknown' }
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
   * skill_proficiency: Grants proficiency in a skill
   * Currently tracked via features/proficiencies, not bonuses
   * Marked for future implementation in character sheet
   */
  skill_proficiency: (benefit, baseCharacterData = {}, source) => {
    // Proficiencies are handled separately, not as numeric bonuses
    // This is here as documentation for future proficiency tracking
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
    if (typeof benefit.value !== 'number') return [];
    return [{
      target: 'ac',
      value: benefit.value,
      type: benefit.bonus_type || 'untyped',
      source
    }];
  }
};

/**
 * Convert a single benefit object to bonus objects
 * Returns an array of bonuses (may be empty if handler doesn't apply)
 */
const convertBenefitToBonus = (benefit, baseCharacterData = {}, source) => {
  if (!benefit || typeof benefit !== 'object' || !benefit.type) return [];
  
  const handler = benefitHandlers[benefit.type];
  if (!handler) {
    console.warn(`[bonusEngine] Unknown benefit type: ${benefit.type}`);
    return [];
  }

  return handler(benefit, baseCharacterData, source);
};

/**
 * Process an array of benefits and convert to bonuses
 */
const processBenefits = (benefits, baseCharacterData = {}, source) => {
  if (!Array.isArray(benefits)) return [];
  
  return benefits.flatMap(benefit => 
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
      if (Array.isArray(entry.benefits)) {
        const benefitBonuses = processBenefits(entry.benefits, baseCharacterData, source);
        benefitBonuses.forEach(bonus => pushBonus(bonus, source));
      }
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
    initiative: 0,
    passivePerception: 0,
    skills: {},
    saves: {},
    speeds: {},
    senses: {}
  };

  const sources = {
    abilities: emptySourceMap(),
    maxHP: [],
    ac: [],
    initiative: [],
    passivePerception: [],
    skills: {},
    saves: {},
    speeds: {},
    senses: {}
  };

  bonuses.forEach((bonus) => {
    if (!bonus) return;

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

  const derived = {
    abilities: derivedAbilities,
    modifiers: derivedModifiers,
    maxHP: (base?.maxHP ?? 0) + totals.maxHP,
    proficiency: base?.proficiency ?? 0,
    ac: (base?.acBase ?? 0) + totals.ac,
    initiative: (base?.initiativeBase ?? 0) + totals.initiative,
    passivePerception: (base?.passivePerceptionBase ?? 0) + totals.passivePerception
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
