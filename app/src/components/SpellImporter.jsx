import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SpellImporter() {
  const [jsonUrl, setJsonUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [editingSpell, setEditingSpell] = useState(null);

  const handleImport = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Get manual override values from form
      const isAttackChecked = document.getElementById('isAttack')?.checked || false;
      const isSaveChecked = document.getElementById('isSave')?.checked || false;
      const addModifierChecked = document.getElementById('addModifier')?.checked || false;
      const diceInput = document.getElementById('dice')?.value?.trim() || '';
      const effectTypeInput = document.getElementById('effectType')?.value?.trim() || '';
      const spellListsInput = document.getElementById('spellLists')?.value?.trim() || '';

      // Parse inputs
      const diceOverride = diceInput ? diceInput.split(',').map(d => d.trim()).filter(d => d) : null;
      const effectTypeOverride = effectTypeInput || null;
      const spellListsOverride = spellListsInput ? spellListsInput.split(',').map(s => s.trim()).filter(s => s) : null;

      // Fetch JSON from URL
      console.log('Fetching from:', jsonUrl);
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Fetched data:', data);

      // Transform and insert spells
      const spells = transformSpellData(data);
      console.log('Transformed spells:', spells.length);

      if (spells.length === 0) {
        throw new Error('No valid spells found in JSON');
      }

      // Apply manual overrides if provided
      const finalSpells = spells.map(spell => ({
        ...spell,
        is_attack: isAttackChecked ? true : spell.is_attack,
        is_save: isSaveChecked ? true : spell.is_save,
        add_modifier: addModifierChecked ? true : spell.add_modifier,
        dice: diceOverride || spell.dice,
        effect_type: effectTypeOverride || spell.effect_type,
        spell_lists: spellListsOverride || spell.spell_lists,
      }));

      // Insert into database
      const { data: insertedSpells, error: insertError } = await supabase
        .from('spells')
        .upsert(finalSpells, { 
          onConflict: 'name',
          ignoreDuplicates: false 
        })
        .select();

      if (insertError) {
        throw new Error(`Database error: ${insertError.message}`);
      }

      setResult({
        success: true,
        count: insertedSpells?.length || finalSpells.length,
        spells: insertedSpells || finalSpells,
      });

    } catch (err) {
      console.error('Import error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Transform various spell JSON formats to our schema
  const transformSpellData = (data) => {
    let spellArray = [];

    // Handle different JSON structures
    if (Array.isArray(data)) {
      spellArray = data;
    } else if (data.spells && Array.isArray(data.spells)) {
      spellArray = data.spells;
    } else if (data.results && Array.isArray(data.results)) {
      spellArray = data.results;
    } else if (typeof data === 'object') {
      // Single spell object
      spellArray = [data];
    }

    return spellArray
      .filter(spell => spell.name) // Must have a name
      .map(spell => {
        // Parse spell_lists - can be array, string (comma-separated), or object
        let spellLists = spell.spell_lists || spell.spellLists || null;
        if (typeof spellLists === 'string') {
          spellLists = spellLists.split(',').map(s => s.trim()).filter(s => s);
        } else if (!Array.isArray(spellLists)) {
          spellLists = null;
        }

        // Parse dice - can be array or string (comma-separated)
        let dice = spell.dice || spell.damage_dice || null;
        if (typeof dice === 'string') {
          dice = dice.split(',').map(d => d.trim()).filter(d => d);
        } else if (!Array.isArray(dice)) {
          dice = null;
        }

        // Parse effect_type - normalize to a standard value
        const effectType = spell.effect_type || spell.effectType || null;

        return {
          name: spell.name,
          level: spell.level ?? 0,
          school: spell.school?.name || spell.school || null,
          casting_time: spell.casting_time || spell.castingTime || null,
          range: spell.range || null,
          components: spell.components?.join(', ') || spell.components || null,
          duration: spell.duration || null,
          description: spell.desc?.join('\n') || spell.description || spell.desc || 'No description available',
          higher_levels: spell.higher_level?.join('\n') || spell.higherLevel || spell.higher_levels || null,
          is_attack: spell.is_attack ?? spell.isAttack ?? false,
          is_save: spell.is_save ?? spell.isSave ?? false,
          add_modifier: spell.add_modifier ?? spell.addModifier ?? false,
          dice: dice,
          effect_type: effectType,
          spell_lists: spellLists,
        };
      });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>📜 Import Spells</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Paste a URL to a JSON file containing spell data. Supports D&D 5e API format and simple spell arrays.
      </p>

      <form onSubmit={handleImport}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="jsonUrl" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            JSON URL:
          </label>
          <input
            id="jsonUrl"
            type="url"
            value={jsonUrl}
            onChange={(e) => setJsonUrl(e.target.value)}
            placeholder="https://example.com/spells.json"
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0 }}>Optional: Manual Combat Mechanics</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
            These can be auto-extracted from JSON or wikidot scraping. Leave empty to use extracted values.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="isAttack"
                defaultChecked={false}
              />
              <span>Spell Attack Roll</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="isSave"
                defaultChecked={false}
              />
              <span>Saving Throw</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="addModifier"
                defaultChecked={false}
              />
              <span>Add Modifier to Damage</span>
            </label>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="dice" style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
              Damage Dice (comma-separated, e.g., "1d6, 2d6, 3d6"):
            </label>
            <input
              id="dice"
              type="text"
              placeholder="1d8, 2d8, 3d8"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="effectType" style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
              Effect Type:
            </label>
            <select
              id="effectType"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            >
              <option value="">Select or leave auto-detected</option>
              <option value="Damage">Damage</option>
              <option value="Healing">Healing</option>
              <option value="Control">Control</option>
              <option value="Support">Support</option>
              <option value="Utility">Utility</option>
            </select>
          </div>

          <div>
            <label htmlFor="spellLists" style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>
              Spell Classes (comma-separated or leave for auto-detect, e.g., "Wizard, Sorcerer"):
            </label>
            <input
              id="spellLists"
              type="text"
              placeholder="Bard, Cleric, Wizard, Sorcerer"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !jsonUrl}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Importing...' : 'Import Spells'}
        </button>
      </form>

      {error && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#ffebee',
          border: '1px solid #f44336',
          borderRadius: '4px',
          color: '#c62828',
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#e8f5e9',
          border: '1px solid #4CAF50',
          borderRadius: '4px',
          color: '#2e7d32',
        }}>
          <strong>✅ Success!</strong> Imported {result.count} spell{result.count !== 1 ? 's' : ''}
          
          <details style={{ marginTop: '15px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
              View imported spells
            </summary>
            <ul style={{ marginTop: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {result.spells.map((spell, idx) => (
                <li key={idx} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #ccc' }}>
                  <strong>{spell.name}</strong> (Level {spell.level}, {spell.school || 'Unknown school'})
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    {spell.spell_lists && spell.spell_lists.length > 0 && (
                      <div>Classes: {spell.spell_lists.join(', ')}</div>
                    )}
                    {spell.dice && spell.dice.length > 0 && (
                      <div>Dice: {spell.dice.join(', ')}</div>
                    )}
                    {spell.effect_type && <div>Effect: {spell.effect_type}</div>}
                    {spell.is_attack && <div>✓ Attack Roll</div>}
                    {spell.is_save && <div>✓ Saving Throw</div>}
                    {spell.add_modifier && <div>✓ Add Modifier</div>}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h3>JSON Format & Field Reference:</h3>
        
        <h4>Core Fields (Required/Common):</h4>
        <ul>
          <li><code>name</code> - Spell name (required)</li>
          <li><code>level</code> - Spell level 0-9</li>
          <li><code>school</code> - School of magic</li>
          <li><code>casting_time</code> - How long to cast</li>
          <li><code>range</code> - Spell range</li>
          <li><code>components</code> - V, S, M components</li>
          <li><code>duration</code> - How long spell lasts</li>
          <li><code>description</code> - Spell description</li>
          <li><code>higher_levels</code> - Upcast behavior</li>
        </ul>

        <h4>Combat Mechanics (Optional):</h4>
        <ul>
          <li><code>is_attack</code> - Boolean, true if requires spell attack roll</li>
          <li><code>is_save</code> - Boolean, true if requires saving throw</li>
          <li><code>add_modifier</code> - Boolean, true if add spellcasting modifier to damage</li>
          <li><code>dice</code> - Array of damage dice: ["1d6"] or ["1d6", "2d6"] for upcasts</li>
          <li><code>effect_type</code> - Effect type: "Damage", "Healing", "Control", etc.</li>
          <li><code>spell_lists</code> - Array of classes: ["Cleric", "Wizard", "Druid"]</li>
        </ul>
        
        <h4>Example JSON (Array of spells):</h4>
        <pre style={{ backgroundColor: 'white', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
{`[
  {
    "name": "Fireball",
    "level": 3,
    "school": "Evocation",
    "casting_time": "1 action",
    "range": "150 feet",
    "components": "V, S, M",
    "duration": "Instantaneous",
    "description": "A bright streak flashes...",
    "higher_levels": "When you cast this spell...",
    "is_attack": false,
    "is_save": true,
    "add_modifier": true,
    "dice": ["8d6", "9d6", "10d6"],
    "effect_type": "Damage",
    "spell_lists": ["Sorcerer", "Wizard"]
  }
]`}
        </pre>

        <p style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>
          <strong>Note:</strong> All combat mechanics fields (is_attack, is_save, dice, effect_type, spell_lists) are optional and will default to safe values if omitted.
          The importer is flexible and will parse camelCase or snake_case field names.
        </p>

        <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          <strong>Tip:</strong> Try <a href="https://www.dnd5eapi.co/api/spells" target="_blank" rel="noopener noreferrer">D&D 5e API</a> - basic fields will import, combat fields can be filled in manually.
        </p>
      </div>
  );
}
