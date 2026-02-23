import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { collectBonuses, deriveCharacterStats } from '../lib/bonusEngine';
import { useAuth } from '../context/AuthContext';
import { useCharacter } from '../hooks/useCharacter';
import StatsInspectorModal from '../components/StatsInspectorModal';
import './CharacterSheet.css';

// Helper to convert ability score improvements to bonus format
const convertAbilityScoresToBonuses = (improvements = []) => {
  const abilityAbbrevToLower = {
    'STR': 'strength',
    'DEX': 'dexterity',
    'CON': 'constitution',
    'INT': 'intelligence',
    'WIS': 'wisdom',
    'CHA': 'charisma'
  };

  return improvements.flatMap(improvement => {
    const sourceLabel = `${improvement.source}${improvement.sourceType ? ` - ${improvement.sourceType}` : ''}`;
    return (improvement.abilities || []).map(abilityStr => {
      // Parse "CHA: 2" or "WIS: 1"
      const [abbr, valueStr] = abilityStr.split(':').map(s => s.trim());
      const ability = abilityAbbrevToLower[abbr.toUpperCase()];
      const value = parseInt(valueStr, 10);

      if (!ability || isNaN(value)) return null;

      return {
        target: `ability.${ability}`,
        value,
        source: { label: sourceLabel, type: 'ability-score-improvement' }
      };
    }).filter(Boolean);
  });
};

// Helper to get bonuses for a specific ability
const getAbilityBonuses = (allBonuses = [], abilityName) => {
  const targetKey = `ability.${abilityName}`;
  return allBonuses.filter(bonus => bonus.target === targetKey);
};

function CharacterSheet() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'admin@candlekeep.sc';

  const {
    character,
    characters,
    selectedCharacterId,
    setSelectedCharacterId,
    loading,
    relatedLoading,
    error
  } = useCharacter({ user, isAdmin });
  const [activeTab, setActiveTab] = useState('abilities'); // abilities, skills, spells, inventory, features

  // HP management state
  const [currentHP, setCurrentHP] = useState(null);
  const [tempHP, setTempHP] = useState(0);
  const [maxHPModifier, setMaxHPModifier] = useState(0);
  const [isHPModalOpen, setIsHPModalOpen] = useState(false);
  const [damageInput, setDamageInput] = useState('');
  const [isPortraitHighlighted, setIsPortraitHighlighted] = useState(true);

  // Stats Inspector Modal state
  const [inspectorState, setInspectorState] = useState({
    isOpen: false,
    selectedAbility: null,
    customModifiers: {}
  });

  // Initialize current HP when character loads
  useEffect(() => {
    if (!character?.id) return;

    // Try to load saved HP state from localStorage (persists across sessions/logout/app close)
    const savedHPState = localStorage.getItem(`hp_state_${character.id}`);
    if (savedHPState) {
      try {
        const { currentHP: savedCurrent, tempHP: savedTemp, maxHPModifier: savedModifier } = JSON.parse(savedHPState);
        setCurrentHP(savedCurrent);
        setTempHP(savedTemp ?? 0);
        setMaxHPModifier(savedModifier ?? 0);
        return;
      } catch (e) {
        console.error('Failed to parse saved HP state:', e);
      }
    }

    // Otherwise initialize from character data
    if (character?.current_hp !== undefined) {
      setCurrentHP(character.current_hp);
    } else if (character?.max_hp) {
      setCurrentHP(character.max_hp);
    }
    setTempHP(0);
    setMaxHPModifier(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  // Save HP state to localStorage whenever it changes (persists across sessions)
  useEffect(() => {
    if (!character?.id || currentHP === null) return;

    const hpState = {
      currentHP,
      tempHP,
      maxHPModifier
    };
    localStorage.setItem(`hp_state_${character.id}`, JSON.stringify(hpState));
  }, [character?.id, currentHP, tempHP, maxHPModifier]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isHPModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isHPModalOpen]);

  // Handle character selection (admin only)
  const handleCharacterChange = async (characterId) => {
    try {
      setSelectedCharacterId(characterId);
    } catch (err) {
      console.error('Error selecting character:', err);
    }
  };

  if (loading) {
    return (
      <div className="route-loading">
        <img src="/crest.png" alt="" className="loading-crest" />
        <span className="loading-text">Loading character sheet...</span>
      </div>
    );
  }

  if (error) {
    return <div className="page-container"><p className="error-message">❌ {error}</p></div>;
  }

  if (!character) {
    return (
      <div className="page-container">
        <h1>Character Sheet</h1>
        <p>{isAdmin ? 'No characters found' : 'You have no character yet. Ask an admin to import your character.'}</p>
      </div>
    );
  }

  const skills = character.skills || [];
  const spells = character.spells || [];

  const proficiencyBonus = Math.ceil(character.level / 4) + 1;
  const abilityModifier = (score) => Math.floor((score - 10) / 2);

  const baseAbilities = {
    strength: character.strength,
    dexterity: character.dexterity,
    constitution: character.constitution,
    intelligence: character.intelligence,
    wisdom: character.wisdom,
    charisma: character.charisma
  };

  const baseMods = {
    strength: abilityModifier(baseAbilities.strength),
    dexterity: abilityModifier(baseAbilities.dexterity),
    constitution: abilityModifier(baseAbilities.constitution),
    intelligence: abilityModifier(baseAbilities.intelligence),
    wisdom: abilityModifier(baseAbilities.wisdom),
    charisma: abilityModifier(baseAbilities.charisma)
  };

  // Collect bonuses from items, features, and character overrides
  const bonusList = collectBonuses({
    items: character.items || [],
    features: character.features || [],
    overrides: character.bonuses || []
  });

  // Add ability score improvements (ASIs) as bonuses
  const abilityScoreBonuses = convertAbilityScoresToBonuses(character.ability_score_improvements || []);
  const allBonuses = [...bonusList, ...abilityScoreBonuses];

  // Derive character stats using bonus engine:
  // - Applies ability score bonuses (from items, ASIs, features, etc.)
  // - Recalculates ability modifiers based on final scores
  // - Derives AC, initiative, HP, senses, and speeds with bonuses applied
  // - Tracks bonus sources for tooltips/information display
  const { derived: derivedStats } = deriveCharacterStats({
    base: {
      abilities: baseAbilities,
      maxHP: character.max_hp || 0,
      proficiency: proficiencyBonus,
      acBase: 10 + baseMods.dexterity,
      initiativeBase: baseMods.dexterity,
      passivePerceptionBase: 10 + baseMods.wisdom,
      senses: character.senses || [],
      speeds: character.speeds || { walk: character.speed }
    },
    bonuses: allBonuses
  });

  const strMod = derivedStats.modifiers.strength;
  const dexMod = derivedStats.modifiers.dexterity;
  const conMod = derivedStats.modifiers.constitution;
  const intMod = derivedStats.modifiers.intelligence;
  const wisMod = derivedStats.modifiers.wisdom;
  const chaMod = derivedStats.modifiers.charisma;

  const ac = derivedStats.ac; // Simplified for now (no armor)
  const initiative = derivedStats.initiative;
  const conditions = (character.conditions || []).map((condition) => (
    typeof condition === 'string' ? { name: condition } : condition
  ));

  return (
    <div className="character-sheet">
      {/* Admin Character Selector */}
      {isAdmin && characters.length > 0 && (
        <div className="admin-selector">
          <label>Character:</label>
          <select value={selectedCharacterId} onChange={(e) => handleCharacterChange(e.target.value)}>
            {characters.map(char => (
              <option key={char.id} value={char.id}>
                {char.name} (Lvl {char.level})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sticky Header - Parchment Tab */}
      <div className="sticky-header">
        <div className="sticky-header-content">
          <div className="header-left">
            {character.image_url && (
              <div className="character-portrait">
                <button
                  type="button"
                  className={`portrait-toggle ${isPortraitHighlighted ? 'is-highlighted' : 'is-muted'}`}
                  onClick={() => setIsPortraitHighlighted((prev) => !prev)}
                  aria-pressed={isPortraitHighlighted}
                  aria-label="Toggle portrait highlight"
                >
                  <img src={character.image_url} alt={character.name} />
                </button>
              </div>
            )}
            <div className="character-name-level">
              <span className="char-name">{character.full_name || character.name}</span>
              <span className="char-level">
                Lvl {character.level} {character.classes.map(c => `${c.class}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ')}
              </span>
              <div className="character-conditions clickable-underline">
                <span className="conditions-label">Conditions:</span>
                {conditions.length > 0 ? (
                  <div className="conditions-icons">
                    {conditions.map((condition) => (
                      condition.icon ? (
                        <img
                          key={condition.name}
                          src={condition.icon}
                          alt={condition.name}
                          className="condition-icon"
                          title={condition.name}
                        />
                      ) : (
                        <span key={condition.name} className="condition-text">{condition.name}</span>
                      )
                    ))}
                  </div>
                ) : (
                  <span className="conditions-empty">None</span>
                )}
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="header-stats-compact">
              <div className="stat-compact hp">
                <span 
                  className="stat-value-compact hp-clickable clickable-underline" 
                  onClick={() => setIsHPModalOpen(true)}
                  title="Click to edit HP"
                >
                  <span className="hp-clickable-label">HP:</span>
                  <span className="hp-value-current">
                    {currentHP !== null ? currentHP : character.max_hp}
                  </span>
                  <span className="hp-total-separator">/</span>
                  <span className={maxHPModifier !== 0 ? 'hp-value-mod' : 'hp-value-current'}>
                    {character.max_hp + maxHPModifier}
                  </span>
                  {tempHP > 0 && (
                    <span className="hp-value-temp">+{tempHP}</span>
                  )}
                </span>
              </div>
              <div className="stat-row">
                <div className="stat-compact ac clickable-underline">
                  <span className="stat-label-compact">AC:</span>
                  <span className="stat-value-compact">{ac}</span>
                </div>
                <div className="stat-compact init clickable-underline">
                  <span className="stat-label-compact">Init:</span>
                  <span className="stat-value-compact">{initiative >= 0 ? '+' : ''}{initiative}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={activeTab === 'abilities' ? 'tab-btn abilities active' : 'tab-btn abilities'}
          onClick={() => setActiveTab('abilities')}
          aria-label="Abilities"
          title="Abilities"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3v18h18" />
            <path d="M7 17V9" />
            <path d="M12 17V5" />
            <path d="M17 17v-7" />
          </svg>
        </button>
        <button
          className={activeTab === 'skills' ? 'tab-btn skills active' : 'tab-btn skills'}
          onClick={() => setActiveTab('skills')}
          aria-label="Skills"
          title="Skills"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 21 15.75 15.75" />
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
          </svg>
        </button>
        <button
          className={activeTab === 'spells' ? 'tab-btn spells active' : 'tab-btn spells'}
          onClick={() => setActiveTab('spells')}
          aria-label="Spells"
          title="Spells"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.813 15.904 9 18l-.813-2.096a4.5 4.5 0 0 0-2.924-2.924L3.167 12l2.096-.813a4.5 4.5 0 0 0 2.924-2.924L9 6l.813 2.096a4.5 4.5 0 0 0 2.924 2.924L14.833 12l-2.096.813a4.5 4.5 0 0 0-2.924 2.924Z" />
            <path d="M18.75 4.5 19.5 6l1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5ZM18.75 15l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5Z" />
          </svg>
        </button>
        <button
          className={activeTab === 'inventory' ? 'tab-btn inventory active' : 'tab-btn inventory'}
          onClick={() => setActiveTab('inventory')}
          aria-label="Inventory"
          title="Inventory"
        >
          <span className="tab-icon tab-icon-sword" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'features' ? 'tab-btn features active' : 'tab-btn features'}
          onClick={() => setActiveTab('features')}
          aria-label="Features"
          title="Features"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
          </svg>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'abilities' && (
          <AbilitiesTab
            character={character}
            strMod={strMod}
            dexMod={dexMod}
            conMod={conMod}
            intMod={intMod}
            wisMod={wisMod}
            chaMod={chaMod}
            proficiencyBonus={proficiencyBonus}
            skills={skills}
            derivedStats={derivedStats}
            allBonuses={allBonuses}
            getAbilityBonuses={getAbilityBonuses}
            inspectorState={inspectorState}
            setInspectorState={setInspectorState}
            baseAbilities={baseAbilities}
          />
        )}
        {activeTab === 'skills' && (
          <SkillsTab
            character={character}
            proficiencyBonus={proficiencyBonus}
            skills={skills}
            loading={relatedLoading}
          />
        )}
        {activeTab === 'spells' && <SpellsTab character={character} spells={spells} loading={relatedLoading} />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'features' && <FeaturesTab character={character} />}
      </div>

      {/* HP Editing Modal */}
      {isHPModalOpen && (
        <HPEditModal
          currentHP={currentHP}
          setCurrentHP={setCurrentHP}
          tempHP={tempHP}
          setTempHP={setTempHP}
          maxHPModifier={maxHPModifier}
          setMaxHPModifier={setMaxHPModifier}
          maxHP={character.max_hp}
          damageInput={damageInput}
          setDamageInput={setDamageInput}
          isOpen={isHPModalOpen}
          onClose={() => setIsHPModalOpen(false)}
        />
      )}

      {/* Stats Inspector Modal */}
      <StatsInspectorModal
        isOpen={inspectorState.isOpen}
        onClose={() => setInspectorState({ ...inspectorState, isOpen: false })}
        statName={inspectorState.selectedAbility?.name || ''}
        baseValue={inspectorState.selectedAbility?.baseValue || 0}
        currentValue={inspectorState.selectedAbility?.totalValue || 0}
        bonuses={inspectorState.selectedAbility?.bonuses || []}
        customModifier={inspectorState.customModifiers[inspectorState.selectedAbility?.key] || 0}
        onCustomModifierChange={(value) => {
          setInspectorState(prev => ({
            ...prev,
            customModifiers: {
              ...prev.customModifiers,
              [prev.selectedAbility?.key]: value
            }
          }));
        }}
      />
    </div>
  );
}

// Tab 1: Abilities, Saves, Passive Skills, Senses
function AbilitiesTab({ character, strMod, dexMod, conMod, intMod, wisMod, chaMod, proficiencyBonus, skills, derivedStats, allBonuses, getAbilityBonuses, inspectorState, setInspectorState, baseAbilities }) {
  const abilities = [
    { name: 'Strength', abbr: 'STR', score: derivedStats?.abilities?.strength || character.strength, mod: strMod, save: character.save_strength },
    { name: 'Dexterity', abbr: 'DEX', score: derivedStats?.abilities?.dexterity || character.dexterity, mod: dexMod, save: character.save_dexterity },
    { name: 'Constitution', abbr: 'CON', score: derivedStats?.abilities?.constitution || character.constitution, mod: conMod, save: character.save_constitution },
    { name: 'Intelligence', abbr: 'INT', score: derivedStats?.abilities?.intelligence || character.intelligence, mod: intMod, save: character.save_intelligence },
    { name: 'Wisdom', abbr: 'WIS', score: derivedStats?.abilities?.wisdom || character.wisdom, mod: wisMod, save: character.save_wisdom },
    { name: 'Charisma', abbr: 'CHA', score: derivedStats?.abilities?.charisma || character.charisma, mod: chaMod, save: character.save_charisma },
  ];

  const abilityNameToKey = {
    'Strength': 'strength',
    'Dexterity': 'dexterity',
    'Constitution': 'constitution',
    'Intelligence': 'intelligence',
    'Wisdom': 'wisdom',
    'Charisma': 'charisma'
  };

  const handleAbilityClick = (ability) => {
    const abilityKey = abilityNameToKey[ability.name];
    const bonuses = getAbilityBonuses(allBonuses, abilityKey);

    setInspectorState({
      ...inspectorState,
      isOpen: true,
      selectedAbility: {
        name: ability.name,
        key: abilityKey,
        baseValue: baseAbilities[abilityKey] || 10,
        totalValue: ability.score,
        bonuses: bonuses
      }
    });
  };

  const skillLookup = (skills || []).reduce((acc, skill) => {
    acc[skill.skill_name] = skill;
    return acc;
  }, {});

  const hasPassiveAdvantage = (skillName) => {
    if (character?.passive_advantage_all) return true;
    const advantageList = character?.passive_advantage_skills || character?.passive_advantages || [];
    if (Array.isArray(advantageList) && advantageList.includes(skillName)) return true;
    if (character?.passive_advantage && typeof character.passive_advantage === 'object') {
      return Boolean(character.passive_advantage[skillName]);
    }
    return false;
  };

  const passiveSkillValue = (skillName, baseMod) => {
    const skillEntry = skillLookup[skillName];
    const isProficient = !!skillEntry;
    const isExpertise = skillEntry?.expertise || false;
    let bonus = baseMod;
    if (isExpertise) {
      bonus += proficiencyBonus * 2;
    } else if (isProficient) {
      bonus += proficiencyBonus;
    }
    const advantageBonus = hasPassiveAdvantage(skillName) ? 5 : 0;
    return 10 + bonus + advantageBonus;
  };

  const senses = Array.isArray(derivedStats?.senses) ? derivedStats.senses : (Array.isArray(character?.senses) ? character.senses : []);
  const speeds = derivedStats?.speeds && typeof derivedStats.speeds === 'object'
    ? derivedStats.speeds
    : (character?.speeds && typeof character.speeds === 'object'
      ? character.speeds
      : { walk: character?.speed });

  return (
    <div className="abilities-tab">
      <section className="section">
        <h2>Ability Scores</h2>
        <div className="abilities-grid">
          {abilities.map(ability => (
            <div
              key={ability.name}
              className="ability-card"
              onClick={() => handleAbilityClick(ability)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAbilityClick(ability);
                }
              }}
            >
              <span className="ability-name">{ability.name}</span>
              <div className="ability-values">
                <span className="ability-score">{ability.score}</span>
                <span className={`ability-modifier ${ability.mod >= 0 ? 'positive' : 'negative'}`}>
                  {ability.mod >= 0 ? '+' : ''}{ability.mod}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Saving Throws</h2>
        <div className="saves-list">
          {[
            abilities[0],
            abilities[3],
            abilities[1],
            abilities[4],
            abilities[2],
            abilities[5]
          ].map((ability) => {
            const saveBonus = ability.mod + (ability.save ? proficiencyBonus : 0);
            return (
              <div key={ability.abbr} className="save-item">
                <span className={ability.save ? 'proficient' : ''}>
                  {ability.save && '● '}{ability.name}
                </span>
                <span className="save-bonus">{saveBonus >= 0 ? '+' : ''}{saveBonus}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Passive Skills</h2>
        <div className="passive-list">
          <div className="passive-item">
            <span>Passive Perception</span>
            <span className="passive-value">{passiveSkillValue('Perception', wisMod)}</span>
          </div>
          <div className="passive-item">
            <span>Passive Insight</span>
            <span className="passive-value">{passiveSkillValue('Insight', wisMod)}</span>
          </div>
          <div className="passive-item">
            <span>Passive Investigation</span>
            <span className="passive-value">{passiveSkillValue('Investigation', intMod)}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Senses & Speed</h2>
        <div className="passive-list">
          {senses.length > 0 && (
            senses.map((sense) => (
              <div key={`${sense.sense_type}-${sense.range}`} className="passive-item">
                <span>{sense.sense_type?.replace(/(^.|\s.)/g, (m) => m.toUpperCase())}</span>
                <span className="passive-value">{sense.range} ft</span>
              </div>
            ))
          )}
          {Object.entries(speeds).filter(([, value]) => value).map(([type, value]) => (
            <div key={type} className="passive-item">
              <span>{type === 'walk' ? 'Walking Speed' : `${type.charAt(0).toUpperCase()}${type.slice(1)} Speed`}</span>
              <span className="passive-value">{value} ft</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Tab 2: Skills
function SkillsTab({ character, proficiencyBonus, skills: characterSkills, loading }) {
  const abilityModifier = (score) => Math.floor((score - 10) / 2);
  const skillSlug = (name) => name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  
  const allSkills = [
    { name: 'Acrobatics', ability: 'DEX', mod: abilityModifier(character.dexterity) },
    { name: 'Animal Handling', ability: 'WIS', mod: abilityModifier(character.wisdom) },
    { name: 'Arcana', ability: 'INT', mod: abilityModifier(character.intelligence) },
    { name: 'Athletics', ability: 'STR', mod: abilityModifier(character.strength) },
    { name: 'Deception', ability: 'CHA', mod: abilityModifier(character.charisma) },
    { name: 'History', ability: 'INT', mod: abilityModifier(character.intelligence) },
    { name: 'Insight', ability: 'WIS', mod: abilityModifier(character.wisdom) },
    { name: 'Intimidation', ability: 'CHA', mod: abilityModifier(character.charisma) },
    { name: 'Investigation', ability: 'INT', mod: abilityModifier(character.intelligence) },
    { name: 'Medicine', ability: 'WIS', mod: abilityModifier(character.wisdom) },
    { name: 'Nature', ability: 'INT', mod: abilityModifier(character.intelligence) },
    { name: 'Perception', ability: 'WIS', mod: abilityModifier(character.wisdom) },
    { name: 'Performance', ability: 'CHA', mod: abilityModifier(character.charisma) },
    { name: 'Persuasion', ability: 'CHA', mod: abilityModifier(character.charisma) },
    { name: 'Religion', ability: 'INT', mod: abilityModifier(character.intelligence) },
    { name: 'Sleight of Hand', ability: 'DEX', mod: abilityModifier(character.dexterity) },
    { name: 'Stealth', ability: 'DEX', mod: abilityModifier(character.dexterity) },
    { name: 'Survival', ability: 'WIS', mod: abilityModifier(character.wisdom) },
  ];

  // Create skill lookup for proficiency/expertise
  const skillLookup = {};
  characterSkills.forEach(cs => {
    skillLookup[cs.skill_name] = cs;
  });

  return (
    <div className="skills-tab">
      <h2>Skills</h2>
      {loading ? (
        <div className="loading-container">
          <img src="/crest.png" alt="" className="loading-crest loading-crest-small" />
          <span className="loading-text">Loading skills...</span>
        </div>
      ) : (
        <div className="skills-list">
          {allSkills.map(skill => {
            const charSkill = skillLookup[skill.name];
            const isProficient = !!charSkill;
            const isExpertise = charSkill?.expertise || false;
            const proficiencyKey = isExpertise ? 'expertise' : isProficient ? 'proficient' : 'unskilled';
            const proficiencyIconSrc = new URL(`../assets/icons/proficiency/${proficiencyKey}.svg`, import.meta.url).href;
            const skillIconSrc = new URL(`../assets/icons/skill/${skillSlug(skill.name)}.svg`, import.meta.url).href;
            
            let bonus = skill.mod;
            if (isExpertise) {
              bonus += proficiencyBonus * 2;
            } else if (isProficient) {
              bonus += proficiencyBonus;
            }

            return (
              <div key={skill.name} className={`skill-item ${isProficient ? 'proficient' : ''} ${isExpertise ? 'expertise' : ''}`}>
                <div className="skill-info">
                  <span
                    className="skill-proficiency-icon"
                    style={{ '--icon-url': `url(${proficiencyIconSrc})` }}
                    aria-hidden="true"
                  />
                  <span
                    className="skill-icon"
                    style={{ '--icon-url': `url(${skillIconSrc})` }}
                    aria-hidden="true"
                  />
                  <span className="skill-name">{skill.name}</span>
                  <span className="skill-ability">({skill.ability})</span>
                </div>
                <span className="skill-bonus">{bonus >= 0 ? '+' : ''}{bonus}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tab 3: Spells
function SpellsTab({ character, spells, loading }) {
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

  // Group spells by level
  const spellsByLevel = {};
  spells.forEach(cs => {
    const level = cs.spell?.level ?? 0;
    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }
    spellsByLevel[level].push(cs);
  });

  const spellLevelNames = {
    0: 'Cantrips',
    1: '1st Level',
    2: '2nd Level',
    3: '3rd Level',
    4: '4th Level',
    5: '5th Level',
    6: '6th Level',
    7: '7th Level',
    8: '8th Level',
    9: '9th Level',
  };

  return (
    <div className="spells-tab">
      <div className="spellcasting-header">
        <h2>Spells</h2>
        <p className="spellcasting-info">
          <strong>Spellcasting Ability:</strong> {character.spellcasting_ability.toUpperCase()}
        </p>
      </div>

      {spells.length === 0 ? (
        <p className="info-text">No spells found for this character</p>
      ) : (
        <div className="spells-by-level">
          {Object.keys(spellsByLevel).sort((a, b) => Number(a) - Number(b)).map(level => (
            <div key={level} className="spell-level-group">
              <h3 className="spell-level-header">{spellLevelNames[level]}</h3>
              <div className="spell-list">
                {spellsByLevel[level].map(cs => (
                  <div key={cs.id} className="spell-item">
                    <div className="spell-main">
                      <div className="spell-name-row">
                        <input
                          type="checkbox"
                          checked={cs.is_prepared}
                          disabled
                          className="spell-prepared-check"
                        />
                        <span className="spell-name">{cs.spell?.name}</span>
                        {cs.always_prepared && <span className="always-prepared">Always Prepared</span>}
                      </div>
                      <div className="spell-meta">
                        <span className="spell-school">{cs.spell?.school}</span>
                        <span className="spell-separator">•</span>
                        <span className="spell-casting-time">{cs.spell?.casting_time}</span>
                        <span className="spell-separator">•</span>
                        <span className="spell-range">{cs.spell?.range}</span>
                      </div>
                    </div>
                    <div className="spell-description">
                      {cs.spell?.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tab 4: Inventory
function InventoryTab() {
  return (
    <div className="inventory-tab">
      <h2>Inventory</h2>
      <p className="info-text">Inventory list coming soon...</p>
    </div>
  );
}

// Tab 5: Features
function FeaturesTab({ character }) {
  return (
    <div className="features-tab">
      <h2>Features & Traits</h2>
      <p className="info-text">Features list coming soon...</p>
      {character.bio && (
        <div className="bio-section">
          <h3>Bio</h3>
          <p>{character.bio}</p>
        </div>
      )}
    </div>
  );
}

// HP Edit Modal
function HPEditModal({ currentHP, setCurrentHP, tempHP, setTempHP, maxHPModifier, setMaxHPModifier, maxHP, damageInput, setDamageInput, isOpen, onClose }) {
  const displayMaxHP = maxHP + maxHPModifier;
  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;
  const [assetsLoaded, setAssetsLoaded] = useState({
    journal: false,
    damage: false,
    healing: false
  });

  useEffect(() => {
    if (isOpen) {
      setAssetsLoaded({ journal: false, damage: false, healing: false });
    }
  }, [isOpen]);

  const markAssetLoaded = (key) => {
    setAssetsLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const areAssetsReady = assetsLoaded.journal && assetsLoaded.damage && assetsLoaded.healing;

  // Check if input is a valid positive integer
  const parsedAmount = parseInt(damageInput);
  const isValidInput = damageInput && !isNaN(parsedAmount) && parsedAmount > 0 && !damageInput.includes('.') && !damageInput.includes('-');

  const handleDamage = () => {
    const damageAmount = parseInt(damageInput);
    // Only allow positive integers
    if (!damageInput || isNaN(damageAmount) || damageAmount <= 0 || damageInput.includes('.') || damageInput.includes('-')) return;
    
    let newCurrent = currentHP - damageAmount;
    
    // Damage reduces temp HP first, then current HP
    if (tempHP > 0) {
      const tempDamage = Math.min(tempHP, damageAmount);
      setTempHP(tempHP - tempDamage);
      newCurrent = currentHP - (damageAmount - tempDamage);
    }
    
    newCurrent = Math.max(0, Math.min(newCurrent, displayMaxHP));
    setCurrentHP(newCurrent);
  };

  const handleHealing = () => {
    const healAmount = parseInt(damageInput);
    // Only allow positive integers
    if (!damageInput || isNaN(healAmount) || healAmount <= 0 || damageInput.includes('.') || damageInput.includes('-')) return;
    
    const newCurrent = Math.max(0, Math.min(currentHP + healAmount, displayMaxHP));
    setCurrentHP(newCurrent);
  };

  if (!isOpen) return null;

  return (
    <div className="hp-modal-overlay" onClick={onClose}>
      <div className={`hp-modal ${areAssetsReady ? '' : 'hp-modal-pending'}`} onClick={onClose}>
        <img
          src="/Journal.png"
          alt=""
          className="hp-modal-bg"
          onLoad={() => markAssetLoaded('journal')}
          onError={() => markAssetLoaded('journal')}
        />

        {!areAssetsReady && (
          <div className="hp-modal-loading">
            <img src="/crest.png" alt="" className="hp-modal-loading-crest" />
          </div>
        )}
        
        <button className="hp-modal-close" onClick={onClose} aria-label="Close HP modal">
          <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
        </button>

        <div className="hp-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="hp-modal-toolbar">
            <button className="hp-modal-close-inline" onClick={onClose} aria-label="Close HP modal">
              <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
            </button>
          </div>
          {/* Total Display */}
          <div className="hp-total">
            <span className="hp-total-label hp-total-label-top">Total</span>
            <div className="hp-total-values">
              <span className="hp-total-value hp-value-current">{currentHP}</span>
              <span className="hp-total-separator">/</span>
              <span className={maxHPModifier !== 0 ? 'hp-total-value hp-value-mod' : 'hp-total-value hp-value-current'}>
                {displayMaxHP}
              </span>
              {tempHP > 0 && (
                <span className="hp-total-value hp-value-temp">+{tempHP}</span>
              )}
            </div>
            <span className="hp-total-label hp-total-label-bottom">HP</span>
          </div>

          <div className="hp-fields-row">
            {/* Current HP */}
            <div className="hp-field hp-field-compact hp-field-current">
              <label>Current HP:</label>
              <input 
                type="number" 
                value={currentHP} 
                onChange={(e) => setCurrentHP(Math.max(0, Math.min(parseInt(e.target.value) || 0, displayMaxHP)))}
                min="0"
                max={displayMaxHP}
              />
            </div>

            {/* Max HP Modifier */}
            <div className="hp-field hp-field-compact hp-field-mod">
              <label>Max HP Modifier:</label>
              <input 
                type="number" 
                value={maxHPModifier === 0 ? '' : maxHPModifier} 
                onChange={(e) => setMaxHPModifier(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* Temp HP */}
            <div className="hp-field hp-field-compact hp-field-temp">
              <label>Temporary HP:</label>
              <input 
                type="number" 
                value={tempHP === 0 ? '' : tempHP} 
                onChange={(e) => setTempHP(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          {/* Damage/Healing Calculator */}
          <div className="hp-calculator">
            <div className="hp-calculator-inputs">
              <button onClick={handleDamage} className="hp-damage-btn" aria-label="Apply damage" type="button" disabled={!isValidInput}>
                <img
                  src="/Damage.png"
                  alt=""
                  className="hp-action-icon"
                  onLoad={() => markAssetLoaded('damage')}
                  onError={() => markAssetLoaded('damage')}
                />
              </button>
              <input 
                type="number" 
                value={damageInput} 
                onChange={(e) => setDamageInput(e.target.value)}
                placeholder="0"
              />
              <button onClick={handleHealing} className="hp-healing-btn" aria-label="Apply healing" type="button" disabled={!isValidInput}>
                <img
                  src="/Healing.png"
                  alt=""
                  className="hp-action-icon"
                  onLoad={() => markAssetLoaded('healing')}
                  onError={() => markAssetLoaded('healing')}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

AbilitiesTab.propTypes = {
  character: PropTypes.object.isRequired,
  strMod: PropTypes.number.isRequired,
  dexMod: PropTypes.number.isRequired,
  conMod: PropTypes.number.isRequired,
  intMod: PropTypes.number.isRequired,
  wisMod: PropTypes.number.isRequired,
  chaMod: PropTypes.number.isRequired,
  proficiencyBonus: PropTypes.number.isRequired,
  skills: PropTypes.arrayOf(PropTypes.object),
  derivedStats: PropTypes.object,
  allBonuses: PropTypes.arrayOf(PropTypes.object),
  getAbilityBonuses: PropTypes.func,
  inspectorState: PropTypes.object,
  setInspectorState: PropTypes.func,
  baseAbilities: PropTypes.object
};

SkillsTab.propTypes = {
  character: PropTypes.object.isRequired,
  proficiencyBonus: PropTypes.number.isRequired,
  skills: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool
};

SpellsTab.propTypes = {
  character: PropTypes.object.isRequired,
  spells: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool
};

InventoryTab.propTypes = {};

FeaturesTab.propTypes = {
  character: PropTypes.object.isRequired
};

HPEditModal.propTypes = {
  currentHP: PropTypes.number,
  setCurrentHP: PropTypes.func.isRequired,
  tempHP: PropTypes.number.isRequired,
  setTempHP: PropTypes.func.isRequired,
  maxHPModifier: PropTypes.number.isRequired,
  setMaxHPModifier: PropTypes.func.isRequired,
  maxHP: PropTypes.number.isRequired,
  damageInput: PropTypes.string.isRequired,
  setDamageInput: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default CharacterSheet;
