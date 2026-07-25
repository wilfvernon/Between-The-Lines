export const normalizeSkillKey = (value) => String(value || '').toLowerCase().replace(/[\s']/g, '_').trim();

const normalizeAbilityKey = (value) => {
  const key = String(value || '').trim().toLowerCase();
  const aliases = {
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma'
  };
  return aliases[key] || key;
};

export const normalizeBenefits = (rawBenefits) => {
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

const getFeatureLevel = (feature, character) => {
  const source = feature?.source;
  if (source && typeof source === 'object' && source.class) {
    const targetClass = String(source.class).toLowerCase();
    const classEntry = character?.classes?.find((c) =>
      String(c?.class || c?.definition?.name || '').toLowerCase() === targetClass
    );
    if (classEntry) {
      return classEntry.level || classEntry.definition?.level || 1;
    }
  }
  return character?.level || 1;
};

export const buildSkillComputationContext = ({ character, characterSkills = [], features = [], statsTotals = {} }) => {
  const skillLookup = (characterSkills || []).reduce((acc, skill) => {
    if (skill?.skill_name) acc[skill.skill_name] = skill;
    return acc;
  }, {});

  const skillAdditionalAbilitiesMap = {};
  const skillProficienciesFromFeatures = new Set();
  const skillExpertiseFromFeatures = new Set();
  let hasHalfProficiency = false;

  (features || []).forEach((feature) => {
    const benefitsList = normalizeBenefits(feature?.benefits ?? feature?.benefit);
    benefitsList.forEach((benefit) => {
      const benefitType = typeof benefit?.type === 'string'
        ? benefit.type.trim().toLowerCase().replace(/[\s-]+/g, '_')
        : benefit?.type;

      if (benefitType === 'skill_dual_ability' && Array.isArray(benefit.skills)) {
        benefit.skills.forEach((skillName) => {
          const skillKey = normalizeSkillKey(skillName);
          if (!skillAdditionalAbilitiesMap[skillKey]) skillAdditionalAbilitiesMap[skillKey] = [];
          const ability = normalizeAbilityKey(benefit.ability);
          if (ability && !skillAdditionalAbilitiesMap[skillKey].includes(ability)) {
            skillAdditionalAbilitiesMap[skillKey].push(ability);
          }
        });
        return;
      }

      // Legacy compatibility for older content.
      if (benefitType === 'skill_modifier_bonus' && Array.isArray(benefit.skills)) {
        benefit.skills.forEach((skillName) => {
          const skillKey = normalizeSkillKey(skillName);
          if (!skillAdditionalAbilitiesMap[skillKey]) skillAdditionalAbilitiesMap[skillKey] = [];
          const abilityMatch = String(benefit?.bonus_source || '').match(/^(\w+)_modifier$/);
          if (!abilityMatch) return;
          const ability = normalizeAbilityKey(abilityMatch[1]);
          if (ability && !skillAdditionalAbilitiesMap[skillKey].includes(ability)) {
            skillAdditionalAbilitiesMap[skillKey].push(ability);
          }
        });
        return;
      }

      if (benefitType === 'skill_proficiency' && Array.isArray(benefit.skills)) {
        benefit.skills.forEach((skillName) => {
          skillProficienciesFromFeatures.add(normalizeSkillKey(skillName));
        });
        return;
      }

      if (benefitType === 'skill_proficiency' && benefit.skill) {
        skillProficienciesFromFeatures.add(normalizeSkillKey(benefit.skill));
        return;
      }

      if (benefitType === 'skill_expertise' && Array.isArray(benefit.skills)) {
        benefit.skills.forEach((skillName) => {
          skillExpertiseFromFeatures.add(normalizeSkillKey(skillName));
        });

        const scalingMap = benefit.level_scaling || benefit.scaling;
        if (scalingMap && typeof scalingMap === 'object') {
          const currentLevel = getFeatureLevel(feature, character);
          Object.keys(scalingMap).forEach((levelThreshold) => {
            const threshold = Number.parseInt(levelThreshold, 10);
            if (Number.isNaN(threshold) || currentLevel < threshold) return;
            const scalingData = scalingMap[levelThreshold];
            if (!Array.isArray(scalingData?.skills)) return;
            scalingData.skills.forEach((skillName) => {
              skillExpertiseFromFeatures.add(normalizeSkillKey(skillName));
            });
          });
        }
        return;
      }

      if (benefitType === 'skill_half_proficiency') {
        hasHalfProficiency = true;
      }
    });
  });

  const normalizedFlatSkillBonuses = Object.entries(statsTotals?.skills || {}).reduce((acc, [rawKey, rawValue]) => {
    const key = normalizeSkillKey(rawKey);
    if (!key) return acc;
    const value = Number(rawValue) || 0;
    acc[key] = (acc[key] || 0) + value;
    return acc;
  }, {});

  return {
    skillLookup,
    skillAdditionalAbilitiesMap,
    skillProficienciesFromFeatures,
    skillExpertiseFromFeatures,
    hasHalfProficiency,
    normalizedFlatSkillBonuses
  };
};

export const calculateSkillBonus = ({
  skillName,
  baseMod,
  proficiencyBonus,
  derivedMods = {},
  context
}) => {
  const skillKey = normalizeSkillKey(skillName);
  const skillEntry = context?.skillLookup?.[skillName];
  const hasFeatureProficiency = context?.skillProficienciesFromFeatures?.has(skillKey);
  const isProficient = !!skillEntry || !!hasFeatureProficiency;
  const hasFeatureExpertise = context?.skillExpertiseFromFeatures?.has(skillKey);
  const isExpertise = !!skillEntry?.expertise || !!hasFeatureExpertise;
  const hasHalfProf = !isProficient && !isExpertise && !!context?.hasHalfProficiency;

  let bonus = Number(baseMod) || 0;
  if (isExpertise) {
    bonus += (Number(proficiencyBonus) || 0) * 2;
  } else if (isProficient) {
    bonus += Number(proficiencyBonus) || 0;
  } else if (hasHalfProf) {
    bonus += Math.floor((Number(proficiencyBonus) || 0) / 2);
  }

  const additionalAbilities = context?.skillAdditionalAbilitiesMap?.[skillKey] || [];
  additionalAbilities.forEach((ability) => {
    bonus += Number(derivedMods?.[ability]) || 0;
  });

  const flatSkillBonus = Number(context?.normalizedFlatSkillBonuses?.[skillKey]) || 0;
  bonus += flatSkillBonus;

  return {
    skillKey,
    bonus,
    additionalAbilities,
    isProficient,
    isExpertise,
    hasHalfProf
  };
};
