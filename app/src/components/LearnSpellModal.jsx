import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { parseCastingTime } from '../lib/spellUtils.jsx';
import { getSpellcastingInfoFromClasses } from '../pages/CharacterSheet/utils/spellSlots';
import SpellDetailModal from './SpellDetailModal';
import './LearnSpellModal.css';

function LearnSpellModal({
  character,
  isOpen,
  onClose,
  onSpellLearned,
  spellAttackBonus,
  spellSaveDC,
  spellAbilityMod
}) {
  const [availableSpells, setAvailableSpells] = useState([]);
  const [learnedSpells, setLearnedSpells] = useState(new Set());
  const [filteredSpells, setFilteredSpells] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [confirmSpell, setConfirmSpell] = useState(null);

  const className = character?.classes?.[0]?.class || character?.classes?.[0]?.definition?.name || '';

  // Fetch spells available for this class
  useEffect(() => {
    if (!isOpen || !character) return;

    const fetchSpells = async () => {
      setLoading(true);
      try {
        // Get all leveled spells
        const { data: allSpells, error: spellError } = await supabase
          .from('spells')
          .select('*')
          .gt('level', 0) // Exclude cantrips
          .lte('level', 9);

        if (spellError) throw spellError;

        // Filter spells by class (spell_lists array contains the class name)
        const classNameUpper = className.toUpperCase();
        const classSpells = allSpells?.filter(spell => {
          if (!spell.spell_lists || !Array.isArray(spell.spell_lists)) return false;
          return spell.spell_lists.some(list => 
            (list || '').toUpperCase() === classNameUpper
          );
        }) || [];

        // Get spells the character has already learned
        const { data: charSpells, error: charError } = await supabase
          .from('character_spells')
          .select('spell_id')
          .eq('character_id', character.id);

        if (charError) throw charError;

        const learnedSet = new Set(charSpells?.map(cs => cs.spell_id) || []);
        setLearnedSpells(learnedSet);

        // Filter out already learned spells
        const unlearned = classSpells.filter(spell => !learnedSet.has(spell.id));
        setAvailableSpells(unlearned);
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

  // Get max spell level accessible based on character's spell slots
  const spellcastingInfo = getSpellcastingInfoFromClasses(character?.classes || []);
  const maxSpellLevel = spellcastingInfo.maxSpellLevel;

  // Get unique levels available, restricted to character-accessible levels
  const levelTabs = Array.from(new Set(availableSpells.map(s => s.level)))
    .filter(l => l > 0 && l <= maxSpellLevel)
    .sort((a, b) => a - b);

  // Keep selected level on a valid tab
  useEffect(() => {
    if (levelTabs.length === 0) return;
    if (!levelTabs.includes(selectedLevel)) {
      setSelectedLevel(levelTabs[0]);
    }
  }, [levelTabs, selectedLevel]);

  // Learn spell
  const handleLearnSpell = async (spell) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('character_spells')
        .insert({
          character_id: character.id,
          spell_id: spell.id,
          is_prepared: false
        });

      if (error) throw error;

      // Update local state
      setLearnedSpells(new Set([...learnedSpells, spell.id]));
      setAvailableSpells(availableSpells.filter(s => s.id !== spell.id));
      setConfirmSpell(null);

      // Call callback to refetch in parent
      if (onSpellLearned) {
        onSpellLearned();
      }
    } catch (error) {
      console.error('Failed to learn spell:', error);
      alert('Failed to learn spell. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;
  const spellIconSrc = new URL('../assets/icons/game/spell.svg', import.meta.url).href;

  if (!isOpen || !character) return null;

  return (
    <>
      {createPortal(
        <div className="spell-preparation-overlay" onClick={onClose}>
          <div className="spell-preparation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="spell-prep-inner">
              <div className="spell-prep-header">
                <div className="spell-prep-title-row">
                  <div className="spell-prep-title-wrap">
                    <h2 className="spell-prep-title">Learn Spell</h2>
                  </div>
                  <button className="spell-prep-close" onClick={onClose} aria-label="Close">
                    <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} />
                  </button>
                </div>
              </div>

              <div className="spell-prep-content">
                {loading ? (
                  <div className="spell-prep-loading">
                    <p>Loading spells...</p>
                  </div>
                ) : filteredSpells.length === 0 ? (
                  <div className="spell-prep-empty">
                    <p>{availableSpells.length === 0 ? 'All spells learned!' : 'No spells available at this level'}</p>
                  </div>
                ) : (
                  <div className="spell-prep-list">
                    {filteredSpells.map(spell => (
                      <div
                        key={spell.id}
                        className={`spell-prep-item ${saving ? 'disabled' : ''}`}
                      >
                        <div className="spell-prep-entry">
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

                          <div className="spell-prep-info-row">
                            <div className="spell-prep-col time-col">
                              <span>{parseCastingTime(spell.casting_time).formatted || '--'}</span>
                            </div>
                            <div className="spell-prep-col range-col">
                              <span>{spell.range || '--'}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          className="learn-spell-btn"
                          onClick={() => setConfirmSpell(spell)}
                          disabled={saving}
                          title="Learn this spell"
                        >
                          <img src={spellIconSrc} alt="Learn" />
                        </button>
                      </div>
                    ))}
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

          {/* Confirmation Dialog */}
          {confirmSpell && (
            <div className="learn-spell-confirm-overlay" onClick={() => setConfirmSpell(null)}>
              <div className="learn-spell-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h3 className="confirm-title">Learn {confirmSpell.name}?</h3>
                <div className="confirm-buttons">
                  <button
                    className="confirm-btn confirm-yes"
                    onClick={() => handleLearnSpell(confirmSpell)}
                    disabled={saving}
                  >
                    Yes
                  </button>
                  <button
                    className="confirm-btn confirm-no"
                    onClick={() => setConfirmSpell(null)}
                    disabled={saving}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          )}
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

LearnSpellModal.propTypes = {
  character: PropTypes.object,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSpellLearned: PropTypes.func,
  spellAttackBonus: PropTypes.number,
  spellSaveDC: PropTypes.number,
  spellAbilityMod: PropTypes.number
};

export default LearnSpellModal;
