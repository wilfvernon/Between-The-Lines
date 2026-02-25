import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import useEmblaCarousel from 'embla-carousel-react';
import PropTypes from 'prop-types';
import { collectBonuses, deriveCharacterStats } from '../lib/bonusEngine';
import { useAuth } from '../context/AuthContext';
import { useCharacter } from '../hooks/useCharacter';
import { supabase } from '../lib/supabase';
import AbilityScoreInspector from '../components/AbilityScoreInspector';
import ACInspector from '../components/ACInspector';
import './CharacterSheet.css';

/**
 * ⚠️ CRITICAL ARCHITECTURE NOTE ⚠️
 * 
 * ALMOST ALL DISPLAYS USE DERIVED MODIFIERS, NOT BASE MODIFIERS.
 * 
 * Base modifiers (from character.strength, character.dexterity, etc.) are:
 *   - Only used as initial fallback if derived modifiers unavailable
 *   - Used ONLY when setting up the base data for the bonus engine
 * 
 * Derived modifiers (from derivedStats.derived.modifiers) are:
 *   - Calculated AFTER applying all bonuses from features, items, ASIs
 *   - Must be used for: Skills, Saves, Ability checks, AC, Initiative, etc.
 *   - Automatically include bonuses like "Scholar of Yore +CHA to History"
 * 
 * Pattern: Use derivedStats?.derived?.modifiers[ability] or derived ability scores
 * Exception: Only use base abilities when collecting/deriving stats in the first place
 */

// Helper to parse markdown-like formatting in feature descriptions
// Supports: **bold** and \n\n or /n/n for paragraphs
const parseFeatureDescription = (text) => {
  if (!text) return null;
  
  // Handle actual newlines from database: convert \n to \n\n for paragraph breaks
  let processedText = text.replace(/\n/g, '\n\n');
  
  // Split by paragraph breaks
  let paragraphs = processedText.split(/\n\n/);
  
  return paragraphs.map((paragraph, pIdx) => {
    // Skip empty paragraphs
    if (!paragraph.trim()) return null;
    
    // Parse **bold** and *italic* within each paragraph
    const parts = [];
    let lastIndex = 0;
    // Match both **bold** and *italic* (bold must be checked first to avoid matching ** as two italics)
    const markdownRegex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
    let match;
    
    while ((match = markdownRegex.exec(paragraph)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(paragraph.substring(lastIndex, match.index));
      }
      
      // Check if it's bold (**text**) or italic (*text*)
      if (match[1]) {
        // Bold text
        parts.push(<strong key={`bold-${pIdx}-${parts.length}`}>{match[2]}</strong>);
      } else if (match[3]) {
        // Italic text
        parts.push(<em key={`italic-${pIdx}-${parts.length}`}>{match[4]}</em>);
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text after last match
    if (lastIndex < paragraph.length) {
      parts.push(paragraph.substring(lastIndex));
    }
    
    return (
      <p key={`para-${pIdx}`} className="feature-description">
        {parts.length > 0 ? parts : paragraph}
      </p>
    );
  }).filter(p => p !== null);
};

// Helper to convert ability score improvements to bonus format

const convertAbilityScoresToBonuses = (improvements = []) => {
  const abilityAbbrevToLower = {
    'STR': 'strength',
    'DEX': 'dexterity',
    'CON': 'constitution',
    'INT': 'intelligence',
    'WIS': 'wisdom',
    'CHA': 'charisma'
  };

  return improvements.flatMap(improvement => {
    const sourceLabel = `${improvement.source}${improvement.sourceType ? ` - ${improvement.sourceType}` : ''}`;
    return (improvement.abilities || []).map(abilityStr => {
      // Parse "CHA: 2" or "WIS: 1"
      const [abbr, valueStr] = abilityStr.split(':').map(s => s.trim());
      const ability = abilityAbbrevToLower[abbr.toUpperCase()];
      const value = parseInt(valueStr, 10);

      if (!ability || isNaN(value)) return null;

      return {
        target: `ability.${ability}`,
        value,
        source: { label: sourceLabel, type: 'ability-score-improvement' }
      };
    }).filter(Boolean);
  });
};

// Helper to get bonuses for a specific ability
const getAbilityBonuses = (allBonuses = [], abilityName) => {
  const targetKey = `ability.${abilityName}`;
  return allBonuses.filter(bonus => bonus.target === targetKey);
};

const TAB_ORDER = ['abilities', 'skills', 'actions', 'spells', 'inventory', 'features', 'bio', 'creatures'];
const FEATURE_DESCRIPTION_LIMIT = 240;
const DEFAULT_FILTERS = ['Weapons', 'Armor', 'Magic', 'Gear'];

const RARITY_ORDER = {
  'legendary': 0,
  'very rare': 1,
  'rare': 2,
  'uncommon': 3,
  'common': 4,
  'unknown': 5
};

const sortItemsByRarityAndName = (items) => {
  return [...items].sort((a, b) => {
    // Get rarity values
    const rarityA = (a.magic_item?.rarity || a.magic_item?.raw_data?.rarity || 'unknown').toLowerCase();
    const rarityB = (b.magic_item?.rarity || b.magic_item?.raw_data?.rarity || 'unknown').toLowerCase();
    
    const orderA = RARITY_ORDER[rarityA] ?? 5;
    const orderB = RARITY_ORDER[rarityB] ?? 5;
    
    // Sort by rarity first
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    // Then alphabetically by name
    const nameA = (a.magic_item?.name || a.equipment?.name || '').toLowerCase();
    const nameB = (b.magic_item?.name || b.equipment?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
};

const getItemFilter = (item) => {
  if (!item) return 'Gear';
  if (item.magic_item) return 'Magic';
  if (item.equipment?.type?.toLowerCase().includes('weapon')) return 'Weapons';
  if (item.equipment?.type?.toLowerCase().includes('armor')) return 'Armor';
  return 'Gear';
};

const getCustomPockets = (items = []) => {
  // If items is an array of pocket strings, return them filtered
  if (items.length > 0 && typeof items[0] === 'string') {
    return items.filter(p => !DEFAULT_FILTERS.includes(p));
  }
  // Otherwise treat as inventory items
  const pockets = new Set();
  items.forEach((item) => {
    if (item.pocket) pockets.add(item.pocket);
  });
  return [...pockets].sort();
};
const isFeatureToggleIgnored = (target) => {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('.uses-counter, .uses-boxes, .uses-btn, .use-box, .uses-reset'));
};

function FeatureDescriptionBlock({ featureId, description, expanded, onToggle }) {
  if (!description) return null;
  const safeId = `feature-desc-${String(featureId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const isLong = description.length > FEATURE_DESCRIPTION_LIMIT;
  const isExpanded = expanded || !isLong;

  return (
    <div className={`feature-description-wrap ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="feature-description-body" id={safeId}>
        {parseFeatureDescription(description)}
      </div>
      {isLong && (
        <button
          type="button"
          className="feature-description-toggle"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(featureId);
          }}
          aria-label={isExpanded ? 'Collapse description' : 'Expand description'}
          aria-expanded={isExpanded}
          aria-controls={safeId}
        >
          <svg className="feature-description-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function CharacterSheet() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'admin@candlekeep.sc';

  const {
    character,
    characters,
    selectedCharacterId,
    setSelectedCharacterId,
    loading,
    relatedLoading,
    error,
    refetchInventory
  } = useCharacter({ user, isAdmin });
  const [activeTab, setActiveTab] = useState('abilities'); // abilities, skills, actions, spells, inventory, features, bio, creatures
  const activeTabRef = useRef(activeTab);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false
  });

  // HP management state
  const [currentHP, setCurrentHP] = useState(null);
  const [tempHP, setTempHP] = useState(0);
  const [maxHPModifier, setMaxHPModifier] = useState(0);
  const [isHPModalOpen, setIsHPModalOpen] = useState(false);
  const [damageInput, setDamageInput] = useState('');
  const [isPortraitHighlighted, setIsPortraitHighlighted] = useState(true);

  // Stats Inspector Modal state
  const [inspectorState, setInspectorState] = useState({
    isOpen: false,
    selectedAbility: null,
    baseValue: 10,
    bonuses: [],
    abilityCustomModifiers: {}, // { ability: [{ source, value }, ...] }
    abilityCustomOverrides: {} // { ability: value }
  });

  // AC Inspector Modal state
  const [acInspectorOpen, setACInspectorOpen] = useState(false);
  const [acCustomModifiers, setACCustomModifiers] = useState([]);
  const [acCustomOverride, setACCustomOverride] = useState(null);

  // Inventory modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [showNewPocketModal, setShowNewPocketModal] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [newPocketItemId, setNewPocketItemId] = useState(null);
  const [activePocket, setActivePocket] = useState('all');

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!emblaApi) return;
    const handleSelect = () => {
      const index = emblaApi.selectedScrollSnap();
      const nextTab = TAB_ORDER[index];
      if (nextTab && nextTab !== activeTabRef.current) {
        setActiveTab(nextTab);
      }
    };
    emblaApi.on('select', handleSelect);
    emblaApi.on('reInit', handleSelect);
    handleSelect();
    return () => {
      emblaApi.off('select', handleSelect);
      emblaApi.off('reInit', handleSelect);
    };
  }, [emblaApi]);

  const setActiveTabWithCarousel = (nextTab) => {
    if (!nextTab || nextTab === activeTabRef.current) return;
    const nextIndex = TAB_ORDER.indexOf(nextTab);
    if (emblaApi && nextIndex !== -1) {
      emblaApi.scrollTo(nextIndex);
      return;
    }
    setActiveTab(nextTab);
  };

  // Load custom ability modifiers and overrides from localStorage
  useEffect(() => {
    if (!character?.id) return;
    
    const savedModifiers = localStorage.getItem(`ast_ability_modifiers_${character.id}`);
    if (savedModifiers) {
      try {
        setInspectorState(prev => ({
          ...prev,
          abilityCustomModifiers: JSON.parse(savedModifiers)
        }));
      } catch (e) {
        console.error('Failed to parse saved ability modifiers:', e);
      }
    }

    const savedOverrides = localStorage.getItem(`ast_ability_overrides_${character.id}`);
    if (savedOverrides) {
      try {
        setInspectorState(prev => ({
          ...prev,
          abilityCustomOverrides: JSON.parse(savedOverrides)
        }));
      } catch (e) {
        console.error('Failed to parse saved ability overrides:', e);
      }
    }

    // Load AC custom modifiers and override
    const acModsKey = `ast_ac_modifiers_${character.id}`;
    const acOverrideKey = `ast_ac_override_${character.id}`;
    const acMods = localStorage.getItem(acModsKey);
    const acOver = localStorage.getItem(acOverrideKey);
    
    if (acMods) {
      try {
        setACCustomModifiers(JSON.parse(acMods));
      } catch (e) {
        console.error('Failed to parse AC modifiers:', e);
      }
    }
    
    if (acOver) {
      const parsed = parseInt(acOver, 10);
      if (!isNaN(parsed)) {
        setACCustomOverride(parsed);
      }
    }
  }, [character?.id]);

  // Initialize current HP when character loads
  useEffect(() => {
    if (!character?.id) return;

    // Try to load saved HP state from localStorage (persists across sessions/logout/app close)
    const savedHPState = localStorage.getItem(`hp_state_${character.id}`);
    if (savedHPState) {
      try {
        const { currentHP: savedCurrent, tempHP: savedTemp, maxHPModifier: savedModifier } = JSON.parse(savedHPState);
        setCurrentHP(savedCurrent);
        setTempHP(savedTemp ?? 0);
        setMaxHPModifier(savedModifier ?? 0);
        return;
      } catch (e) {
        console.error('Failed to parse saved HP state:', e);
      }
    }

    // Otherwise initialize from character data
    if (character?.current_hp !== undefined) {
      setCurrentHP(character.current_hp);
    } else if (character?.max_hp) {
      setCurrentHP(character.max_hp);
    }
    setTempHP(0);
    setMaxHPModifier(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  // Save HP state to localStorage whenever it changes (persists across sessions)
  useEffect(() => {
    if (!character?.id || currentHP === null) return;

    const hpState = {
      currentHP,
      tempHP,
      maxHPModifier
    };
    localStorage.setItem(`hp_state_${character.id}`, JSON.stringify(hpState));
  }, [character?.id, currentHP, tempHP, maxHPModifier]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isHPModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isHPModalOpen]);

  // Handle character selection (admin only)
  const handleCharacterChange = async (characterId) => {
    try {
      setSelectedCharacterId(characterId);
    } catch (err) {
      console.error('Error selecting character:', err);
    }
  };

  if (loading) {
    return (
      <div className="route-loading">
        <img src="/crest.png" alt="" className="loading-crest" />
        <span className="loading-text">Loading character sheet...</span>
      </div>
    );
  }

  if (error) {
    return <div className="page-container"><p className="error-message">❌ {error}</p></div>;
  }

  if (!character) {
    return (
      <div className="page-container">
        <h1>Character Sheet</h1>
        <p>{isAdmin ? 'No characters found' : 'You have no character yet. Ask an admin to import your character.'}</p>
      </div>
    );
  }

  const skills = character.skills || [];
  const spells = character.spells || [];

  const proficiencyBonus = Math.ceil(character.level / 4) + 1;
  const abilityModifier = (score) => Math.floor((score - 10) / 2);

  const baseAbilities = {
    strength: character.strength,
    dexterity: character.dexterity,
    constitution: character.constitution,
    intelligence: character.intelligence,
    wisdom: character.wisdom,
    charisma: character.charisma
  };

  const baseMods = {
    strength: abilityModifier(baseAbilities.strength),
    dexterity: abilityModifier(baseAbilities.dexterity),
    constitution: abilityModifier(baseAbilities.constitution),
    intelligence: abilityModifier(baseAbilities.intelligence),
    wisdom: abilityModifier(baseAbilities.wisdom),
    charisma: abilityModifier(baseAbilities.charisma)
  };

  // Convert ASIs to bonuses
  const abilityScoreBonuses = convertAbilityScoresToBonuses(character.ability_score_improvements || []);

  // Helper to calculate base AC from equipped armor
  const calculateBaseAC = (inventory, dexModifier) => {
    if (!inventory || !Array.isArray(inventory)) {
      return 10 + dexModifier; // Unarmored
    }

    // Helper to check if item is a shield
    const isShield = (item) => {
      const itemData = item.equipment || item.magic_item;
      if (!itemData?.raw_data) return false;
      const rawData = typeof itemData.raw_data === 'string' ? JSON.parse(itemData.raw_data) : itemData.raw_data;
      return rawData?.equipment_categories?.some(cat => cat.index === 'shields');
    };

    // Find equipped body armor (not shields)
    const equippedArmor = inventory.find(item => {
      if (!item.equipped) return false;
      if (isShield(item)) return false; // Exclude shields
      
      // Check if it's armor (either equipment or magic item)
      const itemData = item.equipment || item.magic_item;
      if (!itemData) return false;
      
      const type = itemData.type?.toLowerCase() || '';
      const hasArmorTypeId = itemData.armorTypeId !== null && itemData.armorTypeId !== undefined;
      
      return type.includes('armor') || hasArmorTypeId;
    });

    // Find equipped shield
    const equippedShield = inventory.find(item => item.equipped && isShield(item));

    let baseAC;
    if (!equippedArmor) {
      baseAC = 10 + dexModifier; // Unarmored
    } else {
      // Get armor data (prefer equipment, fallback to magic_item)
      const armorData = equippedArmor.equipment || equippedArmor.magic_item;
      const rawData = armorData?.raw_data;
      
      if (!rawData?.armor_class) {
        baseAC = 10 + dexModifier; // No armor_class data, use unarmored
      } else {
        const { base, dex_bonus, max_bonus } = rawData.armor_class;
        
        // Calculate AC based on armor type
        if (!dex_bonus) {
          // Heavy armor: base AC only, no DEX modifier
          baseAC = base;
        } else if (max_bonus !== undefined && max_bonus !== null) {
          // Medium armor: base AC + DEX (capped at max_bonus)
          baseAC = base + Math.min(dexModifier, max_bonus);
        } else {
          // Light armor: base AC + full DEX modifier
          baseAC = base + dexModifier;
        }
      }
    }

    // Add shield bonus
    if (equippedShield) {
      const shieldData = equippedShield.equipment || equippedShield.magic_item;
      const shieldAC = shieldData?.raw_data?.armor_class?.base || 0;
      baseAC += shieldAC;
    }

    return baseAC;
  };

  // Helper to get armor info for AC Inspector display
  const getArmorInfo = (inventory, dexModifier) => {
    if (!inventory || !Array.isArray(inventory)) return null;

    // Helper to check if item is a shield
    const isShield = (item) => {
      const itemData = item.equipment || item.magic_item;
      if (!itemData?.raw_data) return false;
      const rawData = typeof itemData.raw_data === 'string' ? JSON.parse(itemData.raw_data) : itemData.raw_data;
      return rawData?.equipment_categories?.some(cat => cat.index === 'shields');
    };

    // Find equipped body armor (not shields)
    const equippedArmor = inventory.find(item => {
      if (!item.equipped) return false;
      if (isShield(item)) return false; // Exclude shields
      const itemData = item.equipment || item.magic_item;
      if (!itemData) return false;
      const type = itemData.type?.toLowerCase() || '';
      const hasArmorTypeId = itemData.armorTypeId !== null && itemData.armorTypeId !== undefined;
      return type.includes('armor') || hasArmorTypeId;
    });

    // Find equipped shield
    const equippedShield = inventory.find(item => item.equipped && isShield(item));

    let armorInfo = null;
    if (equippedArmor) {
      const armorData = equippedArmor.equipment || equippedArmor.magic_item;
      const rawData = armorData?.raw_data;
      
      if (rawData?.armor_class) {
        const { base, dex_bonus, max_bonus } = rawData.armor_class;
        
        // Determine armor type
        let armorType = 'Unknown';
        if (armorData.armorTypeId === 1) armorType = 'Light Armor';
        else if (armorData.armorTypeId === 2) armorType = 'Medium Armor';
        else if (armorData.armorTypeId === 3) armorType = 'Heavy Armor';
        else if (!dex_bonus) armorType = 'Heavy Armor';
        else if (max_bonus !== undefined && max_bonus !== null) armorType = 'Medium Armor';
        else armorType = 'Light Armor';

        // Calculate actual DEX bonus applied
        let appliedDexBonus = null;
        if (!dex_bonus) {
          appliedDexBonus = null; // No DEX for heavy armor
        } else if (max_bonus !== undefined && max_bonus !== null) {
          appliedDexBonus = Math.min(dexModifier, max_bonus);
        } else {
          appliedDexBonus = dexModifier;
        }

        armorInfo = {
          name: armorData.name,
          type: armorType,
          baseAC: base,
          dexBonus: appliedDexBonus,
          maxDexBonus: max_bonus,
          totalAC: appliedDexBonus !== null ? base + appliedDexBonus : base
        };
      }
    }

    // Add shield info
    let shieldBonus = null;
    if (equippedShield) {
      const shieldData = equippedShield.equipment || equippedShield.magic_item;
      const shieldAC = shieldData?.raw_data?.armor_class?.base;
      if (shieldAC) {
        shieldBonus = {
          name: shieldData.name,
          bonus: shieldAC
        };
      }
    }

    // Return combined info (null if no armor or shield)
    if (!armorInfo && !shieldBonus) return null;

    return {
      ...armorInfo,
      shield: shieldBonus
    };
  };

  // Collect bonuses from items, features, and character overrides
  // (Skill bonuses are now handled directly in SkillsTab from feature.benefits)
  const bonusList = collectBonuses({
    items: character.items || [],
    features: character.features || [],
    baseCharacterData: baseAbilities,
    overrides: character.bonuses || []
  });

  // Combine all bonuses (from features + ASIs)
  const allBonuses = [...bonusList, ...abilityScoreBonuses];

  // Calculate base AC from equipped armor
  const baseAC = calculateBaseAC(character.inventory, baseMods.dexterity);

  // Derive character stats using bonus engine
  const { derived: derivedStats, totals: statsTotals } = deriveCharacterStats({
    base: {
      abilities: baseAbilities,
      maxHP: character.max_hp || 0,
      proficiency: proficiencyBonus,
      acBase: baseAC,
      initiativeBase: baseMods.dexterity,
      passivePerceptionBase: 10 + baseMods.wisdom,
      senses: character.senses || [],
      speeds: character.speeds || { walk: character.speed }
    },
    bonuses: allBonuses
  });



  // Helper to calculate ability modifier from score
  const calculateModifier = (score) => Math.floor((score - 10) / 2);

  // Helper to get final ability score (with custom modifiers/overrides)
  const getFinalAbilityScore = (abilityKey, baseScore) => {
    const override = inspectorState.abilityCustomOverrides?.[abilityKey];
    if (override !== null && override !== undefined) {
      return override;
    }
    const customMods = inspectorState.abilityCustomModifiers?.[abilityKey] || [];
    const customTotal = customMods.reduce((sum, mod) => sum + mod.value, 0);
    return baseScore + customTotal;
  };

  // Calculate modifiers from final ability scores (including custom mods/overrides)
  // ⚠️ These INCLUDE bonuses - always use these derived mods, not character base stats
  const strScore = getFinalAbilityScore('strength', derivedStats?.abilities?.strength || character.strength);
  const dexScore = getFinalAbilityScore('dexterity', derivedStats?.abilities?.dexterity || character.dexterity);
  const conScore = getFinalAbilityScore('constitution', derivedStats?.abilities?.constitution || character.constitution);
  const intScore = getFinalAbilityScore('intelligence', derivedStats?.abilities?.intelligence || character.intelligence);
  const wisScore = getFinalAbilityScore('wisdom', derivedStats?.abilities?.wisdom || character.wisdom);
  const chaScore = getFinalAbilityScore('charisma', derivedStats?.abilities?.charisma || character.charisma);

  const strMod = calculateModifier(strScore);
  const dexMod = calculateModifier(dexScore);
  const conMod = calculateModifier(conScore);
  const intMod = calculateModifier(intScore);
  const wisMod = calculateModifier(wisScore);
  const chaMod = calculateModifier(chaScore);

  // These ARE derived modifiers (calculated from derived scores with bonuses applied)
  // Safe to use everywhere - includes all feature bonuses
  const derivedMods = {
    strength: strMod,
    dexterity: dexMod,
    constitution: conMod,
    intelligence: intMod,
    wisdom: wisMod,
    charisma: chaMod
  };

  // Calculate AC with custom modifiers and override
  const customACModifierTotal = acCustomModifiers.reduce((sum, mod) => sum + mod.value, 0);
  const ac = acCustomOverride !== null ? acCustomOverride : derivedStats.ac + customACModifierTotal;
  
  // Determine AC glow state
  const getACGlowState = () => {
    if (acCustomOverride !== null) return 'glow-blue'; // Blue for override
    if (customACModifierTotal > 0) return 'glow-green'; // Green for positive modifier
    if (customACModifierTotal < 0) return 'glow-red'; // Red for negative modifier
    return ''; // No glow
  };

  const initiative = derivedStats.initiative;
  const conditions = (character.conditions || []).map((condition) => (
    typeof condition === 'string' ? { name: condition } : condition
  ));

  return (
    <div className="character-sheet">
      {/* Admin Character Selector */}
      {isAdmin && characters.length > 0 && (
        <div className="admin-selector">
          <label>Character:</label>
          <select value={selectedCharacterId} onChange={(e) => handleCharacterChange(e.target.value)}>
            {characters.map(char => (
              <option key={char.id} value={char.id}>
                {char.name} (Lvl {char.level})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sticky Header - Parchment Tab */}
      <div className="sticky-header">
        <div className="sticky-header-content">
          <div className="header-left">
            {character.image_url && (
              <div className="character-portrait">
                <button
                  type="button"
                  className={`portrait-toggle ${isPortraitHighlighted ? 'is-highlighted' : 'is-muted'}`}
                  onClick={() => setIsPortraitHighlighted((prev) => !prev)}
                  aria-pressed={isPortraitHighlighted}
                  aria-label="Toggle portrait highlight"
                >
                  <img src={character.image_url} alt={character.name} />
                </button>
              </div>
            )}
            <div className="character-name-level">
              <span className="char-name">{character.full_name || character.name}</span>
              <span className="char-level">
                Lvl {character.level} {character.classes.map(c => `${c.class}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ')}
              </span>
              <div className="character-conditions clickable-underline">
                <span className="conditions-label">Conditions:</span>
                {conditions.length > 0 ? (
                  <div className="conditions-icons">
                    {conditions.map((condition) => (
                      condition.icon ? (
                        <img
                          key={condition.name}
                          src={condition.icon}
                          alt={condition.name}
                          className="condition-icon"
                          title={condition.name}
                        />
                      ) : (
                        <span key={condition.name} className="condition-text">{condition.name}</span>
                      )
                    ))}
                  </div>
                ) : (
                  <span className="conditions-empty">None</span>
                )}
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="header-stats-compact">
              <div className="stat-compact hp">
                <span 
                  className="stat-value-compact hp-clickable clickable-underline" 
                  onClick={() => setIsHPModalOpen(true)}
                  title="Click to edit HP"
                >
                  <span className="hp-clickable-label">HP:</span>
                  <span className="hp-value-current">
                    {currentHP !== null ? currentHP : character.max_hp}
                  </span>
                  <span className="hp-total-separator">/</span>
                  <span className={maxHPModifier !== 0 ? 'hp-value-mod' : 'hp-value-current'}>
                    {character.max_hp + maxHPModifier}
                  </span>
                  {tempHP > 0 && (
                    <span className="hp-value-temp">+{tempHP}</span>
                  )}
                </span>
              </div>
              <div className="stat-row">
                <div 
                  className={`stat-compact ac clickable-underline ${getACGlowState()}`}
                  onClick={() => setACInspectorOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => { if (e.key === 'Enter') setACInspectorOpen(true); }}
                >
                  <span className="stat-label-compact">AC:</span>
                  <span className="stat-value-compact">{ac}</span>
                </div>
                <div className="stat-compact init clickable-underline">
                  <span className="stat-label-compact">Init:</span>
                  <span className="stat-value-compact">{initiative >= 0 ? '+' : ''}{initiative}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={activeTab === 'abilities' ? 'tab-btn abilities active' : 'tab-btn abilities'}
          onClick={() => setActiveTabWithCarousel('abilities')}
          aria-label="Abilities"
          title="Abilities"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3v18h18" />
            <path d="M7 17V9" />
            <path d="M12 17V5" />
            <path d="M17 17v-7" />
          </svg>
        </button>
        <button
          className={activeTab === 'skills' ? 'tab-btn skills active' : 'tab-btn skills'}
          onClick={() => setActiveTabWithCarousel('skills')}
          aria-label="Skills"
          title="Skills"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 21 15.75 15.75" />
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
          </svg>
        </button>
        <button
          className={activeTab === 'actions' ? 'tab-btn actions active' : 'tab-btn actions'}
          onClick={() => setActiveTabWithCarousel('actions')}
          aria-label="Actions"
          title="Actions"
        >
          <span className="tab-icon tab-icon-sword" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'spells' ? 'tab-btn spells active' : 'tab-btn spells'}
          onClick={() => setActiveTabWithCarousel('spells')}
          aria-label="Spells"
          title="Spells"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.813 15.904 9 18l-.813-2.096a4.5 4.5 0 0 0-2.924-2.924L3.167 12l2.096-.813a4.5 4.5 0 0 0 2.924-2.924L9 6l.813 2.096a4.5 4.5 0 0 0 2.924 2.924L14.833 12l-2.096.813a4.5 4.5 0 0 0-2.924 2.924Z" />
            <path d="M18.75 4.5 19.5 6l1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5ZM18.75 15l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5Z" />
          </svg>
        </button>
        <button
          className={activeTab === 'inventory' ? 'tab-btn inventory active' : 'tab-btn inventory'}
          onClick={() => setActiveTabWithCarousel('inventory')}
          aria-label="Inventory"
          title="Inventory"
        >
          <span className="tab-icon tab-icon-pack" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'features' ? 'tab-btn features active' : 'tab-btn features'}
          onClick={() => setActiveTabWithCarousel('features')}
          aria-label="Features"
          title="Features"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
          </svg>
        </button>
        <button
          className={activeTab === 'bio' ? 'tab-btn bio active' : 'tab-btn bio'}
          onClick={() => setActiveTabWithCarousel('bio')}
          aria-label="Bio"
          title="Bio"
        >
          <span className="tab-icon tab-icon-book" aria-hidden="true"></span>
        </button>
        <button
          className={activeTab === 'creatures' ? 'tab-btn creatures active' : 'tab-btn creatures'}
          onClick={() => setActiveTabWithCarousel('creatures')}
          aria-label="Creatures"
          title="Creatures"
        >
          <span className="tab-icon tab-icon-dragon" aria-hidden="true"></span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content" ref={emblaRef}>
        <div
          className="tab-carousel"
        >
          <div className="tab-pane">
            <AbilitiesTab
              character={character}
              strMod={strMod}
              dexMod={dexMod}
              conMod={conMod}
              intMod={intMod}
              wisMod={wisMod}
              chaMod={chaMod}
              proficiencyBonus={proficiencyBonus}
              skills={skills}
              derivedStats={derivedStats}
              allBonuses={allBonuses}
              getAbilityBonuses={getAbilityBonuses}
              inspectorState={inspectorState}
              setInspectorState={setInspectorState}
              baseAbilities={baseAbilities}
            />
          </div>
          <div className="tab-pane">
            <SkillsTab
              character={character}
              proficiencyBonus={proficiencyBonus}
              skills={skills}
              loading={relatedLoading}
              features={character.features || []}
              derivedMods={derivedMods}
            />
          </div>
          <div className="tab-pane">
            <ActionsTab character={character} />
          </div>
          <div className="tab-pane">
            <SpellsTab character={character} spells={spells} loading={relatedLoading} />
          </div>
          <div className="tab-pane">
            <InventoryTab 
              character={character} 
              onInventoryUpdate={refetchInventory} 
              setSelectedItem={setSelectedItem}
              activePocket={activePocket}
              setActivePocket={setActivePocket}
            />
          </div>
          <div className="tab-pane">
            <FeaturesTab character={character} proficiencyBonus={proficiencyBonus} abilityModifiers={derivedMods} />
          </div>
          <div className="tab-pane">
            <BioTab character={character} />
          </div>
          <div className="tab-pane">
            <CreaturesTab character={character} />
          </div>
        </div>
      </div>

      {/* HP Editing Modal */}
      {isHPModalOpen && (
        <HPEditModal
          currentHP={currentHP}
          setCurrentHP={setCurrentHP}
          tempHP={tempHP}
          setTempHP={setTempHP}
          maxHPModifier={maxHPModifier}
          setMaxHPModifier={setMaxHPModifier}
          maxHP={character.max_hp}
          damageInput={damageInput}
          setDamageInput={setDamageInput}
          isOpen={isHPModalOpen}
          onClose={() => setIsHPModalOpen(false)}
        />
      )}

      {/* AC Inspector */}
      <ACInspector
        isOpen={acInspectorOpen}
        onClose={() => setACInspectorOpen(false)}
        baseValue={baseAC}
        bonuses={allBonuses?.filter(b => b.target === 'ac') || []}
        customModifiers={acCustomModifiers}
        customOverride={acCustomOverride}
        armorInfo={getArmorInfo(character.inventory, baseMods.dexterity)}
        dexModifier={baseMods.dexterity}
        onAddCustomModifier={(modifier) => {
          const updated = [...acCustomModifiers, modifier];
          setACCustomModifiers(updated);
          if (character?.id) {
            localStorage.setItem(`ast_ac_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onDeleteCustomModifier={(index) => {
          const updated = acCustomModifiers.filter((_, i) => i !== index);
          setACCustomModifiers(updated);
          if (character?.id) {
            localStorage.setItem(`ast_ac_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onSetCustomOverride={(value) => {
          setACCustomOverride(value);
          if (character?.id) {
            if (value === null) {
              localStorage.removeItem(`ast_ac_override_${character.id}`);
            } else {
              localStorage.setItem(`ast_ac_override_${character.id}`, String(value));
            }
          }
        }}
      />

      {/* Ability Score Inspector */}
      <AbilityScoreInspector
        isOpen={inspectorState.isOpen}
        onClose={() => setInspectorState({ ...inspectorState, isOpen: false })}
        ability={inspectorState.selectedAbility?.name || ''}
        baseValue={inspectorState.selectedAbility?.baseValue || 10}
        bonuses={inspectorState.selectedAbility?.bonuses || []}
        customModifiers={inspectorState.abilityCustomModifiers[inspectorState.selectedAbility?.key] || []}
        customOverride={inspectorState.abilityCustomOverrides[inspectorState.selectedAbility?.key] || null}
        onAddCustomModifier={(modifier) => {
          const abilityKey = inspectorState.selectedAbility?.key;
          const updated = {
            ...inspectorState.abilityCustomModifiers,
            [abilityKey]: [...(inspectorState.abilityCustomModifiers[abilityKey] || []), modifier]
          };
          setInspectorState(prev => ({ ...prev, abilityCustomModifiers: updated }));
          if (character?.id) {
            localStorage.setItem(`ast_ability_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onDeleteCustomModifier={(index) => {
          const abilityKey = inspectorState.selectedAbility?.key;
          const updated = {
            ...inspectorState.abilityCustomModifiers,
            [abilityKey]: (inspectorState.abilityCustomModifiers[abilityKey] || []).filter((_, i) => i !== index)
          };
          setInspectorState(prev => ({ ...prev, abilityCustomModifiers: updated }));
          if (character?.id) {
            localStorage.setItem(`ast_ability_modifiers_${character.id}`, JSON.stringify(updated));
          }
        }}
        onSetCustomOverride={(value) => {
          const abilityKey = inspectorState.selectedAbility?.key;
          const updated = {
            ...inspectorState.abilityCustomOverrides,
            [abilityKey]: value
          };
          setInspectorState(prev => ({ ...prev, abilityCustomOverrides: updated }));
          if (character?.id) {
            localStorage.setItem(`ast_ability_overrides_${character.id}`, JSON.stringify(updated));
          }
        }}
      />

      {/* Item Modal */}
      <ItemModal
        isOpen={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onDelete={async () => {
          if (!selectedItem?.id) return;
          try {
            const { error } = await supabase
              .from('character_inventory')
              .delete()
              .eq('id', selectedItem.id);
            
            if (error) throw error;
            setSelectedItem(null);
            if (refetchInventory) {
              await refetchInventory();
            }
          } catch (err) {
            console.error('Error deleting item:', err);
          }
        }}
        onQuantityUpdate={refetchInventory}
        pocketOptions={[...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])]}
        onPocketUpdate={async (itemId, newPocket) => {
          try {
            const { error } = await supabase
              .from('character_inventory')
              .update({ pocket: newPocket || null })
              .eq('id', itemId);
            
            if (error) throw error;
            if (refetchInventory) {
              await refetchInventory();
            }
          } catch (err) {
            console.error('Error updating pocket:', err);
            throw err;
          }
        }}
        onCreatePocket={(itemId) => {
          setNewPocketItemId(itemId);
          setShowNewPocketModal(true);
        }}
        proficiencyBonus={proficiencyBonus}
        abilityModifiers={derivedMods}
        characterId={character?.id}
      />

      {/* New Pocket Modal */}
      {showNewPocketModal && (
        <div className="item-modal-overlay" onClick={() => { setShowNewPocketModal(false); setNewPocketName(''); setNewPocketItemId(null); }}>
          <div className="new-pocket-modal" onClick={(e) => e.stopPropagation()}>
            <button className="item-modal-close" onClick={() => { setShowNewPocketModal(false); setNewPocketName(''); setNewPocketItemId(null); }} aria-label="Close">
              <span className="icon-cross" style={{ '--icon-url': `url(${new URL('../assets/icons/util/cross.svg', import.meta.url).href})` }} aria-hidden="true" />
            </button>
            <h3>Create New Pocket</h3>
            <p>Enter a name for your custom inventory pocket:</p>
            <input
              type="text"
              className="new-pocket-input"
              placeholder="Pocket name..."
              value={newPocketName}
              onChange={(e) => setNewPocketName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const trimmed = newPocketName.trim();
                  const allPocketOptions = [...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])];
                  if (trimmed && !allPocketOptions.includes(trimmed) && newPocketItemId) {
                    try {
                      const { error } = await supabase
                        .from('character_inventory')
                        .update({ pocket: trimmed })
                        .eq('id', newPocketItemId);
                      
                      if (error) throw error;
                      setActivePocket(trimmed);
                      setShowNewPocketModal(false);
                      setNewPocketName('');
                      setNewPocketItemId(null);
                      if (refetchInventory) await refetchInventory();
                    } catch (err) {
                      console.error('Error creating pocket:', err);
                    }
                  }
                }
              }}
              autoFocus
            />
            <div className="new-pocket-actions">
              <button
                className="new-pocket-cancel"
                onClick={() => { setShowNewPocketModal(false); setNewPocketName(''); setNewPocketItemId(null); }}
              >
                Cancel
              </button>
              <button
                className="new-pocket-create"
                onClick={async () => {
                  const trimmed = newPocketName.trim();
                  const allPocketOptions = [...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])];
                  if (trimmed && !allPocketOptions.includes(trimmed) && newPocketItemId) {
                    try {
                      const { error } = await supabase
                        .from('character_inventory')
                        .update({ pocket: trimmed })
                        .eq('id', newPocketItemId);
                      
                      if (error) throw error;
                      setActivePocket(trimmed);
                      setShowNewPocketModal(false);
                      setNewPocketName('');
                      setNewPocketItemId(null);
                      if (refetchInventory) await refetchInventory();
                    } catch (err) {
                      console.error('Error creating pocket:', err);
                    }
                  }
                }}
                disabled={!newPocketName.trim() || [...DEFAULT_FILTERS, ...getCustomPockets(character?.inventory || [])].includes(newPocketName.trim())}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tab 1: Abilities, Saves, Passive Skills, Senses
function AbilitiesTab({ character, strMod, dexMod, conMod, intMod, wisMod, chaMod, proficiencyBonus, skills, derivedStats, allBonuses, getAbilityBonuses, inspectorState, setInspectorState, baseAbilities }) {
  // Helper to get custom modifier total for an ability
  const getCustomModifierTotal = (abilityKey) => {
    const mods = inspectorState.abilityCustomModifiers?.[abilityKey] || [];
    return mods.reduce((sum, mod) => sum + mod.value, 0);
  };

  // Helper to get the final ability score (with override or calculated)
  const getFinalAbilityScore = (abilityKey, baseScore) => {
    const override = inspectorState.abilityCustomOverrides?.[abilityKey];
    if (override !== null && override !== undefined) {
      return override;
    }
    return baseScore + getCustomModifierTotal(abilityKey);
  };

  // Helper to determine glow state for an ability
  const getGlowState = (abilityKey, baseScore) => {
    const override = inspectorState.abilityCustomOverrides?.[abilityKey];
    if (override !== null && override !== undefined) {
      return 'glow-blue'; // Blue for override
    }
    const customModTotal = getCustomModifierTotal(abilityKey);
    if (customModTotal > 0) {
      return 'glow-green'; // Green for positive modifier
    }
    if (customModTotal < 0) {
      return 'glow-red'; // Red for negative modifier
    }
    return ''; // No glow
  };

  const abilities = [
    { name: 'Strength', abbr: 'STR', key: 'strength', baseScore: derivedStats?.abilities?.strength || character.strength, score: getFinalAbilityScore('strength', derivedStats?.abilities?.strength || character.strength), mod: strMod, save: character.save_strength },
    { name: 'Dexterity', abbr: 'DEX', key: 'dexterity', baseScore: derivedStats?.abilities?.dexterity || character.dexterity, score: getFinalAbilityScore('dexterity', derivedStats?.abilities?.dexterity || character.dexterity), mod: dexMod, save: character.save_dexterity },
    { name: 'Constitution', abbr: 'CON', key: 'constitution', baseScore: derivedStats?.abilities?.constitution || character.constitution, score: getFinalAbilityScore('constitution', derivedStats?.abilities?.constitution || character.constitution), mod: conMod, save: character.save_constitution },
    { name: 'Intelligence', abbr: 'INT', key: 'intelligence', baseScore: derivedStats?.abilities?.intelligence || character.intelligence, score: getFinalAbilityScore('intelligence', derivedStats?.abilities?.intelligence || character.intelligence), mod: intMod, save: character.save_intelligence },
    { name: 'Wisdom', abbr: 'WIS', key: 'wisdom', baseScore: derivedStats?.abilities?.wisdom || character.wisdom, score: getFinalAbilityScore('wisdom', derivedStats?.abilities?.wisdom || character.wisdom), mod: wisMod, save: character.save_wisdom },
    { name: 'Charisma', abbr: 'CHA', key: 'charisma', baseScore: derivedStats?.abilities?.charisma || character.charisma, score: getFinalAbilityScore('charisma', derivedStats?.abilities?.charisma || character.charisma), mod: chaMod, save: character.save_charisma },
  ].map(ability => ({
    ...ability,
    glowClass: getGlowState(ability.key, ability.baseScore)
  }));

  const abilityNameToKey = {
    'Strength': 'strength',
    'Dexterity': 'dexterity',
    'Constitution': 'constitution',
    'Intelligence': 'intelligence',
    'Wisdom': 'wisdom',
    'Charisma': 'charisma'
  };

  const handleAbilityClick = (ability) => {
    const abilityKey = abilityNameToKey[ability.name];
    const bonuses = getAbilityBonuses(allBonuses, abilityKey);

    setInspectorState({
      ...inspectorState,
      isOpen: true,
      selectedAbility: {
        name: ability.name,
        key: abilityKey,
        baseValue: baseAbilities[abilityKey] || 10,
        totalValue: ability.score,
        bonuses: bonuses
      }
    });
  };

  const skillLookup = (skills || []).reduce((acc, skill) => {
    acc[skill.skill_name] = skill;
    return acc;
  }, {});

  const hasPassiveAdvantage = (skillName) => {
    if (character?.passive_advantage_all) return true;
    const advantageList = character?.passive_advantage_skills || character?.passive_advantages || [];
    if (Array.isArray(advantageList) && advantageList.includes(skillName)) return true;
    if (character?.passive_advantage && typeof character.passive_advantage === 'object') {
      return Boolean(character.passive_advantage[skillName]);
    }
    return false;
  };

  const passiveSkillValue = (skillName, baseMod) => {
    const skillEntry = skillLookup[skillName];
    const isProficient = !!skillEntry;
    const isExpertise = skillEntry?.expertise || false;
    let bonus = baseMod;
    if (isExpertise) {
      bonus += proficiencyBonus * 2;
    } else if (isProficient) {
      bonus += proficiencyBonus;
    }
    const advantageBonus = hasPassiveAdvantage(skillName) ? 5 : 0;
    return 10 + bonus + advantageBonus;
  };

  const senses = Array.isArray(derivedStats?.senses) ? derivedStats.senses : (Array.isArray(character?.senses) ? character.senses : []);
  const speeds = derivedStats?.speeds && typeof derivedStats.speeds === 'object'
    ? derivedStats.speeds
    : (character?.speeds && typeof character.speeds === 'object'
      ? character.speeds
      : { walk: character?.speed });

  return (
    <div className="abilities-tab">
      <section className="section">
        <h2>Ability Scores</h2>
        <div className="abilities-grid">
          {abilities.map(ability => (
            <div
              key={ability.name}
              className={`ability-card ${ability.glowClass}`}
              onClick={() => handleAbilityClick(ability)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAbilityClick(ability);
                }
              }}
            >
              <span className="ability-name">{ability.name}</span>
              <div className="ability-values">
                <span className="ability-score">{ability.score}</span>
                <span className={`ability-modifier ${ability.mod >= 0 ? 'positive' : 'negative'}`}>
                  {ability.mod >= 0 ? '+' : ''}{ability.mod}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Saving Throws</h2>
        <div className="saves-list">
          {[
            abilities[0],
            abilities[3],
            abilities[1],
            abilities[4],
            abilities[2],
            abilities[5]
          ].map((ability) => {
            const saveBonus = ability.mod + (ability.save ? proficiencyBonus : 0);
            return (
              <div key={ability.abbr} className="save-item">
                <span className={ability.save ? 'proficient' : ''}>
                  {ability.save && '● '}{ability.name}
                </span>
                <span className="save-bonus">{saveBonus >= 0 ? '+' : ''}{saveBonus}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Passive Skills</h2>
        <div className="passive-list">
          <div className="passive-item">
            <span>Passive Perception</span>
            <span className="passive-value">{passiveSkillValue('Perception', wisMod)}</span>
          </div>
          <div className="passive-item">
            <span>Passive Insight</span>
            <span className="passive-value">{passiveSkillValue('Insight', wisMod)}</span>
          </div>
          <div className="passive-item">
            <span>Passive Investigation</span>
            <span className="passive-value">{passiveSkillValue('Investigation', intMod)}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Senses & Speed</h2>
        <div className="passive-list">
          {senses.length > 0 && (
            senses.map((sense) => (
              <div key={`${sense.sense_type}-${sense.range}`} className="passive-item">
                <span>{sense.sense_type?.replace(/(^.|\s.)/g, (m) => m.toUpperCase())}</span>
                <span className="passive-value">{sense.range} ft</span>
              </div>
            ))
          )}
          {Object.entries(speeds).filter(([, value]) => value).map(([type, value]) => (
            <div key={type} className="passive-item">
              <span>{type === 'walk' ? 'Walking Speed' : `${type.charAt(0).toUpperCase()}${type.slice(1)} Speed`}</span>
              <span className="passive-value">{value} ft</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Tab 2: Skills
function SkillsTab({ character, proficiencyBonus, skills: characterSkills, loading, features, derivedMods }) {
  /**
   * Skill Proficiency Levels
   * 
   * Each skill has one of 4 proficiency states, determined by:
   * 1. Character proficiency (from class/background/ASI)
   * 2. Character expertise (doubled proficiency)
   * 3. Feature-granted proficiency (e.g., from a feat or feature)
   * 4. Feature-granted half-proficiency (add ⌊PB/2⌋ to unproficient skill)
   */
  const PROFICIENCY_LEVELS = {
    expertise: {
      key: 'expertise',
      icon: 'expertise.svg',
      display: 'Expertise',
      description: 'Double proficiency bonus',
      bonusMultiplier: (pb) => pb * 2
    },
    proficient: {
      key: 'proficient',
      icon: 'proficient.svg',
      display: 'Proficient',
      description: 'Normal proficiency bonus',
      bonusMultiplier: (pb) => pb
    },
    half: {
      key: 'half',
      icon: 'half.svg',
      display: 'Half Proficiency',
      description: 'Half proficiency bonus (e.g., Jack of All Trades)',
      bonusMultiplier: (pb) => Math.floor(pb / 2)
    },
    unskilled: {
      key: 'unskilled',
      icon: 'unskilled.svg',
      display: 'Unskilled',
      description: 'No proficiency bonus',
      bonusMultiplier: (pb) => 0
    }
  };

  // Build map of additional ability modifiers for skills
  // Example: { history: ['charisma'], religion: ['charisma'] }
  const skillAdditionalAbilitiesMap = {}; // { skillKey: [ability, ability, ...] }
  
  // Build set of skills that have proficiency from features
  const skillProficienciesFromFeatures = new Set(); // Set of skillKeys
  
  // Check if character has skill_half_proficiency benefit (Jack of All Trades style)
  let hasHalfProficiency = false;
  
  const normalizeBenefits = (rawBenefits) => {
    if (Array.isArray(rawBenefits)) return rawBenefits;
    if (rawBenefits && typeof rawBenefits === 'object') {
      return rawBenefits.type ? [rawBenefits] : [];
    }
    if (typeof rawBenefits === 'string') {
      try {
        const parsed = JSON.parse(rawBenefits);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  features.forEach(feature => {
    const benefitsList = normalizeBenefits(feature.benefits);
    if (benefitsList.length > 0) {
      benefitsList.forEach(benefit => {
        const benefitType = typeof benefit?.type === 'string' ? benefit.type.trim() : benefit?.type;
        // New format: skill_dual_ability
        if (benefitType === 'skill_dual_ability' && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
            if (!skillAdditionalAbilitiesMap[skillKey]) {
              skillAdditionalAbilitiesMap[skillKey] = [];
            }
            if (benefit.ability && !skillAdditionalAbilitiesMap[skillKey].includes(benefit.ability)) {
              skillAdditionalAbilitiesMap[skillKey].push(benefit.ability);
            }
          });
        }
        // Legacy format: skill_modifier_bonus (for backward compatibility)
        else if (benefitType === 'skill_modifier_bonus' && Array.isArray(benefit.skills)) {
          benefit.skills.forEach(skillName => {
            const skillKey = skillName.toLowerCase().replace(/[\s']/g, '_');
            if (!skillAdditionalAbilitiesMap[skillKey]) {
              skillAdditionalAbilitiesMap[skillKey] = [];
            }
            // Extract ability from bonus_source like "charisma_modifier"
            const abilityMatch = benefit.bonus_source?.match(/^(\w+)_modifier$/);
            if (abilityMatch) {
              const ability = abilityMatch[1];
              if (!skillAdditionalAbilitiesMap[skillKey].includes(ability)) {
                skillAdditionalAbilitiesMap[skillKey].push(ability);
              }
            }
          });
        }
        // skill_proficiency: Mark this skill as proficient
        else if (benefitType === 'skill_proficiency' && benefit.skill) {
          const skillKey = benefit.skill.toLowerCase().replace(/[\s']/g, '_');
          skillProficienciesFromFeatures.add(skillKey);
        }
        // skill_half_proficiency: Jack of All Trades style half proficiency
        else if (benefitType === 'skill_half_proficiency') {
          hasHalfProficiency = true;
        }
      });
    }
  });
  /**
   * DERIVED MODIFIERS REQUIRED
   * derivedMods comes from CharacterSheet and includes all bonuses/feats/ASIs
   * Always use derivedMods for ability checks in this tab.
   * This includes all feature bonuses (e.g., Scholar of Yore +CHA to History).
   */
  const abilityModifier = (score) => Math.floor((score - 10) / 2);
  const skillSlug = (name) => name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  
  // Use passed-in derivedMods which includes ALL bonuses
  const getAbilityMod = (abilityKey) => {
    // ALWAYS use passed-in derivedMods - they're calculated with all bonuses applied
    return derivedMods?.[abilityKey] ?? abilityModifier(character[abilityKey]);
  };
  
  const allSkills = [
    { name: 'Acrobatics', ability: 'DEX', mod: getAbilityMod('dexterity') },
    { name: 'Animal Handling', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Arcana', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Athletics', ability: 'STR', mod: getAbilityMod('strength') },
    { name: 'Deception', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'History', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Insight', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Intimidation', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'Investigation', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Medicine', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Nature', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Perception', ability: 'WIS', mod: getAbilityMod('wisdom') },
    { name: 'Performance', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'Persuasion', ability: 'CHA', mod: getAbilityMod('charisma') },
    { name: 'Religion', ability: 'INT', mod: getAbilityMod('intelligence') },
    { name: 'Sleight of Hand', ability: 'DEX', mod: getAbilityMod('dexterity') },
    { name: 'Stealth', ability: 'DEX', mod: getAbilityMod('dexterity') },
    { name: 'Survival', ability: 'WIS', mod: getAbilityMod('wisdom') },
  ];

  // Create skill lookup for proficiency/expertise
  const skillLookup = {};
  characterSkills.forEach(cs => {
    skillLookup[cs.skill_name] = cs;
  });

  const abilityKeyToAbbrev = {
    strength: 'STR',
    dexterity: 'DEX',
    constitution: 'CON',
    intelligence: 'INT',
    wisdom: 'WIS',
    charisma: 'CHA'
  };

  return (
    <div className="skills-tab">
      <h2>Skills</h2>
      {loading ? (
        <div className="loading-container">
          <img src="/crest.png" alt="" className="loading-crest loading-crest-small" />
          <span className="loading-text">Loading skills...</span>
        </div>
      ) : (
        <div className="skills-list">
          {allSkills.map(skill => {
            const skillKey = skill.name.toLowerCase().replace(/[\s']/g, '_');
            const charSkill = skillLookup[skill.name];
            const hasFeatureProficiency = skillProficienciesFromFeatures.has(skillKey);
            const isProficient = !!charSkill || hasFeatureProficiency;
            const isExpertise = charSkill?.expertise || false;
            const hasHalfProf = !isProficient && !isExpertise && hasHalfProficiency;

            
            // Determine proficiency level using structured definition
            let proficiencyLevel;
            if (isExpertise) {
              proficiencyLevel = PROFICIENCY_LEVELS.expertise;
            } else if (isProficient) {
              proficiencyLevel = PROFICIENCY_LEVELS.proficient;
            } else if (hasHalfProf) {
              proficiencyLevel = PROFICIENCY_LEVELS.half;
            } else {
              proficiencyLevel = PROFICIENCY_LEVELS.unskilled;
            }
            
            const proficiencyIconSrc = new URL(`../assets/icons/proficiency/${proficiencyLevel.icon}`, import.meta.url).href;
            const skillIconSrc = new URL(`../assets/icons/skill/${skillSlug(skill.name)}.svg`, import.meta.url).href;
            
            // Calculate bonus: base ability mod + proficiency bonus + additional ability mods
            let bonus = skill.mod;
            bonus += proficiencyLevel.bonusMultiplier(proficiencyBonus);
            
            // Add any additional ability modifiers from features
            // Example: Scholar of Yore adds CHA to History and Religion
            const additionalAbilities = skillAdditionalAbilitiesMap[skillKey] || [];
            additionalAbilities.forEach(ability => {
              const additionalMod = derivedMods[ability] || 0;
              bonus += additionalMod;
            })

            const abilitySuffixes = additionalAbilities
              .map((ability) => abilityKeyToAbbrev[ability])
              .filter(Boolean);
            const abilityDisplay = abilitySuffixes.length > 0
              ? `${skill.ability}+${abilitySuffixes.join('+')}`
              : skill.ability;

            return (
              <div key={skill.name} className={`skill-item ${isExpertise ? 'expertise' : isProficient ? 'proficient' : hasHalfProf ? 'half' : ''}`}>
                <div className="skill-info">
                  <span
                    className="skill-proficiency-icon"
                    style={{ '--icon-url': `url(${proficiencyIconSrc})` }}
                    aria-hidden="true"
                  />
                  <span
                    className="skill-icon"
                    style={{ '--icon-url': `url(${skillIconSrc})` }}
                    aria-hidden="true"
                  />
                  <span className="skill-name">{skill.name}</span>
                  <span className="skill-ability">({abilityDisplay})</span>
                </div>
                <span className="skill-bonus">{bonus >= 0 ? '+' : ''}{bonus}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tab 3: Spells
function SpellsTab({ character, spells, loading }) {
  if (!character.spellcasting_ability) {
    return (
      <div className="spells-tab">
        <h2>Spells</h2>
        <p className="info-text">This character is not a spellcaster</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="spells-tab">
        <h2>Spells</h2>
        <div className="loading-container">
          <img src="/crest.png" alt="" className="loading-crest loading-crest-small" />
          <span className="loading-text">Loading spells...</span>
        </div>
      </div>
    );
  }

  // Group spells by level
  const spellsByLevel = {};
  spells.forEach(cs => {
    const level = cs.spell?.level ?? 0;
    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }
    spellsByLevel[level].push(cs);
  });

  const spellLevelNames = {
    0: 'Cantrips',
    1: '1st Level',
    2: '2nd Level',
    3: '3rd Level',
    4: '4th Level',
    5: '5th Level',
    6: '6th Level',
    7: '7th Level',
    8: '8th Level',
    9: '9th Level',
  };

  return (
    <div className="spells-tab">
      <div className="spellcasting-header">
        <h2>Spells</h2>
        <p className="spellcasting-info">
          <strong>Spellcasting Ability:</strong> {character.spellcasting_ability.toUpperCase()}
        </p>
      </div>

      {spells.length === 0 ? (
        <p className="info-text">No spells found for this character</p>
      ) : (
        <div className="spells-by-level">
          {Object.keys(spellsByLevel).sort((a, b) => Number(a) - Number(b)).map(level => (
            <div key={level} className="spell-level-group">
              <h3 className="spell-level-header">{spellLevelNames[level]}</h3>
              <div className="spell-list">
                {spellsByLevel[level].map(cs => (
                  <div key={cs.id} className="spell-item">
                    <div className="spell-main">
                      <div className="spell-name-row">
                        <input
                          type="checkbox"
                          checked={cs.is_prepared}
                          disabled
                          className="spell-prepared-check"
                        />
                        <span className="spell-name">{cs.spell?.name}</span>
                        {cs.always_prepared && <span className="always-prepared">Always Prepared</span>}
                      </div>
                      <div className="spell-meta">
                        <span className="spell-school">{cs.spell?.school}</span>
                        <span className="spell-separator">•</span>
                        <span className="spell-casting-time">{cs.spell?.casting_time}</span>
                        <span className="spell-separator">•</span>
                        <span className="spell-range">{cs.spell?.range}</span>
                      </div>
                    </div>
                    <div className="spell-description">
                      {cs.spell?.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to extract uses data from magic item (can be in multiple JSONB locations)
const getMagicItemUses = (magicItem) => {
  if (!magicItem) return null;
  // Check benefits.uses first
  if (magicItem.benefits?.uses) return magicItem.benefits.uses;
  // Check properties.benefits.uses
  if (magicItem.properties?.benefits?.uses) return magicItem.properties.benefits.uses;
  // Check properties.uses
  if (magicItem.properties?.uses) return magicItem.properties.uses;
  return null;
};

// Tab 4: Inventory
function InventoryTab({ character, onInventoryUpdate, setSelectedItem, activePocket, setActivePocket }) {
  const [goldInput, setGoldInput] = useState(character?.gold ?? 0);
  const [savedGold, setSavedGold] = useState(character?.gold ?? 0);
  const [isSavingGold, setIsSavingGold] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);
  const [itemUsesState, setItemUsesState] = useState({});
  
  const items = character?.inventory || [];
  const customPockets = getCustomPockets(items);
  const allFilters = ['all', 'Equipped', ...DEFAULT_FILTERS, ...customPockets];
  const coinSrc = new URL('../assets/coin.svg', import.meta.url).href;
  
  // Load all item uses from localStorage
  useEffect(() => {
    if (!character?.id) return;
    const uses = {};
    items.forEach((item) => {
      const stored = localStorage.getItem(`item_uses_${character.id}_${item.id}`);
      if (stored) {
        uses[item.id] = parseInt(stored, 10);
      }
    });
    setItemUsesState(uses);
  }, [character?.id, character?.inventory]);
  
  // Listen for uses changes from modal
  useEffect(() => {
    const handleUsesChanged = (e) => {
      const { itemId, newUses } = e.detail;
      setItemUsesState(prev => ({ ...prev, [itemId]: newUses }));
    };
    
    window.addEventListener('itemUsesChanged', handleUsesChanged);
    return () => window.removeEventListener('itemUsesChanged', handleUsesChanged);
  }, []);
  
  const handleItemUsesChange = (itemId, newUses) => {
    setItemUsesState(prev => ({ ...prev, [itemId]: newUses }));
    if (character?.id) {
      localStorage.setItem(`item_uses_${character.id}_${itemId}`, String(newUses));
    }
  };

  useEffect(() => {
    const gold = character?.gold ?? 0;
    setGoldInput(gold);
    setSavedGold(gold);
  }, [character?.gold, character?.id]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    let active = true;
    const handle = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [equipmentRes, magicRes] = await Promise.all([
          supabase.from('equipment').select('id, name').ilike('name', `%${term}%`).limit(8),
          supabase.from('magic_items').select('id, name').ilike('name', `%${term}%`).limit(8)
        ]);

        if (!active) return;
        if (equipmentRes.error) throw equipmentRes.error;
        if (magicRes.error) throw magicRes.error;

        const equipmentResults = (equipmentRes.data || []).map((item) => ({
          id: item.id,
          name: item.name,
          type: 'equipment'
        }));
        const magicResults = (magicRes.data || []).map((item) => ({
          id: item.id,
          name: item.name,
          type: 'magic'
        }));

        setSearchResults([...equipmentResults, ...magicResults]);
      } catch (err) {
        console.error('Error searching items:', err);
        if (active) setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [searchTerm]);

  // Determine if an item is equippable
  const isEquippable = (item) => {
    if (!item.equipment) return false;
    const type = item.equipment.type?.toLowerCase() || '';
    return type.includes('weapon') || type.includes('armor');
  };

  // Determine if an item requires attunement
  const requiresAttunement = (item) => {
    if (!item.magic_item) return false;
    const attunement = item.magic_item.requires_attunement || item.magic_item.raw_data?.requires_attunement;
    return attunement && attunement !== 'No' && attunement !== false;
  };

  // Get rarity color class
  const getRarityClass = (item) => {
    if (!item.magic_item) return '';
    const rarity = (item.magic_item.rarity || item.magic_item.raw_data?.rarity || '').toLowerCase();
    if (rarity.includes('uncommon')) return 'rarity-uncommon';
    if (rarity.includes('rare') && !rarity.includes('very')) return 'rarity-rare';
    if (rarity.includes('very rare')) return 'rarity-very-rare';
    if (rarity.includes('legendary')) return 'rarity-legendary';
    return '';
  };

  const renderInventoryList = (displayItems) => {
    if (!displayItems || displayItems.length === 0) {
      return <p style={{ padding: '10px', textAlign: 'center' }}>No items in this pocket.</p>;
    }

    return (
      <div className="inventory-list">
        {displayItems.map((item) => {
          const itemName = item.equipment?.name || item.magic_item?.name || 'Unknown';
          const isMagic = !!item.magic_item;
          const rarityClass = getRarityClass(item);
          const itemClasses = `inventory-item ${isMagic ? 'magic' : ''} ${item.attuned ? 'attuned' : ''}`;
          const usesData = isMagic ? getMagicItemUses(item.magic_item) : null;
          const maxUses = usesData ? calculateMaxUses(
            usesData.max,
            Math.ceil(character.level / 4) + 1,
            {
              strength: Math.floor((character.strength - 10) / 2),
              dexterity: Math.floor((character.dexterity - 10) / 2),
              constitution: Math.floor((character.constitution - 10) / 2),
              intelligence: Math.floor((character.intelligence - 10) / 2),
              wisdom: Math.floor((character.wisdom - 10) / 2),
              charisma: Math.floor((character.charisma - 10) / 2)
            }
          ) : 0;

          return (
            <div key={item.id} className={itemClasses} onClick={() => setSelectedItem(item)} style={{ cursor: 'pointer' }}>
              <div className="item-info">
                <span className={`item-name ${rarityClass}`}>{itemName}</span>
                {usesData && maxUses > 0 && (
                  <div className="item-uses-inline" onClick={(e) => e.stopPropagation()}>
                    <FeatureUsesTracker
                      maxUses={maxUses}
                      featureId={`item-card-${item.id}`}
                      storedUses={itemUsesState[item.id] || 0}
                      onUsesChange={(_, newUses) => handleItemUsesChange(item.id, newUses)}
                    />
                  </div>
                )}
              </div>
              <div className="item-toggles">
                {isEquippable(item) && (
                  <button className={item.equipped ? 'equip-box equipped' : 'equip-box'} onClick={(e) => { e.stopPropagation(); handleEquipToggle(item.id, item.equipped); }} title={item.equipped ? 'Unequip' : 'Equip'} />
                )}
                {requiresAttunement(item) && (
                  <button className={item.attuned ? 'attune-box attuned' : 'attune-box'} onClick={(e) => { e.stopPropagation(); handleAttunementToggle(item.id, item.attuned); }} title={item.attuned ? 'Unattuned' : 'Attune'} />
                )}
              </div>
              <span className="item-qty">{item.quantity}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Handle equipment toggle
  const handleEquipToggle = async (itemId, currentEquipped) => {
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ equipped: !currentEquipped })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // Refetch inventory to update display
      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error toggling equipment:', err);
    }
  };

  // Handle attunement toggle
  const handleAttunementToggle = async (itemId, currentAttuned) => {
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ attuned: !currentAttuned })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // Refetch inventory to update display
      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error toggling attunement:', err);
    }
  };

  const handleAddItem = async (result) => {
    if (!character?.id) return;
    try {
      const payload = {
        character_id: character.id,
        quantity: 1,
        equipped: false,
        pocket: null,
        equipment_id: result.type === 'equipment' ? result.id : null,
        magic_item_id: result.type === 'magic' ? result.id : null
      };

      const { error } = await supabase
        .from('character_inventory')
        .insert(payload);

      if (error) throw error;

      setSearchTerm('');
      setSearchResults([]);

      // Refetch inventory to show the new item
      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error adding item:', err);
    }
  };

  const handleChangePocket = async (itemId, newPocket) => {
    if (!character?.id) return;
    try {
      const { error } = await supabase
        .from('character_inventory')
        .update({ pocket: newPocket.trim() || null })
        .eq('id', itemId);

      if (error) throw error;

      if (onInventoryUpdate) {
        await onInventoryUpdate();
      }
    } catch (err) {
      console.error('Error updating pocket:', err);
    }
  };

  const itemsByPocket = items.reduce((acc, item) => {
    // Items appear in their type-based filter
    const filter = getItemFilter(item);
    acc[filter] = acc[filter] || [];
    acc[filter].push(item);
    
    // Equipped items also appear in 'Equipped' filter
    if (item.equipped) {
      acc['Equipped'] = acc['Equipped'] || [];
      acc['Equipped'].push(item);
    }
    
    // Items with custom pockets appear there too
    if (item.pocket) {
      acc[item.pocket] = acc[item.pocket] || [];
      acc[item.pocket].push(item);
    }
    
    return acc;
  }, {});

  return (
    <div className="inventory-tab">
      <h2>Inventory</h2>

      <div className="inventory-toolbar">
        <div className="inventory-search">
          <input
            ref={searchInputRef}
            type="text"
            className="inventory-search-input"
            placeholder="Search items to add..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {(searchTerm.trim().length >= 2) && (
            <div className="inventory-search-results">
              {isSearching && <div className="inventory-search-empty">Searching...</div>}
              {!isSearching && searchResults.length === 0 && (
                <div className="inventory-search-empty">No items found.</div>
              )}
              {!isSearching && searchResults.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  className="inventory-search-result"
                  onClick={() => handleAddItem(result)}
                  type="button"
                >
                  <span className="inventory-search-name">{result.name}</span>
                  <span className="inventory-search-type">{result.type === 'magic' ? 'Magic' : 'Equipment'}</span>
                  <span className="inventory-search-add">Add</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="inventory-currency">
          <input
            type="number"
            min="0"
            className="inventory-gold-input"
            value={goldInput === 0 ? '' : goldInput}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                setGoldInput(0);
              } else {
                setGoldInput(Math.max(0, parseInt(val, 10) || 0));
              }
            }}
            disabled={isSavingGold}
            placeholder="0"
          />
          <img 
            src={coinSrc} 
            alt="Gold" 
            className={goldInput !== savedGold ? 'inventory-coin inventory-coin-changed' : 'inventory-coin'}
            onClick={async () => {
              if (goldInput === savedGold || !character?.id) return;
              setIsSavingGold(true);
              try {
                const { error } = await supabase
                  .from('characters')
                  .update({ gold: goldInput })
                  .eq('id', character.id);

                if (error) throw error;
                setSavedGold(goldInput);
              } catch (err) {
                console.error('Error updating gold:', err);
                setGoldInput(character?.gold ?? 0);
              } finally {
                setIsSavingGold(false);
              }
            }}
            style={{ cursor: goldInput !== savedGold ? 'pointer' : 'default' }}
            title={goldInput !== savedGold ? 'Save gold' : ''}
          />
        </div>
      </div>
      
      {/* Pocket Filter Chips */}
      <div className="inventory-pocket-chips">
        <button
          className={activePocket === 'all' ? 'pocket-chip active' : 'pocket-chip'}
          onClick={() => setActivePocket('all')}
        >
          All
        </button>
        <button
          className={activePocket === 'Equipped' ? 'pocket-chip active' : 'pocket-chip'}
          onClick={() => setActivePocket('Equipped')}
        >
          Equipped
        </button>
        {DEFAULT_FILTERS.map((filter) => (
          <button
            key={filter}
            className={activePocket === filter ? 'pocket-chip active' : 'pocket-chip'}
            onClick={() => setActivePocket(filter)}
          >
            {filter}
          </button>
        ))}
        {customPockets.map((pocket) => (
          <button
            key={pocket}
            className={activePocket === pocket ? 'pocket-chip active pocket-chip-custom' : 'pocket-chip pocket-chip-custom'}
            onClick={() => setActivePocket(pocket)}
          >
            {pocket}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="info-text">No items in inventory.</p>
      ) : (
        <>
          {activePocket === 'all' ? (
            // Show default filters only (not custom pockets)
            [...(itemsByPocket['Equipped']?.length ? ['Equipped'] : []), ...DEFAULT_FILTERS].map((filter) => {
              // In "all" view, exclude equipped items from Weapons/Armor since they're in Equipped
              const filterItems = (filter === 'Weapons' || filter === 'Armor') 
                ? (itemsByPocket[filter] || []).filter(item => !item.equipped)
                : (itemsByPocket[filter] || []);
              
              // Sort magic items by rarity and name
              const sortedItems = filter === 'Magic' ? sortItemsByRarityAndName(filterItems) : filterItems;
              
              return sortedItems.length ? (
                <div key={filter} className="inventory-section">
                  <div className="inventory-section-header">
                    <h3>{filter}</h3>
                  </div>
                  <div className="inventory-container">
                    {renderInventoryList(sortedItems)}
                  </div>
                </div>
              ) : null;
            })
          ) : activePocket === 'Magic' ? (
            // Magic tab: split into Attuned and Unattuned sections
            <>
              {(() => {
                const magicItems = itemsByPocket['Magic'] || [];
                const attuned = sortItemsByRarityAndName(magicItems.filter(item => item.attuned));
                const notAttuned = sortItemsByRarityAndName(magicItems.filter(item => !item.attuned));
                
                return (
                  <>
                    {attuned.length > 0 && (
                      <div className="inventory-section">
                        <div className="inventory-section-header">
                          <h3>Attuned</h3>
                        </div>
                        <div className="inventory-container">
                          {renderInventoryList(attuned)}
                        </div>
                      </div>
                    )}
                    {notAttuned.length > 0 && (
                      <div className="inventory-section">
                        <div className="inventory-section-header">
                          <h3>{attuned.length > 0 ? 'Other Magic Items' : 'Magic'}</h3>
                        </div>
                        <div className="inventory-container">
                          {renderInventoryList(notAttuned)}
                        </div>
                      </div>
                    )}
                    {attuned.length === 0 && notAttuned.length === 0 && (
                      <p className="info-text">No magic items.</p>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            <div className="inventory-section">
              <div className="inventory-section-header">
                <h3>{activePocket}</h3>
              </div>
              <div className="inventory-container">
                {renderInventoryList(itemsByPocket[activePocket] || [])}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Item Modal Component - displays detailed information about inventory items
function ItemModal({ isOpen, item, onClose, onDelete, onQuantityUpdate, pocketOptions = [], onPocketUpdate, onCreatePocket, proficiencyBonus, abilityModifiers, characterId }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quantityInput, setQuantityInput] = useState(item?.quantity || 1);
  const [pocketInput, setPocketInput] = useState(item?.pocket || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showPocketDropdown, setShowPocketDropdown] = useState(false);
  const [itemUses, setItemUses] = useState(() => {
    if (!characterId || !item?.id) return 0;
    const stored = localStorage.getItem(`item_uses_${characterId}_${item.id}`);
    return stored ? parseInt(stored, 10) : 0;
  });
  
  // Sync quantity and pocket when item changes
  useEffect(() => {
    if (item?.quantity) {
      setQuantityInput(item.quantity);
    }
    setPocketInput(item?.pocket || '');
    setShowPocketDropdown(false);
    
    // Load stored uses for this item
    if (characterId && item?.id) {
      const stored = localStorage.getItem(`item_uses_${characterId}_${item.id}`);
      setItemUses(stored ? parseInt(stored, 10) : 0);
    }
  }, [item?.id, characterId]);
  
  const handleItemUsesChange = (newUses) => {
    setItemUses(newUses);
    if (characterId && item?.id) {
      localStorage.setItem(`item_uses_${characterId}_${item.id}`, String(newUses));
      // Emit custom event for card to sync
      window.dispatchEvent(new CustomEvent('itemUsesChanged', {
        detail: { itemId: item.id, newUses }
      }));
    }
  };
  
  if (!isOpen || !item) return null;

  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;
  const isEquipment = !!item.equipment;
  const isMagicItem = !!item.magic_item;
  const itemData = isEquipment ? item.equipment : item.magic_item;
  const rawData = itemData?.raw_data || {};
  const isWeapon = isEquipment && item.equipment.type?.toLowerCase().includes('weapon');

  return (
    <div className="item-modal-overlay" onClick={onClose}>
      <div className="item-modal" onClick={(e) => e.stopPropagation()}>
        <button className="item-modal-close" onClick={onClose} aria-label="Close">
          <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
        </button>
        
        <div className="item-modal-content">
          <h2>{itemData?.name || 'Unknown Item'}</h2>
          
          {/* Description with optional image */}
          {(rawData.description || itemData?.description) && (
            <div className="item-section item-main-content">
              {/* Magic Item Image - floats left */}
              {isMagicItem && itemData?.image_url && (
                <div className="item-image-container">
                  <img src={itemData.image_url} alt={itemData.name} className="item-image" />
                </div>
              )}
              
              <div className="item-description">
                {(() => {
                  // Magic items might have description at top level or in raw_data
                  let text = isMagicItem 
                    ? (itemData.description || rawData.description)
                    : rawData.description;
                  
                  if (Array.isArray(text)) {
                    text = text.join('\n\n');
                  }
                  return <ReactMarkdown>{text?.replace(/\n/g, '\n\n') || ''}</ReactMarkdown>;
                })()}
              </div>
            </div>
          )}
          
          {/* Magic Item Uses */}
          {(() => {
            if (!isMagicItem) return null;
            const usesData = getMagicItemUses(itemData);
            if (!usesData) return null;
            const maxUses = calculateMaxUses(usesData.max, proficiencyBonus, abilityModifiers);
            if (maxUses <= 0) return null;
            
            // Derive label from type (e.g., "charges", "uses") and capitalize
            const typeLabel = usesData.type ? usesData.type.charAt(0).toUpperCase() + usesData.type.slice(1) : 'Uses';
            
            return (
              <div className="item-section">
                <div className="item-uses-row">
                  <div className="item-uses-label">{typeLabel}:</div>
                  <FeatureUsesTracker 
                    maxUses={maxUses}
                    featureId={`item-${item.id}`}
                    storedUses={itemUses}
                    onUsesChange={(_, newUses) => handleItemUsesChange(newUses)}
                  />
                </div>
                {usesData.recharge?.when && (
                  <div className="item-recharge-info">
                    Recharges at {usesData.recharge.when}
                  </div>
                )}
              </div>
            );
          })()}
          
          {/* Basic Info - only show for equipment with cost/weight */}
          {isEquipment && (rawData.cost || rawData.weight !== undefined || rawData.rarity) && (
            <div className="item-section">
              {(rawData.cost || rawData.weight !== undefined) && (
                <div className="item-row" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {rawData.cost && (
                    <div style={{ flex: '0 1 auto' }}>
                      <span className="item-label">Cost:</span>
                      {' '}
                      <span>{typeof rawData.cost === 'string' ? rawData.cost : `${rawData.cost.quantity} ${rawData.cost.unit}`}</span>
                    </div>
                  )}
                  {rawData.weight !== undefined && (
                    <div style={{ flex: '0 1 auto' }}>
                      <span className="item-label">Weight:</span>
                      {' '}
                      <span>{rawData.weight} lb</span>
                    </div>
                  )}
                </div>
              )}
              {rawData.rarity && (
                <div className="item-row">
                  <span className="item-label">Rarity:</span>
                  <span className="capitalize">{rawData.rarity}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Weapon Properties */}
          {isWeapon && (
            <>
              <h3>Weapon Properties</h3>
              <div className="item-weapon-properties">
                {rawData.damage && (
                  <div className="item-row">
                    <span className="item-label">Melee Damage:</span>
                    <span>{rawData.damage.damage_dice} {rawData.damage.damage_type?.name || ''}</span>
                  </div>
                )}
                
                {rawData.two_handed_damage && (
                  <div className="item-row">
                    <span className="item-label">Two-Handed:</span>
                    <span>{rawData.two_handed_damage.damage_dice} {rawData.two_handed_damage.damage_type?.name || ''}</span>
                  </div>
                )}
                
                {rawData.range && (
                  <div className="item-row">
                    <span className="item-label">Range:</span>
                    <span>{rawData.range.normal} ft{rawData.range.long ? ` / ${rawData.range.long} ft` : ''}</span>
                  </div>
                )}
                
                {rawData.properties && rawData.properties.length > 0 && (
                  <div className="item-row">
                    <span className="item-label">Properties:</span>
                    <span>{rawData.properties.map((p) => p.name || p).join(', ')}</span>
                  </div>
                )}
                
                {rawData.mastery && (
                  <div className="item-row">
                    <span className="item-label">Mastery:</span>
                    <span>{rawData.mastery.name || rawData.mastery}</span>
                  </div>
                )}
              </div>
            </>
          )}
          
          {/* Armor Properties */}
          {isEquipment && item.equipment.type?.toLowerCase().includes('armor') && (
            <>
              <h3>Armor Properties</h3>
              <div className="item-armor-properties">
                {rawData.equipment_categories && rawData.equipment_categories.length > 0 && (
                  <div className="item-row">
                    <span className="item-label">Type:</span>
                    <span>{rawData.equipment_categories.map((cat) => cat.name).join(', ')}</span>
                  </div>
                )}
                
                {rawData.armor_class && (
                  <div className="item-row">
                    <span className="item-label">AC:</span>
                    <span>{rawData.armor_class.base}{rawData.armor_class.dex_bonus ? ' + DEX' : ''}{rawData.armor_class.max_bonus ? ` (max +${rawData.armor_class.max_bonus})` : ''}</span>
                  </div>
                )}
                
                {rawData.str_minimum !== undefined && rawData.str_minimum > 0 && (
                  <div className="item-row">
                    <span className="item-label">Strength Min:</span>
                    <span>{rawData.str_minimum}</span>
                  </div>
                )}
                
                {rawData.stealth_disadvantage && (
                  <div className="item-row">
                    <span className="item-label">Stealth:</span>
                    <span>Disadvantage</span>
                  </div>
                )}
                
                {rawData.don_time && (
                  <div className="item-row">
                    <span className="item-label">Don Time:</span>
                    <span>{rawData.don_time}</span>
                  </div>
                )}
                
                {rawData.doff_time && (
                  <div className="item-row">
                    <span className="item-label">Doff Time:</span>
                    <span>{rawData.doff_time}</span>
                  </div>
                )}
              </div>
            </>
          )}
          
          {/* Pocket Selection */}
          <div className="item-section">
            <div className="item-pocket-control">
              <span className="item-label">Custom Pocket:</span>
              <div className="item-pocket-dropdown-container">
                <button
                  className="item-pocket-dropdown-button"
                  onClick={() => setShowPocketDropdown(!showPocketDropdown)}
                  disabled={isSaving}
                >
                  <span>{pocketInput || 'None'}</span>
                  <span className="dropdown-arrow">▼</span>
                </button>
                
                {showPocketDropdown && (
                  <>
                    <div className="dropdown-backdrop" onClick={() => setShowPocketDropdown(false)} />
                    <div className="item-pocket-dropdown-menu">
                      <button
                        className={`pocket-dropdown-item ${!pocketInput ? 'active' : ''}`}
                        onClick={async () => {
                          setPocketInput(null);
                          setShowPocketDropdown(false);
                          if (onPocketUpdate) {
                            try {
                              await onPocketUpdate(item.id, null);
                            } catch (err) {
                              setPocketInput(item?.pocket || '');
                            }
                          }
                        }}
                      >
                        None
                      </button>
                      {getCustomPockets(pocketOptions).map((pocket) => (
                        <button
                          key={pocket}
                          className={`pocket-dropdown-item pocket-dropdown-custom ${pocketInput === pocket ? 'active' : ''}`}
                          onClick={async () => {
                            setPocketInput(pocket);
                            setShowPocketDropdown(false);
                            if (onPocketUpdate) {
                              try {
                                await onPocketUpdate(item.id, pocket);
                              } catch (err) {
                                setPocketInput(item?.pocket || '');
                              }
                            }
                          }}
                        >
                          {pocket}
                        </button>
                      ))}
                      <button
                        className="pocket-dropdown-item create-new"
                        onClick={() => {
                          setShowPocketDropdown(false);
                          if (onCreatePocket) {
                            onCreatePocket(item.id);
                          }
                        }}
                      >
                        + Create New Pocket...
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quantity and Delete */}
          <div className="item-section">
            <div className="item-quantity-container">
              <div className="item-quantity-group">
                <span className="item-label">In Inventory:</span>
                <input
                  type="number"
                  className="item-quantity-input"
                  min="1"
                  max="999"
                  value={quantityInput === 0 ? '' : quantityInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setQuantityInput(0);
                    } else {
                      const parsed = parseInt(val);
                      setQuantityInput(isNaN(parsed) ? 0 : Math.max(1, parsed));
                    }
                  }}
                  disabled={isSaving}
                  placeholder="0"
                />
                {quantityInput !== item.quantity && quantityInput > 0 && (
                  <button
                    className="item-quantity-save"
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const { error } = await supabase
                          .from('character_inventory')
                          .update({ quantity: quantityInput })
                          .eq('id', item.id);
                        
                        if (error) throw error;
                        if (onQuantityUpdate) {
                          await onQuantityUpdate();
                        }
                      } catch (err) {
                        console.error('Error updating quantity:', err);
                        setQuantityInput(item.quantity);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    title="Save quantity"
                    aria-label="Save quantity"
                  >
                    <span 
                      className="item-quantity-save-icon" 
                      style={{ '--icon-url': `url(${new URL('../assets/icons/util/tick.svg', import.meta.url).href})` }}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
              {onDelete && (
                <button className="item-delete-btn-lg" onClick={() => setConfirmDelete(true)} title="Remove from inventory" aria-label="Remove from inventory" disabled={isSaving}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Delete Confirmation */}
          {confirmDelete && (
            <div className="item-confirm-overlay" onClick={() => setConfirmDelete(false)}>
              <div className="item-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>Remove Item?</h3>
                <p>Are you sure you want to remove {itemData?.name} from your inventory?</p>
                <div className="item-confirm-buttons">
                  <button className="item-confirm-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button className="item-confirm-delete" onClick={() => { onDelete(); setConfirmDelete(false); onClose(); }}>Remove</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to calculate max uses from string like "charisma" or "proficiency"
const calculateMaxUses = (maxUsesStr, proficiencyBonus, abilityModifiers) => {
  if (!maxUsesStr) return 0;
  
  const str = maxUsesStr.toLowerCase().trim();
  
  if (str === 'proficiency') {
    return proficiencyBonus;
  }
  
  // Check if it's an ability name (strength, dexterity, constitution, intelligence, wisdom, charisma)
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  if (abilities.includes(str)) {
    return abilityModifiers[str] || 0;
  }
  
  // Try to parse as a number
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    return num;
  }
  
  return 0;
};

// Component to display feature uses tracker
function FeatureUsesTracker({ maxUses, featureId, onUsesChange, storedUses }) {
  const getDefaultUses = () => (maxUses > 5 ? maxUses : 0);
  const normalizeUses = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return getDefaultUses();
    return Math.min(Math.max(value, 0), maxUses);
  };

  const [currentUses, setCurrentUses] = useState(normalizeUses(storedUses));

  useEffect(() => {
    setCurrentUses(normalizeUses(storedUses));
  }, [storedUses, maxUses]);
  
  if (!maxUses || maxUses <= 0) return null;
  
  const toggleUse = (index) => {
    const newUses = currentUses === index + 1 ? index : index + 1;
    setCurrentUses(newUses);
    onUsesChange?.(featureId, newUses);
  };

  const spendUse = () => {
    if (currentUses > 0) {
      const newUses = currentUses - 1;
      setCurrentUses(newUses);
      onUsesChange?.(featureId, newUses);
    }
  };

  const restoreUse = () => {
    if (currentUses < maxUses) {
      const newUses = currentUses + 1;
      setCurrentUses(newUses);
      onUsesChange?.(featureId, newUses);
    }
  };
  
  // Show counter for 6+ uses, otherwise show clickable boxes
  if (maxUses > 5) {
    return (
      <div className="uses-counter">
        <button 
          className="uses-btn uses-btn-spend"
          onClick={spendUse}
          disabled={currentUses === 0}
          title="Spend a use"
        >
          −
        </button>
        <span className="uses-count">{currentUses}</span>
        <span className="uses-separator">/</span>
        <span className="uses-max">{maxUses}</span>
        <button 
          className="uses-btn uses-btn-restore"
          onClick={restoreUse}
          disabled={currentUses === maxUses}
          title="Restore a use"
        >
          +
        </button>
        <button 
          className="uses-reset"
          onClick={(event) => {
            const button = event.currentTarget;
            button.classList.remove('is-spinning');
            void button.offsetWidth;
            button.classList.add('is-spinning');
            setCurrentUses(maxUses);
            onUsesChange?.(featureId, maxUses);
          }}
          type="button"
          aria-label="Reset uses"
        >
          <svg className="uses-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }
  
  // Show clickable boxes for 1-5 uses
  return (
    <div className="uses-boxes">
      <div className="uses-boxes-grid">
        {Array.from({ length: maxUses }).map((_, idx) => (
          <button
            key={idx}
            className={`use-box ${currentUses > idx ? 'used' : ''}`}
            onClick={() => toggleUse(idx)}
            title={`Use ${idx + 1}/${maxUses}`}
          />
        ))}
      </div>
      <button
        className="uses-reset"
        onClick={(event) => {
          const button = event.currentTarget;
          button.classList.remove('is-spinning');
          void button.offsetWidth;
          button.classList.add('is-spinning');
          setCurrentUses(0);
          onUsesChange?.(featureId, 0);
        }}
        type="button"
        aria-label="Reset uses"
      >
        <svg className="uses-reset-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

// Tab 4: Actions
function ActionsTab({ character }) {
  const [activeSubtab, setActiveSubtab] = useState('actions');

  return (
    <div className="actions-tab">
      <h2>Actions</h2>

      <div className="feature-subtabs">
        <button
          className={activeSubtab === 'actions' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('actions')}
        >
          Actions
        </button>
        <button
          className={activeSubtab === 'bonus' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('bonus')}
        >
          Bonus Actions
        </button>
        <button
          className={activeSubtab === 'reactions' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('reactions')}
        >
          Reactions
        </button>
      </div>

      <div className="feature-subtab-content">
        {activeSubtab === 'actions' && (
          <p className="info-text">No actions found.</p>
        )}
        {activeSubtab === 'bonus' && (
          <p className="info-text">No bonus actions found.</p>
        )}
        {activeSubtab === 'reactions' && (
          <p className="info-text">No reactions found.</p>
        )}
      </div>
    </div>
  );
}

// Tab 5: Features
function FeaturesTab({ character, proficiencyBonus, abilityModifiers }) {
  const [activeSubtab, setActiveSubtab] = useState('class');
  const [usesState, setUsesState] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [usesLoaded, setUsesLoaded] = useState(false);

  const usesStorageKey = character?.id
    ? `feature-uses:${character.id}`
    : null;

  useEffect(() => {
    if (!usesStorageKey) return;
    try {
      const stored = localStorage.getItem(usesStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setUsesState(parsed);
          setUsesLoaded(true);
          return;
        }
      }
      setUsesState({});
    } catch {
      setUsesState({});
    }
    setUsesLoaded(true);
  }, [usesStorageKey]);

  useEffect(() => {
    if (!usesStorageKey) return;
    if (!usesLoaded) return;
    try {
      localStorage.setItem(usesStorageKey, JSON.stringify(usesState));
    } catch {
      // Ignore storage write errors (private mode or quota exceeded)
    }
  }, [usesState, usesStorageKey, usesLoaded]);
  
  const handleUsesChange = (featureId, newUses) => {
    setUsesState(prev => ({ ...prev, [featureId]: newUses }));
  };


  const handleDescriptionToggle = (featureId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [featureId]: !prev[featureId]
    }));
  };


  return (
    <div className="features-tab">
      <h2>Features & Traits</h2>
      
      {/* Feature Subtabs */}
      <div className="feature-subtabs">
        <button
          className={activeSubtab === 'class' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('class')}
        >
          Class
        </button>
        <button
          className={activeSubtab === 'species' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('species')}
        >
          Species
        </button>
        <button
          className={activeSubtab === 'feats' ? 'subtab-btn active' : 'subtab-btn'}
          onClick={() => setActiveSubtab('feats')}
        >
          Feats
        </button>
      </div>

      {/* Subtab Content */}
      <div className="feature-subtab-content">
        {activeSubtab === 'class' && (
          <ClassFeaturesSubtab
            character={character}
            proficiencyBonus={proficiencyBonus}
            abilityModifiers={abilityModifiers}
            onUsesChange={handleUsesChange}
            usesState={usesState}
            expandedDescriptions={expandedDescriptions}
            onDescriptionToggle={handleDescriptionToggle}
          />
        )}
        {activeSubtab === 'species' && (
          <SpeciesFeaturesSubtab
            character={character}
            proficiencyBonus={proficiencyBonus}
            abilityModifiers={abilityModifiers}
            onUsesChange={handleUsesChange}
            usesState={usesState}
            expandedDescriptions={expandedDescriptions}
            onDescriptionToggle={handleDescriptionToggle}
          />
        )}
        {activeSubtab === 'feats' && (
          <FeatsSubtab
            character={character}
            proficiencyBonus={proficiencyBonus}
            abilityModifiers={abilityModifiers}
            onUsesChange={handleUsesChange}
            usesState={usesState}
            expandedDescriptions={expandedDescriptions}
            onDescriptionToggle={handleDescriptionToggle}
          />
        )}
      </div>
    </div>
  );
}

// Feature Subtab: Class Features
function ClassFeaturesSubtab({ character, proficiencyBonus, abilityModifiers, onUsesChange, usesState, expandedDescriptions, onDescriptionToggle }) {
  // Handle both old (string) and new (object) source formats
  const isNewSourceFormat = (feature) => {
    return typeof feature.source === 'object' && feature.source?.source;
  };
  const getSourceType = (feature) => {
    if (isNewSourceFormat(feature)) {
      return feature.source.source;
    }
    return feature.source;
  };
  
  const getSourceLevel = (feature) => {
    if (isNewSourceFormat(feature)) {
      return feature.source.level;
    }
    return null;
  };

  // Get class and subclass names from character
  const primaryClass = character.classes?.[0];
  const className = primaryClass?.class || 'Unknown';
  const subclassName = primaryClass?.subclass || null;

  // Helper to get source display name
  const getSourceDisplayName = (feature) => {
    const sourceType = getSourceType(feature);
    if (sourceType === 'subclass') {
      return subclassName || 'Subclass';
    }
    return className;
  };

  let subclassFeatures = character.features?.filter(f => getSourceType(f) === 'subclass') || [];
  let classFeatures = character.features?.filter(f => getSourceType(f) === 'class') || [];

  // Sort by level
  subclassFeatures = [...subclassFeatures].sort((a, b) => (getSourceLevel(a) || 0) - (getSourceLevel(b) || 0));
  classFeatures = [...classFeatures].sort((a, b) => (getSourceLevel(a) || 0) - (getSourceLevel(b) || 0));
  
  if (subclassFeatures.length === 0 && classFeatures.length === 0) {
    return (
      <div className="class-features">
        <p className="info-text">No class features found.</p>
      </div>
    );
  }

  return (
    <div className="class-features">
      {/* Subclass Features */}
      {subclassFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Subclass Features</h4>
          <div className="feature-list">
            {subclassFeatures.map((feature, idx) => {
              const sourceDisplay = getSourceDisplayName(feature);
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `subclass-${feature.name || idx}`;
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{sourceDisplay} — {featureLevel}</span>}
                  </div>
                  {feature.max_uses && (
                    <FeatureUsesTracker 
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={feature.description}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Class Features */}
      {classFeatures.length > 0 && (
        <div className="feature-group">
          <h4 className="feature-group-header">Class Features</h4>
          <div className="feature-list">
            {classFeatures.map((feature, idx) => {
              const sourceDisplay = getSourceDisplayName(feature);
              const featureLevel = getSourceLevel(feature);
              const featureId = feature.id || `class-${feature.name || idx}`;
              return (
                <div
                  key={idx}
                  className="feature-item"
                  onClick={(event) => {
                    if (isFeatureToggleIgnored(event.target)) return;
                    onDescriptionToggle(featureId);
                  }}
                >
                  <div className="feature-header">
                    <h3 className="feature-name">{feature.name}</h3>
                    {featureLevel && <span className="feature-source">{sourceDisplay} — {featureLevel}</span>}
                  </div>
                  {feature.max_uses && (
                    <FeatureUsesTracker 
                      maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers)}
                      featureId={featureId}
                      storedUses={usesState[featureId]}
                      onUsesChange={onUsesChange}
                    />
                  )}
                  {feature.description && (
                    <FeatureDescriptionBlock
                      featureId={featureId}
                      description={feature.description}
                      expanded={!!expandedDescriptions[featureId]}
                      onToggle={onDescriptionToggle}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Feature Subtab: Species Features
function SpeciesFeaturesSubtab({ character, proficiencyBonus, abilityModifiers, onUsesChange, usesState, expandedDescriptions, onDescriptionToggle }) {
  // Handle both old (string) and new (object) source formats
  const isNewSourceFormat = (feature) => {
    return typeof feature.source === 'object' && feature.source?.source;
  };
  const getSourceType = (feature) => {
    if (isNewSourceFormat(feature)) {
      return feature.source.source;
    }
    return feature.source;
  };
  
  const speciesFeatures = character.features?.filter(f => getSourceType(f) === 'species') || [];
  
  if (speciesFeatures.length === 0) {
    return (
      <div className="species-features">
        <p className="info-text">No species traits found.</p>
      </div>
    );
  }

  return (
    <div className="species-features">
      <div className="feature-list">
        {speciesFeatures.map((feature, idx) => {
          const featureId = feature.id || `species-${feature.name || idx}`;
          return (
          <div
            key={idx}
            className="feature-item"
            onClick={(event) => {
              if (isFeatureToggleIgnored(event.target)) return;
              onDescriptionToggle(featureId);
            }}
          >
            <div className="feature-header">
              <h3 className="feature-name">{feature.name}</h3>
            </div>
            {feature.max_uses && (
              <FeatureUsesTracker 
                maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers)}
                featureId={featureId}
                storedUses={usesState[featureId]}
                onUsesChange={onUsesChange}
              />
            )}
            {feature.description && (
              <FeatureDescriptionBlock
                featureId={featureId}
                description={feature.description}
                expanded={!!expandedDescriptions[featureId]}
                onToggle={onDescriptionToggle}
              />
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}

// Feature Subtab: Feats (includes background features)
function FeatsSubtab({ character, proficiencyBonus, abilityModifiers, onUsesChange, usesState, expandedDescriptions, onDescriptionToggle }) {
  // Handle both old (string) and new (object) source formats
  const isNewSourceFormat = (item) => {
    return typeof item.source === 'object' && item.source?.source;
  };
  const getSourceType = (item) => {
    if (isNewSourceFormat(item)) {
      return item.source.source;
    }
    return item.source;
  };
  
  const backgroundFeatures = character.features?.filter(f => getSourceType(f) === 'background') || [];
  const feats = character.feats || [];
  
  if (backgroundFeatures.length === 0 && feats.length === 0) {
    return (
      <div className="feats">
        <p className="info-text">No feats or background features found.</p>
      </div>
    );
  }

  return (
    <div className="feats">
      <div className="feature-list">
        {/* Background Features */}
        {backgroundFeatures.map((feature, idx) => {
          const featureId = feature.id || `bg-${feature.name || idx}`;
          return (
          <div
            key={`bg-${idx}`}
            className="feature-item"
            onClick={(event) => {
              if (isFeatureToggleIgnored(event.target)) return;
              onDescriptionToggle(featureId);
            }}
          >
            <div className="feature-header">
              <h3 className="feature-name">{feature.name}</h3>
              <span className="feature-source">Background</span>
            </div>
            {feature.max_uses && (
              <FeatureUsesTracker 
                maxUses={calculateMaxUses(feature.max_uses, proficiencyBonus, abilityModifiers)}
                featureId={featureId}
                storedUses={usesState[featureId]}
                onUsesChange={onUsesChange}
              />
            )}
            {feature.description && (
              <FeatureDescriptionBlock
                featureId={featureId}
                description={feature.description}
                expanded={!!expandedDescriptions[featureId]}
                onToggle={onDescriptionToggle}
              />
            )}
          </div>
        );
        })}
        
        {/* Feats */}
        {feats.map((feat, idx) => {
          // Get source type from feat
          const sourceType = getSourceType(feat);
          // Get source level if available
          const sourceLevel = isNewSourceFormat(feat) ? feat.source.level : null;
          const featId = feat.id || `feat-${feat.name || idx}`;
          
          return (
            <div
              key={`feat-${idx}`}
              className="feature-item"
              onClick={(event) => {
                if (isFeatureToggleIgnored(event.target)) return;
                onDescriptionToggle(featId);
              }}
            >
              <div className="feature-header">
                <h3 className="feature-name">{feat.name || 'Unnamed Feat'}</h3>
                {sourceType && <span className="feature-source">{sourceType}{sourceLevel ? ` (Level ${sourceLevel})` : ''}</span>}
              </div>
              {feat.max_uses && (
                <FeatureUsesTracker 
                  maxUses={calculateMaxUses(feat.max_uses, proficiencyBonus, abilityModifiers)}
                  featureId={featId}
                  storedUses={usesState[featId]}
                  onUsesChange={onUsesChange}
                />
              )}
              {feat.description && (
                <FeatureDescriptionBlock
                  featureId={featId}
                  description={feat.description}
                  expanded={!!expandedDescriptions[featId]}
                  onToggle={onDescriptionToggle}
                />
              )}
              {feat.choices && (
                <p className="feature-choices">
                  <strong>Choices:</strong> {JSON.stringify(feat.choices)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tab 6: Bio
function BioTab({ character }) {
  return (
    <div className="bio-tab">
      <h2>Bio</h2>
      {character.bio ? (
        <p className="bio-text">{character.bio}</p>
      ) : (
        <p className="info-text">No bio information added yet.</p>
      )}
    </div>
  );
}

// Tab 7: Creatures
function CreaturesTab({ character }) {
  return (
    <div className="creatures-tab">
      <h2>Creatures & Companions</h2>
      <p className="info-text">Creatures list coming soon...</p>
    </div>
  );
}

// HP Edit Modal
function HPEditModal({ currentHP, setCurrentHP, tempHP, setTempHP, maxHPModifier, setMaxHPModifier, maxHP, damageInput, setDamageInput, isOpen, onClose }) {
  const displayMaxHP = maxHP + maxHPModifier;
  const crossIconSrc = new URL('../assets/icons/util/cross.svg', import.meta.url).href;
  const [assetsLoaded, setAssetsLoaded] = useState({
    journal: false,
    damage: false,
    healing: false
  });

  useEffect(() => {
    if (isOpen) {
      setAssetsLoaded({ journal: false, damage: false, healing: false });
    }
  }, [isOpen]);

  const markAssetLoaded = (key) => {
    setAssetsLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const areAssetsReady = assetsLoaded.journal && assetsLoaded.damage && assetsLoaded.healing;

  // Check if input is a valid positive integer
  const parsedAmount = parseInt(damageInput);
  const isValidInput = damageInput && !isNaN(parsedAmount) && parsedAmount > 0 && !damageInput.includes('.') && !damageInput.includes('-');

  const handleDamage = () => {
    const damageAmount = parseInt(damageInput);
    // Only allow positive integers
    if (!damageInput || isNaN(damageAmount) || damageAmount <= 0 || damageInput.includes('.') || damageInput.includes('-')) return;
    
    let newCurrent = currentHP - damageAmount;
    
    // Damage reduces temp HP first, then current HP
    if (tempHP > 0) {
      const tempDamage = Math.min(tempHP, damageAmount);
      setTempHP(tempHP - tempDamage);
      newCurrent = currentHP - (damageAmount - tempDamage);
    }
    
    newCurrent = Math.max(0, Math.min(newCurrent, displayMaxHP));
    setCurrentHP(newCurrent);
  };

  const handleHealing = () => {
    const healAmount = parseInt(damageInput);
    // Only allow positive integers
    if (!damageInput || isNaN(healAmount) || healAmount <= 0 || damageInput.includes('.') || damageInput.includes('-')) return;
    
    const newCurrent = Math.max(0, Math.min(currentHP + healAmount, displayMaxHP));
    setCurrentHP(newCurrent);
  };

  if (!isOpen) return null;

  return (
    <div className="hp-modal-overlay" onClick={onClose}>
      <div className={`hp-modal ${areAssetsReady ? '' : 'hp-modal-pending'}`} onClick={onClose}>
        <img
          src="/Journal.png"
          alt=""
          className="hp-modal-bg"
          onLoad={() => markAssetLoaded('journal')}
          onError={() => markAssetLoaded('journal')}
        />

        {!areAssetsReady && (
          <div className="hp-modal-loading">
            <img src="/crest.png" alt="" className="hp-modal-loading-crest" />
          </div>
        )}
        
        <button className="hp-modal-close" onClick={onClose} aria-label="Close HP modal">
          <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
        </button>

        <div className="hp-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="hp-modal-toolbar">
            <button className="hp-modal-close-inline" onClick={onClose} aria-label="Close HP modal">
              <span className="icon-cross" style={{ '--icon-url': `url(${crossIconSrc})` }} aria-hidden="true" />
            </button>
          </div>
          {/* Total Display */}
          <div className="hp-total">
            <span className="hp-total-label hp-total-label-top">Total</span>
            <div className="hp-total-values">
              <span className="hp-total-value hp-value-current">{currentHP}</span>
              <span className="hp-total-separator">/</span>
              <span className={maxHPModifier !== 0 ? 'hp-total-value hp-value-mod' : 'hp-total-value hp-value-current'}>
                {displayMaxHP}
              </span>
              {tempHP > 0 && (
                <span className="hp-total-value hp-value-temp">+{tempHP}</span>
              )}
            </div>
            <span className="hp-total-label hp-total-label-bottom">HP</span>
          </div>

          <div className="hp-fields-row">
            {/* Current HP */}
            <div className="hp-field hp-field-compact hp-field-current">
              <label>Current HP:</label>
              <input 
                type="number" 
                value={currentHP} 
                onChange={(e) => setCurrentHP(Math.max(0, Math.min(parseInt(e.target.value) || 0, displayMaxHP)))}
                min="0"
                max={displayMaxHP}
              />
            </div>

            {/* Max HP Modifier */}
            <div className="hp-field hp-field-compact hp-field-mod">
              <label>Max HP Modifier:</label>
              <input 
                type="number" 
                value={maxHPModifier === 0 ? '' : maxHPModifier} 
                onChange={(e) => setMaxHPModifier(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* Temp HP */}
            <div className="hp-field hp-field-compact hp-field-temp">
              <label>Temporary HP:</label>
              <input 
                type="number" 
                value={tempHP === 0 ? '' : tempHP} 
                onChange={(e) => setTempHP(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          {/* Damage/Healing Calculator */}
          <div className="hp-calculator">
            <div className="hp-calculator-inputs">
              <button onClick={handleDamage} className="hp-damage-btn" aria-label="Apply damage" type="button" disabled={!isValidInput}>
                <img
                  src="/Damage.png"
                  alt=""
                  className="hp-action-icon"
                  onLoad={() => markAssetLoaded('damage')}
                  onError={() => markAssetLoaded('damage')}
                />
              </button>
              <input 
                type="number" 
                value={damageInput} 
                onChange={(e) => setDamageInput(e.target.value)}
                placeholder="0"
              />
              <button onClick={handleHealing} className="hp-healing-btn" aria-label="Apply healing" type="button" disabled={!isValidInput}>
                <img
                  src="/Healing.png"
                  alt=""
                  className="hp-action-icon"
                  onLoad={() => markAssetLoaded('healing')}
                  onError={() => markAssetLoaded('healing')}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

AbilitiesTab.propTypes = {
  character: PropTypes.object.isRequired,
  strMod: PropTypes.number.isRequired,
  dexMod: PropTypes.number.isRequired,
  conMod: PropTypes.number.isRequired,
  intMod: PropTypes.number.isRequired,
  wisMod: PropTypes.number.isRequired,
  chaMod: PropTypes.number.isRequired,
  proficiencyBonus: PropTypes.number.isRequired,
  skills: PropTypes.arrayOf(PropTypes.object),
  derivedStats: PropTypes.object,
  allBonuses: PropTypes.arrayOf(PropTypes.object),
  getAbilityBonuses: PropTypes.func,
  inspectorState: PropTypes.object,
  setInspectorState: PropTypes.func,
  baseAbilities: PropTypes.object
};

SkillsTab.propTypes = {
  character: PropTypes.object.isRequired,
  proficiencyBonus: PropTypes.number.isRequired,
  skills: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  features: PropTypes.arrayOf(PropTypes.object),
  derivedMods: PropTypes.object
};

SpellsTab.propTypes = {
  character: PropTypes.object.isRequired,
  spells: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool
};

InventoryTab.propTypes = {};

FeaturesTab.propTypes = {
  character: PropTypes.object.isRequired
};

HPEditModal.propTypes = {
  currentHP: PropTypes.number,
  setCurrentHP: PropTypes.func.isRequired,
  tempHP: PropTypes.number.isRequired,
  setTempHP: PropTypes.func.isRequired,
  maxHPModifier: PropTypes.number.isRequired,
  setMaxHPModifier: PropTypes.func.isRequired,
  maxHP: PropTypes.number.isRequired,
  damageInput: PropTypes.string.isRequired,
  setDamageInput: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default CharacterSheet;
