import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { transformDnDBeyondCharacter } from '../lib/characterTransformer';
import { insertReferenceCandidates, prepareReferenceImports } from '../lib/autoImport';

export default function CharacterImporter({
  onImportComplete,
  onReviewPendingChange,
  reviewOpenNonce
}) {
  const [jsonInput, setJsonInput] = useState('');
  const [characterData, setCharacterData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [reviewData, setReviewData] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [step, setStep] = useState('url'); // 'url', 'review', 'character-review', 'saved', 'error'
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [characterReviewOpen, setCharacterReviewOpen] = useState(false);
  const [asiEditing, setAsiEditing] = useState(null);
  const [asiForm, setAsiForm] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  const formatFailName = (fail) => {
    if (typeof fail?.name === 'string') return fail.name;
    if (typeof fail === 'string') return fail;
    if (fail?.name?.name) return fail.name.name;
    return 'Unknown';
  };

  const reviewReady = useMemo(() => {
    if (!reviewData) return false;
    const allApproved = (list) => list.every((entry) => entry.approved || entry.skipped);
    return (
      allApproved(reviewData.spells.candidates) &&
      allApproved(reviewData.items.candidates) &&
      allApproved(reviewData.feats.candidates) &&
      allApproved(reviewData.spells.failed) &&
      allApproved(reviewData.items.failed) &&
      allApproved(reviewData.feats.failed)
    );
  }, [reviewData]);

  useEffect(() => {
    if (!reviewOpenNonce || !reviewData) return;
    setReviewOpen(true);
  }, [reviewOpenNonce, reviewData]);

  // Fetch available users for admin assignment
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Try to fetch users from a server API endpoint (if you set one up)
        // For now, just get the current user as an option
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setAvailableUsers([user]);
          setSelectedUserId(user.id);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

  const updateReviewEntry = (type, listKey, index, updates) => {
    setReviewData((prev) => {
      if (!prev) return prev;
      const list = prev[type][listKey];
      const nextList = list.map((entry, i) => (i === index ? { ...entry, ...updates } : entry));
      return {
        ...prev,
        [type]: {
          ...prev[type],
          [listKey]: nextList
        }
      };
    });
  };

  const handleApprove = (type, listKey, index) => {
    updateReviewEntry(type, listKey, index, { approved: true });
  };

  const handleSkip = (type, listKey, index) => {
    updateReviewEntry(type, listKey, index, { skipped: true });
  };

  const startEdit = (type, index, entry) => {
    if (!entry?.data) return;
    setEditError('');
    setEditingEntry({ type, index, sourceUrl: entry.sourceUrl || null });
    if (type === 'spells') {
      setEditForm({
        name: entry.data.name || '',
        level: entry.data.level ?? 0,
        school: entry.data.school || '',
        casting_time: entry.data.casting_time || '',
        range: entry.data.range || '',
        components: entry.data.components || '',
        duration: entry.data.duration || '',
        description: entry.data.description || '',
        higher_levels: entry.data.higher_levels || ''
      });
    } else if (type === 'items') {
      setEditForm({
        name: entry.data.name || '',
        type: entry.data.type || '',
        rarity: entry.data.rarity || '',
        requires_attunement: entry.data.requires_attunement || '',
        description: entry.data.description || '',
        properties: entry.data.properties ? JSON.stringify(entry.data.properties, null, 2) : ''
      });
    } else if (type === 'feats') {
      setEditForm({
        name: entry.data.name || '',
        prerequisites: entry.data.prerequisites || '',
        description: entry.data.description || '',
        benefits: entry.data.benefits ? JSON.stringify(entry.data.benefits, null, 2) : ''
      });
    }
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    setEditForm(null);
    setEditError('');
  };

  const saveEdit = () => {
    if (!editingEntry || !editForm) return;
    const { type, index } = editingEntry;

    try {
      let updated = {};
      if (type === 'spells') {
        updated = {
          name: editForm.name,
          level: Number(editForm.level) || 0,
          school: editForm.school || null,
          casting_time: editForm.casting_time || null,
          range: editForm.range || null,
          components: editForm.components || null,
          duration: editForm.duration || null,
          description: editForm.description || '',
          higher_levels: editForm.higher_levels || null
        };
      } else if (type === 'items') {
        const properties = editForm.properties?.trim()
          ? JSON.parse(editForm.properties)
          : null;
        updated = {
          name: editForm.name,
          type: editForm.type || null,
          rarity: editForm.rarity || null,
          requires_attunement: editForm.requires_attunement || null,
          description: editForm.description || '',
          properties
        };
      } else if (type === 'feats') {
        const benefits = editForm.benefits?.trim()
          ? JSON.parse(editForm.benefits)
          : null;
        updated = {
          name: editForm.name,
          prerequisites: editForm.prerequisites || null,
          description: editForm.description || '',
          benefits
        };
      }

      updateReviewEntry(type, 'candidates', index, {
        data: updated,
        name: updated.name
      });
      cancelEdit();
    } catch (error) {
      setEditError(error.message || 'Invalid JSON');
    }
  };

  const handleContinueImport = async () => {
    if (!reviewData) return;
    setLoading(true);
    setStatus('');

    try {
      const approved = {
        spells: reviewData.spells.candidates.filter((entry) => entry.approved),
        items: reviewData.items.candidates.filter((entry) => entry.approved),
        feats: reviewData.feats.candidates.filter((entry) => entry.approved)
      };

      await insertReferenceCandidates(approved);
      setStatus('✅ Reference data imported. Review character details.');
      setStep('character-review');
      setReviewOpen(false);
      setCharacterReviewOpen(true);
      onReviewPendingChange?.(false);
    } catch (error) {
      console.error('Reference import error:', error);
      setStatus(`❌ Reference import failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditAsi = (groupIndex, group) => {
    setAsiEditing({ groupIndex });
    // If editing an existing ASI group, prepopulate the form
    // Otherwise, create a new entry with defaults
    setAsiForm(group ? {
      abilities: group.abilities || [
        { ability: 'strength', amount: 1 }
      ],
      source: group.source || '',
      sourceType: group.sourceType || 'background',
    } : {
      abilities: [
        { ability: 'strength', amount: 1 }
      ],
      source: '',
      sourceType: 'background',
    });
  };

  const cancelEditAsi = () => {
    setAsiEditing(null);
    setAsiForm(null);
  };

  const saveEditAsi = () => {
    if (!characterData || !asiEditing || !asiForm) return;
    if (!characterData.abilityScoreImprovements) {
      characterData.abilityScoreImprovements = [];
    }
    
    // Convert grouped form data into flat array entries for storage
    const entriesToAdd = asiForm.abilities.map(ab => ({
      ability: ab.ability,
      amount: ab.amount,
      source: asiForm.source,
      sourceType: asiForm.sourceType,
    }));
    
    if (asiEditing.groupIndex !== undefined) {
      // Remove all ASIs from the group being edited
      const groupKey = `${asiForm.source}::${asiForm.sourceType}`;
      characterData.abilityScoreImprovements = characterData.abilityScoreImprovements.filter(
        asi => `${asi.source}::${asi.sourceType}` !== groupKey
      );
    }
    
    // Add all entries from the form
    characterData.abilityScoreImprovements.push(...entriesToAdd);
    setCharacterData({ ...characterData });
    cancelEditAsi();
  };

  // Group ASIs by source for compact display and editing
  const groupAbilityScoreImprovements = (asiList) => {
    if (!asiList || asiList.length === 0) return [];
    
    // Group by source + sourceType combination
    const grouped = {};
    asiList.forEach(asi => {
      const key = `${asi.source}::${asi.sourceType}`;
      if (!grouped[key]) {
        grouped[key] = {
          source: asi.source,
          sourceType: asi.sourceType,
          abilities: []
        };
      }
      grouped[key].abilities.push({
        ability: asi.ability,
        amount: asi.amount
      });
    });
    
    return Object.values(grouped);
  };

  const handleConfirmCharacterReview = () => {
    setCharacterReviewOpen(false);
    setStep('saved');
  };

  const handleFetchJson = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');
    setReviewData(null);

    try {
      let dndBeyondJson;

      if (!jsonInput.trim()) throw new Error('Please paste the JSON content');
      try {
        dndBeyondJson = JSON.parse(jsonInput);
      } catch {
        throw new Error('Invalid JSON: please paste the full character JSON');
      }

      console.log('Fetched D&D Beyond character JSON');

      // Transform to our schema
      const transformed = transformDnDBeyondCharacter(dndBeyondJson, 'temp-user-id');
      setCharacterData(transformed);

      const prepared = await prepareReferenceImports(transformed);
      const review = {
        spells: {
          candidates: prepared.spells?.candidates || [],
          failed: prepared.spells?.failed || [],
          existing: prepared.spells?.existing || []
        },
        items: {
          candidates: prepared.items?.candidates || [],
          failed: prepared.items?.failed || [],
          existing: prepared.items?.existing || []
        },
        feats: {
          candidates: prepared.feats?.candidates || [],
          failed: prepared.feats?.failed || [],
          existing: prepared.feats?.existing || []
        }
      };

      const pendingCount = review.spells.candidates.length
        + review.items.candidates.length
        + review.feats.candidates.length
        + review.spells.failed.length
        + review.items.failed.length
        + review.feats.failed.length;

      setReviewData(review);

      if (pendingCount === 0) {
        setStatus('✅ No reference data to review. Ready to save character.');
        setStep('saved');
        onReviewPendingChange?.(false);
      } else {
        setStatus('⚠️ Review reference data before importing.');
        setStep('review');
        setReviewOpen(true);
        onReviewPendingChange?.(true);
      }
    } catch (error) {
      console.error('Import error:', error);
      setStatus(`❌ Import failed: ${error.message}`);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCharacter = async (e) => {
    e.preventDefault();
    if (!characterData) return;

    setLoading(true);
    setStatus('');

    try {
      // Validate user selection
      if (!selectedUserId) throw new Error('Please select a user to assign this character to');

      // Update character with selected user ID
      characterData.character.userId = selectedUserId;

      // Transform camelCase character data to snake_case for Supabase
      const char = characterData.character;
      const characterPayload = {
        user_id: char.userId,
        name: char.name,
        full_name: char.fullName ?? null,
        level: char.level,
        classes: char.classes, // Already JSONB
        species: char.species,
        background: char.background ?? null,
        image_url: char.imageUrl ?? null,
        bio: char.bio ?? null,
        max_hp: char.maxHp,
        speed: char.speed ?? 30,
        strength: char.strength,
        dexterity: char.dexterity,
        constitution: char.constitution,
        intelligence: char.intelligence,
        wisdom: char.wisdom,
        charisma: char.charisma,
        save_strength: char.saveStrength ?? false,
        save_dexterity: char.saveDexterity ?? false,
        save_constitution: char.saveConstitution ?? false,
        save_intelligence: char.saveIntelligence ?? false,
        save_wisdom: char.saveWisdom ?? false,
        save_charisma: char.saveCharisma ?? false,
        spellcasting_ability: char.spellcastingAbility ?? null,
        ability_score_improvements: characterData.abilityScoreImprovements ?? null
      };

      // Insert character
      const { data: charInserted, error: charError } = await supabase
        .from('characters')
        .insert(characterPayload)
        .select('id')
        .single();

      if (charError) throw charError;
      const characterId = charInserted.id;

      // Insert related data (skills, spells, features, etc.)
      if (characterData.skills.length > 0) {
        const skillsWithCharId = characterData.skills.map(s => ({ ...s, character_id: characterId }));
        const { error } = await supabase.from('character_skills').insert(skillsWithCharId);
        if (error) throw error;
      }

      if (characterData.spells.length > 0) {
        // Look up spell IDs by name
        const spellsData = [];
        for (const spell of characterData.spells) {
          const { data: spellRecord } = await supabase
            .from('spells')
            .select('id, level')
            .eq('name', spell.name)
            .single();
          
          if (spellRecord) {
            // Cantrips (level 0) are always prepared
            const isPrepared = spellRecord.level === 0 ? true : (spell.is_prepared || false);
            
            spellsData.push({
              character_id: characterId,
              spell_id: spellRecord.id,
              is_prepared: isPrepared,
              always_prepared: spell.always_prepared || false,
            });
          } else {
            console.warn(`[Character Import] Spell "${spell.name}" not found in spells table`);
          }
        }
        
        if (spellsData.length > 0) {
          const { error } = await supabase.from('character_spells').insert(spellsData);
          if (error) throw error;
        }
      }

      if (characterData.features.length > 0) {
        const featuresWithCharId = characterData.features.map(f => ({ ...f, character_id: characterId }));
        const { error } = await supabase.from('character_features').insert(featuresWithCharId);
        if (error) throw error;
      }

      if (characterData.feats.length > 0) {
        // Look up feat IDs by name
        const featsData = [];
        for (const feat of characterData.feats) {
          const { data: featRecord } = await supabase
            .from('feats')
            .select('id')
            .eq('name', feat.name)
            .single();
          
          if (featRecord) {
            featsData.push({
              character_id: characterId,
              feat_id: featRecord.id,
              source: feat.source || null,
              choices: feat.choices || null,
            });
          } else {
            console.warn(`[Character Import] Feat "${feat.name}" not found in feats table`);
          }
        }
        
        if (featsData.length > 0) {
          const { error } = await supabase.from('character_feats').insert(featsData);
          if (error) throw error;
        }
      }

      if (characterData.inventory.length > 0) {
        // Look up magic item IDs where applicable
        const inventoryData = [];
        for (const item of characterData.inventory) {
          let magicItemId = null;
          let mundaneItemName = null;
          
          if (item.is_magic_item) {
            // Look up magic item by name
            const { data: magicItemRecord } = await supabase
              .from('magic_items')
              .select('id')
              .eq('name', item.name)
              .single();
            
            if (magicItemRecord) {
              magicItemId = magicItemRecord.id;
            } else {
              // Skip items that can't be resolved
              console.warn(`[Character Import] Skipping magic item "${item.name}" - not found in database`);
              continue;
            }
          } else {
            // Mundane item - store the name directly
            mundaneItemName = item.name;
          }
          
          inventoryData.push({
            character_id: characterId,
            ...(magicItemId ? { magic_item_id: magicItemId } : {}),
            ...(mundaneItemName ? { mundane_item_name: mundaneItemName } : {}),
            quantity: item.quantity || 1,
            equipped: item.equipped || false,
            attuned: item.attuned || false,
            notes: item.notes || null,
          });
        }
        
        if (inventoryData.length > 0) {
          const { error } = await supabase.from('character_inventory').insert(inventoryData);
          if (error) throw error;
        }
      }

      if (characterData.currency) {
        const currencyWithCharId = { ...characterData.currency, character_id: characterId };
        const { error } = await supabase.from('character_currency').insert(currencyWithCharId);
        if (error) throw error;
      }

      if (characterData.senses.length > 0) {
        const sensesWithCharId = characterData.senses.map(s => ({ ...s, character_id: characterId }));
        const { error } = await supabase.from('character_senses').insert(sensesWithCharId);
        if (error) throw error;
      }

      if (characterData.classSpecific && Object.keys(characterData.classSpecific).length > 0) {
        const { error } = await supabase.from('character_class_specific').insert({
          character_id: characterId,
          data: characterData.classSpecific,
        });
        if (error) throw error;
      }

      setStatus(`✅ Character "${characterData.character.name}" saved successfully!`);
      setCharacterData(null);
      setReviewData(null);
      setJsonInput('');
      setStep('url');
      onReviewPendingChange?.(false);

      if (onImportComplete) {
        onImportComplete(characterData.character);
      }
    } catch (error) {
      console.error('Save error:', error);
      setStatus(`❌ Save failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <h2>Import D&D Beyond Character</h2>

      {status && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '4px',
          background: status.includes('✅') ? '#d4edda' : status.includes('⚠️') ? '#fff3cd' : '#f8d7da',
          color: status.includes('✅') ? '#155724' : status.includes('⚠️') ? '#856404' : '#721c24',
          border: `1px solid ${status.includes('✅') ? '#c3e6cb' : status.includes('⚠️') ? '#ffeaa7' : '#f5c6cb'}`
        }}>
          {status}
        </div>
      )}

      {step === 'url' && (
        <form onSubmit={handleFetchJson} style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Paste Character JSON:
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666', marginLeft: '8px' }}>
              (Paste the full JSON from D&D Beyond)
            </span>
          </label>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Paste the full D&D Beyond character JSON here..."
            required
            rows={8}
            style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'monospace', fontSize: '12px' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: loading ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Loading & Preparing...' : '📥 Import & Review'}
          </button>
        </form>
      )}

      {step === 'review' && reviewData && !reviewOpen && (
        <div style={{ marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            style={{
              padding: '10px 18px',
              background: '#fff3cd',
              color: '#856404',
              border: '1px solid #ffeaa7',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Review pending reference data
          </button>
        </div>
      )}

      {reviewOpen && reviewData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20, 24, 28, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#f5f1ea',
            color: '#2b2b2b',
            padding: '24px',
            borderRadius: '8px',
            width: 'min(900px, 92vw)',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)'
          }}>
            <h3 style={{ marginTop: 0 }}>Review reference data</h3>
            <p style={{ color: '#555', marginTop: '6px' }}>
              Approve each entry before it is added. Use Edit to open the full form, then return here.
            </p>

            {['spells', 'items', 'feats'].map((type) => (
              <div key={type} style={{ marginTop: '18px' }}>
                <h4 style={{ marginBottom: '10px', textTransform: 'capitalize' }}>{type}</h4>

                {reviewData[type].candidates.length === 0 && reviewData[type].failed.length === 0 && (
                  <div style={{ color: '#777', fontSize: '14px' }}>No pending {type}.</div>
                )}

                {reviewData[type].candidates.map((entry, index) => (
                  <div key={`${type}-${entry.name}-${index}`} style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '10px',
                    background: entry.approved ? '#eaf7ed' : entry.skipped ? '#f5f5f5' : '#fff'
                  }}>
                    <div style={{ fontWeight: 'bold' }}>{entry.name}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                      {entry.approved ? 'Approved' : entry.skipped ? 'Skipped' : 'Pending review'}
                    </div>
                    {entry.sourceUrl && (
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        Source: {entry.sourceUrl}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => startEdit(type, index, entry)}
                        style={{
                          padding: '6px 12px',
                          background: '#f0f0f0',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(type, 'candidates', index)}
                        disabled={entry.approved || entry.skipped}
                        style={{
                          padding: '6px 12px',
                          background: entry.approved ? '#c8e6c9' : '#4CAF50',
                          color: entry.approved ? '#2e7d32' : 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: entry.approved || entry.skipped ? 'default' : 'pointer'
                        }}
                      >
                        {entry.approved ? 'Approved' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSkip(type, 'candidates', index)}
                        disabled={entry.approved || entry.skipped}
                        style={{
                          padding: '6px 12px',
                          background: entry.skipped ? '#e0e0e0' : '#9e9e9e',
                          color: '#333',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: entry.approved || entry.skipped ? 'default' : 'pointer'
                        }}
                      >
                        {entry.skipped ? 'Skipped' : 'Skip'}
                      </button>
                    </div>

                    {editingEntry?.type === type && editingEntry?.index === index && editForm && (
                      <div style={{ marginTop: '12px', padding: '12px', background: '#f7f7f7', borderRadius: '6px' }}>
                        {editError && (
                          <div style={{ color: '#c0392b', marginBottom: '8px' }}>{editError}</div>
                        )}

                        {entry.sourceUrl && (
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                            Source: {entry.sourceUrl}
                          </div>
                        )}

                        {type === 'spells' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                            <input value={editForm.level} onChange={(e) => setEditForm({ ...editForm, level: e.target.value })} placeholder="Level" />
                            <input value={editForm.school} onChange={(e) => setEditForm({ ...editForm, school: e.target.value })} placeholder="School" />
                            <input value={editForm.casting_time} onChange={(e) => setEditForm({ ...editForm, casting_time: e.target.value })} placeholder="Casting time" />
                            <input value={editForm.range} onChange={(e) => setEditForm({ ...editForm, range: e.target.value })} placeholder="Range" />
                            <input value={editForm.components} onChange={(e) => setEditForm({ ...editForm, components: e.target.value })} placeholder="Components" />
                            <input value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })} placeholder="Duration" />
                            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" rows={4} style={{ gridColumn: '1 / -1' }} />
                            <textarea value={editForm.higher_levels} onChange={(e) => setEditForm({ ...editForm, higher_levels: e.target.value })} placeholder="At higher levels" rows={2} style={{ gridColumn: '1 / -1' }} />
                          </div>
                        )}

                        {type === 'items' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                            <input value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} placeholder="Type" />
                            <input value={editForm.rarity} onChange={(e) => setEditForm({ ...editForm, rarity: e.target.value })} placeholder="Rarity" />
                            <input value={editForm.requires_attunement} onChange={(e) => setEditForm({ ...editForm, requires_attunement: e.target.value })} placeholder="Attunement" />
                            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" rows={4} style={{ gridColumn: '1 / -1' }} />
                            <textarea value={editForm.properties} onChange={(e) => setEditForm({ ...editForm, properties: e.target.value })} placeholder="Properties (JSON)" rows={3} style={{ gridColumn: '1 / -1', fontFamily: 'monospace' }} />
                          </div>
                        )}

                        {type === 'feats' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                            <input value={editForm.prerequisites} onChange={(e) => setEditForm({ ...editForm, prerequisites: e.target.value })} placeholder="Prerequisites" />
                            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" rows={4} style={{ gridColumn: '1 / -1' }} />
                            <textarea value={editForm.benefits} onChange={(e) => setEditForm({ ...editForm, benefits: e.target.value })} placeholder="Benefits (JSON)" rows={3} style={{ gridColumn: '1 / -1', fontFamily: 'monospace' }} />
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          <button type="button" onClick={saveEdit} style={{ padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>
                            Save changes
                          </button>
                          <button type="button" onClick={cancelEdit} style={{ padding: '6px 12px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {reviewData[type].failed.map((entry, index) => (
                  <div key={`${type}-failed-${entry.name}-${index}`} style={{
                    border: '1px solid #f5c6cb',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '10px',
                    background: entry.approved ? '#fff3cd' : entry.skipped ? '#f5f5f5' : '#fff'
                  }}>
                    <div style={{ fontWeight: 'bold' }}>{formatFailName(entry)}</div>
                    <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '8px' }}>
                      {entry.error}
                    </div>
                    {entry.sourceUrl && (
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        Tried: {entry.sourceUrl}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleApprove(type, 'failed', index)}
                        disabled={entry.approved || entry.skipped}
                        style={{
                          padding: '6px 12px',
                          background: entry.approved ? '#ffeaa7' : '#f39c12',
                          color: '#5d4037',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: entry.approved || entry.skipped ? 'default' : 'pointer'
                        }}
                      >
                        {entry.approved ? 'Resolved' : 'Mark resolved'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSkip(type, 'failed', index)}
                        disabled={entry.approved || entry.skipped}
                        style={{
                          padding: '6px 12px',
                          background: entry.skipped ? '#e0e0e0' : '#9e9e9e',
                          color: '#333',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: entry.approved || entry.skipped ? 'default' : 'pointer'
                        }}
                      >
                        {entry.skipped ? 'Skipped' : 'Skip'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                style={{
                  padding: '8px 16px',
                  background: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleContinueImport}
                disabled={!reviewReady || loading}
                style={{
                  padding: '8px 16px',
                  background: reviewReady ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: reviewReady ? 'pointer' : 'not-allowed'
                }}
              >
                {loading ? 'Importing...' : 'Continue import'}
              </button>
            </div>
          </div>
        </div>
      )}


      {characterReviewOpen && characterData && step === 'character-review' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20, 24, 28, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#f5f1ea',
            color: '#2b2b2b',
            padding: '24px',
            borderRadius: '8px',
            width: 'min(1000px, 95vw)',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)'
          }}>
            <h3 style={{ marginTop: 0 }}>Character Review & Ability Score Improvements</h3>
            <p style={{ color: '#555', marginTop: '6px' }}>
              Review and edit ability score improvements before saving.
            </p>

            {/* ASI Management */}
            <div style={{ marginBottom: '24px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
              <h4 style={{ marginTop: 0 }}>Ability Score Improvements</h4>
              
              {characterData.abilityScoreImprovements && characterData.abilityScoreImprovements.length > 0 ? (
                <>
                  {groupAbilityScoreImprovements(characterData.abilityScoreImprovements).map((group, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      marginBottom: '8px',
                      background: '#f9f9f9',
                      borderRadius: '4px',
                      border: '1px solid #e0e0e0'
                    }}>
                      <div>
                        <strong>{group.source}</strong> ({group.sourceType})
                        <br />
                        <span style={{ fontSize: '14px', color: '#666' }}>
                          {group.abilities.map(ab => `${ab.ability} +${ab.amount}`).join(', ')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => startEditAsi(index, group)}
                          style={{
                            padding: '4px 8px',
                            background: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            // Remove all ASIs for this source
                            const remaining = characterData.abilityScoreImprovements.filter(
                              asi => !(asi.source === group.source && asi.sourceType === group.sourceType)
                            );
                            characterData.abilityScoreImprovements = remaining;
                            setCharacterData({ ...characterData });
                          }}
                          style={{
                            padding: '4px 8px',
                            background: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p style={{ color: '#999', fontStyle: 'italic' }}>No ability score improvements recorded.</p>
              )}

              <button
                onClick={() => startEditAsi(undefined, null)}
                style={{
                  padding: '8px 16px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                + Add Ability Score Improvement
              </button>
            </div>

            {/* ASI Edit Form */}
            {asiEditing && asiForm && (
              <div style={{
                marginBottom: '24px',
                padding: '16px',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px'
              }}>
                <h4 style={{ marginTop: 0 }}>Edit Ability Score Improvement</h4>
                
                {/* Source & Type (shared by all abilities in this entry) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Source:</label>
                    <input
                      type="text"
                      value={asiForm.source}
                      onChange={(e) => setAsiForm({ ...asiForm, source: e.target.value })}
                      placeholder="e.g., Hermit, Ability Score Improvement"
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Source Type:</label>
                    <select
                      value={asiForm.sourceType}
                      onChange={(e) => setAsiForm({ ...asiForm, sourceType: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                      <option value="background">Background</option>
                      <option value="level">Level ASI</option>
                      <option value="feat">Feat</option>
                      <option value="race">Race</option>
                      <option value="item">Item</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                
                {/* Ability selections (can have multiple) */}
                <div>
                  <h5 style={{ marginTop: 0, marginBottom: '8px' }}>Abilities:</h5>
                  {asiForm.abilities && asiForm.abilities.map((ab, abIndex) => (
                    <div key={abIndex} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Ability:</label>
                        <select
                          value={ab.ability}
                          onChange={(e) => {
                            const newAbilities = [...asiForm.abilities];
                            newAbilities[abIndex].ability = e.target.value;
                            setAsiForm({ ...asiForm, abilities: newAbilities });
                          }}
                          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                          <option value="strength">Strength</option>
                          <option value="dexterity">Dexterity</option>
                          <option value="constitution">Constitution</option>
                          <option value="intelligence">Intelligence</option>
                          <option value="wisdom">Wisdom</option>
                          <option value="charisma">Charisma</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Amount:</label>
                        <select
                          value={ab.amount}
                          onChange={(e) => {
                            const newAbilities = [...asiForm.abilities];
                            newAbilities[abIndex].amount = parseInt(e.target.value);
                            setAsiForm({ ...asiForm, abilities: newAbilities });
                          }}
                          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                          <option value={1}>+1</option>
                          <option value={2}>+2</option>
                          <option value={3}>+3</option>
                        </select>
                      </div>
                      {asiForm.abilities.length > 1 && (
                        <button
                          onClick={() => {
                            const newAbilities = asiForm.abilities.filter((_, i) => i !== abIndex);
                            setAsiForm({ ...asiForm, abilities: newAbilities });
                          }}
                          style={{
                            padding: '6px 12px',
                            background: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newAbilities = [...asiForm.abilities, { ability: 'strength', amount: 1 }];
                      setAsiForm({ ...asiForm, abilities: newAbilities });
                    }}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    + Add Another Ability
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={saveEditAsi}
                    style={{
                      padding: '8px 16px',
                      background: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Save ASI
                  </button>
                  <button
                    onClick={cancelEditAsi}
                    style={{
                      padding: '8px 16px',
                      background: '#999',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleConfirmCharacterReview}
                style={{
                  padding: '12px 24px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✓ Confirm & Proceed to Save
              </button>
              <button
                onClick={() => {
                  setCharacterReviewOpen(false);
                  setStep('review');
                }}
                style={{
                  padding: '12px 24px',
                  background: '#f0f0f0',
                  color: '#333',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ← Back to Reference Review
              </button>
            </div>
          </div>
        </div>
      )}

      {characterData && step === 'saved' && (
        <div style={{
          background: '#f0f7ff',
          padding: '20px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #2196F3'
        }}>
          <h3 style={{ marginTop: 0 }}>Character Ready to Save</h3>

          <div style={{ marginBottom: '20px', padding: '15px', background: '#fff', borderRadius: '4px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Assign to User:
            </label>
            <div style={{ marginBottom: '12px' }}>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '16px'
                }}
              >
                <option value="">-- Select user or enter ID below --</option>
                {availableUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.email} (Current)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#666' }}>
                Or paste a user ID:
              </label>
              <input
                type="text"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                placeholder="Paste user UUID here"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '14px',
                  fontFamily: 'monospace'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div>
              <strong>Name:</strong> {characterData.character.name}
            </div>
            <div>
              <strong>Level:</strong> {characterData.character.level}
            </div>
            <div>
              <strong>Species:</strong> {characterData.character.species}
            </div>
            <div>
              <strong>Class(es):</strong> {characterData.character.classes.map(c => `${c.class} ${c.level}`).join(' / ')}
            </div>
          </div>

          <button
            onClick={handleSaveCharacter}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: loading ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              marginRight: '10px'
            }}
          >
            {loading ? 'Saving...' : '💾 Save Character'}
          </button>

          <button
            onClick={() => {
              setCharacterData(null);
              setReviewData(null);
              setJsonInput('');
              setStep('url');
              setStatus('');
              onReviewPendingChange?.(false);
            }}
            style={{
              padding: '12px 24px',
              background: '#f0f0f0',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}
    </div>
  );
}

CharacterImporter.propTypes = {
  onImportComplete: PropTypes.func,
  onReviewPendingChange: PropTypes.func,
  reviewOpenNonce: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.bool])
};
