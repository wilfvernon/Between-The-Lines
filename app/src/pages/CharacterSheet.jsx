import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './CharacterSheet.css';

function CharacterSheet() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'admin@candlekeep.sc';

  const [character, setCharacter] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('abilities'); // abilities, skills, spells, inventory, features
  const [skills, setSkills] = useState([]);
  const [spells, setSpells] = useState([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingSpells, setLoadingSpells] = useState(false);

  // Fetch character(s) on mount
  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        setLoading(true);
        setError('');

        if (isAdmin) {
          // Fetch all characters
          const { data, error: err } = await supabase
            .from('characters')
            .select('*');
          if (err) throw err;
          setCharacters(data || []);
          if (data?.length > 0) {
            setSelectedCharacterId(data[0].id);
            setCharacter(data[0]);
          }
        } else {
          // Fetch only current user's character
          const { data, error: err } = await supabase
            .from('characters')
            .select('*')
            .eq('user_id', user.id)
            .single();
          if (err && err.code !== 'PGRST116') throw err; // PGRST116 = no rows
          if (data) {
            setCharacter(data);
            setCharacters([data]);
            setSelectedCharacterId(data.id);
          }
        }
      } catch (err) {
        console.error('Error fetching character(s):', err);
        setError(err.message || 'Failed to load character');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchCharacters();
    }
  }, [user, isAdmin]);

  // Fetch skills and spells when character changes
  useEffect(() => {
    const fetchSkillsAndSpells = async () => {
      if (!character?.id) return;

      // Fetch skills
      setLoadingSkills(true);
      try {
        const { data: skillsData, error: skillsErr } = await supabase
          .from('character_skills')
          .select('*')
          .eq('character_id', character.id);
        if (skillsErr) throw skillsErr;
        setSkills(skillsData || []);
      } catch (err) {
        console.error('Error fetching skills:', err);
      } finally {
        setLoadingSkills(false);
      }

      // Fetch spells with spell details
      setLoadingSpells(true);
      try {
        const { data: spellsData, error: spellsErr } = await supabase
          .from('character_spells')
          .select(`
            *,
            spell:spells(*)
          `)
          .eq('character_id', character.id)
          .order('spell(level)', { ascending: true });
        if (spellsErr) throw spellsErr;
        setSpells(spellsData || []);
      } catch (err) {
        console.error('Error fetching spells:', err);
      } finally {
        setLoadingSpells(false);
      }
    };

    fetchSkillsAndSpells();
  }, [character?.id]);

  // Handle character selection (admin only)
  const handleCharacterChange = async (characterId) => {
    try {
      setSelectedCharacterId(characterId);
      const selectedChar = characters.find(c => c.id === characterId);
      setCharacter(selectedChar);
    } catch (err) {
      console.error('Error selecting character:', err);
      setError('Failed to load character');
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
    return <div className="page-container"><p style={{ color: '#f44336' }}>❌ {error}</p></div>;
  }

  if (!character) {
    return (
      <div className="page-container">
        <h1>Character Sheet</h1>
        <p>{isAdmin ? 'No characters found' : 'You have no character yet. Ask an admin to import your character.'}</p>
      </div>
    );
  }

  const proficiencyBonus = Math.ceil(character.level / 4) + 1;
  const abilityModifier = (score) => Math.floor((score - 10) / 2);

  const strMod = abilityModifier(character.strength);
  const dexMod = abilityModifier(character.dexterity);
  const conMod = abilityModifier(character.constitution);
  const intMod = abilityModifier(character.intelligence);
  const wisMod = abilityModifier(character.wisdom);
  const chaMod = abilityModifier(character.charisma);

  const ac = 10 + dexMod; // Simplified for now (no armor)
  const initiative = dexMod;
  const passivePerception = 10 + wisMod; // Simplified (will add proficiency later from skills)

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
        <div className="header-left">
          {character.image_url && (
            <div className="character-portrait">
              <img src={character.image_url} alt={character.name} />
            </div>
          )}
          <div className="character-name-level">
            <span className="char-name">{character.full_name || character.name}</span>
            <span className="char-level">
              Lvl {character.level} {character.classes.map(c => `${c.class}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ')}
            </span>
          </div>
        </div>
        <div className="header-right">
          <div className="header-stats-compact">
            <div className="stat-compact hp">
              <span className="stat-label-compact">HP:</span>
              <span className="stat-value-compact">{character.max_hp}/{character.max_hp}</span>
            </div>
            <div className="stat-row">
              <div className="stat-compact ac">
                <span className="stat-label-compact">AC:</span>
                <span className="stat-value-compact">{ac}</span>
              </div>
              <div className="stat-compact init">
                <span className="stat-label-compact">Init:</span>
                <span className="stat-value-compact">{initiative >= 0 ? '+' : ''}{initiative}</span>
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
            passivePerception={passivePerception}
          />
        )}
        {activeTab === 'skills' && <SkillsTab character={character} proficiencyBonus={proficiencyBonus} skills={skills} loading={loadingSkills} />}
        {activeTab === 'spells' && <SpellsTab character={character} spells={spells} loading={loadingSpells} />}
        {activeTab === 'inventory' && <InventoryTab character={character} />}
        {activeTab === 'features' && <FeaturesTab character={character} />}
      </div>
    </div>
  );
}

// Tab 1: Abilities, Saves, Passive Skills, Senses
function AbilitiesTab({ character, strMod, dexMod, conMod, intMod, wisMod, chaMod, proficiencyBonus, passivePerception }) {
  const abilities = [
    { name: 'Strength', abbr: 'STR', score: character.strength, mod: strMod, save: character.save_strength },
    { name: 'Dexterity', abbr: 'DEX', score: character.dexterity, mod: dexMod, save: character.save_dexterity },
    { name: 'Constitution', abbr: 'CON', score: character.constitution, mod: conMod, save: character.save_constitution },
    { name: 'Intelligence', abbr: 'INT', score: character.intelligence, mod: intMod, save: character.save_intelligence },
    { name: 'Wisdom', abbr: 'WIS', score: character.wisdom, mod: wisMod, save: character.save_wisdom },
    { name: 'Charisma', abbr: 'CHA', score: character.charisma, mod: chaMod, save: character.save_charisma },
  ];

  return (
    <div className="abilities-tab">
      <section className="section">
        <h2>Ability Scores</h2>
        <div className="abilities-grid">
          {abilities.map(ability => (
            <div key={ability.name} className="ability-card">
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
          {abilities.map(ability => {
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
        <h2>Passive Skills & Senses</h2>
        <div className="passive-list">
          <div className="passive-item">
            <span>Passive Perception</span>
            <span className="passive-value">{passivePerception}</span>
          </div>
          <div className="passive-item">
            <span>Speed</span>
            <span className="passive-value">{character.speed} ft</span>
          </div>
          <div className="passive-item">
            <span>Proficiency Bonus</span>
            <span className="passive-value">+{proficiencyBonus}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

// Tab 2: Skills
function SkillsTab({ character, proficiencyBonus, skills: characterSkills, loading }) {
  const abilityModifier = (score) => Math.floor((score - 10) / 2);
  
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px 0' }}>
          <img src="/crest.png" alt="" className="loading-crest" style={{ width: '60px', height: '60px' }} />
          <span className="loading-text">Loading skills...</span>
        </div>
      ) : (
        <div className="skills-list">
          {allSkills.map(skill => {
            const charSkill = skillLookup[skill.name];
            const isProficient = !!charSkill;
            const isExpertise = charSkill?.expertise || false;
            
            let bonus = skill.mod;
            if (isExpertise) {
              bonus += proficiencyBonus * 2;
            } else if (isProficient) {
              bonus += proficiencyBonus;
            }

            return (
              <div key={skill.name} className={`skill-item ${isProficient ? 'proficient' : ''} ${isExpertise ? 'expertise' : ''}`}>
                <div className="skill-info">
                  <span className="skill-marker">
                    {isExpertise ? '◆◆' : isProficient ? '●' : '○'}
                  </span>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px 0' }}>
          <img src="/crest.png" alt="" className="loading-crest" style={{ width: '60px', height: '60px' }} />
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
function InventoryTab({ character }) {
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

export default CharacterSheet;
