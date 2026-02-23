import { describe, it, expect } from 'vitest';

// Test helper function - extracted from CharacterSheet for testing
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

describe('convertAbilityScoresToBonuses', () => {
  describe('handles all 6 ability scores', () => {
    it('should convert STR improvement', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Soldier',
          abilities: ['STR: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(1);
      expect(bonuses[0]).toMatchObject({
        target: 'ability.strength',
        value: 2,
        source: { label: 'Background - Soldier', type: 'ability-score-improvement' }
      });
    });

    it('should convert DEX improvement', () => {
      const improvements = [
        {
          source: 'Race',
          sourceType: 'Elf',
          abilities: ['DEX: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(1);
      expect(bonuses[0].target).toBe('ability.dexterity');
      expect(bonuses[0].value).toBe(2);
    });

    it('should convert CON improvement', () => {
      const improvements = [
        {
          source: 'Feat',
          sourceType: 'Tough',
          abilities: ['CON: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses[0].target).toBe('ability.constitution');
      expect(bonuses[0].value).toBe(2);
    });

    it('should convert INT improvement', () => {
      const improvements = [
        {
          source: 'Item',
          sourceType: 'Tome of Clear Thought',
          abilities: ['INT: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses[0].target).toBe('ability.intelligence');
      expect(bonuses[0].value).toBe(2);
    });

    it('should convert WIS improvement', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Hermit',
          abilities: ['WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses[0].target).toBe('ability.wisdom');
      expect(bonuses[0].value).toBe(1);
    });

    it('should convert CHA improvement', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Hermit',
          abilities: ['CHA: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses[0].target).toBe('ability.charisma');
      expect(bonuses[0].value).toBe(2);
    });
  });

  describe('handles multiple abilities per improvement', () => {
    it('should convert multiple abilities from single improvement (Hermit background)', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Hermit',
          abilities: ['CHA: 2', 'WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(2);
      expect(bonuses[0]).toMatchObject({
        target: 'ability.charisma',
        value: 2
      });
      expect(bonuses[1]).toMatchObject({
        target: 'ability.wisdom',
        value: 1
      });
    });

    it('should handle all 6 abilities in one improvement', () => {
      const improvements = [
        {
          source: 'Universal Bonus',
          abilities: ['STR: 1', 'DEX: 1', 'CON: 1', 'INT: 1', 'WIS: 1', 'CHA: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(6);
      expect(bonuses.map(b => b.target).sort()).toEqual([
        'ability.charisma',
        'ability.constitution',
        'ability.dexterity',
        'ability.intelligence',
        'ability.strength',
        'ability.wisdom'
      ].sort());
      bonuses.forEach(bonus => {
        expect(bonus.value).toBe(1);
      });
    });
  });

  describe('handles multiple improvements', () => {
    it('should merge multiple improvements', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Hermit',
          abilities: ['CHA: 2', 'WIS: 1']
        },
        {
          source: 'Race',
          sourceType: 'Human',
          abilities: ['STR: 1']
        },
        {
          source: 'Feat',
          sourceType: 'Level 4 ASI',
          abilities: ['DEX: 2', 'CON: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(5);
      
      const chaBonus = bonuses.find(b => b.target === 'ability.charisma');
      expect(chaBonus.value).toBe(2);
      expect(chaBonus.source.label).toBe('Background - Hermit');

      const strBonus = bonuses.find(b => b.target === 'ability.strength');
      expect(strBonus.value).toBe(1);
      expect(strBonus.source.label).toBe('Race - Human');

      const dexBonus = bonuses.find(b => b.target === 'ability.dexterity');
      expect(dexBonus.value).toBe(2);
      expect(dexBonus.source.label).toBe('Feat - Level 4 ASI');
    });
  });

  describe('source labeling', () => {
    it('should include sourceType in label when provided', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Hermit',
          abilities: ['WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses[0].source.label).toBe('Background - Hermit');
    });

    it('should use source only when sourceType not provided', () => {
      const improvements = [
        {
          source: 'Item Bonus',
          abilities: ['STR: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses[0].source.label).toBe('Item Bonus');
    });

    it('should always set source type to ability-score-improvement', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Hermit',
          abilities: ['CHA: 2', 'WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      bonuses.forEach(bonus => {
        expect(bonus.source.type).toBe('ability-score-improvement');
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty improvements array', () => {
      const bonuses = convertAbilityScoresToBonuses([]);

      expect(bonuses).toEqual([]);
    });

    it('should handle undefined improvements', () => {
      const bonuses = convertAbilityScoresToBonuses(undefined);

      expect(bonuses).toEqual([]);
    });

    it('should handle empty abilities array', () => {
      const improvements = [
        {
          source: 'Background',
          abilities: []
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toEqual([]);
    });

    it('should skip invalid ability abbreviations', () => {
      const improvements = [
        {
          source: 'Test',
          abilities: ['STR: 2', 'INVALID: 1', 'WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      // Should only convert STR and WIS, skip INVALID
      expect(bonuses).toHaveLength(2);
      expect(bonuses.map(b => b.target)).toEqual([
        'ability.strength',
        'ability.wisdom'
      ]);
    });

    it('should skip malformed ability strings', () => {
      const improvements = [
        {
          source: 'Test',
          abilities: ['STR: 2', 'MALFORMED', 'WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      // Should only convert valid entries
      expect(bonuses).toHaveLength(2);
    });

    it('should handle non-numeric values', () => {
      const improvements = [
        {
          source: 'Test',
          abilities: ['STR: abc', 'DEX: 2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      // Should skip STR with non-numeric value
      expect(bonuses).toHaveLength(1);
      expect(bonuses[0].target).toBe('ability.dexterity');
    });

    it('should handle negative improvement values', () => {
      const improvements = [
        {
          source: 'Curse',
          abilities: ['STR: -2']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      // Negative values should be allowed (curses, penalties)
      expect(bonuses).toHaveLength(1);
      expect(bonuses[0].value).toBe(-2);
    });

    it('should handle case-insensitive ability abbreviations', () => {
      const improvements = [
        {
          source: 'Test',
          abilities: ['str: 2', 'dex: 1', 'WIS: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(3);
      expect(bonuses.map(b => b.target).sort()).toEqual([
        'ability.dexterity',
        'ability.strength',
        'ability.wisdom'
      ].sort());
    });
  });

  describe('real-world character scenarios', () => {
    it('should convert Hermit background bonuses for Hazel', () => {
      const improvements = [
        {
          amount: 1,
          source: 'Background',
          abilities: ['CHA: 2', 'WIS: 1'],
          sourceType: 'Hermit'
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(2);
      
      const chaBonus = bonuses.find(b => b.target === 'ability.charisma');
      expect(chaBonus).toMatchObject({
        target: 'ability.charisma',
        value: 2,
        source: { label: 'Background - Hermit', type: 'ability-score-improvement' }
      });

      const wisBonus = bonuses.find(b => b.target === 'ability.wisdom');
      expect(wisBonus).toMatchObject({
        target: 'ability.wisdom',
        value: 1,
        source: { label: 'Background - Hermit', type: 'ability-score-improvement' }
      });
    });

    it('should handle combined improvements (initial ability bonuses + feats + magic items)', () => {
      const improvements = [
        {
          source: 'Background',
          sourceType: 'Soldier',
          abilities: ['STR: 1']
        },
        {
          source: 'Feat',
          sourceType: 'Level 4 ASI',
          abilities: ['STR: 2', 'CON: 1']
        },
        {
          source: 'Race',
          sourceType: 'Human',
          abilities: ['CHA: 1']
        }
      ];

      const bonuses = convertAbilityScoresToBonuses(improvements);

      expect(bonuses).toHaveLength(4);

      const strBonuses = bonuses.filter(b => b.target === 'ability.strength');
      expect(strBonuses).toHaveLength(2);
      expect(strBonuses.map(b => b.value).sort()).toEqual([1, 2]);
    });
  });
});
