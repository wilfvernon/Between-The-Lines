import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkillsTab from './SkillsTab';

const baseProps = {
  character: {
    level: 5,
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    classes: []
  },
  proficiencyBonus: 3,
  skills: [],
  loading: false,
  derivedMods: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0
  },
  skillAdvantages: {},
  statsTotals: { skills: {} }
};

describe('SkillsTab feat/feature benefit normalization', () => {
  it('applies skill proficiency from direct benefit object', () => {
    render(
      <SkillsTab
        {...baseProps}
        features={[
          {
            benefits: {
              type: 'skill_proficiency',
              skills: ['Perception', 'sleight of hand'],
              alternate_skill: false
            }
          }
        ]}
      />
    );

    const perceptionRow = screen.getByText('Perception').closest('.skill-item');
    const sleightRow = screen.getByText('Sleight of Hand').closest('.skill-item');

    expect(perceptionRow).toHaveClass('proficient');
    expect(sleightRow).toHaveClass('proficient');
  });

  it('applies skill proficiency from wrapped benefits array', () => {
    render(
      <SkillsTab
        {...baseProps}
        features={[
          {
            benefits: {
              benefits: [
                {
                  type: 'skill_proficiency',
                  skills: ['Perception']
                }
              ]
            }
          }
        ]}
      />
    );

    const perceptionRow = screen.getByText('Perception').closest('.skill-item');
    expect(perceptionRow).toHaveClass('proficient');
  });
});
