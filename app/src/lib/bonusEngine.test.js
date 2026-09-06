import { describe, it, expect, vi } from 'vitest';
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

    it('should collect initiative_bonus from feature benefits array', () => {
      const features = [
        {
          id: 'feat-1',
          name: 'Alert Instinct',
          benefits: [
            { type: 'initiative_bonus', bonus: 'proficiency' }
          ]
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: { proficiency: 3 },
        overrides: []
      });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'initiative',
        value: 3
      });
    });

    it('should extend skill_bonus "all" to initiative', () => {
      const features = [
        {
          id: 'feat-lucky',
          name: 'Stone of Good Luck',
          benefits: [{ type: 'skill_bonus', amount: 1, skills: ['all'] }]
        }
      ];

      const bonuses = collectBonuses({ items: [], features, overrides: [] });

      const initiativeBonus = bonuses.find((b) => b.target === 'initiative');
      expect(initiativeBonus).toMatchObject({ target: 'initiative', value: 1 });
      expect(bonuses.filter((b) => b.target.startsWith('skill.')).length).toBe(18);
    });

    it('should not extend named skill_bonus to initiative', () => {
      const features = [
        {
          id: 'feat-focused',
          name: 'Keen Mind',
          benefits: [{ type: 'skill_bonus', amount: 2, skills: ['perception'] }]
        }
      ];

      const bonuses = collectBonuses({ items: [], features, overrides: [] });

      expect(bonuses.find((b) => b.target === 'initiative')).toBeUndefined();
    });

    it('should resolve ability references in ac_bonus', () => {
      const features = [
        {
          id: 'feat-ac-1',
          name: 'Blessed Warding',
          benefits: [{ type: 'ac_bonus', value: 'charisma' }]
        },
        {
          id: 'feat-ac-2',
          name: 'Arcane Deflection',
          benefits: [{ type: 'ac_bonus', bonus_source: 'charisma_modifier' }]
        },
        {
          id: 'feat-ac-3',
          name: 'Ring of Warding',
          benefits: [{ type: 'ac_bonus', value: 2 }]
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: { charisma: 18 },
        overrides: []
      });

      const acBonuses = bonuses.filter((b) => b.target === 'ac');
      expect(acBonuses.map((b) => b.value)).toEqual([4, 4, 2]);
    });

    it('should collect initiative_bonus from single-object benefits shape', () => {
      const features = [
        {
          id: 'feat-2',
          name: 'Aura of Readiness',
          benefits: { type: 'initiative_bonus', bonus: 'Proficiency' }
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: { proficiency: 4 },
        overrides: []
      });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'initiative',
        value: 4
      });
    });

    it('should not warn for known spell and weapon benefit aliases', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const features = [{
        id: 'feat-known-aliases',
        name: 'Known Alias Feature',
        benefits: [
          { type: 'spell_attack_bonus', amount: 2 },
          { type: 'spellcasting_bonus', applies_to: 'dc', amount: 1 },
          { type: 'weapon_attack_bonus', amount: 1 },
          { type: 'weapon_damage_bonus', amount: 2 },
          { type: 'pact_weapon' }
        ]
      }];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: {},
        overrides: []
      });

      expect(bonuses).toEqual(expect.arrayContaining([
        expect.objectContaining({ target: 'spell_attack', value: 2 }),
        expect.objectContaining({ target: 'spell_save_dc', value: 1 }),
        expect.objectContaining({ target: 'melee_weapon_attack', value: 1 }),
        expect.objectContaining({ target: 'melee_weapon_damage', value: 2 })
      ]));
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown benefit type'));
      warnSpy.mockRestore();
    });

    it('should collect ac_override with normalized mods and shield allowance', () => {
      const features = [
        {
          id: 'feat-3',
          name: 'Armoured Piscene',
          benefits: {
            type: 'ac_override',
            base: 13,
            mods: ['CON'],
            shields_allowed: true
          }
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: {
          constitution: 16,
          shield_bonus: 2
        },
        overrides: []
      });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'ac_override',
        value: 13,
        mods: ['constitution'],
        shieldsAllowed: true,
        shieldBonus: 2
      });
    });

    it('should ignore select container benefits until the UI resolves a choice', () => {
      const features = [
        {
          id: 'feat-4',
          name: 'Versatile Guard',
          benefits: {
            type: 'select',
            select: {
              choices: ['1H', '2H'],
              '2H': { type: 'ac_bonus', shield_ignore: true }
            }
          }
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: {},
        overrides: []
      });

      expect(bonuses).toEqual([]);
    });

    it('should collect max_hp_bonus from level using bonus_source', () => {
      const features = [
        {
          id: 'feat-hp-1',
          name: 'Hardy Frame',
          benefits: {
            type: 'max_hp_bonus',
            bonus_source: 'level'
          }
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: { level: 7 },
        overrides: []
      });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'maxHP',
        value: 7
      });
    });

    it('should support negative hp bonus formulas', () => {
      const features = [
        {
          id: 'feat-hp-2',
          name: 'Life Tax',
          benefits: {
            type: 'hp_bonus',
            formula: '-level'
          }
        }
      ];

      const bonuses = collectBonuses({
        items: [],
        features,
        baseCharacterData: { level: 5 },
        overrides: []
      });

      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toMatchObject({
        target: 'maxHP',
        value: -5
      });
    });

    it('should apply a filtered spell damage bonus to matching cantrips', () => {
      const bonuses = collectBonuses({
        items: [],
        features: [{
          name: 'Potent Spellcasting',
          benefits: {
            type: 'spell_damage_bonus',
            spell_lists: ['Cleric'],
            spell_level: 0,
            modifier: 'wisdom_modifier'
          }
        }],
        baseCharacterData: {
          wisdom: 16,
          spells: [
            { spell: { name: 'Sacred Flame', level: 0, spell_lists: ['Cleric'] } },
            { spell: { name: 'Guidance', level: 0, spell_lists: ['Cleric'] } },
            { spell: { name: 'Bless', level: 1, spell_lists: ['Cleric'] } },
            { spell: { name: 'Fire Bolt', level: 0, spell_lists: ['Wizard'] } }
          ]
        },
        overrides: []
      });

      expect(bonuses).toEqual(expect.arrayContaining([
        expect.objectContaining({ target: 'spell.Sacred Flame', value: 3 }),
        expect.objectContaining({ target: 'spell.Guidance', value: 3 })
      ]));
      expect(bonuses).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ target: 'spell.Bless' }),
        expect.objectContaining({ target: 'spell.Fire Bolt' })
      ]));
    });

    it('should collect Innate Sorcery spell DC and spell attack advantage benefits', () => {
      const bonuses = collectBonuses({
        items: [],
        features: [{
          name: 'Innate Sorcery',
          benefits: [
            { type: 'spell_save_dc_bonus', amount: 1, spell_lists: ['Sorcerer'] },
            { type: 'spell_attack_advantage', spell_lists: ['Sorcerer'] }
          ]
        }],
        baseCharacterData: {},
        overrides: []
      });

      expect(bonuses).toEqual(expect.arrayContaining([
        expect.objectContaining({ target: 'spell_save_dc', value: 1, spellLists: ['sorcerer'] }),
        expect.objectContaining({ target: 'advantage.spell_attack', spellLists: ['sorcerer'] })
      ]));
    });

    it('should resolve a speed benefit that references another movement type', () => {
      const bonuses = collectBonuses({
        items: [],
        features: [{
          name: 'Sprout Wings',
          benefits: [{ type: 'speed', movement_type: 'fly', speed_value: 'walk' }]
        }],
        baseCharacterData: { speeds: { walk: 35 } },
        overrides: []
      });

      expect(bonuses).toEqual([
        expect.objectContaining({ target: 'speed.fly', value: 35 })
      ]);
    });

    it('should still parse numeric speed values and movement type aliases', () => {
      const bonuses = collectBonuses({
        items: [],
        features: [{
          name: 'Longstrider',
          benefits: [{ type: 'speed', movement_type: 'Walking', speed_value: '40ft' }]
        }],
        baseCharacterData: {},
        overrides: []
      });

      expect(bonuses).toEqual([
        expect.objectContaining({ target: 'speed.walk', value: 40 })
      ]);
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

    it('should apply ac_override formula with shield and still stack ac bonuses', () => {
      const bonuses = [
        {
          target: 'ac_override',
          value: 13,
          mods: ['constitution'],
          shieldsAllowed: true,
          shieldBonus: 2,
          source: { label: 'Armoured Piscene' }
        },
        {
          target: 'ac',
          value: 1,
          source: { label: 'Ring of Protection' }
        }
      ];

      const { derived } = deriveCharacterStats({ base: baseStats, bonuses });

      // 13 + CON mod(2) + shield(2) + ac bonus(1)
      expect(derived.ac).toBe(18);
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

    it('should merge speed bonuses into equivalent base speed keys', () => {
      const bonuses = [{ target: 'speed.walk', value: 10, source: { label: 'Apex Predator' } }];

      const { derived } = deriveCharacterStats({
        base: { ...baseStats, speeds: { Walking: 30 } },
        bonuses
      });

      expect(derived.speeds).toEqual({ walk: 40 });
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

  describe('skill_bonus benefit type', () => {
    it('should add flat bonuses to specific skills', () => {
      const feature = {
        id: 'test-feature',
        name: 'Test Feature',
        benefits: [
          {
            type: 'skill_bonus',
            skills: ['perception', 'insight'],
            amount: 2
          }
        ]
      };

      const bonuses = collectBonuses({ features: [feature] });

      expect(bonuses.length).toBe(2);
      
      const perceptionBonus = bonuses.find(b => b.target === 'skill.perception');
      expect(perceptionBonus).toBeDefined();
      expect(perceptionBonus.value).toBe(2);
      expect(perceptionBonus.type).toBe('untyped');
      expect(perceptionBonus.source.label).toBe('Test Feature');

      const insightBonus = bonuses.find(b => b.target === 'skill.insight');
      expect(insightBonus).toBeDefined();
      expect(insightBonus.value).toBe(2);
    });

    it('should expand "all" to all 18 skills', () => {
      const feature = {
        id: 'jack-of-all-trades',
        name: 'Jack of All Trades',
        benefits: [
          {
            type: 'skill_bonus',
            skills: ['all'],
            amount: 1
          }
        ]
      };

      const bonuses = collectBonuses({ features: [feature] });

      // 18 skill bonuses plus initiative (an ability check)
      expect(bonuses.length).toBe(19);
      expect(bonuses.every(b => b.value === 1)).toBe(true);
      expect(bonuses.filter(b => b.target.startsWith('skill.')).length).toBe(18);
      expect(bonuses.find(b => b.target === 'initiative')).toBeDefined();
      
      // Verify some specific skills
      expect(bonuses.find(b => b.target === 'skill.perception')).toBeDefined();
      expect(bonuses.find(b => b.target === 'skill.stealth')).toBeDefined();
      expect(bonuses.find(b => b.target === 'skill.arcana')).toBeDefined();
      expect(bonuses.find(b => b.target === 'skill.athletics')).toBeDefined();
    });

    it('should respect bonus_type if provided', () => {
      const feature = {
        id: 'test',
        name: 'Test',
        benefits: [
          {
            type: 'skill_bonus',
            skills: ['stealth'],
            amount: 3,
            bonus_type: 'circumstance'
          }
        ]
      };

      const bonuses = collectBonuses({ features: [feature] });

      expect(bonuses[0].type).toBe('circumstance');
    });
  });

  describe('save_bonus benefit type', () => {
    it('should add flat bonuses to specific saves', () => {
      const feature = {
        id: 'test-feature',
        name: 'Test Feature',
        benefits: [
          {
            type: 'save_bonus',
            abilities: ['wisdom', 'charisma'],
            amount: 2
          }
        ]
      };

      const bonuses = collectBonuses({ features: [feature] });

      expect(bonuses.length).toBe(2);
      
      const wisdomBonus = bonuses.find(b => b.target === 'save.wisdom');
      expect(wisdomBonus).toBeDefined();
      expect(wisdomBonus.value).toBe(2);
      expect(wisdomBonus.type).toBe('untyped');
      expect(wisdomBonus.source.label).toBe('Test Feature');

      const charismaBonus = bonuses.find(b => b.target === 'save.charisma');
      expect(charismaBonus).toBeDefined();
      expect(charismaBonus.value).toBe(2);
    });

    it('should expand "all" to all 6 ability saves', () => {
      const feature = {
        id: 'resilient',
        name: 'Resilient',
        benefits: [
          {
            type: 'save_bonus',
            abilities: ['all'],
            amount: 1
          }
        ]
      };

      const bonuses = collectBonuses({ features: [feature] });

      // Should have 6 bonuses (one for each ability)
      expect(bonuses.length).toBe(6);
      expect(bonuses.every(b => b.value === 1)).toBe(true);
      expect(bonuses.every(b => b.target.startsWith('save.'))).toBe(true);
      
      // Verify all abilities
      expect(bonuses.find(b => b.target === 'save.strength')).toBeDefined();
      expect(bonuses.find(b => b.target === 'save.dexterity')).toBeDefined();
      expect(bonuses.find(b => b.target === 'save.constitution')).toBeDefined();
      expect(bonuses.find(b => b.target === 'save.intelligence')).toBeDefined();
      expect(bonuses.find(b => b.target === 'save.wisdom')).toBeDefined();
      expect(bonuses.find(b => b.target === 'save.charisma')).toBeDefined();
    });

    it('should respect bonus_type if provided', () => {
      const feature = {
        id: 'test',
        name: 'Test',
        benefits: [
          {
            type: 'save_bonus',
            abilities: ['constitution'],
            amount: 5,
            bonus_type: 'enhancement'
          }
        ]
      };

      const bonuses = collectBonuses({ features: [feature] });

      expect(bonuses[0].type).toBe('enhancement');
    });
  });
});

