import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    const fetchRelatedData = async () => {
      if (!selectedCharacterId) return;

      setRelatedLoading(true);
      try {
        const [skillsRes, spellsRes, inventoryRes, featuresRes, featsRes, sensesRes] = await Promise.all([
          supabase.from('character_skills').select('*').eq('character_id', selectedCharacterId),
          supabase
            .from('character_spells')
            .select('*, spell:spells(*)')
            .eq('character_id', selectedCharacterId)
            .order('spell(level)', { ascending: true }),
          supabase.from('character_inventory').select('*, equipment(*), magic_item:magic_items(*)').eq('character_id', selectedCharacterId),
          supabase.from('character_features').select('*').eq('character_id', selectedCharacterId),
          supabase.from('character_feats').select('*').eq('character_id', selectedCharacterId),
          supabase.from('character_senses').select('*').eq('character_id', selectedCharacterId)
          // character_class_specific commented out - RLS policy causes 406 errors, re-enable when needed
          // supabase.from('character_class_specific').select('*').eq('character_id', selectedCharacterId).single()
        ]);

        if (skillsRes.error) throw skillsRes.error;
        if (spellsRes.error) throw spellsRes.error;
        if (inventoryRes.error) throw inventoryRes.error;
        if (featuresRes.error) throw featuresRes.error;
        if (featsRes.error) throw featsRes.error;
        if (sensesRes.error) throw sensesRes.error;

        const related = {
          skills: skillsRes.data || [],
          spells: spellsRes.data || [],
          inventory: inventoryRes.data || [],
          features: featuresRes.data || [],
          feats: featsRes.data || [],
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
      const { data, error: err } = await supabase
        .from('character_inventory')
        .select('*, equipment(*), magic_item:magic_items(*)')
        .eq('character_id', selectedCharacterId);
      
      if (err) throw err;
      
      setCharacter((prev) => (prev ? {
        ...prev,
        inventory: data || []
      } : null));
    } catch (err) {
      console.error('Error refetching inventory:', err);
    }
  };

  return {
    character,
    characters,
    selectedCharacterId,
    setSelectedCharacterId,
    loading,
    relatedLoading,
    error,
    refetchInventory
  };
};
