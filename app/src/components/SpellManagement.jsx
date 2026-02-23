import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { fetchWikidot } from '../lib/wikidotUtils';
import { parseSpellHtml } from '../lib/wikidotScrapers';

export default function SpellManagement({ prefill, onPrefillConsumed }) {
  const [mode, setMode] = useState('manual'); // 'manual' or 'scrape'
  
  // Manual entry fields
  const [name, setName] = useState('');
  const [level, setLevel] = useState(0);
  const [school, setSchool] = useState('');
  const [castingTime, setCastingTime] = useState('');
  const [range, setRange] = useState('');
  const [components, setComponents] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [higherLevels, setHigherLevels] = useState('');
  
  // Scraper fields
  const [wikidotInput, setWikidotInput] = useState('http://dnd2024.wikidot.com/spell:misty-step');
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'html'
  
  // Status
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setName('');
    setLevel(0);
    setSchool('');
    setCastingTime('');
    setRange('');
    setComponents('');
    setDuration('');
    setDescription('');
    setHigherLevels('');
  };

  useEffect(() => {
    if (!prefill) return;
    setMode('manual');
    setName(prefill.name || '');
    setLevel(prefill.level ?? 0);
    setSchool(prefill.school || '');
    setCastingTime(prefill.casting_time || prefill.castingTime || '');
    setRange(prefill.range || '');
    setComponents(prefill.components || '');
    setDuration(prefill.duration || '');
    setDescription(prefill.description || '');
    setHigherLevels(prefill.higher_levels || prefill.higherLevels || '');
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
      const scraped = parseSpellHtml(html);
      
      // Populate form fields (don't auto-save)
      setName(scraped.name);
      setLevel(scraped.level);
      setSchool(scraped.school);
      setCastingTime(scraped.casting_time);
      setRange(scraped.range);
      setComponents(scraped.components);
      setDuration(scraped.duration);
      setDescription(scraped.description);
      setHigherLevels(scraped.higher_levels);
      
      setStatus('✅ Successfully scraped spell data! Review and click Save.');
      
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
      const { data, error } = await supabase
        .from('spells')
        .upsert({
          name,
          level,
          school: school || null,
          casting_time: castingTime || null,
          range: range || null,
          components: components || null,
          duration: duration || null,
          description,
          higher_levels: higherLevels || null
        }, {
          onConflict: 'name'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setStatus(`✅ Spell "${data.name}" saved successfully!`);
      resetForm();
      
    } catch (error) {
      console.error('Save error:', error);
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="spell-management">
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
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
                Wikidot Spell URL:
              </label>
              <input
                type="url"
                value={wikidotInput}
                onChange={(e) => setWikidotInput(e.target.value)}
                placeholder="http://dnd2024.wikidot.com/spell:fireball"
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
                placeholder="Paste the full HTML source of the wikidot spell page here..."
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
            {loading ? 'Parsing...' : '🔍 Parse Spell Data'}
          </button>
        </form>
      )}

      <form onSubmit={handleSave} className="admin-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label>Spell Name *</label>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
            />
          </div>
          
          <div>
            <label>Level (0-9) *</label>
            <input 
              type="number" 
              min="0" 
              max="9" 
              value={level} 
              onChange={(e) => setLevel(parseInt(e.target.value))} 
              required 
            />
          </div>
          
          <div>
            <label>School</label>
            <input 
              value={school} 
              onChange={(e) => setSchool(e.target.value)} 
              placeholder="Evocation, Abjuration, etc."
            />
          </div>
          
          <div>
            <label>Casting Time</label>
            <input 
              value={castingTime} 
              onChange={(e) => setCastingTime(e.target.value)} 
              placeholder="1 action, 1 bonus action, etc."
            />
          </div>
          
          <div>
            <label>Range</label>
            <input 
              value={range} 
              onChange={(e) => setRange(e.target.value)} 
              placeholder="60 feet, Touch, etc."
            />
          </div>
          
          <div>
            <label>Components</label>
            <input 
              value={components} 
              onChange={(e) => setComponents(e.target.value)} 
              placeholder="V, S, M (material)"
            />
          </div>
          
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Duration</label>
            <input 
              value={duration} 
              onChange={(e) => setDuration(e.target.value)} 
              placeholder="Instantaneous, Concentration, up to 1 minute, etc."
            />
          </div>
          
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Description *</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              required 
              rows="6"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          
          <div style={{ gridColumn: '1 / -1' }}>
            <label>At Higher Levels</label>
            <textarea 
              value={higherLevels} 
              onChange={(e) => setHigherLevels(e.target.value)} 
              rows="3"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
        </div>
        
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
          <button 
            type="submit" 
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Saving...' : '💾 Save Spell'}
          </button>
          
          <button 
            type="button"
            onClick={resetForm}
            style={{
              padding: '10px 20px',
              background: '#f0f0f0',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Form
          </button>
        </div>
      </form>

      {status && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          background: status.includes('✅') ? '#e8f5e9' : '#ffebee',
          border: `1px solid ${status.includes('✅') ? '#4CAF50' : '#f44336'}`,
          borderRadius: '4px',
          color: status.includes('✅') ? '#2e7d32' : '#c62828'
        }}>
          {status}
        </div>
      )}
    </div>
  );
}

SpellManagement.propTypes = {
  prefill: PropTypes.object,
  onPrefillConsumed: PropTypes.func
};
