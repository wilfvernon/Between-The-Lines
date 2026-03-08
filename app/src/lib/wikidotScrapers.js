/**
 * Shared scraper functions for parsing wikidot HTML
 */

/**
 * Parse spell data from wikidot HTML
 */
export function parseSpellHtml(html, spellUrl = null) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Extract spell name from title
  const pageTitle = doc.querySelector('.page-title') || doc.querySelector('h1');
  let title = pageTitle?.textContent?.trim() || 
              doc.title.replace(' - D&D 2024', '').replace(' - D&D 5e', '').replace(' - ', '').trim();
  
  // Fallback: extract spell name from URL if we have it
  if (!title && spellUrl) {
    const match = spellUrl.match(/\/spell:([^\/]+)/i);
    if (match) {
      // Convert slug back to title case: "magic-missile" -> "Magic Missile"
      title = match[1]
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  // Extract stats from the page
  const pageContent = doc.querySelector('#page-content') || doc.body;
  if (!pageContent) throw new Error('Could not find page content');
  
  const text = pageContent.textContent;
  
  // Parse level (e.g., "1st-level", "Level 1", or "Cantrip")
  // Search only in first 500 chars to avoid stat blocks
  const headerText = text.substring(0, 500);
  
  // Look for patterns like "1st-level", "2nd-level", "Cantrip" (not multi-digit like "16")
  let level = 0;
  if (/\bCantrip\b/i.test(headerText)) {
    level = 0;
  } else {
    const levelMatch = headerText.match(/\b([1-9])(?:st|nd|rd|th)?\s*-?\s*level\b/i);
    if (levelMatch) {
      level = parseInt(levelMatch[1], 10);
    }
  }
  
  // Parse school
  const schoolMatch = text.match(/(Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation)/i);
  const school = schoolMatch ? schoolMatch[1] : '';
  
  // Parse casting time
  const castingTimeMatch = text.match(/Casting Time:\s*([^\n]+)/i);
  const casting_time = castingTimeMatch ? castingTimeMatch[1].trim() : '';
  
  // Parse range
  const rangeMatch = text.match(/Range:\s*([^\n]+)/i);
  const range = rangeMatch ? rangeMatch[1].trim() : '';
  
  // Parse components
  const componentsMatch = text.match(/Components?:\s*([^\n]+)/i);
  const components = componentsMatch ? componentsMatch[1].trim() : '';
  
  // Parse duration
  const durationMatch = text.match(/Duration:\s*([^\n]+)/i);
  const duration = durationMatch ? durationMatch[1].trim() : '';
  
  // Get description - find text after Duration and before "At Higher Levels" or "Using a Higher-Level Spell Slot" or end
  let description = '';
  const durationIndex = text.indexOf('Duration:');
  if (durationIndex > 0) {
    const afterDuration = text.slice(durationIndex);
    const descStart = afterDuration.indexOf('\n') + 1;
    const higherIndex = afterDuration.indexOf('At Higher Levels');
    const slotIndex = afterDuration.indexOf('Using a Higher-Level Spell Slot');
    let descEnd = afterDuration.length;
    if (higherIndex > 0 && slotIndex > 0) {
      descEnd = Math.min(higherIndex, slotIndex);
    } else if (higherIndex > 0) {
      descEnd = higherIndex;
    } else if (slotIndex > 0) {
      descEnd = slotIndex;
    }
    description = afterDuration.slice(descStart, descEnd).trim();
  }
  
  // Parse higher levels
  let higher_levels = '';
  const higherMatch = text.match(/At Higher Levels[:\s]*([^]+?)(?=\n\n|\*\*|Available|$)/i);
  if (higherMatch) {
    higher_levels = higherMatch[1].trim();
  } else {
    const slotMatch = text.match(/Using a Higher-Level Spell Slot\.?\s*([^]+?)(?=\n\n|\*\*|Available|$)/i);
    if (slotMatch) {
      higher_levels = slotMatch[1].trim();
    }
  }

  // Parse combat mechanics from description and full text
  const fullText = description + ' ' + higher_levels;
  const lowerText = fullText.toLowerCase();

  // Detect is_attack - spell attack roll
  const is_attack = /spell attack|makes? a spell attack|makes? an attack roll/.test(lowerText);

  // Detect is_save - saving throw
  const is_save = /saving throw|make a.*save|makes? a.*saving throw/.test(lowerText);

  // Extract save_type if saving throw is required
  let save_type = null;
  if (is_save) {
    const savePatterns = [
      { pattern: /\b(?:Strength|STR)\s+(?:saving throw|save)\b/i, value: 'STR' },
      { pattern: /\b(?:Dexterity|DEX)\s+(?:saving throw|save)\b/i, value: 'DEX' },
      { pattern: /\b(?:Constitution|CON)\s+(?:saving throw|save)\b/i, value: 'CON' },
      { pattern: /\b(?:Intelligence|INT)\s+(?:saving throw|save)\b/i, value: 'INT' },
      { pattern: /\b(?:Wisdom|WIS)\s+(?:saving throw|save)\b/i, value: 'WIS' },
      { pattern: /\b(?:Charisma|CHA)\s+(?:saving throw|save)\b/i, value: 'CHA' }
    ];
    
    for (const { pattern, value } of savePatterns) {
      if (pattern.test(fullText)) {
        save_type = value;
        break;
      }
    }
  }

  // Detect add_modifier - modifier added to damage
  const add_modifier = /\+.*(?:spellcasting ability modifier|spell ability modifier|ability modifier|modifier)/.test(lowerText);

  // Extract dice array and effect type
  let dice = null;
  let effect_type = null;

  // Detect effect type first (damage type, healing, or temp HP)
  const damageTypes = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'];
  
  // Check for healing
  if (/\b(?:heals?|restores?|regains?)\s+(?:\d+d\d+|\d+)?\s*(?:hit points?|hp)\b/i.test(fullText)) {
    effect_type = 'Healing';
  }
  // Check for temporary hit points
  else if (/\btemporary hit points?\b/i.test(fullText)) {
    effect_type = 'Temp HP';
  }
  // Check for damage types
  else {
    for (const damageType of damageTypes) {
      const pattern = new RegExp(`\\b${damageType}\\s+damage\\b`, 'i');
      if (pattern.test(fullText)) {
        effect_type = damageType;
        break;
      }
    }
  }

  // Parse dice array based on spell level
  if (level === 0) {
    // Cantrip - keep existing simple extraction
    const diceMatches = fullText.match(/(\d+d\d+)/gi);
    dice = diceMatches ? [...new Set(diceMatches)] : null;
  } else {
    // Leveled spell - build dice array indexed by spell level
    // Extract base damage dice from description
    const baseDiceMatch = description.match(/(\d+d\d+)/i);
    
    if (baseDiceMatch) {
      const baseDice = baseDiceMatch[1];
      const diceArray = [baseDice]; // Index 0 = base spell level
      
      // Check for scaling in "At Higher Levels"
      if (higher_levels) {
        // Pattern: "increases by XdY for each spell slot level above N"
        const scalingMatch = higher_levels.match(/increases?\s+by\s+(\d+d\d+)\s+for\s+each\s+(?:spell\s+)?slot\s+level\s+above\s+(?:\d+|first|1st|2nd|3rd)/i);
        
        if (scalingMatch) {
          const scalingDice = scalingMatch[1];
          
          // Parse the base dice value (e.g., "8d6" -> 8 dice of d6)
          const [baseCount, baseDie] = baseDice.split('d').map(n => parseInt(n));
          const [scaleCount, scaleDie] = scalingDice.split('d').map(n => parseInt(n));
          
          // Build the array for levels above base (up to 9th level)
          for (let i = 1; i <= (9 - level); i++) {
            const newCount = baseCount + (scaleCount * i);
            diceArray.push(`${newCount}d${baseDie}`);
          }
        } else {
          // Check for absolute value scaling: "When you cast this spell using a spell slot of 3rd level or higher..."
          // Pattern: "slot of Xth level..., the damage is YdZ"
          const absoluteMatches = [...higher_levels.matchAll(/spell\s+slot\s+of\s+(\d+)(?:st|nd|rd|th)\s+level[^,]*,?\s+(?:the\s+)?(?:damage|healing|effect)\s+(?:is|increases?\s+to)\s+(\d+d\d+)/gi)];
          
          if (absoluteMatches.length > 0) {
            absoluteMatches.forEach(match => {
              const slotLevel = parseInt(match[1]);
              const diceValue = match[2];
              const index = slotLevel - level;
              if (index > 0 && index < diceArray.length + 5) {
                // Fill gaps if needed
                while (diceArray.length < index) {
                  diceArray.push(diceArray[diceArray.length - 1]);
                }
                diceArray[index] = diceValue;
              }
            });
          }
        }
      }
      
      dice = diceArray;
    }
  }

  // Extract spell lists - look for class names in the text
  const classNames = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard', 'Artificer'];
  const spell_lists = classNames.filter(className => {
    // Look for standalone class name mentions
    const regex = new RegExp(`\\b${className}(?:'s)?\\b`, 'i');
    return regex.test(text);
  });
  
  // Validate required fields
  if (!title) {
    throw new Error('Failed to extract spell name from page');
  }
  
  if (!description || description.trim() === '') {
    throw new Error(`Cannot parse spell "${title}": missing or invalid description`);
  }
  
  // Ensure level is valid (0-9)
  if (level < 0 || level > 9) {
    throw new Error(`Cannot parse spell "${title}": invalid level ${level} (must be 0-9)`);
  }
  
  // Truncate name if it exceeds column limit
  const truncatedName = title.substring(0, 255);
  if (truncatedName !== title) {
    console.warn(`[parseSpellHtml] Spell name truncated from ${title.length} to 255 chars: "${title}"`);
  }
  
  return {
    name: truncatedName,
    level,
    school: school || null,
    casting_time: casting_time || null,
    range: range || null,
    components: components || null,
    duration: duration || null,
    description: description.trim(),
    higher_levels: higher_levels || null,
    is_attack: is_attack || false,
    is_save: is_save || false,
    save_type: save_type || null,
    add_modifier: add_modifier || false,
    dice: dice || null,
    effect_type: effect_type || null,
    spell_lists: spell_lists.length > 0 ? spell_lists : null
  };
}

/**
 * Parse magic item data from wikidot HTML
 */
export function parseItemHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Extract item name from title
  const pageTitle = doc.querySelector('.page-title') || doc.querySelector('h1');
  const title = pageTitle?.textContent?.trim() || 
                doc.title.replace(' - D&D 2024', '').replace(' - ', '').trim();
  
  // Extract stats from the page
  const pageContent = doc.querySelector('#page-content') || doc.body;
  if (!pageContent) throw new Error('Could not find page content');
  
  const text = pageContent.textContent;
  
  // Parse type
  const typeMatch = text.match(/(?:^|\n)(Weapon|Armor|Potion|Ring|Rod|Staff|Wand|Wondrous item)(?:\s*\(([^)]+)\))?/i);
  const type = typeMatch ? (typeMatch[2] ? `${typeMatch[1]} (${typeMatch[2]})` : typeMatch[1]) : '';
  
  // Parse rarity
  const rarityMatch = text.match(/(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)/i);
  const rarity = rarityMatch ? rarityMatch[1] : '';
  
  // Parse attunement
  let requires_attunement = null;
  if (text.match(/requires attunement by ([^.\n]+)/i)) {
    const attMatch = text.match(/requires attunement by ([^.\n]+)/i);
    requires_attunement = attMatch ? attMatch[1].trim() : null;
  } else if (text.match(/requires attunement/i)) {
    requires_attunement = 'Yes';
  }
  
  // Get description - find text after rarity/attunement line
  let description = '';
  const descStart = text.indexOf(rarity) + rarity.length;
  if (descStart > 0) {
    let descText = text.slice(descStart);
    if (descText.match(/requires attunement/i)) {
      const attIndex = descText.search(/requires attunement[^\n]*/i);
      const attMatch = descText.match(/requires attunement[^\n]*/i);
      descText = descText.slice(attIndex + attMatch[0].length);
    }
    description = descText.trim();
  }
  
  return {
    name: title,
    type: type || null,
    rarity: rarity || null,
    requires_attunement,
    description,
    benefits: null // Can be added manually later
  };
}

/**
 * Parse feat data from wikidot HTML
 */
export function parseFeatHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Extract feat name from title
  const pageTitle = doc.querySelector('.page-title') || doc.querySelector('h1');
  const title = pageTitle?.textContent?.trim() || 
                doc.title.replace(' - D&D 2024', '').replace(' - ', '').trim();
  
  // Extract stats from the page
  const pageContent = doc.querySelector('#page-content') || doc.body;
  if (!pageContent) throw new Error('Could not find page content');
  
  const text = pageContent.textContent;
  
  // Parse prerequisites (may not always be present)
  const prereqMatch = text.match(/Prerequisite[s]?:\s*([^\n]+)/i);
  const prerequisites = prereqMatch ? prereqMatch[1].trim() : null;
  
  // Get description/benefits - everything after prerequisites (or from start if no prereqs)
  let description = text;
  if (prerequisites) {
    const prereqIndex = text.indexOf(prereqMatch[0]);
    description = text.slice(prereqIndex + prereqMatch[0].length).trim();
  }

  const emphasizedSpellNames = extractEmphasizedSpellNames(doc);
  const benefits = buildFeatBenefits(description, emphasizedSpellNames);

  return {
    name: title,
    prerequisites,
    description,
    benefits
  };
}

function buildFeatBenefits(description, emphasizedSpellNames = []) {
  if (!description) return null;

  const normalized = description.replace(/\r/g, '').trim();
  const benefits = {
    effects: normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  };

  const asi = parseAbilityScoreIncrease(normalized);
  if (asi) {
    benefits.abilityScoreIncrease = asi;
  }

  const profs = parseProficiencies(normalized);
  if (profs) {
    benefits.proficiencies = profs;
  }

  const spells = parseSpellGrants(normalized, emphasizedSpellNames);
  if (spells) {
    benefits.spells = spells;
  }

  const bonuses = parseBonuses(normalized);
  if (bonuses) {
    benefits.bonuses = bonuses;
  }

  const fightingStyles = parseFightingStyles(normalized);
  if (fightingStyles) {
    benefits.fightingStyles = fightingStyles;
  }

  const expertise = parseExpertise(normalized);
  if (expertise) {
    benefits.expertise = expertise;
  }

  const advantages = parseAdvantages(normalized);
  if (advantages) {
    benefits.advantages = advantages;
  }

  const resistances = parseResistances(normalized);
  if (resistances) {
    benefits.resistances = resistances;
  }

  const senses = parseSenses(normalized);
  if (senses) {
    benefits.senses = senses;
  }

  const movement = parseMovement(normalized);
  if (movement) {
    benefits.movement = movement;
  }

  const weaponMastery = parseWeaponMastery(normalized);
  if (weaponMastery) {
    benefits.weaponMastery = weaponMastery;
  }

  const resources = parseResources(normalized);
  if (resources) {
    benefits.resources = resources;
  }

  return Object.keys(benefits).length > 0 ? benefits : null;
}

function parseAbilityScoreIncrease(text) {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

  const fixedMatch = text.match(/increase your ([A-Za-z ,or]+?) score by (\d)/i);
  if (fixedMatch) {
    const list = normalizeAbilityList(fixedMatch[1], abilities);
    const amount = parseInt(fixedMatch[2], 10);
    if (list.length === 1) {
      return { fixed: list[0], amount };
    }
    if (list.length > 1) {
      return { choice: list, amount };
    }
  }

  const choiceMatch = text.match(/increase one ability score of your choice by (\d)/i);
  if (choiceMatch) {
    return { choice: abilities, amount: parseInt(choiceMatch[1], 10) };
  }

  return null;
}

function normalizeAbilityList(raw, abilities) {
  const cleaned = raw
    .replace(/score/gi, '')
    .replace(/\band\b/gi, ',')
    .replace(/\bor\b/gi, ',')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  return cleaned.filter((item) => abilities.includes(item));
}

function parseProficiencies(text) {
  const profMatch = text.match(/gain proficiency (?:with|in) ([^.\n]+)/i);
  if (!profMatch) return null;

  const payload = profMatch[1].trim();
  const profs = {};

  if (/skill/i.test(payload)) {
    profs.skills = extractList(payload, ['skill', 'skills']);
  } else if (/tool/i.test(payload)) {
    profs.tools = extractList(payload, ['tool', 'tools']);
  } else if (/weapon/i.test(payload)) {
    profs.weapons = extractList(payload, ['weapon', 'weapons']);
  } else if (/armor/i.test(payload)) {
    profs.armor = extractList(payload, ['armor']);
  } else if (/language/i.test(payload)) {
    profs.languages = extractList(payload, ['language', 'languages']);
  } else {
    profs.other = [payload];
  }

  return profs;
}

function extractList(payload, keywords) {
  let cleaned = payload.toLowerCase();
  keywords.forEach((word) => {
    cleaned = cleaned.replace(word, '');
  });

  return cleaned
    .replace(/\bof your choice\b/gi, '')
    .replace(/\band\b/gi, ',')
    .replace(/\bor\b/gi, ',')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSpellGrants(text, emphasizedSpellNames = []) {
  const grants = [];
  const seen = new Set();

  emphasizedSpellNames.forEach((name) => {
    if (isLikelySpellName(name) && !seen.has(name)) {
      grants.push({ name });
      seen.add(name);
    }
  });

  const learnMatches = text.match(/learn the ([A-Z][A-Za-z' -]+?) spell/gi);
  if (learnMatches) {
    learnMatches.forEach((match) => {
      const name = match.replace(/learn the/i, '').replace(/spell/i, '').trim();
      if (isLikelySpellName(name) && !seen.has(name)) {
        grants.push({ name });
        seen.add(name);
      }
    });
  }

  const castMatches = text.match(/cast ([A-Z][A-Za-z' -]+?) spell/gi);
  if (castMatches) {
    castMatches.forEach((match) => {
      const name = match.replace(/cast/i, '').replace(/spell/i, '').trim();
      if (isLikelySpellName(name) && !seen.has(name)) {
        grants.push({ name });
        seen.add(name);
      }
    });
  }

  const choiceMatch = text.match(/choose (\w+) level (\d+) spell from the ([A-Za-z\s]+?) school/i);
  if (choiceMatch) {
    const count = parseInt(choiceMatch[1], 10) || 1;
    const level = parseInt(choiceMatch[2], 10);
    const schools = choiceMatch[3]
      .split(/or|,/i)
      .map((school) => school.trim().toLowerCase())
      .filter(Boolean);

    grants.push({
      choice: {
        count,
        level,
        schools
      }
    });
  }

  if (grants.length === 0) return null;
  return { grants };
}

function extractEmphasizedSpellNames(doc) {
  const linkNodes = doc.querySelectorAll('#page-content a[href]');
  const names = [];

  linkNodes.forEach((node) => {
    const href = node.getAttribute('href') || '';
    if (!/\/(spell:|spell\/)/i.test(href)) return;
    const text = node.textContent?.trim();
    if (isLikelySpellName(text)) {
      names.push(text);
    }
  });

  return names;
}

function isLikelySpellName(name) {
  if (!name) return false;
  const cleaned = name.trim();
  if (cleaned.length < 3) return false;
  const blacklist = new Set([
    'Ability Score Increase',
    'Fey Magic',
    'Each',
    'Either',
    'That',
    'These'
  ]);
  if (blacklist.has(cleaned)) return false;
  if (!/[A-Z]/.test(cleaned)) return false;
  return /^[A-Za-z' -]+$/.test(cleaned);
}

function parseBonuses(text) {
  const bonuses = {};

  const hpPerLevelMatch = text.match(/hit point maximum (?:increases|increase) by (\d+) for each level/i);
  const hpAgainMatch = text.match(/hit point maximum (?:increases|increase) by (\d+)[^.\n]*again whenever you gain a level/i);
  if (hpPerLevelMatch) {
    bonuses.hp = { perLevel: parseInt(hpPerLevelMatch[1], 10) };
  } else if (hpAgainMatch) {
    const amount = parseInt(hpAgainMatch[1], 10);
    bonuses.hp = { base: amount, perLevel: amount };
  } else {
    const hpMatch = text.match(/hit point maximum (?:increases|increase) by (\d+)/i);
    if (hpMatch) {
      bonuses.hp = parseInt(hpMatch[1], 10);
    }
  }

  const speedMatch = text.match(/speed (?:increases|increase) by (\d+)/i);
  if (speedMatch) {
    bonuses.speed = parseInt(speedMatch[1], 10);
  }

  const acMatch = text.match(/\+?(\d+) bonus to AC|AC increases by (\d+)/i);
  if (acMatch) {
    const value = acMatch[1] || acMatch[2];
    bonuses.ac = parseInt(value, 10);
  }

  const attackMatch = text.match(/\+?(\d+) bonus to (?:attack|attack rolls)/i);
  if (attackMatch) {
    bonuses.attack = parseInt(attackMatch[1], 10);
  }

  const damageMatch = text.match(/\+?(\d+) bonus to (?:damage|damage rolls)/i);
  if (damageMatch) {
    bonuses.damage = parseInt(damageMatch[1], 10);
  }

  const initMatch = text.match(/bonus to initiative (?:rolls )?equal to (\d+)/i);
  if (initMatch) {
    bonuses.initiative = parseInt(initMatch[1], 10);
  }

  return Object.keys(bonuses).length > 0 ? bonuses : null;
}

function parseExpertise(text) {
  const match = text.match(/expertise in ([^.\n]+)/i);
  if (!match) return null;

  const list = extractList(match[1], ['skill', 'skills']);
  if (list.length === 0) return { other: [match[1].trim()] };
  return { skills: list };
}

function parseAdvantages(text) {
  const matches = text.match(/advantage on [^.\n]+/gi);
  if (!matches) return null;

  const advantages = { other: [] };
  matches.forEach((match) => {
    const clause = match.replace(/advantage on/i, '').trim();
    if (/saving throw/i.test(clause)) {
      advantages.saves = advantages.saves || [];
      advantages.saves.push(clause);
    } else if (/check/i.test(clause)) {
      advantages.checks = advantages.checks || [];
      advantages.checks.push(clause);
    } else if (/condition|charmed|frightened|poisoned|paralyzed|stunned/i.test(clause)) {
      advantages.conditions = advantages.conditions || [];
      advantages.conditions.push(clause);
    } else {
      advantages.other.push(clause);
    }
  });

  return advantages;
}

function parseResistances(text) {
  const matches = text.match(/resistance to ([a-z\s]+?) damage/gi);
  if (!matches) return null;

  const damageTypes = matches.map((match) =>
    match
      .replace(/resistance to/i, '')
      .replace(/damage/i, '')
      .trim()
  );

  return { damageTypes };
}

function parseSenses(text) {
  const senses = {};
  const sensePatterns = [
    { key: 'darkvision', regex: /darkvision (?:out to|of)?\s*(\d+)/i },
    { key: 'blindsight', regex: /blindsight (?:out to|of)?\s*(\d+)/i },
    { key: 'tremorsense', regex: /tremorsense (?:out to|of)?\s*(\d+)/i },
    { key: 'truesight', regex: /truesight (?:out to|of)?\s*(\d+)/i }
  ];

  sensePatterns.forEach(({ key, regex }) => {
    const match = text.match(regex);
    if (match) {
      senses[key] = parseInt(match[1], 10);
    }
  });

  return Object.keys(senses).length > 0 ? senses : null;
}

function parseMovement(text) {
  const movement = {};
  const climbMatch = text.match(/climbing speed (?:of|equal to)?\s*(\d+)?/i);
  if (climbMatch) {
    movement.climb = climbMatch[1] ? parseInt(climbMatch[1], 10) : 'equal to walking speed';
  }

  const swimMatch = text.match(/swimming speed (?:of|equal to)?\s*(\d+)?/i);
  if (swimMatch) {
    movement.swim = swimMatch[1] ? parseInt(swimMatch[1], 10) : 'equal to walking speed';
  }

  const flyMatch = text.match(/flying speed (?:of|equal to)?\s*(\d+)?/i);
  if (flyMatch) {
    movement.fly = flyMatch[1] ? parseInt(flyMatch[1], 10) : 'equal to walking speed';
  }

  return Object.keys(movement).length > 0 ? movement : null;
}

function parseWeaponMastery(text) {
  if (!/weapon mastery/i.test(text)) return null;
  if (/choose (\w+) weapon mastery/i.test(text)) {
    const choiceMatch = text.match(/choose (\w+) weapon mastery/i);
    return { choice: parseInt(choiceMatch[1], 10) };
  }
  return { choice: 1 };
}

function parseResources(text) {
  const resources = [];
  const usesMatch = text.match(/number of times equal to ([^.\n]+)/i);
  if (usesMatch) {
    resources.push({ name: 'feat', uses: usesMatch[1].trim() });
  }

  const rechargeMatch = text.match(/regain all expended uses when you finish a ([^.\n]+)/i);
  if (rechargeMatch) {
    resources.push({ name: 'feat', recharge: rechargeMatch[1].trim() });
  }

  return resources.length > 0 ? resources : null;
}

function parseFightingStyles(text) {
  if (!/fighting style/i.test(text)) return null;

  if (/fighting style of your choice/i.test(text)) {
    return { choice: true };
  }

  const listMatch = text.match(/following fighting styles?: ([^.\n]+)/i);
  if (listMatch) {
    const options = extractList(listMatch[1], ['fighting', 'style', 'styles']);
    return options.length > 0 ? { options } : { choice: true };
  }

  return { choice: true };
}
/**
 * Parse spell list page (e.g., https://dnd5e.wikidot.com/spells:bard/)
 * Extracts spell names and links from a class/category spell list
 * Returns array of { name, url } objects
 */
export function parseSpellListHtml(html, baseDomain = 'https://dnd5e.wikidot.com') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const spells = [];
  const pageContent = doc.querySelector('#page-content') || doc.body;
  if (!pageContent) return spells;

  // Look for spell links - they're typically in lists or tables
  // Pattern 1: Direct links like <a href="/spell:fireball">Fireball</a>
  const spellLinks = pageContent.querySelectorAll('a[href*="/spell:"]');
  
  spellLinks.forEach(link => {
    const name = link.textContent?.trim();
    const href = link.getAttribute('href');
    
    if (name && href && !name.match(/^(Spell|spells|See|view)/i)) {
      // Avoid duplicates
      if (!spells.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        // Build full URL from baseDomain if href is relative
        let fullUrl = href;
        if (!href.startsWith('http')) {
          fullUrl = `${baseDomain}${href}`;
        }
        
        spells.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          url: fullUrl
        });
      }
    }
  });

  return spells;
}