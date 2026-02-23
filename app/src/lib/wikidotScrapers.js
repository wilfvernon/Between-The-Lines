/**
 * Shared scraper functions for parsing wikidot HTML
 */

/**
 * Parse spell data from wikidot HTML
 */
export function parseSpellHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Extract spell name from title
  const pageTitle = doc.querySelector('.page-title') || doc.querySelector('h1');
  const title = pageTitle?.textContent?.trim() || 
                doc.title.replace(' - D&D 2024', '').replace(' - ', '').trim();
  
  // Extract stats from the page
  const pageContent = doc.querySelector('#page-content') || doc.body;
  if (!pageContent) throw new Error('Could not find page content');
  
  const text = pageContent.textContent;
  
  // Parse level (e.g., "1st-level", "Level 1", or "Cantrip")
  const levelMatch = text.match(/(?:^|\n)\s*(Cantrip|\d+)(?:st|nd|rd|th)?(?:-?level)?/i) ||
    text.match(/\bLevel\s*(\d+)\b/i);
  const levelText = levelMatch ? (levelMatch[1] || levelMatch[0]) : null;
  const level = levelText && /cantrip/i.test(levelText)
    ? 0
    : levelText
      ? parseInt(levelText.match(/\d+/)?.[0] || '0', 10)
      : 0;
  
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
    higher_levels: higher_levels || null
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
    properties: null // Can be added manually later
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
