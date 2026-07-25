import { describe, expect, it } from 'vitest';
import { buildSkillComputationContext, calculateSkillBonus } from './skillMath';

describe('skillMath shared skill calculations', () => {
  it('includes proficiency, additional ability mods, and flat skill bonuses', () => {
    const context = buildSkillComputationContext({
      character: {
        level: 5,
        classes: []
      },
      characterSkills: [{ skill_name: 'Perception', expertise: false }],
      features: [
        {
          benefits: {
            type: 'skill_dual_ability',
            skills: ['Perception'],
            ability: 'charisma'
          }
        }
      ],
      statsTotals: {
        skills: {
          perception: 1
        }
      }
    });

    const result = calculateSkillBonus({
      skillName: 'Perception',
      baseMod: 2,
      proficiencyBonus: 3,
      derivedMods: { charisma: 4 },
      context
    });

    // 2 (WIS) + 3 (proficiency) + 4 (CHA from dual ability) + 1 (flat bonus)
    expect(result.bonus).toBe(10);
  });

  it('supports legacy skill_modifier_bonus and normalized skill keys', () => {
    const context = buildSkillComputationContext({
      character: {
        level: 5,
        classes: []
      },
      characterSkills: [],
      features: [
        {
          benefits: {
            type: 'skill_modifier_bonus',
            skills: ['Sleight of Hand'],
            bonus_source: 'charisma_modifier'
          }
        }
      ],
      statsTotals: {
        skills: {
          "sleight of hand": 2
        }
      }
    });

    const result = calculateSkillBonus({
      skillName: 'Sleight of Hand',
      baseMod: 1,
      proficiencyBonus: 3,
      derivedMods: { charisma: 4 },
      context
    });

    // 1 (DEX) + 4 (legacy additional ability) + 2 (flat bonus)
    expect(result.bonus).toBe(7);
  });
});
