export default function SkillsTab({ character, proficiencyBonus, skills: characterSkills, loading, features, derivedMods, skillAdvantages = {}, statsTotals = {} }) {
  const normalizeSkillKey = (value) => String(value || '').toLowerCase().replace(/[\s']/g, '_').trim();

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

  // Build map of additional ability modifiers for skills
  // Example: { history: ['charisma'], religion: ['charisma'] }
  const skillAdditionalAbilitiesMap = {}; // { skillKey: [ability, ability, ...] }
  
  // Build set of skills that have proficiency from features
  const skillProficienciesFromFeatures = new Set(); // Set of skillKeys
  
  // Build set of skills that have expertise from features
  const skillExpertiseFromFeatures = new Set(); // Set of skillKeys
  
  // Check if character has skill_half_proficiency benefit (Jack of All Trades style)
  let hasHalfProficiency = false;
  
  // Helper to get character level for a feature (uses class level if source specifies it)
  const getFeatureLevel = (feature) => {
    // Try to get source information
    const source = feature.source;
    if (source && typeof source === 'object' && source.class) {
      // Find the specified class level
      const targetClass = source.class.toLowerCase();
      const classEntry = character.classes?.find(c => 
        (c.class || c.definition?.name || '').toLowerCase() === targetClass
      );
      if (classEntry) {
        return classEntry.level || classEntry.definition?.level || 1;
      }
    }
    // Default to character level
    return character.level || 1;
  };
  
  const normalizeBenefits = (rawBenefits) => {
    if (Array.isArray(rawBenefits)) return rawBenefits;
    if (rawBenefits && typeof rawBenefits === 'object') {
      return rawBenefits.type ? [rawBenefits] : [];
    }
    if (typeof rawBenefits === 'string') {
      try {
        const parsed = JSON.parse(rawBenefits);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  features.forEach(feature => {
    const benefitsList = normalizeBenefits(feature.benefits);
    if (benefitsList.length > 0) {
      benefitsList.forEach(benefit => {
        const benefitType = typeof benefit?.type === 'string' ? benefit.type.trim() : benefit?.type;
        // New format: skill_dual_ability
        if (benefitType === 'skill_dual_ability' && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
            if (!skillAdditionalAbilitiesMap[skillKey]) {
              skillAdditionalAbilitiesMap[skillKey] = [];
            }
            if (benefit.ability && !skillAdditionalAbilitiesMap[skillKey].includes(benefit.ability)) {
              skillAdditionalAbilitiesMap[skillKey].push(benefit.ability);
            }
          });
        }
        // Legacy format: skill_modifier_bonus (for backward compatibility)
        else if (benefitType === 'skill_modifier_bonus' && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
            if (!skillAdditionalAbilitiesMap[skillKey]) {
              skillAdditionalAbilitiesMap[skillKey] = [];
            }
            // Extract ability from bonus_source like "charisma_modifier"
            const abilityMatch = benefit.bonus_source?.match(/^(\w+)_modifier$/);
            if (abilityMatch) {
              const ability = abilityMatch[1];
              if (!skillAdditionalAbilitiesMap[skillKey].includes(ability)) {
                skillAdditionalAbilitiesMap[skillKey].push(ability);
              }
            }
          });
        }
        // skill_proficiency: Mark this skill as proficient
        // Now uses skills array instead of skill
        else if (benefitType === 'skill_proficiency' && benefit.skills && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
            skillProficienciesFromFeatures.add(skillKey);
          });
        }
        // Legacy support for single skill property
        else if (benefitType === 'skill_proficiency' && benefit.skill) {
          const skillKey = benefit.skill.toLowerCase().replace(/[\s']/g, '_');
          skillProficienciesFromFeatures.add(skillKey);
        }
        // skill_expertise: Mark skills as having expertise with level-based scaling
        else if (benefitType === 'skill_expertise' && benefit.skills && Array.isArray(benefit.skills)) {
          // Add base expertise skills
          benefit.skills.forEach(skillName => {
            const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
            skillExpertiseFromFeatures.add(skillKey);
          });
          
          // Check level_scaling for additional skills at higher levels
          if (benefit.level_scaling && typeof benefit.level_scaling === 'object') {
            const currentLevel = getFeatureLevel(feature);
            
            // Check each level threshold in level_scaling
            Object.keys(benefit.level_scaling).forEach(levelThreshold => {
              const threshold = parseInt(levelThreshold, 10);
              if (!isNaN(threshold) && currentLevel >= threshold) {
                const scalingData = benefit.level_scaling[levelThreshold];
                if (scalingData?.skills && Array.isArray(scalingData.skills)) {
                  scalingData.skills.forEach(skillName => {
                    const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
                    skillExpertiseFromFeatures.add(skillKey);
                  });
                }
              }
            });
          }
        }
        // skill_half_proficiency: Jack of All Trades style half proficiency
        else if (benefitType === 'skill_half_proficiency') {
          hasHalfProficiency = true;
        }
      });
    }
  });
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

  // Create skill lookup for proficiency/expertise
  const skillLookup = {};
  characterSkills.forEach(cs => {
    skillLookup[cs.skill_name] = cs;
  });

  const abilityKeyToAbbrev = {
    strength: 'STR',
    dexterity: 'DEX',
    constitution: 'CON',
    intelligence: 'INT',
    wisdom: 'WIS',
    charisma: 'CHA'
  };

  // Normalize accumulated bonus-engine skill keys so both
  // `animal handling` and `animal_handling` resolve to the same lookup key.
  const normalizedFlatSkillBonuses = Object.entries(statsTotals.skills || {}).reduce((acc, [rawKey, rawValue]) => {
    const key = normalizeSkillKey(rawKey);
    if (!key) return acc;
    const value = Number(rawValue) || 0;
    acc[key] = (acc[key] || 0) + value;
    return acc;
  }, {});

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
            const skillKey = normalizeSkillKey(skill.name);
            const charSkill = skillLookup[skill.name];
            const hasFeatureProficiency = skillProficienciesFromFeatures.has(skillKey);
            const isProficient = !!charSkill || hasFeatureProficiency;
            const hasFeatureExpertise = skillExpertiseFromFeatures.has(skillKey);
            const isExpertise = charSkill?.expertise || hasFeatureExpertise;
            const hasHalfProf = !isProficient && !isExpertise && hasHalfProficiency;

            
            // Determine proficiency level using structured definition
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
            
            // Calculate bonus: base ability mod + proficiency bonus + additional ability mods
            let bonus = skill.mod;
            bonus += proficiencyLevel.bonusMultiplier(proficiencyBonus);
            
            // Add any additional ability modifiers from features
            // Example: Scholar of Yore adds CHA to History and Religion
            const additionalAbilities = skillAdditionalAbilitiesMap[skillKey] || [];
            additionalAbilities.forEach(ability => {
              const additionalMod = derivedMods[ability] || 0;
              bonus += additionalMod;
            })

            // Add flat skill bonuses from bonus engine (e.g., from magic items)
            const flatSkillBonus = normalizedFlatSkillBonuses[skillKey] || 0;
            bonus += flatSkillBonus;

            const abilitySuffixes = additionalAbilities
              .map((ability) => abilityKeyToAbbrev[ability])
              .filter(Boolean);
            const abilityDisplay = abilitySuffixes.length > 0
              ? `${skill.ability}+${abilitySuffixes.join('+')}`
              : skill.ability;
            
            const proficiencyIconSrc = new URL(`../../../assets/icons/proficiency/${proficiencyLevel.icon}`, import.meta.url).href;
            const skillIconSrc = new URL(`../../../assets/icons/skill/${skillSlug(skill.name)}.svg`, import.meta.url).href;
            const advantageIconSrc = new URL(`../../../assets/icons/dice/advantage.svg`, import.meta.url).href;
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
