import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { extractFeatGrantedSpells } from '../lib/featChoices';

const buildCharacter = (base, related) => {
  if (!base) return null;
  return {
    ...base,
    skills: related.skills || [],
    spells: related.spells || [],
    inventory: related.inventory || [],
    features: related.features || [],
    feats: related.feats || [],
    senses: related.senses || [],
    class_specific: related.classSpecific || null
  };
};

const sortCharacterSpells = (entries = []) => {
  return [...entries].sort((a, b) => {
    const aLevel = a?.spell?.level ?? Number.MAX_SAFE_INTEGER;
    const bLevel = b?.spell?.level ?? Number.MAX_SAFE_INTEGER;
    if (aLevel !== bLevel) return aLevel - bLevel;
    const aName = a?.spell?.name || '';
    const bName = b?.spell?.name || '';
    return aName.localeCompare(bName);
  });
};

const fetchCharacterSpellsWithFallback = async (characterId) => {
  const joined = await supabase
    .from('character_spells')
    .select('*, spell:spells(*)')
    .eq('character_id', characterId)
    .order('spell(level)', { ascending: true });

  if (!joined.error) {
    return joined.data || [];
  }

  console.warn('Joined spell query failed, using fallback spell fetch:', joined.error.message);

  const baseRows = await supabase
    .from('character_spells')
    .select('*')
    .eq('character_id', characterId);

  if (baseRows.error) {
    throw baseRows.error;
  }

  const rows = baseRows.data || [];
  const spellIds = [...new Set(rows.map((row) => row.spell_id).filter(Boolean))];
  if (!spellIds.length) {
    return rows;
  }

  const spellRows = await supabase
    .from('spells')
    .select('*')
    .in('id', spellIds);

  if (spellRows.error) {
    console.warn('Fallback spell details query failed:', spellRows.error.message);
    return rows;
  }

  const spellById = new Map((spellRows.data || []).map((spell) => [spell.id, spell]));
  return sortCharacterSpells(
    rows.map((row) => ({
      ...row,
      spell: spellById.get(row.spell_id) || null
    }))
  );
};

const hydrateSpellSummons = async (spellRows = []) => {
  const summonIds = [...new Set(spellRows.map((row) => row?.summon_id).filter(Boolean))];
  if (!summonIds.length) return spellRows;

  const summonRes = await supabase
    .from('monster_statblocks')
    .select('id, name, size, creature_type, alignment, challenge_rating, armor_class_value, armor_class_notes, hit_points_value, hit_points_formula')
    .in('id', summonIds);

  if (summonRes.error) {
    console.warn('Failed to hydrate spell summons:', summonRes.error.message);
    return spellRows;
  }

  const summonById = new Map((summonRes.data || []).map((row) => [row.id, row]));
  return spellRows.map((row) => ({
    ...row,
    summon: row?.summon_id ? (summonById.get(row.summon_id) || null) : null
  }));
};

const fetchInventoryWithMagicEquipment = async (characterId) => {
  const inventoryRes = await supabase
    .from('character_inventory')
    .select('*, equipment(*), magic_item:magic_items(*)')
    .eq('character_id', characterId);

  if (inventoryRes.error) {
    throw inventoryRes.error;
  }

  const inventoryRows = inventoryRes.data || [];
  const linkedEquipmentIds = [...new Set(
    inventoryRows
      .map((row) => row?.magic_item?.equipment_id)
      .filter(Boolean)
  )];

  if (!linkedEquipmentIds.length) {
    return inventoryRows;
  }

  const equipmentRes = await supabase
    .from('equipment')
    .select('*')
    .in('id', linkedEquipmentIds);

  if (equipmentRes.error) {
    console.warn('Failed to hydrate magic item linked equipment:', equipmentRes.error.message);
    return inventoryRows;
  }

  const equipmentById = new Map((equipmentRes.data || []).map((entry) => [entry.id, entry]));

  return inventoryRows.map((row) => {
    if (!row?.magic_item?.equipment_id) return row;
    const linkedEquipment = equipmentById.get(row.magic_item.equipment_id) || null;
    if (!linkedEquipment) return row;

    return {
      ...row,
      magic_item: {
        ...row.magic_item,
        equipment: linkedEquipment
      }
    };
  });
};

const normalizeObjectInput = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value;
  return null;
};

const normalizeFeatureBenefitsInput = (benefits) => {
  if (Array.isArray(benefits)) return benefits;
  const asObject = normalizeObjectInput(benefits);
  if (!asObject) return [];
  // Accept both typed benefit objects and top-level spell grant containers.
  if (asObject.type || asObject.spells?.grants) return [asObject];
  return [];
};

const buildClassLevelMap = (classes = []) => {
  const map = new Map();
  (classes || []).forEach((entry) => {
    const className = String(entry?.class || entry?.definition?.name || '').trim().toLowerCase();
    if (!className) return;
    const level = Number(entry?.level || entry?.definition?.level || 0);
    if (!Number.isFinite(level)) return;
    map.set(className, Math.max(map.get(className) || 0, level));
  });
  return map;
};

const extractFeatureGrantedSpells = (features = [], classes = []) => {
  const classLevelMap = buildClassLevelMap(classes);
  const totalCharacterLevel = (classes || []).reduce((total, entry) => {
    const level = Number(entry?.level || entry?.definition?.level || 0);
    return total + (Number.isFinite(level) ? level : 0);
  }, 0);

  return (features || []).flatMap((feature) => {
    const source = normalizeObjectInput(feature?.source);
    const sourceClass = String(source?.class || '').trim().toLowerCase();
    const sourceClassLevel = sourceClass ? (classLevelMap.get(sourceClass) || 0) : null;
    const sourceLabel = feature?.name || 'Feature';

    const benefits = normalizeFeatureBenefitsInput(feature?.benefits ?? feature?.benefit);

    return benefits.flatMap((benefit) => {
      const grants = Array.isArray(benefit?.spells?.grants) ? benefit.spells.grants : [];

      return grants
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.name === 'string')
        .filter((entry) => {
          const requiredLevel = Number(entry?.level_required);
          if (!Number.isFinite(requiredLevel)) return true;
          if (!sourceClass) return totalCharacterLevel >= requiredLevel;
          return sourceClassLevel >= requiredLevel;
        })
        .map((entry) => ({
          name: entry.name,
          uses: Number.isFinite(Number(entry.uses)) ? Number(entry.uses) : undefined,
          source: sourceLabel,
          level_required: Number.isFinite(Number(entry?.level_required)) ? Number(entry.level_required) : undefined
        }));
    });
  });
};

const isMagicItemAttunementRequired = (magicItem) => {
  const value = magicItem?.requires_attunement;
  if (value === null || value === undefined) return false;
  return String(value).trim().toLowerCase() !== 'no';
};

const extractMagicItemGrantedSpells = (inventory = []) => {
  return (inventory || []).flatMap((inventoryItem) => {
    const magicItem = inventoryItem?.magic_item;
    if (!magicItem) return [];

    // If an item requires attunement, only grant spells while attuned.
    if (isMagicItemAttunementRequired(magicItem) && !inventoryItem.attuned) {
      return [];
    }

    const sourceLabel = magicItem?.name || 'Magic Item';
    const itemBenefits = normalizeFeatureBenefitsInput(
      magicItem?.benefits ?? magicItem?.properties?.benefits ?? magicItem?.properties
    );

    return itemBenefits.flatMap((benefit) => {
      const results = [];
      
      // Pattern 1: { spells: { grants: [...] } }
      const grants = Array.isArray(benefit?.spells?.grants) ? benefit.spells.grants : [];
      grants
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.name === 'string')
        .forEach((entry) => {
          results.push({
            name: entry.name,
            uses: Number.isFinite(Number(entry.uses)) ? Number(entry.uses) : undefined,
            source: sourceLabel
          });
        });
      
      // Pattern 2: { type: "spell_grant", spell: "Disguise Self", uses: 1 }
      const benefitType = String(benefit?.type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (benefitType === 'spell_grant' && typeof benefit?.spell === 'string') {
        results.push({
          name: benefit.spell,
          uses: Number.isFinite(Number(benefit.uses)) ? Number(benefit.uses) : undefined,
          source: sourceLabel
        });
      }
      
      return results;
    });
  });
};

export const useCharacter = ({ user, isAdmin }) => {
  const [characters, setCharacters] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [error, setError] = useState('');

  const baseCharacter = useMemo(() => {
    if (!selectedCharacterId) return null;
    return characters.find((c) => c.id === selectedCharacterId) || null;
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    const fetchCharacters = async () => {
      if (!user) return;
      try {
        setLoading(true);
        setError('');

        if (isAdmin) {
          const { data, error: err } = await supabase
            .from('characters')
            .select('*');
          if (err) throw err;
          setCharacters(data || []);
          if (data?.length > 0) {
            setSelectedCharacterId((prev) => prev || data[0].id);
          }
        } else {
          const { data, error: err } = await supabase
            .from('characters')
            .select('*')
            .eq('user_id', user.id)
            .single();
          if (err && err.code !== 'PGRST116') throw err;
          if (data) {
            setCharacters([data]);
            setSelectedCharacterId(data.id);
          } else {
            setCharacters([]);
            setSelectedCharacterId('');
          }
        }
      } catch (err) {
        console.error('Error fetching character(s):', err);
        setError(err.message || 'Failed to load character');
      } finally {
        setLoading(false);
      }
    };

    fetchCharacters();
  }, [user, isAdmin]);

  useEffect(() => {
    setCharacter(baseCharacter || null);
  }, [baseCharacter]);

  const mergeGrantedSpells = async (baseSpells, granted, characterId, sourceType = 'granted') => {
    if (!granted.length) return baseSpells;

    const uniqueNames = [...new Set(granted.map((entry) => entry.name).filter(Boolean))];
    if (!uniqueNames.length) return baseSpells;

    const { data: spellRows, error } = await supabase
      .from('spells')
      .select('*')
      .in('name', uniqueNames);

    if (error) {
      console.warn('Failed to resolve feat-granted spells:', error.message);
      return baseSpells;
    }

    const spellByName = new Map((spellRows || []).map((spell) => [spell.name, spell]));
    const merged = [...baseSpells];

    granted.forEach((grant) => {
      const spell = spellByName.get(grant.name);
      if (!spell) return;

      const existingIndex = merged.findIndex((entry) => {
        const existingSpell = entry?.spell;
        return existingSpell?.id === spell.id || entry?.spell_id === spell.id;
      });

      if (existingIndex >= 0) {
        const explicitUses = Number.isFinite(Number(grant.uses)) ? Number(grant.uses) : null;
        merged[existingIndex] = {
          ...merged[existingIndex],
          always_prepared: true,
          feat_granted: sourceType === 'feat',
          feature_granted: sourceType === 'feature',
          item_granted: sourceType === 'item',
          feat_uses: explicitUses,
          feat_source: grant.source
        };
        return;
      }

      const explicitUses = Number.isFinite(Number(grant.uses)) ? Number(grant.uses) : null;

      merged.push({
        id: `feat-grant-${characterId}-${spell.id}`,
        character_id: characterId,
        spell_id: spell.id,
        is_prepared: true,
        always_prepared: true,
        feat_granted: sourceType === 'feat',
        feature_granted: sourceType === 'feature',
        item_granted: sourceType === 'item',
        feat_uses: explicitUses,
        feat_source: grant.source,
        spell
      });
    });

    return merged.sort((a, b) => {
      const aLevel = a?.spell?.level ?? 0;
      const bLevel = b?.spell?.level ?? 0;
      if (aLevel !== bLevel) return aLevel - bLevel;
      const aName = a?.spell?.name || '';
      const bName = b?.spell?.name || '';
      return aName.localeCompare(bName);
    });
  };

  const mergeFeatGrantedSpells = async (baseSpells, feats, characterId) => {
    const granted = extractFeatGrantedSpells(feats);
    return mergeGrantedSpells(baseSpells, granted, characterId, 'feat');
  };

  const mergeFeatureGrantedSpells = async (baseSpells, features, classes, characterId) => {
    const granted = extractFeatureGrantedSpells(features, classes);
    return mergeGrantedSpells(baseSpells, granted, characterId, 'feature');
  };

  const mergeMagicItemGrantedSpells = async (baseSpells, inventory, characterId) => {
    const granted = extractMagicItemGrantedSpells(inventory);
    return mergeGrantedSpells(baseSpells, granted, characterId, 'item');
  };

  useEffect(() => {
    const fetchRelatedData = async () => {
      if (!selectedCharacterId) return;

      setRelatedLoading(true);
      try {
        const [skillsRes, spellsRows, inventoryRows, featuresRes, featsRes, sensesRes] = await Promise.all([
          supabase.from('character_skills').select('*').eq('character_id', selectedCharacterId),
          fetchCharacterSpellsWithFallback(selectedCharacterId),
          fetchInventoryWithMagicEquipment(selectedCharacterId),
          supabase.from('character_features').select('*').eq('character_id', selectedCharacterId),
          supabase
            .from('character_feats')
            .select('*, feat:feats(*)')
            .eq('character_id', selectedCharacterId),
          supabase.from('character_senses').select('*').eq('character_id', selectedCharacterId)
          // character_class_specific commented out - RLS policy causes 406 errors, re-enable when needed
          // supabase.from('character_class_specific').select('*').eq('character_id', selectedCharacterId).single()
        ]);

        const queryErrors = [
          skillsRes.error,
          featuresRes.error,
          featsRes.error,
          sensesRes.error
        ].filter(Boolean);

        if (queryErrors.length > 0) {
          console.warn('Some related character queries failed:', queryErrors.map((err) => err.message));
          setError(queryErrors[0].message || 'Some character details failed to load');
        }

        const feats = featsRes.data || [];
        const features = featuresRes.data || [];
        const spellsWithSummons = await hydrateSpellSummons(spellsRows || []);
        const spellsWithFeatGrants = await mergeFeatGrantedSpells(
          spellsWithSummons,
          feats,
          selectedCharacterId
        );
        const mergedSpells = await mergeFeatureGrantedSpells(
          spellsWithFeatGrants,
          features,
          baseCharacter?.classes || [],
          selectedCharacterId
        );
        const mergedWithItemGrants = await mergeMagicItemGrantedSpells(
          mergedSpells,
          inventoryRows || [],
          selectedCharacterId
        );

        const related = {
          skills: skillsRes.data || [],
          spells: mergedWithItemGrants,
          inventory: inventoryRows || [],
          features,
          feats,
          senses: sensesRes.data || []
        };

        setCharacter((prev) => buildCharacter(prev || baseCharacter, related));
      } catch (err) {
        console.error('Error fetching character related data:', err);
        setError(err.message || 'Failed to load character details');
      } finally {
        setRelatedLoading(false);
      }
    };

    fetchRelatedData();
  }, [selectedCharacterId, baseCharacter]);

  const refetchInventory = async () => {
    if (!selectedCharacterId) return;
    try {
      const data = await fetchInventoryWithMagicEquipment(selectedCharacterId);
      
      setCharacter((prev) => (prev ? {
        ...prev,
        inventory: data || []
      } : null));
    } catch (err) {
      console.error('Error refetching inventory:', err);
    }
  };

  const refetchSpells = async () => {
    if (!selectedCharacterId) return;
    try {
      const data = await fetchCharacterSpellsWithFallback(selectedCharacterId);
      const dataWithSummons = await hydrateSpellSummons(data);

      const mergedSpells = await mergeFeatGrantedSpells(
        dataWithSummons || [],
        character?.feats || [],
        selectedCharacterId
      );
      const mergedWithFeatureGrants = await mergeFeatureGrantedSpells(
        mergedSpells,
        character?.features || [],
        character?.classes || [],
        selectedCharacterId
      );
      const mergedWithItemGrants = await mergeMagicItemGrantedSpells(
        mergedWithFeatureGrants,
        character?.inventory || [],
        selectedCharacterId
      );
      
      setCharacter((prev) => (prev ? {
        ...prev,
        spells: mergedWithItemGrants
      } : null));
    } catch (err) {
      console.error('Error refetching spells:', err);
    }
  };

  const updateCharacterFields = async (updates = {}) => {
    if (!selectedCharacterId) {
      throw new Error('No character selected');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Invalid character updates');
    }

    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(sanitizedUpdates).length === 0) {
      return;
    }

    const { error: updateError } = await supabase
      .from('characters')
      .update(sanitizedUpdates)
      .eq('id', selectedCharacterId);

    if (updateError) {
      throw updateError;
    }

    setCharacters((prev) => prev.map((entry) => {
      if (entry.id !== selectedCharacterId) return entry;
      return { ...entry, ...sanitizedUpdates };
    }));

    setCharacter((prev) => {
      if (!prev || prev.id !== selectedCharacterId) return prev;
      return { ...prev, ...sanitizedUpdates };
    });
  };

  return {
    character,
    characters,
    selectedCharacterId,
    setSelectedCharacterId,
    loading,
    relatedLoading,
    error,
    refetchInventory,
    refetchSpells,
    updateCharacterFields
  };
};
