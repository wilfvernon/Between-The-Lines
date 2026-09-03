import { describe, expect, it } from 'vitest';
import { normalizeFeatChoices } from './featChoices';

describe('feat spell preparation modes', () => {
  it('keeps the default Fey Touched-style spell grant eligible for a free use', () => {
    const result = normalizeFeatChoices({
      feat: { name: 'Fey Touched' },
      choices: { spellsChosen: ['Misty Step'] }
    });

    expect(result.grantedSpells).toEqual([
      { name: 'Misty Step', uses: undefined }
    ]);
  });

  it('marks dedicated spell_preparation benefits as slot-gated', () => {
    const result = normalizeFeatChoices({
      feat: {
        name: 'Conjuration Adept',
        benefits: {
          type: 'spell_preparation',
          spells: [{ name: 'Misty Step' }]
        }
      }
    });

    expect(result.grantedSpells[0]).toMatchObject({
      name: 'Misty Step',
      requires_spell_slot: true
    });
  });
});
