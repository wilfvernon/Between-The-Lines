import { buildSkillComputationContext, calculateSkillBonus } from '../utils/skillMath';

export default function SkillsTab({ character, proficiencyBonus, skills: characterSkills, loading, features, derivedMods, skillAdvantages = {}, statsTotals = {} }) {
  /**
   * Skill Proficiency Levels
   * 
   * Each skill has one of 4 proficiency states, determined by:
   * 1. Character proficiency (from class/background/ASI)
   * 2. Character expertise (doubled proficiency)
   * 3. Feature-granted proficiency (e.g., from a feat or feature)
   * 4. Feature-granted half-proficiency (add ⌊PB/2⌋ to unproficient skill)
   */
  const PROFICIENCY_LEVELS = {
    expertise: {
      key: 'expertise',
      icon: 'expertise.svg',
      display: 'Expertise',
      description: 'Double proficiency bonus',
      bonusMultiplier: (pb) => pb * 2
    },
    proficient: {
      key: 'proficient',
      icon: 'proficient.svg',
      display: 'Proficient',
      description: 'Normal proficiency bonus',
      bonusMultiplier: (pb) => pb
    },
    half: {
      key: 'half',
      icon: 'half.svg',
      display: 'Half Proficiency',
      description: 'Half proficiency bonus (e.g., Jack of All Trades)',
      bonusMultiplier: (pb) => Math.floor(pb / 2)
    },
    unskilled: {
      key: 'unskilled',
      icon: 'unskilled.svg',
      display: 'Unskilled',
      description: 'No proficiency bonus',
      bonusMultiplier: (pb) => 0
    }
  };
  /**
   * DERIVED MODIFIERS REQUIRED
   * derivedMods comes from CharacterSheet and includes all bonuses/feats/ASIs
   * Always use derivedMods for ability checks in this tab.
   * This includes all feature bonuses (e.g., Scholar of Yore +CHA to History).
   */
  const abilityModifier = (score) => Math.floor((score - 10) / 2);
  const skillSlug = (name) => name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  
  // Use passed-in derivedMods which includes ALL bonuses
  const getAbilityMod = (abilityKey) => {
    // ALWAYS use passed-in derivedMods - they're calculated with all bonuses applied
    return derivedMods?.[abilityKey] ?? abilityModifier(character[abilityKey]);
  };
  
  const allSkills = [
    { name: 'Acrobatics', ability: 'DEX', mod: getAbilityMod('dexterity') },
    { name: 'Animal Handling', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Arcana', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Athletics', ability: 'STR', mod: getAbilityMod('strength') },
    { name: 'Deception', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'History', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Insight', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Intimidation', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'Investigation', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Medicine', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Nature', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Perception', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Performance', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'Persuasion', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'Religion', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Sleight of Hand', ability: 'DEX', mod: getAbilityMod('dexterity') },
    { name: 'Stealth', ability: 'DEX', mod: getAbilityMod('dexterity') },
    { name: 'Survival', ability: 'WIS', mod: getAbilityMod('wisdom') },
  ];

  const skillComputationContext = buildSkillComputationContext({
    character,
    characterSkills,
    features,
    statsTotals
  });

  const abilityKeyToAbbrev = {
    strength: 'STR',
    dexterity: 'DEX',
    constitution: 'CON',
    intelligence: 'INT',
    wisdom: 'WIS',
    charisma: 'CHA'
  };

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
            const {
              skillKey,
              bonus,
              additionalAbilities,
              isProficient,
              isExpertise,
              hasHalfProf
            } = calculateSkillBonus({
              skillName: skill.name,
              baseMod: skill.mod,
              proficiencyBonus,
              derivedMods,
              context: skillComputationContext
            });

            let proficiencyLevel;
            if (isExpertise) {
              proficiencyLevel = PROFICIENCY_LEVELS.expertise;
            } else if (isProficient) {
              proficiencyLevel = PROFICIENCY_LEVELS.proficient;
            } else if (hasHalfProf) {
              proficiencyLevel = PROFICIENCY_LEVELS.half;
            } else {
              proficiencyLevel = PROFICIENCY_LEVELS.unskilled;
            }

            const abilitySuffixes = additionalAbilities
              .map((ability) => abilityKeyToAbbrev[ability])
              .filter(Boolean);
            const abilityDisplay = abilitySuffixes.length > 0
              ? `${skill.ability}+${abilitySuffixes.join('+')}`
              : skill.ability;
            
            const proficiencyIconSrc = `/icons/proficiency/${proficiencyLevel.icon}`;
            const skillIconSrc = `/icons/skill/${skillSlug(skill.name)}.svg`;
            const advantageIconSrc = '/icons/dice/advantage.svg';
            const hasAdvantage = !!skillAdvantages[skillKey];
            
            return (
              <div key={skill.name} className={`skill-item ${isExpertise ? 'expertise' : isProficient ? 'proficient' : hasHalfProf ? 'half' : ''}`}>
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
                  <span className="skill-ability">({abilityDisplay})</span>
                </div>
                <div className="skill-bonus-container">
                  {hasAdvantage && (
                    <span
                      className="skill-advantage-icon"
                      style={{ '--icon-url': `url(${advantageIconSrc})` }}
                      title="Advantage on this skill"
                      aria-hidden="true"
                    />
                  )}
                  <span className="skill-bonus">{bonus >= 0 ? '+' : ''}{bonus}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
