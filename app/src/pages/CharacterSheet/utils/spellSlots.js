export const FULL_CASTER_CLASSES = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'];
export const HALF_CASTER_CLASSES = ['paladin', 'ranger'];
export const WARLOCK_CLASS = 'warlock';

export const FULL_CASTER_SLOTS = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1]
];

export const HALF_CASTER_SLOTS = [
  [],
  [2],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2]
];

// Pact Magic progression (Warlock)
// Index = class level, value = { slots, slotLevel, prepared }
export const WARLOCK_PACT_MAGIC = [
  null,
  { slots: 1, slotLevel: 1, prepared: 2 },
  { slots: 2, slotLevel: 1, prepared: 3 },
  { slots: 2, slotLevel: 2, prepared: 4 },
  { slots: 2, slotLevel: 2, prepared: 5 },
  { slots: 2, slotLevel: 3, prepared: 6 },
  { slots: 2, slotLevel: 3, prepared: 7 },
  { slots: 2, slotLevel: 4, prepared: 8 },
  { slots: 2, slotLevel: 4, prepared: 9 },
  { slots: 2, slotLevel: 5, prepared: 10 },
  { slots: 2, slotLevel: 5, prepared: 10 },
  { slots: 3, slotLevel: 5, prepared: 11 },
  { slots: 3, slotLevel: 5, prepared: 11 },
  { slots: 3, slotLevel: 5, prepared: 12 },
  { slots: 3, slotLevel: 5, prepared: 12 },
  { slots: 3, slotLevel: 5, prepared: 13 },
  { slots: 3, slotLevel: 5, prepared: 13 },
  { slots: 4, slotLevel: 5, prepared: 14 },
  { slots: 4, slotLevel: 5, prepared: 14 },
  { slots: 4, slotLevel: 5, prepared: 15 },
  { slots: 4, slotLevel: 5, prepared: 15 }
];

export const getClassName = (classEntry) => {
  return (classEntry?.definition?.name || classEntry?.class || '').toLowerCase();
};

export const getClassLevel = (classEntry) => {
  return classEntry?.level || classEntry?.definition?.level || 0;
};

export const getWarlockPactMagicAtLevel = (level = 0) => {
  const clamped = Math.max(1, Math.min(20, Number(level) || 1));
  return WARLOCK_PACT_MAGIC[clamped] || WARLOCK_PACT_MAGIC[1];
};

const slotsFromPactMagic = (pactMagic) => {
  const slotLevel = pactMagic?.slotLevel || 1;
  const slots = pactMagic?.slots || 0;
  const byLevel = Array.from({ length: slotLevel }, () => 0);
  byLevel[slotLevel - 1] = slots;
  return byLevel;
};

export const getSpellcastingInfoFromClasses = (classes = []) => {
  if (!classes.length) {
    return {
      mode: 'none',
      slots: [],
      maxSpellLevel: 0,
      pactSlots: 0,
      pactSlotLevel: 0,
      warlockPreparedLimit: 0
    };
  }

  const normalized = classes.map((entry) => ({
    name: getClassName(entry),
    level: getClassLevel(entry)
  }));

  // Pact Magic has its own slot progression and UI behavior.
  // Keep this isolated to single-class Warlock characters.
  if (normalized.length === 1 && normalized[0].name === WARLOCK_CLASS) {
    const pactMagic = getWarlockPactMagicAtLevel(normalized[0].level);
    const slots = slotsFromPactMagic(pactMagic);
    return {
      mode: 'warlock',
      slots,
      maxSpellLevel: pactMagic.slotLevel,
      pactSlots: pactMagic.slots,
      pactSlotLevel: pactMagic.slotLevel,
      warlockPreparedLimit: pactMagic.prepared
    };
  }

  let slots = [];

  if (normalized.length === 1) {
    const onlyClass = normalized[0];
    if (FULL_CASTER_CLASSES.includes(onlyClass.name)) {
      slots = FULL_CASTER_SLOTS[onlyClass.level] || [];
    } else if (HALF_CASTER_CLASSES.includes(onlyClass.name)) {
      slots = HALF_CASTER_SLOTS[onlyClass.level] || [];
    }

    return {
      mode: 'standard',
      slots,
      maxSpellLevel: slots.length,
      pactSlots: 0,
      pactSlotLevel: 0,
      warlockPreparedLimit: 0
    };
  }

  // Multiclass approximation: full + half/2, then use full caster table
  const effectiveLevel = normalized.reduce((total, entry) => {
    if (FULL_CASTER_CLASSES.includes(entry.name)) return total + entry.level;
    if (HALF_CASTER_CLASSES.includes(entry.name)) return total + Math.floor(entry.level / 2);
    return total;
  }, 0);

  if (effectiveLevel > 0) {
    const cappedLevel = Math.min(effectiveLevel, 20);
    slots = FULL_CASTER_SLOTS[cappedLevel] || [];
  }

  return {
    mode: 'standard',
    slots,
    maxSpellLevel: slots.length,
    pactSlots: 0,
    pactSlotLevel: 0,
    warlockPreparedLimit: 0
  };
};

export const getSpellSlotsFromClasses = (classes = []) => {
  return getSpellcastingInfoFromClasses(classes).slots;
};
