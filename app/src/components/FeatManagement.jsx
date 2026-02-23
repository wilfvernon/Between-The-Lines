import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { fetchWikidot } from '../lib/wikidotUtils';
import { parseFeatHtml } from '../lib/wikidotScrapers';

export default function FeatManagement({ prefill, onPrefillConsumed }) {
  const [mode, setMode] = useState('manual'); // 'manual' or 'scrape'

  // Manual entry fields
  const [name, setName] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [description, setDescription] = useState('');
  const [benefits, setBenefits] = useState('');

  // Scraper fields
  const [wikidotInput, setWikidotInput] = useState('http://dnd2024.wikidot.com/feat:fey-touched');
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'html'

  // Status
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setName('');
    setPrerequisites('');
    setDescription('');
    setBenefits('');
  };

  useEffect(() => {
    if (!prefill) return;
    setMode('manual');
    setName(prefill.name || '');
    setPrerequisites(prefill.prerequisites || '');
    setDescription(prefill.description || '');
    if (prefill.benefits) {
      setBenefits(JSON.stringify(prefill.benefits, null, 2));
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
        html = await fetchWikidot(wikidotInput);
      } else {
        html = wikidotInput;
      }

      const scraped = parseFeatHtml(html);

      setName(scraped.name || '');
      setPrerequisites(scraped.prerequisites || '');
      setDescription(scraped.description || '');
      setBenefits(scraped.benefits ? JSON.stringify(scraped.benefits, null, 2) : '');

      setStatus('✅ Successfully scraped feat data! Review and click Save.');
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
      let benefitsJson = null;
      if (benefits.trim()) {
        try {
          benefitsJson = JSON.parse(benefits);
        } catch {
          throw new Error('Benefits must be valid JSON or empty');
        }
      }

      const { data, error } = await supabase
        .from('feats')
        .upsert({
          name,
          description,
          prerequisites: prerequisites || null,
          benefits: benefitsJson
        }, {
          onConflict: 'name'
        })
        .select()
        .single();

      if (error) throw error;

      setStatus(`✅ Feat "${data.name}" saved successfully!`);
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
      <h2 style={{ marginBottom: '20px' }}>Feat Management</h2>

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
                Wikidot Feat URL:
              </label>
              <input
                type="url"
                value={wikidotInput}
                onChange={(e) => setWikidotInput(e.target.value)}
                placeholder="http://dnd2024.wikidot.com/feat:alert"
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
                placeholder="Paste the full HTML source of the wikidot feat page here..."
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
            {loading ? 'Parsing...' : '🔍 Parse Feat Data'}
          </button>
        </form>
      )}

      <form onSubmit={handleSave} className="admin-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label>Feat Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Prerequisites</label>
            <input
              value={prerequisites}
              onChange={(e) => setPrerequisites(e.target.value)}
              placeholder="e.g., Dex 13+, Character level 4+"
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
            placeholder="Full feat description..."
          />
        </div>

        <div style={{ marginTop: '15px' }}>
          <label>Benefits (JSONB)
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>
              {' '}Optional - add structured benefits for ASI, proficiencies, spells, etc.
            </span>
          </label>
          <textarea
            value={benefits}
            onChange={(e) => setBenefits(e.target.value)}
            rows={6}
            placeholder='{"abilityScoreIncrease": {"choice": ["strength", "dexterity"], "amount": 1}, "spells": {"grants": [{"name": "mage hand"}]}}'
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
          {loading ? 'Saving...' : '💾 Save Feat'}
        </button>
      </form>
    </div>
  );
}

FeatManagement.propTypes = {
  prefill: PropTypes.object,
  onPrefillConsumed: PropTypes.func
};
