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

export const collectBonuses = ({ items = [], features = [], overrides = [] } = {}) => {
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

      if (Array.isArray(entry.bonuses)) {
        entry.bonuses.forEach((bonus) => pushBonus(bonus, source));
      } else if (entry.bonus) {
        pushBonus(entry.bonus, source);
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
