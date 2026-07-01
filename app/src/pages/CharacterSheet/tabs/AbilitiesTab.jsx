export default function AbilitiesTab({ character, strMod, dexMod, conMod, intMod, wisMod, chaMod, proficiencyBonus, skills, derivedStats, allBonuses, getAbilityBonuses, inspectorState, setInspectorState, baseAbilities, saveAdvantages = {}, statsTotals = {}, derivedMods = {}, features = [], skillAdvantages = {} }) {
  // Helper to get custom modifier total for an ability
  const getCustomModifierTotal = (abilityKey) => {
    const mods = inspectorState.abilityCustomModifiers?.[abilityKey] || [];
    return mods.reduce((sum, mod) => sum + mod.value, 0);
  };

  // Helper to get the final ability score (with override or calculated)
  const getFinalAbilityScore = (abilityKey, baseScore) => {
    const override = inspectorState.abilityCustomOverrides?.[abilityKey];
    if (override !== null && override !== undefined) {
      return override;
    }
    return baseScore + getCustomModifierTotal(abilityKey);
  };

  // Helper to determine glow state for an ability
  const getGlowState = (abilityKey, baseScore) => {
    const override = inspectorState.abilityCustomOverrides?.[abilityKey];
    if (override !== null && override !== undefined) {
      return 'glow-blue'; // Blue for override
    }
    const customModTotal = getCustomModifierTotal(abilityKey);
    if (customModTotal > 0) {
      return 'glow-green'; // Green for positive modifier
    }
    if (customModTotal < 0) {
      return 'glow-red'; // Red for negative modifier
    }
    return ''; // No glow
  };

  const abilities = [
    { name: 'Strength', abbr: 'STR', key: 'strength', baseScore: derivedStats?.abilities?.strength || character.strength, score: getFinalAbilityScore('strength', derivedStats?.abilities?.strength || character.strength), mod: strMod, save: character.save_strength },
    { name: 'Dexterity', abbr: 'DEX', key: 'dexterity', baseScore: derivedStats?.abilities?.dexterity || character.dexterity, score: getFinalAbilityScore('dexterity', derivedStats?.abilities?.dexterity || character.dexterity), mod: dexMod, save: character.save_dexterity },
    { name: 'Constitution', abbr: 'CON', key: 'constitution', baseScore: derivedStats?.abilities?.constitution || character.constitution, score: getFinalAbilityScore('constitution', derivedStats?.abilities?.constitution || character.constitution), mod: conMod, save: character.save_constitution },
    { name: 'Intelligence', abbr: 'INT', key: 'intelligence', baseScore: derivedStats?.abilities?.intelligence || character.intelligence, score: getFinalAbilityScore('intelligence', derivedStats?.abilities?.intelligence || character.intelligence), mod: intMod, save: character.save_intelligence },
    { name: 'Wisdom', abbr: 'WIS', key: 'wisdom', baseScore: derivedStats?.abilities?.wisdom || character.wisdom, score: getFinalAbilityScore('wisdom', derivedStats?.abilities?.wisdom || character.wisdom), mod: wisMod, save: character.save_wisdom },
    { name: 'Charisma', abbr: 'CHA', key: 'charisma', baseScore: derivedStats?.abilities?.charisma || character.charisma, score: getFinalAbilityScore('charisma', derivedStats?.abilities?.charisma || character.charisma), mod: chaMod, save: character.save_charisma },
  ].map(ability => ({
    ...ability,
    glowClass: getGlowState(ability.key, ability.baseScore)
  }));

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

  const normalizeSkillKey = (value) => String(value || '').toLowerCase().replace(/[\s']/g, '_').trim();

  const skillLookup = (skills || []).reduce((acc, skill) => {
    acc[skill.skill_name] = skill;
    return acc;
  }, {});

  const abilityKeyToAbbrev = {
    strength: 'STR',
    dexterity: 'DEX',
    constitution: 'CON',
    intelligence: 'INT',
    wisdom: 'WIS',
    charisma: 'CHA'
  };

  // Build feature-derived skill data (same logic as SkillsTab)
  const skillAdditionalAbilitiesMap = {};
  const skillProficienciesFromFeatures = new Set();
  const skillExpertiseFromFeatures = new Set();
  let hasHalfProficiency = false;

  const getFeatureLevel = (feature) => {
    const source = feature.source;
    if (source && typeof source === 'object' && source.class) {
      const targetClass = source.class.toLowerCase();
      const classEntry = character.classes?.find(c => 
        (c.class || c.definition?.name || '').toLowerCase() === targetClass
      );
      if (classEntry) {
        return classEntry.level || classEntry.definition?.level || 1;
      }
    }
    return character.level || 1;
  };

  const normalizeBenefits = (rawBenefits) => {
    if (Array.isArray(rawBenefits)) return rawBenefits;
    if (rawBenefits && typeof rawBenefits === 'object') {
      if (Array.isArray(rawBenefits.benefits)) return rawBenefits.benefits;
      return rawBenefits.type ? [rawBenefits] : [];
    }
    if (typeof rawBenefits === 'string') {
      try {
        const parsed = JSON.parse(rawBenefits);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.benefits)) return parsed.benefits;
        return parsed && typeof parsed === 'object' && parsed.type ? [parsed] : [];
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
        if (benefitType === 'skill_dual_ability' && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = normalizeSkillKey(skillName);
            if (!skillAdditionalAbilitiesMap[skillKey]) {
              skillAdditionalAbilitiesMap[skillKey] = [];
            }
            if (benefit.ability && !skillAdditionalAbilitiesMap[skillKey].includes(benefit.ability)) {
              skillAdditionalAbilitiesMap[skillKey].push(benefit.ability);
            }
          });
        } else if (benefitType === 'skill_proficiency' && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = normalizeSkillKey(skillName);
            skillProficienciesFromFeatures.add(skillKey);
          });
        } else if (benefitType === 'skill_proficiency' && benefit.skill) {
          const skillKey = normalizeSkillKey(benefit.skill);
          skillProficienciesFromFeatures.add(skillKey);
        } else if (benefitType === 'skill_expertise' && benefit.skills && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = normalizeSkillKey(skillName);
            skillExpertiseFromFeatures.add(skillKey);
          });
          const scalingMap = benefit.level_scaling || benefit.scaling;
          if (scalingMap && typeof scalingMap === 'object') {
            const currentLevel = getFeatureLevel(feature);
            Object.keys(scalingMap).forEach(levelThreshold => {
              const threshold = parseInt(levelThreshold, 10);
              if (!isNaN(threshold) && currentLevel >= threshold) {
                const scalingData = scalingMap[levelThreshold];
                if (scalingData?.skills && Array.isArray(scalingData.skills)) {
                  scalingData.skills.forEach(skillName => {
                    const skillKey = normalizeSkillKey(skillName);
                    skillExpertiseFromFeatures.add(skillKey);
                  });
                }
              }
            });
          }
        } else if (benefitType === 'skill_half_proficiency') {
          hasHalfProficiency = true;
        }
      });
    }
  });

  // Normalize flat skill bonuses
  const normalizedFlatSkillBonuses = Object.entries(statsTotals.skills || {}).reduce((acc, [rawKey, rawValue]) => {
    const key = normalizeSkillKey(rawKey);
    if (!key) return acc;
    const value = Number(rawValue) || 0;
    acc[key] = (acc[key] || 0) + value;
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

  const passiveSkillValue = (skillName, baseMod, abilityKey) => {
    const skillKey = normalizeSkillKey(skillName);
    const skillEntry = skillLookup[skillName];
    const hasFeatureProficiency = skillProficienciesFromFeatures.has(skillKey);
    const isProficient = !!skillEntry || hasFeatureProficiency;
    const hasFeatureExpertise = skillExpertiseFromFeatures.has(skillKey);
    const isExpertise = skillEntry?.expertise || hasFeatureExpertise;
    const hasHalfProf = !isProficient && !isExpertise && hasHalfProficiency;

    let bonus = baseMod;
    if (isExpertise) {
      bonus += proficiencyBonus * 2;
    } else if (isProficient) {
      bonus += proficiencyBonus;
    } else if (hasHalfProf) {
      bonus += Math.floor(proficiencyBonus / 2);
    }

    // Add any additional ability modifiers from features
    const additionalAbilities = skillAdditionalAbilitiesMap[skillKey] || [];
    additionalAbilities.forEach(ability => {
      const additionalMod = derivedMods[ability] || 0;
      bonus += additionalMod;
    });

    // Add flat skill bonuses from bonus engine
    const flatSkillBonus = normalizedFlatSkillBonuses[skillKey] || 0;
    bonus += flatSkillBonus;

    // Add advantage bonus (+5) if character has advantage on this skill
    const hasAdvantage = skillAdvantages[skillKey] || hasPassiveAdvantage(skillName);
    const advantageBonus = hasAdvantage ? 5 : 0;

    return 10 + bonus + advantageBonus;
  };

  const senses = Array.isArray(derivedStats?.senses) ? derivedStats.senses : (Array.isArray(character?.senses) ? character.senses : []);
  const speeds = derivedStats?.speeds && typeof derivedStats.speeds === 'object' && Object.keys(derivedStats.speeds).length > 0
    ? derivedStats.speeds
    : {};
  const damageResistances = Array.isArray(derivedStats?.damage_resistances) ? derivedStats.damage_resistances : [];
  const damageImmunities = Array.isArray(derivedStats?.damage_immunities) ? derivedStats.damage_immunities : [];
  const conditionResistances = Array.isArray(derivedStats?.condition_resistances) ? derivedStats.condition_resistances : [];
  const conditionImmunities = Array.isArray(derivedStats?.condition_immunities) ? derivedStats.condition_immunities : [];
  const hasDefensiveTraits = damageResistances.length > 0 || damageImmunities.length > 0 || conditionResistances.length > 0 || conditionImmunities.length > 0;

  const formatTraitLabel = (value) => String(value || '')
    .replace(/_/g, ' ')
    .replace(/(^.|\s.)/g, (m) => m.toUpperCase());

  return (
    <div className="abilities-tab">
      <section className="section">
        <h2>Ability Scores</h2>
        <div className="abilities-grid">
          {abilities.map(ability => (
            <div
              key={ability.name}
              className={`ability-card ${ability.glowClass}`}
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
            const baseSaveBonus = ability.mod + (ability.save ? proficiencyBonus : 0);
            const flatSaveBonus = statsTotals.saves?.[ability.key] || 0;
            const saveBonus = baseSaveBonus + flatSaveBonus;
            const hasAdvantage = !!saveAdvantages[ability.key];
            const advantageIconSrc = '/icons/dice/advantage.svg';
            
            return (
              <div key={ability.abbr} className="save-item">
                <span className={ability.save ? 'proficient' : ''}>
                  {ability.save && '● '}{ability.name}
                </span>
                <div className="save-bonus-container">
                  {hasAdvantage && (
                    <span
                      className="save-advantage-icon"
                      style={{ '--icon-url': `url(${advantageIconSrc})` }}
                      title="Advantage on this saving throw"
                      aria-hidden="true"
                    />
                  )}
                  <span className="save-bonus">{saveBonus >= 0 ? '+' : ''}{saveBonus}</span>
                </div>
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
            <span className="passive-value">{passiveSkillValue('Perception', wisMod, 'wisdom')}</span>
          </div>
          <div className="passive-item">
            <span>Passive Insight</span>
            <span className="passive-value">{passiveSkillValue('Insight', wisMod, 'wisdom')}</span>
          </div>
          <div className="passive-item">
            <span>Passive Investigation</span>
            <span className="passive-value">{passiveSkillValue('Investigation', intMod, 'intelligence')}</span>
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

      {hasDefensiveTraits && (
        <section className="section">
          <h2>Resistances & Immunities</h2>
          <div className="passive-list">
            {damageResistances.length > 0 && (
              <div className="passive-item">
                <span>Damage Resistances</span>
                <span className="passive-value">{damageResistances.map(formatTraitLabel).join(', ')}</span>
              </div>
            )}
            {damageImmunities.length > 0 && (
              <div className="passive-item">
                <span>Damage Immunities</span>
                <span className="passive-value">{damageImmunities.map(formatTraitLabel).join(', ')}</span>
              </div>
            )}
            {conditionResistances.length > 0 && (
              <div className="passive-item">
                <span>Condition Resistances</span>
                <span className="passive-value">{conditionResistances.map(formatTraitLabel).join(', ')} (Adv. vs Save)</span>
              </div>
            )}
            {conditionImmunities.length > 0 && (
              <div className="passive-item">
                <span>Condition Immunities</span>
                <span className="passive-value">{conditionImmunities.map(formatTraitLabel).join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
