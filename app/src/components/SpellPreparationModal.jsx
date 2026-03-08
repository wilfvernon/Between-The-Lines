import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { parseCastingTime } from '../lib/spellUtils.jsx';
import { getSpellcastingInfoFromClasses, getWarlockPactMagicAtLevel } from '../pages/CharacterSheet/utils/spellSlots';
import SpellDetailModal from './SpellDetailModal';
import './SpellPreparationModal.css';

function SpellPreparationModal({
  character,
  isOpen,
  onClose,
  onPreparedSpellsChanged
}) {
  const [availableSpells, setAvailableSpells] = useState([]);
  const [preparedSpells, setPreparedSpells] = useState(new Set());
  const [filteredSpells, setFilteredSpells] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const hasChangesRef = useRef(false);

  // Get class info for prep limits
  const getCharacterClass = () => {
    if (!character?.classes || character?.classes.length === 0) return null;
    return character?.classes?.[0] || null;
  };

  const charClass = getCharacterClass();
  const className = charClass?.class || charClass?.definition?.name || '';
  const classNameLower = String(className).toLowerCase();
  const isWarlock = classNameLower === 'warlock';
  const charLevel = charClass?.level || charClass?.definition?.level || character.level || 1;
  const characterClassNames = (character?.classes || [])
    .map((entry) => entry?.class || entry?.definition?.name || '')
    .map((name) => String(name).trim().toLowerCase())
    .filter(Boolean);

  const preparedListClassNames = characterClassNames.filter((name) =>
    ['cleric', 'druid', 'paladin', 'ranger'].includes(name)
  );

  const spellIsOnPreparedClassList = (spell) => {
    const rawLists = spell?.spell_lists;

    let normalizedLists = [];
    if (Array.isArray(rawLists)) {
      normalizedLists = rawLists;
    } else if (typeof rawLists === 'string') {
      normalizedLists = rawLists.split(',');
    }

    const listSet = new Set(
      normalizedLists
        .map((listName) => String(listName || '').trim().toLowerCase())
        .filter(Boolean)
    );

    return preparedListClassNames.some((classNameValue) => listSet.has(classNameValue));
  };

  // Determine prep limits based on class and level
  const getPrepLimit = () => {
    if (isWarlock) {
      return getWarlockPactMagicAtLevel(charLevel).prepared;
    }

    const isWizard = className === 'Wizard';
    const limits = {
      1: isWizard ? 4 : 4,
      2: isWizard ? 6 : 5,
      3: isWizard ? 8 : 6,
      4: isWizard ? 10 : 7,
      5: isWizard ? 13 : 9,
      6: isWizard ? 15 : 10,
      7: isWizard ? 18 : 11,
      8: isWizard ? 20 : 12,
      9: isWizard ? 22 : 14,
      10: isWizard ? 24 : 15,
      11: isWizard ? 26 : 16,
      12: isWizard ? 26 : 16,
      13: isWizard ? 27 : 17,
      14: isWizard ? 28 : 17,
      15: isWizard ? 29 : 18,
      16: isWizard ? 30 : 18,
      17: isWizard ? 31 : 19,
      18: isWizard ? 32 : 20,
      19: isWizard ? 33 : 21,
      20: isWizard ? 34 : 22,
    };
    return limits[charLevel] || 4;
  };

  // Fetch spells based on class type
  useEffect(() => {
    if (!isOpen || !character) return;
    
    // Reset changes flag when modal opens
    hasChangesRef.current = false;
    
    const fetchSpells = async () => {
      setLoading(true);
      try {
        const isWizardOrBard = className === 'Wizard' || className === 'Bard';

        let spellsQuery = supabase.from('character_spells').select(`
          id,
          spell_id,
          is_prepared,
          spell:spell_id(id, name, level, school, description, casting_time, range, is_attack, is_save, save_type, effect_type, dice, add_modifier, components, higher_levels)
        `).eq('character_id', character.id);

        const { data: charSpells, error: charError } = await spellsQuery;

        if (charError) throw charError;

        if (isWizardOrBard) {
          // For Wizard/Bard: use character_spells, filter out cantrips
          const spells = charSpells
            ?.filter(cs => cs.spell && cs.spell.level > 0) // Exclude cantrips
            .map(cs => ({
              ...cs.spell,
              characterSpellId: cs.id,
              isPrepared: cs.is_prepared
            })) || [];
          
          setAvailableSpells(spells);
          setPreparedSpells(new Set(
            spells.filter(s => s.isPrepared).map(s => s.id)
          ));
        } else {
          // For prepared casters: fetch only spells from their class spell lists
          const { data: allSpells, error: spellError } = await supabase
            .from('spells')
            .select('id, name, level, school, description, casting_time, range, is_attack, is_save, save_type, effect_type, dice, add_modifier, spell_lists, components, higher_levels')
            .gt('level', 0) // Exclude cantrips
            .lte('level', 9);

          if (spellError) throw spellError;

          // Mark which ones are prepared (exist in character_spells with is_prepared=true)
          const preparedMap = new Map(
            charSpells
              ?.filter(cs => cs.spell && cs.spell.level > 0 && cs.is_prepared)
              .map(cs => [cs.spell_id, cs.id]) || []
          );

          const classFilteredSpells = (allSpells || []).filter((spell) => {
            // Defensive fallback: if no prepared-list class can be determined, keep current behavior.
            if (preparedListClassNames.length === 0) return true;
            return spellIsOnPreparedClassList(spell);
          });

          const spells = classFilteredSpells.map(spell => ({
            ...spell,
            characterSpellId: preparedMap.get(spell.id),
            isPrepared: !!preparedMap.get(spell.id)
          }));

          setAvailableSpells(spells);
          setPreparedSpells(new Set(
            spells.filter(s => s.isPrepared).map(s => s.id)
          ));
        }
      } catch (error) {
        console.error('Failed to fetch spells:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSpells();
  }, [isOpen, character, className]);

  // Filter spells by selected level
  useEffect(() => {
    const filtered = availableSpells
      .filter(s => s.level === selectedLevel)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setFilteredSpells(filtered);
  }, [availableSpells, selectedLevel]);

  // Handle spell preparation toggle
  const toggleSpellPreparation = async (spell) => {
    if (isWarlock) return;

    const isCurrentlyPrepared = preparedSpells.has(spell.id);
    const maxPrep = getPrepLimit();

    // Check if we're trying to prepare a new spell and at limit
    if (!isCurrentlyPrepared && preparedSpells.size >= maxPrep) {
      alert(`You can only prepare ${maxPrep} spells at this level.`);
      return;
    }

    setSaving(true);
    try {
      const isWizardOrBard = className === 'Wizard' || className === 'Bard';

      if (isWizardOrBard) {
        // Toggle is_prepared flag
        await supabase
          .from('character_spells')
          .update({ is_prepared: !isCurrentlyPrepared })
          .eq('id', spell.characterSpellId);
      } else {
        // Create or delete character_spells join
        if (isCurrentlyPrepared) {
          // Delete the join
          await supabase
            .from('character_spells')
            .delete()
            .eq('id', spell.characterSpellId);
        } else {
          // Create new join with is_prepared=true
          await supabase
            .from('character_spells')
            .insert({
              character_id: character.id,
              spell_id: spell.id,
              is_prepared: true
            });
        }
      }

      // Update local state
      const newPreparedSpells = new Set(preparedSpells);
      if (isCurrentlyPrepared) {
        newPreparedSpells.delete(spell.id);
      } else {
        newPreparedSpells.add(spell.id);
      }
      setPreparedSpells(newPreparedSpells);

      // Update available spells list
      const updatedSpells = availableSpells.map(s =>
        s.id === spell.id ? { ...s, isPrepared: !isCurrentlyPrepared } : s
      );
      setAvailableSpells(updatedSpells);

      // Mark that changes were made (will trigger refetch on close)
      hasChangesRef.current = true;
    } catch (error) {
      console.error('Failed to update spell preparation:', error);
      alert('Failed to update spell preparation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const maxPrep = getPrepLimit();
  const preparedCount = preparedSpells.size;

  // Get max spell level accessible based on character's spell slots
  const spellcastingInfo = getSpellcastingInfoFromClasses(character?.classes || []);
  const maxSpellLevel = spellcastingInfo.maxSpellLevel;

  const levelTabs = Array.from(new Set(availableSpells.map(s => s.level)))
    .filter(l => l > 0 && l <= maxSpellLevel) // Only show levels the character can cast
    .sort((a, b) => a - b);

  // Calculate spellcasting modifier and DC
  const abilityMap = {
    'str': 'strength', 'dex': 'dexterity', 'con': 'constitution',
    'int': 'intelligence', 'wis': 'wisdom', 'cha': 'charisma',
    'strength': 'strength', 'dexterity': 'dexterity', 'constitution': 'constitution',
    'intelligence': 'intelligence', 'wisdom': 'wisdom', 'charisma': 'charisma'
  };
  
  const derivedMods = character.derived_stats?.modifiers || {};
  const rawAbility = character.spellcasting_ability?.toLowerCase() || 'int';
  const spellAbility = abilityMap[rawAbility] || 'intelligence';
  const spellAbilityMod = derivedMods[spellAbility] || 0;
  const proficiencyBonus = character.proficiency_bonus || 2;
  const spellAttackBonus = spellAbilityMod + proficiencyBonus;
  const spellSaveDC = 8 + proficiencyBonus + spellAbilityMod;

  // Helper: Format casting time (truncate reactions)
  const formatCastingTime = (castingTime) => {
    const { formatted } = parseCastingTime(castingTime);
    return formatted;
  };

  // Helper: Get effect type icon
  const getEffectTypeIcon = (effectType) => {
    if (!effectType) return null;
    
    if (effectType === 'Healing') {
      return new URL('../assets/icons/hp/full.svg', import.meta.url).href;
    } else if (effectType === 'Temp HP') {
      return new URL('../assets/icons/hp/temp.svg', import.meta.url).href;
    } else {
      const damageType = effectType.toLowerCase().replace(/\s+/g, '-');
      return new URL(`../assets/icons/damage/${damageType}.svg`, import.meta.url).href;
    }
  };

  const crossIconSrc = '/icons/util/cross.svg';
  const prepHeaderTitle = className === 'Wizard' ? 'Spellbook' 
    : className === 'Bard' ? 'Storybook'
    : className === 'Druid' || className === 'Ranger' ? 'Primal Spells'
    : className === 'Cleric' || className === 'Paladin' ? 'Divine Spells'
    : 'Prepare Spells';

  // Handle modal close with refetch if changes were made
  const handleClose = () => {
    if (hasChangesRef.current && onPreparedSpellsChanged) {
      onPreparedSpellsChanged();
      hasChangesRef.current = false;
    }
    onClose();
  };

  if (!isOpen || !character) return null;

  return (
    <>
      {createPortal(
        <div className="spell-preparation-overlay" onClick={handleClose}>
          <div className="spell-preparation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="spell-prep-inner">
              <div className="spell-prep-header">
                <div className="spell-prep-title-row">
                  <div className="spell-prep-title-wrap">
                    <h2 className="spell-prep-title">{prepHeaderTitle}</h2>
                  </div>
                  <button className="spell-prep-close" onClick={handleClose} aria-label="Close">
                    <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} />
                  </button>
                </div>
                <div className="spell-prep-info">
                  <span className="prep-limit">
                    {preparedCount} / {maxPrep} prepared
                  </span>
                </div>
              </div>

              <div className="spell-prep-content">
                {loading ? (
                  <div className="spell-prep-loading">
                    <p>Loading spells...</p>
                  </div>
                ) : filteredSpells.length === 0 ? (
                  <div className="spell-prep-empty">
                    <p>No spells available at this level</p>
                  </div>
                ) : (
                  <div className="spell-prep-list">
                    {filteredSpells.map(spell => {
                      const effectTypeIcon = getEffectTypeIcon(spell.effect_type);
                      return (
                        <div
                          key={spell.id}
                          className={`spell-prep-item ${
                            preparedSpells.has(spell.id) ? 'prepared' : ''
                          } ${saving ? 'disabled' : ''}`}
                        >
                          <div className="spell-prep-entry">
                            {/* Spell Name Row */}
                            <div className="spell-prep-name-row" onClick={() => {
                              setSelectedSpell(spell);
                              setIsDetailModalOpen(true);
                            }}>
                              <h4>{spell.name}</h4>
                              {parseCastingTime(spell.casting_time).isRitual && (
                                <img
                                  src={new URL('../assets/icons/spell/ritual.svg', import.meta.url).href}
                                  alt="Ritual"
                                  className="spell-ritual-badge"
                                  title="Ritual"
                                />
                              )}
                              <div className="spell-components">
                                {spell.components?.includes('V') && <span className="component-badge">V</span>}
                                {spell.components?.includes('S') && <span className="component-badge">S</span>}
                                {spell.components?.includes('M') && <span className="component-badge">M</span>}
                              </div>
                            </div>

                            {/* Spell Info Row */}
                            <div className="spell-prep-info-row">
                              <div className="spell-prep-col time-col">
                                <span>{formatCastingTime(spell.casting_time)}</span>
                              </div>
                              <div className="spell-prep-col range-col">
                                <span>{spell.range || '--'}</span>
                              </div>
                              <div className="spell-prep-col effect-type-col">
                                {effectTypeIcon && (
                                  <img 
                                    src={effectTypeIcon}
                                    alt={spell.effect_type}
                                    className="spell-effect-type-icon"
                                    title={spell.effect_type}
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Checkbox */}
                          <label className="spell-prep-checkbox-label">
                            <input
                              type="checkbox"
                              className="spell-prep-checkbox"
                              checked={preparedSpells.has(spell.id)}
                              onChange={() => toggleSpellPreparation(spell)}
                              disabled={saving || isWarlock}
                              title={isWarlock ? 'Warlocks cannot change prepared spells here' : 'Toggle prepared'}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="spell-prep-tabs-rail" aria-label="Spell level tabs">
              {levelTabs.map(level => (
                <button
                  key={`level-${level}`}
                  className={`spell-prep-tab ${selectedLevel === level ? 'active' : ''}`}
                  onClick={() => setSelectedLevel(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      <SpellDetailModal
        spell={selectedSpell}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        spellAttackBonus={spellAttackBonus}
        spellSaveDC={spellSaveDC}
        spellAbilityMod={spellAbilityMod}
      />
    </>
  );
}

SpellPreparationModal.propTypes = {
  character: PropTypes.shape({
    id: PropTypes.string.isRequired,
    level: PropTypes.number.isRequired,
    classes: PropTypes.array.isRequired,
    spellcasting_ability: PropTypes.string,
    proficiency_bonus: PropTypes.number,
    derived_stats: PropTypes.object
  }).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onPreparedSpellsChanged: PropTypes.func
};

export default SpellPreparationModal;
