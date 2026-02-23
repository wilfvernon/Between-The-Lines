import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { fetchWikidot } from '../lib/wikidotUtils';
import { parseItemHtml } from '../lib/wikidotScrapers';

export default function MagicItemManagement({ prefill, onPrefillConsumed }) {
  const [mode, setMode] = useState('manual'); // 'manual' or 'scrape'
  
  // Manual entry fields
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [rarity, setRarity] = useState('');
  const [attunementRequired, setAttunementRequired] = useState('');
  const [description, setDescription] = useState('');
  const [properties, setProperties] = useState('');
  
  // Scraper fields
  const [wikidotInput, setWikidotInput] = useState('http://dnd2024.wikidot.com/magic-item:bag-of-holding');
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'html'
  
  // Status
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setName('');
    setType('');
    setRarity('');
    setAttunementRequired('');
    setDescription('');
    setProperties('');
  };

  useEffect(() => {
    if (!prefill) return;
    setMode('manual');
    setName(prefill.name || '');
    setType(prefill.type || '');
    setRarity(prefill.rarity || '');
    setAttunementRequired(prefill.requires_attunement || prefill.attunement_required || '');
    setDescription(prefill.description || '');
    if (prefill.properties) {
      setProperties(JSON.stringify(prefill.properties, null, 2));
    } else {
      setProperties('');
    }
    setStatus('⚠️ Prefilled from character import. Review and save.');
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  const scrapeWikidot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');
    
    try {
      let html;
      
      if (inputMode === 'url') {
        // Fetch via CORS proxy
        html = await fetchWikidot(wikidotInput);
      } else {
        // Direct HTML paste
        html = wikidotInput;
      }
      
      // Parse HTML using shared parser
      const scraped = parseItemHtml(html);
      
      // Populate form fields (don't auto-save)
      setName(scraped.name || '');
      setType(scraped.type || '');
      setRarity(scraped.rarity || '');
      setAttunementRequired(scraped.requires_attunement || '');
      setDescription(scraped.description || '');
      if (scraped.properties && typeof scraped.properties === 'object') {
        setProperties(JSON.stringify(scraped.properties, null, 2));
      } else {
        setProperties('');
      }
      
      setStatus('✅ Successfully scraped magic item data! Review and click Save.');
      
    } catch (error) {
      console.error('Scrape error:', error);
      setStatus(`❌ Scrape failed: ${error.message}. Try pasting the HTML directly instead.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');
    
    try {
      // Parse properties JSON if provided
      let propertiesJson = null;
      if (properties.trim()) {
        try {
          propertiesJson = JSON.parse(properties);
        } catch {
          throw new Error('Properties must be valid JSON or empty');
        }
      }
      
      const { data, error } = await supabase
        .from('magic_items')
        .upsert({
          name,
          type: type || null,
          rarity: rarity || null,
          requires_attunement: attunementRequired || null,
          description,
          properties: propertiesJson
        }, {
          onConflict: 'name'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setStatus(`✅ Magic item "${data.name}" saved successfully!`);
      resetForm();
      
    } catch (error) {
      console.error('Save error:', error);
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px' }}>
      <h2 style={{ marginBottom: '20px' }}>Magic Item Management</h2>
      
      {status && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '4px',
          background: status.includes('✅') ? '#d4edda' : '#f8d7da',
          color: status.includes('✅') ? '#155724' : '#721c24',
          border: `1px solid ${status.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {status}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => setMode('manual')}
          style={{
            padding: '10px 20px',
            background: mode === 'manual' ? '#4CAF50' : '#f0f0f0',
            color: mode === 'manual' ? 'white' : '#333',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: mode === 'manual' ? 'bold' : 'normal'
          }}
        >
          ✏️ Manual Entry
        </button>
        
        <button
          onClick={() => setMode('scrape')}
          style={{
            padding: '10px 20px',
            background: mode === 'scrape' ? '#4CAF50' : '#f0f0f0',
            color: mode === 'scrape' ? 'white' : '#333',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: mode === 'scrape' ? 'bold' : 'normal'
          }}
        >
          🔗 Wikidot Scraper
        </button>
      </div>

      {mode === 'scrape' && (
        <form onSubmit={scrapeWikidot} style={{ marginBottom: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '4px' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              style={{
                padding: '8px 16px',
                background: inputMode === 'url' ? '#2196F3' : '#e0e0e0',
                color: inputMode === 'url' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: inputMode === 'url' ? 'bold' : 'normal'
              }}
            >
              🔗 URL
            </button>
            
            <button
              type="button"
              onClick={() => setInputMode('html')}
              style={{
                padding: '8px 16px',
                background: inputMode === 'html' ? '#2196F3' : '#e0e0e0',
                color: inputMode === 'html' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: inputMode === 'html' ? 'bold' : 'normal'
              }}
            >
              📄 Paste HTML
            </button>
          </div>

          {inputMode === 'url' ? (
            <>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Wikidot Magic Item URL:
              </label>
              <input
                type="url"
                value={wikidotInput}
                onChange={(e) => setWikidotInput(e.target.value)}
                placeholder="http://dnd2024.wikidot.com/magic-item:bag-of-holding"
                required
                style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              />
            </>
          ) : (
            <>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Paste HTML Source:
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
                  (Right-click page → View Source → Copy all)
                </span>
              </label>
              <textarea
                value={wikidotInput}
                onChange={(e) => setWikidotInput(e.target.value)}
                placeholder="Paste the full HTML source of the wikidot magic item page here..."
                required
                rows={6}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', fontFamily: 'monospace', fontSize: '12px' }}
              />
            </>
          )}
          
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Parsing...' : '🔍 Parse Magic Item Data'}
          </button>
        </form>
      )}

      <form onSubmit={handleSave} className="admin-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label>Item Name *</label>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
            />
          </div>

          <div>
            <label>Type 
              <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
                {' '}(e.g., Weapon, Armor, Wondrous item)
              </span>
            </label>
            <input 
              value={type} 
              onChange={(e) => setType(e.target.value)} 
              placeholder="Wondrous item"
            />
          </div>

          <div>
            <label>Rarity</label>
            <select 
              value={rarity} 
              onChange={(e) => setRarity(e.target.value)}
            >
              <option value="">Select rarity...</option>
              <option value="Common">Common</option>
              <option value="Uncommon">Uncommon</option>
              <option value="Rare">Rare</option>
              <option value="Very Rare">Very Rare</option>
              <option value="Legendary">Legendary</option>
              <option value="Artifact">Artifact</option>
            </select>
          </div>

          <div>
            <label>Attunement Required 
              <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
                {' '}(e.g., &quot;Yes&quot;, &quot;a spellcaster&quot;, &quot;a cleric&quot;)
              </span>
            </label>
            <input 
              value={attunementRequired} 
              onChange={(e) => setAttunementRequired(e.target.value)} 
              placeholder="Yes / by a wizard / etc."
            />
          </div>
        </div>

        <div style={{ marginTop: '15px' }}>
          <label>Description *</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            required 
            rows={8}
            placeholder="Full item description..."
          />
        </div>

        <div style={{ marginTop: '15px' }}>
          <label>Properties (JSONB)
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
              {' '}Optional - JSON format: {`{"damage": "1d8", "bonus": "+1", "effects": [...]}`}
            </span>
          </label>
          <textarea 
            value={properties} 
            onChange={(e) => setProperties(e.target.value)} 
            rows={4}
            placeholder='{"damage": "1d8", "bonus": "+2", "weight": 3}'
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '20px',
            padding: '12px 24px',
            background: loading ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Saving...' : '💾 Save Magic Item'}
        </button>
      </form>
    </div>
  );
}

MagicItemManagement.propTypes = {
  prefill: PropTypes.object,
  onPrefillConsumed: PropTypes.func
};
