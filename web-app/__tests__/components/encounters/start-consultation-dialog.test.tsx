/**
 * TDD Tests for StartConsultationDialog Component
 *
 * Phase 3.4: Start Consultation
 *
 * Test Categories:
 * 1. Dialog Rendering
 * 2. Patient Information Display
 * 3. Confirmation Actions
 * 4. API Integration
 * 5. Navigation
 * 6. Loading & Error States
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { StartConsultationDialog } from '@/components/encounters/start-consultation-dialog';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.Mock;

// =============================================================================
// TEST DATA
// =============================================================================

const mockQueueItem = {
  id: 1,
  patient_id: 101,
  patient_name: 'John Kamau',
  patient_mrn: 'MRN-20260104-0001',
  patient_age: 45,
  patient_gender: 'M' as const,
  encounter_type: 'OPD',
  encounter_type_display: 'Outpatient Department',
  chief_complaint: 'Headache and fever for 3 days',
  triage_status: 'COMPLETED' as const,
  triage_category: 'YELLOW' as const,
  triage_bypass_reason: null,
  consultation_status: 'CALLED' as const,
  arrival_time: new Date().toISOString(),
  triage_completed_at: new Date().toISOString(),
  wait_time_minutes: 30,
  called_at: new Date().toISOString(),
};

const defaultProps = {
  queueItem: mockQueueItem,
  open: true,
  onOpenChange: jest.fn(),
  onStartConsultation: jest.fn(),
  isLoading: false,
};

// =============================================================================
// TEST SUITE
// =============================================================================

describe('StartConsultationDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
    });
  });

  // ===========================================================================
  // 1. Dialog Rendering Tests
  // ===========================================================================
  describe('Dialog Rendering', () => {
    it('should render the dialog when open is true', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      render(<StartConsultationDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('should display dialog title', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      // Title appears multiple times (header + button), so check for multiple
      const titles = screen.getAllByText(/Start Consultation/i);
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    it('should display confirmation message', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText(/begin.*consultation/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 2. Patient Information Display Tests
  // ===========================================================================
  describe('Patient Information Display', () => {
    it('should display patient name', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText('John Kamau')).toBeInTheDocument();
    });

    it('should display patient MRN', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText('MRN-20260104-0001')).toBeInTheDocument();
    });

    it('should display chief complaint', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText(/Headache and fever/i)).toBeInTheDocument();
    });

    it('should display triage category badge', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText('YELLOW')).toBeInTheDocument();
    });

    it('should display wait time', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText(/30.*min/i)).toBeInTheDocument();
    });

    it('should display encounter type', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByText(/Outpatient Department/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 3. Confirmation Actions Tests
  // ===========================================================================
  describe('Confirmation Actions', () => {
    it('should render Cancel button', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('should render Start Consultation button', () => {
      render(<StartConsultationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Start Consultation/i })).toBeInTheDocument();
    });

    it('should call onOpenChange with false when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<StartConsultationDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onStartConsultation when Start is clicked', async () => {
      const user = userEvent.setup();
      render(<StartConsultationDialog {...defaultProps} />);

      const startButton = screen.getByRole('button', { name: /Start Consultation/i });
      await user.click(startButton);

      expect(defaultProps.onStartConsultation).toHaveBeenCalledWith(1);
    });
  });

  // ===========================================================================
  // 4. Loading State Tests
  // ===========================================================================
  describe('Loading State', () => {
    it('should disable Start button while loading', () => {
      render(<StartConsultationDialog {...defaultProps} isLoading={true} />);

      const startButton = screen.getByRole('button', { name: /Starting/i });
      expect(startButton).toBeDisabled();
    });

    it('should show loading indicator on Start button', () => {
      render(<StartConsultationDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByText(/Starting/i)).toBeInTheDocument();
    });

    it('should disable Cancel button while loading', () => {
      render(<StartConsultationDialog {...defaultProps} isLoading={true} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();
    });
  });

  // ===========================================================================
  // 5. Error Handling Tests
  // ===========================================================================
  describe('Error Handling', () => {
    it('should display error message when provided', () => {
      render(<StartConsultationDialog {...defaultProps} error="Failed to start consultation" />);

      expect(screen.getByText(/Failed to start consultation/i)).toBeInTheDocument();
    });

    it('should show error styling', () => {
      render(<StartConsultationDialog {...defaultProps} error="Failed to start consultation" />);

      const errorElement = screen.getByText(/Failed to start consultation/i);
      expect(errorElement).toHaveClass('text-destructive');
    });
  });

  // ===========================================================================
  // 6. Navigation Tests
  // ===========================================================================
  describe('Navigation', () => {
    it('should navigate to encounter edit page on success', async () => {
      const user = userEvent.setup();
      const onStartConsultation = jest.fn().mockResolvedValue({ id: 1 });

      render(
        <StartConsultationDialog
          {...defaultProps}
          onStartConsultation={onStartConsultation}
          navigateOnSuccess={true}
        />
      );

      const startButton = screen.getByRole('button', { name: /Start Consultation/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/encounters/1/edit');
      });
    });

    it('should not navigate when navigateOnSuccess is false', async () => {
      const user = userEvent.setup();
      const onStartConsultation = jest.fn().mockResolvedValue({ id: 1 });

      render(
        <StartConsultationDialog
          {...defaultProps}
          onStartConsultation={onStartConsultation}
          navigateOnSuccess={false}
        />
      );

      const startButton = screen.getByRole('button', { name: /Start Consultation/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(onStartConsultation).toHaveBeenCalled();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 7. Bypassed Patient Display Tests
  // ===========================================================================
  describe('Bypassed Patient Display', () => {
    it('should show bypass reason for bypassed patients', () => {
      const bypassedItem = {
        ...mockQueueItem,
        triage_status: 'BYPASSED' as const,
        triage_category: null,
        triage_bypass_reason: 'STABLE_FOLLOW_UP' as const,
      };

      render(<StartConsultationDialog {...defaultProps} queueItem={bypassedItem} />);

      expect(screen.getByText(/Bypassed/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 8. Direct Patient Display Tests
  // ===========================================================================
  describe('Direct Patient Display', () => {
    it('should show direct badge for NOT_APPLICABLE triage', () => {
      const directItem = {
        ...mockQueueItem,
        triage_status: 'NOT_APPLICABLE' as const,
        triage_category: null,
      };

      render(<StartConsultationDialog {...defaultProps} queueItem={directItem} />);

      expect(screen.getByText(/Direct/i)).toBeInTheDocument();
    });
  });
});
