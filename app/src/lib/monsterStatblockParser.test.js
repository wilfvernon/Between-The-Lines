import { describe, expect, it } from 'vitest';
import { parseMonsterStatblock } from './monsterStatblockParser';

describe('parseMonsterStatblock formulas', () => {
  it('preserves AC and HP formula notation', () => {
    const parsed = parseMonsterStatblock(`{{monster,frame
## Aberrant Spirit
*Medium aberration, neutral*
___
**Armor Class** :: ${'${7+spelllevel}'}
**Hit Points** :: ${'${10*spelllevel}'}
**Speed** :: 30 ft.
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|16 (+3)|10 (+0)|15 (+2)|16 (+3)|10 (+0)|6 (-2)|
___
**Challenge** :: None (XP 0; PB equals your Proficiency Bonus)
}}`);

    expect(parsed.armor_class_value).toBe('${7+spelllevel}');
    expect(parsed.hit_points_value).toBe('${10*spelllevel}');
  });

  it('moves parenthesized conditional speeds into a named form', () => {
    const parsed = parseMonsterStatblock(`{{monster,frame
## Aberrant Spirit
*Medium aberration, neutral*
___
**Speed** :: 30 ft.; Fly 30 ft. (hover; Beholderkin only)
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|16 (+3)|10 (+0)|15 (+2)|16 (+3)|10 (+0)|6 (-2)|
___
### Traits
***Whispering Aura (Mind Flayer Only).*** _Wisdom Saving Throw:_ DC ${'${spellsave}'}.
___
### Actions
***Eye Ray (Beholderkin Only).*** _Ranged Attack Roll:_ +${'${spellattack}'} to hit.
}}`);

    expect(parsed.speed).toEqual({ walk: 30 });
    expect(parsed.forms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Beholderkin',
        speed: { fly: 30 },
        speed_notes: { fly: 'hover' },
        traits: [],
        actions: [{ name: 'Eye Ray', text: '_Ranged Attack Roll:_ +${spellattack} to hit.' }],
        bonus_actions: [],
        reactions: []
      })
    ]));
    expect(parsed.forms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Mind Flayer',
        traits: [{ name: 'Whispering Aura', text: '_Wisdom Saving Throw:_ DC ${spellsave}.' }]
      })
    ]));
  });

  it('parses defensive traits and per-form bonus actions', () => {
    const parsed = parseMonsterStatblock(`{{monster,frame
## Vestige Companion
*Small celestial, neutral*
___
**Speed** :: 5 ft.; fly 30 ft. (hover)
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|1 (-5)|14 (+2)|10 (+0)|15 (+2)|15 (+2)|16 (+3)|
___
**Damage Resistances** :: poison (Celestial only), necrotic (Undead only)
**Condition Immunities** :: charmed, frightened, prone
___
### Bonus Actions
***Healing Touch (Celestial Only).*** The vestige touches another creature.
}}`);

    expect(parsed.damage_resistances).toEqual([]);
    expect(parsed.condition_immunities).toEqual(['charmed', 'frightened', 'prone']);
    expect(parsed.forms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Celestial',
        damage_resistances: ['poison'],
        bonus_actions: [{ name: 'Healing Touch', text: 'The vestige touches another creature.' }]
      }),
      expect.objectContaining({
        name: 'Undead',
        damage_resistances: ['necrotic']
      })
    ]));
  });

  it('keeps proficiency metadata on saving throws and skills', () => {
    const parsed = parseMonsterStatblock(`{{monster,frame
## Vestige Companion
*Small celestial, neutral*
___
**Speed** :: 30 ft.
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|10 (+0)|14 (+2)|16 (+3)|10 (+0)|12 (+1)|8 (-1)|
___
**Saving Throws** :: Dex +4 plus PB, Con +6
**Skills** :: Acrobatics +6 plus PB, Perception +3
___
**Challenge** :: 1 (XP 200)
}}`);

    expect(parsed.saving_throws).toEqual({
      dexterity: { value: 4, proficiency: true },
      constitution: 6
    });

    expect(parsed.skills).toEqual({
      acrobatics: { value: 6, proficiency: true },
      perception: 3
    });
  });

  it('emits a bare proficiency flag for "proficiency" save/skill lines', () => {
    const parsed = parseMonsterStatblock(`{{monster,frame
## Furbie
*Small celestial or undead, neutral*
___
**Speed** :: 5 ft.; fly 30 ft. (hover)
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|1 (-5)|14 (+2)|10 (+0)|15 (+2)|15 (+2)|16 (+3)|
___
**Saving Throws** :: proficiency
**Skills** :: proficiency
**Challenge** :: None (XP 0; PB equals your Proficiency Bonus)
}}`);

    expect(parsed.saving_throws).toEqual({ proficiency: true });
    expect(parsed.skills).toEqual({ proficiency: true });
  });
});
