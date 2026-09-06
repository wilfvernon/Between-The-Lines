const ABILITY_ORDER = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

const normalizeWhitespace = (value) => String(value || '').replace(/\r/g, '').trim();

const toTextArray = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeDefenseLabel = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';

  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/^[a-z]/, (char) => char.toUpperCase()))
    .join(' ');
};

const normalizeDefenseList = (values = []) =>
  (Array.isArray(values) ? values : [])
    .map((entry) => normalizeDefenseLabel(entry))
    .filter(Boolean);

const normalizeConditionLabel = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

const normalizeAbilityOrSkillKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const aliases = {
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
    charisma: 'charisma'
  };

  const normalized = raw.replace(/[^a-z\s]/g, '').replace(/\s+/g, '_');
  return aliases[normalized] || normalized;
};

const parseSignedPairs = (value) => {
  // Bare marker: "Saving Throws :: proficiency" -> add character PB to all such rolls
  if (/^\s*(proficiency|proficient|\+?PB)\s*$/i.test(String(value || ''))) {
    return { proficiency: true };
  }

  const result = {};
  const parts = toTextArray(value);
  parts.forEach((entry) => {
    const match = entry.match(/^([A-Za-z ]+?)\s*([+-]\d+)(\s+plus\s+PB)?(?:\s*\(([^)]+)\))?$/i);
    if (!match) return;

    const key = normalizeAbilityOrSkillKey(match[1]);
    const numericValue = Number.parseInt(match[2], 10);
    const note = match[4]?.trim().toLowerCase() || '';
    const proficiency = Boolean(match[3]) || /proficient|proficiency/i.test(note);

    result[key] = proficiency ? { value: numericValue, proficiency: true } : numericValue;
  });
  return result;
};

const parseSpeed = (value) => {
  const speed = {};
  const forms = [];
  const speedRegex = /(?:(walk|walking|fly|flying|swim|swimming|climb|climbing|burrow|burrowing)\s+)?(\d+)\s*ft\.?\s*(?:\(([^)]+)\))?/gi;
  let match;
  while ((match = speedRegex.exec(String(value || ''))) !== null) {
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
    const parenthetical = match[3]?.trim();
    const conditionMatch = parenthetical?.match(/([^;,]+?)\s+only\b/i);
    if (conditionMatch) {
      forms.push({
        name: conditionMatch[1].trim(),
        speed: {
          [normalizedType]: Number.parseInt(match[2], 10)
        },
        speed_notes: parenthetical.replace(conditionMatch[0], '').replace(/^[;,\s]+|[;,\s]+$/g, '').trim() || null
      });
    } else {
      speed[normalizedType] = Number.parseInt(match[2], 10);
    }
  }

  return { speed, forms };
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
  const rawValue = String(value || '').trim();
  const match = rawValue.match(/^(\d+)(?:\s*\(([^)]+)\))?/);
  const formulaMatch = rawValue.match(/^\$\{([^}]+)\}(?:\s*\(([^)]+)\))?/);
  return {
    armor_class_value: match ? Number.parseInt(match[1], 10) : formulaMatch ? `\${${formulaMatch[1]}}` : rawValue || null,
    armor_class_notes: match?.[2]?.trim() || formulaMatch?.[2]?.trim() || null
  };
};

const parseHitPoints = (value) => {
  const rawValue = String(value || '').trim();
  const match = rawValue.match(/^(\d+)(?:\s*\(([^)]+)\))?/);
  const formulaMatch = rawValue.match(/^\$\{([^}]+)\}(?:\s*\(([^)]+)\))?/);
  return {
    hit_points_value: match ? Number.parseInt(match[1], 10) : formulaMatch ? `\${${formulaMatch[1]}}` : rawValue || null,
    hit_points_formula: match?.[2]?.trim() || formulaMatch?.[2]?.trim() || null
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
    .replace(/^___\s*$/gm, '')
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

const splitConditionalEntries = (entries) => {
  const base = [];
  const forms = [];

  entries.forEach((entry) => {
    const match = entry.name.match(/\s*\(([^)]+?)\s+only\)\s*$/i);
    if (!match) {
      base.push(entry);
      return;
    }

    forms.push({
      name: match[1].trim(),
      entry: {
        ...entry,
        name: entry.name.replace(match[0], '').trim()
      }
    });
  });

  return { base, forms };
};

const splitConditionalValues = (values = []) => {
  const base = [];
  const forms = [];

  values.forEach((value) => {
    const match = value.match(/\s*\(([^)]+?)\s+only\)\s*$/i);
    if (!match) {
      base.push(value);
      return;
    }

    forms.push({
      name: match[1].trim(),
      entry: value.replace(match[0], '').trim()
    });
  });

  return { base, forms };
};

const normalizeConditionalDefenseValues = ({ base = [], forms = [] }) => ({
  base: (base || []).map((entry) => normalizeConditionLabel(entry)).filter(Boolean),
  forms: forms.map(({ name, entry }) => ({
    name,
    entry: normalizeConditionLabel(entry)
  })).filter((item) => item.name && item.entry)
});

const DEFENSE_FIELDS = ['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities'];

const buildForms = ({ speedForms = [], traits = [], actions = [], bonusActions = [], reactions = [], defenses = {} }) => {
  const formsByName = new Map();
  const getForm = (name) => {
    const key = name.toLowerCase();
    if (!formsByName.has(key)) {
      const baseForm = {
        name,
        speed: {},
        speed_notes: {},
        traits: [],
        actions: [],
        bonus_actions: [],
        reactions: [],
        ...DEFENSE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: [] }), {})
      };
      baseForm.resistances = baseForm.damage_resistances;
      baseForm.immunities = baseForm.damage_immunities;
      baseForm.vulnerabilities = baseForm.damage_vulnerabilities;
      baseForm.condition_immunities = baseForm.condition_immunities;
      formsByName.set(key, baseForm);
    }
    return formsByName.get(key);
  };

  speedForms.forEach((form) => {
    const target = getForm(form.name);
    Object.assign(target.speed, form.speed);
    if (form.speed_notes) {
      Object.keys(form.speed).forEach((type) => {
        target.speed_notes[type] = form.speed_notes;
      });
    }
  });

  [
    ['traits', traits],
    ['actions', actions],
    ['bonus_actions', bonusActions],
    ['reactions', reactions]
  ].forEach(([field, entries]) => {
    entries.forEach(({ name, entry }) => {
      getForm(name)[field].push(entry);
    });
  });

  DEFENSE_FIELDS.forEach((field) => {
    (defenses[field] || []).forEach(({ name, entry }) => {
      const form = getForm(name);
      form[field].push(entry);
      if (field === 'damage_resistances') form.resistances = form.damage_resistances;
      if (field === 'damage_immunities') form.immunities = form.damage_immunities;
      if (field === 'damage_vulnerabilities') form.vulnerabilities = form.damage_vulnerabilities;
    });
  });

  return Array.from(formsByName.values()).map((form) => ({
    ...form,
    resistances: form.damage_resistances,
    immunities: form.damage_immunities,
    vulnerabilities: form.damage_vulnerabilities,
    condition_immunities: form.condition_immunities
  }));
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

  const parsedSpeed = parseSpeed(pairs.speed);
  const damageImmunities = normalizeConditionalDefenseValues(splitConditionalValues(toTextArray(pairs['damage immunities'])));
  const damageResistances = normalizeConditionalDefenseValues(splitConditionalValues(toTextArray(pairs['damage resistances'])));
  const damageVulnerabilities = normalizeConditionalDefenseValues(splitConditionalValues(toTextArray(pairs['damage vulnerabilities'])));
  const conditionImmunities = normalizeConditionalDefenseValues(splitConditionalValues(toTextArray(pairs['condition immunities'])));
  const traitsSection = sections.find((section) => section.title === 'traits')?.body || '';
  const traits = splitConditionalEntries(parseFeatureEntries(traitsSection));
  const actionsSection = sections.find((section) => section.title === 'actions')?.body || '';
  const bonusActionsSection = sections.find((section) => section.title === 'bonus actions')?.body || '';
  const reactionsSection = sections.find((section) => section.title === 'reactions')?.body || '';
  const legendarySection = sections.find((section) => section.title === 'legendary actions')?.body || '';
  const actions = splitConditionalEntries(parseFeatureEntries(actionsSection));
  const bonusActions = splitConditionalEntries(parseFeatureEntries(bonusActionsSection));
  const reactions = splitConditionalEntries(parseFeatureEntries(reactionsSection));

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
    speed: parsedSpeed.speed,
    ...abilityScores,
    saving_throws: parseSignedPairs(pairs['saving throws']),
    skills: parseSignedPairs(pairs.skills),
    damage_immunities: damageImmunities.base,
    damage_resistances: damageResistances.base,
    damage_vulnerabilities: damageVulnerabilities.base,
    condition_immunities: conditionImmunities.base,
    senses: {
      text: sensesValue,
      parsed: toTextArray(sensesValue.replace(/passive\s+perception\s+\d+/i, '').replace(/,,+/g, ',').replace(/^\s*,|,\s*$/g, ''))
    },
    passive_perception: passivePerception,
    languages: toTextArray(pairs.languages),
    ...challenge,
    traits: traits.base,
    actions: actions.base,
    bonus_actions: bonusActions.base,
    reactions: reactions.base,
    forms: buildForms({
      speedForms: parsedSpeed.forms,
      traits: traits.forms,
      actions: actions.forms,
      bonusActions: bonusActions.forms,
      reactions: reactions.forms,
      defenses: {
        damage_resistances: damageResistances.forms,
        damage_immunities: damageImmunities.forms,
        damage_vulnerabilities: damageVulnerabilities.forms,
        condition_immunities: conditionImmunities.forms
      }
    }),
    legendary_actions_intro: legendaryIntro,
    legendary_actions: parseFeatureEntries(legendarySection),
    source_text
  };
}
