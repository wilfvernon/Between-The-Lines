import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

function CharacterManagement() {
  const [characters, setCharacters] = useState([]);
  const [spells, setSpells] = useState([]);
  const [magicItems, setMagicItems] = useState([]);

  const [selectedCharacterId, setSelectedCharacterId] = useState('');

  const [characterSpells, setCharacterSpells] = useState([]);
  const [characterMagicItems, setCharacterMagicItems] = useState([]);

  const [spellSearch, setSpellSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [selectedSpellId, setSelectedSpellId] = useState('');
  const [selectedMagicItemId, setSelectedMagicItemId] = useState('');

  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemEquipped, setNewItemEquipped] = useState(false);
  const [newItemAttuned, setNewItemAttuned] = useState(false);
  const [newItemNotes, setNewItemNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [linksLoading, setLinksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadCoreData = async () => {
      setLoading(true);
      setStatus('');

      try {
        const [charactersRes, spellsRes, itemsRes] = await Promise.all([
          supabase
            .from('characters')
            .select('id, name, level')
            .order('name', { ascending: true }),
          supabase
            .from('spells')
            .select('id, name, level')
            .order('level', { ascending: true })
            .order('name', { ascending: true }),
          supabase
            .from('magic_items')
            .select('id, name, rarity, requires_attunement')
            .order('name', { ascending: true })
        ]);

        if (charactersRes.error) throw charactersRes.error;
        if (spellsRes.error) throw spellsRes.error;
        if (itemsRes.error) throw itemsRes.error;

        if (!isMounted) return;

        const loadedCharacters = charactersRes.data || [];
        setCharacters(loadedCharacters);
        setSpells(spellsRes.data || []);
        setMagicItems(itemsRes.data || []);

        if (loadedCharacters.length > 0) {
          setSelectedCharacterId((current) => current || loadedCharacters[0].id);
        }
      } catch (error) {
        if (!isMounted) return;
        setStatus(`Failed to load admin character data: ${error.message}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCoreData();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadCharacterLinks = async (characterId) => {
    if (!characterId) {
      setCharacterSpells([]);
      setCharacterMagicItems([]);
      return;
    }

    setLinksLoading(true);
    setStatus('');

    try {
      const [charSpellsRes, charItemsRes] = await Promise.all([
        supabase
          .from('character_spells')
          .select('id, spell_id, is_prepared, always_prepared, spell:spells(id, name, level)')
          .eq('character_id', characterId)
          .order('created_at', { ascending: true }),
        supabase
          .from('character_inventory')
          .select('id, magic_item_id, quantity, equipped, attuned, notes, magic_item:magic_items(id, name, rarity, requires_attunement)')
          .eq('character_id', characterId)
          .not('magic_item_id', 'is', null)
          .order('created_at', { ascending: true })
      ]);

      if (charSpellsRes.error) throw charSpellsRes.error;
      if (charItemsRes.error) throw charItemsRes.error;

      setCharacterSpells(charSpellsRes.data || []);
      setCharacterMagicItems(charItemsRes.data || []);
    } catch (error) {
      setStatus(`Failed to load character links: ${error.message}`);
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => {
    loadCharacterLinks(selectedCharacterId);
  }, [selectedCharacterId]);

  const knownSpellIds = useMemo(
    () => new Set(characterSpells.map((entry) => entry.spell_id).filter(Boolean)),
    [characterSpells]
  );

  const linkedMagicItemIds = useMemo(
    () => new Set(characterMagicItems.map((entry) => entry.magic_item_id).filter(Boolean)),
    [characterMagicItems]
  );

  const filteredSpells = useMemo(() => {
    const query = spellSearch.trim().toLowerCase();
    return spells.filter((spell) => {
      if (!spell) return false;
      if (!query) return true;
      return String(spell.name || '').toLowerCase().includes(query);
    });
  }, [spells, spellSearch]);

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return magicItems.filter((item) => {
      if (!item) return false;
      if (!query) return true;
      return String(item.name || '').toLowerCase().includes(query);
    });
  }, [magicItems, itemSearch]);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) || null;

  const handleAddSpell = async () => {
    if (!selectedCharacterId || !selectedSpellId) return;

    if (knownSpellIds.has(selectedSpellId)) {
      setStatus('That spell is already linked to this character.');
      return;
    }

    setSaving(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('character_spells')
        .insert({
          character_id: selectedCharacterId,
          spell_id: selectedSpellId,
          is_prepared: false,
          always_prepared: false
        });

      if (error) throw error;

      setSelectedSpellId('');
      setStatus('Spell linked to character.');
      await loadCharacterLinks(selectedCharacterId);
    } catch (error) {
      setStatus(`Failed to add spell: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSpell = async (characterSpellId) => {
    setSaving(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('character_spells')
        .delete()
        .eq('id', characterSpellId);

      if (error) throw error;

      setStatus('Spell removed from character.');
      await loadCharacterLinks(selectedCharacterId);
    } catch (error) {
      setStatus(`Failed to remove spell: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSpellFlag = async (entry, field) => {
    if (!entry?.id) return;

    setSaving(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('character_spells')
        .update({ [field]: !entry[field] })
        .eq('id', entry.id);

      if (error) throw error;

      await loadCharacterLinks(selectedCharacterId);
    } catch (error) {
      setStatus(`Failed to update spell flag: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMagicItem = async () => {
    if (!selectedCharacterId || !selectedMagicItemId) return;

    setSaving(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('character_inventory')
        .insert({
          character_id: selectedCharacterId,
          magic_item_id: selectedMagicItemId,
          quantity: Number(newItemQuantity) || 1,
          equipped: !!newItemEquipped,
          attuned: !!newItemAttuned,
          notes: newItemNotes.trim() || null
        });

      if (error) throw error;

      setSelectedMagicItemId('');
      setNewItemQuantity(1);
      setNewItemEquipped(false);
      setNewItemAttuned(false);
      setNewItemNotes('');
      setStatus('Magic item linked to character.');
      await loadCharacterLinks(selectedCharacterId);
    } catch (error) {
      setStatus(`Failed to add magic item: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateInventoryField = async (inventoryId, updates) => {
    if (!inventoryId) return;

    setSaving(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('character_inventory')
        .update(updates)
        .eq('id', inventoryId);

      if (error) throw error;

      await loadCharacterLinks(selectedCharacterId);
    } catch (error) {
      setStatus(`Failed to update magic item entry: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMagicItem = async (inventoryId) => {
    setSaving(true);
    setStatus('');

    try {
      const { error } = await supabase
        .from('character_inventory')
        .delete()
        .eq('id', inventoryId);

      if (error) throw error;

      setStatus('Magic item removed from character inventory.');
      await loadCharacterLinks(selectedCharacterId);
    } catch (error) {
      setStatus(`Failed to remove magic item: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="admin-status">Loading character management data...</p>;
  }

  return (
    <div className="admin-character-management">
      <h2>Character Management</h2>
      <p className="admin-status admin-manage-note">
        Link spells and magic items to characters without manual join-table edits.
      </p>

      <div className="admin-form" style={{ marginBottom: '0.8rem' }}>
        <label htmlFor="admin-character-select">Character</label>
        <select
          id="admin-character-select"
          value={selectedCharacterId}
          onChange={(event) => setSelectedCharacterId(event.target.value)}
          disabled={saving || linksLoading}
        >
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name} (Level {character.level || 1})
            </option>
          ))}
        </select>
      </div>

      {selectedCharacter && (
        <p className="admin-status">
          Editing links for <strong>{selectedCharacter.name}</strong>
        </p>
      )}

      {linksLoading ? (
        <p className="admin-status">Loading spells and inventory links...</p>
      ) : (
        <div className="admin-grid">
          <section className="admin-card">
            <h3>Spells</h3>

            <div className="admin-form">
              <label htmlFor="admin-spell-search">Search spells</label>
              <input
                id="admin-spell-search"
                value={spellSearch}
                onChange={(event) => setSpellSearch(event.target.value)}
                placeholder="e.g. Hex"
                disabled={saving}
              />

              <label htmlFor="admin-spell-select">Add spell to character</label>
              <select
                id="admin-spell-select"
                value={selectedSpellId}
                onChange={(event) => setSelectedSpellId(event.target.value)}
                disabled={saving}
              >
                <option value="">Select spell...</option>
                {filteredSpells.map((spell) => (
                  <option key={spell.id} value={spell.id}>
                    L{spell.level} - {spell.name}{knownSpellIds.has(spell.id) ? ' (already linked)' : ''}
                  </option>
                ))}
              </select>

              <button type="button" onClick={handleAddSpell} disabled={saving || !selectedSpellId}>
                {saving ? 'Saving...' : 'Add Spell'}
              </button>
            </div>

            <div className="admin-list">
              {characterSpells.length === 0 && (
                <p className="admin-status">No spells linked yet.</p>
              )}

              {characterSpells.map((entry) => (
                <div key={entry.id} className="admin-list-item">
                  <div className="admin-list-copy">
                    <strong>{entry.spell?.name || 'Unknown spell'}</strong>
                    <span>Level {entry.spell?.level ?? '?'}</span>
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-action-btn is-muted"
                      onClick={() => handleToggleSpellFlag(entry, 'is_prepared')}
                      disabled={saving}
                    >
                      {entry.is_prepared ? 'Unset Prepared' : 'Set Prepared'}
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn is-muted"
                      onClick={() => handleToggleSpellFlag(entry, 'always_prepared')}
                      disabled={saving}
                    >
                      {entry.always_prepared ? 'Unset Always' : 'Set Always'}
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn is-danger"
                      onClick={() => handleRemoveSpell(entry.id)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-card">
            <h3>Magic Items</h3>

            <div className="admin-form">
              <label htmlFor="admin-item-search">Search magic items</label>
              <input
                id="admin-item-search"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="e.g. Glimmercloak"
                disabled={saving}
              />

              <label htmlFor="admin-item-select">Add magic item to inventory</label>
              <select
                id="admin-item-select"
                value={selectedMagicItemId}
                onChange={(event) => setSelectedMagicItemId(event.target.value)}
                disabled={saving}
              >
                <option value="">Select magic item...</option>
                {filteredItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{linkedMagicItemIds.has(item.id) ? ' (linked)' : ''}
                  </option>
                ))}
              </select>

              <label htmlFor="admin-item-quantity">Quantity</label>
              <input
                id="admin-item-quantity"
                type="number"
                min={1}
                value={newItemQuantity}
                onChange={(event) => setNewItemQuantity(event.target.value)}
                disabled={saving}
              />

              <label htmlFor="admin-item-notes">Notes</label>
              <textarea
                id="admin-item-notes"
                rows={2}
                value={newItemNotes}
                onChange={(event) => setNewItemNotes(event.target.value)}
                disabled={saving}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={newItemEquipped}
                  onChange={(event) => setNewItemEquipped(event.target.checked)}
                  disabled={saving}
                />
                Equipped
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={newItemAttuned}
                  onChange={(event) => setNewItemAttuned(event.target.checked)}
                  disabled={saving}
                />
                Attuned
              </label>

              <button type="button" onClick={handleAddMagicItem} disabled={saving || !selectedMagicItemId}>
                {saving ? 'Saving...' : 'Add Magic Item'}
              </button>
            </div>

            <div className="admin-list">
              {characterMagicItems.length === 0 && (
                <p className="admin-status">No magic items linked yet.</p>
              )}

              {characterMagicItems.map((entry) => (
                <div key={entry.id} className="admin-list-item">
                  <div className="admin-list-copy">
                    <strong>{entry.magic_item?.name || 'Unknown item'}</strong>
                    <span>
                      Qty {entry.quantity || 1}
                      {entry.magic_item?.rarity ? ` • ${entry.magic_item.rarity}` : ''}
                    </span>
                    {entry.notes ? <span>Notes: {entry.notes}</span> : null}
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-action-btn is-muted"
                      onClick={() => handleUpdateInventoryField(entry.id, { equipped: !entry.equipped })}
                      disabled={saving}
                    >
                      {entry.equipped ? 'Unequip' : 'Equip'}
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn is-muted"
                      onClick={() => handleUpdateInventoryField(entry.id, { attuned: !entry.attuned })}
                      disabled={saving}
                    >
                      {entry.attuned ? 'Unattune' : 'Attune'}
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn is-danger"
                      onClick={() => handleRemoveMagicItem(entry.id)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {status && <p className="admin-status">{status}</p>}
    </div>
  );
}

export default CharacterManagement;
