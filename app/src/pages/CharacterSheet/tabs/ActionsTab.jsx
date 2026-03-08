import React, { useState, useMemo } from 'react';
import SpellDetailModal from '../../../components/SpellDetailModal';
import SpellRow from '../components/SpellRow';
import { renderSpellDescription } from '../../../lib/spellUtils.jsx';

function normalizeBenefits(rawBenefits) {
  if (Array.isArray(rawBenefits)) return rawBenefits;
  if (rawBenefits && typeof rawBenefits === 'object') {
    return rawBenefits.type ? [rawBenefits] : [];
  }
  if (typeof rawBenefits === 'string') {
    try {
      const parsed = JSON.parse(rawBenefits);
      return normalizeBenefits(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeBenefitType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

// Helper to evaluate pool formulas like "level+wisdom" or "5*level"
function evaluatePoolFormula(formula, level, abilityModifiers) {
  if (!formula || typeof formula !== 'string') return 0;
  
  // Normalize the formula - replace ability names with their modifier values
  let normalizedFormula = formula.toLowerCase().trim();
  
  // Replace ability names with their values
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  abilities.forEach(ability => {
    const value = abilityModifiers[ability] || 0;
    // Use word boundaries to avoid partial matches
    const pattern = new RegExp(`\\b${ability}\\b`, 'gi');
    normalizedFormula = normalizedFormula.replace(pattern, value.toString());
  });
  
  // Replace "level" with the actual level value
  normalizedFormula = normalizedFormula.replace(/\blevel\b/gi, level.toString());
  
  // Safely evaluate the mathematical expression
  try {
    // Only allow numbers, operators, and parentheses for safety
    if (!/^[\d+\-*/().\s]+$/.test(normalizedFormula)) {
      console.warn(`[Pool Formula] Invalid characters in formula: ${formula}`);
      return 0;
    }
    
    // Use Function constructor as a safer alternative to eval
    const result = Function(`"use strict"; return (${normalizedFormula})`)();
    
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Math.max(0, Math.floor(result)); // Ensure non-negative integer
    }
  } catch (error) {
    console.warn(`[Pool Formula] Failed to evaluate formula: ${formula}`, error);
  }
  
  return 0;
}

function hasBenefitType(feature, targetType) {
  const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
  
  // Check top-level benefits
  if (benefits.some((benefit) => normalizeBenefitType(benefit?.type) === targetType)) {
    return true;
  }
  
  // Check nested benefits in stances
  const stanceBenefit = benefits.find(b => normalizeBenefitType(b?.type) === 'stance');
  if (stanceBenefit?.stances && Array.isArray(stanceBenefit.stances)) {
    return stanceBenefit.stances.some(stance => {
      const stanceBenefits = normalizeBenefits(stance?.benefits);
      return stanceBenefits.some(benefit => normalizeBenefitType(benefit?.type) === targetType);
    });
  }
  
  return false;
}

function isMagicItemAttunementRequired(magicItem) {
  const value = magicItem?.requires_attunement;
  if (value === null || value === undefined) return false;
  return String(value).trim().toLowerCase() !== 'no';
}

function getMagicItemActionFeatures(character, targetType) {
  const inventory = Array.isArray(character?.inventory) ? character.inventory : [];
  const features = [];

  inventory.forEach((inventoryItem) => {
    const magicItem = inventoryItem?.magic_item;
    if (!magicItem) return;

    // If an item requires attunement, only expose its action benefits while attuned.
    if (isMagicItemAttunementRequired(magicItem) && !inventoryItem.attuned) return;

    const itemBenefits = normalizeBenefits(
      magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties
    );

    itemBenefits.forEach((benefit, index) => {
      if (normalizeBenefitType(benefit?.type) !== targetType) return;

      const shortParts = [];
      if (benefit?.trigger) shortParts.push(`**Trigger:** ${benefit.trigger}`);
      if (benefit?.description) shortParts.push(benefit.description);
      if (!benefit?.description && benefit?.effect) shortParts.push(benefit.effect);

      features.push({
        id: `magic-item-${inventoryItem.id}-${targetType}-${index}`,
        name: benefit?.name || magicItem.name,
        short: shortParts.join('\n\n') || '',
        max_uses: benefit?.uses?.max ?? null,
        benefits: [benefit],
        source: {
          source: 'item',
          item: magicItem.name,
          inventory_item_id: inventoryItem.id
        }
      });
    });
  });

  return features;
}

function getCharacterLevel(character) {
  const directLevel = Number.parseInt(character?.level, 10);
  if (Number.isFinite(directLevel) && directLevel > 0) {
    return directLevel;
  }

  const classLevels = (character?.classes || []).reduce((total, classEntry) => {
    const level = Number.parseInt(classEntry?.level ?? classEntry?.definition?.level ?? 0, 10);
    return total + (Number.isFinite(level) ? level : 0);
  }, 0);

  return classLevels > 0 ? classLevels : 1;
}

function normalizeFeatureSource(rawSource) {
  if (!rawSource) return {};
  if (rawSource && typeof rawSource === 'object') return rawSource;
  if (typeof rawSource === 'string') {
    try {
      const parsed = JSON.parse(rawSource);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return { source: rawSource };
    }
    return { source: rawSource };
  }
  return {};
}

function getClassLevelForSource(character, sourceInfo) {
  const characterClasses = Array.isArray(character?.classes) ? character.classes : [];
  if (characterClasses.length === 0) return 1;

  const requestedClass = typeof sourceInfo?.class === 'string' ? sourceInfo.class.toLowerCase().trim() : '';

  if (requestedClass) {
    const matchedClass = characterClasses.find((classEntry) => {
      const className = (classEntry?.class || classEntry?.definition?.name || '').toLowerCase().trim();
      return className === requestedClass;
    });

    if (matchedClass) {
      const classLevel = Number.parseInt(matchedClass?.level ?? matchedClass?.definition?.level ?? 0, 10);
      if (Number.isFinite(classLevel) && classLevel > 0) return classLevel;
    }
  }

  if (characterClasses.length === 1) {
    const onlyClassLevel = Number.parseInt(characterClasses[0]?.level ?? characterClasses[0]?.definition?.level ?? 0, 10);
    if (Number.isFinite(onlyClassLevel) && onlyClassLevel > 0) return onlyClassLevel;
  }

  const highestClassLevel = characterClasses.reduce((max, classEntry) => {
    const classLevel = Number.parseInt(classEntry?.level ?? classEntry?.definition?.level ?? 0, 10);
    return Number.isFinite(classLevel) && classLevel > max ? classLevel : max;
  }, 0);

  return highestClassLevel > 0 ? highestClassLevel : 1;
}

function getScalingLevel(feature, character) {
  const sourceInfo = normalizeFeatureSource(feature?.source);
  const sourceType = String(sourceInfo?.source || '').toLowerCase().trim();

  if (sourceType === 'class' || sourceType === 'subclass') {
    return getClassLevelForSource(character, sourceInfo);
  }

  return getCharacterLevel(character);
}

function resolveFeatureScaling(feature, scalingLevel) {
  const benefits = normalizeBenefits(feature?.benefits);
  const featureDieBenefit = benefits.find((benefit) => benefit?.type === 'feature_die' && benefit?.level_scaling);

  if (!featureDieBenefit) return '';

  const baseDie = typeof featureDieBenefit.die === 'string' ? featureDieBenefit.die : '';
  const scaling = featureDieBenefit.level_scaling;
  if (!scaling || typeof scaling !== 'object') return baseDie;

  const thresholds = Object.entries(scaling)
    .map(([level, value]) => [Number.parseInt(level, 10), value])
    .filter(([level, value]) => Number.isFinite(level) && typeof value === 'string')
    .sort((a, b) => a[0] - b[0]);

  let resolved = baseDie;
  thresholds.forEach(([level, value]) => {
    if (scalingLevel >= level) {
      resolved = value;
    }
  });

  return resolved;
}

function resolveFeatureShortText(feature, character, proficiencyBonus = 0, derivedMods = null) {
  const shortText = typeof feature?.short === 'string' ? feature.short : '';
  if (!shortText) return '';

  let result = shortText;
  // Handle ${proficiency} - proficiency bonus
  if (result.includes('${proficiency}')) {
    result = result.replaceAll('${proficiency}', String(proficiencyBonus));
  }

  // Handle ${level} - character level
  if (result.includes('${level}')) {
    const level = getCharacterLevel(character);
    result = result.replaceAll('${level}', String(level));
  }

  // Handle ability interpolations via derived modifiers from CharacterSheet.
  const modifierMap = {
    strength: Number.isFinite(derivedMods?.strength)
      ? derivedMods.strength
      : Math.floor(((character?.strength ?? 10) - 10) / 2),
    dexterity: Number.isFinite(derivedMods?.dexterity)
      ? derivedMods.dexterity
      : Math.floor(((character?.dexterity ?? 10) - 10) / 2),
    constitution: Number.isFinite(derivedMods?.constitution)
      ? derivedMods.constitution
      : Math.floor(((character?.constitution ?? 10) - 10) / 2),
    intelligence: Number.isFinite(derivedMods?.intelligence)
      ? derivedMods.intelligence
      : Math.floor(((character?.intelligence ?? 10) - 10) / 2),
    wisdom: Number.isFinite(derivedMods?.wisdom)
      ? derivedMods.wisdom
      : Math.floor(((character?.wisdom ?? 10) - 10) / 2),
    charisma: Number.isFinite(derivedMods?.charisma)
      ? derivedMods.charisma
      : Math.floor(((character?.charisma ?? 10) - 10) / 2)
  };

  Object.entries(modifierMap).forEach(([ability, modifier]) => {
    const scoreTag = `\${${ability}}`;
    const modTag = `\${${ability}_mod}`;

    if (result.includes(scoreTag)) {
      // `${ability}` resolves to the ability modifier (per sheet conventions).
      result = result.replaceAll(scoreTag, String(modifier));
    }

    if (result.includes(modTag)) {
      result = result.replaceAll(modTag, String(modifier >= 0 ? `+${modifier}` : modifier));
    }
  });

  // Handle ${pb_multiplier} - multiply proficiency bonus by pb_multiplier value
  if (result.includes('${pb_multiplier}')) {
    const benefits = normalizeBenefits(feature?.benefits);
    // Find any benefit with pb_multiplier (bonus_action or other types)
    const benefitWithMultiplier = benefits.find((b) => typeof b?.pb_multiplier === 'number');

    if (benefitWithMultiplier) {
      const multipliedValue = proficiencyBonus * benefitWithMultiplier.pb_multiplier;
      result = result.replaceAll('${pb_multiplier}', String(multipliedValue));
    } else {
      // Fallback: just use proficiency bonus if no multiplier found
      result = result.replaceAll('${pb_multiplier}', String(proficiencyBonus));
    }
  }

  // Handle ${level_scaling} and ${scaling} - replace with resolved die
  if (result.includes('${scaling}') || result.includes('${level_scaling}')) {
    const scalingLevel = getScalingLevel(feature, character);
    const scalingValue = resolveFeatureScaling(feature, scalingLevel);
    result = result.replaceAll('${scaling}', scalingValue || '');
    result = result.replaceAll('${level_scaling}', scalingValue || '');
  }

  // Handle ${formula} - evaluate pool formula and replace with result
  if (result.includes('${formula}')) {
    const benefits = normalizeBenefits(feature?.benefits);
    const poolBenefit = benefits.find((b) => normalizeBenefitType(b?.type) === 'pool' && b?.value === 'formula');
    
    if (poolBenefit && poolBenefit.formula) {
      const level = getCharacterLevel(character);
      const formulaValue = evaluatePoolFormula(poolBenefit.formula, level, modifierMap);
      result = result.replaceAll('${formula}', String(formulaValue));
    } else {
      // If no pool formula found, replace with empty string or 0
      result = result.replaceAll('${formula}', '0');
    }
  }

  return result;
}

// Helper function for weapon proficiency
function isWeaponProficient(weapon, character) {
  if (!weapon || !character) return false;
  
  const weaponType = weapon.type || '';
  const isMartial = weaponType.includes('Martial');
  
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
}

function getInventoryWeaponData(item) {
  if (!item) return null;
  return item.equipment || item.magic_item?.equipment || item.magic_item || null;
}

function normalizePropertyName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

// Helper to extract unlocked masteries from character features
function getUnlockedMasteries(character) {
  const features = character?.features || [];
  const masterySet = new Set();
  
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

export default function ActionsTab({ 
  character, 
  proficiencyBonus, 
  derivedMods, 
  allBonuses = [],
  setSelectedItem,
  usesState = {},
  onUsesChange = () => {},
  calculateMaxUses = () => 0,
  abilityModifiers = {},
  FeatureUsesTracker = null,
  spellUses = {},
  onSpellUsesChange = () => {}
}) {
  const [activeSubtab, setActiveSubtab] = useState('actions');
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [isSpellModalOpen, setIsSpellModalOpen] = useState(false);

  const getConditionalMeleeBonus = useMemo(() => {
    return (target, attack, hands = 1) => {
      if (!Array.isArray(allBonuses)) return 0;
      if (attack?.isRanged) return 0;

      const weaponProperties = new Set((attack?.properties || []).map(normalizePropertyName));

      return allBonuses
        .filter((bonus) => bonus?.target === target)
        .filter((bonus) => {
          const requiredProperty = normalizePropertyName(bonus?.weaponProperty);
          if (requiredProperty && !weaponProperties.has(requiredProperty)) return false;

          if (bonus?.versatileHands !== null && bonus?.versatileHands !== undefined) {
            if (!attack?.versatile) return false;
            return Number(bonus.versatileHands) === Number(hands);
          }

          return true;
        })
        .reduce((sum, bonus) => sum + (bonus?.value || 0), 0);
    };
  }, [allBonuses]);

  // Extract unlocked masteries
  const unlockedMasteries = useMemo(() => getUnlockedMasteries(character), [character?.features]);

  // Extract weapon attacks from inventory
  const weaponAttacks = useMemo(() => {
    if (!character?.inventory || !derivedMods) return [];
    
    return character.inventory
      .filter(item => {
        if (!item.equipped) return false;
        const itemData = getInventoryWeaponData(item);
        if (!itemData) return false;
        const type = itemData.type?.toLowerCase() || '';
        return type.includes('weapon');
      })
      .map(item => {
        const weapon = getInventoryWeaponData(item);
        const rawData = weapon.raw_data;
        
        // Determine ability modifier for attack
        const properties = rawData?.properties || [];
        const propertyNames = properties.map(p => p.name || p);
        const hasFinesse = propertyNames.includes('Finesse');
        const hasThrown = propertyNames.includes('Thrown');
        const range = rawData?.range?.normal || 5;
        const longRange = rawData?.range?.long;
        const isRanged = range > 5 || longRange;
        
        // Choose ability: Finesse can use STR or DEX (use better), Ranged uses DEX, else STR
        let abilityUsed = 'strength';
        if (hasFinesse) {
          abilityUsed = derivedMods.dexterity >= derivedMods.strength ? 'dexterity' : 'strength';
        } else if (isRanged) {
          abilityUsed = 'dexterity';
        }
        
        const abilityMod = derivedMods[abilityUsed] || 0;
        
        // Check weapon proficiency
        const isProficient = isWeaponProficient(weapon, character);
        const profBonus = isProficient ? (proficiencyBonus || 0) : 0;
        
        // Magic bonus from item name (+1, +2, etc.)
        const magicMatch = weapon.name?.match(/\+(\d+)/);
        const magicBonus = magicMatch ? parseInt(magicMatch[1], 10) : 0;
        
        // Calculate to-hit and damage bonuses
        const meleeToHitOneHandBonus = getConditionalMeleeBonus('melee_weapon_attack', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 1);
        const meleeToHitTwoHandBonus = getConditionalMeleeBonus('melee_weapon_attack', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 2);
        const meleeDamageOneHandBonus = getConditionalMeleeBonus('melee_weapon_damage', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 1);
        const meleeDamageTwoHandBonus = getConditionalMeleeBonus('melee_weapon_damage', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 2);

        const toHit = abilityMod + profBonus + magicBonus + meleeToHitOneHandBonus;
        const toHitTwoHand = abilityMod + profBonus + magicBonus + meleeToHitTwoHandBonus;
        const damageBonus = abilityMod + magicBonus + meleeDamageOneHandBonus;
        const versatileDamageBonus = abilityMod + magicBonus + meleeDamageTwoHandBonus;
        
        // Get damage info
        const damage = rawData?.damage?.damage_dice || '1';
        const damageType = (rawData?.damage?.damage_type?.name || 'bludgeoning').toLowerCase();
        
        // Versatile damage
        const hasVersatile = propertyNames.includes('Versatile');
        const versatileDamage = rawData?.two_handed_damage?.damage_dice;
        const showSplitToHit = hasVersatile && meleeToHitOneHandBonus !== meleeToHitTwoHandBonus;
        
        // Mastery info
        const masteryData = rawData?.mastery;
        const masteryName = masteryData?.name || null;
        const weaponName = weapon.name?.toLowerCase().trim();
        const hasMastery = masteryName && weaponName && unlockedMasteries.has(weaponName);
        
        return {
          id: item.id,
          inventoryItem: item,
          name: item.magic_item?.name || weapon.name,
          damage,
          damageType,
          toHit,
          toHitTwoHand,
          showSplitToHit,
          damageBonus,
          versatileDamageBonus,
          abilityUsed,
          range: isRanged || hasThrown ? `${range}${longRange ? `/${longRange}` : ''} ft` : `${range} ft`,
          properties: propertyNames,
          versatile: hasVersatile,
          versatileDamage,
          isProficient,
          magicBonus,
          isRanged,
          masteryName,
          hasMastery
        };
      });
  }, [character?.inventory, derivedMods, proficiencyBonus, character, unlockedMasteries, getConditionalMeleeBonus]);

  // Unarmed strike (always available)
  const unarmedStrike = useMemo(() => {
    if (!derivedMods) return null;
    
    const strMod = derivedMods.strength || 0;
    
    return {
      id: 'unarmed',
      name: 'Unarmed Strike',
      damage: '1',
      damageType: 'bludgeoning',
      toHit: strMod + (proficiencyBonus || 0),
      damageBonus: strMod,
      abilityUsed: 'strength',
      range: '5 ft',
      properties: [],
      isProficient: true,
      isRanged: false,
      inventoryItem: null
    };
  }, [derivedMods, proficiencyBonus]);

  // Extract attacks from feature benefits
  const featureAttacks = useMemo(() => {
    if (!character?.features || !derivedMods) return [];
    
    const attacks = [];
    
    // Get attacks from character features
    character.features.forEach(feature => {
      const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
      
      benefits.forEach((benefit, index) => {
        if (normalizeBenefitType(benefit?.type) !== 'attack') return;
        
        // Parse ability - support both full names and abbreviations
        const abilityRaw = String(benefit.ability || 'STR').toLowerCase().trim();
        const abilityMap = {
          'str': 'strength', 'strength': 'strength',
          'dex': 'dexterity', 'dexterity': 'dexterity',
          'con': 'constitution', 'constitution': 'constitution',
          'int': 'intelligence', 'intelligence': 'intelligence',
          'wis': 'wisdom', 'wisdom': 'wisdom',
          'cha': 'charisma', 'charisma': 'charisma'
        };
        const abilityUsed = abilityMap[abilityRaw] || 'strength';
        const abilityMod = derivedMods[abilityUsed] || 0;
        
        // Parse proficiency
        const addProficiency = benefit.add_proficiency === true || benefit.add_proficiency === 'true';
        const profBonus = addProficiency ? (proficiencyBonus || 0) : 0;
        
        // Parse attack type
        const attackType = String(benefit.attack_type || 'melee').toLowerCase();
        const isRanged = attackType.includes('ranged');
        
        // Parse damage
        const die = benefit.die || '1';
        const damageType = (benefit.damage_type || 'bludgeoning').toLowerCase();
        
        // Parse range
        const range = benefit.range || (isRanged ? '30 ft' : '5 ft');
        
        // Calculate to-hit and damage
        const toHit = abilityMod + profBonus;
        const damageBonus = abilityMod;
        
        // Get name from benefit or use attack type
        const attackName = benefit.name || `${attackType.charAt(0).toUpperCase() + attackType.slice(1)} Attack`;
        
        attacks.push({
          id: `feature-attack-${feature.id || feature.name}-${index}`,
          name: attackName,
          damage: die,
          damageType,
          toHit,
          damageBonus,
          abilityUsed,
          range,
          properties: [],
          isProficient: addProficiency,
          isRanged,
          inventoryItem: null,
          featureSource: feature
        });
      });
    });
    
    // Get attacks from magic items
    const inventory = Array.isArray(character?.inventory) ? character.inventory : [];
    inventory.forEach((inventoryItem) => {
      const magicItem = inventoryItem?.magic_item;
      if (!magicItem) return;

      // If an item requires attunement, only expose its attack benefits while attuned
      if (isMagicItemAttunementRequired(magicItem) && !inventoryItem.attuned) return;

      const itemBenefits = normalizeBenefits(
        magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties
      );

      itemBenefits.forEach((benefit, index) => {
        if (normalizeBenefitType(benefit?.type) !== 'attack') return;

        // Parse ability - support both full names and abbreviations
        const abilityRaw = String(benefit.ability || 'STR').toLowerCase().trim();
        const abilityMap = {
          'str': 'strength', 'strength': 'strength',
          'dex': 'dexterity', 'dexterity': 'dexterity',
          'con': 'constitution', 'constitution': 'constitution',
          'int': 'intelligence', 'intelligence': 'intelligence',
          'wis': 'wisdom', 'wisdom': 'wisdom',
          'cha': 'charisma', 'charisma': 'charisma'
        };
        const abilityUsed = abilityMap[abilityRaw] || 'strength';
        const abilityMod = derivedMods[abilityUsed] || 0;
        
        // Parse proficiency
        const addProficiency = benefit.add_proficiency === true || benefit.add_proficiency === 'true';
        const profBonus = addProficiency ? (proficiencyBonus || 0) : 0;
        
        // Parse attack type
        const attackType = String(benefit.attack_type || 'melee').toLowerCase();
        const isRanged = attackType.includes('ranged');
        
        // Parse damage
        const die = benefit.die || '1';
        const damageType = (benefit.damage_type || 'bludgeoning').toLowerCase();
        
        // Parse range
        const range = benefit.range || (isRanged ? '30 ft' : '5 ft');
        
        // Calculate to-hit and damage
        const toHit = abilityMod + profBonus;
        const damageBonus = abilityMod;
        
        // Get name from benefit or use item name
        const attackName = benefit.name || magicItem.name;

        attacks.push({
          id: `magic-item-attack-${inventoryItem.id}-${index}`,
          name: attackName,
          damage: die,
          damageType,
          toHit,
          damageBonus,
          abilityUsed,
          range,
          properties: [],
          isProficient: addProficiency,
          isRanged,
          inventoryItem,
          itemSource: magicItem
        });
      });
    });
    
    return attacks;
  }, [character?.features, character?.inventory, derivedMods, proficiencyBonus]);

  const allAttacks = weaponAttacks.concat(featureAttacks).concat(unarmedStrike ? [unarmedStrike] : []);

  const grappleShove = useMemo(() => {
    if (!derivedMods) return null;
    const strMod = derivedMods.strength || 0;
    const dc = 8 + (proficiencyBonus || 0) + strMod;

    return {
      id: 'grapple-shove',
      name: 'Grapple / Shove',
      range: '5 ft',
      isRanged: false,
      dc,
      damage: null,
      damageBonus: 0,
      damageType: null,
      properties: [],
      isProficient: true
    };
  }, [derivedMods, proficiencyBonus]);

  const actionsList = allAttacks.concat(grappleShove ? [grappleShove] : []);

  // Build bonus actions list from spells and features
  const bonusActions = useMemo(() => {
    const items = [];
    
    // Add bonus action spells
    if (character?.spells && Array.isArray(character.spells)) {
      const bonusActionSpells = character.spells.filter(cs => {
        const spell = cs?.spell;
        if (!spell) return false;
        // Check if prepared (cantrips, always prepared, or explicitly prepared)
        const isPrepared = spell.level === 0 || cs.always_prepared || cs.is_prepared;
        if (!isPrepared) return false;
        // Check if casting time is bonus action
        const castingTime = spell.casting_time?.toLowerCase() || '';
        return castingTime.includes('bonus action');
      });
      
      bonusActionSpells.forEach(cs => {
        items.push({
          type: 'spell',
          data: cs,
          id: `spell-${cs.spell.id}`
        });
      });
    }
    
    // Add bonus action features
    if (character?.features && Array.isArray(character.features)) {
      const bonusActionFeatures = character.features.filter(feature => {
        return hasBenefitType(feature, 'bonus_action');
      });
      
      bonusActionFeatures.forEach(feature => {
        items.push({
          type: 'feature',
          data: feature,
          id: `feature-${feature.id || feature.name}`
        });
      });
    }

    // Add magic-item bonus actions (same benefits model as features)
    const magicItemBonusActions = getMagicItemActionFeatures(character, 'bonus_action');
    magicItemBonusActions.forEach(feature => {
      items.push({
        type: 'feature',
        data: feature,
        id: `feature-${feature.id || feature.name}`
      });
    });
    
    // Sort alphabetically by name
    items.sort((a, b) => {
      const nameA = a.type === 'spell' ? (a.data.spell?.name || '') : (a.data.name || '');
      const nameB = b.type === 'spell' ? (b.data.spell?.name || '') : (b.data.name || '');
      return nameA.localeCompare(nameB);
    });
    
    return items;
  }, [character]);

  // Build reactions list from spells and features
  const reactions = useMemo(() => {
    const items = [];
    
    // Add reaction spells
    if (character?.spells && Array.isArray(character.spells)) {
      const reactionSpells = character.spells.filter(cs => {
        const spell = cs?.spell;
        if (!spell) return false;
        // Check if prepared (cantrips, always prepared, or explicitly prepared)
        const isPrepared = spell.level === 0 || cs.always_prepared || cs.is_prepared;
        if (!isPrepared) return false;
        // Check if casting time is reaction
        const castingTime = spell.casting_time?.toLowerCase() || '';
        return castingTime.includes('reaction');
      });
      
      reactionSpells.forEach(cs => {
        items.push({
          type: 'spell',
          data: cs,
          id: `spell-${cs.spell.id}`
        });
      });
    }
    
    // Add reaction features
    if (character?.features && Array.isArray(character.features)) {
      const reactionFeatures = character.features.filter(feature => {
        return hasBenefitType(feature, 'reaction');
      });
      
      reactionFeatures.forEach(feature => {
        // First, check if this feature has top-level reaction benefits
        const topLevelBenefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
        const hasTopLevelReaction = topLevelBenefits.some(b => normalizeBenefitType(b?.type) === 'reaction');
        
        if (hasTopLevelReaction) {
          // Add feature as-is (it has top-level reaction benefits)
          items.push({
            type: 'feature',
            data: feature,
            id: `feature-${feature.id || feature.name}`
          });
        }
        
        // Also check for nested stance reactions
        const stanceBenefit = topLevelBenefits.find(b => normalizeBenefitType(b?.type) === 'stance');
        if (stanceBenefit?.stances && Array.isArray(stanceBenefit.stances)) {
          stanceBenefit.stances.forEach(stance => {
            const stanceBenefits = normalizeBenefits(stance?.benefits);
            const reactionBenefits = stanceBenefits.filter(b => normalizeBenefitType(b?.type) === 'reaction');
            
            reactionBenefits.forEach(reactionBenefit => {
              // Create a pseudo-feature for the stance reaction
              items.push({
                type: 'feature',
                data: {
                  ...reactionBenefit,
                  name: reactionBenefit.name || `${stance.name} Reaction`,
                  description: reactionBenefit.description || stance.description,
                  id: `${feature.id || feature.name}-${stance.name}-reaction`
                },
                id: `feature-${feature.id || feature.name}-${stance.name}-reaction`
              });
            });
          });
        }
      });
    }

    // Add magic-item reactions (same benefits model as features)
    const magicItemReactions = getMagicItemActionFeatures(character, 'reaction');
    magicItemReactions.forEach(feature => {
      items.push({
        type: 'feature',
        data: feature,
        id: `feature-${feature.id || feature.name}`
      });
    });
    
    // Sort alphabetically by name
    items.sort((a, b) => {
      const nameA = a.type === 'spell' ? (a.data.spell?.name || '') : (a.data.name || '');
      const nameB = b.type === 'spell' ? (b.data.spell?.name || '') : (b.data.name || '');
      return nameA.localeCompare(nameB);
    });
    
    return items;
  }, [character]);

  // Calculate spell attack bonus and save DC (borrowed from SpellsTab logic)
  const spellAbilityMod = useMemo(() => {
    if (!character?.classes || !derivedMods) return 0;
    const classNames = character.classes.map(c => c.definition?.name || c.class || '');
    const isWisdomCaster = classNames.some(name => ['Cleric', 'Druid', 'Ranger'].includes(name));
    const isCharismaCaster = classNames.some(name => ['Bard', 'Paladin', 'Sorcerer', 'Warlock'].includes(name));
    
    if (isWisdomCaster) return derivedMods.wisdom || 0;
    if (isCharismaCaster) return derivedMods.charisma || 0;
    return derivedMods.intelligence || 0; // Default to INT (Wizard, Artificer)
  }, [character?.classes, derivedMods]);

  const spellAttackBonus = (proficiencyBonus || 0) + spellAbilityMod;
  const spellSaveDC = 8 + (proficiencyBonus || 0) + spellAbilityMod;

  return (
    <div className="actions-tab">
      <h2>Actions</h2>

      <div className="feature-subtabs">
        <button
          className={activeSubtab === 'actions' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('actions')}
        >
          Attacks
        </button>
        <button
          className={activeSubtab === 'bonus' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('bonus')}
        >
          Bonus Actions
        </button>
        <button
          className={activeSubtab === 'reactions' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('reactions')}
        >
          Reactions
        </button>
      </div>

      <div className="feature-subtab-content">
        {activeSubtab === 'actions' && (
          <>
            {allAttacks.length > 0 ? (
              <div className="actions-container">
                {/* Column Headers */}
                <div className="action-row action-stats-row header-row">
                  <div className="action-col range-col">
                    <span className="stat-label">Range</span>
                  </div>
                  <div className="action-col hit-col">
                    <span className="stat-label">Hit/DC</span>
                  </div>
                  <div className="action-col damage-col">
                    <span className="stat-label">Damage</span>
                  </div>
                  <div className="action-col dmgtype-col">
                    <span className="stat-label">Type</span>
                  </div>
                </div>

                {/* Attack Rows */}
                {actionsList.map(attack => {
                  // Get damage type icon
                  const getDamageIcon = () => {
                    if (!attack.damageType) return null;
                    return new URL(`../../../assets/icons/damage/${attack.damageType}.svg`, import.meta.url).href;
                  };

                  // Extract damage number and die (e.g., "1d4" -> {num: "1", die: "d4"})
                  const parseDamage = (damageStr) => {
                    if (!damageStr) return { num: '', die: null };
                    const match = damageStr.match(/^(\d+)(d\d+)$/i);
                    if (match) {
                      return { num: match[1], die: match[2] };
                    }
                    return { num: damageStr, die: null };
                  };

                  // Get melee/ranged icon
                  const getCombatIcon = () => {
                    return new URL(`../../../assets/icons/combat/${attack.isRanged ? 'ranged' : 'melee'}.svg`, import.meta.url).href;
                  };

                  const hasDamage = Boolean(attack.damage);
                  const baseDamage = hasDamage ? parseDamage(attack.damage) : { num: '', die: null };
                  const versatileDamage = attack.versatileDamage ? parseDamage(attack.versatileDamage) : null;
                  const baseNumValue = Number.parseInt(baseDamage.num, 10);
                  const flatDamageTotal = hasDamage && !baseDamage.die && Number.isFinite(baseNumValue)
                    ? baseNumValue + (attack.damageBonus || 0)
                    : null;

                  const formatDamageString = (damageParts) => {
                    if (!damageParts) return '';
                    const diePart = damageParts.die ? `${damageParts.num}${damageParts.die}` : damageParts.num;
                    if (!diePart) return '';
                    if (!attack.damageBonus) return diePart;
                    return `${diePart}${attack.damageBonus >= 0 ? '+' : ''}${attack.damageBonus}`;
                  };

                  const formatDamageStringWithBonus = (damageParts, bonusValue) => {
                    if (!damageParts) return '';
                    const diePart = damageParts.die ? `${damageParts.num}${damageParts.die}` : damageParts.num;
                    if (!diePart) return '';
                    if (!bonusValue) return diePart;
                    return `${diePart}${bonusValue >= 0 ? '+' : ''}${bonusValue}`;
                  };

                  return (
                    <React.Fragment key={attack.id}>
                      {/* Action Name Row */}
                      <div key={`${attack.id}-name`} className="action-row action-name-row" >
                        <div className="action-name">
                          <h4>{attack.name}</h4>
                          {!attack.isProficient && <span className="not-proficient">Not Proficient</span>}
                          {attack.masteryName && (
                            <span className={attack.hasMastery ? 'weapon-mastery mastery-unlocked' : 'weapon-mastery'}>
                              {attack.masteryName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Stats Row */}
                      <div
                        key={`${attack.id}-stats`}
                        className={attack.inventoryItem ? 'action-row action-stats-row clickable' : 'action-row action-stats-row'}
                        onClick={() => {
                          if (attack.inventoryItem && setSelectedItem) {
                            setSelectedItem(attack.inventoryItem);
                          }
                        }}
                        role={attack.inventoryItem ? 'button' : undefined}
                        tabIndex={attack.inventoryItem ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && attack.inventoryItem && setSelectedItem) {
                            setSelectedItem(attack.inventoryItem);
                          }
                        }}
                      >
                        <div className="action-col range-col">
                          <div className="action-range">
                            <div className="action-combat-icon">
                              <img src={getCombatIcon()} alt={attack.isRanged ? 'Ranged' : 'Melee'} title={attack.isRanged ? 'Ranged Attack' : 'Melee Attack'} />
                            </div>
                            <span>{attack.range}</span>
                          </div>
                        </div>

                        <div className="action-col hit-col">
                          {typeof attack.dc === 'number' ? (
                            <span className="stat-value">DC {attack.dc}</span>
                          ) : attack.showSplitToHit ? (
                            <div className="action-versatile-hit" title="Versatile to-hit values">
                              <div className="stat-value">1H {attack.toHit >= 0 ? '+' : ''}{attack.toHit}</div>
                              <div className="stat-value">2H {attack.toHitTwoHand >= 0 ? '+' : ''}{attack.toHitTwoHand}</div>
                            </div>
                          ) : (
                            <span className="stat-value">{attack.toHit >= 0 ? '+' : ''}{attack.toHit}</span>
                          )}
                        </div>

                        <div className="action-col damage-col">
                          <div className="damage-display">
                            {hasDamage ? (
                              flatDamageTotal !== null ? (
                                <span className="damage-num">{flatDamageTotal}</span>
                              ) : (
                                <span className="damage-num">{formatDamageString(baseDamage)}</span>
                              )
                            ) : (
                              <span className="damage-none">—</span>
                            )}
                          </div>
                          {attack.versatile && attack.versatileDamage && versatileDamage && (
                            <div className="action-versatile" title={`Versatile: ${attack.versatileDamage}`}>
                              <span className="damage-num">{formatDamageStringWithBonus(versatileDamage, attack.versatileDamageBonus ?? attack.damageBonus)}</span>
                            </div>
                          )}
                        </div>

                        <div className={`action-col dmgtype-col${getDamageIcon() ? '' : ' no-dmgtype'}`}>
                          {getDamageIcon() && (
                            <img src={getDamageIcon()} alt={attack.damageType} title={attack.damageType} className="damage-icon" />
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <p className="info-text">No attacks available.</p>
            )}
          </>
        )}
        {activeSubtab === 'bonus' && (
          <>
            {bonusActions.length > 0 ? (
              <div className="bonus-actions-container">
                {bonusActions.map(item => {
                  if (item.type === 'spell') {
                    // Render spell using shared SpellRow component
                    const cs = item.data;
                    const spell = cs.spell;
                    
                    return (
                      <SpellRow
                        key={item.id}
                        spell={spell}
                        castingSpellData={cs}
                        spellAttackBonus={spellAttackBonus}
                        spellSaveDC={spellSaveDC}
                        spellAbilityMod={spellAbilityMod}
                        onSpellClick={() => {
                          setSelectedSpell(spell);
                          setIsSpellModalOpen(true);
                        }}
                        className="bonus-action-spell"
                        castingTimeDisplay="Bonus Action"
                        showRitual={true}
                        showAlwaysPrepared={true}
                        showUpcast={false}
                        maxSpellUses={cs.feat_uses}
                        spellUses={spellUses[cs.id]}
                        onSpellUsesChange={onSpellUsesChange}
                      />
                    );
                  } else if (item.type === 'feature') {
                    // Render feature
                    const feature = item.data;
                    const featureId = feature.id || `feature-${feature.name}`;
                    const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods);
                    
                    return (
                      <div key={item.id} className="bonus-action-feature">
                        <div className="feature-header">
                          <h4 className="feature-name">{feature.name}</h4>
                        </div>
                        
                        {feature.max_uses && FeatureUsesTracker && (
                          <FeatureUsesTracker
                            maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character?.level, feature)}
                            featureId={featureId}
                            storedUses={usesState[featureId]}
                            onUsesChange={onUsesChange}
                          />
                        )}
                        
                        {shortText && (
                          <div className="bonus-action-feature-short">
                            {renderSpellDescription(shortText)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return null;
                })}
              </div>
            ) : (
              <p className="info-text">No bonus actions available.</p>
            )}
          </>
        )}
        {activeSubtab === 'reactions' && (
          <>
            {reactions.length > 0 ? (
              <div className="reactions-container">
                {reactions.map(item => {
                  if (item.type === 'spell') {
                    // Render spell using shared SpellRow component
                    const cs = item.data;
                    const spell = cs.spell;
                    
                    return (
                      <SpellRow
                        key={item.id}
                        spell={spell}
                        castingSpellData={cs}
                        spellAttackBonus={spellAttackBonus}
                        spellSaveDC={spellSaveDC}
                        spellAbilityMod={spellAbilityMod}
                        onSpellClick={() => {
                          setSelectedSpell(spell);
                          setIsSpellModalOpen(true);
                        }}
                        className="reaction-spell"
                        castingTimeDisplay="Reaction"
                        showRitual={true}
                        showAlwaysPrepared={true}
                        showUpcast={false}
                        maxSpellUses={cs.feat_uses}
                        spellUses={spellUses[cs.id]}
                        onSpellUsesChange={onSpellUsesChange}
                      />
                    );
                  } else if (item.type === 'feature') {
                    // Render feature
                    const feature = item.data;
                    const featureId = feature.id || `feature-${feature.name}`;
                    const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods);
                    
                    return (
                      <div key={item.id} className="reaction-feature">
                        <div className="feature-header">
                          <h4 className="feature-name">{feature.name}</h4>
                        </div>
                        
                        {feature.max_uses && FeatureUsesTracker && (
                          <FeatureUsesTracker
                            maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character?.level, feature)}
                            featureId={featureId}
                            storedUses={usesState[featureId]}
                            onUsesChange={onUsesChange}
                          />
                        )}
                        
                        {(shortText || feature.description) && (
                          <div className="reaction-feature-short">
                            {renderSpellDescription(shortText || feature.description)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return null;
                })}
              </div>
            ) : (
              <p className="info-text">No reactions available.</p>
            )}
          </>
        )}
      </div>

      <SpellDetailModal
        spell={selectedSpell}
        isOpen={isSpellModalOpen}
        onClose={() => setIsSpellModalOpen(false)}
        spellAttackBonus={spellAttackBonus}
        spellSaveDC={spellSaveDC}
        spellAbilityMod={spellAbilityMod}
      />
    </div>
  );
}
