import React, { useState, useMemo, useEffect, useCallback } from 'react';
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

function isSneakAttackFeatureName(name) {
  return String(name || '').toLowerCase().trim() === 'sneak attack';
}

// Helper to calculate Channel Divinity uses based on class and level
function calculateChannelDivinityUses(className, level) {
  const normalizedClass = String(className || '').toLowerCase().trim();
  
  if (normalizedClass === 'cleric') {
    if (level === 1) return 0;
    if (level >= 2 && level <= 5) return 2;
    if (level >= 6 && level <= 17) return 3;
    if (level >= 18 && level <= 20) return 4;
  } else if (normalizedClass === 'paladin') {
    if (level >= 1 && level <= 2) return 0;
    if (level >= 3 && level <= 10) return 2;
    if (level >= 11 && level <= 20) return 3;
  }
  
  return 0;
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
  
  // Support rounding suffixes like "level/2ru" or "level/2rd"
  let roundingMode = null;
  const roundingMatch = normalizedFormula.match(/^(.*?)(ru|rd)\s*$/i);
  if (roundingMatch) {
    normalizedFormula = roundingMatch[1].trim();
    roundingMode = roundingMatch[2].toLowerCase();
  }

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
      const rounded = roundingMode === 'ru'
        ? Math.ceil(result)
        : roundingMode === 'rd'
          ? Math.floor(result)
          : Math.floor(result);
      return Math.max(0, rounded); // Ensure non-negative integer
    }
  } catch (error) {
    console.warn(`[Pool Formula] Failed to evaluate formula: ${formula}`, error);
  }
  
  return 0;
}

function resolveFeatureTextTemplate(templateText, feature, character, proficiencyBonus = 0, derivedMods = null, preferredBenefitType = null) {
  const text = typeof templateText === 'string' ? templateText : '';
  if (!text) return '';

  let result = text;

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

  const benefits = normalizeBenefits(feature?.benefits);
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

  // Handle ${pb_multiplier} - multiply proficiency bonus by pb_multiplier value
  if (result.includes('${pb_multiplier}')) {
    const benefitWithMultiplier = benefits.find((b) => typeof b?.pb_multiplier === 'number');

    if (benefitWithMultiplier) {
      const multipliedValue = proficiencyBonus * benefitWithMultiplier.pb_multiplier;
      result = result.replaceAll('${pb_multiplier}', String(multipliedValue));
    } else {
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

  // Handle ${formula}
  if (result.includes('${formula}')) {
    const formulaSource = pickBenefitWithField('formula');
    if (formulaSource?.formula) {
      const level = getCharacterLevel(character);
      const formulaValue = evaluatePoolFormula(formulaSource.formula, level, modifierMap);
      result = result.replaceAll('${formula}', String(formulaValue));
    } else {
      result = result.replaceAll('${formula}', '0');
    }
  }

  // Handle ${die}
  if (result.includes('${die}')) {
    const dieSource = pickBenefitWithField('die');
    result = result.replaceAll('${die}', typeof dieSource?.die === 'string' ? dieSource.die : '');
  }

  // Handle ${value}
  if (result.includes('${value}')) {
    const valueSource = pickBenefitWithField('value') || pickBenefitWithField('formula');
    let resolvedValue = '0';

    if (valueSource) {
      if (typeof valueSource.value === 'number') {
        resolvedValue = String(valueSource.value);
      } else if (typeof valueSource.value === 'string' && valueSource.value.trim().toLowerCase() === 'formula' && valueSource.formula) {
        const level = getCharacterLevel(character);
        resolvedValue = String(evaluatePoolFormula(valueSource.formula, level, modifierMap));
      } else if (typeof valueSource.value === 'string' && valueSource.value.trim()) {
        resolvedValue = valueSource.value;
      } else if (typeof valueSource.formula === 'string' && valueSource.formula.trim()) {
        const level = getCharacterLevel(character);
        resolvedValue = String(evaluatePoolFormula(valueSource.formula, level, modifierMap));
      }
    }

    result = result.replaceAll('${value}', resolvedValue);
  }

  return result;
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
  const value = magicItem?.requires_attunement ?? magicItem?.raw_data?.requires_attunement;
  if (value === null || value === undefined || value === false) return false;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'no' || normalized === 'none' || normalized === 'false') {
      return false;
    }
  }

  return Boolean(value);
}

function isMagicItemHidden(magicItem) {
  const value = magicItem?.hidden ?? magicItem?.raw_data?.hidden;
  if (value === null || value === undefined) return false;
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  return Boolean(value);
}

function getMagicItemActionFeatures(character, targetType) {
  const inventory = Array.isArray(character?.inventory) ? character.inventory : [];
  const features = [];

  inventory.forEach((inventoryItem) => {
    const magicItem = inventoryItem?.magic_item;
    if (!magicItem) return;
    if (isMagicItemHidden(magicItem)) return;

    // If an item requires attunement, only expose its action benefits while attuned.
    if (isMagicItemAttunementRequired(magicItem) && !inventoryItem.attuned) return;

    const itemBenefits = normalizeBenefits(
      magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties
    );

    itemBenefits.forEach((benefit, index) => {
      if (normalizeBenefitType(benefit?.type) !== targetType) return;

      const benefitDescription = [
        benefit?.description,
        benefit?.effect,
        benefit?.short,
        benefit?.text,
        magicItem?.description,
        magicItem?.properties?.description,
      ].find((value) => typeof value === 'string' && value.trim().length > 0) || '';

      const shortParts = [];
      if (benefit?.trigger) shortParts.push(`**Trigger:** ${benefit.trigger}`);
      if (benefitDescription) shortParts.push(benefitDescription);

      features.push({
        id: `magic-item-${inventoryItem.id}-${targetType}-${index}`,
        name: benefit?.name || magicItem.name,
        short: shortParts.join('\n\n') || '',
        description: benefitDescription,
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
  // Prefer explicit feature_die type, fall back to any benefit with level_scaling
  const featureDieBenefit =
    benefits.find((benefit) => benefit?.type === 'feature_die' && (benefit?.level_scaling || benefit?.scaling)) ??
    benefits.find((benefit) => benefit?.level_scaling || benefit?.scaling);

  if (!featureDieBenefit) return '';

  const baseDie = typeof featureDieBenefit.die === 'string' ? featureDieBenefit.die : '';
  const scaling = featureDieBenefit.level_scaling || featureDieBenefit.scaling;
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

function getFeatureDieBenefit(feature) {
  const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
  return benefits.find((benefit) => normalizeBenefitType(benefit?.type) === 'feature_die') || null;
}

function resolveFeatureDieDisplay(feature, character, proficiencyBonus = 0, derivedMods = null) {
  const featureDieBenefit = getFeatureDieBenefit(feature);
  const scalingLevel = getScalingLevel(feature, character);
  const scaledDie = resolveFeatureScaling(feature, scalingLevel);
  const baseDie = typeof featureDieBenefit?.die === 'string' ? featureDieBenefit.die : '';

  return scaledDie
    || baseDie
    || resolveFeatureTextTemplate('${die}', feature, character, proficiencyBonus, derivedMods, 'feature_die')
    || '';
}

function resolveLimitGauge(feature, characterLevel, abilityModifiers, effectiveMaxHP = 0) {
  const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
  const gaugeBenefit = benefits.find((benefit) => normalizeBenefitType(benefit?.type) === 'gauge');
  if (!gaugeBenefit) return null;

  const thresholdRaw = gaugeBenefit?.threshold ?? gaugeBenefit?.trigger ?? 'half_hp_max';
  let threshold = 0;

  if (typeof thresholdRaw === 'number') {
    threshold = Math.max(1, Math.floor(thresholdRaw));
  } else {
    const token = String(thresholdRaw || '').toLowerCase().trim();
    if (['half_hp_max', 'half_max_hp', 'hp_max_half', 'half_hp'].includes(token)) {
      threshold = Math.max(1, Math.ceil((Number(effectiveMaxHP) || 0) / 2));
    } else {
      const numeric = Number(token);
      threshold = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 0;
    }
  }

  if (!threshold) return null;

  return {
    name: gaugeBenefit?.name || feature?.name || 'Limit Gauge',
    threshold,
    maxCharges: 1,
  };
}

function normalizeLimitGaugeSnapshot(snapshot, gaugeConfig) {
  const threshold = Math.max(1, Number(gaugeConfig?.threshold) || 1);
  if (!snapshot || typeof snapshot !== 'object') {
    return { value: 0, charges: 0, lastProgressAt: Date.now() };
  }
  return {
    value: Math.max(0, Math.min(threshold, Math.floor(Number(snapshot.value) || 0))),
    charges: Math.max(0, Math.min(1, Math.floor(Number(snapshot.charges) || 0))),
    lastProgressAt: Number.isFinite(Number(snapshot.lastProgressAt)) ? Number(snapshot.lastProgressAt) : Date.now(),
  };
}

function resolveFeatureShortText(feature, character, proficiencyBonus = 0, derivedMods = null, preferredBenefitType = null) {
  return resolveFeatureTextTemplate(feature?.short, feature, character, proficiencyBonus, derivedMods, preferredBenefitType);
}

function resolveFeatureBenefitDescription(feature, character, proficiencyBonus = 0, derivedMods = null, preferredBenefitType = null) {
  const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
  const normalizedPreferredType = preferredBenefitType ? normalizeBenefitType(preferredBenefitType) : null;

  const hasDescription = (benefit) => {
    const description = benefit?.description ?? benefit?.effect ?? benefit?.short ?? benefit?.text;
    return typeof description === 'string' && description.trim().length > 0;
  };

  let selectedBenefit = null;

  if (normalizedPreferredType) {
    selectedBenefit = benefits.find((benefit) => normalizeBenefitType(benefit?.type) === normalizedPreferredType && hasDescription(benefit));
  }

  if (!selectedBenefit) {
    selectedBenefit = benefits.find((benefit) => !benefit?.type && hasDescription(benefit));
  }

  if (!selectedBenefit) {
    selectedBenefit = benefits.find((benefit) => hasDescription(benefit));
  }

  const template = selectedBenefit?.description
    ?? selectedBenefit?.effect
    ?? selectedBenefit?.short
    ?? selectedBenefit?.text
    ?? feature?.description
    ?? feature?.short
    ?? '';
  return resolveFeatureTextTemplate(template, feature, character, proficiencyBonus, derivedMods, preferredBenefitType);
}

function resolveSneakDamageDisplay(feature, character, derivedMods = null, dieOverride = null) {
  const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
  const modifierMap = {
    strength: Number.isFinite(derivedMods?.strength) ? derivedMods.strength : Math.floor(((character?.strength ?? 10) - 10) / 2),
    dexterity: Number.isFinite(derivedMods?.dexterity) ? derivedMods.dexterity : Math.floor(((character?.dexterity ?? 10) - 10) / 2),
    constitution: Number.isFinite(derivedMods?.constitution) ? derivedMods.constitution : Math.floor(((character?.constitution ?? 10) - 10) / 2),
    intelligence: Number.isFinite(derivedMods?.intelligence) ? derivedMods.intelligence : Math.floor(((character?.intelligence ?? 10) - 10) / 2),
    wisdom: Number.isFinite(derivedMods?.wisdom) ? derivedMods.wisdom : Math.floor(((character?.wisdom ?? 10) - 10) / 2),
    charisma: Number.isFinite(derivedMods?.charisma) ? derivedMods.charisma : Math.floor(((character?.charisma ?? 10) - 10) / 2)
  };

  const hasDamageParts = (benefit) => {
    const die = typeof benefit?.die === 'string' ? benefit.die.trim() : '';
    const hasFormula = typeof benefit?.formula === 'string' && benefit.formula.trim();
    const hasValue = benefit?.value !== null && benefit?.value !== undefined && String(benefit.value).trim() !== '';
    return Boolean(die || hasFormula || hasValue);
  };

  const typed = benefits.find((benefit) => normalizeBenefitType(benefit?.type) === 'sneak' && hasDamageParts(benefit));
  const untyped = benefits.find((benefit) => !benefit?.type && hasDamageParts(benefit));
  const fallback = benefits.find((benefit) => hasDamageParts(benefit));
  const source = typed || untyped || fallback;
  if (!source) return '';

  const diePart = typeof source.die === 'string' ? source.die.trim() : '';
  const level = getCharacterLevel(character);
  let countValue = null;

  if (typeof source.formula === 'string' && source.formula.trim()) {
    countValue = evaluatePoolFormula(source.formula, level, modifierMap);
  } else if (typeof source.value === 'number') {
    countValue = Math.max(0, Math.floor(source.value));
  } else if (typeof source.value === 'string' && source.value.trim()) {
    const normalizedValue = source.value.trim().toLowerCase();
    if (normalizedValue === 'formula' && typeof source.formula === 'string' && source.formula.trim()) {
      countValue = evaluatePoolFormula(source.formula, level, modifierMap);
    } else {
      const numericValue = Number.parseInt(source.value, 10);
      if (Number.isFinite(numericValue)) {
        countValue = Math.max(0, numericValue);
      } else {
        countValue = evaluatePoolFormula(source.value, level, modifierMap);
      }
    }
  }

  const effectiveDie = dieOverride || diePart;
  if (Number.isFinite(countValue) && countValue > 0) {
    return effectiveDie ? `${countValue}${effectiveDie}` : String(countValue);
  }

  return effectiveDie || '';
}

// Helper function for weapon proficiency
function isWeaponProficient(weapon, character) {
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
}

function getInventoryWeaponData(item) {
  if (!item) return null;
  return item.equipment || item.magic_item?.equipment || item.magic_item || null;
}

function parseNumericBonus(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.trim().match(/^([+-]?\d+)$/);
    if (match) return Number.parseInt(match[1], 10);
  }
  return 0;
}

function getMagicWeaponModifiers(inventoryItem) {
  const magicItem = inventoryItem?.magic_item;
  if (!magicItem) {
    return {
      attackBonus: 0,
      damageBonus: 0,
      extraDamageDice: []
    };
  }

  const benefits = normalizeBenefits(
    magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties
  );

  let attackBonus = 0;
  let damageBonus = 0;
  let hasExplicitEnhancement = false;
  const extraDamageDice = [];

  const addExtraDamage = (benefit) => {
    const die = benefit?.die || benefit?.damage_dice || benefit?.dice;
    if (typeof die !== 'string' || !die.trim()) return;
    const damageType = benefit?.damage_type || benefit?.damageType || benefit?.type_name || null;
    extraDamageDice.push({
      die: die.trim(),
      damageType: typeof damageType === 'string' ? damageType.trim().toLowerCase() : null
    });
  };

  benefits.forEach((benefit) => {
    const type = normalizeBenefitType(benefit?.type);
    const amount = parseNumericBonus(benefit?.amount ?? benefit?.value ?? benefit?.bonus);

    if (type === 'melee_weapon_attack_bonus' || type === 'weapon_attack_bonus') {
      attackBonus += amount;
      hasExplicitEnhancement = true;
      return;
    }

    if (type === 'melee_weapon_damage_bonus' || type === 'weapon_damage_bonus') {
      damageBonus += amount;
      hasExplicitEnhancement = true;
      return;
    }

    if (type === 'weapon_bonus' || type === 'magic_weapon_bonus') {
      const appliesTo = normalizeBenefitType(benefit?.applies_to || benefit?.appliesTo || benefit?.target || 'attack_and_damage');
      if (['attack', 'attack_roll', 'to_hit', 'melee_weapon_attack', 'weapon_attack'].includes(appliesTo)) {
        attackBonus += amount;
      } else if (['damage', 'damage_roll', 'melee_weapon_damage', 'weapon_damage'].includes(appliesTo)) {
        damageBonus += amount;
      } else {
        attackBonus += amount;
        damageBonus += amount;
      }
      hasExplicitEnhancement = true;
      return;
    }

    if (['extra_damage_dice', 'weapon_extra_damage', 'bonus_damage_dice'].includes(type)) {
      addExtraDamage(benefit);
    }
  });

  // Backward compatibility: infer enhancement from common legacy fields or item naming.
  const explicitBonus = parseNumericBonus(
    magicItem?.bonus
    ?? magicItem?.raw_data?.bonus
    ?? magicItem?.properties?.bonus
  );
  const nameBonusMatch = String(magicItem?.name || '').match(/\+\s*(\d+)/);
  const inferredNameBonus = nameBonusMatch ? Number.parseInt(nameBonusMatch[1], 10) : 0;
  const inferredEnhancement = Math.max(explicitBonus, inferredNameBonus, 0);

  const enhancementBonus = hasExplicitEnhancement ? 0 : inferredEnhancement;

  return {
    attackBonus: attackBonus + enhancementBonus,
    damageBonus: damageBonus + enhancementBonus,
    extraDamageDice,
  };
}

function getMagicItemSpellcastingBonuses(character) {
  const inventory = Array.isArray(character?.inventory) ? character.inventory : [];

  return inventory.reduce((acc, inventoryItem) => {
    const magicItem = inventoryItem?.magic_item;
    if (!magicItem) return acc;
    if (isMagicItemHidden(magicItem)) return acc;
    if (isMagicItemAttunementRequired(magicItem) && !inventoryItem.attuned) return acc;

    const benefits = normalizeBenefits(
      magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties
    );

    benefits.forEach((benefit) => {
      const type = normalizeBenefitType(benefit?.type);
      const amount = parseNumericBonus(benefit?.amount ?? benefit?.value ?? benefit?.bonus);
      if (!amount) return;

      if (type === 'spell_attack_bonus') {
        acc.attackBonus += amount;
        return;
      }

      if (type === 'spell_save_dc_bonus' || type === 'spell_dc_bonus') {
        acc.saveDCBonus += amount;
        return;
      }

      if (type === 'spellcasting_bonus' || type === 'spell_bonus') {
        const appliesTo = normalizeBenefitType(benefit?.applies_to || benefit?.appliesTo || 'attack_and_dc');
        if (['attack', 'to_hit', 'spell_attack', 'spell_attack_bonus'].includes(appliesTo)) {
          acc.attackBonus += amount;
        } else if (['dc', 'save_dc', 'spell_dc', 'spell_save_dc', 'spell_save_dc_bonus'].includes(appliesTo)) {
          acc.saveDCBonus += amount;
        } else {
          acc.attackBonus += amount;
          acc.saveDCBonus += amount;
        }
      }
    });

    const fallbackAttack = parseNumericBonus(
      magicItem?.spell_attack_bonus ?? magicItem?.raw_data?.spell_attack_bonus ?? magicItem?.properties?.spell_attack_bonus
    );
    const fallbackDC = parseNumericBonus(
      magicItem?.spell_save_dc_bonus
      ?? magicItem?.spell_dc_bonus
      ?? magicItem?.raw_data?.spell_save_dc_bonus
      ?? magicItem?.raw_data?.spell_dc_bonus
      ?? magicItem?.properties?.spell_save_dc_bonus
      ?? magicItem?.properties?.spell_dc_bonus
    );

    acc.attackBonus += fallbackAttack;
    acc.saveDCBonus += fallbackDC;

    return acc;
  }, { attackBonus: 0, saveDCBonus: 0 });
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
  poolState = {},
  onPoolChange = () => {},
  effectiveMaxHP = 0,
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
  const [sneakModifierUses, setSneakModifierUses] = useState({});
  const [channelDivinityUsesState, setChannelDivinityUsesState] = useState(0);
  const [limitGaugeDraftValues, setLimitGaugeDraftValues] = useState({});
  const characterLevel = useMemo(() => getCharacterLevel(character), [character]);

  const commitLimitGaugeDraftValue = useCallback((gaugeStateId, gaugeConfig, gaugeState, draftValue) => {
    const parsed = draftValue === '' ? 0 : Number.parseInt(draftValue, 10);
    const nextValue = Number.isNaN(parsed) ? 0 : parsed;
    onPoolChange(gaugeStateId, normalizeLimitGaugeSnapshot({
      ...gaugeState,
      value: nextValue,
      lastProgressAt: Date.now(),
    }, gaugeConfig));
    setLimitGaugeDraftValues((prev) => {
      const next = { ...prev };
      delete next[gaugeStateId];
      return next;
    });
  }, [onPoolChange]);

  // Find attuned items with sneak_die_modifier benefits
  const sneakDieModifierItems = useMemo(() => {
    const inventory = Array.isArray(character?.inventory) ? character.inventory : [];
    const result = [];
    inventory.forEach((inventoryItem) => {
      const magicItem = inventoryItem?.magic_item;
      if (!magicItem) return;
      if (isMagicItemHidden(magicItem)) return;
      if (isMagicItemAttunementRequired(magicItem) && !inventoryItem.attuned) return;
      const itemBenefits = normalizeBenefits(
        magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties
      );
      const modifierBenefit = itemBenefits.find(
        (b) => normalizeBenefitType(b?.type) === 'sneak_die_modifier'
      );
      if (!modifierBenefit) return;
      const chargeSource = modifierBenefit.charge_source;
      const usesBenefit = itemBenefits.find(
        (b) => normalizeBenefitType(b?.type) === 'uses' && b?.name === chargeSource
      );
      result.push({
        inventoryItemId: inventoryItem.id,
        magicItemName: magicItem.name,
        chargeSource,
        chargeScaledDie: modifierBenefit.charge_scaled_die || {},
        targetFeature: modifierBenefit.target_feature,
        usesMax: usesBenefit?.max ?? 0,
        usesBase: Math.max(0, Number(usesBenefit?.base) || 0),
      });
    });
    return result;
  }, [character?.inventory]);

  // Load modifier uses from localStorage on mount / character change
  useEffect(() => {
    if (!character?.id) return;
    const uses = {};
    sneakDieModifierItems.forEach((item) => {
      const stored = localStorage.getItem(`item_uses_${character.id}_${item.inventoryItemId}`);
      uses[item.inventoryItemId] = stored !== null ? parseInt(stored, 10) : item.usesBase;
    });
    setSneakModifierUses(uses);
  }, [character?.id, sneakDieModifierItems]);

  // Stay in sync with inventory card / modal via events
  useEffect(() => {
    const handleUsesChanged = (e) => {
      const { itemId, newUses } = e.detail;
      setSneakModifierUses((prev) => ({ ...prev, [itemId]: newUses }));
    };
    const handleLongRest = (e) => {
      if (e?.detail?.characterId && e.detail.characterId !== character?.id) return;
      const uses = {};
      sneakDieModifierItems.forEach((item) => {
        uses[item.inventoryItemId] = item.usesBase;
      });
      setSneakModifierUses(uses);
    };
    window.addEventListener('itemUsesChanged', handleUsesChanged);
    window.addEventListener('longRestPerformed', handleLongRest);
    return () => {
      window.removeEventListener('itemUsesChanged', handleUsesChanged);
      window.removeEventListener('longRestPerformed', handleLongRest);
    };
  }, [character?.id, sneakDieModifierItems]);

  const handleSneakModifierUsesChange = useCallback(
    (itemId, maxUses, requestedUses) => {
      const newUses = Math.max(0, Math.min(maxUses, requestedUses));
      setSneakModifierUses((prev) => ({ ...prev, [itemId]: newUses }));
      if (character?.id) {
        localStorage.setItem(`item_uses_${character.id}_${itemId}`, String(newUses));
      }
      window.dispatchEvent(new CustomEvent('itemUsesChanged', { detail: { itemId, newUses } }));
    },
    [character?.id]
  );

  const handleChannelDivinityUsesChange = useCallback(
    (maxUses, requestedUses) => {
      const newUses = Math.max(0, Math.min(maxUses, requestedUses));
      setChannelDivinityUsesState(newUses);
      if (character?.id) {
        localStorage.setItem(`divinity_uses_${character.id}`, String(newUses));
      }
    },
    [character?.id]
  );

  // Pick the overriding die based on current charges
  const sneakDieOverride = useMemo(() => {
    for (const modifier of sneakDieModifierItems) {
      const currentCharges = sneakModifierUses[modifier.inventoryItemId] ?? modifier.usesBase;
      const die =
        modifier.chargeScaledDie[String(currentCharges)] ?? modifier.chargeScaledDie['0'];
      if (die) return die;
    }
    return null;
  }, [sneakDieModifierItems, sneakModifierUses]);

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
        const magicWeaponModifiers = getMagicWeaponModifiers(item);
        
        // Calculate to-hit and damage bonuses
        const meleeToHitOneHandBonus = getConditionalMeleeBonus('melee_weapon_attack', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 1);
        const meleeToHitTwoHandBonus = getConditionalMeleeBonus('melee_weapon_attack', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 2);
        const meleeDamageOneHandBonus = getConditionalMeleeBonus('melee_weapon_damage', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 1);
        const meleeDamageTwoHandBonus = getConditionalMeleeBonus('melee_weapon_damage', { properties: propertyNames, versatile: propertyNames.includes('Versatile'), isRanged }, 2);

        const toHit = abilityMod + profBonus + magicWeaponModifiers.attackBonus + meleeToHitOneHandBonus;
        const toHitTwoHand = abilityMod + profBonus + magicWeaponModifiers.attackBonus + meleeToHitTwoHandBonus;
        const damageBonus = abilityMod + magicWeaponModifiers.damageBonus + meleeDamageOneHandBonus;
        const versatileDamageBonus = abilityMod + magicWeaponModifiers.damageBonus + meleeDamageTwoHandBonus;
        
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
          magicBonus: magicWeaponModifiers.attackBonus,
          extraDamageDice: magicWeaponModifiers.extraDamageDice,
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
      if (isMagicItemHidden(magicItem)) return;

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

  // Build sneak list from features and magic items
  const sneakFeatures = useMemo(() => {
    const items = [];

    if (character?.features && Array.isArray(character.features)) {
      character.features.forEach((feature) => {
        const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
        const sneakBenefits = benefits.filter((benefit) => normalizeBenefitType(benefit?.type) === 'sneak');

        if (!sneakBenefits.length) return;

        sneakBenefits.forEach((benefit, benefitIndex) => {
          const prioritizedBenefits = [
            benefit,
            ...benefits.filter((_, idx) => idx !== benefitIndex)
          ];

          const sneakFeature = {
            ...feature,
            name: benefit?.name || feature?.name,
            description: benefit?.description || benefit?.effect || feature?.description,
            benefits: prioritizedBenefits,
          };

          items.push({
            type: 'feature',
            data: sneakFeature,
            id: `feature-${feature.id || feature.name}-sneak-${benefitIndex}`
          });
        });
      });
    }

    const magicItemSneakFeatures = getMagicItemActionFeatures(character, 'sneak');
    magicItemSneakFeatures.forEach((feature) => {
      items.push({
        type: 'feature',
        data: feature,
        id: `feature-${feature.id || feature.name}`
      });
    });

    items.sort((a, b) => {
      const aIsSneakAttack = isSneakAttackFeatureName(a.data?.name);
      const bIsSneakAttack = isSneakAttackFeatureName(b.data?.name);
      if (aIsSneakAttack !== bIsSneakAttack) return aIsSneakAttack ? -1 : 1;

      const nameA = a.data?.name || '';
      const nameB = b.data?.name || '';
      return nameA.localeCompare(nameB);
    });

    return items;
  }, [character]);

  // Build divinity list from features and magic items (for Clerics and Paladins)
  const divinityFeatures = useMemo(() => {
    const items = [];

    if (character?.features && Array.isArray(character.features)) {
      character.features.forEach((feature) => {
        const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
        const divinityBenefits = benefits.filter((benefit) => normalizeBenefitType(benefit?.type) === 'divinity');

        if (!divinityBenefits.length) return;

        divinityBenefits.forEach((benefit, benefitIndex) => {
          const prioritizedBenefits = [
            benefit,
            ...benefits.filter((_, idx) => idx !== benefitIndex)
          ];

          const divinityFeature = {
            ...feature,
            name: benefit?.name || feature?.name,
            description: benefit?.description || benefit?.effect || feature?.description,
            benefits: prioritizedBenefits,
          };

          items.push({
            type: 'feature',
            data: divinityFeature,
            id: `feature-${feature.id || feature.name}-divinity-${benefitIndex}`
          });
        });
      });
    }

    const magicItemDivinityFeatures = getMagicItemActionFeatures(character, 'divinity');
    magicItemDivinityFeatures.forEach((feature) => {
      items.push({
        type: 'feature',
        data: feature,
        id: `feature-${feature.id || feature.name}`
      });
    });

    items.sort((a, b) => {
      const nameA = a.data?.name || '';
      const nameB = b.data?.name || '';
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

  const spellcastingItemBonuses = useMemo(() => getMagicItemSpellcastingBonuses(character), [character?.inventory]);

  const spellAttackBonus = (proficiencyBonus || 0) + spellAbilityMod + (spellcastingItemBonuses.attackBonus || 0);
  const spellSaveDC = 8 + (proficiencyBonus || 0) + spellAbilityMod + (spellcastingItemBonuses.saveDCBonus || 0);
  const cunningStrikeDC = 8 + (proficiencyBonus || 0) + (derivedMods?.dexterity || 0);
  const sneakAttackDamage = useMemo(() => {
    const sneakAttackItem = sneakFeatures.find((item) => isSneakAttackFeatureName(item?.data?.name));
    if (!sneakAttackItem) return '';
    return resolveSneakDamageDisplay(sneakAttackItem.data, character, derivedMods, sneakDieOverride);
  }, [sneakFeatures, character, derivedMods, sneakDieOverride]);

  const limitFeatures = useMemo(() => {
    const items = [];

    if (character?.features && Array.isArray(character.features)) {
      character.features.forEach((feature, featureIndex) => {
        const sourceFeatureId = feature?.id || `feature-${feature?.name || featureIndex}`;
        const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
        const limitBenefits = benefits.filter((benefit) => normalizeBenefitType(benefit?.type) === 'limit');

        if (!limitBenefits.length) return;

        limitBenefits.forEach((benefit, benefitIndex) => {
          const prioritizedBenefits = [
            benefit,
            ...benefits.filter((_, idx) => idx !== benefitIndex)
          ];

          const limitFeature = {
            ...feature,
            name: benefit?.name || feature?.name,
            description: benefit?.description || benefit?.effect || feature?.description,
            benefits: prioritizedBenefits,
            __sourceFeatureId: sourceFeatureId,
          };

          items.push({
            type: 'feature',
            data: limitFeature,
            id: `feature-${feature.id || feature.name}-limit-${benefitIndex}`
          });
        });
      });
    }

    const magicItemLimitFeatures = getMagicItemActionFeatures(character, 'limit');
    magicItemLimitFeatures.forEach((feature) => {
      items.push({
        type: 'feature',
        data: feature,
        id: `feature-${feature.id || feature.name}`
      });
    });

    items.sort((a, b) => {
      const nameA = a.data?.name || '';
      const nameB = b.data?.name || '';
      return nameA.localeCompare(nameB);
    });

    return items;
  }, [character]);

  const soldierLimitResourceFeatures = useMemo(() => {
    const featureEntries = Array.isArray(character?.features) ? character.features : [];

    const isLimitNamed = (value) => String(value || '').toLowerCase().includes('limit');

    return featureEntries.filter((feature) => {
      const benefits = normalizeBenefits(feature?.benefits ?? feature?.benefit);
      if (!benefits.length) return false;

      const hasRelevantBenefit = benefits.some((benefit) => {
        const type = normalizeBenefitType(benefit?.type);
        return type === 'limit' || type === 'feature_die' || type === 'gauge';
      });

      if (!hasRelevantBenefit) return false;

      const sourceInfo = normalizeFeatureSource(feature?.source);
      const sourceType = String(sourceInfo?.source || '').toLowerCase().trim();
      const sourceClass = String(sourceInfo?.class || '').toLowerCase().trim();
      const sourceSubclass = String(sourceInfo?.subclass || '').toLowerCase().trim();

      if (sourceSubclass.includes('soldier')) return true;
      if (sourceType === 'subclass' && (!sourceClass || sourceClass === 'fighter')) return true;

      if (isLimitNamed(feature?.name)) return true;
      return benefits.some((benefit) => isLimitNamed(benefit?.name));
    });
  }, [character?.features]);

  const limitDieResource = useMemo(() => {
    return soldierLimitResourceFeatures.find((feature) => getFeatureDieBenefit(feature)) || null;
  }, [soldierLimitResourceFeatures]);

  const limitDieResourceId = useMemo(() => {
    if (!limitDieResource) return null;
    const featureIndex = soldierLimitResourceFeatures.indexOf(limitDieResource);
    return limitDieResource?.id || `feature-${limitDieResource?.name || featureIndex}`;
  }, [limitDieResource, soldierLimitResourceFeatures]);

  const limitGaugeTrackers = useMemo(() => {
    const seen = new Set();

    return soldierLimitResourceFeatures.reduce((trackers, feature, featureIndex) => {
      const sourceFeatureId = feature?.id || `feature-${feature?.name || featureIndex}`;
      if (!sourceFeatureId || seen.has(sourceFeatureId)) return trackers;

      const gaugeConfig = resolveLimitGauge(feature, characterLevel, derivedMods || {}, effectiveMaxHP);
      if (!gaugeConfig) return trackers;

      const gaugeStateId = `${sourceFeatureId}-gauge`;
      seen.add(sourceFeatureId);
      trackers.push({
        gaugeStateId,
        gaugeConfig,
        gaugeState: normalizeLimitGaugeSnapshot(poolState?.[gaugeStateId], gaugeConfig),
      });
      return trackers;
    }, []);
  }, [soldierLimitResourceFeatures, characterLevel, derivedMods, effectiveMaxHP, poolState]);

  const hasRogueClass = useMemo(() => {
    const classEntries = Array.isArray(character?.classes) ? character.classes : [];
    return classEntries.some((entry) => {
      const className = (entry?.definition?.name || entry?.class || '').toLowerCase().trim();
      return className === 'rogue';
    });
  }, [character?.classes]);

  const hasClericOrPaladinClass = useMemo(() => {
    const classEntries = Array.isArray(character?.classes) ? character.classes : [];
    return classEntries.some((entry) => {
      const className = (entry?.definition?.name || entry?.class || '').toLowerCase().trim();
      return className === 'cleric' || className === 'paladin';
    });
  }, [character?.classes]);

  const hasSoldierFighterClass = useMemo(() => {
    const classEntries = Array.isArray(character?.classes) ? character.classes : [];
    return classEntries.some((entry) => {
      const className = (entry?.definition?.name || entry?.class || '').toLowerCase().trim();
      const subclassName = (entry?.subclass || entry?.definition?.subclass || '').toLowerCase().trim();
      return className === 'fighter' && subclassName.includes('soldier');
    });
  }, [character?.classes]);

  const showLimitTab = hasSoldierFighterClass && (limitFeatures.length > 0 || limitDieResource || limitGaugeTrackers.length > 0);

  const limitSummary = useMemo(() => {
    if (!limitFeatures.length && !limitDieResource) {
      return {
        limitDC: 8 + (proficiencyBonus || 0) + (derivedMods?.constitution || 0),
        limitDie: '',
        limitMaxUses: 0,
      };
    }

    const primary = limitFeatures.find((item) => {
      const feature = item.data;
      return resolveFeatureDieDisplay(feature, character, proficiencyBonus, derivedMods)
        || calculateMaxUses(feature?.max_uses, proficiencyBonus, abilityModifiers, characterLevel, feature) > 0;
    }) || limitFeatures[0] || null;

    const dcFeature = primary?.data || limitDieResource;
    const dcBenefits = normalizeBenefits(dcFeature?.benefits ?? dcFeature?.benefit);
    const limitBenefit = dcBenefits.find((benefit) => normalizeBenefitType(benefit?.type) === 'limit') || {};
    const limitDie = resolveFeatureDieDisplay(limitDieResource || dcFeature, character, proficiencyBonus, derivedMods)
      || (typeof limitBenefit?.die === 'string' ? limitBenefit.die : '')
      || resolveFeatureTextTemplate('${die}', limitDieResource || dcFeature, character, proficiencyBonus, derivedMods, 'limit')
      || '';

    const abilityMap = {
      str: 'strength', strength: 'strength',
      dex: 'dexterity', dexterity: 'dexterity',
      con: 'constitution', constitution: 'constitution',
      int: 'intelligence', intelligence: 'intelligence',
      wis: 'wisdom', wisdom: 'wisdom',
      cha: 'charisma', charisma: 'charisma'
    };

    const dcAbilityRaw = String(limitBenefit?.dc_ability || limitBenefit?.ability || 'constitution').toLowerCase().trim();
    const dcAbility = abilityMap[dcAbilityRaw] || 'constitution';
    const limitDC = 8 + (proficiencyBonus || 0) + (derivedMods?.[dcAbility] || 0);

    const usesFeature = limitDieResource || dcFeature;
    const limitMaxUses = usesFeature
      ? calculateMaxUses(usesFeature?.max_uses, proficiencyBonus, abilityModifiers, characterLevel, usesFeature)
      : 0;

    return {
      limitDC,
      limitDie,
      limitMaxUses,
    };
  }, [limitFeatures, limitDieResource, proficiencyBonus, derivedMods, calculateMaxUses, abilityModifiers, character, characterLevel]);

  // Get class name for channel divinity uses calculation
  const clericOrPaladinClassName = useMemo(() => {
    const classEntries = Array.isArray(character?.classes) ? character.classes : [];
    for (const entry of classEntries) {
      const className = (entry?.definition?.name || entry?.class || '').toLowerCase().trim();
      if (className === 'cleric' || className === 'paladin') {
        return className;
      }
    }
    return null;
  }, [character?.classes]);

  // Calculate channel divinity max uses based on class and level
  const channelDivinityUses = useMemo(() => {
    if (!clericOrPaladinClassName) return 0;
    const level = getCharacterLevel(character);
    return calculateChannelDivinityUses(clericOrPaladinClassName, level);
  }, [character, clericOrPaladinClassName]);

  // Load channel divinity uses from localStorage on mount / character change
  useEffect(() => {
    if (!character?.id || !hasClericOrPaladinClass) return;
    const stored = localStorage.getItem(`divinity_uses_${character.id}`);
    setChannelDivinityUsesState(stored !== null ? parseInt(stored, 10) : 0);
  }, [character?.id, hasClericOrPaladinClass, channelDivinityUses]);

  // Stay in sync with long rest events for channel divinity
  useEffect(() => {
    const handleLongRest = (e) => {
      if (e?.detail?.characterId && e.detail.characterId !== character?.id) return;
      setChannelDivinityUsesState(channelDivinityUses);
      if (character?.id) {
        localStorage.setItem(`divinity_uses_${character.id}`, String(channelDivinityUses));
      }
    };
    window.addEventListener('longRestPerformed', handleLongRest);
    return () => {
      window.removeEventListener('longRestPerformed', handleLongRest);
    };
  }, [character?.id, channelDivinityUses]);

  useEffect(() => {
    if (!hasRogueClass && activeSubtab === 'sneak') {
      setActiveSubtab('actions');
    }
    if (!hasClericOrPaladinClass && activeSubtab === 'divinity') {
      setActiveSubtab('actions');
    }
    if (!showLimitTab && activeSubtab === 'limit') {
      setActiveSubtab('actions');
    }
  }, [hasRogueClass, hasClericOrPaladinClass, showLimitTab, activeSubtab]);

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
        {hasRogueClass && (
          <button
            className={activeSubtab === 'sneak' ? 'subtab-btn sneak active' : 'subtab-btn sneak'}
            onClick={() => setActiveSubtab('sneak')}
          >
            Sneak
          </button>
        )}
        {hasClericOrPaladinClass && (
          <button
            className={activeSubtab === 'divinity' ? 'subtab-btn divinity active' : 'subtab-btn divinity'}
            onClick={() => setActiveSubtab('divinity')}
          >
            Channel Divinity
          </button>
        )}
        {showLimitTab && (
          <button
            className={activeSubtab === 'limit' ? 'subtab-btn sneak active' : 'subtab-btn sneak'}
            onClick={() => setActiveSubtab('limit')}
          >
            Limit Breaks
          </button>
        )}
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
                  const getDamageTypeIcon = (damageType) => {
                    if (!damageType) return null;
                    return new URL(`../../../assets/icons/damage/${damageType}.svg`, import.meta.url).href;
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
                  const extraDamageEntries = Array.isArray(attack.extraDamageDice) ? attack.extraDamageDice : [];
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
                          {hasDamage && extraDamageEntries.length > 0 ? (
                            <div className="damage-extra-row" aria-label="Extra damage">
                              {extraDamageEntries.map((entry, index) => {
                                const extraIcon = getDamageTypeIcon(entry?.damageType);
                                return (
                                  <div
                                    key={`${attack.id}-extra-${entry?.die || 'die'}-${entry?.damageType || 'none'}-${index}`}
                                    className="damage-extra-chip"
                                    title={`${entry?.die || ''}${entry?.damageType ? ` ${entry.damageType}` : ''}`.trim()}
                                  >
                                    <span className="damage-extra-die">{entry?.die || ''}</span>
                                    {extraIcon && (
                                      <img src={extraIcon} alt="" className="damage-extra-icon" aria-hidden="true" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>

                        <div className={`action-col dmgtype-col${getDamageTypeIcon(attack.damageType) ? '' : ' no-dmgtype'}`}>
                          {getDamageTypeIcon(attack.damageType) && (
                            <img src={getDamageTypeIcon(attack.damageType)} alt={attack.damageType} title={attack.damageType} className="damage-icon" />
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
                    const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods, 'bonus_action');
                    const descriptionText = resolveFeatureTextTemplate(feature?.description, feature, character, proficiencyBonus, derivedMods, 'bonus_action');
                    
                    return (
                      <div key={item.id} className="bonus-action-feature">
                        <div className="feature-header">
                          <h4 className="feature-name">{feature.name}</h4>
                        </div>
                        
                        {FeatureUsesTracker && (
                          <FeatureUsesTracker
                            maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character?.level, feature)}
                            featureId={featureId}
                            storedUses={usesState[featureId]}
                            onUsesChange={onUsesChange}
                          />
                        )}
                        
                        {(shortText || descriptionText) && (
                          <div className="bonus-action-feature-short">
                            {renderSpellDescription(shortText || descriptionText)}
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
                    const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods, 'reaction');
                    const descriptionText = resolveFeatureTextTemplate(feature?.description, feature, character, proficiencyBonus, derivedMods, 'reaction');
                    
                    return (
                      <div key={item.id} className="reaction-feature">
                        <div className="feature-header">
                          <h4 className="feature-name">{feature.name}</h4>
                        </div>
                        
                        {FeatureUsesTracker && (
                          <FeatureUsesTracker
                            maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character?.level, feature)}
                            featureId={featureId}
                            storedUses={usesState[featureId]}
                            onUsesChange={onUsesChange}
                          />
                        )}
                        
                        {(shortText || descriptionText) && (
                          <div className="reaction-feature-short">
                            {renderSpellDescription(shortText || descriptionText)}
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
        {hasRogueClass && activeSubtab === 'sneak' && (
          <>
            {sneakDieModifierItems.length > 0 && (
              <div className="sneak-mettle-row">
                {sneakDieModifierItems.map((modifier) => {
                  const current =
                    sneakModifierUses[modifier.inventoryItemId] ?? modifier.usesBase;
                  return (
                    <div key={modifier.inventoryItemId} className="sneak-mettle-tracker">
                      <span className="sneak-mettle-name">{modifier.chargeSource}</span>
                      <div className="sneak-mettle-boxes">
                        {Array.from({ length: Math.max(0, modifier.usesMax) }, (_, index) => {
                          const boxUsed = index < current;
                          const nextUses = boxUsed && current === index + 1 ? index : index + 1;
                          return (
                            <button
                              key={`${modifier.inventoryItemId}-mettle-box-${index}`}
                              className={`use-box${boxUsed ? ' used' : ''}`}
                              onClick={() =>
                                handleSneakModifierUsesChange(
                                  modifier.inventoryItemId,
                                  modifier.usesMax,
                                  nextUses
                                )
                              }
                              title={`${modifier.chargeSource}: ${index + 1}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="sneak-subtab-header">
              {sneakAttackDamage ? (
                <span className="sneak-metric-text" title="Sneak attack damage">
                  Sneak Attack: {sneakAttackDamage}
                </span>
              ) : null}
              {sneakAttackDamage ? <span className="sneak-metric-separator">|</span> : null}
              <span className="sneak-metric-text" title="Cunning Strike save DC">
                Cunning Strike DC: {cunningStrikeDC}
              </span>
            </div>
            {sneakFeatures.length > 0 ? (
              <div className="sneak-container">
                {sneakFeatures.map((item) => {
                  const feature = item.data;
                  const featureId = item.id;
                  const isPinnedSneakAttack = isSneakAttackFeatureName(feature?.name);
                  const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods, 'sneak');
                  const descriptionText = resolveFeatureBenefitDescription(feature, character, proficiencyBonus, derivedMods, 'sneak');

                  return (
                    <div key={item.id} className={isPinnedSneakAttack ? 'sneak-feature is-sticky-sneak' : 'sneak-feature'}>
                      <div className="feature-header">
                        <h4 className="feature-name">{feature.name}</h4>
                      </div>

                      {FeatureUsesTracker && (
                        <FeatureUsesTracker
                          maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character?.level, feature)}
                          featureId={featureId}
                          storedUses={usesState[featureId]}
                          onUsesChange={onUsesChange}
                        />
                      )}

                      {(shortText || descriptionText) && (
                        <div className="sneak-feature-short">
                          {renderSpellDescription(shortText || descriptionText)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="info-text">No sneak features available.</p>
            )}
          </>
        )}
        {hasClericOrPaladinClass && activeSubtab === 'divinity' && (
          <>
            <div className="divinity-subtab-header">
              <span className="divinity-metric-text" title="Channel Divinity uses">
                Channel Divinity Uses:
              </span>
              <div className="divinity-uses-boxes-gap" />
              <span className="divinity-metric-text divinity-dc" title="Spell Save DC">
                DC {spellSaveDC}
              </span>
              <div className="divinity-uses-boxes">
                {Array.from({ length: Math.max(0, channelDivinityUses) }, (_, index) => {
                  const boxUsed = index < channelDivinityUsesState;
                  const nextUses = boxUsed && channelDivinityUsesState === index + 1 ? index : index + 1;
                  return (
                    <button
                      key={`divinity-box-${index}`}
                      className={`use-box${boxUsed ? ' used' : ''}`}
                      onClick={() =>
                        handleChannelDivinityUsesChange(
                          channelDivinityUses,
                          nextUses
                        )
                      }
                      title={`Channel Divinity: ${index + 1}`}
                    />
                  );
                })}
              </div>
            </div>
            {divinityFeatures.length > 0 ? (
              <div className="divinity-container">
                {divinityFeatures.map((item) => {
                  const feature = item.data;
                  const featureId = item.id;
                  const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods, 'divinity');
                  const descriptionText = resolveFeatureBenefitDescription(feature, character, proficiencyBonus, derivedMods, 'divinity');

                  return (
                    <div key={item.id} className="divinity-feature">
                      <div className="feature-header">
                        <h4 className="feature-name">{feature.name}</h4>
                      </div>

                      {FeatureUsesTracker && (
                        <FeatureUsesTracker
                          maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, character?.level, feature)}
                          featureId={featureId}
                          storedUses={usesState[featureId]}
                          onUsesChange={onUsesChange}
                        />
                      )}

                      {(shortText || descriptionText) && (
                        <div className="divinity-feature-short">
                          {renderSpellDescription(shortText || descriptionText)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="info-text">No channel divinity features available.</p>
            )}
          </>
        )}
        {showLimitTab && activeSubtab === 'limit' && (
          <>
            <div className="sneak-subtab-header">
              <span className="sneak-metric-text" title="Limit save DC">
                Limit DC: {limitSummary.limitDC}
              </span>
              <span className="sneak-metric-separator">|</span>
              <span className="sneak-metric-text" title="Current limit die size">
                Limit Die: {limitSummary.limitDie || '—'}
              </span>
              <span className="sneak-metric-separator">|</span>
              <span className="sneak-metric-text" title="Maximum limit uses">
                Limit Uses: {limitSummary.limitMaxUses > 0 ? limitSummary.limitMaxUses : '—'}
              </span>
            </div>
            {(limitDieResource || limitGaugeTrackers.length > 0) && (
              <div className="limit-resource-strip">
                {limitDieResource && FeatureUsesTracker && (
                  <div className="limit-resource-item">
                    <span className="limit-resource-name">{getFeatureDieBenefit(limitDieResource)?.name || limitDieResource.name || 'Limit Die'}</span>
                    <FeatureUsesTracker
                      maxUses={calculateMaxUses(limitDieResource.max_uses, proficiencyBonus, abilityModifiers, characterLevel, limitDieResource)}
                      featureId={limitDieResourceId}
                      storedUses={limitDieResourceId ? usesState[limitDieResourceId] : undefined}
                      onUsesChange={onUsesChange}
                    />
                  </div>
                )}
                {limitGaugeTrackers.map(({ gaugeStateId, gaugeConfig, gaugeState }) => (
                  <div key={gaugeStateId} className="limit-resource-item limit-gauge-item">
                    <span className="limit-resource-name">{gaugeConfig.name}</span>
                    <div className="limit-gauge-inline">
                      <input
                        className="limit-gauge-input"
                        type="number"
                        min={0}
                        max={gaugeConfig.threshold}
                        value={Object.prototype.hasOwnProperty.call(limitGaugeDraftValues, gaugeStateId)
                          ? limitGaugeDraftValues[gaugeStateId]
                          : String(gaugeState.value)}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === '' || /^\d+$/.test(raw)) {
                            setLimitGaugeDraftValues((prev) => ({ ...prev, [gaugeStateId]: raw }));
                          }
                        }}
                        onBlur={() => commitLimitGaugeDraftValue(
                          gaugeStateId,
                          gaugeConfig,
                          gaugeState,
                          Object.prototype.hasOwnProperty.call(limitGaugeDraftValues, gaugeStateId)
                            ? limitGaugeDraftValues[gaugeStateId]
                            : String(gaugeState.value)
                        )}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitLimitGaugeDraftValue(
                              gaugeStateId,
                              gaugeConfig,
                              gaugeState,
                              Object.prototype.hasOwnProperty.call(limitGaugeDraftValues, gaugeStateId)
                                ? limitGaugeDraftValues[gaugeStateId]
                                : String(gaugeState.value)
                            );
                          }
                        }}
                        aria-label="Limit gauge value"
                      />
                      <span className="limit-gauge-value">/ {gaugeConfig.threshold}</span>
                      <button
                        type="button"
                        className={`use-box${gaugeState.charges > 0 ? ' used' : ''}`}
                        onClick={() => onPoolChange(gaugeStateId, normalizeLimitGaugeSnapshot({
                          ...gaugeState,
                          charges: gaugeState.charges > 0 ? 0 : 1,
                          lastProgressAt: Date.now(),
                        }, gaugeConfig))}
                        aria-label="Toggle limit charge"
                        title={`${gaugeConfig.name} charge`}
                      />
                      <button
                        type="button"
                        className="uses-reset"
                        onClick={() => onPoolChange(gaugeStateId, normalizeLimitGaugeSnapshot({
                          value: 0,
                          charges: 0,
                          lastProgressAt: Date.now(),
                        }, gaugeConfig))}
                        aria-label="Reset limit gauge"
                      >
                        <svg className="uses-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {limitFeatures.length > 0 ? (
              <div className="sneak-container">
                {limitFeatures.map((item) => {
                  const feature = item.data;
                  const sourceFeatureId = feature.__sourceFeatureId || feature.id || feature.name;
                  const featureId = sourceFeatureId;
                  const shortText = resolveFeatureShortText(feature, character, proficiencyBonus, derivedMods, 'limit');
                  const descriptionText = resolveFeatureBenefitDescription(feature, character, proficiencyBonus, derivedMods, 'limit');

                  return (
                    <div key={item.id} className="sneak-feature">
                      <div className="feature-header">
                        <h4 className="feature-name">{feature.name}</h4>
                      </div>

                      {FeatureUsesTracker && (
                        <FeatureUsesTracker
                          maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers, characterLevel, feature)}
                          featureId={featureId}
                          storedUses={usesState[featureId]}
                          onUsesChange={onUsesChange}
                        />
                      )}

                      {(shortText || descriptionText) && (
                        <div className="sneak-feature-short">
                          {renderSpellDescription(shortText || descriptionText)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="info-text">No limit features available.</p>
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
