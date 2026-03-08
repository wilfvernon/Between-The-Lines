import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWikidot } from '../lib/wikidotUtils';
import { parseSpellListHtml, parseSpellHtml } from '../lib/wikidotScrapers';

export default function SpellBatchImporter() {
  const [listUrl, setListUrl] = useState('https://dnd5e.wikidot.com/spells:bard/');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [step, setStep] = useState('input'); // 'input', 'verifying', 'done'
  const [baseDomain, setBaseDomain] = useState('https://dnd5e.wikidot.com'); // Domain for URL resolution
  
  const [allSpells, setAllSpells] = useState([]);
  const [newSpells, setNewSpells] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saved, setSaved] = useState(new Set());
  const [importErrors, setImportErrors] = useState([]);

  // Form fields for current spell
  const [name, setName] = useState('');
  const [level, setLevel] = useState(0);
  const [school, setSchool] = useState('');
  const [castingTime, setCastingTime] = useState('');
  const [range, setRange] = useState('');
  const [components, setComponents] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [higherLevels, setHigherLevels] = useState('');
  const [isAttack, setIsAttack] = useState(false);
  const [isSave, setIsSave] = useState(false);
  const [saveType, setSaveType] = useState('');
  const [addModifier, setAddModifier] = useState(false);
  const [dice, setDice] = useState('');
  const [effectType, setEffectType] = useState('');
  const [spellLists, setSpellLists] = useState('');

  const handleScrapeList = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');
    
    try {
      // Fetch list page
      const { html } = await fetchWikidot(listUrl);
      
      // Extract base domain from listUrl for URL resolution
      const urlObj = new URL(listUrl);
      const urlBaseDomain = `${urlObj.protocol}//${urlObj.hostname}`;
      
      // Parse spell names from list
      const foundSpells = parseSpellListHtml(html, urlBaseDomain);
      if (foundSpells.length === 0) {
        throw new Error('No spells found on this page. Check the URL or try viewing the page HTML directly.');
      }
      
      setAllSpells(foundSpells);
      setStatus(`Found ${foundSpells.length} spells. Checking database...`);
      
      // Check which spells already exist in DB
      const spellNames = foundSpells.map(s => s.name);
      const { data: existingSpells, error: checkError } = await supabase
        .from('spells')
        .select('name')
        .in('name', spellNames);
      
      if (checkError) throw checkError;
      
      const existingNames = new Set(existingSpells?.map(s => s.name) || []);
      const missing = foundSpells.filter(s => !existingNames.has(s.name));
      
      setNewSpells(missing);
      setCurrentIndex(0);
      setSaved(new Set());
      setImportErrors([]);
      setStatus(`Found ${missing.length} new spells to verify and import.`);
      setStep('verifying');
      
      // Fetch first spell
      if (missing.length > 0) {
        await fetchAndLoadSpell(missing[0]);
      }
      
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('Scrape error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAndLoadSpell = async (spell) => {
    try {
      setLoading(true);
      setStatus('Fetching spell details...');
      console.log('Fetching spell:', spell.url);
      
      const fetchResult = await fetchWikidot(spell.url);
      console.log('Fetch result keys:', Object.keys(fetchResult));
      
      const { html: spellHtml } = fetchResult;
      console.log('HTML length:', spellHtml?.length || 'undefined');
      
      const spellData = parseSpellHtml(spellHtml, spell.url);
      console.log('Parsed spell data:', spellData);
      
      // Populate form
      console.log('Setting name to:', spellData.name);
      setName(spellData.name);
      setLevel(spellData.level ?? 0);
      setSchool(spellData.school || '');
      setCastingTime(spellData.casting_time || '');
      setRange(spellData.range || '');
      setComponents(spellData.components || '');
      setDuration(spellData.duration || '');
      setDescription(spellData.description || '');
      setHigherLevels(spellData.higher_levels || '');
      setIsAttack(spellData.is_attack ?? false);
      setIsSave(spellData.is_save ?? false);
      setSaveType(spellData.save_type || '');
      setAddModifier(spellData.add_modifier ?? false);
      setDice(Array.isArray(spellData.dice) ? spellData.dice.join(', ') : spellData.dice || '');
      setEffectType(spellData.effect_type || '');
      setSpellLists(Array.isArray(spellData.spell_lists) ? spellData.spell_lists.join(', ') : spellData.spell_lists || '');
      
      console.log('Form populated successfully');
      setStatus('');
    } catch (err) {
      setStatus(`⚠️ Error fetching spell: ${err.message}`);
      console.error('Fetch error:', err);
      console.error('Full error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSpell = async () => {
    setLoading(true);
    
    try {
      // Parse dice array
      const diceArray = dice
        .split(',')
        .map(d => d.trim())
        .filter(d => d);
      
      // Parse spell lists array
      const spellListsArray = spellLists
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
      
      const spellData = {
        name,
        level,
        school,
        casting_time: castingTime,
        range,
        components,
        duration,
        description,
        higher_levels: higherLevels,
        is_attack: isAttack,
        is_save: isSave,
        save_type: saveType || null,
        add_modifier: addModifier,
        dice: diceArray,
        effect_type: effectType,
        spell_lists: spellListsArray
      };
      
      const { error } = await supabase
        .from('spells')
        .upsert(spellData, { onConflict: 'name' })
        .select();
      
      if (error) throw error;
      
      setSaved(prev => new Set([...prev, name]));
      setStatus(`✅ Saved "${name}"`);
      
      // Move to next spell
      handleNextSpell();
      
    } catch (error) {
      console.error('Save error:', error);
      setStatus(`❌ Save failed: ${error.message}`);
      setImportErrors(prev => [...prev, { spell: name, error: error.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleNextSpell = () => {
    if (currentIndex + 1 < newSpells.length) {
      setCurrentIndex(currentIndex + 1);
      fetchAndLoadSpell(newSpells[currentIndex + 1]);
    } else {
      setStep('done');
    }
  };

  const handleSkipSpell = () => {
    handleNextSpell();
  };

  const handlePasteHtml = async (event) => {
    const pastedHtml = event.target.value;
    if (!pastedHtml.trim()) return;

    try {
      setLoading(true);
      const foundSpells = parseSpellListHtml(pastedHtml, baseDomain);
      
      if (foundSpells.length === 0) {
        setStatus('⚠️ No spells found in pasted HTML. Check that you pasted the full page source.');
        return;
      }
      
      setAllSpells(foundSpells);
      setStatus(`Found ${foundSpells.length} spells. Checking database...`);
      
      // Check which spells already exist in DB
      const spellNames = foundSpells.map(s => s.name);
      const { data: existingSpells, error: checkError } = await supabase
        .from('spells')
        .select('name')
        .in('name', spellNames);
      
      if (checkError) throw checkError;
      
      const existingNames = new Set(existingSpells?.map(s => s.name) || []);
      const missing = foundSpells.filter(s => !existingNames.has(s.name));
      
      setNewSpells(missing);
      setCurrentIndex(0);
      setSaved(new Set());
      setImportErrors([]);
      setStatus(`Found ${missing.length} new spells to verify and import.`);
      setStep('verifying');
      
      // Fetch first spell
      if (missing.length > 0) {
        await fetchAndLoadSpell(missing[0]);
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('HTML paste error:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentSpell = newSpells[currentIndex];
  const progress = `${currentIndex + 1} of ${newSpells.length}`;

  return (
    <div style={{ padding: '20px' }}>
      <h3>📚 Batch Spell Importer</h3>
      <p style={{ color: '#666', fontSize: '14px' }}>
        Import all spells from a class spell list page. Example: https://dnd5e.wikidot.com/spells:bard/
      </p>

      {step === 'input' && (
        <form onSubmit={handleScrapeList} style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
              Class Spell List URL:
            </label>
            <input
              type="url"
              value={listUrl}
              onChange={(e) => setListUrl(e.target.value)}
              placeholder="https://dnd5e.wikidot.com/spells:bard/"
              style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
              required
            />
            <p style={{ fontSize: '11px', color: '#999', margin: '0' }}>
              💡 Tip: If you get a CORS error, try the HTML paste option below instead (right-click page → View Page Source → Copy all)
            </p>
          </div>
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
            {loading ? 'Scanning...' : '🔍 Scan List'}
          </button>

          <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '4px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>📄 Alternative: Paste HTML</h4>
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#666' }}>
              If the URL doesn't work due to CORS restrictions:
            </p>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold' }}>
                Which wikidot domain is the HTML from?
              </label>
              <select 
                value={baseDomain}
                onChange={(e) => setBaseDomain(e.target.value)}
                style={{ padding: '6px', fontSize: '13px' }}
              >
                <option value="https://dnd5e.wikidot.com">dnd5e.wikidot.com</option>
                <option value="http://dnd2024.wikidot.com">dnd2024.wikidot.com</option>
              </select>
            </div>
            
            <textarea
              placeholder="Paste the full HTML source of the spell list page here..."
              rows="4"
              style={{ width: '100%', padding: '8px', marginBottom: '10px', fontFamily: 'monospace', fontSize: '12px' }}
              onChange={handlePasteHtml}
            />
            <button
              type="button"
              onClick={() => setStatus('Paste the page HTML above to get started')}
              style={{
                padding: '8px 16px',
                background: '#f0f0f0',
                color: '#333',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              ℹ️ Instructions
            </button>
          </div>
        </form>
      )}

      {step === 'verifying' && currentSpell && (
        <div>
          <div style={{ marginBottom: '15px', padding: '10px', background: '#e3f2fd', borderRadius: '4px' }}>
            <strong>Spell {progress}</strong>: {currentSpell.name}
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {saved.size} saved • {newSpells.length - currentIndex - 1} remaining
            </div>
          </div>

          <form style={{ marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ fontWeight: 'bold' }}>Spell Name *</label>
                <input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div>
                <label style={{ fontWeight: 'bold' }}>Level (0-9) *</label>
                <input 
                  type="number" 
                  min="0" 
                  max="9" 
                  value={level} 
                  onChange={(e) => setLevel(parseInt(e.target.value))} 
                  required 
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div>
                <label style={{ fontWeight: 'bold' }}>School</label>
                <input 
                  value={school} 
                  onChange={(e) => setSchool(e.target.value)} 
                  placeholder="Evocation, Abjuration, etc."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div>
                <label style={{ fontWeight: 'bold' }}>Casting Time</label>
                <input 
                  value={castingTime} 
                  onChange={(e) => setCastingTime(e.target.value)} 
                  placeholder="1 action, 1 bonus action, etc."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div>
                <label style={{ fontWeight: 'bold' }}>Range</label>
                <input 
                  value={range} 
                  onChange={(e) => setRange(e.target.value)} 
                  placeholder="60 feet, Touch, etc."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div>
                <label style={{ fontWeight: 'bold' }}>Components</label>
                <input 
                  value={components} 
                  onChange={(e) => setComponents(e.target.value)} 
                  placeholder="V, S, M (material)"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: 'bold' }}>Duration</label>
                <input 
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value)} 
                  placeholder="Instantaneous, Concentration, up to 1 minute, etc."
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: 'bold' }}>Description *</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  required 
                  rows="4"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: 'bold' }}>At Higher Levels</label>
                <textarea 
                  value={higherLevels} 
                  onChange={(e) => setHigherLevels(e.target.value)} 
                  rows="2"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: '10px', paddingTop: '15px', borderTop: '1px solid #ddd' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '13px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Combat Mechanics</h4>
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '24px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isAttack}
                    onChange={(e) => setIsAttack(e.target.checked)}
                  />
                  <span>Spell Attack Roll</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isSave}
                    onChange={(e) => setIsSave(e.target.checked)}
                  />
                  <span>Saving Throw</span>
                </label>
              </div>

              <div>
                <label style={{ fontWeight: 'bold' }}>Save Type</label>
                <select
                  value={saveType}
                  onChange={(e) => setSaveType(e.target.value)}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">None</option>
                  <option value="STR">STR</option>
                  <option value="DEX">DEX</option>
                  <option value="CON">CON</option>
                  <option value="INT">INT</option>
                  <option value="WIS">WIS</option>
                  <option value="CHA">CHA</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '24px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={addModifier}
                    onChange={(e) => setAddModifier(e.target.checked)}
                  />
                  <span>Add Modifier</span>
                </label>
              </div>

              <div>
                <label style={{ fontWeight: 'bold' }}>Damage Dice</label>
                <input 
                  value={dice} 
                  onChange={(e) => setDice(e.target.value)} 
                  placeholder="1d8, 2d8, 3d8"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold' }}>Effect Type</label>
                <select 
                  value={effectType} 
                  onChange={(e) => setEffectType(e.target.value)}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">None</option>
                  <option value="Acid">Acid</option>
                  <option value="Bludgeoning">Bludgeoning</option>
                  <option value="Cold">Cold</option>
                  <option value="Fire">Fire</option>
                  <option value="Force">Force</option>
                  <option value="Lightning">Lightning</option>
                  <option value="Necrotic">Necrotic</option>
                  <option value="Piercing">Piercing</option>
                  <option value="Poison">Poison</option>
                  <option value="Psychic">Psychic</option>
                  <option value="Radiant">Radiant</option>
                  <option value="Slashing">Slashing</option>
                  <option value="Thunder">Thunder</option>
                  <option value="Healing">Healing</option>
                  <option value="Temp HP">Temp HP</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: 'bold' }}>Spell Classes (Bard, Cleric, Druid, etc.)</label>
                <input 
                  value={spellLists} 
                  onChange={(e) => setSpellLists(e.target.value)} 
                  placeholder="Wizard, Sorcerer, Cleric"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
            </div>
            
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button 
                type="button"
                onClick={handleSaveSpell}
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
                {loading ? 'Saving...' : `💾 Save Spell`}
              </button>
              
              <button 
                type="button"
                onClick={handleSkipSpell}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  background: '#f0f0f0',
                  color: '#333',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                ⏭️ Skip Spell
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'done' && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            padding: '15px',
            backgroundColor: '#e8f5e9',
            border: '1px solid #4CAF50',
            borderRadius: '4px',
            color: '#2e7d32'
          }}>
            <strong>✅ Batch Import Complete!</strong>
            <p>Successfully imported {saved.size} spells.</p>
            {importErrors.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <strong>⚠️ {importErrors.length} errors:</strong>
                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  {importErrors.map((err, idx) => (
                    <li key={idx} style={{ fontSize: '12px' }}>
                      {err.spell}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setStep('input');
              setListUrl('https://dnd5e.wikidot.com/spells:bard/');
              setAllSpells([]);
              setNewSpells([]);
              setCurrentIndex(0);
              setSaved(new Set());
              setImportErrors([]);
              setStatus('');
            }}
            style={{
              marginTop: '12px',
              padding: '10px 20px',
              background: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Import Another List
          </button>
        </div>
      )}

      {status && (
        <div style={{
          padding: '12px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: '4px',
          color: '#333',
          fontSize: '13px',
          marginTop: '15px'
        }}>
          {status}
        </div>
      )}
    </div>
  );
}
