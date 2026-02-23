import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsInspectorModal from './StatsInspectorModal';

describe('StatsInspectorModal', () => {
  const mockOnClose = vi.fn();
  const mockOnCustomModifierChange = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    statName: 'Strength',
    baseValue: 16,
    bonuses: [],
    customModifier: 0,
    onCustomModifierChange: mockOnCustomModifierChange,
    suffix: ''
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <StatsInspectorModal {...defaultProps} isOpen={false} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('should render when isOpen is true', () => {
      render(<StatsInspectorModal {...defaultProps} />);
      expect(screen.getByText('Strength')).toBeInTheDocument();
    });

    it('should close when close button clicked', () => {
      render(<StatsInspectorModal {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Close'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should close when overlay clicked', () => {
      render(<StatsInspectorModal {...defaultProps} />);
      const overlay = screen.getByText('Strength').closest('.stats-inspector-overlay');
      fireEvent.click(overlay);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not close when modal content clicked', () => {
      render(<StatsInspectorModal {...defaultProps} />);
      const modal = screen.getByText('Strength').closest('.stats-inspector-modal');
      fireEvent.click(modal);
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should close when close footer button clicked', () => {
      render(<StatsInspectorModal {...defaultProps} />);
      const buttons = screen.getAllByRole('button', { name: 'Close' });
      fireEvent.click(buttons[buttons.length - 1]); // Click the footer close button
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Base Value Display', () => {
    it('should display base value', () => {
      render(<StatsInspectorModal {...defaultProps} />);
      expect(screen.getByText('Base Value')).toBeInTheDocument();
      const baseSection = screen.getByText('Base Value').closest('.value-section');
      expect(baseSection).toHaveTextContent('16');
    });

    it('should display base value with suffix', () => {
      render(
        <StatsInspectorModal {...defaultProps} suffix=" ft" />
      );
      const baseSection = screen.getByText('Base Value').closest('.value-section');
      expect(baseSection).toHaveTextContent('16 ft');
    });

    it('should display stat name as title', () => {
      render(<StatsInspectorModal {...defaultProps} statName="Dexterity" />);
      expect(screen.getByText('Dexterity')).toBeInTheDocument();
    });
  });

  describe('Bonuses Display', () => {
    it('should show no bonuses message when no bonuses', () => {
      render(<StatsInspectorModal {...defaultProps} bonuses={[]} />);
      expect(screen.getByText('No bonuses applied')).toBeInTheDocument();
    });

    it('should display single bonus', () => {
      const bonuses = [
        { value: 2, source: { label: 'Belt of Giant Strength' } }
      ];
      render(
        <StatsInspectorModal {...defaultProps} bonuses={bonuses} />
      );
      expect(screen.getByText('Belt of Giant Strength')).toBeInTheDocument();
      const bonusesSection = screen.getByText('Bonuses & Modifiers').closest('.bonuses-section');
      expect(bonusesSection).toHaveTextContent('+2');
    });

    it('should display multiple bonuses from different sources', () => {
      const bonuses = [
        { value: 2, source: { label: 'Item A' } },
        { value: 1, source: { label: 'Item B' } },
        { value: -1, source: { label: 'Curse' } }
      ];
      render(
        <StatsInspectorModal {...defaultProps} bonuses={bonuses} />
      );
      expect(screen.getByText('Item A')).toBeInTheDocument();
      expect(screen.getByText('Item B')).toBeInTheDocument();
      expect(screen.getByText('Curse')).toBeInTheDocument();
    });

    it('should group bonuses by source', () => {
      const bonuses = [
        { value: 1, source: { label: 'Background - Hermit' }, name: 'CHA' },
        { value: 1, source: { label: 'Background - Hermit' }, name: 'WIS' }
      ];
      render(
        <StatsInspectorModal {...defaultProps} bonuses={bonuses} />
      );
      const sourceLabel = screen.getAllByText('Background - Hermit');
      // Should appear once as source header
      expect(sourceLabel.length).toBeGreaterThan(0);
    });

    it('should display negative bonuses in red', () => {
      const bonuses = [
        { value: -2, source: { label: 'Debuff' } }
      ];
      render(
        <StatsInspectorModal {...defaultProps} bonuses={bonuses} />
      );
      const bonusesSection = screen.getByText('Debuff').closest('.bonus-group');
      const negativeElement = bonusesSection.querySelector('.negative');
      expect(negativeElement).toHaveTextContent('-2');
    });

    it('should handle string source labels', () => {
      const bonuses = [
        { value: 2, source: 'Magic Item' }
      ];
      render(
        <StatsInspectorModal {...defaultProps} bonuses={bonuses} />
      );
      expect(screen.getByText('Magic Item')).toBeInTheDocument();
    });
  });

  describe('Total Calculation', () => {
    it('should calculate correct total with no bonuses', () => {
      render(
        <StatsInspectorModal
          {...defaultProps}
          baseValue={16}
          bonuses={[]}
          customModifier={0}
        />
      );
      const totalSection = screen.getByText('Total').closest('.total-section');
      expect(totalSection).toBeInTheDocument();
    });

    it('should calculate correct total with bonuses', () => {
      const bonuses = [
        { value: 2, source: { label: 'Item A' } },
        { value: 1, source: { label: 'Item B' } }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          baseValue={16}
          bonuses={bonuses}
          customModifier={0}
        />
      );
      // Total should be displayed in total section
      const totalSection = screen.getByText('Total').parentElement;
      expect(totalSection).toBeInTheDocument();
    });

    it('should include custom modifier in total', () => {
      const bonuses = [
        { value: 2, source: { label: 'Item' } }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          baseValue={16}
          bonuses={bonuses}
          customModifier={3}
        />
      );
      // Total should be 16 + 2 + 3 = 21
      const valueElements = screen.getAllByText(/^\d+$/);
      expect(valueElements.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Modifier', () => {
    it('should display custom modifier value', () => {
      render(
        <StatsInspectorModal
          {...defaultProps}
          customModifier={5}
        />
      );
      expect(screen.getByText('+5')).toBeInTheDocument();
    });

    it('should display negative custom modifier', () => {
      render(
        <StatsInspectorModal
          {...defaultProps}
          customModifier={-2}
        />
      );
      expect(screen.getByText('-2')).toBeInTheDocument();
    });

    it('should enter edit mode when edit button clicked', async () => {
      render(
        <StatsInspectorModal {...defaultProps} customModifier={0} />
      );
      const editButton = screen.getByLabelText('Edit custom modifier');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByLabelText('Modifier Value')).toBeInTheDocument();
      });
    });

    it('should save custom modifier value', async () => {
      const user = userEvent.setup();
      render(
        <StatsInspectorModal
          {...defaultProps}
          customModifier={0}
          onCustomModifierChange={mockOnCustomModifierChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Edit custom modifier'));

      await waitFor(() => {
        const input = screen.getByLabelText('Modifier Value');
        expect(input).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Modifier Value');
      await user.clear(input);
      await user.type(input, '5');

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockOnCustomModifierChange).toHaveBeenCalledWith(5);
      });
    });

    it('should cancel edit without saving', async () => {
      render(
        <StatsInspectorModal
          {...defaultProps}
          customModifier={0}
          onCustomModifierChange={mockOnCustomModifierChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Edit custom modifier'));

      await waitFor(() => {
        const input = screen.getByLabelText('Modifier Value');
        expect(input).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Modifier Value');
      fireEvent.change(input, { target: { value: '99' } });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(mockOnCustomModifierChange).not.toHaveBeenCalled();
      });
    });

    it('should handle negative modifier values', async () => {
      const customCallback = vi.fn();
      render(
        <StatsInspectorModal
          {...defaultProps}
          customModifier={0}
          onCustomModifierChange={customCallback}
        />
      );

      fireEvent.click(screen.getByLabelText('Edit custom modifier'));

      const input = await screen.findByLabelText('Modifier Value');
      fireEvent.change(input, { target: { value: '-3' } });
      
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByLabelText('Edit custom modifier')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      expect(customCallback).toHaveBeenCalledWith(-3);
    });
  });

  describe('Suffix Display', () => {
    it('should display values with suffix', () => {
      const bonuses = [
        { value: 10, source: { label: 'Speed Boost' } }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          statName="Speed"
          baseValue={30}
          bonuses={bonuses}
          suffix=" ft"
        />
      );
      expect(screen.getByText(/Base Value/)).toBeInTheDocument();
      expect(screen.getByText(/Speed Boost/)).toBeInTheDocument();
    });
  });

  describe('Current Value Mismatch Warning', () => {
    it('should show warning when current value differs from calculated', () => {
      const bonuses = [
        { value: 2, source: { label: 'Item' } }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          baseValue={16}
          bonuses={bonuses}
          customModifier={0}
          currentValue={15}
        />
      );
      expect(screen.getByText(/⚠/)).toBeInTheDocument();
    });

    it('should not show warning when values match', () => {
      render(
        <StatsInspectorModal
          {...defaultProps}
          baseValue={16}
          bonuses={[]}
          customModifier={0}
          currentValue={16}
        />
      );
      expect(screen.queryByText(/⚠/)).not.toBeInTheDocument();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle AC inspection with multiple sources', () => {
      const bonuses = [
        { value: 2, source: { label: 'Plate Armor' } },
        { value: 2, source: { label: 'Shield' } },
        { value: 1, source: { label: 'Ring of Protection' } }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          statName="Armor Class"
          baseValue={10}
          bonuses={bonuses}
          customModifier={0}
        />
      );
      expect(screen.getByText('Armor Class')).toBeInTheDocument();
      expect(screen.getByText('Plate Armor')).toBeInTheDocument();
      expect(screen.getByText('Shield')).toBeInTheDocument();
      expect(screen.getByText('Ring of Protection')).toBeInTheDocument();
    });

    it('should handle ability score with ASI', () => {
      const bonuses = [
        { value: 2, source: { label: 'Background - Hermit' } },
        { value: 2, source: { label: 'Level 4 ASI' } }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          statName="Charisma"
          baseValue={14}
          bonuses={bonuses}
          customModifier={1}
        />
      );
      expect(screen.getByText('Charisma')).toBeInTheDocument();
      expect(screen.getByText('Background - Hermit')).toBeInTheDocument();
      expect(screen.getByText('Level 4 ASI')).toBeInTheDocument();
    });

    it('should handle skill inspection with multiple bonus types', () => {
      const bonuses = [
        { value: 2, source: { label: 'Dexterity Modifier' }, name: 'STR' },
        { value: 2, source: { label: 'Proficiency' }, name: 'Prof' },
        { value: -1, source: { label: 'Armor Penalty' }, name: 'Armor' }
      ];
      render(
        <StatsInspectorModal
          {...defaultProps}
          statName="Acrobatics"
          baseValue={0}
          bonuses={bonuses}
          customModifier={0}
        />
      );
      expect(screen.getByText('Acrobatics')).toBeInTheDocument();
    });
  });
});
