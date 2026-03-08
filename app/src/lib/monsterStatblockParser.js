const ABILITY_ORDER = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

const normalizeWhitespace = (value) => String(value || '').replace(/\r/g, '').trim();

const toTextArray = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseSignedPairs = (value) => {
  const result = {};
  const parts = toTextArray(value);
  parts.forEach((entry) => {
    const match = entry.match(/^([A-Za-z ]+)\s*([+-]\d+)$/);
    if (!match) return;
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
    result[key] = Number.parseInt(match[2], 10);
  });
  return result;
};

const parseSpeed = (value) => {
  const speed = {};
  const parts = toTextArray(value);
  parts.forEach((entry) => {
    const match = entry.match(/^(?:(walk|walking|fly|flying|swim|swimming|climb|climbing|burrow|burrowing)\s+)?(\d+)\s*ft\.?$/i);
    if (!match) return;
    const type = (match[1] || 'walk').toLowerCase();
    const normalizedType = {
      walking: 'walk',
      fly: 'fly',
      flying: 'fly',
      swim: 'swim',
      swimming: 'swim',
      climb: 'climb',
      climbing: 'climb',
      burrow: 'burrow',
      burrowing: 'burrow',
      walk: 'walk'
    }[type] || type;
    speed[normalizedType] = Number.parseInt(match[2], 10);
  });
  return speed;
};

const parseChallenge = (value) => {
  if (!value) return { challenge_rating: null, experience_points: null };
  const match = value.match(/^([^\s]+)\s*\(([^)]+)\s*XP\)$/i);
  if (!match) {
    return { challenge_rating: value.trim(), experience_points: null };
  }

  const xp = Number.parseInt(match[2].replace(/,/g, ''), 10);
  return {
    challenge_rating: match[1].trim(),
    experience_points: Number.isFinite(xp) ? xp : null
  };
};

const parseArmorClass = (value) => {
  const match = String(value || '').match(/^(\d+)(?:\s*\(([^)]+)\))?/);
  return {
    armor_class_value: match ? Number.parseInt(match[1], 10) : null,
    armor_class_notes: match?.[2]?.trim() || null
  };
};

const parseHitPoints = (value) => {
  const match = String(value || '').match(/^(\d+)(?:\s*\(([^)]+)\))?/);
  return {
    hit_points_value: match ? Number.parseInt(match[1], 10) : null,
    hit_points_formula: match?.[2]?.trim() || null
  };
};

const parseAbilityScores = (text) => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const scoreLine = lines.find((line) => line.includes('|') && /\d+\s*\([+-]\d+\)/.test(line));
  if (!scoreLine) return {};

  const cells = scoreLine
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);

  const values = cells
    .map((cell) => {
      const match = cell.match(/^(\d+)/);
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .filter((value) => Number.isFinite(value));

  const result = {};
  ABILITY_ORDER.forEach((ability, index) => {
    result[ability] = Number.isFinite(values[index]) ? values[index] : null;
  });

  return result;
};

const parseFeatureEntries = (text) => {
  if (!text) return [];

  const normalized = text
    .replace(/^\s*:\s*$/gm, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return [];

  const entries = [];
  const regex = /\*\*\*([^*]+)\.\*\*\*\s*([\s\S]*?)(?=(?:\n\*\*\*[^*]+\.\*\*\*)|$)/g;
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    entries.push({
      name: match[1].trim(),
      text: match[2].trim()
    });
  }

  return entries;
};

const splitSections = (text) => {
  const sectionRegex = /\n###\s+([^\n]+)\n/g;
  const sections = [];
  let lastIndex = 0;
  let currentTitle = 'base';
  let match;

  while ((match = sectionRegex.exec(text)) !== null) {
    const body = text.slice(lastIndex, match.index);
    sections.push({ title: currentTitle, body });
    currentTitle = match[1].trim().toLowerCase();
    lastIndex = sectionRegex.lastIndex;
  }

  sections.push({ title: currentTitle, body: text.slice(lastIndex) });
  return sections;
};

export function parseMonsterStatblock(rawInput) {
  const source_text = normalizeWhitespace(rawInput);
  if (!source_text) {
    throw new Error('Stat block is empty');
  }

  const cleaned = source_text
    .replace(/^\{\{monster,frame\s*/i, '')
    .replace(/\}\}\s*$/i, '')
    .trim();

  const sections = splitSections(cleaned);
  const baseSection = sections.find((section) => section.title === 'base')?.body || '';

  const lines = baseSection.split('\n').map((line) => line.trim());
  const nameLine = lines.find((line) => line.startsWith('## '));
  const subtitleLine = lines.find((line) => /^\*[^*]+\*$/.test(line));

  if (!nameLine) {
    throw new Error('Could not parse monster name (expected "## Name")');
  }

  const name = nameLine.replace(/^##\s+/, '').trim();

  let size = null;
  let creature_type = null;
  let alignment = null;
  if (subtitleLine) {
    const subtitle = subtitleLine.replace(/^\*/, '').replace(/\*$/, '').trim();
    const parts = subtitle.split(',').map((part) => part.trim());
    const sizeType = parts[0] || '';
    const sizeTypeParts = sizeType.split(/\s+/);
    size = sizeTypeParts.shift() || null;
    creature_type = sizeTypeParts.join(' ') || null;
    alignment = parts.slice(1).join(', ') || null;
  }

  const pairRegex = /^\*\*([^*]+)\*\*\s*::\s*(.+)$/;
  const pairs = {};
  lines.forEach((line) => {
    const match = line.match(pairRegex);
    if (!match) return;
    pairs[match[1].trim().toLowerCase()] = match[2].trim();
  });

  const abilityScores = parseAbilityScores(baseSection);
  const armorClass = parseArmorClass(pairs['armor class']);
  const hitPoints = parseHitPoints(pairs['hit points']);
  const challenge = parseChallenge(pairs.challenge);

  const sensesValue = pairs.senses || '';
  const passiveMatch = sensesValue.match(/passive\s+perception\s+(\d+)/i);
  const passivePerception = passiveMatch ? Number.parseInt(passiveMatch[1], 10) : null;

  const traits = parseFeatureEntries(baseSection);
  const actionsSection = sections.find((section) => section.title === 'actions')?.body || '';
  const bonusActionsSection = sections.find((section) => section.title === 'bonus actions')?.body || '';
  const reactionsSection = sections.find((section) => section.title === 'reactions')?.body || '';
  const legendarySection = sections.find((section) => section.title === 'legendary actions')?.body || '';

  const legendaryIntro = legendarySection
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith('***')) || null;

  return {
    name,
    size,
    creature_type,
    alignment,
    ...armorClass,
    ...hitPoints,
    speed: parseSpeed(pairs.speed),
    ...abilityScores,
    saving_throws: parseSignedPairs(pairs['saving throws']),
    skills: parseSignedPairs(pairs.skills),
    damage_immunities: toTextArray(pairs['damage immunities']),
    damage_resistances: toTextArray(pairs['damage resistances']),
    damage_vulnerabilities: toTextArray(pairs['damage vulnerabilities']),
    condition_immunities: toTextArray(pairs['condition immunities']),
    senses: {
      text: sensesValue,
      parsed: toTextArray(sensesValue.replace(/passive\s+perception\s+\d+/i, '').replace(/,,+/g, ',').replace(/^\s*,|,\s*$/g, ''))
    },
    passive_perception: passivePerception,
    languages: toTextArray(pairs.languages),
    ...challenge,
    traits,
    actions: parseFeatureEntries(actionsSection),
    bonus_actions: parseFeatureEntries(bonusActionsSection),
    reactions: parseFeatureEntries(reactionsSection),
    legendary_actions_intro: legendaryIntro,
    legendary_actions: parseFeatureEntries(legendarySection),
    source_text
  };
}
