import { useEffect, useRef, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import useEmblaCarousel from 'embla-carousel-react';
import PropTypes from 'prop-types';
import { collectBonuses, deriveCharacterStats } from '../lib/bonusEngine';
import { useAuth } from '../context/AuthContext';
import { useCharacter } from '../hooks/useCharacter';
import { supabase } from '../lib/supabase';
import { renderSpellDescription } from '../lib/spellUtils.jsx';
import { extractFeatAbilityScoreImprovements, getJoinedFeat, normalizeFeatChoices } from '../lib/featChoices';
import AbilityScoreInspector from '../components/AbilityScoreInspector';
import ACInspector from '../components/ACInspector';
import ConditionsModal from '../components/ConditionsModal';
import './CharacterSheet.css';

// Extracted tab components
import BioTab from './CharacterSheet/tabs/BioTab';
import CreaturesTab from './CharacterSheet/tabs/CreaturesTab';
import SkillsTab from './CharacterSheet/tabs/SkillsTab';
import SpellsTab from './CharacterSheet/tabs/SpellsTab';
import ActionsTab from './CharacterSheet/tabs/ActionsTab';
import AbilitiesTab from './CharacterSheet/tabs/AbilitiesTab';

/**
 * ⚠️ CRITICAL ARCHITECTURE NOTE ⚠️
 * 
 * ALMOST ALL DISPLAYS USE DERIVED MODIFIERS, NOT BASE MODIFIERS.
 * 
 * Base modifiers (from character.strength, character.dexterity, etc.) are:
 *   - Only used as initial fallback if derived modifiers unavailable
 *   - Used ONLY when setting up the base data for the bonus engine
 * 
 * Derived modifiers (from derivedStats.derived.modifiers) are:
 *   - Calculated AFTER applying all bonuses from features, items, ASIs
 *   - Must be used for: Skills, Saves, Ability checks, AC, Initiative, etc.
 *   - Automatically include bonuses like "Scholar of Yore +CHA to History"
 * 
 * Pattern: Use derivedStats?.derived?.modifiers[ability] or derived ability scores
 * Exception: Only use base abilities when collecting/deriving stats in the first place
 */

const parseFeatureDescription = (text) => renderSpellDescription(text);

// Helper to convert ability score improvements to bonus format

const convertAbilityScoresToBonuses = (improvements = []) => {
  const abilityAbbrevToLower = {
    'STR': 'strength',
    'DEX': 'dexterity',
    'CON': 'constitution',
    'INT': 'intelligence',
    'WIS': 'wisdom',
    'CHA': 'charisma'
  };

  return improvements.flatMap(improvement => {
    const sourceLabel = `${improvement.source}${improvement.sourceType ? ` - ${improvement.sourceType}` : ''}`;
    return (improvement.abilities || []).map(abilityStr => {
      // Parse "CHA: 2" or "WIS: 1"
      const [abbr, valueStr] = abilityStr.split(':').map(s => s.trim());
      const ability = abilityAbbrevToLower[abbr.toUpperCase()];
      const value = parseInt(valueStr, 10);

      if (!ability || isNaN(value)) return null;

      return {
        target: `ability.${ability}`,
        value,
        source: { label: sourceLabel, type: 'ability-score-improvement' }
      };
    }).filter(Boolean);
  });
};

const magicItemRequiresAttunement = (magicItem) => {
  if (!magicItem) return false;

  const rawRequirement = magicItem.requires_attunement ?? magicItem.raw_data?.requires_attunement;
  if (rawRequirement === null || rawRequirement === undefined || rawRequirement === false) return false;

  if (typeof rawRequirement === 'string') {
    const normalized = rawRequirement.trim().toLowerCase();
    if (!normalized || normalized === 'no' || normalized === 'none' || normalized === 'false') {
      return false;
    }
  }

  return Boolean(rawRequirement);
};

const isMagicItemHidden = (magicItem) => {
  if (!magicItem) return false;

  const rawHidden = magicItem.hidden ?? magicItem.raw_data?.hidden;
  if (rawHidden === null || rawHidden === undefined) return false;
  if (rawHidden === true) return true;
  if (rawHidden === false) return false;

  if (typeof rawHidden === 'number') return rawHidden === 1;

  if (typeof rawHidden === 'string') {
    const normalized = rawHidden.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  return Boolean(rawHidden);
};

// Helper to get bonuses for a specific ability
const getAbilityBonuses = (allBonuses = [], abilityName) => {
  const targetKey = `ability.${abilityName}`;
  return allBonuses.filter(bonus => bonus.target === targetKey);
};

const TAB_ORDER = ['bio', 'abilities', 'skills', 'actions', 'spells', 'inventory', 'features', 'creatures'];
const FEATURE_DESCRIPTION_LIMIT = 240;
const DEFAULT_FILTERS = ['Weapons', 'Armour', 'Magic', 'Gear', 'Trinkets'];

const RARITY_ORDER = {
  'legendary': 0,
  'very rare': 1,
  'rare': 2,
  'uncommon': 3,
  'common': 4,
  'unknown': 5
};

/**
 * Check if character is proficient with a weapon
 * 
 * Rules:
 * 1. Everyone is proficient with Simple weapons
 * 2. Martial weapons require specific class proficiency:
 *    - Full Martial: Barbarian, Fighter, Paladin, Ranger
 *    - Partial Martial (Rogue): Light or Finesse property weapons
 *    - Partial Martial (Monk): Light property weapons
 * 
 * @param {Object} weapon - The weapon item (equipment object with raw_data)
 * @param {Object} character - The character object with classes array
 * @returns {boolean} - True if proficient, false otherwise
 */
const isWeaponProficient = (weapon, character) => {
  if (!weapon || !character) return false;

  const normalizeToken = (value) => String(value || '')
    .toLowerCase()
    .replace(/\+\d+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const additionalWeaponTokens = (() => {
    const raw = character?.weapons;
    if (!raw) return [];

    const values = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(/[;,]/)
        : [];

    return values
      .flatMap((entry) => {
        if (typeof entry === 'string') return [entry];
        if (entry && typeof entry === 'object') {
          return [entry.name, entry.weapon, entry.index].filter(Boolean);
        }
        return [];
      })
      .map(normalizeToken)
      .filter(Boolean);
  })();
  
  const weaponType = weapon.type || '';
  const isMartial = weaponType.includes('Martial');
  const isSimple = !isMartial;

  const weaponName = normalizeToken(
    weapon.name
      || weapon.raw_data?.name
      || weapon.raw_data?.index
      || ''
  );

  if (additionalWeaponTokens.some((token) => token === weaponName)) {
    return true;
  }

  if (isMartial && additionalWeaponTokens.some((token) => ['martial weapon', 'martial weapons'].includes(token))) {
    return true;
  }

  if (isSimple && additionalWeaponTokens.some((token) => ['simple weapon', 'simple weapons'].includes(token))) {
    return true;
  }
  
  // Everyone is proficient with Simple weapons
  if (!isMartial) return true;
  
  // Check for Martial proficiency from classes
  const characterClasses = character.classes || [];
  const classNames = characterClasses.map(c => c.definition?.name || c.class || '');
  
  // Full Martial proficiency classes
  const fullMartialClasses = ['Barbarian', 'Fighter', 'Paladin', 'Ranger'];
  if (classNames.some(name => fullMartialClasses.includes(name))) {
    return true;
  }
  
  // Partial Martial proficiency: Rogue and Monk
  const hasRogue = classNames.includes('Rogue');
  const hasMonk = classNames.includes('Monk');
  
  if (hasRogue || hasMonk) {
    const properties = weapon.raw_data?.properties || [];
    const propertyNames = properties.map(p => p.name || p);
    
    const hasLight = propertyNames.includes('Light');
    const hasFinesse = propertyNames.includes('Finesse');
    
    // Monk: proficient with Light Martial weapons
    if (hasMonk && hasLight) return true;
    
    // Rogue: proficient with Light or Finesse Martial weapons
    if (hasRogue && (hasLight || hasFinesse)) return true;
  }
  
  return false;
};

/**
 * Armor proficiency levels (hierarchical)
 * Higher levels include all lower levels
 */
const ARMOR_PROFICIENCY_LEVELS = {
  none: 0,
  light: 1,
  medium: 2,
  heavy: 3
};

/**
 * Get base armor proficiency level from character classes
 * 
 * @param {Object} character - Character object with classes array
 * @returns {number} - Proficiency level (0=none, 1=light, 2=medium, 3=heavy)
 */
const getBaseArmorProficiency = (character) => {
  if (!character?.classes) return ARMOR_PROFICIENCY_LEVELS.none;
  
  const classNames = character.classes.map(c => c.definition?.name || c.class || '');
  
  // Heavy armor proficiency (includes all lower)
  if (classNames.some(name => ['Fighter', 'Paladin'].includes(name))) {
    return ARMOR_PROFICIENCY_LEVELS.heavy;
  }
  
  // Medium armor proficiency (includes light)
  if (classNames.some(name => ['Barbarian', 'Cleric', 'Ranger'].includes(name))) {
    return ARMOR_PROFICIENCY_LEVELS.medium;
  }
  
  // Light armor proficiency only
  if (classNames.some(name => ['Bard', 'Druid', 'Rogue', 'Warlock'].includes(name))) {
    return ARMOR_PROFICIENCY_LEVELS.light;
  }
  
  // No armor proficiency
  return ARMOR_PROFICIENCY_LEVELS.none;
};

/**
 * Get base shield proficiency from character classes
 * 
 * @param {Object} character - Character object with classes array
 * @returns {boolean} - True if proficient with shields
 */
const getBaseShieldProficiency = (character) => {
  if (!character?.classes) return false;
  
  const classNames = character.classes.map(c => c.definition?.name || c.class || '');
  
  // Classes with shield proficiency
  return classNames.some(name => 
    ['Barbarian', 'Cleric', 'Druid', 'Fighter', 'Paladin', 'Ranger'].includes(name)
  );
};

/**
 * Check armor proficiency with bonus engine extensibility
 * 
 * @param {Object} armor - Armor equipment object
 * @param {Object} character - Character object
 * @param {Array} features - Character features (for bonus engine checks)
 * @returns {boolean} - True if proficient
 */
const isArmorProficient = (armor, character, features = [], featureStates = {}) => {
  if (!armor || !character) return false;
  
  // Get armor type level
  const armorTypeId = armor.armorTypeId;
  let armorLevel = ARMOR_PROFICIENCY_LEVELS.none;
  
  if (armorTypeId === 1) armorLevel = ARMOR_PROFICIENCY_LEVELS.light;
  else if (armorTypeId === 2) armorLevel = ARMOR_PROFICIENCY_LEVELS.medium;
  else if (armorTypeId === 3) armorLevel = ARMOR_PROFICIENCY_LEVELS.heavy;
  else {
    // Fallback: detect from armor_class properties
    const rawData = armor.raw_data;
    if (rawData?.armor_class) {
      const { dex_bonus, max_bonus } = rawData.armor_class;
      if (!dex_bonus) armorLevel = ARMOR_PROFICIENCY_LEVELS.heavy;
      else if (max_bonus !== undefined && max_bonus !== null) armorLevel = ARMOR_PROFICIENCY_LEVELS.medium;
      else armorLevel = ARMOR_PROFICIENCY_LEVELS.light;
    }
  }
  
  // Get base proficiency from class
  let proficiencyLevel = getBaseArmorProficiency(character);
  
  // Check for feature-granted armor proficiency upgrades
  for (const feature of features) {
    const benefits = getActiveFeatureBenefits(feature, {
      activeStance: feature?.id ? featureStates.activeStances?.[feature.id] : null,
      selectedChoice: feature?.id ? featureStates.activeSelections?.[feature.id] : null,
    });

    for (const benefit of benefits) {
      if (benefit.type === 'armor_proficiency' && benefit.level) {
        const grantedLevel = ARMOR_PROFICIENCY_LEVELS[benefit.level] || 0;
        proficiencyLevel = Math.max(proficiencyLevel, grantedLevel);
      }
    }
  }
  
  // Character is proficient if their level meets or exceeds the armor level
  return proficiencyLevel >= armorLevel;
};

/**
 * Check shield proficiency with bonus engine extensibility
 * 
 * @param {Object} character - Character object
 * @param {Array} features - Character features (for bonus engine checks)
 * @returns {boolean} - True if proficient
 */
const isShieldProficient = (character, features = [], featureStates = {}) => {
  if (!character) return false;
  
  // Get base shield proficiency from class
  let isProficient = getBaseShieldProficiency(character);
  
  // Check for feature-granted shield proficiency
  for (const feature of features) {
    const benefits = getActiveFeatureBenefits(feature, {
      activeStance: feature?.id ? featureStates.activeStances?.[feature.id] : null,
      selectedChoice: feature?.id ? featureStates.activeSelections?.[feature.id] : null,
    });

    for (const benefit of benefits) {
      if (benefit.type === 'shield_proficiency' && benefit.value === true) {
        isProficient = true;
        break;
      }
    }
    if (isProficient) break;
  }
  
  return isProficient;
};

const sortItemsByRarityAndName = (items) => {
  return [...items].sort((a, b) => {
    // Get rarity values
    const rarityA = (a.magic_item?.rarity || a.magic_item?.raw_data?.rarity || 'unknown').toLowerCase();
    const rarityB = (b.magic_item?.rarity || b.magic_item?.raw_data?.rarity || 'unknown').toLowerCase();
    
    const orderA = RARITY_ORDER[rarityA] ?? 5;
    const orderB = RARITY_ORDER[rarityB] ?? 5;
    
    // Sort by rarity first
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    // Then alphabetically by name
    const nameA = (a.magic_item?.name || a.equipment?.name || a.trinket_name || '').toLowerCase();
    const nameB = (b.magic_item?.name || b.equipment?.name || b.trinket_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
};

const getItemFilter = (item) => {
  if (!item) return 'Gear';
  if (item.magic_item) return 'Magic';
  if (item.trinket_name) return 'Trinkets';
  if (item.equipment?.type?.toLowerCase().includes('weapon')) return 'Weapons';
  if (item.equipment?.type?.toLowerCase().includes('armor')) return 'Armour';
  return 'Gear';
};

const getInventoryEquipmentData = (item) => {
  if (!item) return null;
  return item.equipment || item.magic_item?.equipment || null;
};

const getCustomPockets = (items = []) => {
  // If items is an array of pocket strings, return them filtered
  if (items.length > 0 && typeof items[0] === 'string') {
    return items.filter(p => !DEFAULT_FILTERS.includes(p));
  }
  // Otherwise treat as inventory items
  const pockets = new Set();
  items.forEach((item) => {
    if (item.pocket) pockets.add(item.pocket);
  });
  return [...pockets].sort();
};

const normalizeBenefitsInput = (benefits) => {
  if (Array.isArray(benefits)) return benefits;
  if (benefits && typeof benefits === 'object' && Array.isArray(benefits.benefits)) {
    return benefits.benefits;
  }
  if (benefits && typeof benefits === 'object' && benefits.type) return [benefits];
  if (typeof benefits === 'string') {
    try {
      const parsed = JSON.parse(benefits);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.benefits)) return parsed.benefits;
      if (parsed && typeof parsed === 'object' && parsed.type) return [parsed];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeBenefitType = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const getSelectBenefit = (feature) => {
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  return benefits.find((benefit) => normalizeBenefitType(benefit?.type) === 'select') || null;
};

const getFeatureSelectChoices = (feature) => {
  const selectBenefit = getSelectBenefit(feature);
  const selectConfig = selectBenefit?.select;
  if (!selectConfig || typeof selectConfig !== 'object') return [];

  const choices = Array.isArray(selectConfig.choices)
    ? selectConfig.choices.filter((choice) => typeof choice === 'string' && choice.trim())
    : [];

  return choices.map((choice) => ({
    name: choice,
    benefits: normalizeBenefitsInput(selectConfig[choice]),
  }));
};

const getSelectedFeatureBenefits = (feature, selectedChoice) => {
  if (!selectedChoice) return [];

  const selectChoices = getFeatureSelectChoices(feature);
  const matchingChoice = selectChoices.find((choice) => choice.name === selectedChoice);
  return matchingChoice?.benefits || [];
};

const evaluatePoolFormula = (formula, level, abilityModifiers = {}) => {
  if (!formula || typeof formula !== 'string') return 0;

  let normalizedFormula = formula.toLowerCase().trim();
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

  abilities.forEach((ability) => {
    const value = Number(abilityModifiers?.[ability]) || 0;
    const pattern = new RegExp(`\\b${ability}\\b`, 'gi');
    normalizedFormula = normalizedFormula.replace(pattern, value.toString());
  });

  normalizedFormula = normalizedFormula.replace(/\blevel\b/gi, String(level || 1));
  if (abilityModifiers?.proficiency !== undefined) {
    normalizedFormula = normalizedFormula.replace(/\bproficiency\b/gi, String(Number(abilityModifiers.proficiency) || 0));
  }
  if (abilityModifiers?.proficiency_bonus !== undefined) {
    normalizedFormula = normalizedFormula.replace(/\bproficiency_bonus\b/gi, String(Number(abilityModifiers.proficiency_bonus) || 0));
  }

  let roundingMode = null;
  const roundingMatch = normalizedFormula.match(/^(.*?)(ru|rd)\s*$/i);
  if (roundingMatch) {
    normalizedFormula = roundingMatch[1].trim();
    roundingMode = roundingMatch[2].toLowerCase();
  }

  try {
    if (!/^[\d+\-*/().\s]+$/.test(normalizedFormula)) return 0;
    const result = Function(`"use strict"; return (${normalizedFormula})`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      const rounded = roundingMode === 'ru'
        ? Math.ceil(result)
        : roundingMode === 'rd'
          ? Math.floor(result)
          : Math.floor(result);
      return Math.max(0, rounded);
    }
  } catch {
    return 0;
  }

  return 0;
};

const getFeaturePool = (feature, characterLevel, abilityModifiers) => {
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const poolBenefit = benefits.find((benefit) => String(benefit?.type || '').toLowerCase().trim() === 'pool');
  if (!poolBenefit) return null;

  let poolMax = 0;
  const valueMode = String(poolBenefit?.value || '').toLowerCase().trim();
  if ((valueMode === 'formula' || (!valueMode && poolBenefit?.formula)) && poolBenefit?.formula) {
    poolMax = evaluatePoolFormula(poolBenefit.formula, characterLevel, abilityModifiers);
  } else {
    poolMax = Math.max(0, Number(poolBenefit?.value) || 0);
  }

  if (poolMax <= 0) return null;

  const rawPoolType =
    poolBenefit?.pool_type ??
    poolBenefit?.poolType ??
    poolBenefit?.pooltype ??
    null;

  const rawBarrierFill =
    poolBenefit?.barrier_fill ??
    poolBenefit?.barrierFill ??
    poolBenefit?.barrierfill ??
    null;

  return {
    name: poolBenefit?.name || null,
    base: Math.max(0, Math.floor(Number(poolBenefit?.base) || 0)),
    max: poolMax,
    poolType: String(rawPoolType || '').toLowerCase().trim() || null,
    barrierFill: String(rawBarrierFill || '').toLowerCase().trim() || null,
  };
};

const getFeatureGauge = (feature, characterLevel, abilityModifiers, maxHP = 0) => {
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const gaugeBenefit = benefits.find((benefit) => String(benefit?.type || '').toLowerCase().trim() === 'gauge');
  if (!gaugeBenefit) return null;

  const thresholdRaw = gaugeBenefit?.threshold ?? gaugeBenefit?.trigger ?? 'half_hp_max';
  let threshold = 0;

  if (typeof thresholdRaw === 'number') {
    threshold = Math.max(1, Math.floor(thresholdRaw));
  } else {
    const thresholdToken = String(thresholdRaw || '').toLowerCase().trim();
    if (['half_hp_max', 'half_max_hp', 'hp_max_half', 'half_hp'].includes(thresholdToken)) {
      threshold = Math.max(1, Math.ceil((Number(maxHP) || 0) / 2));
    } else if (thresholdToken === 'formula' && gaugeBenefit?.formula) {
      threshold = Math.max(1, evaluatePoolFormula(gaugeBenefit.formula, characterLevel, abilityModifiers));
    } else {
      const numericThreshold = Number(thresholdToken);
      threshold = Number.isFinite(numericThreshold) ? Math.max(1, Math.floor(numericThreshold)) : 0;
    }
  }

  if (!threshold || threshold <= 0) return null;

  const maxCharges = 1;

  const timeoutSeconds = Math.max(
    0,
    Math.floor(
      Number(
        gaugeBenefit?.timeout_seconds
        ?? gaugeBenefit?.reset_after_seconds
        ?? gaugeBenefit?.decay_seconds
        ?? 60
      ) || 0
    )
  );

  return {
    name: gaugeBenefit?.name || feature?.name || 'Limit Gauge',
    threshold,
    maxCharges,
    timeoutSeconds,
    autoFillOnDamage: gaugeBenefit?.auto_fill_on_damage !== false,
  };
};

const normalizeGaugeSnapshot = (snapshot, gaugeConfig) => {
  const maxCharges = 1;
  const threshold = Math.max(1, Number(gaugeConfig?.threshold) || 1);

  if (!snapshot || typeof snapshot !== 'object') {
    return { value: 0, charges: 0, lastProgressAt: Date.now() };
  }

  const value = Math.max(0, Math.min(threshold, Math.floor(Number(snapshot.value) || 0)));
  const charges = Math.max(0, Math.min(maxCharges, Math.floor(Number(snapshot.charges) || 0)));
  const lastProgressAt = Number.isFinite(Number(snapshot.lastProgressAt))
    ? Number(snapshot.lastProgressAt)
    : Date.now();

  return { value, charges, lastProgressAt };
};

const interpolateFeatureText = (text, feature, characterLevel = 1, proficiencyBonus = 0, abilityModifiers = {}, preferredBenefitType = null) => {
  const template = typeof text === 'string' ? text : '';
  if (!template) return '';

  let result = template;
  const level = Math.max(1, Number(characterLevel) || 1);

  const modifierMap = {
    strength: Number.isFinite(abilityModifiers?.strength) ? abilityModifiers.strength : 0,
    dexterity: Number.isFinite(abilityModifiers?.dexterity) ? abilityModifiers.dexterity : 0,
    constitution: Number.isFinite(abilityModifiers?.constitution) ? abilityModifiers.constitution : 0,
    intelligence: Number.isFinite(abilityModifiers?.intelligence) ? abilityModifiers.intelligence : 0,
    wisdom: Number.isFinite(abilityModifiers?.wisdom) ? abilityModifiers.wisdom : 0,
    charisma: Number.isFinite(abilityModifiers?.charisma) ? abilityModifiers.charisma : 0,
  };

  result = result.replaceAll('${proficiency}', String(proficiencyBonus || 0));
  result = result.replaceAll('${level}', String(level));

  Object.entries(modifierMap).forEach(([ability, modifier]) => {
    result = result.replaceAll(`\${${ability}}`, String(modifier));
    result = result.replaceAll(`\${${ability}_mod}`, String(modifier >= 0 ? `+${modifier}` : modifier));
  });

  const abilityAliasMap = {
    str: 'strength',
    strength: 'strength',
    dex: 'dexterity',
    dexterity: 'dexterity',
    con: 'constitution',
    constitution: 'constitution',
    int: 'intelligence',
    intelligence: 'intelligence',
    wis: 'wisdom',
    wisdom: 'wisdom',
    cha: 'charisma',
    charisma: 'charisma',
  };

  const computeSaveDC = (abilityKey = 'constitution') => {
    const normalizedAbility = abilityAliasMap[String(abilityKey || '').toLowerCase().trim()] || 'constitution';
    const mod = Number(modifierMap?.[normalizedAbility]) || 0;
    const pb = Number(proficiencyBonus) || 0;
    return 8 + pb + mod;
  };

  result = result.replace(/\$\{dc:([a-z_]+)\}/gi, (_, abilityToken) => String(computeSaveDC(abilityToken)));
  result = result.replaceAll('${dc}', String(computeSaveDC('constitution')));
  ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].forEach((ability) => {
    result = result.replaceAll(`\${dc_${ability}}`, String(computeSaveDC(ability)));
  });

  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const normalizedPreferredType = preferredBenefitType ? normalizeBenefitType(preferredBenefitType) : null;

  const pickBenefitWithField = (fieldName) => {
    const hasField = (benefit) => {
      const fieldValue = benefit?.[fieldName];
      return typeof fieldValue === 'string' ? fieldValue.trim().length > 0 : fieldValue !== null && fieldValue !== undefined;
    };

    if (normalizedPreferredType) {
      const typed = benefits.find((b) => hasField(b) && normalizeBenefitType(b?.type) === normalizedPreferredType);
      if (typed) return typed;

      const untyped = benefits.find((b) => hasField(b) && !b?.type);
      if (untyped) return untyped;
    }

    return benefits.find((b) => hasField(b));
  };

  if (result.includes('${formula}')) {
    const formulaSource = pickBenefitWithField('formula');
    const formulaValue = formulaSource?.formula
      ? evaluatePoolFormula(formulaSource.formula, level, modifierMap)
      : 0;
    result = result.replaceAll('${formula}', String(formulaValue));
  }

  if (result.includes('${die}')) {
    const dieSource = pickBenefitWithField('die');
    result = result.replaceAll('${die}', typeof dieSource?.die === 'string' ? dieSource.die : '');
  }

  if (result.includes('${value}')) {
    const valueSource = pickBenefitWithField('value') || pickBenefitWithField('formula');
    let resolvedValue = '0';

    if (valueSource) {
      if (typeof valueSource.value === 'number') {
        resolvedValue = String(valueSource.value);
      } else if (typeof valueSource.value === 'string' && valueSource.value.trim().toLowerCase() === 'formula' && valueSource.formula) {
        resolvedValue = String(evaluatePoolFormula(valueSource.formula, level, modifierMap));
      } else if (typeof valueSource.value === 'string' && valueSource.value.trim()) {
        resolvedValue = valueSource.value;
      } else if (typeof valueSource.formula === 'string' && valueSource.formula.trim()) {
        resolvedValue = String(evaluatePoolFormula(valueSource.formula, level, modifierMap));
      }
    }

    result = result.replaceAll('${value}', resolvedValue);
  }

  return result;
};

const isFeatureToggleIgnored = (target) => {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('.uses-counter, .uses-boxes, .uses-btn, .use-box, .uses-reset, .pool-tracker, .pool-btn, .pool-input, .pool-reset, .stance-selector, .stance-option, .feature-select, .feature-select-option'));
};

/**
 * Stance state management helpers
 * Stances are mutually exclusive toggle systems stored per character+feature in localStorage
 */
const getActiveStance = (characterId, featureId) => {
  if (!characterId || !featureId) return null;
  try {
    const key = `stance_${characterId}_${featureId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const setActiveStance = (characterId, featureId, stanceName) => {
  if (!characterId || !featureId) return;
  try {
    const key = `stance_${characterId}_${featureId}`;
    if (stanceName) {
      localStorage.setItem(key, JSON.stringify(stanceName));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors (private mode or quota exceeded)
  }
};

const getStanceBenefits = (feature, activeStance) => {
  if (!feature || !activeStance) return [];
  
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const stanceBenefit = benefits.find(b => b.type === 'stance');
  
  if (!stanceBenefit || !Array.isArray(stanceBenefit.stances)) return [];
  
  const stance = stanceBenefit.stances.find(s => s.name === activeStance);
  return stance?.benefits || [];
};

const getActiveFeatureBenefits = (feature, featureState = {}) => {
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const activeStanceBenefits = getStanceBenefits(feature, featureState.activeStance);
  const selectedChoiceBenefits = getSelectedFeatureBenefits(feature, featureState.selectedChoice);

  return [
    ...benefits,
    ...activeStanceBenefits,
    ...selectedChoiceBenefits,
  ];
};

const hasShieldIgnoreBenefit = (features = [], featureStates = {}) => {
  return features.some((feature) => {
    const featureId = feature?.id;
    const activeBenefits = getActiveFeatureBenefits(feature, {
      activeStance: featureId ? featureStates.activeStances?.[featureId] : null,
      selectedChoice: featureId ? featureStates.activeSelections?.[featureId] : null,
    });

    return activeBenefits.some((benefit) => {
      if (normalizeBenefitType(benefit?.type) !== 'ac_bonus') return false;
      return benefit?.shield_ignore === true || benefit?.shieldIgnore === true;
    });
  });
};

function FeatureDescriptionBlock({ featureId, description, expanded, onToggle }) {
  if (!description) return null;
  const safeId = `feature-desc-${String(featureId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const isLong = description.length > FEATURE_DESCRIPTION_LIMIT;
  const isExpanded = expanded || !isLong;

  return (
    <div className={`feature-description-wrap ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="feature-description-body" id={safeId}>
        {parseFeatureDescription(description)}
      </div>
      {isLong && (
        <button
          type="button"
          className="feature-description-toggle"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(featureId);
          }}
          aria-label={isExpanded ? 'Collapse description' : 'Expand description'}
          aria-expanded={isExpanded}
          aria-controls={safeId}
        >
          <svg className="feature-description-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function CharacterSheet() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'admin@candlekeep.sc';

  const {
    character,
    characters,
    selectedCharacterId,
    setSelectedCharacterId,
    loading,
    relatedLoading,
    error,
    refetchInventory,
    refetchSpells,
    updateCharacterFields
  } = useCharacter({ user, isAdmin });
  const [activeTab, setActiveTab] = useState('bio'); // bio, abilities, skills, actions, spells, inventory, features, creatures
  const activeTabRef = useRef(activeTab);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false
  });

  // HP management state
  const [currentHP, setCurrentHP] = useState(null);
  const [tempHP, setTempHP] = useState(0);
  const [maxHPModifier, setMaxHPModifier] = useState(0);
  const [deathSaveSuccesses, setDeathSaveSuccesses] = useState(0);
  const [deathSaveFailures, setDeathSaveFailures] = useState(0);
  const [isHPModalOpen, setIsHPModalOpen] = useState(false);
  const [damageInput, setDamageInput] = useState('');
  const [isPortraitHighlighted, setIsPortraitHighlighted] = useState(true);
  const [isLongRestConfirmOpen, setIsLongRestConfirmOpen] = useState(false);
  const [longRestVersion, setLongRestVersion] = useState(0);

  // Conditions modal state
  const [isConditionsModalOpen, setIsConditionsModalOpen] = useState(false);
  const [activeConditions, setActiveConditions] = useState([]);
  const [exhaustionLevel, setExhaustionLevel] = useState(0);
  const [conditionsLoaded, setConditionsLoaded] = useState(false);

  const handleToggleCondition = (conditionId) => {
    setActiveConditions(prev =>
      prev.includes(conditionId)
        ? prev.filter(c => c !== conditionId)
        : [...prev, conditionId]
    );
  };

  // Stats Inspector Modal state
  const [inspectorState, setInspectorState] = useState({
    isOpen: false,
    selectedAbility: null,
    baseValue: 10,
    bonuses: [],
    abilityCustomModifiers: {}, // { ability: [{ source, value }, ...] }
    abilityCustomOverrides: {} // { ability: value }
  });

  // AC Inspector Modal state
  const [acInspectorOpen, setACInspectorOpen] = useState(false);
  const [acCustomModifiers, setACCustomModifiers] = useState([]);
  const [acCustomOverride, setACCustomOverride] = useState(null);

  // Inventory modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [showNewPocketModal, setShowNewPocketModal] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [newPocketItemId, setNewPocketItemId] = useState(null);
  const [activePocket, setActivePocket] = useState('all');

  // Feature uses & expanded descriptions (shared between FeaturesTab and ActionsTab)
  const [usesState, setUsesState] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [usesLoaded, setUsesLoaded] = useState(false);

  // Feature pool trackers (e.g., Lay on Hands)
  const [poolState, setPoolState] = useState({});
  const [poolLoaded, setPoolLoaded] = useState(false);

  // Spell uses (shared between SpellsTab and ActionsTab)
  const [spellUses, setSpellUses] = useState({});
  const [spellUsesLoaded, setSpellUsesLoaded] = useState(false);

  // Active stances for stance-type features (stored in localStorage)
  const [activeStances, setActiveStances] = useState({});
  const [activeStancesLoaded, setActiveStancesLoaded] = useState(false);

  // Active selections for select-type features (stored in localStorage)
  const [activeFeatureSelections, setActiveFeatureSelections] = useState({});
  const [activeFeatureSelectionsLoaded, setActiveFeatureSelectionsLoaded] = useState(false);

  // Conditions localStorage management
  const conditionsStorageKey = character?.id
    ? `conditions:${character.id}`
    : null;

  useEffect(() => {
    if (!conditionsStorageKey) {
      setActiveConditions([]);
      setExhaustionLevel(0);
      setConditionsLoaded(false);
      return;
    }

    try {
      const stored = localStorage.getItem(conditionsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          const storedConditions = Array.isArray(parsed.activeConditions)
            ? parsed.activeConditions.filter(c => typeof c === 'string')
            : [];
          const storedExhaustion = Number.isInteger(parsed.exhaustionLevel)
            ? Math.max(0, Math.min(6, parsed.exhaustionLevel))
            : 0;

          setActiveConditions(storedConditions);
          setExhaustionLevel(storedExhaustion);
          setConditionsLoaded(true);
          return;
        }
      }
    } catch {
      // Ignore storage read/parse errors (private mode or corrupted data)
    }

    setActiveConditions([]);
    setExhaustionLevel(0);
    setConditionsLoaded(true);
  }, [conditionsStorageKey]);

  useEffect(() => {
    if (!conditionsStorageKey) return;
    if (!conditionsLoaded) return;

    try {
      localStorage.setItem(
        conditionsStorageKey,
        JSON.stringify({
          activeConditions,
          exhaustionLevel,
        })
      );
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [activeConditions, exhaustionLevel, conditionsStorageKey, conditionsLoaded]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!emblaApi) return;
    const handleSelect = () => {
      const index = emblaApi.selectedScrollSnap();
      const nextTab = TAB_ORDER[index];
      if (nextTab && nextTab !== activeTabRef.current) {
        setActiveTab(nextTab);
      }
    };
    emblaApi.on('select', handleSelect);
    emblaApi.on('reInit', handleSelect);
    handleSelect();
    return () => {
      emblaApi.off('select', handleSelect);
      emblaApi.off('reInit', handleSelect);
    };
  }, [emblaApi]);

  // Feature uses localStorage management
  const usesStorageKey = character?.id
    ? `feature-uses:${character.id}`
    : null;

  useEffect(() => {
    if (!usesStorageKey) return;
    try {
      const stored = localStorage.getItem(usesStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setUsesState(parsed);
          setUsesLoaded(true);
          return;
        }
      }
      setUsesState({});
    } catch {
      setUsesState({});
    }
    setUsesLoaded(true);
  }, [usesStorageKey]);

  useEffect(() => {
    if (!usesStorageKey) return;
    if (!usesLoaded) return;
    try {
      localStorage.setItem(usesStorageKey, JSON.stringify(usesState));
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [usesState, usesStorageKey, usesLoaded]);

  // Spell uses localStorage management
  const spellUsesStorageKey = character?.id
    ? `spellUses:${character.id}`
    : null;

  useEffect(() => {
    if (!spellUsesStorageKey) return;
    try {
      const stored = localStorage.getItem(spellUsesStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setSpellUses(parsed);
          setSpellUsesLoaded(true);
          return;
        }
      }
      setSpellUses({});
    } catch {
      setSpellUses({});
    }
    setSpellUsesLoaded(true);
  }, [spellUsesStorageKey]);

  useEffect(() => {
    if (!spellUsesStorageKey) return;
    if (!spellUsesLoaded) return;
    try {
      localStorage.setItem(spellUsesStorageKey, JSON.stringify(spellUses));
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [spellUses, spellUsesStorageKey, spellUsesLoaded]);

  const handleUsesChange = (featureId, newUses) => {
    setUsesState(prev => ({ ...prev, [featureId]: newUses }));
  };

  // Feature pools localStorage management
  const poolStorageKey = character?.id
    ? `feature-pools:${character.id}`
    : null;

  useEffect(() => {
    if (!poolStorageKey) return;
    try {
      const stored = localStorage.getItem(poolStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setPoolState(parsed);
          setPoolLoaded(true);
          return;
        }
      }
      setPoolState({});
    } catch {
      setPoolState({});
    }
    setPoolLoaded(true);
  }, [poolStorageKey]);

  useEffect(() => {
    if (!poolStorageKey || !poolLoaded) return;
    try {
      localStorage.setItem(poolStorageKey, JSON.stringify(poolState));
    } catch {
      // Ignore storage write errors
    }
  }, [poolStorageKey, poolLoaded, poolState]);

  const handlePoolChange = (poolId, newValue) => {
    setPoolState((prev) => ({ ...prev, [poolId]: newValue }));
  };

  const limitGaugeTimeoutConfigs = useMemo(() => {
    if (!character) return [];

    const entries = [];
    const fallbackMods = {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    };
    const level = Math.max(1, Number(character?.level) || 1);
    const maxHP = Math.max(1, Number(character?.max_hp) || 1);

    const collectGaugeConfig = (feature, featureId) => {
      if (!feature || !featureId) return;
      const gauge = getFeatureGauge(feature, level, fallbackMods, maxHP);
      if (!gauge) return;
      entries.push({
        id: `${featureId}-gauge`,
        timeoutSeconds: gauge.timeoutSeconds,
        threshold: gauge.threshold,
        maxCharges: gauge.maxCharges,
      });
    };

    (character.features || []).forEach((feature, idx) => {
      const featureId = feature?.id || `feature-${feature?.name || idx}`;
      collectGaugeConfig(feature, featureId);
    });

    (character.feats || []).forEach((featEntry, idx) => {
      const joinedFeat = getJoinedFeat(featEntry);
      const feat = joinedFeat || featEntry;
      if (!feat) return;
      const featId = featEntry?.id || feat.id || `feat-${feat.name || idx}`;
      collectGaugeConfig(feat, featId);
    });

    return entries;
  }, [character]);

  useEffect(() => {
    if (!limitGaugeTimeoutConfigs.length) return undefined;

    const timer = window.setInterval(() => {
      const now = Date.now();

      setPoolState((prev) => {
        let changed = false;
        const next = { ...prev };

        limitGaugeTimeoutConfigs.forEach((gauge) => {
          if (!gauge.timeoutSeconds || gauge.timeoutSeconds <= 0) return;

          const snapshot = normalizeGaugeSnapshot(prev?.[gauge.id], gauge);
          if (snapshot.value <= 0) return;

          const staleMs = gauge.timeoutSeconds * 1000;
          if ((now - snapshot.lastProgressAt) < staleMs) return;

          next[gauge.id] = normalizeGaugeSnapshot({
            ...snapshot,
            value: 0,
            lastProgressAt: now,
          }, gauge);
          changed = true;
        });

        return changed ? next : prev;
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [limitGaugeTimeoutConfigs]);

  const handleSpellUsesChange = (spellId, newUses) => {
    setSpellUses(prev => ({ ...prev, [spellId]: newUses }));
  };

  const performLongRest = () => {
    if (!character) return;

    // Reset HP state
    setCurrentHP(effectiveDisplayMaxHP);
    setTempHP(0);

    // Reset feature uses and spell uses tracked in CharacterSheet
    setUsesState({});
    setSpellUses({});

    // Clear persisted states so all tabs rehydrate cleanly
    if (character.id) {
      localStorage.removeItem(`hp_state_${character.id}`);
      localStorage.removeItem(`feature-uses:${character.id}`);
      localStorage.removeItem(`spellUses:${character.id}`);
      localStorage.removeItem(`spellSlotsUsed:${character.id}`);

      // Reset magic item charges/uses
      (character.inventory || []).forEach((invItem) => {
        if (invItem?.id) {
          localStorage.removeItem(`item_uses_${character.id}_${invItem.id}`);
        }
      });
    }
    if (character.name) {
      localStorage.removeItem(`spellSlotsUsed:${character.name}`);
    }

    // Signal SpellsTab to reset its internal slot state immediately
    setLongRestVersion((prev) => prev + 1);

    // Signal inventory and item modal to reset in-memory item use counters
    window.dispatchEvent(new CustomEvent('longRestPerformed', {
      detail: { characterId: character.id }
    }));

    setIsLongRestConfirmOpen(false);
  };

  // Active stances localStorage management
  const stancesStorageKey = character?.id
    ? `feature-stances:${character.id}`
    : null;

  useEffect(() => {
    if (!stancesStorageKey) return;
    try {
      const stored = localStorage.getItem(stancesStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setActiveStances(parsed);
          setActiveStancesLoaded(true);
          return;
        }
      }
      setActiveStances({});
    } catch {
      setActiveStances({});
    }
    setActiveStancesLoaded(true);
  }, [stancesStorageKey]);

  useEffect(() => {
    if (!stancesStorageKey || !activeStancesLoaded) return;
    try {
      localStorage.setItem(stancesStorageKey, JSON.stringify(activeStances));
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [activeStances, stancesStorageKey, activeStancesLoaded]);

  const handleStanceChange = (featureId, stanceName) => {
    setActiveStances(prev => {
      return { ...prev, [featureId]: stanceName };
    });
  };

  // Active feature-select choices localStorage management
  const featureSelectionsStorageKey = character?.id
    ? `feature-selects:${character.id}`
    : null;

  useEffect(() => {
    if (!featureSelectionsStorageKey) return;
    try {
      const stored = localStorage.getItem(featureSelectionsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setActiveFeatureSelections(parsed);
          setActiveFeatureSelectionsLoaded(true);
          return;
        }
      }
      setActiveFeatureSelections({});
    } catch {
      setActiveFeatureSelections({});
    }
    setActiveFeatureSelectionsLoaded(true);
  }, [featureSelectionsStorageKey]);

  useEffect(() => {
    if (!featureSelectionsStorageKey || !activeFeatureSelectionsLoaded) return;
    try {
      localStorage.setItem(featureSelectionsStorageKey, JSON.stringify(activeFeatureSelections));
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [activeFeatureSelections, featureSelectionsStorageKey, activeFeatureSelectionsLoaded]);

  const handleFeatureSelectionChange = (featureId, choiceName) => {
    setActiveFeatureSelections((prev) => ({
      ...prev,
      [featureId]: choiceName,
    }));
  };

  const handleDescriptionToggle = (featureId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [featureId]: !prev[featureId]
    }));
  };

  const handleBastionStatUpdate = async (statKey, value) => {
    if (!character?.id) return;
    await updateCharacterFields({ [statKey]: value });
  };

  const setActiveTabWithCarousel = (nextTab) => {
    if (!nextTab || nextTab === activeTabRef.current) return;
    const nextIndex = TAB_ORDER.indexOf(nextTab);
    if (emblaApi && nextIndex !== -1) {
      emblaApi.scrollTo(nextIndex);
      return;
    }
    setActiveTab(nextTab);
  };

  // Load custom ability modifiers and overrides from localStorage
  useEffect(() => {
    if (!character?.id) return;
    
    const savedModifiers = localStorage.getItem(`ast_ability_modifiers_${character.id}`);
    if (savedModifiers) {
      try {
        setInspectorState(prev => ({
          ...prev,
          abilityCustomModifiers: JSON.parse(savedModifiers)
        }));
      } catch (e) {
        console.error('Failed to parse saved ability modifiers:', e);
      }
    }

    const savedOverrides = localStorage.getItem(`ast_ability_overrides_${character.id}`);
    if (savedOverrides) {
      try {
        setInspectorState(prev => ({
          ...prev,
          abilityCustomOverrides: JSON.parse(savedOverrides)
        }));
      } catch (e) {
        console.error('Failed to parse saved ability overrides:', e);
      }
    }

    // Load AC custom modifiers and override
    const acModsKey = `ast_ac_modifiers_${character.id}`;
    const acOverrideKey = `ast_ac_override_${character.id}`;
    const acMods = localStorage.getItem(acModsKey);
    const acOver = localStorage.getItem(acOverrideKey);
    
    if (acMods) {
      try {
        setACCustomModifiers(JSON.parse(acMods));
      } catch (e) {
        console.error('Failed to parse AC modifiers:', e);
      }
    }
    
    if (acOver) {
      const parsed = parseInt(acOver, 10);
      if (!isNaN(parsed)) {
        setACCustomOverride(parsed);
      }
    }
  }, [character?.id]);

  // Initialize current HP when character loads
  useEffect(() => {
    if (!character?.id) return;

    // Try to load saved HP state from localStorage (persists across sessions/logout/app close)
    const savedHPState = localStorage.getItem(`hp_state_${character.id}`);
    if (savedHPState) {
      try {
        const {
          currentHP: savedCurrent,
          tempHP: savedTemp,
          maxHPModifier: savedModifier,
          deathSaveSuccesses: savedSuccesses,
          deathSaveFailures: savedFailures,
        } = JSON.parse(savedHPState);
        setCurrentHP(savedCurrent);
        setTempHP(savedTemp ?? 0);
        setMaxHPModifier(savedModifier ?? 0);
        setDeathSaveSuccesses(Math.max(0, Math.min(3, Number(savedSuccesses) || 0)));
        setDeathSaveFailures(Math.max(0, Math.min(3, Number(savedFailures) || 0)));
        return;
      } catch (e) {
        console.error('Failed to parse saved HP state:', e);
      }
    }

    // Otherwise initialize from character data
    if (character?.current_hp !== undefined) {
      setCurrentHP(character.current_hp);
    } else if (character?.max_hp) {
      const level = Math.max(1, Number(character?.level) || 1);
      const conMod = Math.floor(((Number(character?.constitution) || 10) - 10) / 2);
      const effectiveBaseMaxHP = Number(character.max_hp) + (conMod * level);
      setCurrentHP(effectiveBaseMaxHP);
    }
    setTempHP(0);
    setMaxHPModifier(0);
    setDeathSaveSuccesses(0);
    setDeathSaveFailures(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  // Save HP state to localStorage whenever it changes (persists across sessions)
  useEffect(() => {
    if (!character?.id || currentHP === null) return;

    const hpState = {
      currentHP,
      tempHP,
      maxHPModifier,
      deathSaveSuccesses,
      deathSaveFailures,
    };
    localStorage.setItem(`hp_state_${character.id}`, JSON.stringify(hpState));
  }, [character?.id, currentHP, tempHP, maxHPModifier, deathSaveSuccesses, deathSaveFailures]);

  // Recovering to above 0 HP clears death saves.
  useEffect(() => {
    if (currentHP === null || currentHP <= 0) return;
    if (deathSaveSuccesses === 0 && deathSaveFailures === 0) return;
    setDeathSaveSuccesses(0);
    setDeathSaveFailures(0);
  }, [currentHP, deathSaveSuccesses, deathSaveFailures]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isHPModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isHPModalOpen]);

  // Handle character selection (admin only)
  const handleCharacterChange = async (characterId) => {
    try {
      setSelectedCharacterId(characterId);
    } catch (err) {
      console.error('Error selecting character:', err);
    }
  };

  // Calculate proficiency bonus and base abilities BEFORE early returns (needed for hooks)
  const proficiencyBonus = character?.level ? Math.ceil(character.level / 4) + 1 : 2;
  const abilityModifier = (score) => Math.floor((score - 10) / 2);
  
  // Memoize baseAbilities to avoid unnecessary re-renders in dependent hooks
  const baseAbilities = useMemo(() => {
    if (!character) {
      return {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      };
    }
    return {
      strength: character.strength,
      dexterity: character.dexterity,
      constitution: character.constitution,
      intelligence: character.intelligence,
      wisdom: character.wisdom,
      charisma: character.charisma
    };
  }, [character?.strength, character?.dexterity, character?.constitution, 
      character?.intelligence, character?.wisdom, character?.charisma]);

  const normalizedFeatsForBonuses = (character?.feats || [])
    .map((featEntry) => {
      const joinedFeat = getJoinedFeat(featEntry);
      if (!joinedFeat) {
        console.warn('[CharacterSheet] Feat entry missing joined feat object:', featEntry);
        return null;
      }

      const staticBenefits = normalizeBenefitsInput(joinedFeat.benefits ?? featEntry.benefits ?? []);
      const choiceBenefits = normalizeBenefitsInput(featEntry?.choices);

      return {
        id: featEntry.id || joinedFeat.id || featEntry.feat_id,
        name: joinedFeat.name || featEntry.name || 'Feat',
        benefits: [...staticBenefits, ...choiceBenefits],
        source: featEntry.source || null
      };
    })
    .filter(Boolean);

  const featuresToProcess = [...(character?.features || []), ...normalizedFeatsForBonuses];

  // Collect active conditional benefits (stances + select choices) before early returns.
  const conditionalBonuses = useMemo(() => {
    if (!activeStancesLoaded || !activeFeatureSelectionsLoaded || !featuresToProcess.length) return [];

    return featuresToProcess.flatMap((feature) => {
      const featureId = feature?.id;
      const selectedChoice = featureId ? activeFeatureSelections[featureId] : null;
      const activeStance = featureId ? activeStances[featureId] : null;
      const conditionalBenefits = [
        ...getStanceBenefits(feature, activeStance),
        ...getSelectedFeatureBenefits(feature, selectedChoice)
      ];

      if (!conditionalBenefits.length) return [];

      const pseudoFeature = { ...feature, benefits: conditionalBenefits };
      return collectBonuses({
        items: [],
        features: [pseudoFeature],
        baseCharacterData: {
          ...baseAbilities,
          level: Math.max(1, Number(character?.level) || 1),
          classes: Array.isArray(character?.classes) ? character.classes : [],
          proficiency: proficiencyBonus,
          shield_bonus: 0
        },
        overrides: []
      }) || [];
    });
  }, [activeFeatureSelections, activeFeatureSelectionsLoaded, activeStances, activeStancesLoaded, baseAbilities, character?.classes, character?.level, featuresToProcess, proficiencyBonus]);

  // Show loading screen only while character data is loading
  // Textures load in background via TexturePreloader at app root
  if (loading) {
    return (
      <div className="route-loading">
        <img src="/crest.png" alt="" className="loading-crest" />
      </div>
    );
  }

  if (error) {
    return <div className="page-container"><p className="error-message">❌ {error}</p></div>;
  }

  if (!character) {
    return (
      <div className="page-container">
        <h1>Character Sheet</h1>
        <p>{isAdmin ? 'No characters found' : 'You have no character yet. Ask an admin to import your character.'}</p>
      </div>
    );
  }

  const skills = character.skills || [];
  const spells = character.spells || [];

  // baseMods uses the baseAbilities and abilityModifier defined before early returns
  const baseMods = {
    strength: abilityModifier(baseAbilities.strength),
    dexterity: abilityModifier(baseAbilities.dexterity),
    constitution: abilityModifier(baseAbilities.constitution),
    intelligence: abilityModifier(baseAbilities.intelligence),
    wisdom: abilityModifier(baseAbilities.wisdom),
    charisma: abilityModifier(baseAbilities.charisma)
  };

  // Convert ASIs to bonuses (character-level ASIs + feat-choice ASIs)
  const featChoiceImprovements = extractFeatAbilityScoreImprovements(character.feats || []);
  const allAbilityImprovements = [...(character.ability_score_improvements || []), ...featChoiceImprovements];
  const abilityScoreBonuses = convertAbilityScoresToBonuses(allAbilityImprovements);

  // Helper to calculate base AC from equipped armor
  const calculateBaseAC = (inventory, dexModifier, character, features, featureStates = {}) => {
    if (!inventory || !Array.isArray(inventory)) {
      return 10 + dexModifier; // Unarmored
    }

    // Helper to check if item is a shield
    const isShield = (item) => {
      const itemData = getInventoryEquipmentData(item);
      if (!itemData?.raw_data) return false;
      const rawData = typeof itemData.raw_data === 'string' ? JSON.parse(itemData.raw_data) : itemData.raw_data;
      return rawData?.equipment_categories?.some(cat => cat.index === 'shields');
    };

    // Find equipped body armor (not shields)
    const equippedArmor = inventory.find(item => {
      if (!item.equipped) return false;
      if (isShield(item)) return false; // Exclude shields
      
      // Check if it's armor (either equipment or magic item)
      const itemData = getInventoryEquipmentData(item);
      if (!itemData) return false;
      
      const type = itemData.type?.toLowerCase() || '';
      const hasArmorTypeId = itemData.armorTypeId !== null && itemData.armorTypeId !== undefined;
      
      return type.includes('armor') || hasArmorTypeId;
    });

    // Find equipped shield
    const equippedShield = inventory.find(item => item.equipped && isShield(item));

    let baseAC;
    if (!equippedArmor) {
      baseAC = 10 + dexModifier; // Unarmored
    } else {
      // Get armor data (prefer equipment, fallback to magic_item)
      const armorData = getInventoryEquipmentData(equippedArmor);
      const rawData = armorData?.raw_data;
      
      if (!rawData?.armor_class) {
        baseAC = 10 + dexModifier; // No armor_class data, use unarmored
      } else {
        const { base, dex_bonus, max_bonus } = rawData.armor_class;
        
        // Calculate AC based on armor type
        if (!dex_bonus) {
          // Heavy armor: base AC only, no DEX modifier
          baseAC = base;
        } else if (max_bonus !== undefined && max_bonus !== null) {
          // Medium armor: base AC + DEX (capped at max_bonus)
          baseAC = base + Math.min(dexModifier, max_bonus);
        } else {
          // Light armor: base AC + full DEX modifier
          baseAC = base + dexModifier;
        }
      }
    }

    const shieldIgnored = hasShieldIgnoreBenefit(features, featureStates);

    // Add shield bonus ONLY if proficient and not ignored by an active feature choice.
    if (equippedShield && !shieldIgnored) {
      const shieldData = getInventoryEquipmentData(equippedShield);
      const shieldAC = shieldData?.raw_data?.armor_class?.base || 0;
      
      // Check shield proficiency - only add AC if proficient
      if (isShieldProficient(character, features, featureStates)) {
        baseAC += shieldAC;
      }
    }

    return baseAC;
  };

  // Shield bonus that AC override formulas can optionally include
  const getEquippedShieldBonus = (inventory, character, features, featureStates = {}) => {
    if (!Array.isArray(inventory)) return 0;

    const isShield = (item) => {
      const itemData = getInventoryEquipmentData(item);
      if (!itemData?.raw_data) return false;
      const rawData = typeof itemData.raw_data === 'string' ? JSON.parse(itemData.raw_data) : itemData.raw_data;
      return rawData?.equipment_categories?.some(cat => cat.index === 'shields');
    };

    const equippedShield = inventory.find(item => item.equipped && isShield(item));
    if (!equippedShield) return 0;
    if (hasShieldIgnoreBenefit(features, featureStates)) return 0;
    if (!isShieldProficient(character, features, featureStates)) return 0;

    const shieldData = getInventoryEquipmentData(equippedShield);
    return Number(shieldData?.raw_data?.armor_class?.base) || 0;
  };

  // Helper to get armor info for AC Inspector display
  const getArmorInfo = (inventory, dexModifier, character, features) => {
    if (!inventory || !Array.isArray(inventory)) return null;

    // Helper to check if item is a shield
    const isShield = (item) => {
      const itemData = getInventoryEquipmentData(item);
      if (!itemData?.raw_data) return false;
      const rawData = typeof itemData.raw_data === 'string' ? JSON.parse(itemData.raw_data) : itemData.raw_data;
      return rawData?.equipment_categories?.some(cat => cat.index === 'shields');
    };

    // Find equipped body armor (not shields)
    const equippedArmor = inventory.find(item => {
      if (!item.equipped) return false;
      if (isShield(item)) return false; // Exclude shields
      const itemData = getInventoryEquipmentData(item);
      if (!itemData) return false;
      const type = itemData.type?.toLowerCase() || '';
      const hasArmorTypeId = itemData.armorTypeId !== null && itemData.armorTypeId !== undefined;
      return type.includes('armor') || hasArmorTypeId;
    });

    // Find equipped shield
    const equippedShield = inventory.find(item => item.equipped && isShield(item));

    let armorInfo = null;
    if (equippedArmor) {
      const armorData = getInventoryEquipmentData(equippedArmor);
      const rawData = armorData?.raw_data;
      
      if (rawData?.armor_class) {
        const { base, dex_bonus, max_bonus } = rawData.armor_class;
        
        // Determine armor type
        let armorType = 'Unknown';
        if (armorData.armorTypeId === 1) armorType = 'Light Armour';
        else if (armorData.armorTypeId === 2) armorType = 'Medium Armour';
        else if (armorData.armorTypeId === 3) armorType = 'Heavy Armour';
        else if (!dex_bonus) armorType = 'Heavy Armour';
        else if (max_bonus !== undefined && max_bonus !== null) armorType = 'Medium Armour';
        else armorType = 'Light Armour';

        // Calculate actual DEX bonus applied
        let appliedDexBonus = null;
        if (!dex_bonus) {
          appliedDexBonus = null; // No DEX for heavy armor
        } else if (max_bonus !== undefined && max_bonus !== null) {
          appliedDexBonus = Math.min(dexModifier, max_bonus);
        } else {
          appliedDexBonus = dexModifier;
        }

        armorInfo = {
          name: armorData.name,
          type: armorType,
          baseAC: base,
          dexBonus: appliedDexBonus,
          maxDexBonus: max_bonus,
          totalAC: appliedDexBonus !== null ? base + appliedDexBonus : base
        };
      }
    }

    // Add shield info with proficiency check
    let shieldBonus = null;
    if (equippedShield) {
      const shieldData = getInventoryEquipmentData(equippedShield);
      const shieldAC = shieldData?.raw_data?.armor_class?.base;
      const shieldProficient = isShieldProficient(character, features, {
        activeSelections: activeFeatureSelections,
        activeStances,
      });
      const shieldIgnored = hasShieldIgnoreBenefit(features, {
        activeSelections: activeFeatureSelections,
        activeStances,
      });
      
      if (shieldAC) {
        shieldBonus = {
          name: shieldData.name,
          bonus: shieldAC,
          proficient: shieldProficient,
          appliedBonus: shieldProficient && !shieldIgnored ? shieldAC : 0
        };
      }
    }

    // Return combined info (null if no armor or shield)
    if (!armorInfo && !shieldBonus) return null;

    return {
      ...armorInfo,
      shield: shieldBonus
    };
  };

  // Extract active magic items from inventory for bonus processing.
  // Items that do not require attunement are always active.
  const activeMagicItems = (() => {
    if (!Array.isArray(character.inventory)) return [];
    return character.inventory
      .filter((invItem) => {
        if (!invItem?.magic_item) return false;
        if (isMagicItemHidden(invItem.magic_item)) return false;
        if (!magicItemRequiresAttunement(invItem.magic_item)) return true;
        return invItem.attuned === true;
      })
      .map(invItem => invItem.magic_item);
  })();

  const visibleCharacterItems = (character.items || []).filter((item) => !isMagicItemHidden(item));

  // Collect bonuses from items, features, and character overrides
  // (Skill bonuses are now handled directly in SkillsTab from feature.benefits)
  const bonusList = collectBonuses({
    items: [...visibleCharacterItems, ...activeMagicItems],
    features: featuresToProcess,
    baseCharacterData: {
      ...baseAbilities,
      level: Math.max(1, Number(character?.level) || 1),
      classes: Array.isArray(character?.classes) ? character.classes : [],
      proficiency: proficiencyBonus,
      shield_bonus: getEquippedShieldBonus(character.inventory, character, featuresToProcess, {
        activeSelections: activeFeatureSelections,
        activeStances,
      })
    },
    overrides: character.bonuses || []
  }) || [];

  // Combine all bonuses (from features + ASIs)
  const baseBonuses = [...bonusList, ...abilityScoreBonuses];

  // Combine all bonuses (from features + ASIs + active conditional selections)
  const allBonuses = [...baseBonuses, ...conditionalBonuses];

  // First pass: derive abilities/modifiers, then recalculate AC with derived DEX.
  const initialBaseAC = calculateBaseAC(character.inventory, baseMods.dexterity, character, featuresToProcess, {
    activeSelections: activeFeatureSelections,
    activeStances,
  });

  const { derived: preliminaryDerivedStats } = deriveCharacterStats({
    base: {
      abilities: baseAbilities,
      maxHP: character.max_hp || 0,
      proficiency: proficiencyBonus,
      acBase: initialBaseAC,
      initiativeBase: baseMods.dexterity,
      passivePerceptionBase: 10 + baseMods.wisdom,
      senses: character.senses || [],
      speeds: character.speeds || {}
    },
    bonuses: allBonuses
  });

  const derivedDexForAC = Number.isFinite(preliminaryDerivedStats?.modifiers?.dexterity)
    ? preliminaryDerivedStats.modifiers.dexterity
    : baseMods.dexterity;

  const baseAC = calculateBaseAC(character.inventory, derivedDexForAC, character, featuresToProcess, {
    activeSelections: activeFeatureSelections,
    activeStances,
  });

  // Final pass: use derived-DEX AC as the AC base for final stat derivation.
  const { derived: derivedStats, totals: statsTotals } = deriveCharacterStats({
    base: {
      abilities: baseAbilities,
      maxHP: character.max_hp || 0,
      proficiency: proficiencyBonus,
      acBase: baseAC,
      initiativeBase: baseMods.dexterity,
      passivePerceptionBase: 10 + baseMods.wisdom,
      senses: character.senses || [],
      speeds: character.speeds || {}
    },
    bonuses: allBonuses
  });



  // Helper to calculate ability modifier from score
  const calculateModifier = (score) => Math.floor((score - 10) / 2);

  // Helper to get final ability score (with custom modifiers/overrides)
  const getFinalAbilityScore = (abilityKey, baseScore) => {
    const override = inspectorState.abilityCustomOverrides?.[abilityKey];
    if (override !== null && override !== undefined) {
      return override;
    }
    const customMods = inspectorState.abilityCustomModifiers?.[abilityKey] || [];
    const customTotal = customMods.reduce((sum, mod) => sum + mod.value, 0);
    return baseScore + customTotal;
  };

  // Calculate modifiers from final ability scores (including custom mods/overrides)
  // ⚠️ These INCLUDE bonuses - always use these derived mods, not character base stats
  const strScore = getFinalAbilityScore('strength', derivedStats?.abilities?.strength || character.strength);
  const dexScore = getFinalAbilityScore('dexterity', derivedStats?.abilities?.dexterity || character.dexterity);
  const conScore = getFinalAbilityScore('constitution', derivedStats?.abilities?.constitution || character.constitution);
  const intScore = getFinalAbilityScore('intelligence', derivedStats?.abilities?.intelligence || character.intelligence);
  const wisScore = getFinalAbilityScore('wisdom', derivedStats?.abilities?.wisdom || character.wisdom);
  const chaScore = getFinalAbilityScore('charisma', derivedStats?.abilities?.charisma || character.charisma);

  const strMod = calculateModifier(strScore);
  const dexMod = calculateModifier(dexScore);
  const conMod = calculateModifier(conScore);
  const intMod = calculateModifier(intScore);
  const wisMod = calculateModifier(wisScore);
  const chaMod = calculateModifier(chaScore);
  const characterLevel = Math.max(1, Number(character.level) || 1);
  
  // HP formula: character.max_hp + (level * con_mod) + bonuses from bonus engine
  const baseMaxHP = Number(character.max_hp) || 0;
  const conModBonus = conMod * characterLevel;
  const effectiveBaseMaxHP = baseMaxHP + conModBonus;
  const hpBonusesFromFeatures = allBonuses.filter(b => b.target === 'maxHP').reduce((sum, b) => sum + b.value, 0);
  const effectiveDisplayMaxHP = baseMaxHP + conModBonus + hpBonusesFromFeatures + maxHPModifier;

  // These ARE derived modifiers (calculated from derived scores with bonuses applied)
  // Safe to use everywhere - includes all feature bonuses
  const derivedMods = {
    strength: strMod,
    dexterity: dexMod,
    constitution: conMod,
    intelligence: intMod,
    wisdom: wisMod,
    charisma: chaMod
  };

  // Calculate AC with custom modifiers and override
  const customACModifierTotal = acCustomModifiers.reduce((sum, mod) => sum + mod.value, 0);
  const ac = acCustomOverride !== null ? acCustomOverride : derivedStats.ac + customACModifierTotal;
  
  // Determine AC glow state
  const getACGlowState = () => {
    if (acCustomOverride !== null) return 'glow-blue'; // Blue for override
    if (customACModifierTotal > 0) return 'glow-green'; // Green for positive modifier
    if (customACModifierTotal < 0) return 'glow-red'; // Red for negative modifier
    return ''; // No glow
  };

  const initiative = derivedStats.initiative;
  const campIconUrl = new URL('../assets/icons/location/camp.svg', import.meta.url).href;

  const barrierPools = (() => {
    const entries = [];

    const collectBarrierPool = (feature, featureId) => {
      if (!feature || !featureId) return;
      const featurePool = getFeaturePool(feature, character.level, derivedMods);
      if (!featurePool || featurePool.poolType !== 'barrier') return;

      const poolStateKey = `${featureId}-pool`;
      const stored = poolState?.[poolStateKey];
      const current = Number.isFinite(stored)
        ? Math.max(0, Math.min(featurePool.max, stored))
        : featurePool.max;

      entries.push({
        id: poolStateKey,
        name: featurePool.name || feature.name || 'Barrier',
        current,
        max: featurePool.max,
        barrierFillAmount: (() => {
          const fill = featurePool.barrierFill;
          if (!fill) return 0;
          const abilityFill = Number(derivedMods?.[fill]);
          if (Number.isFinite(abilityFill)) return Math.max(0, Math.floor(abilityFill));
          const staticFill = Number(fill);
          if (Number.isFinite(staticFill)) return Math.max(0, Math.floor(staticFill));
          return 0;
        })(),
        barrierFillLabel: (() => {
          const fill = featurePool.barrierFill;
          if (!fill) return '';
          if (Number.isFinite(Number(derivedMods?.[fill]))) return fill.slice(0, 3).toUpperCase();
          return 'Fill';
        })(),
      });
    };

    (character.features || []).forEach((feature, idx) => {
      const featureId = feature?.id || `feature-${feature?.name || idx}`;
      collectBarrierPool(feature, featureId);
    });

    (character.feats || []).forEach((featEntry, idx) => {
      const joinedFeat = getJoinedFeat(featEntry);
      const feat = joinedFeat || featEntry;
      if (!feat) return;
      const featId = featEntry?.id || feat.id || `feat-${feat.name || idx}`;
      collectBarrierPool(feat, featId);
    });

    return entries;
  })();

  const barrierCurrentTotal = barrierPools.reduce((sum, pool) => sum + pool.current, 0);
  const barrierMaxTotal = barrierPools.reduce((sum, pool) => sum + pool.max, 0);

  const limitGauges = (() => {
    const entries = [];

    const collectGauge = (feature, featureId) => {
      if (!feature || !featureId) return;
      const gauge = getFeatureGauge(feature, character.level, derivedMods, effectiveDisplayMaxHP);
      if (!gauge) return;

      const gaugeStateKey = `${featureId}-gauge`;
      const snapshot = normalizeGaugeSnapshot(poolState?.[gaugeStateKey], gauge);

      entries.push({
        id: gaugeStateKey,
        name: gauge.name,
        threshold: gauge.threshold,
        maxCharges: gauge.maxCharges,
        timeoutSeconds: gauge.timeoutSeconds,
        autoFillOnDamage: gauge.autoFillOnDamage,
        value: snapshot.value,
        charges: snapshot.charges,
        lastProgressAt: snapshot.lastProgressAt,
      });
    };

    (character.features || []).forEach((feature, idx) => {
      const featureId = feature?.id || `feature-${feature?.name || idx}`;
      collectGauge(feature, featureId);
    });

    (character.feats || []).forEach((featEntry, idx) => {
      const joinedFeat = getJoinedFeat(featEntry);
      const feat = joinedFeat || featEntry;
      if (!feat) return;
      const featId = featEntry?.id || feat.id || `feat-${feat.name || idx}`;
      collectGauge(feat, featId);
    });

    return entries;
  })();

  const handleLimitGaugeDamage = (damageAmount) => {
    const appliedDamage = Math.max(0, Math.floor(Number(damageAmount) || 0));
    if (appliedDamage <= 0 || !limitGauges.length) return;

    const now = Date.now();

    setPoolState((prev) => {
      let changed = false;
      const next = { ...prev };

      limitGauges.forEach((gauge) => {
        if (!gauge.autoFillOnDamage) return;

        const current = normalizeGaugeSnapshot(prev?.[gauge.id], gauge);
        if (current.charges >= gauge.maxCharges) return;

        let nextValue = current.value + appliedDamage;
        let nextCharges = current.charges;

        if (nextValue >= gauge.threshold) {
          nextCharges = Math.min(gauge.maxCharges, current.charges + 1);
          nextValue = 0;
        }

        if (nextCharges >= gauge.maxCharges) {
          nextValue = 0;
        }

        if (nextValue !== current.value || nextCharges !== current.charges) {
          next[gauge.id] = normalizeGaugeSnapshot({
            value: nextValue,
            charges: nextCharges,
            lastProgressAt: now,
          }, gauge);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  };

  return (
    <div className="character-sheet">
      {/* Admin Character Selector */}
      {isAdmin && characters.length > 0 && (
        <div className="admin-selector">
          <label>Character:</label>
          <select value={selectedCharacterId} onChange={(e) => handleCharacterChange(e.target.value)}>
            {characters.map(char => (
              <option key={char.id} value={char.id}>
                {char.name} (Lvl {char.level})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sticky Header - Parchment Tab */}
      <div className="sticky-header">
        <div className="sticky-header-content">
          <div className="header-left">
            {character.image_url && (
              <div className="character-portrait">
                <button
                  type="button"
                  className={`portrait-toggle ${isPortraitHighlighted ? 'is-highlighted' : 'is-muted'}`}
                  onClick={() => setIsPortraitHighlighted((prev) => !prev)}
                  aria-pressed={isPortraitHighlighted}
                  aria-label="Toggle portrait highlight"
                >
                  <img src={character.image_url} alt={character.name} />
                </button>
              </div>
            )}
            <div className="character-name-level">
              <span className="char-name">{character.full_name || character.name}</span>
              <span className="char-level">
                Lvl {character.level} {character.classes.map(c => `${c.class}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ')}
              </span>
              <div className="character-rest-and-conditions">
                <button
                  type="button"
                  className="long-rest-button clickable-underline"
                  onClick={() => setIsLongRestConfirmOpen(true)}
                  aria-label="Take a long rest"
                  title="Take a long rest"
                >
                  <img src={campIconUrl} alt="" className="long-rest-icon" />
                </button>
                <button
                  type="button"
                  className="conditions-header clickable-underline"
                  onClick={() => setIsConditionsModalOpen(true)}
                  aria-label="Open conditions tracker"
                >
                  Conditions
                  {activeConditions.length > 0 && (
                    <span className="conditions-active-count">{activeConditions.length}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="header-stats-compact">
              <div className="stat-compact hp">
                <span 
                  className="stat-value-compact hp-clickable clickable-underline" 
                  onClick={() => setIsHPModalOpen(true)}
                  title="Click to edit HP"
                >
                  <span className="hp-clickable-label">HP:</span>
                  <span className="hp-value-current">
                    {currentHP !== null ? currentHP : character.max_hp}
                  </span>
                  <span className="hp-total-separator">/</span>
                  <span className={maxHPModifier !== 0 ? 'hp-value-mod' : 'hp-value-current'}>
                    {effectiveDisplayMaxHP}
                  </span>
                  {barrierCurrentTotal > 0 && (
                    <span className="hp-value-barrier">+{barrierCurrentTotal}</span>
                  )}
                  {tempHP > 0 && (
                    <span className="hp-value-temp">+{tempHP}</span>
                  )}
                </span>
              </div>
              <div className="stat-row">
                <div 
                  className={`stat-compact ac clickable-underline ${getACGlowState()}`}
                  onClick={() => setACInspectorOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => { if (e.key === 'Enter') setACInspectorOpen(true); }}
                >
                  <span className="stat-label-compact">AC:</span>
                  <span className="stat-value-compact">{ac}</span>
                </div>
                <div className="stat-compact init clickable-underline">
                  <span className="stat-label-compact">Init:</span>
                  <span className="stat-value-compact">{initiative >= 0 ? '+' : ''}{initiative}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={activeTab === 'bio' ? 'tab-btn bio active' : 'tab-btn bio'}
          onClick={() => setActiveTabWithCarousel('bio')}
          aria-label="Bio"
          title="Bio"
        >
          <span className="tab-icon tab-icon-book" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'abilities' ? 'tab-btn abilities active' : 'tab-btn abilities'}
          onClick={() => setActiveTabWithCarousel('abilities')}
          aria-label="Abilities"
          title="Abilities"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3v18h18" />
            <path d="M7 17V9" />
            <path d="M12 17V5" />
            <path d="M17 17v-7" />
          </svg>
        </button>
        <button
          className={activeTab === 'skills' ? 'tab-btn skills active' : 'tab-btn skills'}
          onClick={() => setActiveTabWithCarousel('skills')}
          aria-label="Skills"
          title="Skills"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 21 15.75 15.75" />
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
          </svg>
        </button>
        <button
          className={activeTab === 'actions' ? 'tab-btn actions active' : 'tab-btn actions'}
          onClick={() => setActiveTabWithCarousel('actions')}
          aria-label="Actions"
          title="Actions"
        >
          <span className="tab-icon tab-icon-sword" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'spells' ? 'tab-btn spells active' : 'tab-btn spells'}
          onClick={() => setActiveTabWithCarousel('spells')}
          aria-label="Spells"
          title="Spells"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.813 15.904 9 18l-.813-2.096a4.5 4.5 0 0 0-2.924-2.924L3.167 12l2.096-.813a4.5 4.5 0 0 0 2.924-2.924L9 6l.813 2.096a4.5 4.5 0 0 0 2.924 2.924L14.833 12l-2.096.813a4.5 4.5 0 0 0-2.924 2.924Z" />
            <path d="M18.75 4.5 19.5 6l1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5ZM18.75 15l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5Z" />
          </svg>
        </button>
        <button
          className={activeTab === 'inventory' ? 'tab-btn inventory active' : 'tab-btn inventory'}
          onClick={() => setActiveTabWithCarousel('inventory')}
          aria-label="Inventory"
          title="Inventory"
        >
          <span className="tab-icon tab-icon-pack" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'features' ? 'tab-btn features active' : 'tab-btn features'}
          onClick={() => setActiveTabWithCarousel('features')}
          aria-label="Features"
          title="Features"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
          </svg>
        </button>
        <button
          className={activeTab === 'creatures' ? 'tab-btn creatures active' : 'tab-btn creatures'}
          onClick={() => setActiveTabWithCarousel('creatures')}
          aria-label="Creatures"
          title="Creatures"
        >
          <span className="tab-icon tab-icon-dragon" aria-hidden="true"></span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content" ref={emblaRef}>
        <div
          className="tab-carousel"
        >
          <div className="tab-pane">
            <BioTab character={character} onBastionStatUpdate={handleBastionStatUpdate} />
          </div>
          <div className="tab-pane">
            <AbilitiesTab
              character={character}
              strMod={strMod}
              dexMod={dexMod}
              conMod={conMod}
              intMod={intMod}
              wisMod={wisMod}
              chaMod={chaMod}
              proficiencyBonus={proficiencyBonus}
              skills={skills}
              derivedStats={derivedStats}
              statsTotals={statsTotals}
              allBonuses={allBonuses}
              getAbilityBonuses={getAbilityBonuses}
              inspectorState={inspectorState}
              setInspectorState={setInspectorState}
              baseAbilities={baseAbilities}
              saveAdvantages={derivedStats?.advantages?.saves || {}}
            />
          </div>
          <div className="tab-pane">
            <SkillsTab
              character={character}
              proficiencyBonus={proficiencyBonus}
              skills={skills}
              loading={relatedLoading}
              features={featuresToProcess}
              derivedMods={derivedMods}
              skillAdvantages={derivedStats?.advantages?.skills || {}}
              statsTotals={statsTotals}
            />
          </div>
          <div className="tab-pane">
            <ActionsTab 
              character={character} 
              proficiencyBonus={proficiencyBonus}
              derivedMods={derivedMods}
              allBonuses={allBonuses}
              setSelectedItem={setSelectedItem}
              usesState={usesState}
              poolState={poolState}
              onPoolChange={handlePoolChange}
              effectiveMaxHP={effectiveDisplayMaxHP}
              onUsesChange={handleUsesChange}
              calculateMaxUses={calculateMaxUses}
              abilityModifiers={derivedMods}
              FeatureUsesTracker={FeatureUsesTracker}
              spellUses={spellUses}
              onSpellUsesChange={handleSpellUsesChange}
            />
          </div>
          <div className="tab-pane">
            <SpellsTab 
              character={character} 
              spells={spells} 
              loading={relatedLoading}
              proficiencyBonus={proficiencyBonus}
              derivedMods={derivedMods}
              onSpellsUpdate={refetchSpells}
              spellUses={spellUses}
              onSpellUsesChange={handleSpellUsesChange}
              longRestVersion={longRestVersion}
            />
          </div>
          <div className="tab-pane">
            <InventoryTab 
              character={character} 
              onInventoryUpdate={refetchInventory} 
              onSpellsUpdate={refetchSpells}
              setSelectedItem={setSelectedItem}
              activePocket={activePocket}
              setActivePocket={setActivePocket}
            />
          </div>
          <div className="tab-pane">
            <FeaturesTab 
              character={character} 
              proficiencyBonus={proficiencyBonus} 
              abilityModifiers={derivedMods}
              effectiveMaxHP={effectiveDisplayMaxHP}
              usesState={usesState}
              poolState={poolState}
              expandedDescriptions={expandedDescriptions}
              onUsesChange={handleUsesChange}
              onPoolChange={handlePoolChange}
              onDescriptionToggle={handleDescriptionToggle}
              activeStances={activeStances}
              onStanceChange={handleStanceChange}
              activeFeatureSelections={activeFeatureSelections}
              onFeatureSelectionChange={handleFeatureSelectionChange}
            />
          </div>
          <div className="tab-pane">
            <CreaturesTab
              character={character}
              proficiencyBonus={proficiencyBonus}
              derivedMods={derivedMods}
            />
          </div>
        </div>
      </div>

      {/* HP Editing Modal */}
      {isHPModalOpen && (
        <HPEditModal
          currentHP={currentHP}
          setCurrentHP={setCurrentHP}
          tempHP={tempHP}
          setTempHP={setTempHP}
          maxHPModifier={maxHPModifier}
          setMaxHPModifier={setMaxHPModifier}
          barrierPools={barrierPools}
          barrierCurrentTotal={barrierCurrentTotal}
          barrierMaxTotal={barrierMaxTotal}
          onBarrierPoolChange={handlePoolChange}
          onDamageTaken={handleLimitGaugeDamage}
          deathSaveSuccesses={deathSaveSuccesses}
          setDeathSaveSuccesses={setDeathSaveSuccesses}
          deathSaveFailures={deathSaveFailures}
          setDeathSaveFailures={setDeathSaveFailures}
          maxHP={effectiveBaseMaxHP}
          damageInput={damageInput}
          setDamageInput={setDamageInput}
          isOpen={isHPModalOpen}
          onClose={() => setIsHPModalOpen(false)}
        />
      )}

      {/* AC Inspector */}
      <ACInspector
        isOpen={acInspectorOpen}
        onClose={() => setACInspectorOpen(false)}
        baseValue={baseAC}
        bonuses={allBonuses?.filter(b => b.target === 'ac') || []}
        acOverrides={allBonuses?.filter(b => b.target === 'ac_override') || []}
        abilityModifiers={derivedMods}
        customModifiers={acCustomModifiers}
        customOverride={acCustomOverride}
        armorInfo={getArmorInfo(character.inventory, derivedMods.dexterity, character, character.features || [])}
        dexModifier={derivedMods.dexterity}
        onAddCustomModifier={(modifier) => {
          const updated = [...acCustomModifiers, modifier];
          setACCustomModifiers(updated);
          if (character?.id) {
            localStorage.setItem(`ast_ac_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onDeleteCustomModifier={(index) => {
          const updated = acCustomModifiers.filter((_, i) => i !== index);
          setACCustomModifiers(updated);
          if (character?.id) {
            localStorage.setItem(`ast_ac_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onSetCustomOverride={(value) => {
          setACCustomOverride(value);
          if (character?.id) {
            if (value === null) {
              localStorage.removeItem(`ast_ac_override_${character.id}`);
            } else {
              localStorage.setItem(`ast_ac_override_${character.id}`, String(value));
            }
          }
        }}
      />

      {/* Ability Score Inspector */}
      <AbilityScoreInspector
        isOpen={inspectorState.isOpen}
        onClose={() => setInspectorState({ ...inspectorState, isOpen: false })}
        ability={inspectorState.selectedAbility?.name || ''}
        baseValue={inspectorState.selectedAbility?.baseValue || 10}
        bonuses={inspectorState.selectedAbility?.bonuses || []}
        customModifiers={inspectorState.abilityCustomModifiers[inspectorState.selectedAbility?.key] || []}
        customOverride={inspectorState.abilityCustomOverrides[inspectorState.selectedAbility?.key] || null}
        onAddCustomModifier={(modifier) => {
          const abilityKey = inspectorState.selectedAbility?.key;
          const updated = {
            ...inspectorState.abilityCustomModifiers,
            [abilityKey]: [...(inspectorState.abilityCustomModifiers[abilityKey] || []), modifier]
          };
          setInspectorState(prev => ({ ...prev, abilityCustomModifiers: updated }));
          if (character?.id) {
            localStorage.setItem(`ast_ability_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onDeleteCustomModifier={(index) => {
          const abilityKey = inspectorState.selectedAbility?.key;
          const updated = {
            ...inspectorState.abilityCustomModifiers,
            [abilityKey]: (inspectorState.abilityCustomModifiers[abilityKey] || []).filter((_, i) => i !== index)
          };
          setInspectorState(prev => ({ ...prev, abilityCustomModifiers: updated }));
          if (character?.id) {
            localStorage.setItem(`ast_ability_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onSetCustomOverride={(value) => {
          const abilityKey = inspectorState.selectedAbility?.key;
          const updated = {
            ...inspectorState.abilityCustomOverrides,
            [abilityKey]: value
          };
          setInspectorState(prev => ({ ...prev, abilityCustomOverrides: updated }));
          if (character?.id) {
            localStorage.setItem(`ast_ability_overrides_${character.id}`, JSON.stringify(updated));
          }
        }}
      />

      {/* Item Modal */}
      <ItemModal
        isOpen={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onDelete={async () => {
          if (!selectedItem?.id) return;
          try {
            const { error } = await supabase
              .from('character_inventory')
              .delete()
              .eq('id', selectedItem.id);
            
            if (error) throw error;
            setSelectedItem(null);
            if (refetchInventory) {
              await refetchInventory();
            }
          } catch (err) {
            console.error('Error deleting item:', err);
          }
        }}
        onQuantityUpdate={refetchInventory}
        pocketOptions={[...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])]}
        onPocketUpdate={async (itemId, newPocket) => {
          try {
            const { error } = await supabase
              .from('character_inventory')
              .update({ pocket: newPocket || null })
              .eq('id', itemId);
            
            if (error) throw error;
            if (refetchInventory) {
              await refetchInventory();
            }
          } catch (err) {
            console.error('Error updating pocket:', err);
            throw err;
          }
        }}
        onCreatePocket={(itemId) => {
          setNewPocketItemId(itemId);
          setShowNewPocketModal(true);
        }}
        proficiencyBonus={proficiencyBonus}
        abilityModifiers={derivedMods}
        characterId={character?.id}
        character={character}
        features={featuresToProcess}
        activeFeatureSelections={activeFeatureSelections}
        activeStances={activeStances}
      />

      {/* New Pocket Modal */}
      {showNewPocketModal && (
        <div className="item-modal-overlay" onClick={() => { setShowNewPocketModal(false); setNewPocketName(''); setNewPocketItemId(null); }}>
          <div className="new-pocket-modal" onClick={(e) => e.stopPropagation()}>
            <button className="item-modal-close" onClick={() => { setShowNewPocketModal(false); setNewPocketName(''); setNewPocketItemId(null); }} aria-label="Close">
              <span className="icon-cross" style={{ '--icon-url': 'url(/icons/util/cross.svg)' }} aria-hidden="true" />
            </button>
            <h3>Create New Pocket</h3>
            <p>Enter a name for your custom inventory pocket:</p>
            <input
              type="text"
              className="new-pocket-input"
              placeholder="Pocket name..."
              value={newPocketName}
              onChange={(e) => setNewPocketName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const trimmed = newPocketName.trim();
                  const allPocketOptions = [...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])];
                  if (trimmed && !allPocketOptions.includes(trimmed) && newPocketItemId) {
                    try {
                      const { error } = await supabase
                        .from('character_inventory')
                        .update({ pocket: trimmed })
                        .eq('id', newPocketItemId);
                      
                      if (error) throw error;
                      setActivePocket(trimmed);
                      setShowNewPocketModal(false);
                      setNewPocketName('');
                      setNewPocketItemId(null);
                      if (refetchInventory) await refetchInventory();
                    } catch (err) {
                      console.error('Error creating pocket:', err);
                    }
                  }
                }
              }}
              autoFocus
            />
            <div className="new-pocket-actions">
              <button
                className="new-pocket-cancel"
                onClick={() => { setShowNewPocketModal(false); setNewPocketName(''); setNewPocketItemId(null); }}
              >
                Cancel
              </button>
              <button
                className="new-pocket-create"
                onClick={async () => {
                  const trimmed = newPocketName.trim();
                  const allPocketOptions = [...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])];
                  if (trimmed && !allPocketOptions.includes(trimmed) && newPocketItemId) {
                    try {
                      const { error } = await supabase
                        .from('character_inventory')
                        .update({ pocket: trimmed })
                        .eq('id', newPocketItemId);
                      
                      if (error) throw error;
                      setActivePocket(trimmed);
                      setShowNewPocketModal(false);
                      setNewPocketName('');
                      setNewPocketItemId(null);
                      if (refetchInventory) await refetchInventory();
                    } catch (err) {
                      console.error('Error creating pocket:', err);
                    }
                  }
                }}
                disabled={!newPocketName.trim() || [...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])].includes(newPocketName.trim())}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <ConditionsModal
        isOpen={isConditionsModalOpen}
        onClose={() => setIsConditionsModalOpen(false)}
        activeConditions={activeConditions}
        onToggleCondition={handleToggleCondition}
        exhaustionLevel={exhaustionLevel}
        onSetExhaustion={setExhaustionLevel}
      />

      {isLongRestConfirmOpen && (
        <div className="long-rest-modal-overlay" onClick={() => setIsLongRestConfirmOpen(false)}>
          <div className="long-rest-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Take Long Rest?</h3>
            <p>This will restore HP and reset spell slots and feature uses.</p>
            <div className="long-rest-actions">
              <button
                type="button"
                className="long-rest-cancel"
                onClick={() => setIsLongRestConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="long-rest-confirm"
                onClick={performLongRest}
              >
                Yes, Rest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tab 1: Abilities, Saves, Passive Skills, Senses
// Tab 2: Skills (extracted to tabs/SkillsTab.jsx)

// Tab 3: Spells (extracted to tabs/SpellsTab.jsx)

// Helper to extract uses data from magic item (supports new benefits[] and legacy shapes)
const getMagicItemUses = (magicItem) => {
  if (!magicItem) return null;

  const extractFromBenefitEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return null;

    // New preferred shape: { uses: { max, type, recharge } }
    if (entry.uses && typeof entry.uses === 'object') return entry.uses;

    // Alternate structured shape: { type: 'uses' | 'charges', max, recharge, base }
    const entryType = String(entry.type || '').toLowerCase();
    if (entryType === 'uses' || entryType === 'charges') {
      return {
        max: entry.max,
        base: entry.base,
        type: entry.useType || entry.usesType || entryType,
        recharge: entry.recharge
      };
    }

    return null;
  };

  // New model: benefits is an array of benefit objects
  if (Array.isArray(magicItem.benefits)) {
    for (const benefit of magicItem.benefits) {
      const uses = extractFromBenefitEntry(benefit);
      if (uses) return uses;
    }
  }

  // Transitional model: benefits is an object with uses key
  if (magicItem.benefits?.uses && typeof magicItem.benefits.uses === 'object') {
    return magicItem.benefits.uses;
  }

  // Legacy model compatibility: properties may still contain uses data
  if (magicItem.properties?.benefits?.uses) return magicItem.properties.benefits.uses;
  if (magicItem.properties?.uses) return magicItem.properties.uses;

  return null;
};

const getMagicItemPool = (magicItem, characterLevel, abilityModifiers) => {
  if (!magicItem) return null;
  return getFeaturePool(magicItem, characterLevel, abilityModifiers);
};

// Tab 4: Inventory
function InventoryTab({ character, onInventoryUpdate, onSpellsUpdate, setSelectedItem, activePocket, setActivePocket }) {
  const [goldInput, setGoldInput] = useState(character?.gold ?? 0);
  const [savedGold, setSavedGold] = useState(character?.gold ?? 0);
  const [isSavingGold, setIsSavingGold] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);
  const [itemUsesState, setItemUsesState] = useState({});
  const [itemPoolState, setItemPoolState] = useState({});
  
  const items = character?.inventory || [];
  const customPockets = getCustomPockets(items);
  const allFilters = ['all', 'Equipped', ...DEFAULT_FILTERS, ...customPockets];
  const coinSrc = new URL('../assets/coin.svg', import.meta.url).href;
  
  // Load all item uses from localStorage
  useEffect(() => {
    if (!character?.id) return;
    const uses = {};
    items.forEach((item) => {
      const stored = localStorage.getItem(`item_uses_${character.id}_${item.id}`);
      const usesData = item?.magic_item ? getMagicItemUses(item.magic_item) : null;
      const baseUses = Math.max(0, Math.floor(Number(usesData?.base) || 0));
      uses[item.id] = stored ? parseInt(stored, 10) : baseUses;
    });
    setItemUsesState(uses);
  }, [character?.id, character?.inventory]);

  // Load all item pools from localStorage
  useEffect(() => {
    if (!character?.id) return;
    const pools = {};
    items.forEach((item) => {
      const stored = localStorage.getItem(`item_pool_${character.id}_${item.id}`);
      const poolData = item?.magic_item
        ? getMagicItemPool(item.magic_item, character.level, {
          strength: Math.floor((character.strength - 10) / 2),
          dexterity: Math.floor((character.dexterity - 10) / 2),
          constitution: Math.floor((character.constitution - 10) / 2),
          intelligence: Math.floor((character.intelligence - 10) / 2),
          wisdom: Math.floor((character.wisdom - 10) / 2),
          charisma: Math.floor((character.charisma - 10) / 2)
        })
        : null;
      const basePool = Math.max(0, Math.floor(Number(poolData?.base) || 0));
      pools[item.id] = stored ? parseInt(stored, 10) : basePool;
    });
    setItemPoolState(pools);
  }, [character?.id, character?.inventory]);
  
  // Listen for uses changes from modal
  useEffect(() => {
    const handleUsesChanged = (e) => {
      const { itemId, newUses } = e.detail;
      setItemUsesState(prev => ({ ...prev, [itemId]: newUses }));
    };

    const handlePoolChanged = (e) => {
      const { itemId, newValue } = e.detail;
      setItemPoolState(prev => ({ ...prev, [itemId]: newValue }));
    };
    
    window.addEventListener('itemUsesChanged', handleUsesChanged);
    window.addEventListener('itemPoolChanged', handlePoolChanged);
    return () => {
      window.removeEventListener('itemUsesChanged', handleUsesChanged);
      window.removeEventListener('itemPoolChanged', handlePoolChanged);
    };
  }, []);

  // Reset in-memory item uses when a long rest is performed
  useEffect(() => {
    const handleLongRest = (e) => {
      if (e?.detail?.characterId && e.detail.characterId !== character?.id) return;
      setItemUsesState({});
      setItemPoolState({});
    };

    window.addEventListener('longRestPerformed', handleLongRest);
    return () => window.removeEventListener('longRestPerformed', handleLongRest);
  }, [character?.id]);
  
  const handleItemUsesChange = (itemId, newUses) => {
    setItemUsesState(prev => ({ ...prev, [itemId]: newUses }));
    if (character?.id) {
      localStorage.setItem(`item_uses_${character.id}_${itemId}`, String(newUses));
    }
    window.dispatchEvent(new CustomEvent('itemUsesChanged', { detail: { itemId, newUses } }));
  };

  const handleItemPoolChange = (itemId, newValue) => {
    setItemPoolState(prev => ({ ...prev, [itemId]: newValue }));
    if (character?.id) {
      localStorage.setItem(`item_pool_${character.id}_${itemId}`, String(newValue));
    }
  };

  useEffect(() => {
    const gold = character?.gold ?? 0;
    setGoldInput(gold);
    setSavedGold(gold);
  }, [character?.gold, character?.id]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    let active = true;
    const handle = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [equipmentRes, magicRes] = await Promise.all([
          supabase.from('equipment').select('id, name').ilike('name', `%${term}%`).limit(8),
          supabase.from('magic_items').select('id, name').ilike('name', `%${term}%`).limit(8)
        ]);

        if (!active) return;
        if (equipmentRes.error) throw equipmentRes.error;
        if (magicRes.error) throw magicRes.error;

        const equipmentResults = (equipmentRes.data || []).map((item) => ({
          id: item.id,
          name: item.name,
          type: 'equipment'
        }));
        const magicResults = (magicRes.data || []).map((item) => ({
          id: item.id,
          name: item.name,
          type: 'magic'
        }));

        setSearchResults([...equipmentResults, ...magicResults]);
      } catch (err) {
        console.error('Error searching items:', err);
        if (active) setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [searchTerm]);

  // Determine if an item is equippable
  const isEquippable = (item) => {
    const equipmentData = getInventoryEquipmentData(item);
    if (!equipmentData) return false;
    const type = equipmentData.type?.toLowerCase() || '';
    return type.includes('weapon') || type.includes('armor');
  };

  // Determine if an item requires attunement
  const requiresAttunement = (item) => {
    return magicItemRequiresAttunement(item?.magic_item);
  };

  // Get rarity color class
  const getRarityClass = (item) => {
    if (!item.magic_item) return '';
    const rarity = (item.magic_item.rarity || item.magic_item.raw_data?.rarity || '').toLowerCase();
    if (rarity.includes('uncommon')) return 'rarity-uncommon';
    if (rarity.includes('rare') && !rarity.includes('very')) return 'rarity-rare';
    if (rarity.includes('very rare')) return 'rarity-very-rare';
    if (rarity.includes('legendary')) return 'rarity-legendary';
    return '';
  };

  const renderInventoryList = (displayItems) => {
    if (!displayItems || displayItems.length === 0) {
      return <p style={{ padding: '10px', textAlign: 'center' }}>No items in this pocket.</p>;
    }

    return (
      <div className="inventory-list">
        {displayItems.map((item) => {
          const itemName = item.equipment?.name || item.magic_item?.name || item.trinket_name || 'Unknown';
          const isMagic = !!item.magic_item;
          const rarityClass = getRarityClass(item);
          const itemClasses = `inventory-item ${isMagic ? 'magic' : ''} ${item.attuned ? 'attuned' : ''}`;
          const usesData = isMagic ? getMagicItemUses(item.magic_item) : null;
          const poolData = isMagic
            ? getMagicItemPool(item.magic_item, character.level, {
              strength: Math.floor((character.strength - 10) / 2),
              dexterity: Math.floor((character.dexterity - 10) / 2),
              constitution: Math.floor((character.constitution - 10) / 2),
              intelligence: Math.floor((character.intelligence - 10) / 2),
              wisdom: Math.floor((character.wisdom - 10) / 2),
              charisma: Math.floor((character.charisma - 10) / 2)
            })
            : null;
          const maxUses = usesData ? calculateMaxUses(
            usesData.max,
            Math.ceil(character.level / 4) + 1,
            {
              strength: Math.floor((character.strength - 10) / 2),
              dexterity: Math.floor((character.dexterity - 10) / 2),
              constitution: Math.floor((character.constitution - 10) / 2),
              intelligence: Math.floor((character.intelligence - 10) / 2),
              wisdom: Math.floor((character.wisdom - 10) / 2),
              charisma: Math.floor((character.charisma - 10) / 2)
            },
            character.level,
            null,
            usesData.base
          ) : 0;

          return (
            <div key={item.id} className={itemClasses} onClick={() => setSelectedItem(item)} style={{ cursor: 'pointer' }}>
              <div className="item-info">
                <span className={`item-name ${rarityClass}`}>{itemName}</span>
                {usesData && maxUses > 0 && (
                  <div className="item-uses-inline" onClick={(e) => e.stopPropagation()}>
                    <FeatureUsesTracker
                      maxUses={maxUses}
                      featureId={`item-card-${item.id}`}
                      storedUses={itemUsesState[item.id] ?? Math.max(0, Math.floor(Number(usesData?.base) || 0))}
                      onUsesChange={(_, newUses) => handleItemUsesChange(item.id, newUses)}
                    />
                  </div>
                )}
                {poolData && poolData.max > 0 && (
                  <div className="item-uses-inline" onClick={(e) => e.stopPropagation()}>
                    <FeaturePoolTracker
                      poolMax={poolData.max}
                      featureId={`item-card-${item.id}-pool`}
                      poolName={poolData.name || 'Pool'}
                      storedValue={itemPoolState[item.id] ?? Math.max(0, Math.floor(Number(poolData?.base) || 0))}
                      onPoolChange={(_, newValue) => handleItemPoolChange(item.id, newValue)}
                    />
                  </div>
                )}
              </div>
              <div className="item-toggles">
                {isEquippable(item) && (
                  <button className={item.equipped ? 'equip-box equipped' : 'equip-box'} onClick={(e) => { e.stopPropagation(); handleEquipToggle(item.id, item.equipped); }} title={item.equipped ? 'Unequip' : 'Equip'} />
                )}
                {requiresAttunement(item) && (
                  <button className={item.attuned ? 'attune-box attuned' : 'attune-box'} onClick={(e) => { e.stopPropagation(); handleAttunementToggle(item.id, item.attuned); }} title={item.attuned ? 'Unattuned' : 'Attune'} />
                )}
              </div>
              <span className="item-qty">{item.quantity}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Handle equipment toggle
  const handleEquipToggle = async (itemId, currentEquipped) => {
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ equipped: !currentEquipped })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // Refetch inventory to update display
      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error toggling equipment:', err);
    }
  };

  // Handle attunement toggle
  const handleAttunementToggle = async (itemId, currentAttuned) => {
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ attuned: !currentAttuned })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // Refetch inventory to update display
      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
      // Rebuild granted spells so attunement-gated item spells update immediately.
      if (onSpellsUpdate) {
        await onSpellsUpdate();
      }
    } catch (err) {
      console.error('Error toggling attunement:', err);
    }
  };

  const handleAddItem = async (result) => {
    if (!character?.id) return;
    try {
      const payload = {
        character_id: character.id,
        quantity: 1,
        equipped: false,
        attuned: false,
        notes: null,
        pocket: null,
        equipment_id: result.type === 'equipment' ? result.id : null,
        magic_item_id: result.type === 'magic' ? result.id : null,
        trinket_name: result.type === 'trinket' ? result.name : null
      };

      const { error } = await supabase
        .from('character_inventory')
        .insert(payload);

      if (error) throw error;

      setSearchTerm('');
      setSearchResults([]);

      // Refetch inventory to show the new item
      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error adding item:', err);
    }
  };

  const handleAddTrinket = async () => {
    const name = searchTerm.trim();
    if (!name || !character?.id) return;

    await handleAddItem({
      id: `trinket-${Date.now()}`,
      name,
      type: 'trinket'
    });
  };

  const handleChangePocket = async (itemId, newPocket) => {
    if (!character?.id) return;
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ pocket: newPocket.trim() || null })
        .eq('id', itemId);

      if (error) throw error;

      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error updating pocket:', err);
    }
  };

  const itemsByPocket = items.reduce((acc, item) => {
    // Items appear in their type-based filter
    const filter = getItemFilter(item);
    acc[filter] = acc[filter] || [];
    acc[filter].push(item);
    
    // Equipped items also appear in 'Equipped' filter
    if (item.equipped) {
      acc['Equipped'] = acc['Equipped'] || [];
      acc['Equipped'].push(item);
    }
    
    // Items with custom pockets appear there too
    if (item.pocket) {
      acc[item.pocket] = acc[item.pocket] || [];
      acc[item.pocket].push(item);
    }
    
    return acc;
  }, {});

  return (
    <div className="inventory-tab">
      <h2>Inventory</h2>

      <div className="inventory-toolbar">
        <div className="inventory-search">
          <input
            ref={searchInputRef}
            type="text"
            className="inventory-search-input"
            placeholder="Search items to add..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {(searchTerm.trim().length >= 1) && (
            <div className="inventory-search-results">
              {searchTerm.trim().length >= 2 && isSearching && <div className="inventory-search-empty">Searching...</div>}
              {searchTerm.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
                <div className="inventory-search-empty">No items found.</div>
              )}
              {searchTerm.trim().length >= 2 && !isSearching && searchResults.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  className="inventory-search-result"
                  onClick={() => handleAddItem(result)}
                  type="button"
                >
                  <span className="inventory-search-name">{result.name}</span>
                  <span className="inventory-search-type">{result.type === 'magic' ? 'Magic' : 'Equipment'}</span>
                  <span className="inventory-search-add">Add</span>
                </button>
              ))}
              <button
                className="inventory-search-result"
                onClick={handleAddTrinket}
                type="button"
              >
                <span className="inventory-search-name">{searchTerm.trim()}</span>
                <span className="inventory-search-type">Trinket</span>
                <span className="inventory-search-add">Add</span>
              </button>
            </div>
          )}
        </div>

        <div className="inventory-currency">
          <input
            type="number"
            min="0"
            className="inventory-gold-input"
            value={goldInput === 0 ? '' : goldInput}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                setGoldInput(0);
              } else {
                setGoldInput(Math.max(0, parseInt(val, 10) || 0));
              }
            }}
            disabled={isSavingGold}
            placeholder="0"
          />
          <img 
            src={coinSrc} 
            alt="Gold" 
            className={goldInput !== savedGold ? 'inventory-coin inventory-coin-changed' : 'inventory-coin'}
            onClick={async () => {
              if (goldInput === savedGold || !character?.id) return;
              setIsSavingGold(true);
              try {
                const { error } = await supabase
                  .from('characters')
                  .update({ gold: goldInput })
                  .eq('id', character.id);

                if (error) throw error;
                setSavedGold(goldInput);
              } catch (err) {
                console.error('Error updating gold:', err);
                setGoldInput(character?.gold ?? 0);
              } finally {
                setIsSavingGold(false);
              }
            }}
            style={{ cursor: goldInput !== savedGold ? 'pointer' : 'default' }}
            title={goldInput !== savedGold ? 'Save gold' : ''}
          />
        </div>
      </div>
      
      {/* Pocket Filter Chips */}
      <div className="inventory-pocket-chips">
        <button
          className={activePocket === 'all' ? 'pocket-chip active' : 'pocket-chip'}
          onClick={() => setActivePocket('all')}
        >
          All
        </button>
        <button
          className={activePocket === 'Equipped' ? 'pocket-chip active' : 'pocket-chip'}
          onClick={() => setActivePocket('Equipped')}
        >
          Equipped
        </button>
        {DEFAULT_FILTERS.map((filter) => (
          <button
            key={filter}
            className={activePocket === filter ? 'pocket-chip active' : 'pocket-chip'}
            onClick={() => setActivePocket(filter)}
          >
            {filter}
          </button>
        ))}
        {customPockets.map((pocket) => (
          <button
            key={pocket}
            className={activePocket === pocket ? 'pocket-chip active pocket-chip-custom' : 'pocket-chip pocket-chip-custom'}
            onClick={() => setActivePocket(pocket)}
          >
            {pocket}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="info-text">No items in inventory.</p>
      ) : (
        <>
          {activePocket === 'all' ? (
            // Show default filters only (not custom pockets)
            [...(itemsByPocket['Equipped']?.length ? ['Equipped'] : []), ...DEFAULT_FILTERS].map((filter) => {
              // In "all" view, exclude equipped equippable items from category buckets
              // because they are already listed in Equipped.
              const filterItems = (filter === 'Weapons' || filter === 'Armour')
                ? (itemsByPocket[filter] || []).filter(item => !item.equipped)
                : filter === 'Magic'
                  ? (itemsByPocket[filter] || []).filter(item => !(item.equipped && isEquippable(item)))
                  : (itemsByPocket[filter] || []);
              
              // Sort magic items by rarity and name
              const sortedItems = filter === 'Magic' ? sortItemsByRarityAndName(filterItems) : filterItems;
              
              return sortedItems.length ? (
                <div key={filter} className="inventory-section">
                  <div className="inventory-section-header">
                    <h3>{filter}</h3>
                  </div>
                  <div className="inventory-container">
                    {renderInventoryList(sortedItems)}
                  </div>
                </div>
              ) : null;
            })
          ) : activePocket === 'Magic' ? (
            // Magic tab: split into Attuned and Unattuned sections
            <>
              {(() => {
                const magicItems = itemsByPocket['Magic'] || [];
                const attuned = sortItemsByRarityAndName(magicItems.filter(item => item.attuned));
                const notAttuned = sortItemsByRarityAndName(magicItems.filter(item => !item.attuned));
                
                return (
                  <>
                    {attuned.length > 0 && (
                      <div className="inventory-section">
                        <div className="inventory-section-header">
                          <h3>Attuned</h3>
                        </div>
                        <div className="inventory-container">
                          {renderInventoryList(attuned)}
                        </div>
                      </div>
                    )}
                    {notAttuned.length > 0 && (
                      <div className="inventory-section">
                        <div className="inventory-section-header">
                          <h3>{attuned.length > 0 ? 'Other Magic Items' : 'Magic'}</h3>
                        </div>
                        <div className="inventory-container">
                          {renderInventoryList(notAttuned)}
                        </div>
                      </div>
                    )}
                    {attuned.length === 0 && notAttuned.length === 0 && (
                      <p className="info-text">No magic items.</p>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            <div className="inventory-section">
              <div className="inventory-section-header">
                <h3>{activePocket}</h3>
              </div>
              <div className="inventory-container">
                {renderInventoryList(itemsByPocket[activePocket] || [])}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Helper to extract unlocked masteries from character features
function getUnlockedMasteries(character) {
  const features = character?.features || [];
  const masterySet = new Set();
   const normalizeBenefits = (rawBenefits) => {
    if (Array.isArray(rawBenefits)) return rawBenefits;
    if (rawBenefits && typeof rawBenefits === 'object') {
      return rawBenefits.type ? [rawBenefits] : [];
    }
    if (typeof rawBenefits === 'string') {
      try {
        const parsed = JSON.parse(rawBenefits);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && parsed.type) return [parsed];
      } catch {
        return [];
      }
    }
    return [];
  };
  
  const normalizeBenefitType = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  
  features.forEach(feature => {
    const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
    benefits.forEach(benefit => {
      if (normalizeBenefitType(benefit?.type) === 'mastery' && Array.isArray(benefit.masteries)) {
        benefit.masteries.forEach(weaponName => {
          // Normalize weapon names for comparison (lowercase, trim)
          masterySet.add(weaponName.toLowerCase().trim());
        });
      }
    });
  });
  
  return masterySet;
}

// Item Modal Component - displays detailed information about inventory items
function ItemModal({
  isOpen,
  item,
  onClose,
  onDelete,
  onQuantityUpdate,
  pocketOptions = [],
  onPocketUpdate,
  onCreatePocket,
  proficiencyBonus,
  abilityModifiers,
  characterId,
  character,
  features = [],
  activeFeatureSelections = {},
  activeStances = {},
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quantityInput, setQuantityInput] = useState(item?.quantity || 1);
  const [pocketInput, setPocketInput] = useState(item?.pocket || '');
  const [trinketDescription, setTrinketDescription] = useState(item?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showPocketDropdown, setShowPocketDropdown] = useState(false);
  const [itemUses, setItemUses] = useState(() => {
    if (!characterId || !item?.id) return 0;
    const stored = localStorage.getItem(`item_uses_${characterId}_${item.id}`);
    const usesData = item?.magic_item ? getMagicItemUses(item.magic_item) : null;
    const baseUses = Math.max(0, Math.floor(Number(usesData?.base) || 0));
    return stored ? parseInt(stored, 10) : baseUses;
  });
  const [itemPool, setItemPool] = useState(() => {
    if (!characterId || !item?.id) return null;
    const stored = localStorage.getItem(`item_pool_${characterId}_${item.id}`);
    const poolData = item?.magic_item ? getMagicItemPool(item.magic_item, character?.level || 1, abilityModifiers || {}) : null;
    const basePool = Math.max(0, Math.floor(Number(poolData?.base) || 0));
    return stored ? parseInt(stored, 10) : basePool;
  });
  
  // Sync quantity and pocket when item changes
  useEffect(() => {
    if (item?.quantity) {
      setQuantityInput(item.quantity);
    }
    setPocketInput(item?.pocket || '');
    setTrinketDescription(item?.notes || '');
    setShowPocketDropdown(false);
    
    // Load stored uses for this item
    if (characterId && item?.id) {
      const stored = localStorage.getItem(`item_uses_${characterId}_${item.id}`);
      const usesData = item?.magic_item ? getMagicItemUses(item.magic_item) : null;
      const baseUses = Math.max(0, Math.floor(Number(usesData?.base) || 0));
      setItemUses(stored ? parseInt(stored, 10) : baseUses);
      const storedPool = localStorage.getItem(`item_pool_${characterId}_${item.id}`);
      const poolData = item?.magic_item ? getMagicItemPool(item.magic_item, character?.level, abilityModifiers) : null;
      const basePool = Math.max(0, Math.floor(Number(poolData?.base) || 0));
      setItemPool(storedPool ? parseInt(storedPool, 10) : basePool);
    }
  }, [item?.id, characterId, item?.magic_item, character?.level, abilityModifiers]);
  
  const handleItemUsesChange = (newUses) => {
    setItemUses(newUses);
    if (characterId && item?.id) {
      localStorage.setItem(`item_uses_${characterId}_${item.id}`, String(newUses));
      // Emit custom event for card to sync
      window.dispatchEvent(new CustomEvent('itemUsesChanged', {
        detail: { itemId: item.id, newUses }
      }));
    }
  };

  const handleItemPoolChange = (newValue) => {
    setItemPool(newValue);
    if (characterId && item?.id) {
      localStorage.setItem(`item_pool_${characterId}_${item.id}`, String(newValue));
      window.dispatchEvent(new CustomEvent('itemPoolChanged', {
        detail: { itemId: item.id, newValue }
      }));
    }
  };

  // Reset modal's in-memory uses on long rest
  useEffect(() => {
    const handleLongRest = (e) => {
      if (e?.detail?.characterId && e.detail.characterId !== characterId) return;
      const usesData = item?.magic_item ? getMagicItemUses(item.magic_item) : null;
      const poolData = item?.magic_item ? getMagicItemPool(item.magic_item, character?.level, abilityModifiers) : null;
      const baseUses = Math.max(0, Math.floor(Number(usesData?.base) || 0));
      const basePool = Math.max(0, Math.floor(Number(poolData?.base) || 0));
      setItemUses(baseUses);
      setItemPool(basePool);
    };

    window.addEventListener('longRestPerformed', handleLongRest);
    return () => window.removeEventListener('longRestPerformed', handleLongRest);
  }, [characterId, item?.magic_item, character?.level, abilityModifiers]);
  
  if (!isOpen || !item) return null;

  const crossIconSrc = '/icons/util/cross.svg';
  const isEquipment = !!item.equipment;
  const isMagicItem = !!item.magic_item;
  const isTrinket = !isEquipment && !isMagicItem && !!item.trinket_name;
  const linkedEquipment = getInventoryEquipmentData(item);
  const isEquipmentLike = !!linkedEquipment;
  const itemData = isEquipment
    ? item.equipment
    : isMagicItem
      ? item.magic_item
      : {
        name: item.trinket_name,
        description: item.notes || null,
        raw_data: {}
      };
  const rawData = linkedEquipment?.raw_data || itemData?.raw_data || {};
  const isHiddenMagicItem = isMagicItem && isMagicItemHidden(itemData);
  const itemDescriptionText = (() => {
    if (isHiddenMagicItem) return '???';

    let text = isMagicItem
      ? (itemData.description || rawData.description)
      : rawData.description;

    if (Array.isArray(text)) {
      text = text.join('\n\n');
    }

    return text;
  })();
  const isWeapon = isEquipmentLike && linkedEquipment.type?.toLowerCase().includes('weapon');
  const hasTrinketDescriptionChanges = isTrinket && (trinketDescription !== (item?.notes || ''));

  const saveTrinketDescription = async () => {
    if (!isTrinket || !item?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ notes: trinketDescription.trim() || null })
        .eq('id', item.id);

      if (error) throw error;

      if (onQuantityUpdate) {
        await onQuantityUpdate();
      }
    } catch (err) {
      console.error('Error updating trinket description:', err);
      setTrinketDescription(item?.notes || '');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="item-modal-overlay" onClick={onClose}>
      <div className="item-modal" onClick={(e) => e.stopPropagation()}>
        <button className="item-modal-close" onClick={onClose} aria-label="Close">
          <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
        </button>
        
        <div className="item-modal-content">
          <h2>{itemData?.name || 'Unknown Item'}</h2>
          
          {/* Description with optional image */}
          {(isHiddenMagicItem || itemDescriptionText) && (
            <div className="item-section item-main-content">
              {/* Magic Item Image - floats left */}
              {isMagicItem && itemData?.image_url && (
                <div className="item-image-container">
                  <img src={itemData.image_url} alt={itemData.name} className="item-image" />
                </div>
              )}
              
              <div className="item-description">
                <ReactMarkdown>{(itemDescriptionText || '').replace(/\n/g, '\n\n')}</ReactMarkdown>
              </div>
            </div>
          )}
          
          {/* Magic Item Uses */}
          {(() => {
            if (!isMagicItem) return null;
            const usesData = getMagicItemUses(itemData);
            if (!usesData) return null;
            const maxUses = calculateMaxUses(usesData.max, proficiencyBonus, abilityModifiers, character.level, null, usesData.base);
            if (maxUses <= 0) return null;
            
            // Derive label from type (e.g., "charges", "uses") and capitalize
            const typeLabel = usesData.type ? usesData.type.charAt(0).toUpperCase() + usesData.type.slice(1) : 'Uses';
            
            return (
              <div className="item-section">
                <div className="item-uses-row">
                  <div className="item-uses-label">{typeLabel}:</div>
                  <FeatureUsesTracker 
                    maxUses={maxUses}
                    featureId={`item-${item.id}`}
                    storedUses={itemUses ?? Math.max(0, Math.floor(Number(usesData?.base) || 0))}
                    onUsesChange={(_, newUses) => handleItemUsesChange(newUses)}
                  />
                </div>
                {usesData.recharge?.when && (
                  <div className="item-recharge-info">
                    Recharges at {usesData.recharge.when}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Magic Item Pool */}
          {(() => {
            if (!isMagicItem) return null;
            const poolData = getMagicItemPool(itemData, character.level, abilityModifiers);
            if (!poolData || poolData.max <= 0) return null;

            return (
              <div className="item-section">
                <div className="item-uses-row">
                  <div className="item-uses-label">{poolData.name || 'Pool'}:</div>
                  <FeaturePoolTracker
                    poolMax={poolData.max}
                    featureId={`item-${item.id}-pool`}
                    poolName={null}
                    storedValue={itemPool ?? Math.max(0, Math.floor(Number(poolData?.base) || 0))}
                    onPoolChange={(_, newValue) => handleItemPoolChange(newValue)}
                  />
                </div>
              </div>
            );
          })()}
          
          {/* Basic Info - only show for equipment with cost/weight */}
          {isEquipmentLike && (rawData.cost || rawData.weight !== undefined || rawData.rarity) && (
            <div className="item-section">
              {(rawData.cost || rawData.weight !== undefined) && (
                <div className="item-row" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {rawData.cost && (
                    <div style={{ flex: '0 1 auto' }}>
                      <span className="item-label">Cost:</span>
                      {' '}
                      <span>{typeof rawData.cost === 'string' ? rawData.cost : `${rawData.cost.quantity} ${rawData.cost.unit}`}</span>
                    </div>
                  )}
                  {rawData.weight !== undefined && (
                    <div style={{ flex: '0 1 auto' }}>
                      <span className="item-label">Weight:</span>
                      {' '}
                      <span>{rawData.weight} lb</span>
                    </div>
                  )}
                </div>
              )}
              {rawData.rarity && (
                <div className="item-row">
                  <span className="item-label">Rarity:</span>
                  <span className="capitalize">{rawData.rarity}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Weapon Properties */}
          {isWeapon && (
            <>
              <h3>Weapon Properties</h3>
              <div className="item-weapon-properties">
                {/* Proficiency Status */}
                {(() => {
                  const isProficient = isWeaponProficient(linkedEquipment, character);
                  return (
                    <div className="item-row">
                      <span className="item-label">Proficiency:</span>
                      <span className={isProficient ? 'proficiency-yes' : 'proficiency-no'}>
                        {isProficient ? '✓ Proficient' : '✗ Not Proficient'}
                      </span>
                    </div>
                  );
                })()}
                
                {rawData.damage && (
                  <div className="item-row">
                    <span className="item-label">Melee Damage:</span>
                    <span>{rawData.damage.damage_dice} {rawData.damage.damage_type?.name || ''}</span>
                  </div>
                )}
                
                {rawData.two_handed_damage && (
                  <div className="item-row">
                    <span className="item-label">Two-Handed:</span>
                    <span>{rawData.two_handed_damage.damage_dice} {rawData.two_handed_damage.damage_type?.name || ''}</span>
                  </div>
                )}
                
                {rawData.range && (
                  <div className="item-row">
                    <span className="item-label">Range:</span>
                    <span>{rawData.range.normal} ft{rawData.range.long ? ` / ${rawData.range.long} ft` : ''}</span>
                  </div>
                )}
                
                {rawData.properties && rawData.properties.length > 0 && (
                  <div className="item-row">
                    <span className="item-label">Properties:</span>
                    <span>{rawData.properties.map((p) => p.name || p).join(', ')}</span>
                  </div>
                )}
                
                {rawData.mastery && (() => {
                  const masteryName = rawData.mastery.name || rawData.mastery;
                  const weaponName = linkedEquipment?.name?.toLowerCase().trim();
                  const unlockedMasteries = getUnlockedMasteries(character);
                  const hasMastery = weaponName && unlockedMasteries.has(weaponName);
                  
                  return (
                    <div className="item-row">
                      <span className="item-label">Mastery:</span>
                      <span className={hasMastery ? 'mastery-unlocked' : ''}>{masteryName}</span>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
          
          {/* Armour Properties */}
          {isEquipmentLike && linkedEquipment.type?.toLowerCase().includes('armor') && (
            <>
              <h3>Armour Properties</h3>
              <div className="item-armor-properties">
                {/* Check if this is a shield or armor */}
                {(() => {
                  const isShieldItem = rawData?.equipment_categories?.some(cat => cat.index === 'shields');
                  
                  if (isShieldItem) {
                    // Shield proficiency check
                    const isProficient = isShieldProficient(character, features, {
                      activeSelections: activeFeatureSelections,
                      activeStances,
                    });
                    return (
                      <div className="item-row">
                        <span className="item-label">Proficiency:</span>
                        <span className={isProficient ? 'proficiency-yes' : 'proficiency-no'}>
                          {isProficient ? '✓ Proficient' : '✗ Not Proficient (no AC bonus)'}
                        </span>
                      </div>
                    );
                  } else {
                    // Armor proficiency check
                    const isProficient = isArmorProficient(linkedEquipment, character, features, {
                      activeSelections: activeFeatureSelections,
                      activeStances,
                    });
                    return (
                      <div className="item-row">
                        <span className="item-label">Proficiency:</span>
                        <span className={isProficient ? 'proficiency-yes' : 'proficiency-no'}>
                          {isProficient ? '✓ Proficient' : '✗ Not Proficient'}
                        </span>
                      </div>
                    );
                  }
                })()}
                
                {rawData.equipment_categories && rawData.equipment_categories.length > 0 && (
                  <div className="item-row">
                    <span className="item-label">Type:</span>
                    <span>{rawData.equipment_categories.map((cat) => cat.name).join(', ')}</span>
                  </div>
                )}
                
                {rawData.armor_class && (
                  <div className="item-row">
                    <span className="item-label">AC:</span>
                    <span>{rawData.armor_class.base}{rawData.armor_class.dex_bonus ? ' + DEX' : ''}{rawData.armor_class.max_bonus ? ` (max +${rawData.armor_class.max_bonus})` : ''}</span>
                  </div>
                )}
                
                {rawData.str_minimum !== undefined && rawData.str_minimum > 0 && (
                  <div className="item-row">
                    <span className="item-label">Strength Min:</span>
                    <span>{rawData.str_minimum}</span>
                  </div>
                )}
                
                {rawData.stealth_disadvantage && (
                  <div className="item-row">
                    <span className="item-label">Stealth:</span>
                    <span>Disadvantage</span>
                  </div>
                )}
                
                {rawData.don_time && (
                  <div className="item-row">
                    <span className="item-label">Don Time:</span>
                    <span>{rawData.don_time}</span>
                  </div>
                )}
                
                {rawData.doff_time && (
                  <div className="item-row">
                    <span className="item-label">Doff Time:</span>
                    <span>{rawData.doff_time}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {isTrinket && (
            <div className="item-section">
              <div className="item-row" style={{ marginBottom: '8px' }}>
                <span className="item-label">Description:</span>
              </div>
              <textarea
                className="item-quantity-input"
                rows={4}
                value={trinketDescription}
                onChange={(e) => setTrinketDescription(e.target.value)}
                disabled={isSaving}
                placeholder="Add notes or description for this trinket..."
                style={{ width: '100%', resize: 'vertical' }}
              />
              {hasTrinketDescriptionChanges && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="item-quantity-save"
                    onClick={saveTrinketDescription}
                    disabled={isSaving}
                    title="Save description"
                    aria-label="Save description"
                  >
                    <span
                      className="item-quantity-save-icon"
                      style={{ '--icon-url': `url(${new URL('../assets/icons/util/tick.svg', import.meta.url).href})` }}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Pocket Selection */}
          <div className="item-section">
            <div className="item-pocket-control">
              <span className="item-label">Custom Pocket:</span>
              <div className="item-pocket-dropdown-container">
                <button
                  className="item-pocket-dropdown-button"
                  onClick={() => setShowPocketDropdown(!showPocketDropdown)}
                  disabled={isSaving}
                >
                  <span>{pocketInput || 'None'}</span>
                  <span className="dropdown-arrow">▼</span>
                </button>
                
                {showPocketDropdown && (
                  <>
                    <div className="dropdown-backdrop" onClick={() => setShowPocketDropdown(false)} />
                    <div className="item-pocket-dropdown-menu">
                      <button
                        className={`pocket-dropdown-item ${!pocketInput ? 'active' : ''}`}
                        onClick={async () => {
                          setPocketInput(null);
                          setShowPocketDropdown(false);
                          if (onPocketUpdate) {
                            try {
                              await onPocketUpdate(item.id, null);
                            } catch (err) {
                              setPocketInput(item?.pocket || '');
                            }
                          }
                        }}
                      >
                        None
                      </button>
                      {getCustomPockets(pocketOptions).map((pocket) => (
                        <button
                          key={pocket}
                          className={`pocket-dropdown-item pocket-dropdown-custom ${pocketInput === pocket ? 'active' : ''}`}
                          onClick={async () => {
                            setPocketInput(pocket);
                            setShowPocketDropdown(false);
                            if (onPocketUpdate) {
                              try {
                                await onPocketUpdate(item.id, pocket);
                              } catch (err) {
                                setPocketInput(item?.pocket || '');
                              }
                            }
                          }}
                        >
                          {pocket}
                        </button>
                      ))}
                      <button
                        className="pocket-dropdown-item create-new"
                        onClick={() => {
                          setShowPocketDropdown(false);
                          if (onCreatePocket) {
                            onCreatePocket(item.id);
                          }
                        }}
                      >
                        + Create New Pocket...
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quantity and Delete */}
          <div className="item-section">
            <div className="item-quantity-container">
              <div className="item-quantity-group">
                <span className="item-label">In Inventory:</span>
                <input
                  type="number"
                  className="item-quantity-input"
                  min="1"
                  max="999"
                  value={quantityInput === 0 ? '' : quantityInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setQuantityInput(0);
                    } else {
                      const parsed = parseInt(val);
                      setQuantityInput(isNaN(parsed) ? 0 : Math.max(1, parsed));
                    }
                  }}
                  disabled={isSaving}
                  placeholder="0"
                />
                {quantityInput !== item.quantity && quantityInput > 0 && (
                  <button
                    className="item-quantity-save"
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const { error } = await supabase
                          .from('character_inventory')
                          .update({ quantity: quantityInput })
                          .eq('id', item.id);
                        
                        if (error) throw error;
                        if (onQuantityUpdate) {
                          await onQuantityUpdate();
                        }
                      } catch (err) {
                        console.error('Error updating quantity:', err);
                        setQuantityInput(item.quantity);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    title="Save quantity"
                    aria-label="Save quantity"
                  >
                    <span 
                      className="item-quantity-save-icon" 
                      style={{ '--icon-url': `url(${new URL('../assets/icons/util/tick.svg', import.meta.url).href})` }}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
              {onDelete && (
                <button className="item-delete-btn-lg" onClick={() => setConfirmDelete(true)} title="Remove from inventory" aria-label="Remove from inventory" disabled={isSaving}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Delete Confirmation */}
          {confirmDelete && (
            <div className="item-confirm-overlay" onClick={() => setConfirmDelete(false)}>
              <div className="item-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>Remove Item?</h3>
                <p>Are you sure you want to remove {itemData?.name} from your inventory?</p>
                <div className="item-confirm-buttons">
                  <button className="item-confirm-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button className="item-confirm-delete" onClick={() => { onDelete(); setConfirmDelete(false); onClose(); }}>Remove</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const getUseScalingMap = (feature) => {
  const rawBenefits = feature?.benefits ?? feature?.benefit;

  if (!rawBenefits) return null;

  const tryExtract = (value) => {
    if (!value) return null;

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === 'object' && entry.use_scaling && typeof entry.use_scaling === 'object') {
          return entry.use_scaling;
        }
      }
      return null;
    }

    if (typeof value === 'object') {
      if (value.use_scaling && typeof value.use_scaling === 'object') {
        return value.use_scaling;
      }
      return null;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return tryExtract(parsed);
      } catch {
        return null;
      }
    }

    return null;
  };

  return tryExtract(rawBenefits);
};

// Helper to calculate max uses from strings like:
// "charisma", "proficiency", "level", "level/2ru", "level/2rd", "3", "scaling"
const calculateMaxUses = (maxUsesValue, proficiencyBonus, abilityModifiers, characterLevel = 1, feature = null, explicitBase = null) => {
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const featureDieBenefit = benefits.find((benefit) => normalizeBenefitType(benefit?.type) === 'feature_die') || null;

  const hasFeatureDieUses = Boolean(
    featureDieBenefit && (
      featureDieBenefit.max_uses !== undefined
      || featureDieBenefit.max !== undefined
      || featureDieBenefit.uses !== undefined
      || featureDieBenefit.count !== undefined
      || featureDieBenefit.value !== undefined
      || featureDieBenefit.formula
      || (featureDieBenefit.use_scaling && typeof featureDieBenefit.use_scaling === 'object')
    )
  );

  const normalizedMaxUsesValue =
    maxUsesValue === null || maxUsesValue === undefined || maxUsesValue === ''
      ? (
        hasFeatureDieUses
          ? (
            featureDieBenefit.max_uses
            ?? featureDieBenefit.max
            ?? featureDieBenefit.uses
            ?? featureDieBenefit.count
            ?? featureDieBenefit.value
            ?? (featureDieBenefit.formula ? 'formula' : (featureDieBenefit.use_scaling ? 'scaling' : null))
          )
          : null
      )
      : maxUsesValue;

  if (normalizedMaxUsesValue === null || normalizedMaxUsesValue === undefined || normalizedMaxUsesValue === '') return 0;

  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

  const resolveBaseValue = (token) => {
    const normalized = String(token || '').toLowerCase().trim();
    if (!normalized) return null;

    if (normalized === 'proficiency') return Number(proficiencyBonus) || 0;
    if (normalized === 'proficiency_bonus') return Number(proficiencyBonus) || 0;
    if (normalized === 'level') return Number(characterLevel) || 0;
    if (abilities.includes(normalized)) return Number(abilityModifiers?.[normalized]) || 0;

    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric;

    return null;
  };

  const str = String(normalizedMaxUsesValue).toLowerCase().trim();

  // Special scaling resources
  if (str === 'wildshape') {
    if (characterLevel <= 1) return 0;
    if (characterLevel <= 4) return 2;
    if (characterLevel <= 16) return 3;
    return 4;
  }

  // Feature-driven use scaling from benefits.use_scaling
  // Example: { use_scaling: { "1": 2, "4": 3, "12": 4 } }
  if (str === 'scaling') {
    const scalingMap = (featureDieBenefit?.use_scaling && typeof featureDieBenefit.use_scaling === 'object')
      ? featureDieBenefit.use_scaling
      : getUseScalingMap(feature);
    if (!scalingMap || typeof scalingMap !== 'object') return 0;

    const level = Math.max(1, Number(characterLevel) || 1);
    const thresholds = Object.entries(scalingMap)
      .map(([gate, uses]) => [Number.parseInt(gate, 10), Number(uses)])
      .filter(([gate, uses]) => Number.isFinite(gate) && Number.isFinite(uses))
      .sort((a, b) => a[0] - b[0]);

    if (!thresholds.length) return 0;

    let resolvedUses = 0;
    thresholds.forEach(([gate, uses]) => {
      if (level >= gate) resolvedUses = uses;
    });

    return Math.max(0, Math.floor(resolvedUses));
  }

  if (str === 'formula') {
    const formula = typeof featureDieBenefit?.formula === 'string' ? featureDieBenefit.formula : '';
    if (!formula) return 0;
    return evaluatePoolFormula(formula, characterLevel, {
      ...(abilityModifiers || {}),
      proficiency: Number(proficiencyBonus) || 0,
      proficiency_bonus: Number(proficiencyBonus) || 0,
    });
  }

  // Support patterns like level/2ru, level/2rd, proficiency/2ru, charisma/2rd
  const divisionMatch = str.match(/^([a-z_]+|\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*(ru|rd)$/i);
  if (divisionMatch) {
    const [, baseToken, divisorToken, roundingMode] = divisionMatch;
    const baseValue = resolveBaseValue(baseToken);
    const divisor = Number(divisorToken);

    if (baseValue === null || !Number.isFinite(baseValue) || !Number.isFinite(divisor) || divisor <= 0) {
      return 0;
    }

    const divided = baseValue / divisor;
    const rounded = roundingMode.toLowerCase() === 'ru' ? Math.ceil(divided) : Math.floor(divided);
    return Math.max(0, rounded);
  }

  const directValue = resolveBaseValue(str);
  if (directValue === null || !Number.isFinite(directValue)) return 0;
  return Math.max(0, Math.floor(directValue));
};

// Component to display feature uses tracker
function FeatureUsesTracker({ maxUses, featureId, onUsesChange, storedUses }) {
  const getDefaultUses = () => (maxUses > 5 ? maxUses : 0);
  const normalizeUses = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return getDefaultUses();
    return Math.min(Math.max(value, 0), maxUses);
  };

  const [currentUses, setCurrentUses] = useState(normalizeUses(storedUses));

  useEffect(() => {
    setCurrentUses(normalizeUses(storedUses));
  }, [storedUses, maxUses]);
  
  if (!maxUses || maxUses <= 0) return null;
  
  const toggleUse = (index) => {
    const newUses = currentUses === index + 1 ? index : index + 1;
    setCurrentUses(newUses);
    onUsesChange?.(featureId, newUses);
  };

  const spendUse = () => {
    if (currentUses > 0) {
      const newUses = currentUses - 1;
      setCurrentUses(newUses);
      onUsesChange?.(featureId, newUses);
    }
  };

  const restoreUse = () => {
    if (currentUses < maxUses) {
      const newUses = currentUses + 1;
      setCurrentUses(newUses);
      onUsesChange?.(featureId, newUses);
    }
  };
  
  // Show counter for 6+ uses, otherwise show clickable boxes
  if (maxUses > 5) {
    return (
      <div className="uses-counter">
        <button 
          className="uses-btn uses-btn-spend"
          onClick={spendUse}
          disabled={currentUses === 0}
          title="Spend a use"
        >
          −
        </button>
        <span className="uses-count">{currentUses}</span>
        <span className="uses-separator">/</span>
        <span className="uses-max">{maxUses}</span>
        <button 
          className="uses-btn uses-btn-restore"
          onClick={restoreUse}
          disabled={currentUses === maxUses}
          title="Restore a use"
        >
          +
        </button>
        <button 
          className="uses-reset"
          onClick={(event) => {
            const button = event.currentTarget;
            button.classList.remove('is-spinning');
            void button.offsetWidth;
            button.classList.add('is-spinning');
            setCurrentUses(maxUses);
            onUsesChange?.(featureId, maxUses);
          }}
          type="button"
          aria-label="Reset uses"
        >
          <svg className="uses-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }
  
  // Show clickable boxes for 1-5 uses
  return (
    <div className="uses-boxes">
      <div className="uses-boxes-grid">
        {Array.from({ length: maxUses }).map((_, idx) => (
          <button
            key={idx}
            className={`use-box ${currentUses > idx ? 'used' : ''}`}
            onClick={() => toggleUse(idx)}
            title={`Use ${idx + 1}/${maxUses}`}
          />
        ))}
      </div>
      <button
        className="uses-reset"
        onClick={(event) => {
          const button = event.currentTarget;
          button.classList.remove('is-spinning');
          void button.offsetWidth;
          button.classList.add('is-spinning');
          setCurrentUses(0);
          onUsesChange?.(featureId, 0);
        }}
        type="button"
        aria-label="Reset uses"
      >
        <svg className="uses-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function FeaturePoolTracker({ poolMax, featureId, poolName, storedValue, onPoolChange }) {
  const normalizeValue = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return poolMax;
    return Math.min(Math.max(value, 0), poolMax);
  };

  const [currentValue, setCurrentValue] = useState(normalizeValue(storedValue));

  useEffect(() => {
    setCurrentValue(normalizeValue(storedValue));
  }, [storedValue, poolMax]);

  if (!poolMax || poolMax <= 0) return null;

  const setValue = (nextValue) => {
    const normalized = Math.min(Math.max(nextValue, 0), poolMax);
    setCurrentValue(normalized);
    onPoolChange?.(featureId, normalized);
  };

  return (
    <div className="pool-tracker" onClick={(event) => event.stopPropagation()}>
      {poolName ? <span className="pool-name">{poolName}</span> : null}
      <button className="pool-btn" type="button" onClick={() => setValue(currentValue - 1)} disabled={currentValue <= 0}>-</button>
      <input
        className="pool-input"
        type="number"
        min={0}
        max={poolMax}
        value={currentValue}
        onChange={(event) => setValue(Number.parseInt(event.target.value, 10) || 0)}
      />
      <span className="pool-separator">/</span>
      <span className="pool-max">{poolMax}</span>
      <button className="pool-btn" type="button" onClick={() => setValue(currentValue + 1)} disabled={currentValue >= poolMax}>+</button>
      <button
        className="pool-reset"
        type="button"
        onClick={(event) => {
          const button = event.currentTarget;
          button.classList.remove('is-spinning');
          void button.offsetWidth;
          button.classList.add('is-spinning');
          setValue(poolMax);
        }}
        aria-label="Reset pool"
      >
        <svg className="pool-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function FeatureGaugeTracker({ gauge, featureId, storedState, onGaugeChange }) {
  if (!gauge || !featureId) return null;

  const normalizedStored = normalizeGaugeSnapshot(storedState, gauge);

  const [localValue, setLocalValue] = useState(normalizedStored.value);
  const [localCharges, setLocalCharges] = useState(normalizedStored.charges);
  const [localValueDraft, setLocalValueDraft] = useState(String(normalizedStored.value));

  useEffect(() => {
    const normalized = normalizeGaugeSnapshot(storedState, gauge);
    setLocalValue(normalized.value);
    setLocalCharges(normalized.charges);
    setLocalValueDraft(String(normalized.value));
  }, [storedState, gauge]);

  const pushState = (value, charges) => {
    const normalized = normalizeGaugeSnapshot({
      value,
      charges,
      lastProgressAt: Date.now(),
    }, gauge);
    setLocalValue(normalized.value);
    setLocalCharges(normalized.charges);
    setLocalValueDraft(String(normalized.value));
    onGaugeChange?.(featureId, normalized);
  };

  const commitDraftValue = (draftValue) => {
    if (draftValue === '') {
      pushState(0, localCharges);
      return;
    }
    const parsed = Number.parseInt(draftValue, 10);
    pushState(Number.isNaN(parsed) ? 0 : parsed, localCharges);
  };

  return (
    <div className="gauge-tracker" onClick={(event) => event.stopPropagation()}>
      <span className="gauge-name">{gauge.name || 'Gauge'}</span>
      <div className="gauge-value-controls">
        <input
          className="gauge-value-input"
          type="number"
          min={0}
          max={gauge.threshold}
          value={localValueDraft}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '' || /^\d+$/.test(raw)) {
              setLocalValueDraft(raw);
            }
          }}
          onBlur={() => commitDraftValue(localValueDraft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraftValue(localValueDraft);
            }
          }}
          aria-label="Gauge value"
        />
        <span className="gauge-threshold">/ {gauge.threshold}</span>
      </div>
      <div className="gauge-charge-controls">
        <button
          type="button"
          className={`use-box ${localCharges > 0 ? 'used' : ''}`}
          onClick={() => pushState(localValue, localCharges > 0 ? 0 : 1)}
          aria-label="Toggle gauge charge"
          title="Toggle gauge charge"
        />
      </div>
      <button type="button" className="gauge-reset" onClick={() => pushState(0, 0)} aria-label="Reset gauge">Reset</button>
    </div>
  );
}

function FeatureSelectControl({ feature, featureId, activeSelection, onSelectionChange }) {
  if (!feature || !featureId) return null;

  const choices = getFeatureSelectChoices(feature);
  if (!choices.length) return null;

  const handleChoiceClick = (event, choiceName) => {
    event.stopPropagation();
    const nextChoice = activeSelection === choiceName ? null : choiceName;
    onSelectionChange(featureId, nextChoice);
  };

  return (
    <div className="feature-select" onClick={(event) => event.stopPropagation()}>
      <div className="feature-select-label">Choice:</div>
      <div className="feature-select-options">
        {choices.map((choice) => {
          const isActive = activeSelection === choice.name;
          return (
            <button
              key={choice.name}
              type="button"
              className={`feature-select-option ${isActive ? 'active' : ''}`}
              onClick={(event) => handleChoiceClick(event, choice.name)}
              aria-label={`${choice.name}${isActive ? ' (selected)' : ''}`}
            >
              {choice.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Stance Selector Component - renders stance options for stance-type features
function StanceSelector({ feature, featureId, activeStance, onStanceChange }) {
  if (!feature) return null;
  
  const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
  const stanceBenefit = benefits.find(b => b.type === 'stance');
  
  if (!stanceBenefit || !Array.isArray(stanceBenefit.stances) || stanceBenefit.stances.length === 0) {
    return null;
  }
  
  const handleStanceClick = (e, stanceName) => {
    e.stopPropagation();
    // Toggle off if clicking the active stance, otherwise set new stance
    const newStance = activeStance === stanceName ? null : stanceName;
    onStanceChange(featureId, newStance);
  };

  return (
    <div className="stance-selector" onClick={(e) => e.stopPropagation()}>
      <div className="stance-label">Active Stance:</div>
      <div className="stance-options">
        {stanceBenefit.stances.map((stance, idx) => {
          const isActive = activeStance === stance.name;
          return (
            <button
              key={idx}
              className={`stance-option ${isActive ? 'active' : ''}`}
              onClick={(e) => handleStanceClick(e, stance.name)}
              title={stance.description || ''} 
              aria-label={`${stance.name}${isActive ? ' (active)' : ''}`}
            >
              {stance.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tab 4: Actions (extracted to tabs/ActionsTab.jsx)

// Tab 5: Features
function FeaturesTab({ 
  character, 
  proficiencyBonus, 
  abilityModifiers,
  effectiveMaxHP,
  usesState,
  poolState,
  expandedDescriptions,
  onUsesChange,
  onPoolChange,
  onDescriptionToggle,
  activeStances,
  onStanceChange,
  activeFeatureSelections,
  onFeatureSelectionChange
}) {
  const [activeSubtab, setActiveSubtab] = useState('class');


  return (
    <div className="features-tab">
      <h2>Features & Traits</h2>
      
      {/* Feature Subtabs */}
      <div className="feature-subtabs">
        <button
          className={activeSubtab === 'class' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('class')}
        >
          Class
        </button>
        <button
          className={activeSubtab === 'species' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('species')}
        >
          Species
        </button>
        <button
          className={activeSubtab === 'feats' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('feats')}
        >
          Feats
        </button>
      </div>

      {/* Subtab Content */}
      <div className="feature-subtab-content">
        {activeSubtab === 'class' && (
          <ClassFeaturesSubtab
            character={character}
            proficiencyBonus={proficiencyBonus}
            abilityModifiers={abilityModifiers}
            effectiveMaxHP={effectiveMaxHP}
            onUsesChange={onUsesChange}
            usesState={usesState}
            poolState={poolState}
            onPoolChange={onPoolChange}
            expandedDescriptions={expandedDescriptions}
            onDescriptionToggle={onDescriptionToggle}
            activeStances={activeStances}
            onStanceChange={onStanceChange}
            activeFeatureSelections={activeFeatureSelections}
            onFeatureSelectionChange={onFeatureSelectionChange}
          />
        )}
        {activeSubtab === 'species' && (
          <SpeciesFeaturesSubtab
            character={character}
            proficiencyBonus={proficiencyBonus}
            abilityModifiers={abilityModifiers}
            effectiveMaxHP={effectiveMaxHP}
            onUsesChange={onUsesChange}
            usesState={usesState}
            poolState={poolState}
            onPoolChange={onPoolChange}
            expandedDescriptions={expandedDescriptions}
            onDescriptionToggle={onDescriptionToggle}
            activeStances={activeStances}
            onStanceChange={onStanceChange}
            activeFeatureSelections={activeFeatureSelections}
            onFeatureSelectionChange={onFeatureSelectionChange}
          />
        )}
        {activeSubtab === 'feats' && (
          <FeatsSubtab
            character={character}
            proficiencyBonus={proficiencyBonus}
            abilityModifiers={abilityModifiers}
            effectiveMaxHP={effectiveMaxHP}
            onUsesChange={onUsesChange}
            usesState={usesState}
            poolState={poolState}
            onPoolChange={onPoolChange}
            expandedDescriptions={expandedDescriptions}
            onDescriptionToggle={onDescriptionToggle}
            activeStances={activeStances}
            onStanceChange={onStanceChange}
            activeFeatureSelections={activeFeatureSelections}
            onFeatureSelectionChange={onFeatureSelectionChange}
          />
        )}
      </div>
    </div>
  );
}

// Feature Subtab: Class Features
function ClassFeaturesSubtab({ character, proficiencyBonus, abilityModifiers, effectiveMaxHP, onUsesChange, usesState, poolState, onPoolChange, expandedDescriptions, onDescriptionToggle, activeStances, onStanceChange, activeFeatureSelections, onFeatureSelectionChange }) {
  // Handle both old (string) and new (object) source formats
  const isNewSourceFormat = (feature) => {
    return typeof feature.source === 'object' && feature.source?.source;
  };
  const getSourceType = (feature) => {
    if (isNewSourceFormat(feature)) {
      return feature.source.source;
    }
    return feature.source;
  };
  
  const getSourceLevel = (feature) => {
    if (isNewSourceFormat(feature)) {
      return feature.source.level;
    }
    return null;
  };

  // Get class and subclass names from character
  const primaryClass = character.classes?.[0];
  const className = primaryClass?.class || 'Unknown';
  const subclassName = primaryClass?.subclass || null;

  // Helper to get source display name
  const getSourceDisplayName = (feature) => {
    const sourceType = getSourceType(feature);
    if (sourceType === 'subclass') {
      return subclassName || 'Subclass';
    }
    return className;
  };

  let subclassFeatures = character.features?.filter(f => getSourceType(f) === 'subclass') || [];
  let invocationFeatures = character.features?.filter(f => getSourceType(f) === 'invocation') || [];
  let divinityFeatures = character.features?.filter(f => getSourceType(f) === 'divinity') || [];
  let fightingStyleFeatures = character.features?.filter(f => getSourceType(f) === 'fighting') || [];
  let classFeatures = character.features?.filter(f => getSourceType(f) === 'class') || [];

  // Sort by level
  subclassFeatures = [...subclassFeatures].sort((a, b) => (getSourceLevel(a) || 0) - (getSourceLevel(b) || 0));
  invocationFeatures = [...invocationFeatures].sort((a, b) => (getSourceLevel(a) || 0) - (getSourceLevel(b) || 0));
  divinityFeatures = [...divinityFeatures].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  fightingStyleFeatures = [...fightingStyleFeatures].sort((a, b) => (getSourceLevel(a) || 0) - (getSourceLevel(b) || 0));
  classFeatures = [...classFeatures].sort((a, b) => (getSourceLevel(a) || 0) - (getSourceLevel(b) || 0));
  
  if (subclassFeatures.length === 0 && invocationFeatures.length === 0 && divinityFeatures.length === 0 && fightingStyleFeatures.length === 0 && classFeatures.length === 0) {
    return (
      <div className="class-features">
        <p className="info-text">No class features found.</p>
      </div>
    );
  }

  return (
    <div className="class-features">
      {/* Subclass Features */}
      {subclassFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Subclass Features</h4>
          <div className="feature-list">
            {subclassFeatures.map((feature, idx) => {
              const sourceDisplay = getSourceDisplayName(feature);
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `subclass-${feature.name || idx}`;
              const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
              const featureGauge = getFeatureGauge(feature, character.level, abilityModifiers, effectiveMaxHP);
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{sourceDisplay} — {featureLevel}</span>}
                  </div>
                  {(
                    <FeatureUsesTracker 
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {featurePool && (
                    <FeaturePoolTracker
                      poolMax={featurePool.max}
                      featureId={`${featureId}-pool`}
                      poolName={featurePool.name}
                      storedValue={poolState[`${featureId}-pool`]}
                      onPoolChange={onPoolChange}
                    />
                  )}
                  {featureGauge && (
                    <FeatureGaugeTracker
                      gauge={featureGauge}
                      featureId={`${featureId}-gauge`}
                      storedState={poolState[`${featureId}-gauge`]}
                      onGaugeChange={onPoolChange}
                    />
                  )}
                  <FeatureSelectControl
                    feature={feature}
                    featureId={featureId}
                    activeSelection={activeFeatureSelections?.[featureId]}
                    onSelectionChange={onFeatureSelectionChange}
                  />
                  <StanceSelector
                    feature={feature}
                    featureId={featureId}
                    activeStance={activeStances?.[featureId]}
                    onStanceChange={onStanceChange}
                  />
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Eldritch Invocations */}
      {invocationFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Eldritch Invocations</h4>
          <div className="feature-list">
            {invocationFeatures.map((feature, idx) => {
              const sourceDisplay = getSourceDisplayName(feature);
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `invocation-${feature.name || idx}`;
              const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
              const featureGauge = getFeatureGauge(feature, character.level, abilityModifiers, effectiveMaxHP);
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{sourceDisplay} — {featureLevel}</span>}
                  </div>
                  {(
                    <FeatureUsesTracker 
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {featurePool && (
                    <FeaturePoolTracker
                      poolMax={featurePool.max}
                      featureId={`${featureId}-pool`}
                      poolName={featurePool.name}
                      storedValue={poolState[`${featureId}-pool`]}
                      onPoolChange={onPoolChange}
                    />
                  )}
                  {featureGauge && (
                    <FeatureGaugeTracker
                      gauge={featureGauge}
                      featureId={`${featureId}-gauge`}
                      storedState={poolState[`${featureId}-gauge`]}
                      onGaugeChange={onPoolChange}
                    />
                  )}
                  <FeatureSelectControl
                    feature={feature}
                    featureId={featureId}
                    activeSelection={activeFeatureSelections?.[featureId]}
                    onSelectionChange={onFeatureSelectionChange}
                  />
                  <StanceSelector
                    feature={feature}
                    featureId={featureId}
                    activeStance={activeStances?.[featureId]}
                    onStanceChange={onStanceChange}
                  />
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Class Features */}
      {fightingStyleFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Fighting Styles</h4>
          <div className="feature-list">
            {fightingStyleFeatures.map((feature, idx) => {
              const sourceDisplay = getSourceDisplayName(feature);
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `fighting-${feature.name || idx}`;
              const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
              const featureGauge = getFeatureGauge(feature, character.level, abilityModifiers, effectiveMaxHP);
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{sourceDisplay} — {featureLevel}</span>}
                  </div>
                  {(
                    <FeatureUsesTracker 
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {featurePool && (
                    <FeaturePoolTracker
                      poolMax={featurePool.max}
                      featureId={`${featureId}-pool`}
                      poolName={featurePool.name}
                      storedValue={poolState[`${featureId}-pool`]}
                      onPoolChange={onPoolChange}
                    />
                  )}
                  {featureGauge && (
                    <FeatureGaugeTracker
                      gauge={featureGauge}
                      featureId={`${featureId}-gauge`}
                      storedState={poolState[`${featureId}-gauge`]}
                      onGaugeChange={onPoolChange}
                    />
                  )}
                  <FeatureSelectControl
                    feature={feature}
                    featureId={featureId}
                    activeSelection={activeFeatureSelections?.[featureId]}
                    onSelectionChange={onFeatureSelectionChange}
                  />
                  <StanceSelector
                    feature={feature}
                    featureId={featureId}
                    activeStance={activeStances?.[featureId]}
                    onStanceChange={onStanceChange}
                  />
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Channel Divinity Options */}
      {divinityFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Channel Divinity Options</h4>
          <div className="feature-list">
            {divinityFeatures.map((feature, idx) => {
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `divinity-${feature.name || idx}`;
              const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
              const featureGauge = getFeatureGauge(feature, character.level, abilityModifiers, effectiveMaxHP);
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{featureLevel}</span>}
                  </div>
                  {(
                    <FeatureUsesTracker
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {featurePool && (
                    <FeaturePoolTracker
                      poolMax={featurePool.max}
                      featureId={`${featureId}-pool`}
                      poolName={featurePool.name}
                      storedValue={poolState[`${featureId}-pool`]}
                      onPoolChange={onPoolChange}
                    />
                  )}
                  {featureGauge && (
                    <FeatureGaugeTracker
                      gauge={featureGauge}
                      featureId={`${featureId}-gauge`}
                      storedState={poolState[`${featureId}-gauge`]}
                      onGaugeChange={onPoolChange}
                    />
                  )}
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Class Features */}
      {classFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Class Features</h4>
          <div className="feature-list">
            {classFeatures.map((feature, idx) => {
              const sourceDisplay = getSourceDisplayName(feature);
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `class-${feature.name || idx}`;
              const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
              const featureGauge = getFeatureGauge(feature, character.level, abilityModifiers, effectiveMaxHP);
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{sourceDisplay} — {featureLevel}</span>}
                  </div>
                  {(
                    <FeatureUsesTracker 
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {featurePool && (
                    <FeaturePoolTracker
                      poolMax={featurePool.max}
                      featureId={`${featureId}-pool`}
                      poolName={featurePool.name}
                      storedValue={poolState[`${featureId}-pool`]}
                      onPoolChange={onPoolChange}
                    />
                  )}
                  {featureGauge && (
                    <FeatureGaugeTracker
                      gauge={featureGauge}
                      featureId={`${featureId}-gauge`}
                      storedState={poolState[`${featureId}-gauge`]}
                      onGaugeChange={onPoolChange}
                    />
                  )}
                  <FeatureSelectControl
                    feature={feature}
                    featureId={featureId}
                    activeSelection={activeFeatureSelections?.[featureId]}
                    onSelectionChange={onFeatureSelectionChange}
                  />
                  <StanceSelector
                    feature={feature}
                    featureId={featureId}
                    activeStance={activeStances?.[featureId]}
                    onStanceChange={onStanceChange}
                  />
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Feature Subtab: Species Features
function SpeciesFeaturesSubtab({ character, proficiencyBonus, abilityModifiers, effectiveMaxHP, onUsesChange, usesState, poolState, onPoolChange, expandedDescriptions, onDescriptionToggle, activeStances, onStanceChange, activeFeatureSelections, onFeatureSelectionChange }) {
  // Handle both old (string) and new (object) source formats
  const isNewSourceFormat = (feature) => {
    return typeof feature.source === 'object' && feature.source?.source;
  };
  const getSourceType = (feature) => {
    if (isNewSourceFormat(feature)) {
      return feature.source.source;
    }
    return feature.source;
  };
  
  const allSpeciesFeatures = character.features?.filter(f => getSourceType(f) === 'species') || [];
  
  // Separate core and non-core features
  const coreFeatures = allSpeciesFeatures.filter(f => 
    isNewSourceFormat(f) && f.source.core === true
  );
  const nonCoreFeatures = allSpeciesFeatures.filter(f => 
    !isNewSourceFormat(f) || f.source.core !== true
  );
  
  // Get species name from the first feature with new source format
  const speciesName = allSpeciesFeatures.find(f => isNewSourceFormat(f) && f.source.species)?.source.species || 'Species';
  
  if (allSpeciesFeatures.length === 0) {
    return (
      <div className="species-features">
        <p className="info-text">No species traits found.</p>
      </div>
    );
  }

  // Bundle core features into a single feature
  const bundledCoreFeature = coreFeatures.length > 0 ? {
    id: `species-core-${speciesName}`,
    name: speciesName,
    description: coreFeatures.map(f => f.description).filter(Boolean).join('\n\n'),
    max_uses: null, // Core features don't have uses
  } : null;

  return (
    <div className="species-features">
      <div className="feature-list">
        {/* Bundled core features at the top */}
        {bundledCoreFeature && (
          <div
            key="core-bundle"
            className="feature-item"
            onClick={(event) => {
              if (isFeatureToggleIgnored(event.target)) return;
              onDescriptionToggle(bundledCoreFeature.id);
            }}
          >
            <div className="feature-header">
              <h3 className="feature-name">{bundledCoreFeature.name}</h3>
            </div>
            {bundledCoreFeature.description && (
              <FeatureDescriptionBlock
                featureId={bundledCoreFeature.id}
                description={bundledCoreFeature.description}
                expanded={!!expandedDescriptions[bundledCoreFeature.id]}
                onToggle={onDescriptionToggle}
              />
            )}
          </div>
        )}
        
        {/* Non-core features */}
        {nonCoreFeatures.map((feature, idx) => {
          const featureId = feature.id || `species-${feature.name || idx}`;
          const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
          const featureGauge = getFeatureGauge(feature, character.level, abilityModifiers, effectiveMaxHP);
          return (
          <div
            key={idx}
            className="feature-item"
            onClick={(event) => {
              if (isFeatureToggleIgnored(event.target)) return;
              onDescriptionToggle(featureId);
            }}
          >
            <div className="feature-header">
              <h3 className="feature-name">{feature.name}</h3>
            </div>
            {(
              <FeatureUsesTracker 
                maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                featureId={featureId}
                storedUses={usesState[featureId]}
                onUsesChange={onUsesChange}
              />
            )}
            {featurePool && (
              <FeaturePoolTracker
                poolMax={featurePool.max}
                featureId={`${featureId}-pool`}
                poolName={featurePool.name}
                storedValue={poolState[`${featureId}-pool`]}
                onPoolChange={onPoolChange}
              />
            )}
            {featureGauge && (
              <FeatureGaugeTracker
                gauge={featureGauge}
                featureId={`${featureId}-gauge`}
                storedState={poolState[`${featureId}-gauge`]}
                onGaugeChange={onPoolChange}
              />
            )}
            <FeatureSelectControl
              feature={feature}
              featureId={featureId}
              activeSelection={activeFeatureSelections?.[featureId]}
              onSelectionChange={onFeatureSelectionChange}
            />
            <StanceSelector
              feature={feature}
              featureId={featureId}
              activeStance={activeStances?.[featureId]}
              onStanceChange={onStanceChange}
            />
            {feature.description && (
              <FeatureDescriptionBlock
                featureId={featureId}
                description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                expanded={!!expandedDescriptions[featureId]}
                onToggle={onDescriptionToggle}
              />
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}

// Feature Subtab: Feats (includes background features)
function FeatsSubtab({ character, proficiencyBonus, abilityModifiers, effectiveMaxHP, onUsesChange, usesState, poolState, onPoolChange, expandedDescriptions, onDescriptionToggle, activeStances, onStanceChange, activeFeatureSelections, onFeatureSelectionChange }) {
  // Handle both old (string) and new (object) source formats
  const isNewSourceFormat = (item) => {
    return typeof item.source === 'object' && item.source?.source;
  };
  const getSourceType = (item) => {
    if (isNewSourceFormat(item)) {
      return item.source.source;
    }
    return item.source;
  };

  const backgroundFeatures = character.features?.filter(f => getSourceType(f) === 'background') || [];
  const feats = character.feats || [];
  
  if (backgroundFeatures.length === 0 && feats.length === 0) {
    return (
      <div className="feats">
        <p className="info-text">No feats or background features found.</p>
      </div>
    );
  }

  return (
    <div className="feats">
      <div className="feature-list">
        {/* Background Features */}
        {backgroundFeatures.map((feature, idx) => {
          const featureId = feature.id || `bg-${feature.name || idx}`;
          const featurePool = getFeaturePool(feature, character.level, abilityModifiers);
          return (
          <div
            key={`bg-${idx}`}
            className="feature-item"
            onClick={(event) => {
              if (isFeatureToggleIgnored(event.target)) return;
              onDescriptionToggle(featureId);
            }}
          >
            <div className="feature-header">
              <h3 className="feature-name">{feature.name}</h3>
              <span className="feature-source">Background</span>
            </div>
            {(
              <FeatureUsesTracker 
                maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character.level, feature)}
                featureId={featureId}
                storedUses={usesState[featureId]}
                onUsesChange={onUsesChange}
              />
            )}
            {featurePool && (
              <FeaturePoolTracker
                poolMax={featurePool.max}
                featureId={`${featureId}-pool`}
                poolName={featurePool.name}
                storedValue={poolState[`${featureId}-pool`]}
                onPoolChange={onPoolChange}
              />
            )}
            <FeatureSelectControl
              feature={feature}
              featureId={featureId}
              activeSelection={activeFeatureSelections?.[featureId]}
              onSelectionChange={onFeatureSelectionChange}
            />
            <StanceSelector
              feature={feature}
              featureId={featureId}
              activeStance={activeStances?.[featureId]}
              onStanceChange={onStanceChange}
            />
            {feature.description && (
              <FeatureDescriptionBlock
                featureId={featureId}
                description={interpolateFeatureText(feature.description, feature, character.level, proficiencyBonus, abilityModifiers)}
                expanded={!!expandedDescriptions[featureId]}
                onToggle={onDescriptionToggle}
              />
            )}
          </div>
        );
        })}
        
        {/* Feats */}
        {feats.map((featEntry, idx) => {
          const joinedFeat = getJoinedFeat(featEntry);
          const feat = joinedFeat || featEntry;
          const normalizedChoices = normalizeFeatChoices(featEntry);
          const sourceType = getSourceType(featEntry) || getSourceType(feat);
          const sourceLevel = isNewSourceFormat(featEntry)
            ? featEntry.source.level
            : (isNewSourceFormat(feat) ? feat.source.level : null);
          const featId = featEntry.id || feat.id || `feat-${feat.name || idx}`;
          const featName = feat.name || featEntry.name || 'Unnamed Feat';
          const featDescription = feat.description || featEntry.description;
          const featMaxUses = feat.max_uses ?? featEntry.max_uses;
          const featurePool = getFeaturePool(feat, character.level, abilityModifiers);
          const hasChoiceSummary = Boolean(normalizedChoices?.asi || (normalizedChoices?.grantedSpells || []).length > 0);
          
          return (
            <div
              key={`feat-${idx}`}
              className="feature-item"
              onClick={(event) => {
                if (isFeatureToggleIgnored(event.target)) return;
                onDescriptionToggle(featId);
              }}
            >
              <div className="feature-header">
                <h3 className="feature-name">{featName}</h3>
                {sourceType && <span className="feature-source">{sourceType}{sourceLevel ? ` (Level ${sourceLevel})` : ''}</span>}
              </div>
              {featMaxUses && (
                <FeatureUsesTracker 
                  maxUses={calculateMaxUses(featMaxUses, proficiencyBonus, abilityModifiers, character.level)}
                  featureId={featId}
                  storedUses={usesState[featId]}
                  onUsesChange={onUsesChange}
                />
              )}
              {featurePool && (
                <FeaturePoolTracker
                  poolMax={featurePool.max}
                  featureId={`${featId}-pool`}
                  poolName={featurePool.name}
                  storedValue={poolState[`${featId}-pool`]}
                  onPoolChange={onPoolChange}
                />
              )}
              <FeatureSelectControl
                feature={feat}
                featureId={featId}
                activeSelection={activeFeatureSelections?.[featId]}
                onSelectionChange={onFeatureSelectionChange}
              />
              <StanceSelector
                feature={feat}
                featureId={featId}
                activeStance={activeStances?.[featId]}
                onStanceChange={onStanceChange}
              />
              {featDescription && (
                <FeatureDescriptionBlock
                  featureId={featId}
                  description={interpolateFeatureText(featDescription, feat, character.level, proficiencyBonus, abilityModifiers)}
                  expanded={!!expandedDescriptions[featId]}
                  onToggle={onDescriptionToggle}
                />
              )}
              {hasChoiceSummary && (
                <div className="feature-choices">
                  {normalizedChoices.asi && (
                    <p>
                      <strong>ASI:</strong> +{normalizedChoices.asi.amount} {normalizedChoices.asi.ability.charAt(0).toUpperCase() + normalizedChoices.asi.ability.slice(1)}
                    </p>
                  )}
                  {normalizedChoices.grantedSpells.length > 0 && (
                    <p>
                      <strong>Spells:</strong> {normalizedChoices.grantedSpells.map((spell) => spell.name).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tab 6: Bio
// HP Edit Modal
function HPEditModal({
  currentHP,
  setCurrentHP,
  tempHP,
  setTempHP,
  maxHPModifier,
  setMaxHPModifier,
  barrierPools,
  barrierCurrentTotal,
  barrierMaxTotal,
  onBarrierPoolChange,
  onDamageTaken,
  deathSaveSuccesses,
  setDeathSaveSuccesses,
  deathSaveFailures,
  setDeathSaveFailures,
  maxHP,
  damageInput,
  setDamageInput,
  isOpen,
  onClose,
}) {
  const displayMaxHP = maxHP + maxHPModifier;
  const crossIconSrc = '/icons/util/cross.svg';

  const setBarrierPoolValue = (pool, nextValue) => {
    const normalized = Math.max(0, Math.min(pool.max, nextValue));
    onBarrierPoolChange?.(pool.id, normalized);
  };

  const adjustBarrierPool = (pool, delta) => {
    setBarrierPoolValue(pool, pool.current + delta);
  };

  // Check if input is a valid positive integer
  const parsedAmount = parseInt(damageInput);
  const isValidInput = damageInput && !isNaN(parsedAmount) && parsedAmount > 0 && !damageInput.includes('.') && !damageInput.includes('-');

  const handleDamage = () => {
    const damageAmount = parseInt(damageInput);
    // Only allow positive integers
    if (!damageInput || isNaN(damageAmount) || damageAmount <= 0 || damageInput.includes('.') || damageInput.includes('-')) return;

    onDamageTaken?.(damageAmount);

    let remainingDamage = damageAmount;

    // Damage reduces barrier pools first.
    if (Array.isArray(barrierPools) && barrierPools.length > 0) {
      barrierPools.forEach((pool) => {
        if (remainingDamage <= 0) return;
        const absorbed = Math.min(pool.current, remainingDamage);
        if (absorbed <= 0) return;
        onBarrierPoolChange?.(pool.id, pool.current - absorbed);
        remainingDamage -= absorbed;
      });
    }

    // Then temp HP, then current HP.
    if (remainingDamage > 0 && tempHP > 0) {
      const tempDamage = Math.min(tempHP, remainingDamage);
      setTempHP(tempHP - tempDamage);
      remainingDamage -= tempDamage;
    }

    let newCurrent = currentHP - remainingDamage;
    
    newCurrent = Math.max(0, Math.min(newCurrent, displayMaxHP));
    setCurrentHP(newCurrent);
  };

  const handleHealing = () => {
    const healAmount = parseInt(damageInput);
    // Only allow positive integers
    if (!damageInput || isNaN(healAmount) || healAmount <= 0 || damageInput.includes('.') || damageInput.includes('-')) return;
    
    const newCurrent = Math.max(0, Math.min(currentHP + healAmount, displayMaxHP));
    setCurrentHP(newCurrent);
  };

  if (!isOpen) return null;

  return (
    <div className="hp-modal-overlay">
      <div className="hp-modal">
        <img
          src="/textures/materials/Journal.png"
          alt=""
          className="hp-modal-bg"
        />
        
        <button className="hp-modal-close" onClick={onClose} aria-label="Close HP modal">
          <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
        </button>

        <div className="hp-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="hp-modal-toolbar">
            <button className="hp-modal-close-inline" onClick={onClose} aria-label="Close HP modal">
              <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
            </button>
          </div>
          {/* Total Display */}
          <div className="hp-total">
            <span className="hp-total-label hp-total-label-top">Total</span>
            <div className="hp-total-values">
              <span className="hp-total-value hp-value-current">{currentHP}</span>
              <span className="hp-total-separator">/</span>
              <span className={maxHPModifier !== 0 ? 'hp-total-value hp-value-mod' : 'hp-total-value hp-value-current'}>
                {displayMaxHP}
              </span>
              {barrierCurrentTotal > 0 && (
                <span className="hp-total-value hp-value-barrier">+{barrierCurrentTotal}</span>
              )}
              {tempHP > 0 && (
                <span className="hp-total-value hp-value-temp">+{tempHP}</span>
              )}
            </div>
            <span className="hp-total-label hp-total-label-bottom">HP</span>
          </div>

          {barrierPools.length > 0 && (
            <div className="hp-barrier-section" aria-label="Barrier pool tracker">
              <div className="hp-barrier-summary">
                <span className="hp-barrier-title">Barrier</span>
                <span className="hp-barrier-total">{barrierCurrentTotal}/{barrierMaxTotal}</span>
              </div>
              <div className="hp-barrier-list">
                {barrierPools.map((pool) => (
                  <div key={pool.id} className="hp-barrier-row">
                    <span className="hp-barrier-name">{pool.name}</span>
                    <div className="hp-barrier-controls">
                      <button
                        type="button"
                        className="hp-barrier-btn"
                        onClick={() => adjustBarrierPool(pool, -1)}
                        disabled={pool.current <= 0}
                        aria-label={`Reduce ${pool.name} by 1`}
                      >
                        -
                      </button>
                      <input
                        className="hp-barrier-input"
                        type="number"
                        min="0"
                        max={pool.max}
                        value={pool.current}
                        onChange={(e) => {
                          const nextValue = Math.max(0, Math.min(pool.max, parseInt(e.target.value, 10) || 0));
                          onBarrierPoolChange?.(pool.id, nextValue);
                        }}
                      />
                      <span className="hp-barrier-max">/ {pool.max}</span>
                      <button
                        type="button"
                        className="hp-barrier-btn"
                        onClick={() => adjustBarrierPool(pool, 1)}
                        disabled={pool.current >= pool.max}
                        aria-label={`Increase ${pool.name} by 1`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="hp-barrier-fill-btn"
                        onClick={() => setBarrierPoolValue(pool, pool.max)}
                        disabled={pool.current >= pool.max}
                        aria-label={`Restore ${pool.name} to full`}
                      >
                        Max
                      </button>
                      {pool.barrierFillAmount > 0 && (
                        <button
                          type="button"
                          className="hp-barrier-fill-btn"
                          onClick={() => adjustBarrierPool(pool, pool.barrierFillAmount)}
                          disabled={pool.current >= pool.max}
                          aria-label={`Add ${pool.barrierFillAmount} to ${pool.name}`}
                        >
                          +{pool.barrierFillAmount} {pool.barrierFillLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentHP === 0 && (
            <div className="hp-death-saves" aria-label="Death saves tracker">
              <span className="hp-death-saves-title">Death Saves</span>
              <div className="hp-death-saves-rows">
                <div className="hp-death-saves-row">
                  <span className="hp-death-saves-label success">Success</span>
                  <div className="hp-death-saves-marks" role="group" aria-label="Death save successes">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={`success-${n}`}
                        type="button"
                        className={`hp-death-mark success${deathSaveSuccesses >= n ? ' active' : ''}`}
                        onClick={() => setDeathSaveSuccesses(deathSaveSuccesses === n ? n - 1 : n)}
                        aria-label={`Set ${n} death save success${n > 1 ? 'es' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="hp-death-saves-row">
                  <span className="hp-death-saves-label failure">Failure</span>
                  <div className="hp-death-saves-marks" role="group" aria-label="Death save failures">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={`failure-${n}`}
                        type="button"
                        className={`hp-death-mark failure${deathSaveFailures >= n ? ' active' : ''}`}
                        onClick={() => setDeathSaveFailures(deathSaveFailures === n ? n - 1 : n)}
                        aria-label={`Set ${n} death save failure${n > 1 ? 's' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="hp-fields-row">
            {/* Current HP */}
            <div className="hp-field hp-field-compact hp-field-current">
              <label>Current HP:</label>
              <input 
                type="number" 
                value={currentHP} 
                onChange={(e) => setCurrentHP(Math.max(0, Math.min(parseInt(e.target.value) || 0, displayMaxHP)))}
                min="0"
                max={displayMaxHP}
              />
            </div>

            {/* Max HP Modifier */}
            <div className="hp-field hp-field-compact hp-field-mod">
              <label>Max HP Modifier:</label>
              <input 
                type="number" 
                value={maxHPModifier === 0 ? '' : maxHPModifier} 
                onChange={(e) => setMaxHPModifier(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* Temp HP */}
            <div className="hp-field hp-field-compact hp-field-temp">
              <label>Temporary HP:</label>
              <input 
                type="number" 
                value={tempHP === 0 ? '' : tempHP} 
                onChange={(e) => setTempHP(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          {/* Damage/Healing Calculator */}
          <div className="hp-calculator">
            <div className="hp-calculator-inputs">
              <button onClick={handleDamage} className="hp-damage-btn" aria-label="Apply damage" type="button" disabled={!isValidInput}>
                <img
                  src="/Damage.png"
                  alt=""
                  className="hp-action-icon"
                />
              </button>
              <input 
                type="number" 
                value={damageInput} 
                onChange={(e) => setDamageInput(e.target.value)}
                placeholder="0"
              />
              <button onClick={handleHealing} className="hp-healing-btn" aria-label="Apply healing" type="button" disabled={!isValidInput}>
                <img
                  src="/Healing.png"
                  alt=""
                  className="hp-action-icon"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

AbilitiesTab.propTypes = {
  character: PropTypes.object.isRequired,
  strMod: PropTypes.number.isRequired,
  dexMod: PropTypes.number.isRequired,
  conMod: PropTypes.number.isRequired,
  intMod: PropTypes.number.isRequired,
  wisMod: PropTypes.number.isRequired,
  chaMod: PropTypes.number.isRequired,
  proficiencyBonus: PropTypes.number.isRequired,
  skills: PropTypes.arrayOf(PropTypes.object),
  derivedStats: PropTypes.object,
  allBonuses: PropTypes.arrayOf(PropTypes.object),
  getAbilityBonuses: PropTypes.func,
  inspectorState: PropTypes.object,
  setInspectorState: PropTypes.func,
  baseAbilities: PropTypes.object
};

SkillsTab.propTypes = {
  character: PropTypes.object.isRequired,
  proficiencyBonus: PropTypes.number.isRequired,
  skills: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  features: PropTypes.arrayOf(PropTypes.object),
  derivedMods: PropTypes.object
};

SpellsTab.propTypes = {
  character: PropTypes.object.isRequired,
  spells: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  proficiencyBonus: PropTypes.number,
  derivedMods: PropTypes.object,
  onSpellsUpdate: PropTypes.func
};

InventoryTab.propTypes = {};

FeaturesTab.propTypes = {
  character: PropTypes.object.isRequired
};

HPEditModal.propTypes = {
  currentHP: PropTypes.number,
  setCurrentHP: PropTypes.func.isRequired,
  tempHP: PropTypes.number.isRequired,
  setTempHP: PropTypes.func.isRequired,
  maxHPModifier: PropTypes.number.isRequired,
  setMaxHPModifier: PropTypes.func.isRequired,
  barrierPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    current: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
    barrierFillAmount: PropTypes.number,
    barrierFillLabel: PropTypes.string,
  })).isRequired,
  barrierCurrentTotal: PropTypes.number.isRequired,
  barrierMaxTotal: PropTypes.number.isRequired,
  onBarrierPoolChange: PropTypes.func.isRequired,
  onDamageTaken: PropTypes.func,
  deathSaveSuccesses: PropTypes.number.isRequired,
  setDeathSaveSuccesses: PropTypes.func.isRequired,
  deathSaveFailures: PropTypes.number.isRequired,
  setDeathSaveFailures: PropTypes.func.isRequired,
  maxHP: PropTypes.number.isRequired,
  damageInput: PropTypes.string.isRequired,
  setDamageInput: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default CharacterSheet;
export { HPEditModal };
