import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AbilityScoreInspector from './AbilityScoreInspector';

describe('AbilityScoreInspector', () => {
  const mockOnClose = vi.fn();
  const mockOnAddCustomModifier = vi.fn();
  const mockOnDeleteCustomModifier = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    ability: 'Strength',
    baseValue: 16,
    bonuses: [],
    customModifiers: [],
    onAddCustomModifier: mockOnAddCustomModifier,
    onDeleteCustomModifier: mockOnDeleteCustomModifier
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should render when isOpen is true', () => {
      render(<AbilityScoreInspector {...defaultProps} />);
      expect(screen.getByText('Strength')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      const { container } = render(
        <AbilityScoreInspector {...defaultProps} isOpen={false} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('should close when close button clicked', () => {
      render(<AbilityScoreInspector {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Base Value Display', () => {
    it('should display base value', () => {
      render(<AbilityScoreInspector {...defaultProps} />);
      expect(screen.getByText('Base Value')).toBeInTheDocument();
      const baseSection = screen.getByText('Base Value').closest('.value-section');
      expect(baseSection).toHaveTextContent('16');
    });

    it('should display default base value of 10 when not provided', () => {
      render(<AbilityScoreInspector {...defaultProps} baseValue={undefined} />);
      const baseSection = screen.getByText('Base Value').closest('.value-section');
      expect(baseSection).toHaveTextContent('10');
    });
  });

  describe('Bonuses Display', () => {
    it('should show no bonuses message when no bonuses', () => {
      render(<AbilityScoreInspector {...defaultProps} bonuses={[]} />);
      expect(screen.getByText('No bonuses applied')).toBeInTheDocument();
    });

    it('should display single bonus', () => {
      const bonuses = [
        { value: 2, source: { label: 'Belt of Giant Strength' } }
      ];
      render(
        <AbilityScoreInspector {...defaultProps} bonuses={bonuses} />
      );
      expect(screen.getByText('Belt of Giant Strength')).toBeInTheDocument();
      const bonusesSection = screen.getByText('Bonuses & Modifiers').closest('.bonuses-section');
      expect(bonusesSection).toHaveTextContent('+2');
    });

    it('should handle string source labels', () => {
      const bonuses = [
        { value: 2, source: 'Magic Item' }
      ];
      render(
        <AbilityScoreInspector {...defaultProps} bonuses={bonuses} />
      );
      expect(screen.getByText('Magic Item')).toBeInTheDocument();
    });
  });

  describe('Custom Modifiers', () => {
    it('should show Add button when no custom modifiers', () => {
      render(<AbilityScoreInspector {...defaultProps} customModifiers={[]} />);
      expect(screen.getByLabelText('Add custom modifier')).toBeInTheDocument();
    });

    it('should display existing custom modifiers', () => {
      const customModifiers = [
        { source: 'Feat', value: 1 },
        { source: 'Class Feature', value: 2 }
      ];
      render(
        <AbilityScoreInspector {...defaultProps} customModifiers={customModifiers} />
      );
      expect(screen.getByText('Feat')).toBeInTheDocument();
      expect(screen.getByText('Class Feature')).toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('should display negative custom modifiers', () => {
      const customModifiers = [
        { source: 'Curse', value: -2 }
      ];
      render(
        <AbilityScoreInspector {...defaultProps} customModifiers={customModifiers} />
      );
      expect(screen.getByText('Curse')).toBeInTheDocument();
      expect(screen.getByText('-2')).toBeInTheDocument();
    });

    it('should show add form when Add button clicked', () => {
      render(<AbilityScoreInspector {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Add custom modifier'));
      expect(screen.getByLabelText('Source')).toBeInTheDocument();
      expect(screen.getByLabelText('Value')).toBeInTheDocument();
    });

    it('should add custom modifier with source and value', async () => {
      const user = userEvent.setup();
      render(<AbilityScoreInspector {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Add custom modifier'));

      const sourceInput = screen.getByLabelText('Source');
      const valueInput = screen.getByLabelText('Value');

      await user.type(sourceInput, 'My Custom Mod');
      await user.type(valueInput, '3');

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnAddCustomModifier).toHaveBeenCalledWith({
          source: 'My Custom Mod',
          value: 3
        });
      });
    });

    it('should trim whitespace from source', async () => {
      const user = userEvent.setup();
      render(<AbilityScoreInspector {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Add custom modifier'));

      const sourceInput = screen.getByLabelText('Source');
      const valueInput = screen.getByLabelText('Value');

      await user.type(sourceInput, '  Trimmed Source  ');
      await user.type(valueInput, '2');

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnAddCustomModifier).toHaveBeenCalledWith({
          source: 'Trimmed Source',
          value: 2
        });
      });
    });

    it('should cancel add form without saving', async () => {
      render(<AbilityScoreInspector {...defaultProps} customModifiers={[]} />);

      fireEvent.click(screen.getByLabelText('Add custom modifier'));

      const sourceInput = screen.getByLabelText('Source');
      fireEvent.change(sourceInput, { target: { value: 'Cancelled' } });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(mockOnAddCustomModifier).not.toHaveBeenCalled();
      });
    });

    it('should delete custom modifier when x clicked', () => {
      const customModifiers = [
        { source: 'Feat', value: 1 },
        { source: 'Class Feature', value: 2 }
      ];
      render(
        <AbilityScoreInspector {...defaultProps} customModifiers={customModifiers} />
      );

      const deleteButtons = screen.getAllByLabelText(/Delete/);
      fireEvent.click(deleteButtons[0]);

      expect(mockOnDeleteCustomModifier).toHaveBeenCalledWith(0);
    });

    it('should handle negative modifier values', async () => {
      const user = userEvent.setup();
      render(<AbilityScoreInspector {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Add custom modifier'));

      const sourceInput = screen.getByLabelText('Source');
      const valueInput = screen.getByLabelText('Value');

      await user.type(sourceInput, 'Debuff');
      await user.type(valueInput, '-2');

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnAddCustomModifier).toHaveBeenCalledWith({
          source: 'Debuff',
          value: -2
        });
      });
    });
  });

  describe('Total Calculation', () => {
    it('should calculate total with no bonuses or modifiers', () => {
      render(
        <AbilityScoreInspector
          {...defaultProps}
          baseValue={16}
          bonuses={[]}
          customModifiers={[]}
        />
      );
      const totalSection = screen.getByText('Total').closest('.total-section');
      expect(totalSection).toHaveTextContent('16');
    });

    it('should include all custom modifiers in total', () => {
      const customModifiers = [
        { source: 'Feat', value: 1 },
        { source: 'Class Feature', value: 2 }
      ];
      render(
        <AbilityScoreInspector
          {...defaultProps}
          baseValue={16}
          bonuses={[]}
          customModifiers={customModifiers}
        />
      );
      // Total should be 16 + 1 + 2 = 19
      const totalSection = screen.getByText('Total').closest('.total-section');
      expect(totalSection).toHaveTextContent('19');
    });

    it('should include bonuses and custom modifiers in total', () => {
      const bonuses = [
        { value: 2, source: { label: 'Item A' } }
      ];
      const customModifiers = [
        { source: 'Feat', value: 1 }
      ];
      render(
        <AbilityScoreInspector
          {...defaultProps}
          baseValue={16}
          bonuses={bonuses}
          customModifiers={customModifiers}
        />
      );
      // Total should be 16 + 2 + 1 = 19
      const totalSection = screen.getByText('Total').closest('.total-section');
      expect(totalSection).toHaveTextContent('19');
    });

    it('should handle negative custom modifiers in total', () => {
      const customModifiers = [
        { source: 'Debuff', value: -3 }
      ];
      render(
        <AbilityScoreInspector
          {...defaultProps}
          baseValue={16}
          bonuses={[]}
          customModifiers={customModifiers}
        />
      );
      // Total should be 16 - 3 = 13
      const totalSection = screen.getByText('Total').closest('.total-section');
      expect(totalSection).toHaveTextContent('13');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle ability score with ASI, bonuses, and custom modifiers', () => {
      const bonuses = [
        { value: 2, source: { label: 'Background - Hermit' } }
      ];
      const customModifiers = [
        { source: 'Level 4 ASI', value: 2 },
        { source: 'Feat Bonus', value: 1 }
      ];
      render(
        <AbilityScoreInspector
          {...defaultProps}
          ability="Charisma"
          baseValue={14}
          bonuses={bonuses}
          customModifiers={customModifiers}
        />
      );
      expect(screen.getByText('Charisma')).toBeInTheDocument();
      expect(screen.getByText('Level 4 ASI')).toBeInTheDocument();
      expect(screen.getByText('Feat Bonus')).toBeInTheDocument();
      const totalSection = screen.getByText('Total').closest('.total-section');
      // Total should be 14 + 2 + 2 + 1 = 19
      expect(totalSection).toHaveTextContent('19');
    });
  });

  describe('Override Functionality', () => {
    const mockOnSetCustomOverride = vi.fn();

    it('should display override section', () => {
      render(
        <AbilityScoreInspector
          {...defaultProps}
          customOverride={null}
          onSetCustomOverride={mockOnSetCustomOverride}
        />
      );
      expect(screen.getByText('Override')).toBeInTheDocument();
    });

    it('should display current override value when set', () => {
      render(
        <AbilityScoreInspector
          {...defaultProps}
          customOverride={20}
          onSetCustomOverride={mockOnSetCustomOverride}
        />
      );
      expect(screen.getByText('Current Override:')).toBeInTheDocument();
      const overrideDisplay = screen.getByText('Current Override:').closest('.override-display');
      expect(overrideDisplay).toHaveTextContent('20');
    });

    it('should show override in total instead of calculated value', () => {
      const bonuses = [{ value: 2, source: 'Bonus' }];
      const customModifiers = [{ source: 'Modifier', value: 3 }];
      render(
        <AbilityScoreInspector
          {...defaultProps}
          baseValue={12}
          bonuses={bonuses}
          customModifiers={customModifiers}
          customOverride={18}
          onSetCustomOverride={mockOnSetCustomOverride}
        />
      );
      // Without override: 12 + 2 + 3 = 17, but with override = 18
      const totalSection = screen.getByText('Total').closest('.total-section');
      expect(totalSection).toHaveTextContent('18');
    });

    it('should call onSetCustomOverride when override is set', async () => {
      const user = userEvent.setup();
      render(
        <AbilityScoreInspector
          {...defaultProps}
          customOverride={null}
          onSetCustomOverride={mockOnSetCustomOverride}
        />
      );
      
      const editButton = screen.getByLabelText('Set override value');
      await user.click(editButton);
      
      const input = screen.getByLabelText('Override Value');
      await user.type(input, '19');
      
      const saveButton = screen.getByText('Save');
      await user.click(saveButton);
      
      expect(mockOnSetCustomOverride).toHaveBeenCalledWith(19);
    });

    it('should call onSetCustomOverride(null) when override is cleared', async () => {
      const user = userEvent.setup();
      render(
        <AbilityScoreInspector
          {...defaultProps}
          customOverride={18}
          onSetCustomOverride={mockOnSetCustomOverride}
        />
      );
      
      const editButton = screen.getByLabelText('Edit override value');
      await user.click(editButton);
      
      const clearButton = screen.getByText('Clear');
      await user.click(clearButton);
      
      expect(mockOnSetCustomOverride).toHaveBeenCalledWith(null);
    });
  });
});
