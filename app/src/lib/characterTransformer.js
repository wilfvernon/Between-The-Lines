/**
 * Transforms D&D Beyond character JSON into our database schema format
 */

/**
 * Main transformation function
 * @param {Object} dndBeyondData - The full D&D Beyond character JSON
 * @param {string} userId - The user ID to associate with this character
 * @returns {Object} Structured data ready for database insertion
 */
export function transformDnDBeyondCharacter(dndBeyondData, userId) {
  const char = dndBeyondData.data;
  
  return {
    character: extractCharacterCore(char, userId),
    skills: extractSkills(char),
    spells: extractSpells(char),
    features: extractFeatures(char),
    feats: extractFeats(char),
    abilityScoreImprovements: extractAbilityScoreImprovements(char),
    inventory: extractInventory(char),
    currency: extractCurrency(char),
    senses: extractSenses(char),
    classSpecific: extractClassSpecific(char),
  };
}

/**
 * Extract core character data for the `characters` table
 */
function extractCharacterCore(char, userId) {
  // Transform classes to JSONB array format: [{"class": "Rogue", "level": 3, "subclass": "Swashbuckler"}]
  const classes = char.classes.map(cls => ({
    class: cls.definition?.name || 'Unknown',
    level: cls.level,
    ...(cls.subclassDefinition?.name && { subclass: cls.subclassDefinition.name })
  }));
  
  // Total character level
  const level = char.classes.reduce((sum, cls) => sum + cls.level, 0);
  
  // Map D&D Beyond stat IDs (1-6) to our ability names
  const abilityMap = {
    1: 'strength',
    2: 'dexterity', 
    3: 'constitution',
    4: 'intelligence',
    5: 'wisdom',
    6: 'charisma'
  };
  
  // Build ability scores object with save proficiencies
  const abilityScores = {};
  const saveProficiencies = extractSaveProficiencies(char);
  
  char.stats.forEach(stat => {
    const abilityName = abilityMap[stat.id];
    abilityScores[abilityName] = {
      score: stat.value,
      proficient: saveProficiencies.includes(abilityName)
    };
  });

  // Debug: Log background modifiers to see ASI details
  if (char.modifiers?.background && char.modifiers.background.length > 0) {
    console.log('[extractCharacterCore] Background modifiers for', char.name, ':', char.modifiers.background);
  }
  
  return {
    userId,
    name: char.name,
    fullName: null,
    level,
    classes,
    species: char.race?.fullName || 'Unknown',
    background: char.background?.definition?.name || null,
    maxHp: char.overrideHitPoints || char.baseHitPoints,
    speed: char.race?.weightSpeeds?.normal?.walk || 30,
    ...flattenAbilityScores(abilityScores),
    spellcastingAbility: determineSpellcastingAbility(char.classes[0]),
  };
}

/**
 * Flatten ability scores for database columns
 */
function flattenAbilityScores(abilityScores) {
  return {
    strength: abilityScores.strength.score,
    dexterity: abilityScores.dexterity.score,
    constitution: abilityScores.constitution.score,
    intelligence: abilityScores.intelligence.score,
    wisdom: abilityScores.wisdom.score,
    charisma: abilityScores.charisma.score,
    saveStrength: abilityScores.strength.proficient,
    saveDexterity: abilityScores.dexterity.proficient,
    saveConstitution: abilityScores.constitution.proficient,
    saveIntelligence: abilityScores.intelligence.proficient,
    saveWisdom: abilityScores.wisdom.proficient,
    saveCharisma: abilityScores.charisma.proficient,
  };
}

/**
 * Extract saving throw proficiencies from modifiers
 */
function extractSaveProficiencies(char) {
  const proficiencies = [];
  const saveMap = {
    'strength-saving-throws': 'strength',
    'dexterity-saving-throws': 'dexterity',
    'constitution-saving-throws': 'constitution',
    'intelligence-saving-throws': 'intelligence',
    'wisdom-saving-throws': 'wisdom',
    'charisma-saving-throws': 'charisma',
  };
  
  // Check all modifier sources
  const allModifiers = [
    ...(char.modifiers?.race || []),
    ...(char.modifiers?.class || []),
    ...(char.modifiers?.background || []),
    ...(char.modifiers?.feat || []),
  ];
  
  allModifiers.forEach(mod => {
    // Saving throw proficiencies have type "proficiency" and subType ending in "-saving-throws"
    if (mod.type === 'proficiency' && mod.subType in saveMap) {
      const abilityName = saveMap[mod.subType];
      if (abilityName && !proficiencies.includes(abilityName)) {
        proficiencies.push(abilityName);
      }
    }
  });
  
  return proficiencies;
}

/**
 * Determine spellcasting ability based on class
 */
function determineSpellcastingAbility(primaryClass) {
  if (!primaryClass) return null;
  
  const className = primaryClass.definition?.name?.toLowerCase();
  const spellcastingMap = {
    'wizard': 'int',
    'sorcerer': 'cha',
    'warlock': 'cha',
    'bard': 'cha',
    'cleric': 'wis',
    'druid': 'wis',
    'ranger': 'wis',
    'paladin': 'cha',
    'artificer': 'int',
  };
  
  return spellcastingMap[className] || null;
}

/**
 * Extract skill proficiencies (only proficient or expertise)
 */
function extractSkills(char) {
  const skills = [];
  const skillMap = {
    'acrobatics': 'Acrobatics',
    'animal-handling': 'Animal Handling',
    'arcana': 'Arcana',
    'athletics': 'Athletics',
    'deception': 'Deception',
    'history': 'History',
    'insight': 'Insight',
    'intimidation': 'Intimidation',
    'investigation': 'Investigation',
    'medicine': 'Medicine',
    'nature': 'Nature',
    'perception': 'Perception',
    'performance': 'Performance',
    'persuasion': 'Persuasion',
    'religion': 'Religion',
    'sleight-of-hand': 'Sleight of Hand',
    'stealth': 'Stealth',
    'survival': 'Survival',
  };
  
  // Collect all modifiers
  const allModifiers = [
    ...(char.modifiers?.race || []),
    ...(char.modifiers?.class || []),
    ...(char.modifiers?.background || []),
    ...(char.modifiers?.feat || []),
  ];
  
  // Track proficiencies and expertise separately
  const proficientSkills = new Set();
  const expertiseSkills = new Set();
  
  allModifiers.forEach(mod => {
    // Skill proficiencies have type "proficiency" and subType is the skill name
    if (mod.type === 'proficiency' && mod.subType in skillMap) {
      const skillName = skillMap[mod.subType];
      if (skillName) {
        proficientSkills.add(skillName);
      }
    }
    
    // Expertise has type "expertise" and subType is the skill name
    if (mod.type === 'expertise' && mod.subType in skillMap) {
      const skillName = skillMap[mod.subType];
      if (skillName) {
        expertiseSkills.add(skillName);
        // Also add to proficient (expertise implies proficiency)
        proficientSkills.add(skillName);
      }
    }
  });
  
  // Only include skills that have proficiency or expertise
  proficientSkills.forEach(skillName => {
    skills.push({
      skill_name: skillName,
      expertise: expertiseSkills.has(skillName),
    });
  });
  
  return skills;
}

/**
 * Extract spells from all sources
 */
function extractSpells(char) {
  const spells = [];
  const seen = new Set();
  
  // Helper to add spell
  const addSpell = (spell, alwaysPrepared = false) => {
    const name = spell.definition?.name || 'Unknown Spell';
    const level = spell.definition?.level ?? 0;
    const key = `${name}::${level}`;
    if (seen.has(key)) return;
    seen.add(key);

    spells.push({
      // Store spell name for later lookup of spell_id in the spells table
      name,
      is_prepared: spell.prepared || false,
      always_prepared: alwaysPrepared,
    });
  };
  
  // Class spells
  if (char.spells?.class) {
    char.spells.class.forEach(spell => addSpell(spell, false));
  }

  // Class spells (DDB classSpells payload)
  if (Array.isArray(char.classSpells)) {
    char.classSpells.forEach(group => {
      if (Array.isArray(group.spells)) {
        group.spells.forEach(spell => addSpell(spell, false));
      }
    });
  }
  
  // Race spells (always prepared)
  if (char.spells?.race) {
    char.spells.race.forEach(spell => addSpell(spell, true));
  }
  
  // Feat spells (always prepared)
  if (char.spells?.feat) {
    char.spells.feat.forEach(spell => addSpell(spell, true));
  }
  
  return spells;
}

/**
 * Extract features from race and class
 */
function extractFeatures(char) {
  const features = [];
  
  // Racial traits
  if (char.race?.racialTraits) {
    char.race.racialTraits.forEach(trait => {
      if (trait.definition) {
        features.push({
          name: trait.definition.name,
          source: 'species',
          description: stripHtml(trait.definition.description || ''),
          max_uses: trait.limitedUse?.maxUses || null,
          reset_on: mapResetType(trait.limitedUse?.resetType),
        });
      }
    });
  }
  
  // Class features
  if (char.classes?.[0]?.classFeatures) {
    char.classes[0].classFeatures.forEach(feature => {
      if (feature.definition) {
        features.push({
          name: feature.definition.name,
          source: 'class',
          description: stripHtml(feature.definition.description || ''),
          max_uses: feature.limitedUse?.maxUses || null,
          reset_on: mapResetType(feature.limitedUse?.resetType),
        });
      }
    });
  }
  
  // Background features
  if (char.background?.definition?.featureName) {
    features.push({
      name: char.background.definition.featureName,
      source: 'background',
      description: stripHtml(char.background.definition.featureDescription || ''),
      max_uses: null,
      reset_on: null,
    });
  }
  
  return features;
}

/**
 * Extract ability score improvements from background and level ASIs
 */
function extractAbilityScoreImprovements(char) {
  const asiList = [];
  const featChoices = char.choices?.feat || [];
  const choiceDefinitions = char.choices?.choiceDefinitions || [];
  
  console.log('[extractAbilityScoreImprovements] Starting ASI extraction');
  
  // Map ability option IDs to ability names (from choiceDefinitions)
  const buildAbilityOptionMap = () => {
    const map = new Map();
    const abilityChoiceDef = choiceDefinitions.find(def => 
      def.options?.some(opt => ['Constitution', 'Wisdom', 'Charisma', 'Strength', 'Dexterity', 'Intelligence'].includes(opt.label))
    );
    
    if (abilityChoiceDef?.options) {
      console.log('[extractAbilityScoreImprovements] Found ability choice def with options:', abilityChoiceDef.options);
      abilityChoiceDef.options.forEach(opt => {
        const abilityName = opt.label?.toLowerCase();
        if (abilityName) {
          map.set(opt.id, abilityName);
        }
      });
    } else {
      console.warn('[extractAbilityScoreImprovements] Could not find ability choice definition');
    }
    return map;
  };
  
  const abilityOptionMap = buildAbilityOptionMap();
  
  // Find ASI feats (those with name ending in "Ability Score Improvement" or "Ability Scores")
  if (char.feats) {
    char.feats.forEach(feat => {
      const featName = feat.definition?.name || '';
      if (!/Ability Score Improvements?$/.test(featName)) return;
      
      console.log('[extractAbilityScoreImprovements] Found ASI feat:', featName, 'with ID:', feat.definition?.id);
      
      // Find choices for this feat
      const asiChoices = featChoices.filter(choice => choice.componentId === feat.definition.id);
      console.log('[extractAbilityScoreImprovements] Found', asiChoices.length, 'choices for this feat');
      
      asiChoices.forEach(choice => {
        // Get the ability from the option value
        const ability = abilityOptionMap.get(choice.optionValue);
        console.log('[extractAbilityScoreImprovements] Choice option value', choice.optionValue, '→ ability', ability, '(label:', choice.label, ')');
        
        if (!ability) return;
        
        // Determine the amount based on choice label
        const label = choice.label || '';
        let amount = 1;
        if (label.includes('+2')) amount = 2;
        else if (label.includes('+3')) amount = 3;
        
        asiList.push({
          ability,
          amount,
          source: feat.componentTypeId === 12168134 ? char.background?.definition?.name || 'Background' : 'Ability Score Improvement',
          sourceType: feat.componentTypeId === 12168134 ? 'background' : 'level',
        });
        console.log('[extractAbilityScoreImprovements] Added ASI:', ability, '+' + amount);
      });
    });
  }
  
  console.log('[extractAbilityScoreImprovements] Extracted', asiList.length, 'total ASIs');
  return asiList.length > 0 ? asiList : null;
}

/**
 * Extract feats
 */
function extractFeats(char) {
  const feats = [];
  const featChoices = char.choices?.feat || [];
  const featOptionNameMap = buildOptionNameMap(char.options?.feat || []);
  const spellNameById = buildSpellNameMap(char.spells || {});
  const abilityNames = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  
  // Feats to skip (placeholders, background ASIs, etc.)
  const skipFeats = new Set([
    'Dark Bargain', // Placeholder
    /Ability Score Improvements$/ // Background ASI feats like "Hermit Ability Score Improvements"
  ]);
  
  const shouldSkipFeat = (featName) => {
    return skipFeats.has(featName) || 
           Array.from(skipFeats).some(skip => skip instanceof RegExp && skip.test(featName));
  };
  
  if (char.feats) {
    char.feats.forEach(feat => {
      if (feat.definition) {
        const featName = feat.definition.name;
        
        // Skip placeholders and background ASIs
        if (shouldSkipFeat(featName)) {
          console.log(`[extractFeats] Skipping: ${featName}`);
          return;
        }
        
        const choices = buildFeatChoices(
          feat.definition.id,
          featChoices,
          featOptionNameMap,
          spellNameById,
          abilityNames
        );

        feats.push({
          // Store feat name for later lookup of feat_id in the feats table
          name: featName,
          source: feat.componentTypeId === 12168134 ? 'background' : 'level',
          choices,
        });
      }
    });
  }
  
  return feats;
}

function buildOptionNameMap(optionDefs) {
  const map = new Map();
  optionDefs.forEach((opt) => {
    if (opt?.definition?.id && opt?.definition?.name) {
      map.set(opt.definition.id, opt.definition.name);
    }
  });
  return map;
}

function buildSpellNameMap(spellGroups) {
  const map = new Map();
  const addSpell = (spell) => {
    if (spell?.definition?.id && spell?.definition?.name) {
      map.set(spell.definition.id, spell.definition.name);
    }
  };

  ['class', 'race', 'feat', 'item'].forEach((key) => {
    const spells = spellGroups?.[key];
    if (Array.isArray(spells)) {
      spells.forEach(addSpell);
    }
  });

  return map;
}

function buildFeatChoices(featId, choices, optionNameMap, spellNameById, abilityNames) {
  const selections = choices
    .filter((choice) => choice.componentId === featId)
    .map((choice) => {
      const optionName = resolveOptionName(choice, optionNameMap, spellNameById);
      return {
        id: choice.id,
        label: choice.label || null,
        type: choice.type,
        subType: choice.subType ?? null,
        optionValue: choice.optionValue ?? null,
        optionName
      };
    });

  if (selections.length === 0) return null;

  const spellsChosen = selections
    .filter((choice) => choice.label?.toLowerCase().includes('spell') && choice.optionName)
    .map((choice) => choice.optionName);

  const abilityChoice = selections
    .map((choice) => choice.optionName)
    .find((name) => abilityNames.includes(name || ''));

  return {
    selections,
    ...(spellsChosen.length > 0 ? { spellsChosen } : {}),
    ...(abilityChoice ? { abilityChoice: abilityChoice.toLowerCase() } : {})
  };
}

function resolveOptionName(choice, optionNameMap, spellNameById) {
  if (choice?.optionValue && spellNameById.has(choice.optionValue)) {
    return spellNameById.get(choice.optionValue);
  }
  if (choice?.optionValue && optionNameMap.has(choice.optionValue)) {
    return optionNameMap.get(choice.optionValue);
  }
  return null;
}

/**
 * Extract inventory items
 */
function extractInventory(char) {
  const inventory = [];
  
  if (char.inventory) {
    char.inventory.forEach(item => {
      const def = item.definition;
      if (!def) return;
      
      // Determine if it's a magic item
      const isMagicItem = Boolean(def.magic || def.canAttune || item.isAttuned);
      
      inventory.push({
        // Store item name for lookups (needed for both magic and mundane items)
        name: def.name,
        is_magic_item: isMagicItem,
        quantity: item.quantity || 1,
        equipped: item.equipped || false,
        attuned: item.isAttuned || false,
        notes: null,
      });
    });
  }
  
  return inventory;
}

/**
 * Extract currency (gold only)
 */
function extractCurrency(char) {
  return {
    gold: char.currencies?.gp || 0,
  };
}

/**
 * Extract senses from modifiers
 */
function extractSenses(char) {
  const senses = [];
  const senseKeywords = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
  
  // Check all modifier sources
  const allModifiers = [
    ...(char.modifiers?.race || []),
    ...(char.modifiers?.class || []),
    ...(char.modifiers?.background || []),
    ...(char.modifiers?.feat || []),
    ...(char.modifiers?.item || []),
  ];
  
  allModifiers.forEach(mod => {
    // Senses have type "set-base" or "sense" and subType is the sense name
    if ((mod.type === 'set-base' || mod.type === 'sense') && senseKeywords.includes(mod.subType)) {
      const range = mod.value || mod.fixedValue || 0;
      if (range > 0) {
        senses.push({
          sense_type: mod.subType,
          range,
          notes: null,
        });
      }
    }
  });
  
  // Also check if senses are in trait descriptions (fallback)
  if (senses.length === 0 && Array.isArray(char.traits)) {
    char.traits.forEach(trait => {
      const desc = (trait.description || '').toLowerCase();
      senseKeywords.forEach(sense => {
        if (desc.includes(sense)) {
          // Try to extract range from description (e.g., "darkvision 60 feet")
          const rangeMatch = desc.match(new RegExp(sense + '\\s+(\\d+)', 'i'));
          const range = rangeMatch ? parseInt(rangeMatch[1]) : 60;
          senses.push({
            sense_type: sense,
            range,
            notes: trait.name,
          });
        }
      });
    });
  }
  
  return senses;
}

/**
 * Extract class-specific data (wizard spellbook, ki points, etc.)
 */
function extractClassSpecific(char) {
  const primaryClass = char.classes?.[0];
  if (!primaryClass) return {};
  
  const className = primaryClass.definition?.name?.toLowerCase();
  const data = {};
  
  // Wizard: Extract full spellbook
  if (className === 'wizard') {
    const spellbook = [];
    if (char.spells?.class) {
      char.spells.class.forEach(spell => {
        if (spell.definition?.name) {
          spellbook.push(spell.definition.name);
        }
      });
    }
    data.spellbook = spellbook;
  }
  
  // Warlock: Extract invocations
  if (className === 'warlock') {
    const invocations = [];
    if (char.options?.class) {
      char.options.class.forEach(option => {
        if (option.definition?.name?.toLowerCase().includes('invocation')) {
          invocations.push(option.definition.name);
        }
      });
    }
    data.invocations = invocations;
    
    // Pact type
    const pactOption = char.options?.class?.find(opt => 
      opt.definition?.name?.toLowerCase().includes('pact of')
    );
    if (pactOption) {
      data.pactType = pactOption.definition.name;
    }
  }
  
  // Monk: Ki points
  if (className === 'monk') {
    data.kiPointsMax = primaryClass.level;
  }
  
  // Sorcerer: Sorcery points and metamagic
  if (className === 'sorcerer') {
    data.sorceryPointsMax = primaryClass.level;
    
    const metamagic = [];
    if (char.options?.class) {
      char.options.class.forEach(option => {
        if (option.definition?.name?.toLowerCase().includes('metamagic')) {
          metamagic.push(option.definition.name);
        }
      });
    }
    data.metamagic = metamagic;
  }
  
  return data;
}

/**
 * Helper: Strip HTML tags from text
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Helper: Map D&D Beyond reset types to our schema
 */
function mapResetType(resetType) {
  if (!resetType) return null;
  
  const resetMap = {
    1: 'short', // Short rest
    2: 'long',  // Long rest
    3: 'long',  // Long rest
    4: 'dawn',  // Daily at dawn
  };
  
  return resetMap[resetType] || null;
}

/**
 * Calculate proficiency bonus from level
 */
export function calculateProficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/**
 * Calculate ability modifier from score
 */
export function calculateAbilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
