import { describe, it, expect } from 'vitest';
import { collectBonuses, deriveCharacterStats } from '../lib/bonusEngine';

describe('bonusEngine', () => {
  describe('collectBonuses', () => {
    it('should collect bonuses from items', () => {
      const items = [
        {
          id: '1',
          name: 'Ring of Protection',
          bonuses: [{ target: 'ac', value: 1 }]
        }
      ];

      const bonuses = collectBonuses({ items, features: [], overrides: [] });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'ac',
        value: 1,
        type: 'untyped'
      });
      expect(bonuses[0].source.label).toBe('Ring of Protection');
    });

    it('should collect bonuses from features', () => {
      const features = [
        {
          id: '2',
          name: 'Rage',
          bonuses: [
            { target: 'damage', value: 2 },
            { target: 'ability.strength', value: 4 }
          ]
        }
      ];

      const bonuses = collectBonuses({ items: [], features, overrides: [] });

      expect(bonuses.length).toBe(2);
      const damageBonus = bonuses.find(b => b.target === 'damage');
      expect(damageBonus).toMatchObject({
        target: 'damage',
        value: 2
      });
      expect(damageBonus.source.label).toBe('Rage');
    });

    it('should handle overrides', () => {
      const overrides = [{ target: 'ac', value: 5 }];

      const bonuses = collectBonuses({ items: [], features: [], overrides });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'ac',
        value: 5
      });
      expect(bonuses[0].source.type).toBe('override');
    });
  });

  describe('deriveCharacterStats', () => {
    const baseStats = {
      abilities: {
        strength: 16,
        dexterity: 14,
        constitution: 15,
        intelligence: 10,
        wisdom: 12,
        charisma: 8
      },
      maxHP: 45,
      proficiency: 3,
      acBase: 12,
      initiativeBase: 2,
      passivePerceptionBase: 11,
      senses: [],
      speeds: { walk: 30 }
    };

    it('should derive base modifiers correctly', () => {
      const { derived } = deriveCharacterStats({ base: baseStats, bonuses: [] });

      expect(derived.modifiers.strength).toBe(3);
      expect(derived.modifiers.dexterity).toBe(2);
      expect(derived.modifiers.constitution).toBe(2);
      expect(derived.modifiers.intelligence).toBe(0);
      expect(derived.modifiers.wisdom).toBe(1);
      expect(derived.modifiers.charisma).toBe(-1);
    });

    it('should apply AC bonuses', () => {
      const bonuses = [
        { target: 'ac', value: 2, source: { label: 'Shield' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(derived.ac).toBe(14); // 12 base + 2 bonus
    });

    it('should apply maxHP bonuses', () => {
      const bonuses = [
        { target: 'maxHP', value: 10, source: { label: 'Tough Feat' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(derived.maxHP).toBe(55); // 45 base + 10 bonus
    });

    it('should apply initiative bonuses', () => {
      const bonuses = [
        { target: 'initiative', value: 2, source: { label: 'Alert Feat' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(derived.initiative).toBe(4); // 2 base + 2 bonus
    });

    it('should apply ability score bonuses', () => {
      const bonuses = [
        { target: 'ability.strength', value: 2, source: { label: 'Belt of Giant Strength' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(derived.abilities.strength).toBe(18); // 16 + 2
      expect(derived.modifiers.strength).toBe(4); // (18-10)/2
    });

    it('should merge senses with bonuses', () => {
      const baseWithSenses = {
        ...baseStats,
        senses: [{ sense_type: 'darkvision', range: 60 }]
      };

      const bonuses = [
        { target: 'sense.darkvision', value: 120, source: { label: 'Goggles of Night' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseWithSenses, bonuses });

      expect(derived.senses).toHaveLength(1);
      expect(derived.senses[0].range).toBe(120); // Takes max of base (60) and bonus (120)
    });

    it('should merge speeds with bonuses', () => {
      const bonuses = [
        { target: 'speed.walk', value: 10, source: { label: 'Longstrider' } },
        { target: 'speed.fly', value: 30, source: { label: 'Winged Boots' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(derived.speeds.walk).toBe(40); // 30 + 10
      expect(derived.speeds.fly).toBe(30); // New speed added
    });

    it('should track bonus sources', () => {
      const bonuses = [
        { target: 'ac', value: 2, source: { label: 'Shield' } },
        { target: 'ac', value: 1, source: { label: 'Ring of Protection' } }
      ];

      const { sources } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(sources.ac.length).toBe(2);
      expect(sources.ac[0]).toMatchObject({ value: 2, target: 'ac' });
      expect(sources.ac[0].source.label).toBe('Shield');
      expect(sources.ac[1]).toMatchObject({ value: 1, target: 'ac' });
      expect(sources.ac[1].source.label).toBe('Ring of Protection');
    });

    it('should handle skill bonuses', () => {
      const bonuses = [
        { target: 'skill.Perception', value: 2, source: { label: 'Observant Feat' } }
      ];

      const { sources } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(sources.skills.Perception).toBeDefined();
      expect(sources.skills.Perception.length).toBe(1);
      expect(sources.skills.Perception[0]).toMatchObject({
        value: 2,
        target: 'skill.Perception'
      });
      expect(sources.skills.Perception[0].source.label).toBe('Observant Feat');
    });

    it('should handle saving throw bonuses', () => {
      const bonuses = [
        { target: 'save.strength', value: 1, source: { label: 'Cloak of Resistance' } }
      ];

      const { sources } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(sources.saves.strength).toBeDefined();
      expect(sources.saves.strength.length).toBe(1);
      expect(sources.saves.strength[0]).toMatchObject({
        value: 1,
        target: 'save.strength'
      });
      expect(sources.saves.strength[0].source.label).toBe('Cloak of Resistance');
    });

    it('should apply passivePerception bonuses', () => {
      const bonuses = [
        { target: 'passivePerception', value: 5, source: { label: 'Advantage on Perception' } }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      expect(derived.passivePerception).toBe(16); // 11 base + 5 bonus
    });
  });
});

