import { describe, it, expect } from 'vitest';
import { parseSpellHtml } from './wikidotScrapers';

describe('parseSpellHtml', () => {
  it('expands leveled spell dice scaling for each slot level above base level', () => {
    const html = `
      <html>
        <head><title>Burning Hands - D&D 5e</title></head>
        <body>
          <div id="page-content">Burning Hands
1st-level Evocation
Casting Time: 1 action
Range: Self (15-foot cone)
Components: V, S
Duration: Instantaneous
As you hold your hands with thumbs touching and fingers spread, a thin sheet of flames shoots forth from your outstretched fingertips.
Each creature in a 15-foot cone must make a Dexterity saving throw. A creature takes 3d6 Fire damage on a failed save, or half as much damage on a successful one.
At Higher Levels. The damage increases by 1d6 for each spell slot level above 1.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['3d6', '4d6', '5d6', '6d6', '7d6', '8d6', '9d6', '10d6', '11d6']);
  });

  it('expands non-d6 scaling dice (d8) for leveled spells', () => {
    const html = `
      <html>
        <head><title>Chromatic Orb - D&D 5e</title></head>
        <body>
          <div id="page-content">Chromatic Orb
1st-level Evocation
Casting Time: 1 action
Range: 90 feet
Components: V, S, M
Duration: Instantaneous
You hurl a 4-inch-diameter sphere of energy at a creature that you can see within range. Make a ranged spell attack. On a hit, the creature takes 3d8 Fire damage.
At Higher Levels. The damage increases by 1d8 for each spell slot level above 1st.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['3d8', '4d8', '5d8', '6d8', '7d8', '8d8', '9d8', '10d8', '11d8']);
  });

  it('handles 2024 wikidot level format ("Level 1") without falling back to cantrip extraction', () => {
    const html = `
      <html>
        <head><title>Chromatic Orb - D&D 2024</title></head>
        <body>
          <div id="page-content">Cantrip navigation text
Chromatic Orb
Level 1 Evocation
Casting Time: 1 action
Range: 90 feet
Components: V, S, M
Duration: Instantaneous
You hurl an orb of energy at a target. Make a ranged spell attack. On a hit, the target takes 3d8 Acid damage.
At Higher Levels. The damage increases by 1d8 for each spell slot level above 1.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['3d8', '4d8', '5d8', '6d8', '7d8', '8d8', '9d8', '10d8', '11d8']);
  });

  it('expands non-d6 scaling dice (d10) for leveled spells', () => {
    const html = `
      <html>
        <head><title>Inflict Wounds - D&D 5e</title></head>
        <body>
          <div id="page-content">Inflict Wounds
1st-level Necromancy
Casting Time: 1 action
Range: Touch
Components: V, S
Duration: Instantaneous
Make a melee spell attack against a creature you can reach. On a hit, the target takes 3d10 Necrotic damage.
At Higher Levels. The damage increases by 1d10 for every spell slot level above 1.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['3d10', '4d10', '5d10', '6d10', '7d10', '8d10', '9d10', '10d10', '11d10']);
  });

  it('expands d4 scaling dice for leveled spells', () => {
    const html = `
      <html>
        <head><title>Ice Knife - D&D 5e</title></head>
        <body>
          <div id="page-content">Ice Knife
1st-level Conjuration
Casting Time: 1 action
Range: 60 feet
Components: S, M
Duration: Instantaneous
On a hit, the target takes 1d4 Piercing damage.
At Higher Levels. The damage increases by 1d4 for each spell slot level above 1st.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['1d4', '2d4', '3d4', '4d4', '5d4', '6d4', '7d4', '8d4', '9d4']);
  });

  it('expands d12 scaling dice for leveled spells', () => {
    const html = `
      <html>
        <head><title>Test d12 Spell - D&D 5e</title></head>
        <body>
          <div id="page-content">Test d12 Spell
1st-level Evocation
Casting Time: 1 action
Range: 60 feet
Components: V, S
Duration: Instantaneous
The target takes 2d12 Force damage.
At Higher Levels. The damage increases by 1d12 for each spell slot level above 1.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['2d12', '3d12', '4d12', '5d12', '6d12', '7d12', '8d12', '9d12', '10d12']);
  });

  it('expands multi-die scaling increments like 2d4', () => {
    const html = `
      <html>
        <head><title>Test 2d4 Spell - D&D 5e</title></head>
        <body>
          <div id="page-content">Test 2d4 Spell
1st-level Evocation
Casting Time: 1 action
Range: 60 feet
Components: V, S
Duration: Instantaneous
The target takes 2d4 Fire damage.
At Higher Levels. The damage increases by 2d4 for each spell slot level above 1.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice).toEqual(['2d4', '4d4', '6d4', '8d4', '10d4', '12d4', '14d4', '16d4', '18d4']);
  });

  it('parses cantrip upgrade marker as higher-level section', () => {
    const html = `
      <html>
        <head><title>Fire Bolt - D&D 5e</title></head>
        <body>
          <div id="page-content">Fire Bolt
Evocation Cantrip
Casting Time: 1 action
Range: 120 feet
Components: V, S
Duration: Instantaneous
You hurl a mote of fire at a creature or object within range. Make a ranged spell attack. On a hit, the target takes 1d10 Fire damage.
Cantrip Upgrade. This spell's damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(0);
    expect(parsed.higher_levels).toContain("damage increases by 1d10");
    expect(parsed.description).toContain('target takes 1d10 Fire damage');
    expect(parsed.description).not.toContain('Cantrip Upgrade');
  });

  it('does not misclassify leveled spells as cantrips when cantrip text appears early', () => {
    const html = `
      <html>
        <head><title>Test Spell - D&D 5e</title></head>
        <body>
          <div id="page-content">Cantrip list reference text
1st-level Evocation
Casting Time: 1 action
Range: 60 feet
Components: V, S
Duration: Instantaneous
A creature takes 3d6 Fire damage.
At Higher Levels. The damage increases by 1d6 for each spell slot level above 1.
          </div>
        </body>
      </html>
    `;

    const parsed = parseSpellHtml(html);

    expect(parsed.level).toBe(1);
    expect(parsed.dice?.[0]).toBe('3d6');
    expect(parsed.dice?.[1]).toBe('4d6');
  });
});
