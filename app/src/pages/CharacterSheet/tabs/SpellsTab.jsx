import { useState, useEffect, useMemo } from 'react';
import { getSpellcastingInfoFromClasses } from '../utils/spellSlots';
import { parseCastingTime } from '../../../lib/spellUtils.jsx';
import { supabase } from '../../../lib/supabase';
import SpellDetailModal from '../../../components/SpellDetailModal';
import SpellPreparationModal from '../../../components/SpellPreparationModal';
import LearnSpellModal from '../../../components/LearnSpellModal';
import SpellRow from '../components/SpellRow';

const normalizeBenefitType = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const normalizeBenefitsInput = (benefits) => {
  if (Array.isArray(benefits)) return benefits;
  if (benefits && typeof benefits === 'object' && benefits.type) return [benefits];
  if (typeof benefits === 'string') {
    try {
      const parsed = JSON.parse(benefits);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && parsed.type) return [parsed];
    } catch {
      return [];
    }
  }
  return [];
};

const parseNumericBonus = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.trim().match(/^([+-]?\d+)$/);
    if (match) return Number.parseInt(match[1], 10);
  }
  return 0;
};

const isMagicItemAttunementRequired = (magicItem) => {
  const value = magicItem?.requires_attunement ?? magicItem?.raw_data?.requires_attunement;
  if (value === null || value === undefined || value === false) return false;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'no' || normalized === 'none' || normalized === 'false') {
      return false;
    }
  }

  return Boolean(value);
};

const isMagicItemHidden = (magicItem) => {
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
};

const isActiveMagicInventoryItem = (inventoryItem) => {
  const magicItem = inventoryItem?.magic_item;
  if (!magicItem) return false;
  if (isMagicItemHidden(magicItem)) return false;
  if (inventoryItem?.equipped !== true) return false;
  if (isMagicItemAttunementRequired(magicItem) && inventoryItem?.attuned !== true) return false;
  return true;
};

const getMagicItemSpellcastingBonuses = (character) => {
  const inventory = Array.isArray(character?.inventory) ? character.inventory : [];

  return inventory.reduce((acc, inventoryItem) => {
    const magicItem = inventoryItem?.magic_item;
    if (!isActiveMagicInventoryItem(inventoryItem)) return acc;

    const benefits = normalizeBenefitsInput(
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
};

const hasRitualCasting = (castingTime) => String(castingTime || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .includes('ritual');

const ROMAN_BY_LEVEL = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX'
};

export default function SpellsTab({ character, spells, loading, proficiencyBonus, derivedMods, onSpellsUpdate, spellUses, onSpellUsesChange, longRestVersion = 0 }) {
  const [activeSubtab, setActiveSubtab] = useState('cantrips');
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrepModalOpen, setIsPrepModalOpen] = useState(false);
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
  const [ritualAdeptSpells, setRitualAdeptSpells] = useState([]);

  const classNames = useMemo(
    () => (character?.classes || [])
      .map((entry) => entry?.class || entry?.definition?.name)
      .filter(Boolean),
    [character?.classes]
  );

  const classNamesKey = useMemo(
    () => classNames.map((name) => String(name).toLowerCase()).sort().join('|'),
    [classNames]
  );

  const isWarlockClass = classNames.some(
    (name) => String(name || '').toLowerCase() === 'warlock'
  );

  const hasRitualAdept = (character?.features || []).some((feature) => {
    const benefits = normalizeBenefitsInput(feature?.benefits ?? feature?.benefit);
    return benefits.some((benefit) => normalizeBenefitType(benefit?.type) === 'ritual_adept');
  });

  useEffect(() => {
    let cancelled = false;

    const fetchRitualAdeptSpells = async () => {
      if (!character?.id || !hasRitualAdept) {
        setRitualAdeptSpells([]);
        return;
      }

      const isWizardOrBard = classNames.some((name) => ['wizard', 'bard'].includes(String(name).toLowerCase()));

      try {
        if (isWizardOrBard) {
          const { data, error } = await supabase
            .from('character_spells')
            .select('spell:spells(*)')
            .eq('character_id', character.id);

          if (error) throw error;

          const rituals = (data || [])
            .map((row) => row?.spell)
            .filter((spell) => spell && hasRitualCasting(spell.casting_time));

          if (!cancelled) {
            const deduped = [];
            const seen = new Set();
            rituals.forEach((spell) => {
              if (!spell?.id || seen.has(spell.id)) return;
              seen.add(spell.id);
              deduped.push(spell);
            });
            setRitualAdeptSpells(deduped);
          }
          return;
        }

        const { data, error } = await supabase
          .from('spells')
          .select('*');

        if (error) throw error;

        const classNameSet = new Set(classNames.map((name) => String(name).toUpperCase()));

        const rituals = (data || []).filter((spell) => {
          if (!spell || !hasRitualCasting(spell.casting_time)) return false;
          if (!Array.isArray(spell.spell_lists) || spell.spell_lists.length === 0) return false;

          return spell.spell_lists.some((listName) => classNameSet.has(String(listName || '').toUpperCase()));
        });

        if (!cancelled) {
          setRitualAdeptSpells(rituals);
        }
      } catch (error) {
        console.warn('Failed to fetch ritual adept spells:', error?.message || error);
        if (!cancelled) setRitualAdeptSpells([]);
      }
    };

    fetchRitualAdeptSpells();

    return () => {
      cancelled = true;
    };
  }, [character?.id, hasRitualAdept, classNames, classNamesKey]);
  
  // Initialize slotsUsed from localStorage immediately
  const [slotsUsed, setSlotsUsed] = useState(() => {
    if (!character?.id && !character?.name) return {};
    const key = character?.id 
      ? `spellSlotsUsed:${character.id}` 
      : `spellSlotsUsed:${character.name}`;
    try {
      const stored = localStorage.getItem(key);
      const loaded = stored ? JSON.parse(stored) : {};
      console.log('Initializing spell slots from localStorage:', { key, loaded });
      return loaded;
    } catch (error) {
      console.warn('Failed to initialize spell slots from localStorage', error);
      return {};
    }
  });

  const slotsStorageKey = character?.id
    ? `spellSlotsUsed:${character.id}`
    : character?.name
      ? `spellSlotsUsed:${character.name}`
      : null;

  // Save to localStorage whenever slotsUsed changes
  useEffect(() => {
    if (!slotsStorageKey) return;
    try {
      console.log('Saving spell slots to localStorage:', { key: slotsStorageKey, slotsUsed });
      localStorage.setItem(slotsStorageKey, JSON.stringify(slotsUsed));
    } catch (error) {
      console.warn('Failed to save spell slots to localStorage', error);
    }
  }, [slotsStorageKey, slotsUsed]);

  // Reset spell slot usage after long rest
  useEffect(() => {
    if (!longRestVersion) return;
    setSlotsUsed({});
  }, [longRestVersion]);

  const safeSpells = Array.isArray(spells) ? spells : [];

  // Warlocks are known-spell casters in this app flow, so show all known spells.
  // Other casters keep prepared-only filtering.
  const visibleSpells = safeSpells.filter(cs => {
    const spell = cs.spell;
    if (!spell) return false;
    if (isWarlockClass) return true;
    // Include cantrips (level 0), always prepared spells, or prepared leveled spells
    return spell.level === 0 || cs.always_prepared || cs.is_prepared;
  });

  const displaySpells = (() => {
    if (!hasRitualAdept || ritualAdeptSpells.length === 0) return visibleSpells;

    const visibleSpellIds = new Set(
      visibleSpells
        .map((entry) => entry?.spell?.id)
        .filter(Boolean)
    );

    const ritualOnly = ritualAdeptSpells
      .filter((spell) => spell?.id && !visibleSpellIds.has(spell.id))
      .map((spell) => ({
        id: `ritual-only-${character?.id || 'char'}-${spell.id}`,
        character_id: character?.id,
        spell_id: spell.id,
        is_prepared: false,
        always_prepared: false,
        ritual_only: true,
        spell
      }));

    return [...visibleSpells, ...ritualOnly];
  })();

  // Get equipped weapon for "Weapon" dice spells
  const equippedWeaponItem = character.inventory?.find((item) => {
    if (!item.equipped) return false;
    const itemData = item.equipment || item.magic_item?.equipment || item.magic_item;
    if (!itemData) return false;
    const type = itemData.type?.toLowerCase() || '';
    return type.includes('weapon');
  });
  const equippedWeapon = equippedWeaponItem?.equipment || equippedWeaponItem?.magic_item?.equipment || equippedWeaponItem?.magic_item || null;

  const spellcastingInfo = getSpellcastingInfoFromClasses(character.classes || []);
  const spellSlots = spellcastingInfo.slots;
  const isWarlockPactMagic = spellcastingInfo.mode === 'warlock';
  const warlockPactLevel = spellcastingInfo.pactSlotLevel;
  const getSlotsAtLevel = (level) => {
    if (!Number.isFinite(level) || level <= 0) return 0;
    return Number(spellSlots[level - 1] || 0);
  };

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__spellSlots = spellSlots;
    window.__spellcastingInfo = spellcastingInfo;
  }

  // Group spells by level tabs, including upcast leveled spells
  const spellsByLevel = {};

  displaySpells.forEach(cs => {
    const spell = cs.spell;
    if (!spell) return;

    const baseLevel = spell.level ?? 0;

    // Pact Magic: all leveled spells use the single pact slot level.
    if (isWarlockPactMagic && baseLevel > 0 && warlockPactLevel > 0) {
      if (baseLevel > warlockPactLevel) return;
      if (!spellsByLevel[warlockPactLevel]) {
        spellsByLevel[warlockPactLevel] = [];
      }
      spellsByLevel[warlockPactLevel].push({
        ...cs,
        castLevel: warlockPactLevel,
        isUpcast: baseLevel < warlockPactLevel
      });
      return;
    }

    // Always add to base level
    if (!spellsByLevel[baseLevel]) {
      spellsByLevel[baseLevel] = [];
    }
    spellsByLevel[baseLevel].push({ ...cs, castLevel: baseLevel });

    // For leveled spells with higher_levels, add to higher level tabs
    // Only add upcast versions for spell levels the character can actually cast
    if (baseLevel > 0 && spell.higher_levels) {
      for (let level = baseLevel + 1; level <= 9; level++) {
        // Only add upcast version if character has spell slots for this level
        if (getSlotsAtLevel(level) <= 0) continue;
        
        if (!spellsByLevel[level]) {
          spellsByLevel[level] = [];
        }
        spellsByLevel[level].push({ ...cs, castLevel: level, isUpcast: true });
      }
    }
  });

  const spellLevelTabs = [
    { key: 'cantrips', level: 0, label: 'Cantrips' },
    { key: '1st', level: 1, label: 'I' },
    { key: '2nd', level: 2, label: 'II' },
    { key: '3rd', level: 3, label: 'III' },
    { key: '4th', level: 4, label: 'IV' },
    { key: '5th', level: 5, label: 'V' },
    { key: '6th', level: 6, label: 'VI' },
    { key: '7th', level: 7, label: 'VII' },
    { key: '8th', level: 8, label: 'VIII' },
    { key: '9th', level: 9, label: 'IX' },
  ].filter(tab => {
    if (!spellsByLevel[tab.level] || spellsByLevel[tab.level].length === 0) return false;
    if (tab.level === 0) return true;

    if (isWarlockPactMagic) {
      return tab.level === warlockPactLevel;
    }

    // Show level tab if:
    // 1. Character has spell slots for this level, OR
    // 2. Character has feature-granted spells at this level (even without slots)
    const hasSlots = getSlotsAtLevel(tab.level) > 0;
    const hasFeatureGrantedSpells = spellsByLevel[tab.level]?.some(cs => 
      cs.feat_granted || cs.feature_granted || cs.item_granted
    );
    
    return hasSlots || hasFeatureGrantedSpells;
  }).map((tab) => {
    if (!isWarlockPactMagic || tab.level === 0) return tab;
    return {
      ...tab,
      key: `pact-${tab.level}`,
      label: ROMAN_BY_LEVEL[tab.level] || tab.label
    };
  });

  useEffect(() => {
    if (!spellLevelTabs.length) return;
    const hasActive = spellLevelTabs.some(tab => tab.key === activeSubtab);
    if (!hasActive) {
      setActiveSubtab(spellLevelTabs[0].key);
    }
  }, [spellLevelTabs, activeSubtab]);

  if (!character.spellcasting_ability) {
    return (
      <div className="spells-tab">
        <h2>Spells</h2>
        <p className="info-text">This character is not a spellcaster</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="spells-tab">
        <h2>Spells</h2>
        <div className="loading-container">
          <img src="/crest.png" alt="" className="loading-crest loading-crest-small" />
          <span className="loading-text">Loading spells...</span>
        </div>
      </div>
    );
  }

  // Calculate spellcasting modifier and DC
  const abilityMap = {
    'str': 'strength', 'dex': 'dexterity', 'con': 'constitution',
    'int': 'intelligence', 'wis': 'wisdom', 'cha': 'charisma',
    'strength': 'strength', 'dexterity': 'dexterity', 'constitution': 'constitution',
    'intelligence': 'intelligence', 'wisdom': 'wisdom', 'charisma': 'charisma'
  };
  
  const rawAbility = character.spellcasting_ability?.toLowerCase() || 'int';
  const spellAbility = abilityMap[rawAbility] || 'intelligence';
  const spellAbilityMod = derivedMods?.[spellAbility] || 0;
  const spellcastingItemBonuses = getMagicItemSpellcastingBonuses(character);
  const spellAttackBonus = spellAbilityMod + (proficiencyBonus || 0) + (spellcastingItemBonuses.attackBonus || 0);
  const spellSaveDC = 8 + (proficiencyBonus || 0) + spellAbilityMod + (spellcastingItemBonuses.saveDCBonus || 0);

  // Check if character can prepare spells
  const canPrepareSpells = () => {
    const characterClasses = character.classes || [];
    const classNames = characterClasses.map(c => c.definition?.name || c.class || '').filter(Boolean);
    const normalizedClassNames = classNames.map((name) => String(name).toLowerCase());
    if (normalizedClassNames.includes('warlock')) return false;
    const prepareSpellClasses = ['Bard', 'Cleric', 'Druid', 'Ranger', 'Paladin', 'Wizard'];
    return classNames.some(name => prepareSpellClasses.includes(name));
  };

  const handlePrepareSpells = () => {
    setIsPrepModalOpen(true);
  };

  // Check if character can learn spells (Wizard and Bard)
  const canLearnSpells = () => {
    const characterClasses = character.classes || [];
    const classNames = characterClasses.map(c => c.definition?.name || c.class || '');
    const learnSpellClasses = ['Wizard', 'Bard'];
    return classNames.some(name => learnSpellClasses.includes(name));
  };

  const handleLearnSpells = () => {
    setIsLearnModalOpen(true);
  };


  // Helper: Get dice index for cantrip based on character level
  const getCantripDiceIndex = (charLevel) => {
    if (charLevel >= 17) return 3;
    if (charLevel >= 11) return 2;
    if (charLevel >= 5) return 1;
    return 0;
  };

  // Helper: Get appropriate dice value for spell at given cast level
  const getSpellDice = (spell, castLevel) => {
    if (!spell.dice || spell.dice.length === 0) return null;
    
    if (spell.level === 0) {
      // Cantrip: use character level
      const index = getCantripDiceIndex(character.level || 1);
      return spell.dice[index] || spell.dice[0];
    } else {
      // Leveled spell: use offset from base level
      const index = castLevel - spell.level;
      return spell.dice[index] || spell.dice[0];
    }
  };

  const getEffectTypeIcon = (effectType) => {
    if (!effectType) return null;
    
    if (effectType === 'Healing') {
      return new URL('../../../assets/icons/hp/full.svg', import.meta.url).href;
    } else if (effectType === 'Temp HP') {
      return new URL('../../../assets/icons/hp/temp.svg', import.meta.url).href;
    } else {
      // Damage type - look for corresponding icon in damage folder
      const damageType = effectType.toLowerCase().replace(/\s+/g, '-');
      return new URL(`../../../assets/icons/damage/${damageType}.svg`, import.meta.url).href;
    }
  };

  const getSlotIcon = (total, used) => {
    const cappedTotal = Math.max(1, Math.min(total, 4));
    const cappedUsed = Math.max(0, Math.min(used, cappedTotal));
    return new URL(
      `../../../assets/icons/slot/slot-${cappedTotal}-${cappedUsed}.svg`,
      import.meta.url
    ).href;
  };

  const incrementSlot = (level, total) => {
    setSlotsUsed((prev) => {
      const current = Math.min(prev[level] || 0, total);
      const next = current < total ? current + 1 : 0;
      return { ...prev, [level]: next };
    });
  };

  const decrementSlot = (level) => {
    setSlotsUsed((prev) => {
      const current = prev[level] || 0;
      const next = current > 0 ? current - 1 : 0;
      return { ...prev, [level]: next };
    });
  };

  // Get active spell list
  const activeLevel = spellLevelTabs.find(t => t.key === activeSubtab)?.level ?? 0;
  const rawSpells = spellsByLevel[activeLevel] || [];
  
  // Sort: native spells first (alphabetically), then upcast spells (alphabetically)
  const activeSpells = [...rawSpells].sort((a, b) => {
    // Group by upcast status first
    if (a.isUpcast !== b.isUpcast) {
      return a.isUpcast ? 1 : -1;
    }
    // Then alphabetically by spell name
    const nameA = a.spell?.name || '';
    const nameB = b.spell?.name || '';
    return nameA.localeCompare(nameB);
  });

  // Helper to format casting time (truncate reactions)
  const formatCastingTime = (castingTime) => {
    const { formatted } = parseCastingTime(castingTime);
    return formatted;
  };

  // Split tabs into cantrips and leveled spells
  const cantripTab = spellLevelTabs.find(t => t.level === 0);
  const leveledTabs = spellLevelTabs.filter(t => t.level > 0);

  return (
    <div className="spells-tab">
      <h2>Spells</h2>

      {spellLevelTabs.length === 0 ? (
        <p className="info-text">No spells found for this character</p>
      ) : (
        <>
          {/* Cantrips row */}
          {cantripTab && (
            <div className="spell-cantrip-row">
              <button
                key={cantripTab.key}
                className={activeSubtab === cantripTab.key ? 'subtab-btn active' : 'subtab-btn'}
                onClick={() => setActiveSubtab(cantripTab.key)}
              >
                {cantripTab.label}
              </button>
              <div className="spell-stats-display">
                <div className="spell-stat-item">
                  <span className="spell-stat-label">Mod</span>
                  <span className="spell-stat-value">{spellAbilityMod >= 0 ? '+' : ''}{spellAbilityMod}</span>
                </div>
                <div className="spell-stat-item">
                  <span className="spell-stat-label">Attack</span>
                  <span className="spell-stat-value">{spellAttackBonus >= 0 ? '+' : ''}{spellAttackBonus}</span>
                </div>
                <div className="spell-stat-item">
                  <span className="spell-stat-label">DC</span>
                  <span className="spell-stat-value">{spellSaveDC}</span>
                </div>
              </div>
              {canLearnSpells() && (
                <button className="learn-spells-btn" onClick={handleLearnSpells} title="Learn New Spell">
                  <img 
                    src={new URL('../../../assets/icons/game/spell.svg', import.meta.url).href}
                    alt="Learn Spell"
                    className="learn-spells-icon"
                  />
                </button>
              )}
              {canPrepareSpells() && (
                <button className="prepare-spells-btn" onClick={handlePrepareSpells} title="Prepare Spells">
                  <img 
                    src={new URL('../../../assets/icons/entity/spellbook.svg', import.meta.url).href}
                    alt="Prepare Spells"
                    className="prepare-spells-icon"
                  />
                </button>
              )}
            </div>
          )}

          {/* Leveled spells row */}
          {leveledTabs.length > 0 && (
            <>
              <div className="feature-subtabs spell-levels-row">
                {leveledTabs.map(tab => (
                  <button
                    key={tab.key}
                    className={activeSubtab === tab.key ? 'subtab-btn spell-level-btn active' : 'subtab-btn spell-level-btn'}
                    onClick={() => setActiveSubtab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {spellSlots.length > 0 && (
                <div className="spell-slots-row">
                  {leveledTabs.map(tab => {
                    const level = tab.level;
                    const count = spellSlots[level - 1] || 0;
                    const used = Math.min(slotsUsed[level] || 0, count);
                    const icon = getSlotIcon(count, used);
                    return (
                      <div key={`slot-wrapper-${level}`} className="spell-slot-wrapper">
                        <button
                          className="spell-slot-item"
                          type="button"
                          onClick={() => incrementSlot(level, count)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            decrementSlot(level);
                          }}
                          title={`Level ${level} slots: ${used}/${count}`}
                        >
                          <img src={icon} alt="" className="spell-slot-icon" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="feature-subtab-content">
            <div className="spells-container">
              {/* Column Headers */}
              <div className="spell-row spell-stats-row header-row">
                <div className="spell-col time-col">
                  <span className="stat-label">Time</span>
                </div>
                <div className="spell-col range-col">
                  <span className="stat-label">Range</span>
                </div>
                <div className="spell-col hitdc-col">
                  <span className="stat-label">Hit/DC</span>
                </div>
                <div className="spell-col effect-col">
                  <span className="stat-label">Effect</span>
                </div>
                <div className="spell-col effect-type-col">
                  <span className="stat-label">Type</span>
                </div>
              </div>

              {/* Spell Rows */}
              {activeSpells.map((cs, idx) => {
                const spell = cs.spell;
                if (!spell) return null;

                const castLevel = cs.castLevel ?? spell.level;
                const diceValue = getSpellDice(spell, castLevel);
                // Create modified spell with correct dice for this cast level
                const spellWithDice = {
                  ...spell,
                  dice: diceValue ? [diceValue] : spell.dice
                };

                return (
                  <SpellRow
                    key={`${cs.id}-${castLevel}-${idx}`}
                    spell={spellWithDice}
                    castingSpellData={cs}
                    spellAttackBonus={spellAttackBonus}
                    spellSaveDC={spellSaveDC}
                    spellAbilityMod={spellAbilityMod}
                    equippedWeapon={equippedWeapon}
                    onSpellClick={() => {
                      setSelectedSpell(spell);
                      setIsModalOpen(true);
                    }}
                    className="spell-clickable"
                    showRitual={true}
                    showAlwaysPrepared={true}
                    showUpcast={true}
                    maxSpellUses={cs.feat_uses}
                    spellUses={spellUses[cs.id]}
                    onSpellUsesChange={onSpellUsesChange}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

        <SpellDetailModal
          spell={selectedSpell}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          spellAttackBonus={spellAttackBonus}
          spellSaveDC={spellSaveDC}
          spellAbilityMod={spellAbilityMod}
        />

        <SpellPreparationModal
          character={character}
          isOpen={isPrepModalOpen}
          onClose={() => setIsPrepModalOpen(false)}
          onPreparedSpellsChanged={() => {
            // Refresh spells list to update visible spells
            if (onSpellsUpdate) {
              onSpellsUpdate();
            }
          }}
        />

        <LearnSpellModal
          character={character}
          isOpen={isLearnModalOpen}
          onClose={() => setIsLearnModalOpen(false)}
          spellAttackBonus={spellAttackBonus}
          spellSaveDC={spellSaveDC}
          spellAbilityMod={spellAbilityMod}
          onSpellLearned={() => {
            // Refresh spells list to update visible spells
            if (onSpellsUpdate) {
              onSpellsUpdate();
            }
          }}
        />
    </div>
  );
}
