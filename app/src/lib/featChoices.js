const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

const ABILITY_LABEL_TO_KEY = {
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

const ABILITY_KEY_TO_ABBREV = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA'
};

function normalizeKey(value) {
  if (!value || typeof value !== 'string') return null;
  return ABILITY_LABEL_TO_KEY[value.trim().toLowerCase()] || null;
}

function normalizeChoicesInput(rawChoices) {
  if (!rawChoices) return null;
  if (typeof rawChoices === 'string') {
    try {
      const parsed = JSON.parse(rawChoices);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof rawChoices === 'object') return rawChoices;
  return null;
}

export function getJoinedFeat(featEntry) {
  if (!featEntry || typeof featEntry !== 'object') return null;
  if (featEntry.feat && typeof featEntry.feat === 'object') return featEntry.feat;
  if (featEntry.feats && typeof featEntry.feats === 'object') return featEntry.feats;
  return null;
}

export function normalizeFeatChoices(featEntry) {
  const joinedFeat = getJoinedFeat(featEntry) || {};
  const choices = normalizeChoicesInput(featEntry?.choices);
  const benefits = joinedFeat?.benefits && typeof joinedFeat.benefits === 'object' ? joinedFeat.benefits : {};

  const asiAmount = Number.isFinite(Number(choices?.asi?.amount))
    ? Number(choices.asi.amount)
    : Number.isFinite(Number(benefits?.abilityScoreIncrease?.amount))
      ? Number(benefits.abilityScoreIncrease.amount)
      : 1;

  const directAbility = normalizeKey(choices?.asi?.ability) || normalizeKey(choices?.abilityChoice);
  const selectedAbility = directAbility || (Array.isArray(choices?.selections)
    ? choices.selections
      .map((selection) => normalizeKey(selection?.optionName))
      .find(Boolean)
    : null);

  const staticSpells = Array.isArray(benefits?.spells?.grants)
    ? benefits.spells.grants
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.name === 'string')
        .map((entry) => ({
          name: entry.name,
          uses: Number.isFinite(Number(entry.uses)) ? Number(entry.uses) : undefined
        }))
    : [];

  const newShapeSpells = Array.isArray(choices?.grantedSpells)
    ? choices.grantedSpells.map((entry) => {
        if (typeof entry === 'string') return { name: entry, uses: undefined };
        if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') return null;
        return {
          name: entry.name,
          uses: Number.isFinite(Number(entry.uses)) ? Number(entry.uses) : undefined
        };
      }).filter(Boolean)
    : [];

  const oldShapeSpells = Array.isArray(choices?.spellsChosen)
    ? choices.spellsChosen
        .filter((name) => typeof name === 'string' && name.trim())
        .map((name) => ({ name, uses: undefined }))
    : [];

  const labelSpells = Array.isArray(choices?.selections)
    ? choices.selections
        .filter((selection) => typeof selection?.optionName === 'string')
        .filter((selection) => String(selection?.label || '').toLowerCase().includes('spell'))
        .map((selection) => ({ name: selection.optionName, uses: undefined }))
    : [];

  const grantedSpells = [...staticSpells, ...newShapeSpells, ...oldShapeSpells, ...labelSpells]
    .reduce((acc, spell) => {
      const key = spell.name.trim().toLowerCase();
      if (!key) return acc;
      if (!acc.some((existing) => existing.name.trim().toLowerCase() === key)) {
        acc.push(spell);
      }
      return acc;
    }, []);

  return {
    asi: selectedAbility ? { ability: selectedAbility, amount: asiAmount } : null,
    grantedSpells
  };
}

export function extractFeatAbilityScoreImprovements(feats = []) {
  return feats
    .map((featEntry) => {
      const joinedFeat = getJoinedFeat(featEntry);
      const normalized = normalizeFeatChoices(featEntry);
      if (!normalized.asi?.ability) return null;

      const amount = Number.isFinite(Number(normalized.asi.amount)) ? Number(normalized.asi.amount) : 1;
      const abilityAbbrev = ABILITY_KEY_TO_ABBREV[normalized.asi.ability];
      if (!abilityAbbrev) return null;

      const featName = joinedFeat?.name || featEntry?.name || 'Feat';

      return {
        source: 'Feat',
        sourceType: featName,
        abilities: [`${abilityAbbrev}: ${amount}`]
      };
    })
    .filter(Boolean);
}

export function extractFeatGrantedSpells(feats = []) {
  return feats.flatMap((featEntry) => {
    const joinedFeat = getJoinedFeat(featEntry);
    const featName = joinedFeat?.name || featEntry?.name || 'Feat';
    const normalized = normalizeFeatChoices(featEntry);

    return normalized.grantedSpells
      .filter((spell) => typeof spell?.name === 'string' && spell.name.trim())
      .map((spell) => ({
        name: spell.name,
        uses: Number.isFinite(Number(spell.uses)) ? Number(spell.uses) : undefined,
        source: featName
      }));
  });
}
