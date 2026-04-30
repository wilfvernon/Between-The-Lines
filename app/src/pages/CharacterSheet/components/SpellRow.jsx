import React, { useState, useEffect } from 'react';
import { parseCastingTime } from '../../../lib/spellUtils.jsx';

// Import spell icons
import ritualIcon from '../../../assets/icons/spell/ritual.svg';
import meleeIcon from '../../../assets/icons/combat/melee.svg';
import itemGrantedIcon from '../../../assets/icons/entity/magic-item.svg';

// Import HP icons for healing effects
import fullHPIcon from '../../../assets/icons/hp/full.svg';
import tempHPIcon from '../../../assets/icons/hp/temp.svg';

// Import damage type icons
import acidIcon from '../../../assets/icons/damage/acid.svg';
import bludgeoningIcon from '../../../assets/icons/damage/bludgeoning.svg';
import coldIcon from '../../../assets/icons/damage/cold.svg';
import fireIcon from '../../../assets/icons/damage/fire.svg';
import forceIcon from '../../../assets/icons/damage/force.svg';
import immunityIcon from '../../../assets/icons/damage/immunity.svg';
import lightningIcon from '../../../assets/icons/damage/lightning.svg';
import necroticIcon from '../../../assets/icons/damage/necrotic.svg';
import piercingIcon from '../../../assets/icons/damage/piercing.svg';
import poisonIcon from '../../../assets/icons/damage/poison.svg';
import psychicIcon from '../../../assets/icons/damage/psychic.svg';
import radiantIcon from '../../../assets/icons/damage/radiant.svg';
import resistanceIcon from '../../../assets/icons/damage/resistance.svg';
import slashingIcon from '../../../assets/icons/damage/slashing.svg';
import thunderIcon from '../../../assets/icons/damage/thunder.svg';
import vulnerabilityIcon from '../../../assets/icons/damage/vulnerability.svg';

/**
 * Shared spell row component used by SpellsTab, ActionsTab (bonus actions),
 * and ActionsTab (reactions). Handles all spell display logic.
 */
export default function SpellRow({
  spell,
  castingSpellData = {},
  spellAttackBonus = 0,
  spellSaveDC = 0,
  spellAbilityMod = 0,
  equippedWeapon = null,
  onSpellClick = null,
  className = '',
  castingTimeDisplay = null, // override casting time display (e.g., "Bonus Action" or "Reaction")
  showRitual = true,
  showAlwaysPrepared = true,
  showUpcast = true,
  showRitualOnly = true,
  maxSpellUses = null,
  spellUses = undefined,
  onSpellUsesChange = null
}) {
  if (!spell) return null;

  const getDefaultSpellUses = () => (maxSpellUses && maxSpellUses > 5 ? maxSpellUses : 0);
  const normalizeSpellUses = (value) => {
    if (!maxSpellUses || maxSpellUses <= 0) return 0;
    if (typeof value !== 'number' || Number.isNaN(value)) return getDefaultSpellUses();
    return Math.min(Math.max(value, 0), maxSpellUses);
  };

  const [currentSpellUses, setCurrentSpellUses] = useState(normalizeSpellUses(spellUses));

  useEffect(() => {
    setCurrentSpellUses(normalizeSpellUses(spellUses));
  }, [spellUses, maxSpellUses]);

  const formatCastingTime = (castingTime) => {
    const parsed = parseCastingTime(castingTime);
    return parsed.formatted || 'Action';
  };

  // Build damage/effect display
  let damageDisplay = null;
  const diceValue = spell.dice?.[0];
  const explicitModifierCount = Number(spell.add_modifier_count);
  const modifierCount = Number.isFinite(explicitModifierCount)
    ? Math.max(0, explicitModifierCount)
    : (spell.add_modifier ? 1 : 0);
  const totalModifier = spellAbilityMod * modifierCount;
  const hasModifierDamage = modifierCount > 0;

  if (diceValue?.startsWith('Weapon') && equippedWeapon) {
    // Weapon-based damage
    const extraDice = diceValue === 'Weapon' ? '' : diceValue.substring(6);
    damageDisplay = (
      <div className="spell-damage-display">
        <img 
          src={meleeIcon}
          alt="Melee"
          className="spell-melee-icon"
        />
        {extraDice && <span className="spell-damage">{extraDice}</span>}
      </div>
    );
  } else if (diceValue && !diceValue.includes('d')) {
    // Raw number (no dice)
    damageDisplay = (
      <div className="spell-damage-display">
        <span className="spell-damage">{diceValue}</span>
      </div>
    );
  } else if (!diceValue && hasModifierDamage) {
    // No dice but adds one or more modifier instances
    damageDisplay = (
      <div className="spell-damage-display">
        <span className="spell-damage">{totalModifier}</span>
      </div>
    );
  } else if (diceValue) {
    // Normal dice notation with additive modifier stacking
    const displayValue = hasModifierDamage
      ? `${diceValue} ${totalModifier >= 0 ? '+' : '-'} ${Math.abs(totalModifier)}`
      : diceValue;
    damageDisplay = (
      <div className="spell-damage-display">
        <span className="spell-damage">{displayValue}</span>
      </div>
    );
  } else {
    // No damage
    damageDisplay = <span className="spell-utility">Utility</span>;
  }

  // Get effect type icon
  const damageTypeIconMap = {
    acid: acidIcon,
    bludgeoning: bludgeoningIcon,
    cold: coldIcon,
    fire: fireIcon,
    force: forceIcon,
    immunity: immunityIcon,
    lightning: lightningIcon,
    necrotic: necroticIcon,
    piercing: piercingIcon,
    poison: poisonIcon,
    psychic: psychicIcon,
    radiant: radiantIcon,
    resistance: resistanceIcon,
    slashing: slashingIcon,
    thunder: thunderIcon,
    vulnerability: vulnerabilityIcon,
  };

  const getEffectTypeIcon = () => {
    if (!spell.effect_type) return null;
    
    // Handle special healing cases
    if (spell.effect_type === 'Healing') {
      return fullHPIcon;
    } else if (spell.effect_type === 'Temp HP') {
      return tempHPIcon;
    }
    
    // Handle damage types
    const effectType = spell.effect_type.toLowerCase().replace(/\s+/g, '');
    return damageTypeIconMap[effectType] || null;
  };

  const effectTypeIcon = getEffectTypeIcon();

  const displayCastingTime = castingTimeDisplay || formatCastingTime(spell.casting_time);
  const isRitual = showRitual && parseCastingTime(spell.casting_time).isRitual;
  const alwaysPrepared = showAlwaysPrepared && castingSpellData.always_prepared;
  const isUpcast = showUpcast && castingSpellData.isUpcast;
  const isRitualOnly = showRitualOnly && !castingSpellData.is_prepared && !castingSpellData.always_prepared && !!castingSpellData.ritual_only;
  const isItemGranted = !!castingSpellData.item_granted;
  const itemGrantedSource = castingSpellData?.feat_source || 'Granted by item';

  return (
    <div 
      className={`spell-clickable ${className}`.trim()}
      onClick={onSpellClick}
      role={onSpellClick ? 'button' : undefined}
      tabIndex={onSpellClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSpellClick && e.key === 'Enter') {
          onSpellClick();
        }
      }}
    >
      {/* Spell Name Row */}
      <div className="spell-row spell-name-row">
        <div className="spell-name">
          <h4>{spell.name}</h4>
          {isRitual && (
            <img
              src={ritualIcon}
              alt="Ritual"
              className="spell-ritual-badge"
              title="Ritual"
            />
          )}
          {isItemGranted && (
            <img
              src={itemGrantedIcon}
              alt="Item Granted"
              className="spell-item-source-badge"
              title={`Item Granted: ${itemGrantedSource}`}
            />
          )}
          {alwaysPrepared && <span className="spell-badge">Always Prepared</span>}
          {isRitualOnly && <span className="spell-badge">Ritual Only</span>}
          {isUpcast && <span className="spell-badge upcast">Upcast</span>}
        </div>
        <div className="spell-components">
          {spell.components?.includes('V') && <span className="component-badge">V</span>}
          {spell.components?.includes('S') && <span className="component-badge">S</span>}
          {spell.components?.includes('M') && <span className="component-badge">M</span>}
        </div>
        {maxSpellUses && (
          <SpellUsesTracker
            maxUses={maxSpellUses}
            spellId={castingSpellData.id}
            onUsesChange={onSpellUsesChange}
            storedUses={currentSpellUses}
          />
        )}
      </div>

      {/* Spell Stats Row */}
      <div className="spell-row spell-stats-row">
        <div className="spell-col time-col">
          <div className="spell-time">
            <span>{displayCastingTime}</span>
          </div>
        </div>

        <div className="spell-col range-col">
          <span>{spell.range}</span>
        </div>

        <div className="spell-col hitdc-col">
          {spell.is_attack ? (
            <span className="stat-value">{spellAttackBonus >= 0 ? '+' : ''}{spellAttackBonus}</span>
          ) : spell.is_save ? (
            <span className="stat-value">{spell.save_type || 'Save'} {spellSaveDC}</span>
          ) : (
            <span className="stat-value">--</span>
          )}
        </div>

        <div className="spell-col effect-col">
          {damageDisplay}
        </div>

        <div className="spell-col effect-type-col">
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
  );
}

// Component to display spell uses tracker
function SpellUsesTracker({ maxUses, spellId, onUsesChange, storedUses }) {
  const getDefaultUses = () => (maxUses > 5 ? maxUses : 0);
  const normalizeUses = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return getDefaultUses();
    return Math.min(Math.max(value, 0), maxUses);
  };

  const [currentUses, setCurrentUses] = useState(normalizeUses(storedUses));

  useEffect(() => {
    setCurrentUses(normalizeUses(storedUses));
  }, [storedUses, maxUses]);
  
  if (!maxUses || maxUses <= 0) return null;
  
  const toggleUse = (index, event) => {
    event.stopPropagation();
    const newUses = currentUses === index + 1 ? index : index + 1;
    setCurrentUses(newUses);
    onUsesChange?.(spellId, newUses);
  };

  const spendUse = (event) => {
    event.stopPropagation();
    if (currentUses > 0) {
      const newUses = currentUses - 1;
      setCurrentUses(newUses);
      onUsesChange?.(spellId, newUses);
    }
  };

  const restoreUse = (event) => {
    event.stopPropagation();
    if (currentUses < maxUses) {
      const newUses = currentUses + 1;
      setCurrentUses(newUses);
      onUsesChange?.(spellId, newUses);
    }
  };
  
  // Show counter for 6+ uses, otherwise show clickable boxes
  if (maxUses > 5) {
    return (
      <div className="uses-counter">
        <button 
          className="uses-btn uses-btn-spend"
          onClick={spendUse}
          disabled={currentUses === 0}
          title="Spend a use"
        >
          −
        </button>
        <span className="uses-count">{currentUses}</span>
        <span className="uses-separator">/</span>
        <span className="uses-max">{maxUses}</span>
        <button 
          className="uses-btn uses-btn-restore"
          onClick={restoreUse}
          disabled={currentUses === maxUses}
          title="Restore a use"
        >
          +
        </button>
      </div>
    );
  }
  
  // Show clickable boxes for 1-5 uses
  return (
    <div className="uses-boxes">
      <div className="uses-boxes-grid">
        {Array.from({ length: maxUses }).map((_, idx) => (
          <button
            key={idx}
            className={`use-box ${currentUses > idx ? 'used' : ''}`}
            onClick={(e) => toggleUse(idx, e)}
            title={`Use ${idx + 1}/${maxUses}`}
          />
        ))}
      </div>
    </div>
  );
}
