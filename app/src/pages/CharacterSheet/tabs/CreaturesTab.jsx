import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';

const SPELL_ABILITY_MAP = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
  strength: 'strength',
  dexterity: 'dexterity',
  constitution: 'constitution',
  intelligence: 'intelligence',
  wisdom: 'wisdom',
  charisma: 'charisma'
};

const FORMULA_WRAPPER_REGEX = /^\$\{([\s\S]+)\}$/;
const FORMULA_SUBSTRING_REGEX = /\$\{([^}]+)\}/g;

const evaluateExpression = (expression, variables) => {
  if (!expression || typeof expression !== 'string') return null;

  let compiled = expression;
  Object.entries(variables).forEach(([name, value]) => {
    const safeNumber = Number.isFinite(value) ? value : 0;
    compiled = compiled.replace(new RegExp(`\\b${name}\\b`, 'g'), String(safeNumber));
  });

  if (/\b[a-z_][a-z0-9_]*\b/i.test(compiled)) return null;
  if (!/^[0-9+\-*/().\s]+$/.test(compiled)) return null;

  try {
    const value = Function(`"use strict"; return (${compiled});`)();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const readFormula = (rawValue) => {
  if (rawValue === null || rawValue === undefined) return null;
  const asText = String(rawValue).trim();
  if (!asText) return null;
  const wrapped = asText.match(FORMULA_WRAPPER_REGEX);
  if (wrapped) return wrapped[1].trim();
  return asText.includes('${') ? null : asText;
};

const evaluateFormula = (rawValue, variables) => {
  const formula = readFormula(rawValue);
  if (!formula) return null;
  return evaluateExpression(formula, variables);
};

const interpolateFormulas = (value, variables) => {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const whole = value.match(FORMULA_WRAPPER_REGEX);
    if (whole) {
      const evaluated = evaluateExpression(whole[1].trim(), variables);
      return evaluated !== null ? evaluated : value;
    }

    return value.replace(FORMULA_SUBSTRING_REGEX, (match, expr) => {
      const evaluated = evaluateExpression(String(expr || '').trim(), variables);
      return evaluated !== null ? formatValue(evaluated) : match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((entry) => interpolateFormulas(entry, variables));
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, entry]) => {
      acc[key] = interpolateFormulas(entry, variables);
      return acc;
    }, {});
  }

  return value;
};

const formatValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '');
  }
  const text = String(value).trim();
  return text || null;
};

const resolveDisplayValue = (rawValue, variables) => {
  const evaluated = evaluateFormula(rawValue, variables);
  if (evaluated !== null) {
    return {
      display: formatValue(evaluated)
    };
  }

  return {
    display: formatValue(rawValue)
  };
};

const formatSpeed = (speed) => {
  if (!speed) return null;
  if (typeof speed === 'string') return speed;
  if (typeof speed !== 'object') return null;

  const labels = {
    walk: 'Walk',
    fly: 'Fly',
    swim: 'Swim',
    climb: 'Climb',
    burrow: 'Burrow'
  };

  const parts = Object.entries(speed)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${labels[key] || key}: ${value} ft`);

  return parts.join(', ') || null;
};

const formatKeyValueList = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => `${key.replace(/_/g, ' ')} ${entry >= 0 ? '+' : ''}${entry}`);
    return parts.join(', ') || null;
  }
  return null;
};

const formatArray = (value) => {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.join(', ');
};

const scoreMod = (score) => {
  if (!Number.isFinite(Number(score))) return null;
  return Math.floor((Number(score) - 10) / 2);
};

const renderAccentText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text.includes('*')) return text;

  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, index) => {
    if (!token) return null;
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <span className="creature-accent-strong" key={`token-${index}`}>
          {token.slice(2, -2)}
        </span>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <span className="creature-accent-soft" key={`token-${index}`}>
          {token.slice(1, -1)}
        </span>
      );
    }
    return <span key={`token-${index}`}>{token}</span>;
  });
};

const renderEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  return entries.map((entry, index) => (
    <div className="creature-entry" key={`${entry?.name || 'entry'}-${index}`}>
      <span className="creature-entry-name">{String(entry?.name || 'Feature')}.</span>{' '}
      <span className="creature-entry-text">{renderAccentText(entry?.text || '')}</span>
    </div>
  ));
};

const normalizeBenefits = (rawBenefits) => {
  if (Array.isArray(rawBenefits)) return rawBenefits;
  if (rawBenefits && typeof rawBenefits === 'object') {
    return rawBenefits.type ? [rawBenefits] : [];
  }
  if (typeof rawBenefits === 'string') {
    try {
      const parsed = JSON.parse(rawBenefits);
      return normalizeBenefits(parsed);
    } catch {
      return [];
    }
  }
  return [];
};

const extractMagicItemSummonIds = (magicItem) => {
  if (!magicItem) return [];

  const direct = magicItem.summon_id ? [magicItem.summon_id] : [];
  const benefits = normalizeBenefits(magicItem.benefits ?? magicItem.properties?.benefits ?? magicItem.properties);
  const benefitIds = benefits
    .map((benefit) => benefit?.summon_id)
    .filter(Boolean);

  return [...new Set([...direct, ...benefitIds])];
};

export default function CreaturesTab({ character, proficiencyBonus = 0, derivedMods = {} }) {
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [lookupSummons, setLookupSummons] = useState({});
  const [selectedSummon, setSelectedSummon] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const spellAbilityKey = useMemo(() => {
    const raw = String(character?.spellcasting_ability || 'int').toLowerCase();
    return SPELL_ABILITY_MAP[raw] || 'intelligence';
  }, [character?.spellcasting_ability]);

  const spellMod = useMemo(() => {
    const value = derivedMods?.[spellAbilityKey];
    return Number.isFinite(value) ? value : 0;
  }, [derivedMods, spellAbilityKey]);

  const formulaVariables = useMemo(() => ({
    spellmod: spellMod,
    spellattack: spellMod + (Number.isFinite(proficiencyBonus) ? proficiencyBonus : 0),
    spellsave: 8 + (Number.isFinite(proficiencyBonus) ? proficiencyBonus : 0) + spellMod,
    level: Number(character?.level || 0)

   }), [character?.level, proficiencyBonus, spellMod]);

   // Extended formula variables for bonus action/reaction interpolation
   const extendedFormulaVariables = useMemo(() => {
     const strMod = Math.floor(((character?.strength ?? 10) - 10) / 2);
     const dexMod = Math.floor(((character?.dexterity ?? 10) - 10) / 2);
     const conMod = Math.floor(((character?.constitution ?? 10) - 10) / 2);
     const intMod = Math.floor(((character?.intelligence ?? 10) - 10) / 2);
     const wisMod = Math.floor(((character?.wisdom ?? 10) - 10) / 2);
     const chaMod = Math.floor(((character?.charisma ?? 10) - 10) / 2);

     return {
       ...formulaVariables,
       proficiency: Number.isFinite(proficiencyBonus) ? proficiencyBonus : 0,
       strength: character?.strength ?? 10,
       dexterity: character?.dexterity ?? 10,
       constitution: character?.constitution ?? 10,
       intelligence: character?.intelligence ?? 10,
       wisdom: character?.wisdom ?? 10,
       charisma: character?.charisma ?? 10,
       strength_mod: strMod,
       dexterity_mod: dexMod,
       constitution_mod: conMod,
       intelligence_mod: intMod,
       wisdom_mod: wisMod,
       charisma_mod: chaMod
     };
   }, [
     formulaVariables,
     character?.strength,
     character?.dexterity,
     character?.constitution,
     character?.intelligence,
     character?.wisdom,
     character?.charisma,
     proficiencyBonus
   ]);
  const spellRows = useMemo(() => {
    const spells = Array.isArray(character?.spells) ? character.spells : [];
    return spells
      .filter((entry) => entry?.summon_id)
      .map((entry) => ({
        rowId: `spell-${entry.id || entry.spell_id || entry.summon_id}`,
        sourceType: 'Spell',
        sourceName: entry?.spell?.name || 'Unknown',
        summonId: entry.summon_id,
        summon: entry.summon || null
      }));
  }, [character?.spells]);

  const itemRows = useMemo(() => {
    const inventory = Array.isArray(character?.inventory) ? character.inventory : [];
    const rows = [];

    inventory.forEach((item) => {
      const magicItem = item?.magic_item;
      if (!magicItem) return;

      const summonIds = extractMagicItemSummonIds(magicItem);
      summonIds.forEach((summonId) => {
        rows.push({
          rowId: `item-${item.id}-${summonId}`,
          sourceType: 'Magic Item',
          sourceName: magicItem.name || 'Unknown',
          summonId,
          summon: null
        });
      });
    });

    return rows;
  }, [character?.inventory]);

  const creatureRows = useMemo(() => {
    const combined = [...spellRows, ...itemRows];
    const seen = new Set();

    return combined.filter((row) => {
      const key = `${row.sourceType}:${row.sourceName}:${row.summonId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [spellRows, itemRows]);

  useEffect(() => {
    const unresolvedIds = [...new Set(
      creatureRows
        .filter((row) => !row.summon && row.summonId)
        .map((row) => row.summonId)
    )];

    if (!unresolvedIds.length) {
      setLookupSummons({});
      return;
    }

    let cancelled = false;

    const fetchSummons = async () => {
      const { data, error } = await supabase
        .from('monster_statblocks')
        .select('id, name, size, creature_type, alignment, challenge_rating, armor_class_value, armor_class_notes, hit_points_value, hit_points_formula')
        .in('id', unresolvedIds);

      if (error) {
        console.warn('Failed to load creature rows:', error.message);
        return;
      }

      if (cancelled) return;

      const mapped = (data || []).reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {});
      setLookupSummons(mapped);
    };

    fetchSummons();
    return () => {
      cancelled = true;
    };
  }, [creatureRows]);

  const openSummonModal = async (row) => {
    setSelectedRowId(row.rowId);
    setModalLoading(true);

    try {
      const baseSummon = row.summon || lookupSummons[row.summonId] || null;
      if (!row?.summonId) {
        setSelectedSummon({
          name: row.sourceName || 'Unknown Creature',
          _sourceName: row.sourceName,
          _sourceType: row.sourceType,
          _loadError: 'Missing summon id on this entry.'
        });
        return;
      }

      const { data, error } = await supabase
        .from('monster_statblocks')
        .select('*')
        .eq('id', row.summonId)
        .single();

      if (error) {
        console.warn('Failed to load creature stat block:', error.message);
        setSelectedSummon(
          baseSummon
            ? { ...baseSummon, _sourceName: row.sourceName, _sourceType: row.sourceType, _loadError: error.message }
            : {
                name: row.sourceName || 'Unknown Creature',
                _sourceName: row.sourceName,
                _sourceType: row.sourceType,
                _loadError: error.message
              }
        );
      } else {
        setSelectedSummon({ ...(baseSummon || {}), ...(data || {}), _sourceName: row.sourceName, _sourceType: row.sourceType });
      }
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedSummon(null);
    setModalLoading(false);
  };

  const isModalOpen = Boolean(selectedSummon || modalLoading);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isModalOpen]);

  const computedSummon = useMemo(
    () => interpolateFormulas(selectedSummon, formulaVariables),
    [selectedSummon, formulaVariables]
   );
   const computedSummonExtended = useMemo(
     () => interpolateFormulas(selectedSummon, extendedFormulaVariables),
     [selectedSummon, extendedFormulaVariables]
   );
   const modalAC = resolveDisplayValue(computedSummonExtended?.armor_class_value, extendedFormulaVariables).display;
   const modalHP = resolveDisplayValue(computedSummonExtended?.hit_points_value, extendedFormulaVariables).display;

  return (
    <div className="creatures-tab">
      <h2>Creatures & Companions</h2>

      {creatureRows.length === 0 ? (
        <p className="info-text">No creature summons found from spells or magic items.</p>
      ) : (
        <div className="feature-subtab-content">
          <div className="creatures-container">
            {creatureRows.map((row) => {
              const summon = row.summon || lookupSummons[row.summonId] || null;
               const computedRowSummon = interpolateFormulas(summon, extendedFormulaVariables);
               const creatureName = computedRowSummon?.name || `Unknown Creature (${row.summonId})`;
               const subtitle = computedRowSummon
                 ? `${computedRowSummon.size || ''} ${computedRowSummon.creature_type || ''}`.trim()
                 : 'Stat block not loaded';
               const acInfo = resolveDisplayValue(computedRowSummon?.armor_class_value, extendedFormulaVariables);
               const hpInfo = resolveDisplayValue(computedRowSummon?.hit_points_value, extendedFormulaVariables);
              const acText = acInfo.display ? `AC ${acInfo.display}` : null;
              const hpText = hpInfo.display ? `HP ${hpInfo.display}` : null;
              const metaPieces = [acText, hpText].filter(Boolean);

              return (
                <button
                  key={row.rowId}
                  type="button"
                  className={`feature-item creature-row-card${selectedRowId === row.rowId ? ' is-selected' : ''}`}
                  onClick={() => openSummonModal(row)}
                  title="Open creature stat block"
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{creatureName}</h3>
                    <span className="feature-source">{row.sourceName}</span>
                  </div>
                  <div className="creature-row-subtitle">
                    {subtitle}{computedRowSummon?.challenge_rating ? ` • CR ${computedRowSummon.challenge_rating}` : ''}
                  </div>
                  {metaPieces.length > 0 && (
                    <div className="creature-row-meta">
                      {metaPieces.join(' • ')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isModalOpen && createPortal(
        <div className="creature-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="creature-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="creature-modal-close" onClick={closeModal} aria-label="Close creature stat block">
              &times;
            </button>

            {modalLoading && !selectedSummon ? (
              <p className="info-text">Loading creature stat block...</p>
            ) : (
              <>
                <header className="creature-modal-header">
                  <h3 className="creature-modal-title">{computedSummon?.name || 'Unknown Creature'}</h3>
                  <div className="creature-modal-meta">
                    <p className="creature-modal-subtitle">
                      {computedSummon?.size || ''} {computedSummon?.creature_type || ''}{computedSummon?.alignment ? `, ${computedSummon.alignment}` : ''}
                    </p>
                    <p className="creature-modal-source">
                      {computedSummon?._sourceName || 'Unknown'}
                    </p>
                  </div>
                  {computedSummon?._loadError && (
                    <p className="creature-modal-warning">{computedSummon._loadError}</p>
                  )}
                </header>

                <div className="creature-statblock">
                  <div className="creature-core-lines">
                    <p className="creature-stat-line">
                      <strong>Armour Class:</strong> {modalAC || '-'}{computedSummon?.armor_class_notes ? ` (${computedSummon.armor_class_notes})` : ''}
                    </p>
                    <p className="creature-stat-line">
                      <strong>Hit Points:</strong> {modalHP || '-'}{computedSummon?.hit_points_formula ? ` (${computedSummon.hit_points_formula})` : ''}
                    </p>
                    <p className="creature-stat-line">
                      <strong>Speed:</strong> {formatSpeed(computedSummon?.speed) || '-'}
                    </p>
                    <p className="creature-stat-line">
                      <strong>Challenge:</strong> {computedSummon?.challenge_rating || '-'}
                    </p>
                  </div>

                  <div className="creature-ability-grid">
                    {[
                      ['STR', 'strength'],
                      ['DEX', 'dexterity'],
                      ['CON', 'constitution'],
                      ['INT', 'intelligence'],
                      ['WIS', 'wisdom'],
                      ['CHA', 'charisma']
                    ].map(([label, abilityKey]) => {
                      const score = computedSummon?.[abilityKey];
                      const mod = scoreMod(score);
                      return (
                        <div key={label} className={`creature-ability-cell ${abilityKey}`}>
                          <div className="creature-ability-label">{label}</div>
                          <div className="creature-ability-score">{score ?? '-'}</div>
                          <div className="creature-ability-mod">{mod === null ? '-' : `(${mod >= 0 ? '+' : ''}${mod})`}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="creature-detail-lines">
                    <p className="creature-stat-line"><strong>Saving Throws:</strong> {formatKeyValueList(computedSummon?.saving_throws) || '-'}</p>
                    <p className="creature-stat-line"><strong>Skills:</strong> {formatKeyValueList(computedSummon?.skills) || '-'}</p>
                    <p className="creature-stat-line"><strong>Senses:</strong> {computedSummon?.senses?.text || formatArray(computedSummon?.senses?.parsed) || '-'}</p>
                    <p className="creature-stat-line"><strong>Languages:</strong> {formatArray(computedSummon?.languages) || '-'}</p>
                  </div>

                  <div className="creature-modal-sections">
                    {computedSummon?.traits?.length > 0 && (
                      <section className="creature-section">
                        <h4>Traits</h4>
                        {renderEntries(computedSummon.traits)}
                      </section>
                    )}

                    {computedSummon?.actions?.length > 0 && (
                      <section className="creature-section">
                        <h4>Actions</h4>
                        {renderEntries(computedSummon.actions)}
                      </section>
                    )}

                    {computedSummon?.bonus_actions?.length > 0 && (
                      <section className="creature-section">
                        <h4>Bonus Actions</h4>
                        {renderEntries(computedSummon.bonus_actions)}
                      </section>
                    )}

                    {computedSummon?.reactions?.length > 0 && (
                      <section className="creature-section">
                        <h4>Reactions</h4>
                        {renderEntries(computedSummon.reactions)}
                      </section>
                    )}

                    {(computedSummon?.legendary_actions_intro || computedSummon?.legendary_actions?.length > 0) && (
                      <section className="creature-section">
                        <h4>Legendary Actions</h4>
                        {computedSummon?.legendary_actions_intro && (
                          <p className="creature-entry">{renderAccentText(computedSummon.legendary_actions_intro)}</p>
                        )}
                        {renderEntries(computedSummon?.legendary_actions)}
                      </section>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
