import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatsInspectorModal from './StatsInspectorModal';

describe('StatsInspectorModal - Bare Bones Modal', () => {
  const mockOnClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    title: 'Strength'
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
  });

  describe('Content Rendering', () => {
    it('should render children content', () => {
      render(
        <StatsInspectorModal {...defaultProps}>
          <div>Test Content</div>
        </StatsInspectorModal>
      );
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should render footer when provided', () => {
      render(
        <StatsInspectorModal 
          {...defaultProps}
          footer={<div>Footer Content</div>}
        >
          <div>Test Content</div>
        </StatsInspectorModal>
      );
      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should not render footer when not provided', () => {
      const { container } = render(
        <StatsInspectorModal {...defaultProps}>
          <div>Test Content</div>
        </StatsInspectorModal>
      );
      const footer = container.querySelector('.inspector-sticky-footer');
      expect(footer).not.toBeInTheDocument();
    });

    it('should display title correctly', () => {
      render(<StatsInspectorModal {...defaultProps} title="Dexterity" />);
      expect(screen.getByText('Dexterity')).toBeInTheDocument();
    });

    it('should render multiple children sections', () => {
      render(
        <StatsInspectorModal {...defaultProps}>
          <section>Section 1</section>
          <section>Section 2</section>
        </StatsInspectorModal>
      );
      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('should handle missing optional footer', () => {
      const { container } = render(
        <StatsInspectorModal 
          isOpen={true}
          onClose={vi.fn()}
          title="Test"
        >
          <div>Content</div>
        </StatsInspectorModal>
      );
      expect(container.querySelector('.inspector-sticky-footer')).not.toBeInTheDocument();
    });

    it('should display footer container when footer prop exists', () => {
      const { container } = render(
        <StatsInspectorModal 
          isOpen={true}
          onClose={vi.fn()}
          title="Test"
          footer={<div>Footer</div>}
        />
      );
      expect(container.querySelector('.inspector-sticky-footer')).toBeInTheDocument();
    });
  });
});
