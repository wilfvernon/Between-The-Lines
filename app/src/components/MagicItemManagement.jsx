import { useCallback, useEffect, useState } from 'react';
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
  const [hidden, setHidden] = useState(false);
  const [description, setDescription] = useState('');
  const [benefits, setBenefits] = useState('');
  
  // Scraper fields
  const [wikidotInput, setWikidotInput] = useState('http://dnd2024.wikidot.com/magic-item:bag-of-holding');
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'html'
  
  // Status
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingItems, setExistingItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const loadExistingItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('magic_items')
        .select('id, name, rarity, hidden')
        .order('name', { ascending: true });

      if (error) throw error;
      setExistingItems(data || []);
    } catch (error) {
      console.error('Failed to load magic items:', error);
      setStatus(`❌ Failed to load magic items: ${error.message}`);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExistingItems();
  }, [loadExistingItems]);

  const resetForm = () => {
    setName('');
    setType('');
    setRarity('');
    setAttunementRequired('');
    setHidden(false);
    setDescription('');
    setBenefits('');
  };

  useEffect(() => {
    if (!prefill) return;
    setMode('manual');
    setName(prefill.name || '');
    setType(prefill.type || '');
    setRarity(prefill.rarity || '');
    setAttunementRequired(prefill.requires_attunement || prefill.attunement_required || '');
    setHidden(prefill.hidden === true || String(prefill.hidden).toLowerCase() === 'true');
    setDescription(prefill.description || '');
    if (prefill.benefits) {
      setBenefits(JSON.stringify(prefill.benefits, null, 2));
    } else if (prefill.properties) {
      setBenefits(JSON.stringify(prefill.properties, null, 2));
    } else {
      setBenefits('');
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
      setHidden(false);
      setDescription(scraped.description || '');
      if (scraped.benefits && (typeof scraped.benefits === 'object' || Array.isArray(scraped.benefits))) {
        setBenefits(JSON.stringify(scraped.benefits, null, 2));
      } else {
        setBenefits('');
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
      // Parse benefits JSON if provided
      let benefitsJson = null;
      if (benefits.trim()) {
        try {
          benefitsJson = JSON.parse(benefits);
        } catch {
          throw new Error('Benefits must be valid JSON or empty');
        }
      }
      
      const { data, error } = await supabase
        .from('magic_items')
        .upsert({
          name,
          type: type || null,
          rarity: rarity || null,
          requires_attunement: attunementRequired || null,
          hidden,
          description,
          benefits: benefitsJson
        }, {
          onConflict: 'name'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setStatus(`✅ Magic item "${data.name}" saved successfully!`);
      resetForm();
      await loadExistingItems();
      
    } catch (error) {
      console.error('Save error:', error);
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHidden = async (item) => {
    if (!item?.id) return;

    const nextHidden = !Boolean(item.hidden);
    setLoading(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('magic_items')
        .update({ hidden: nextHidden })
        .eq('id', item.id);

      if (error) throw error;

      setExistingItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, hidden: nextHidden } : entry))
      );
      setStatus(`✅ ${item.name} is now ${nextHidden ? 'hidden' : 'visible'}.`);
    } catch (error) {
      console.error('Toggle hidden error:', error);
      setStatus(`❌ Visibility update failed: ${error.message}`);
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
                {' '}(e.g., Weapon, Armour, Wondrous item)
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

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
              Hidden
            </label>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
              Hidden items will not apply benefits and will display as ??? in character sheet descriptions.
            </div>
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
          <label>Benefits (JSONB)
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
              {' '}Optional - JSON array format: {`[{"uses": {"max": "proficiency", "type": "charges"}}, {"type": "skill_advantage", "skills": ["stealth"]}]`}
            </span>
          </label>
          <textarea 
            value={benefits} 
            onChange={(e) => setBenefits(e.target.value)} 
            rows={4}
            placeholder='[{"uses": {"max": "proficiency", "type": "charges"}}]'
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

      <div style={{ marginTop: '28px' }}>
        <h3 style={{ marginBottom: '10px' }}>Existing Magic Items</h3>
        <p style={{ marginTop: 0, color: '#666', fontSize: '13px' }}>
          Quick toggle visibility without editing each item.
        </p>

        {itemsLoading ? (
          <p style={{ color: '#666' }}>Loading magic items...</p>
        ) : existingItems.length === 0 ? (
          <p style={{ color: '#666' }}>No magic items found.</p>
        ) : (
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '6px',
            maxHeight: '360px',
            overflowY: 'auto',
            background: '#fff'
          }}>
            {existingItems.map((item) => {
              const isHidden = Boolean(item.hidden);
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 12px',
                    borderBottom: '1px solid #eee'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {item.rarity || 'Unspecified rarity'}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleToggleHidden(item)}
                    style={{
                      padding: '8px 10px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      background: isHidden ? '#2e7d32' : '#ad1457',
                      color: 'white',
                      fontWeight: 600,
                      minWidth: '112px'
                    }}
                  >
                    {isHidden ? 'Set Visible' : 'Set Hidden'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

MagicItemManagement.propTypes = {
  prefill: PropTypes.object,
  onPrefillConsumed: PropTypes.func
};
