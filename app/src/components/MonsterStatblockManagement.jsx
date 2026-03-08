import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseMonsterStatblock } from '../lib/monsterStatblockParser';

export default function MonsterStatblockManagement() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleParse = () => {
    setStatus('');
    try {
      const parsed = parseMonsterStatblock(input);
      setPreview(parsed);
      setStatus(`Parsed ${parsed.name}`);
    } catch (error) {
      setPreview(null);
      setStatus(`Parse failed: ${error.message}`);
    }
  };

  const handleImport = async () => {
    setStatus('');
    setLoading(true);

    try {
      const parsed = preview || parseMonsterStatblock(input);

      const { error } = await supabase
        .from('monster_statblocks')
        .upsert(parsed, { onConflict: 'name' });

      if (error) throw error;

      setPreview(parsed);
      setStatus(`Imported stat block: ${parsed.name}`);
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Monster Stat Blocks</h2>
      <p style={{ color: '#666', marginTop: 0 }}>
        Paste a monster-frame style stat block. This parser extracts core fields, traits, actions, and legendary actions.
      </p>

      <label htmlFor="monster-statblock-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
        Stat Block Source
      </label>
      <textarea
        id="monster-statblock-input"
        rows={18}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste monster stat block text here..."
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', marginBottom: '12px' }}
      />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <button type="button" onClick={handleParse} disabled={loading || !input.trim()}>
          Parse
        </button>
        <button type="button" onClick={handleImport} disabled={loading || !input.trim()}>
          {loading ? 'Importing...' : 'Import to DB'}
        </button>
      </div>

      {status && <p className="admin-status">{status}</p>}

      {preview && (
        <div style={{ marginTop: '14px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', background: '#fafafa' }}>
          <h3 style={{ marginTop: 0 }}>{preview.name}</h3>
          <p style={{ margin: '4px 0' }}>
            {preview.size} {preview.creature_type}, {preview.alignment}
          </p>
          <p style={{ margin: '4px 0' }}>
            AC {preview.armor_class_value} | HP {preview.hit_points_value} | CR {preview.challenge_rating}
          </p>
          <p style={{ margin: '4px 0' }}>
            Traits: {preview.traits?.length || 0} | Actions: {preview.actions?.length || 0} | Legendary: {preview.legendary_actions?.length || 0}
          </p>
        </div>
      )}
    </div>
  );
}
