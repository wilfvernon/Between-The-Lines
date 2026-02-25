import { useState } from 'react';
import PropTypes from 'prop-types';
import StatsInspectorModal from './StatsInspectorModal';

/**
 * AbilityScoreInspector - Ability score specific wrapper for StatsInspectorModal
 * Handles all D&D ability score logic: bonuses, custom modifiers, calculations
 */
function AbilityScoreInspector({
  isOpen,
  onClose,
  ability,
  baseValue = 10,
  bonuses = [],
  customModifiers = [],
  customOverride = null,
  onAddCustomModifier,
  onDeleteCustomModifier,
  onSetCustomOverride
}) {
  const [newSource, setNewSource] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [overrideInput, setOverrideInput] = useState(customOverride !== null ? String(customOverride) : '');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const suffix = '';

  const handleAddModifier = () => {
    if (newSource.trim() && newValue !== '') {
      const value = Number(newValue);
      if (!isNaN(value)) {
        onAddCustomModifier({ source: newSource.trim(), value });
        setNewSource('');
        setNewValue('');
        setShowAddForm(false);
      }
    }
  };

  const handleSetOverride = () => {
    if (overrideInput !== '') {
      const value = Number(overrideInput);
      if (!isNaN(value)) {
        onSetCustomOverride(value);
        setShowOverrideForm(false);
      }
    }
  };

  const handleClearOverride = () => {
    onSetCustomOverride(null);
    setOverrideInput('');
    setShowOverrideForm(false);
  };

  // Calculate totals
  const bonusTotal = bonuses.reduce((sum, bonus) => sum + bonus.value, 0);
  const customModifierTotal = customModifiers.reduce((sum, mod) => sum + mod.value, 0);
  const calculatedValue = customOverride !== null ? customOverride : baseValue + bonusTotal + customModifierTotal;

  // Group bonuses by source
  const groupedBonuses = bonuses.reduce((acc, bonus) => {
    const sourceLabel = typeof bonus.source === 'string' ? bonus.source : bonus.source?.label || 'Unknown';
    if (!acc[sourceLabel]) {
      acc[sourceLabel] = [];
    }
    acc[sourceLabel].push(bonus);
    return acc;
  }, {});

  const content = (
    <>
      {/* Base Value Section */}
      <section className="value-section">
        <div className="value-row base">
          <span className="label">Base Value</span>
          <span className="value">{baseValue}{suffix}</span>
        </div>
      </section>

      {/* Override Section */}
      <section className="override-section">
        <div className="override-header">
          <h3>Override</h3>
          {!showOverrideForm && (
            <button
              className="edit-button"
              onClick={() => {
                setShowOverrideForm(true);
                setOverrideInput(customOverride !== null ? String(customOverride) : '');
              }}
              aria-label={customOverride !== null ? 'Edit override value' : 'Set override value'}
            >
              {customOverride !== null ? 'Edit' : 'Set'}
            </button>
          )}
        </div>

        {/* Display current override */}
        {customOverride !== null && !showOverrideForm && (
          <div className="override-display">
            <span className="override-label">Current Override:</span>
            <span className="override-value">
              {customOverride}{suffix}
            </span>
          </div>
        )}

        {/* Override form */}
        {showOverrideForm && (
          <div className="override-edit">
            <div className="input-group">
              <label htmlFor="override-value-input">Override Value</label>
              <input
                id="override-value-input"
                type="number"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="edit-actions">
              <button className="save-button" onClick={handleSetOverride}>
                Save
              </button>
              {customOverride !== null && (
                <button className="delete-button" onClick={handleClearOverride}>
                  Clear
                </button>
              )}
              <button 
                className="cancel-button" 
                onClick={() => {
                  setShowOverrideForm(false);
                  setOverrideInput('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
            </div>
          ))}
        </section>
      ) : (
        <section className="bonuses-section">
          <p className="no-bonuses">No bonuses applied</p>
        </section>
      )}

      {/* Custom Modifiers Section */}
      <section className="custom-modifier-section">
        <div className="modifier-header">
          <h3>Custom Modifiers</h3>
          {!showAddForm && (
            <button
              className="edit-button"
              onClick={() => setShowAddForm(true)}
              aria-label="Add custom modifier"
            >
              Add
            </button>
          )}
        </div>

        {/* Display existing custom modifiers */}
        {customModifiers.length > 0 && (
          <div className="custom-modifiers-list">
            {customModifiers.map((mod, index) => (
              <div key={index} className="custom-modifier-item">
                <span className="modifier-source">{mod.source}</span>
                <span className="modifier-value">
                  {mod.value > 0 ? '+' : ''}{mod.value}{suffix}
                </span>
                <button
                  type="button"
                  className="delete-modifier-button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDeleteCustomModifier(index);
                  }}
                  aria-label={`Delete ${mod.source}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="modifier-edit">
            <div className="input-group">
              <label htmlFor="modifier-source-input">Source</label>
              <input
                id="modifier-source-input"
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="Source"
              />
            </div>
            <div className="input-group">
              <label htmlFor="modifier-value-input">Value</label>
              <input
                id="modifier-value-input"
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="edit-actions">
              <button className="save-button" onClick={handleAddModifier}>
                Save
              </button>
              <button 
                className="cancel-button" 
                onClick={() => {
                  setShowAddForm(false);
                  setNewSource('');
                  setNewValue('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );

  const footer = (
    <section className="total-section">
      <div className="value-row total">
        <span className="label">Total</span>
        <span className="value">{calculatedValue}{suffix}</span>
      </div>
    </section>
  );

  return (
    <StatsInspectorModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={ability}
      footer={footer}
    >
      {content}
    </StatsInspectorModal>
  );
}

AbilityScoreInspector.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  ability: PropTypes.string.isRequired,
  baseValue: PropTypes.number,
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
  customModifiers: PropTypes.arrayOf(
    PropTypes.shape({
      source: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired
    })
  ),
  customOverride: PropTypes.number,
  onAddCustomModifier: PropTypes.func,
  onDeleteCustomModifier: PropTypes.func,
  onSetCustomOverride: PropTypes.func
};

export default AbilityScoreInspector;
