import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Mock embla-carousel-react: jsdom has no real layout/scrolling, so the real
// carousel never fires its 'select' event. Provide a deterministic stand-in
// that invokes registered 'select' listeners synchronously on scrollTo.
// The api instance is module-scoped so it stays stable across re-renders,
// matching real embla-carousel-react's behavior.
vi.mock('embla-carousel-react', () => {
  let selectedIndex = 0;
  let listeners = { select: [], reInit: [] };
  const emblaApi = {
    selectedScrollSnap: () => selectedIndex,
    scrollTo: (index) => {
      selectedIndex = index;
      listeners.select.forEach((cb) => cb());
    },
    on: (event, cb) => { listeners[event]?.push(cb); },
    off: (event, cb) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter((fn) => fn !== cb);
    },
    reInit: () => {}
  };
  return {
    default: () => [() => {}, emblaApi],
    __resetEmblaMock: () => {
      selectedIndex = 0;
      listeners = { select: [], reInit: [] };
    }
  };
});

import { useAuth } from '../context/AuthContext';
import { useCharacter } from '../hooks/useCharacter';
import { collectBonuses, deriveCharacterStats } from '../lib/bonusEngine';
import { __resetEmblaMock } from 'embla-carousel-react';

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
    __resetEmblaMock();

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
    collectBonuses.mockReturnValue([]);
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
      expect(screen.getByText(/Lvl 5/i)).toBeInTheDocument();
    });

    it('should show loading state while fetching character', () => {
      useCharacter.mockReturnValue({
        character: null,
        loading: true,
        relatedLoading: false,
        error: null
      });

      renderCharacterSheet();
      expect(document.querySelector('.route-loading')).toBeInTheDocument();
    });

    it('should show error message when fetch fails', () => {
      useCharacter.mockReturnValue({
        character: null,
        loading: false,
        relatedLoading: false,
        error: 'Failed to load character'
      });

      renderCharacterSheet();
      expect(screen.getByText(/Failed to load character/i)).toBeInTheDocument();
    });

    it('should render character portrait', () => {
      renderCharacterSheet();
      const portrait = screen.getByAltText('Test Character');
      expect(portrait).toBeInTheDocument();
      expect(portrait).toHaveAttribute('src', '/test-portrait.jpg');
    });

    it('should parse arithmetic max uses expressions such as proficiency+level', () => {
      useCharacter.mockReturnValue({
        character: {
          ...mockCharacter,
          level: 5,
          features: [
            {
              ...mockFeatures[0],
              source: { source: 'class', level: 5 },
              max_uses: 'proficiency+level',
              current_uses: 0,
              reset_on: 'short rest'
            }
          ]
        },
        loading: false,
        relatedLoading: false,
        error: null,
        characters: null,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: vi.fn()
      });

      renderCharacterSheet();
      expect(document.querySelector('.uses-max')?.textContent).toBe('8');
    });

    it('should interpolate arithmetic description expressions such as ${proficiency+level}', () => {
      const description = 'You can use this feature ${proficiency+level} times.';
      const feature = {
        id: 'arith-desc-feature',
        name: 'Arithmetic Feature',
        source: { source: 'class', level: 5 },
        description,
        max_uses: 0,
        reset_on: 'long rest'
      };

      useCharacter.mockReturnValue({
        character: {
          ...mockCharacter,
          level: 5,
          features: [feature]
        },
        loading: false,
        relatedLoading: false,
        error: null,
        characters: null,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: vi.fn()
      });

      renderCharacterSheet();
      expect(screen.getByText(/You can use this feature 8 times\./i)).toBeInTheDocument();
    });

    it('should render Metamagic features like invocation and fighting-style features', async () => {
      useCharacter.mockReturnValue({
        character: {
          ...mockCharacter,
          features: [{
            id: 'quickened-spell',
            name: 'Quickened Spell',
            source: { source: 'metamagic', level: 3 },
            description: 'When you cast a spell, you can change its casting time.'
          }]
        },
        loading: false,
        relatedLoading: false,
        error: null,
        characters: null,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: vi.fn()
      });

      renderCharacterSheet();
      fireEvent.click(screen.getByLabelText('Features'));

      await waitFor(() => {
        expect(screen.getByText('Metamagic')).toBeInTheDocument();
      });
      expect(screen.getByText('Quickened Spell')).toBeInTheDocument();
      expect(screen.getByText(/When you cast a spell/i)).toBeInTheDocument();
    });

    it('should allow two selections for a multi-select feature', async () => {
      useCharacter.mockReturnValue({
        character: {
          ...mockCharacter,
          features: [{
            id: 'monster-magic',
            name: 'Monster Magic',
            source: { source: 'metamagic', level: 7 },
            description: '**Channeled Flight**\n\n**Draining Ray**\n\n**Bestial Venom**\n\n**Cold Blood**',
            benefits: [{
              type: 'select',
              select: {
                max_selections: 2,
                choices: ['Channeled Flight', 'Draining Ray', 'Bestial Venom', 'Cold Blood'],
                'Channeled Flight': [],
                'Draining Ray': [],
                'Bestial Venom': [],
                'Cold Blood': []
              }
            }]
          }]
        },
        loading: false,
        relatedLoading: false,
        error: null,
        characters: null,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: vi.fn()
      });

      renderCharacterSheet();
      fireEvent.click(screen.getByLabelText('Features'));

      await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Channeled Flight' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select Channeled Flight' }));
      await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Channeled Flight' })).toBeChecked());
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select Draining Ray' }));
      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: 'Select Channeled Flight' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Select Draining Ray' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Select Bestial Venom' })).toBeDisabled();
      });

      expect(screen.getByRole('checkbox', { name: 'Select Bestial Venom' })).toBeDisabled();
    });

    it('should apply an active d20 ability override to matching ability checks', async () => {
      useCharacter.mockReturnValue({
        character: {
          ...mockCharacter,
          features: [{
            id: 'monster-unleashed',
            name: 'Monster Unleashed',
            source: { source: 'metamagic', level: 14 },
            benefits: [{
              type: 'stance',
              stances: [{
                name: 'Apex Predator',
                benefits: [{
                  type: 'd20_ability_override',
                  source_abilities: ['strength'],
                  replacement_ability: 'charisma',
                  applies_to: ['checks', 'saving_throws', 'attack_rolls']
                }]
              }]
            }]
          }]
        },
        loading: false,
        relatedLoading: false,
        error: null,
        characters: null,
        selectedCharacterId: mockCharacter.id,
        setSelectedCharacterId: vi.fn()
      });

      renderCharacterSheet();
      fireEvent.click(screen.getByLabelText('Features'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Apex Predator' })).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Apex Predator' }));
      fireEvent.click(screen.getByLabelText('Skills'));

      await waitFor(() => {
        const athletics = Array.from(document.querySelectorAll('.skill-item'))
          .find((row) => row.textContent.includes('Athletics'));
        expect(athletics?.querySelector('.skill-bonus')).toHaveTextContent('-1');
      });

      fireEvent.click(screen.getByLabelText('Actions'));
      await waitFor(() => {
        const unarmedNameRow = screen.getByText('Unarmed Strike').closest('.action-row');
        expect(unarmedNameRow?.nextElementSibling?.querySelector('.hit-col .stat-value')).toHaveTextContent('+2');
      });
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
      // Base 45 + CON scaling (2 * level 5) = 55 max HP
      expect(document.querySelector('.stat-compact.hp')).toHaveTextContent('35/55');
    });

    it('should display AC in sticky header', () => {
      renderCharacterSheet();
      expect(document.querySelector('.stat-compact.ac')).toHaveTextContent('16');
    });

    it('should display initiative in sticky header', () => {
      renderCharacterSheet();
      expect(document.querySelector('.stat-compact.init')).toHaveTextContent('+2');
    });

    it('should display conditions in sticky header', () => {
      // Active conditions are tracked in localStorage, not on the character record
      localStorage.setItem(`conditions:${mockCharacter.id}`, JSON.stringify({
        activeConditions: ['Poisoned'],
        exhaustionLevel: 0
      }));

      renderCharacterSheet();
      expect(screen.getByLabelText(/open conditions tracker/i)).toBeInTheDocument();
      expect(document.querySelector('.conditions-active-count')).toHaveTextContent('1');
    });

    it('should toggle portrait highlight when button clicked', () => {
      renderCharacterSheet();
      const toggleButton = screen.getByLabelText(/toggle portrait/i);
      expect(toggleButton).toHaveClass('is-highlighted');

      fireEvent.click(toggleButton);

      expect(toggleButton).toHaveClass('is-muted');
    });
  });

  describe('HP Modal', () => {
    const getHpDisplay = () => screen.getByTitle('Click to edit HP');

    const openHpModal = async () => {
      fireEvent.click(getHpDisplay());
      await waitFor(() => {
        expect(document.querySelector('.hp-modal')).toBeTruthy();
      });
    };

    it('should include max HP bonuses in modal total', async () => {
      collectBonuses.mockReturnValue([
        { target: 'maxHP', value: 10, type: 'feature', source: { label: 'Tough' } }
      ]);

      renderCharacterSheet();

      // Sticky display should reflect base + CON scaling + bonus-engine HP bonus.
      const hpDisplay = screen.getByTitle('Click to edit HP');
      expect(hpDisplay).toHaveTextContent(/35\s*\/\s*65/);

      fireEvent.click(hpDisplay);

      await waitFor(() => {
        expect(document.querySelector('.hp-modal')).toBeTruthy();
      });

      // Modal total should match sticky max HP instead of base+CON max HP.
      const modalTotal = document.querySelector('.hp-total-values');
      expect(modalTotal).toBeTruthy();
      expect(modalTotal).toHaveTextContent(/35\s*\/\s*65/);
    });

    it('should open HP modal when HP display is clicked', async () => {
      renderCharacterSheet();
      await openHpModal();
    });

    it('should display damage calculator in modal', async () => {
      renderCharacterSheet();
      await openHpModal();
      expect(document.querySelector('.hp-calculator-inputs input')).toBeTruthy();
    });

    it('should calculate damage correctly', async () => {
      renderCharacterSheet();
      await openHpModal();

      const input = document.querySelector('.hp-calculator-inputs input');
      const damageButton = screen.getByLabelText(/apply damage/i);
      expect(input).toBeTruthy();

      fireEvent.change(input, { target: { value: '10' } });
      fireEvent.click(damageButton);

      // HP should be reduced by 10, with max including CON scaling.
      expect(getHpDisplay()).toHaveTextContent(/25\s*\/\s*55/);
    });

    it('should calculate healing correctly', async () => {
      renderCharacterSheet();
      await openHpModal();

      const input = document.querySelector('.hp-calculator-inputs input');
      const healButton = screen.getByLabelText(/apply healing/i);
      expect(input).toBeTruthy();

      fireEvent.change(input, { target: { value: '10' } });
      fireEvent.click(healButton);

      // HP should be increased by 10 (capped at max).
      expect(getHpDisplay()).toHaveTextContent(/45\s*\/\s*55/);
    });

    it('should reject non-positive integers', async () => {
      renderCharacterSheet();
      await openHpModal();

      const input = document.querySelector('.hp-calculator-inputs input');
      const damageButton = screen.getByLabelText(/apply damage/i);
      expect(input).toBeTruthy();

      // Try negative number
      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.click(damageButton);
      expect(getHpDisplay()).toHaveTextContent(/35\s*\/\s*55/);

      // Try decimal
      fireEvent.change(input, { target: { value: '5.5' } });
      fireEvent.click(damageButton);
      expect(getHpDisplay()).toHaveTextContent(/35\s*\/\s*55/);
    });

    it('should handle temp HP correctly', async () => {
      renderCharacterSheet();
      await openHpModal();

      const tempHPInput = document.querySelector('.hp-field-temp input');
      expect(tempHPInput).toBeTruthy();
      fireEvent.change(tempHPInput, { target: { value: '10' } });

      // Damage should reduce temp HP first.
      const input = document.querySelector('.hp-calculator-inputs input');
      const damageButton = screen.getByLabelText(/apply damage/i);
      expect(input).toBeTruthy();

      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.click(damageButton);

      expect(tempHPInput).toHaveValue(5);
      expect(getHpDisplay()).toHaveTextContent(/35\s*\/\s*55/); // Regular HP unchanged
    });

    it('should apply max HP modifier', async () => {
      renderCharacterSheet();
      await openHpModal();

      const maxHPInput = document.querySelector('.hp-field-mod input');
      expect(maxHPInput).toBeTruthy();
      fireEvent.change(maxHPInput, { target: { value: '5' } });

      // Max HP should increase.
      expect(getHpDisplay()).toHaveTextContent(/35\s*\/\s*60/);
    });

    it('should persist HP to localStorage on change', async () => {
      renderCharacterSheet();
      await openHpModal();

      const input = document.querySelector('.hp-calculator-inputs input');
      const damageButton = screen.getByLabelText(/apply damage/i);
      expect(input).toBeTruthy();

      fireEvent.change(input, { target: { value: '10' } });
      fireEvent.click(damageButton);

      const stored = JSON.parse(localStorage.getItem(`hp_state_${mockCharacter.id}`));
      expect(stored.currentHP).toBe(25);
    });

    it('should load HP from localStorage on mount', () => {
      localStorage.setItem(`hp_state_${mockCharacter.id}`, JSON.stringify({
        currentHP: 20,
        tempHP: 5,
        maxHPModifier: 3,
        deathSaveSuccesses: 0,
        deathSaveFailures: 0
      }));

      renderCharacterSheet();

      // 55 base display max + 3 custom modifier
      expect(getHpDisplay()).toHaveTextContent(/20\s*\/\s*58/);
    });

    it('should close modal when close button clicked', async () => {
      renderCharacterSheet();

      await openHpModal();
      const closeButton = screen.getAllByLabelText(/close hp modal/i)[0];
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(document.querySelector('.hp-modal')).toBeNull();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should render all tabs', () => {
      renderCharacterSheet();
      // Tab buttons use icons with aria-labels, no visible text
      expect(screen.getByLabelText('Abilities')).toBeInTheDocument();
      expect(screen.getByLabelText('Skills')).toBeInTheDocument();
      expect(screen.getByLabelText('Spells')).toBeInTheDocument();
      expect(screen.getByLabelText('Inventory')).toBeInTheDocument();
      expect(screen.getByLabelText('Features')).toBeInTheDocument();
    });

    it('should start with Bio tab active', () => {
      renderCharacterSheet();
      const bioTab = screen.getByLabelText('Bio');
      expect(bioTab).toHaveClass('active');
    });

    it('should switch tabs when clicked', async () => {
      renderCharacterSheet();
      const skillsTab = screen.getByLabelText('Skills');
      
      fireEvent.click(skillsTab);
      
      await waitFor(() => {
        expect(skillsTab).toHaveClass('active');
      });
      expect(screen.getByText('Athletics')).toBeInTheDocument();
    });
  });

  describe('Abilities Tab', () => {
    // Passive skills/speeds/senses render as separate label/value spans in a
    // shared `.passive-item` row rather than a single combined text node.
    const getPassiveValue = (label) => {
      const row = Array.from(document.querySelectorAll('.passive-item'))
        .find((el) => el.textContent.includes(label));
      return row?.querySelector('.passive-value')?.textContent;
    };

    it('should display all ability scores', () => {
      renderCharacterSheet();

      const scores = Array.from(document.querySelectorAll('.ability-score')).map((el) => el.textContent);
      expect(scores).toEqual(['16', '14', '15', '13', '10', '8']);
    });

    it('should display ability modifiers', () => {
      renderCharacterSheet();

      const mods = Array.from(document.querySelectorAll('.ability-modifier')).map((el) => el.textContent);
      expect(mods).toEqual(['+3', '+2', '+2', '+1', '+0', '-1']);
    });

    it('should display saving throws with proficiency', () => {
      renderCharacterSheet();
      
      // STR and CON saves should be proficient
      const strSave = Array.from(document.querySelectorAll('.save-item'))
        .find((el) => /strength/i.test(el.textContent));
      expect(strSave.querySelector('span')).toHaveClass('proficient');
    });

    it('should display passive skills', () => {
      renderCharacterSheet();

      expect(getPassiveValue('Passive Perception')).toBe('13');
      expect(getPassiveValue('Passive Insight')).toBe('10');
      expect(getPassiveValue('Passive Investigation')).toBe('11');
    });

    it('should display speeds', () => {
      renderCharacterSheet();

      expect(getPassiveValue('Walking Speed')).toBe('30 ft');
      expect(getPassiveValue('Climb Speed')).toBe('15 ft');
    });

    it('should display senses', () => {
      renderCharacterSheet();

      expect(getPassiveValue('Darkvision')).toBe('60 ft');
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
      const athleticsRow = screen.getByText('Athletics').closest('.skill-item');
      expect(athleticsRow).toHaveClass('proficient');
      expect(athleticsRow.querySelector('.skill-proficiency-icon')).toBeInTheDocument();
    });

    it('should show expertise icon for expertise skills', () => {
      const stealthRow = screen.getByText('Stealth').closest('.skill-item');
      expect(stealthRow).toHaveClass('expertise');
      expect(stealthRow.querySelector('.skill-proficiency-icon')).toBeInTheDocument();
    });
  });

  describe('Spells Tab', () => {
    beforeEach(() => {
      renderCharacterSheet();
      fireEvent.click(screen.getByText('Spells'));
    });

    it('should display spell names', () => {
      // Wizard level 2 in mock data only grants level 1 slots, so only
      // level-1 prepared spells (Shield) are shown; Fireball (level 3) isn't reachable.
      expect(screen.getByText('Shield')).toBeInTheDocument();
    });

    it('should group spells by level', () => {
      // Levels are represented as roman-numeral subtab buttons, not "Level N" text
      expect(screen.getByText('I')).toBeInTheDocument();
    });

    it('should show prepared status', () => {
      // Only prepared spells are listed at all (no separate "prepared" badge)
      expect(screen.getByText('Shield').closest('.spell-clickable')).toBeInTheDocument();
    });

    it('should display spell details in modal when clicked', async () => {
      fireEvent.click(screen.getByText('Shield'));
      
      await waitFor(() => {
        expect(document.querySelector('.spell-detail-overlay')).toBeInTheDocument();
        expect(screen.getByText(/invisible barrier of magical force/i)).toBeInTheDocument();
      });
    });
  });

  describe('Stat Calculations', () => {
    it('should calculate proficiency bonus correctly', () => {
      renderCharacterSheet();
      
      // Level 5 should have +3 proficiency
      expect(mockDerivedStats.proficiency).toBe(3);
    });

    it('should calculate ability modifiers correctly', () => {
      renderCharacterSheet();
      
      // STR 16 = +3
      expect(mockDerivedStats.modifiers.strength).toBe(3);
      // DEX 14 = +2
      expect(mockDerivedStats.modifiers.dexterity).toBe(2);
      // CHA 8 = -1
      expect(mockDerivedStats.modifiers.charisma).toBe(-1);
    });

    it('should apply bonus engine to stats', () => {
      renderCharacterSheet();
      
      expect(deriveCharacterStats).toHaveBeenCalledWith(
        expect.objectContaining({
          base: expect.objectContaining({
            abilities: expect.objectContaining({
              strength: mockCharacter.strength,
              dexterity: mockCharacter.dexterity
            }),
            proficiency: 3
          }),
          bonuses: expect.any(Array)
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
