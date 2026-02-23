import { useState } from 'react';
import PropTypes from 'prop-types';
import './StatsInspectorModal.css';

/**
 * StatsInspectorModal - Displays detailed breakdown of a stat
 * Shows base value, all bonuses with sources, current total, and allows custom modifiers
 * Used for: ability scores, skills, AC, initiative, senses, speeds, etc.
 */
function StatsInspectorModal({
  isOpen,
  onClose,
  statName,
  baseValue,
  currentValue,
  bonuses = [],
  customModifier = 0,
  onCustomModifierChange,
  suffix = ''
}) {
  const [tempCustomModifier, setTempCustomModifier] = useState(customModifier);
  const [editMode, setEditMode] = useState(false);
  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;

  if (!isOpen) return null;

  // Calculate totals
  const bonusTotal = bonuses.reduce((sum, bonus) => sum + bonus.value, 0);
  const calculatedValue = baseValue + bonusTotal + tempCustomModifier;

  const handleSaveCustomModifier = () => {
    if (onCustomModifierChange) {
      onCustomModifierChange(tempCustomModifier);
    }
    setEditMode(false);
  };

  const handleCancel = () => {
    setTempCustomModifier(customModifier);
    setEditMode(false);
  };

  // Group bonuses by source for better organization
  const groupedBonuses = bonuses.reduce((acc, bonus) => {
    const sourceLabel = typeof bonus.source === 'string' ? bonus.source : bonus.source?.label || 'Unknown';
    if (!acc[sourceLabel]) {
      acc[sourceLabel] = [];
    }
    acc[sourceLabel].push(bonus);
    return acc;
  }, {});

  return (
    <div className="stats-inspector-overlay" onClick={onClose}>
      <div className="stats-inspector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inspector-header">
          <h2>{statName}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
          </button>
        </div>

        <div className="inspector-content">
          {/* Base Value Section */}
          <section className="value-section">
            <div className="value-row base">
              <span className="label">Base Value</span>
              <span className="value">{baseValue}{suffix}</span>
            </div>
          </section>

          {/* Bonuses Section */}
          {bonuses.length > 0 ? (
            <section className="bonuses-section">
              <h3>Bonuses & Modifiers</h3>
              {Object.entries(groupedBonuses).map(([source, sourceBonuses]) => (
                <div key={source} className="bonus-group">
                  <div className="bonus-source">
                    <span className="source-label">{source}</span>
                    <span className="source-total">
                      {sourceBonuses.reduce((sum, b) => sum + b.value, 0) > 0 ? '+' : ''}
                      {sourceBonuses.reduce((sum, b) => sum + b.value, 0)}{suffix}
                    </span>
                  </div>
                  <div className="bonus-details">
                    {sourceBonuses.map((bonus, idx) => (
                      <div key={idx} className="bonus-item">
                        <span className="bonus-name">{bonus.name || '—'}</span>
                        <span className={`bonus-value ${bonus.value >= 0 ? 'positive' : 'negative'}`}>
                          {bonus.value > 0 ? '+' : ''}{bonus.value}{suffix}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section className="bonuses-section">
              <p className="no-bonuses">No bonuses applied</p>
            </section>
          )}

          {/* Custom Modifier Section */}
          <section className="custom-modifier-section">
            <div className="modifier-header">
              <h3>Custom Modifier</h3>
              {!editMode && (
                <button
                  className="edit-button"
                  onClick={() => setEditMode(true)}
                  aria-label="Edit custom modifier"
                >
                  Edit
                </button>
              )}
            </div>
            {editMode ? (
              <div className="modifier-edit">
                <div className="input-group">
                  <label htmlFor="custom-modifier-input">Modifier Value</label>
                  <input
                    id="custom-modifier-input"
                    type="number"
                    value={tempCustomModifier}
                    onChange={(e) => setTempCustomModifier(Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
                <div className="edit-actions">
                  <button className="save-button" onClick={handleSaveCustomModifier}>
                    Save
                  </button>
                  <button className="cancel-button" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="modifier-display">
                <span className="label">Value</span>
                <span className={`value ${tempCustomModifier >= 0 ? 'positive' : 'negative'}`}>
                  {tempCustomModifier > 0 ? '+' : ''}{tempCustomModifier}{suffix}
                </span>
              </div>
            )}
          </section>

          {/* Total Section */}
          <section className="total-section">
            <div className="calculation">
              <span className="calc-label">
                {baseValue}{suffix}
                {bonusTotal !== 0 && (
                  <>
                    {bonusTotal > 0 ? ' + ' : ' '}{bonusTotal}{suffix}
                  </>
                )}
                {tempCustomModifier !== 0 && (
                  <>
                    {tempCustomModifier > 0 ? ' + ' : ' '}{tempCustomModifier}{suffix}
                  </>
                )}
              </span>
            </div>
            <div className="value-row total">
              <span className="label">Total</span>
              <span className="value">{calculatedValue}{suffix}</span>
            </div>
          </section>

          {/* Current Value (if different from calculated) */}
          {currentValue !== undefined && currentValue !== calculatedValue && (
            <section className="warning-section">
              <p className="warning">
                ⚠ Current value ({currentValue}{suffix}) differs from calculated total ({calculatedValue}{suffix})
              </p>
            </section>
          )}
        </div>

        <div className="inspector-footer">
          <button className="close-modal-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

StatsInspectorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  statName: PropTypes.string.isRequired,
  baseValue: PropTypes.number.isRequired,
  currentValue: PropTypes.number,
  bonuses: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number.isRequired,
      source: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({
          label: PropTypes.string,
          type: PropTypes.string
        })
      ]),
      name: PropTypes.string
    })
  ),
  customModifier: PropTypes.number,
  onCustomModifierChange: PropTypes.func,
  suffix: PropTypes.string
};

export default StatsInspectorModal;
