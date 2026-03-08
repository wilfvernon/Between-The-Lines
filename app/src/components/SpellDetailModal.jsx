import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { renderSpellDescription } from '../lib/spellUtils.jsx';
import './SpellDetailModal.css';

function SpellDetailModal({ spell, isOpen, onClose, spellAttackBonus, spellSaveDC, spellAbilityMod }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  if (!spell || !isOpen) return null;

  const crossIconSrc = '/icons/util/cross.svg';

  const getDamageTypeIcon = (effectType) => {
    if (!effectType) return null;
    
    if (effectType === 'Healing') {
      return new URL('../assets/icons/hp/full.svg', import.meta.url).href;
    } else if (effectType === 'Temp HP') {
      return new URL('../assets/icons/hp/temp.svg', import.meta.url).href;
    } else {
      // Damage type - look for corresponding icon in damage folder
      const damageType = effectType.toLowerCase().replace(/\s+/g, '-');
      return new URL(`../assets/icons/damage/${damageType}.svg`, import.meta.url).href;
    }
  };

  const getSchoolIcon = (school) => {
    if (!school) return null;
    const schoolLower = school.toLowerCase();
    return `/school-symbols/${schoolLower}.png`;
  };

  const effectTypeIcon = getDamageTypeIcon(spell.effect_type);
  const schoolIcon = getSchoolIcon(spell.school);
  const schoolClass = spell.school ? `spell-school-${spell.school.toLowerCase()}` : 'spell-school-none';
  const schoolTexture = spell.school ? `/textures/spell-schools/${spell.school.toLowerCase()}.png` : null;

  // Calculate modifier stacking for damage display
  const explicitModifierCount = Number(spell.add_modifier_count);
  const modifierCount = Number.isFinite(explicitModifierCount)
    ? Math.max(0, explicitModifierCount)
    : (spell.add_modifier ? 1 : 0);
  const totalModifier = spellAbilityMod * modifierCount;
  const hasModifierDamage = modifierCount > 0;

  // Build damage display with additive modifier stacking
  const diceValue = spell.dice?.[0];
  let damageText = null;
  if (diceValue && hasModifierDamage) {
    damageText = `${diceValue} ${totalModifier >= 0 ? '+' : '-'} ${Math.abs(totalModifier)}`;
  } else if (!diceValue && hasModifierDamage) {
    damageText = `${totalModifier}`;
  } else if (diceValue) {
    damageText = diceValue;
  }

  return createPortal(
    <div className="spell-detail-overlay" onClick={onClose}>
      <div
        className={`spell-detail-modal ${schoolClass}`}
        style={schoolTexture ? { '--school-texture': `url(${schoolTexture})` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spell-detail-header">
          <div className="spell-detail-title-row">
            <h2 className="spell-detail-title">{spell.name}</h2>
            <button className="spell-detail-close" onClick={onClose} aria-label="Close">
              <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
            </button>
          </div>
          
          <div className="spell-detail-meta">
            {/* Row 1: School, Level */}
            {spell.school && (
              <div className="spell-meta-item">
                <span className="spell-meta-label">School</span>
                <div className="spell-school-display">
                  {schoolIcon && <img src={schoolIcon} alt={spell.school} className="spell-school-icon" />}
                  <span className="spell-meta-value">{spell.school.charAt(0).toUpperCase() + spell.school.slice(1)}</span>
                </div>
              </div>
            )}
            <div className="spell-meta-item">
              <span className="spell-meta-label">Level</span>
              <span className="spell-meta-value">{spell.level === 0 ? 'Cantrip' : `${spell.level}`}</span>
            </div>
            
            {/* Row 2: Range, Components */}
            {spell.range && (
              <div className="spell-meta-item">
                <span className="spell-meta-label">Range</span>
                <span className="spell-meta-value">{spell.range}</span>
              </div>
            )}
            {spell.components && (
              <div className="spell-meta-item">
                <span className="spell-meta-label">Components</span>
                <span className="spell-meta-value">{spell.components}</span>
              </div>
            )}
            
            {/* Row 3: Casting Time, Duration */}
            {spell.casting_time && (
              <div className="spell-meta-item">
                <span className="spell-meta-label">Casting Time</span>
                <span className="spell-meta-value">{spell.casting_time}</span>
              </div>
            )}
            {spell.duration && (
              <div className="spell-meta-item">
                <span className="spell-meta-label">Duration</span>
                <span className="spell-meta-value">{spell.duration}</span>
              </div>
            )}
          </div>
        </div>

        <div className="spell-detail-content">

          {/* Spell Mechanics Row - only show if at least one value exists */}
          {(spell.is_attack || spell.is_save || (spell.dice && spell.dice.length > 0) || spell.effect_type) && (
            <div className="spell-mechanics-row">
              <div className="spell-mechanic-col mechanic-hitdc">
                {spell.is_attack ? (
                  <span className="mechanic-value">{spellAttackBonus >= 0 ? '+' : ''}{spellAttackBonus}</span>
                ) : spell.is_save ? (
                  <span className="mechanic-value">{spell.save_type || 'Save'} {spellSaveDC}</span>
                ) : (
                  <span className="mechanic-dash">—</span>
                )}
              </div>
              <div className="spell-mechanic-col mechanic-dice">
                {damageText ? (
                  <span className="mechanic-value">{damageText}</span>
                ) : (
                  <span className="mechanic-dash">—</span>
                )}
              </div>
              <div className="spell-mechanic-col mechanic-type">
                {spell.effect_type ? (
                  <span className="mechanic-value">{spell.effect_type}</span>
                ) : (
                  <span className="mechanic-dash">—</span>
                )}
              </div>
            </div>
          )}

          <div className="spell-section">
            <h3 className="spell-section-title">Description</h3>
            <div className="spell-description">
              {renderSpellDescription(spell.description)}
            </div>
          </div>

          {spell.higher_levels && (
            <div className="spell-section">
              <h3 className="spell-section-title">At Higher Levels</h3>
              <div className="spell-higher-levels">
                {renderSpellDescription(spell.higher_levels)}
              </div>
            </div>
          )}




        </div>
      </div>
    </div>,
    document.body
  );
}

SpellDetailModal.propTypes = {
  spell: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string.isRequired,
    level: PropTypes.number,
    school: PropTypes.string,
    casting_time: PropTypes.string,
    range: PropTypes.string,
    components: PropTypes.string,
    duration: PropTypes.string,
    description: PropTypes.string,
    higher_levels: PropTypes.string,
    is_attack: PropTypes.bool,
    is_save: PropTypes.bool,
    save_type: PropTypes.string,
    add_modifier: PropTypes.bool,
    dice: PropTypes.arrayOf(PropTypes.string),
    effect_type: PropTypes.string,
    spell_lists: PropTypes.arrayOf(PropTypes.string),
  }),
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  spellAttackBonus: PropTypes.number,
  spellSaveDC: PropTypes.number,
  spellAbilityMod: PropTypes.number,
};

export default SpellDetailModal;
