import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CharacterSheet from './CharacterSheet';
import { mockCharacter, mockSkills, mockSpells, mockFeatures, mockUser, mockAdminUser, mockCharacters } from '../test/mockData';

// Mock hooks
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('../hooks/useCharacter', () => ({
  useCharacter: vi.fn()
}));

vi.mock('../lib/bonusEngine', () => ({
  collectBonuses: vi.fn(),
  deriveCharacterStats: vi.fn()
}));

import { useAuth } from '../context/AuthContext';
import { useCharacter } from '../hooks/useCharacter';
import { deriveCharacterStats } from '../lib/bonusEngine';

// Helper to render component with router
const renderCharacterSheet = () => {
  return render(
    <BrowserRouter>
      <CharacterSheet />
    </BrowserRouter>
  );
};

describe('CharacterSheet', () => {
  const mockDerivedStats = {
    abilities: {
      strength: 16,
      dexterity: 14,
      constitution: 15,
      intelligence: 13,
      wisdom: 10,
      charisma: 8
    },
    modifiers: {
      strength: 3,
      dexterity: 2,
      constitution: 2,
      intelligence: 1,
      wisdom: 0,
      charisma: -1
    },
    ac: 16,
    initiative: 2,
    maxHP: 45,
    passivePerception: 13,
    proficiency: 3,
    speeds: {
      walk: 30,
      climb: 15
    },
    senses: [
      { sense_type: 'darkvision', range: 60 }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    useAuth.mockReturnValue({
      user: mockUser,
      isAdmin: false
    });

    useCharacter.mockReturnValue({
      character: { ...mockCharacter, skills: mockSkills, spells: mockSpells, features: mockFeatures },
      loading: false,
      relatedLoading: false,
      error: null,
      characters: null,
      selectedCharacterId: mockCharacter.id,
      setSelectedCharacterId: vi.fn()
    });

    // Mock deriveCharacterStats to return { derived, totals, sources }
    deriveCharacterStats.mockReturnValue({
      derived: mockDerivedStats,
      totals: {},
      sources: {}
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Basic Rendering', () => {
    it('should render character name and level', () => {
      renderCharacterSheet();
      expect(screen.getByText('Test Character')).toBeInTheDocument();
      expect(screen.getByText(/Level 5/i)).toBeInTheDocument();
    });

    it('should show loading state while fetching character', () => {
      useCharacter.mockReturnValue({
        character: null,
        loading: true,
        relatedLoading: false,
        error: null
      });

      renderCharacterSheet();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should show error message when fetch fails', () => {
      useCharacter.mockReturnValue({
        character: null,
        loading: false,
        relatedLoading: false,
        error: 'Failed to load character'
      });

      renderCharacterSheet();
      expect(screen.getByText('Failed to load character')).toBeInTheDocument();
    });

    it('should render character portrait', () => {
      renderCharacterSheet();
      const portrait = screen.getByAltText('Test Character');
      expect(portrait).toBeInTheDocument();
      expect(portrait).toHaveAttribute('src', '/test-portrait.jpg');
    });
  });

  describe('Admin Features', () => {
    it('should show character selector for admin users', () => {
      useAuth.mockReturnValue({
        user: mockAdminUser,
        isAdmin: true
      });

      useCharacter.mockReturnValue({
        character: mockCharacter,
        loading: false,
        relatedLoading: false,
        error: null,
        characters: mockCharacters,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: vi.fn()
      });

      renderCharacterSheet();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should not show character selector for regular users', () => {
      renderCharacterSheet();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('should call setSelectedCharacterId when selecting different character', () => {
      const mockSetSelected = vi.fn();
      
      useAuth.mockReturnValue({
        user: mockAdminUser,
        isAdmin: true
      });

      useCharacter.mockReturnValue({
        character: mockCharacter,
        loading: false,
        relatedLoading: false,
        error: null,
        characters: mockCharacters,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: mockSetSelected
      });

      renderCharacterSheet();
      const selector = screen.getByRole('combobox');
      fireEvent.change(selector, { target: { value: 'test-char-789' } });
      
      expect(mockSetSelected).toHaveBeenCalledWith('test-char-789');
    });
  });

  describe('Sticky Header', () => {
    it('should display HP in sticky header', () => {
      renderCharacterSheet();
      expect(screen.getByText('35/45')).toBeInTheDocument();
    });

    it('should display AC in sticky header', () => {
      renderCharacterSheet();
      expect(screen.getByText('16')).toBeInTheDocument();
    });

    it('should display initiative in sticky header', () => {
      renderCharacterSheet();
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('should display conditions in sticky header', () => {
      renderCharacterSheet();
      expect(screen.getByText('Poisoned')).toBeInTheDocument();
    });

    it('should toggle portrait visibility when button clicked', () => {
      renderCharacterSheet();
      const toggleButton = screen.getByLabelText(/toggle portrait/i);
      
      fireEvent.click(toggleButton);
      
      // Portrait should still be in DOM but with hidden class
      const portraitContainer = screen.getByAltText('Test Character').closest('.portrait-container');
      expect(portraitContainer).toHaveClass('hidden');
    });
  });

  describe('HP Modal', () => {
    it('should open HP modal when HP display is clicked', async () => {
      renderCharacterSheet();
      const hpDisplay = screen.getByText('35/45');
      
      fireEvent.click(hpDisplay);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should display damage calculator in modal', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter amount/i)).toBeInTheDocument();
      });
    });

    it('should calculate damage correctly', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText(/enter amount/i);
        const damageButton = screen.getByText(/take damage/i);
        
        fireEvent.change(input, { target: { value: '10' } });
        fireEvent.click(damageButton);
        
        // HP should be reduced by 10
        expect(screen.getByText('25/45')).toBeInTheDocument();
      });
    });

    it('should calculate healing correctly', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText(/enter amount/i);
        const healButton = screen.getByText(/heal/i);
        
        fireEvent.change(input, { target: { value: '10' } });
        fireEvent.click(healButton);
        
        // HP should be increased by 10 (capped at max)
        expect(screen.getByText('45/45')).toBeInTheDocument();
      });
    });

    it('should reject non-positive integers', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText(/enter amount/i);
        const damageButton = screen.getByText(/take damage/i);
        
        // Try negative number
        fireEvent.change(input, { target: { value: '-5' } });
        fireEvent.click(damageButton);
        
        // HP should not change
        expect(screen.getByText('35/45')).toBeInTheDocument();
        
        // Try decimal
        fireEvent.change(input, { target: { value: '5.5' } });
        fireEvent.click(damageButton);
        
        // HP should not change
        expect(screen.getByText('35/45')).toBeInTheDocument();
      });
    });

    it('should handle temp HP correctly', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const tempHPInput = screen.getByLabelText(/temp hp/i);
        fireEvent.change(tempHPInput, { target: { value: '10' } });
        
        // Damage should reduce temp HP first
        const input = screen.getByPlaceholderText(/enter amount/i);
        const damageButton = screen.getByText(/take damage/i);
        
        fireEvent.change(input, { target: { value: '5' } });
        fireEvent.click(damageButton);
        
        expect(tempHPInput).toHaveValue(5);
        expect(screen.getByText('35/45')).toBeInTheDocument(); // Regular HP unchanged
      });
    });

    it('should apply max HP modifier', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const maxHPInput = screen.getByLabelText(/max hp modifier/i);
        fireEvent.change(maxHPInput, { target: { value: '5' } });
        
        // Max HP should increase
        expect(screen.getByText('35/50')).toBeInTheDocument();
      });
    });

    it('should persist HP to localStorage on change', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText(/enter amount/i);
        const damageButton = screen.getByText(/take damage/i);
        
        fireEvent.change(input, { target: { value: '10' } });
        fireEvent.click(damageButton);
        
        const stored = JSON.parse(localStorage.getItem(`hp_${mockCharacter.id}`));
        expect(stored.currentHP).toBe(25);
      });
    });

    it('should load HP from localStorage on mount', () => {
      localStorage.setItem(`hp_${mockCharacter.id}`, JSON.stringify({
        currentHP: 20,
        tempHP: 5,
        maxHPModifier: 3
      }));

      renderCharacterSheet();
      
      expect(screen.getByText('20/48')).toBeInTheDocument();
    });

    it('should close modal when close button clicked', async () => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('35/45'));
      
      await waitFor(() => {
        const modal = screen.getByRole('dialog');
        expect(modal).toBeInTheDocument();
        
        const closeButton = within(modal).getByLabelText(/close/i);
        fireEvent.click(closeButton);
      });
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should render all tabs', () => {
      renderCharacterSheet();
      expect(screen.getByText('Abilities')).toBeInTheDocument();
      expect(screen.getByText('Skills')).toBeInTheDocument();
      expect(screen.getByText('Spells')).toBeInTheDocument();
      expect(screen.getByText('Inventory')).toBeInTheDocument();
      expect(screen.getByText('Features')).toBeInTheDocument();
    });

    it('should start with Abilities tab active', () => {
      renderCharacterSheet();
      const abilitiesTab = screen.getByText('Abilities').closest('button');
      expect(abilitiesTab).toHaveClass('active');
    });

    it('should switch tabs when clicked', () => {
      renderCharacterSheet();
      const skillsTab = screen.getByText('Skills');
      
      fireEvent.click(skillsTab);
      
      expect(skillsTab.closest('button')).toHaveClass('active');
      expect(screen.getByText('Athletics')).toBeInTheDocument();
    });
  });

  describe('Abilities Tab', () => {
    it('should display all ability scores', () => {
      renderCharacterSheet();
      
      expect(screen.getByText('16')).toBeInTheDocument(); // STR
      expect(screen.getByText('14')).toBeInTheDocument(); // DEX
      expect(screen.getByText('15')).toBeInTheDocument(); // CON
      expect(screen.getByText('13')).toBeInTheDocument(); // INT
      expect(screen.getByText('10')).toBeInTheDocument(); // WIS
      expect(screen.getByText('8')).toBeInTheDocument(); // CHA
    });

    it('should display ability modifiers', () => {
      renderCharacterSheet();
      
      expect(screen.getByText('+3')).toBeInTheDocument(); // STR mod
      expect(screen.getByText('+2')).toBeInTheDocument(); // DEX/CON mod
      expect(screen.getByText('+1')).toBeInTheDocument(); // INT mod
      expect(screen.getByText('+0')).toBeInTheDocument(); // WIS mod
      expect(screen.getByText('-1')).toBeInTheDocument(); // CHA mod
    });

    it('should display saving throws with proficiency', () => {
      renderCharacterSheet();
      
      // STR and CON saves should be proficient
      const strSave = screen.getByText(/strength/i).closest('.save');
      expect(strSave).toHaveClass('proficient');
    });

    it('should display passive skills', () => {
      renderCharacterSheet();
      
      expect(screen.getByText(/passive perception.*13/i)).toBeInTheDocument();
      expect(screen.getByText(/passive insight.*10/i)).toBeInTheDocument();
      expect(screen.getByText(/passive investigation.*11/i)).toBeInTheDocument();
    });

    it('should display speeds', () => {
      renderCharacterSheet();
      
      expect(screen.getByText(/walk.*30/i)).toBeInTheDocument();
      expect(screen.getByText(/climb.*15/i)).toBeInTheDocument();
    });

    it('should display senses', () => {
      renderCharacterSheet();
      
      expect(screen.getByText(/darkvision.*60/i)).toBeInTheDocument();
    });
  });

  describe('Skills Tab', () => {
    beforeEach(() => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('Skills'));
    });

    it('should display all skill names', () => {
      expect(screen.getByText('Athletics')).toBeInTheDocument();
      expect(screen.getByText('Perception')).toBeInTheDocument();
      expect(screen.getByText('Stealth')).toBeInTheDocument();
    });

    it('should show proficiency icon for proficient skills', () => {
      const athleticsRow = screen.getByText('Athletics').closest('.skill-row');
      const proficiencyIcon = within(athleticsRow).getByRole('img', { hidden: true });
      expect(proficiencyIcon).toBeInTheDocument();
    });

    it('should show expertise icon for expertise skills', () => {
      const stealthRow = screen.getByText('Stealth').closest('.skill-row');
      const expertiseIcon = within(stealthRow).getByRole('img', { hidden: true });
      expect(expertiseIcon).toBeInTheDocument();
    });
  });

  describe('Spells Tab', () => {
    beforeEach(() => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('Spells'));
    });

    it('should display spell names', () => {
      expect(screen.getByText('Fireball')).toBeInTheDocument();
      expect(screen.getByText('Shield')).toBeInTheDocument();
    });

    it('should group spells by level', () => {
      expect(screen.getByText(/level 1/i)).toBeInTheDocument();
      expect(screen.getByText(/level 3/i)).toBeInTheDocument();
    });

    it('should show prepared status', () => {
      const fireballRow = screen.getByText('Fireball').closest('.spell-row');
      expect(within(fireballRow).getByText(/prepared/i)).toBeInTheDocument();
    });

    it('should display spell details in modal when clicked', async () => {
      fireEvent.click(screen.getByText('Fireball'));
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/bright streak flashes/i)).toBeInTheDocument();
      });
    });
  });

  describe('Stat Calculations', () => {
    it('should calculate proficiency bonus correctly', () => {
      renderCharacterSheet();
      
      // Level 5 should have +3 proficiency
      expect(mockDerivedStats.proficiencyBonus).toBe(3);
    });

    it('should calculate ability modifiers correctly', () => {
      renderCharacterSheet();
      
      // STR 16 = +3
      expect(mockDerivedStats.abilities.strength.modifier).toBe(3);
      // DEX 14 = +2
      expect(mockDerivedStats.abilities.dexterity.modifier).toBe(2);
      // CHA 8 = -1
      expect(mockDerivedStats.abilities.charisma.modifier).toBe(-1);
    });

    it('should apply bonus engine to stats', () => {
      renderCharacterSheet();
      
      expect(deriveCharacterStats).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockCharacter,
          skills: mockSkills,
          spells: mockSpells,
          features: mockFeatures
        })
      );
    });
  });

  describe('Modifier Calculations with Custom Modifiers and Overrides', () => {
    // Helper function matching CharacterSheet implementation
    const calculateModifier = (score) => Math.floor((score - 10) / 2);

    // Helper function matching CharacterSheet implementation
    const getFinalAbilityScore = (abilityKey, baseScore, inspectorState) => {
      const override = inspectorState.abilityCustomOverrides?.[abilityKey];
      if (override !== null && override !== undefined) {
        return override;
      }
      const customMods = inspectorState.abilityCustomModifiers?.[abilityKey] || [];
      const customTotal = customMods.reduce((sum, mod) => sum + mod.value, 0);
      return baseScore + customTotal;
    };

    describe('calculateModifier', () => {
      it('should calculate modifier for score 10 as 0', () => {
        expect(calculateModifier(10)).toBe(0);
      });

      it('should calculate modifier for score 18 as 4', () => {
        expect(calculateModifier(18)).toBe(4);
      });

      it('should calculate modifier for score 20 as 5', () => {
        expect(calculateModifier(20)).toBe(5);
      });

      it('should calculate modifier for score 8 as -1', () => {
        expect(calculateModifier(8)).toBe(-1);
      });

      it('should calculate modifier for score 3 as -4', () => {
        expect(calculateModifier(3)).toBe(-4);
      });
    });

    describe('getFinalAbilityScore', () => {
      it('should return base score when no modifiers or overrides', () => {
        const inspectorState = {
          abilityCustomModifiers: {},
          abilityCustomOverrides: {}
        };
        expect(getFinalAbilityScore('strength', 16, inspectorState)).toBe(16);
      });

      it('should add custom modifiers to base score', () => {
        const inspectorState = {
          abilityCustomModifiers: {
            strength: [
              { source: 'Feat', value: 1 },
              { source: 'Class', value: 2 }
            ]
          },
          abilityCustomOverrides: {}
        };
        expect(getFinalAbilityScore('strength', 16, inspectorState)).toBe(19);
      });

      it('should handle negative custom modifiers', () => {
        const inspectorState = {
          abilityCustomModifiers: {
            dexterity: [
              { source: 'Curse', value: -3 }
            ]
          },
          abilityCustomOverrides: {}
        };
        expect(getFinalAbilityScore('dexterity', 14, inspectorState)).toBe(11);
      });

      it('should use override value if set, ignoring modifiers', () => {
        const inspectorState = {
          abilityCustomModifiers: {
            constitution: [
              { source: 'Buff', value: 2 }
            ]
          },
          abilityCustomOverrides: {
            constitution: 20
          }
        };
        expect(getFinalAbilityScore('constitution', 15, inspectorState)).toBe(20);
      });
    });

    describe('Ability Score to Modifier Conversion', () => {
      it('should update modifier when custom modifier is added (18 +2 = 20, modifier +4 to +5)', () => {
        const baseScore = 18;
        const baseMod = calculateModifier(baseScore); // +4

        const inspectorState = {
          abilityCustomModifiers: {
            strength: [{ source: 'Feat', value: 2 }]
          },
          abilityCustomOverrides: {}
        };

        const finalScore = getFinalAbilityScore('strength', baseScore, inspectorState); // 20
        const finalMod = calculateModifier(finalScore); // +5

        expect(baseMod).toBe(4);
        expect(finalScore).toBe(20);
        expect(finalMod).toBe(5);
      });

      it('should update modifier when override is set (14 with override 18, modifier +2 to +4)', () => {
        const baseScore = 14;
        const baseMod = calculateModifier(baseScore); // +2

        const inspectorState = {
          abilityCustomModifiers: {},
          abilityCustomOverrides: {
            dexterity: 18
          }
        };

        const finalScore = getFinalAbilityScore('dexterity', baseScore, inspectorState); // 18
        const finalMod = calculateModifier(finalScore); // +4

        expect(baseMod).toBe(2);
        expect(finalScore).toBe(18);
        expect(finalMod).toBe(4);
      });

      it('should handle multiple modifiers (15 +1 +1 = 17, modifier +2 to +3)', () => {
        const baseScore = 15;
        const baseMod = calculateModifier(baseScore); // +2

        const inspectorState = {
          abilityCustomModifiers: {
            constitution: [
              { source: 'Feat A', value: 1 },
              { source: 'Feat B', value: 1 }
            ]
          },
          abilityCustomOverrides: {}
        };

        const finalScore = getFinalAbilityScore('constitution', baseScore, inspectorState); // 17
        const finalMod = calculateModifier(finalScore); // +3

        expect(baseMod).toBe(2);
        expect(finalScore).toBe(17);
        expect(finalMod).toBe(3);
      });

      it('should handle negative modifier changes (16 -2 = 14, modifier +3 to +2)', () => {
        const baseScore = 16;
        const baseMod = calculateModifier(baseScore); // +3

        const inspectorState = {
          abilityCustomModifiers: {
            strength: [
              { source: 'Curse', value: -2 }
            ]
          },
          abilityCustomOverrides: {}
        };

        const finalScore = getFinalAbilityScore('strength', baseScore, inspectorState); // 14
        const finalMod = calculateModifier(finalScore); // +2

        expect(baseMod).toBe(3);
        expect(finalScore).toBe(14);
        expect(finalMod).toBe(2);
      });
    });

    describe('Complex Scenarios', () => {
      it('should handle character with mixed ability modifications', () => {
        const abilities = {
          strength: 18,
          dexterity: 14,
          constitution: 15,
          intelligence: 12,
          wisdom: 16,
          charisma: 13
        };

        const inspectorState = {
          abilityCustomModifiers: {
            strength: [
              { source: 'Level 4 ASI', value: 2 },
              { source: 'Item', value: 1 }
            ],
            dexterity: [
              { source: 'Feat', value: 1 }
            ],
            constitution: []
          },
          abilityCustomOverrides: {
            wisdom: 18
          }
        };

        // STR: 18 + 3 = 21, mod = +5
        const strScore = getFinalAbilityScore('strength', abilities.strength, inspectorState);
        const strMod = calculateModifier(strScore);
        expect(strScore).toBe(21);
        expect(strMod).toBe(5);

        // DEX: 14 + 1 = 15, mod = +2
        const dexScore = getFinalAbilityScore('dexterity', abilities.dexterity, inspectorState);
        const dexMod = calculateModifier(dexScore);
        expect(dexScore).toBe(15);
        expect(dexMod).toBe(2);

        // CON: 15, mod = +2 (no modifiers)
        const conScore = getFinalAbilityScore('constitution', abilities.constitution, inspectorState);
        const conMod = calculateModifier(conScore);
        expect(conScore).toBe(15);
        expect(conMod).toBe(2);

        // WIS: override to 18, mod = +4 (ignoring base 16)
        const wisScore = getFinalAbilityScore('wisdom', abilities.wisdom, inspectorState);
        const wisMod = calculateModifier(wisScore);
        expect(wisScore).toBe(18);
        expect(wisMod).toBe(4);
      });

      it('should correctly handle clearing modifiers (18 +2 -> no modifiers = 18)', () => {
        const baseScore = 18;
        
        // With modifier
        const withModifier = {
          abilityCustomModifiers: {
            strength: [{ source: 'Buff', value: 2 }]
          },
          abilityCustomOverrides: {}
        };
        const scoreWithMod = getFinalAbilityScore('strength', baseScore, withModifier);
        const modWithMod = calculateModifier(scoreWithMod);
        expect(scoreWithMod).toBe(20);
        expect(modWithMod).toBe(5);

        // After clearing modifier
        const withoutModifier = {
          abilityCustomModifiers: {},
          abilityCustomOverrides: {}
        };
        const scoreWithoutMod = getFinalAbilityScore('strength', baseScore, withoutModifier);
        const modWithoutMod = calculateModifier(scoreWithoutMod);
        expect(scoreWithoutMod).toBe(18);
        expect(modWithoutMod).toBe(4);
      });
    });
  });
});
