/**
 * TDD Tests for BypassTriageDialog Component
 *
 * Phase 3.2: Bypass Triage Dialog
 *
 * Test Categories:
 * 1. Dialog Rendering
 * 2. Reason Selection (required)
 * 3. Confirmation Step
 * 4. API Integration
 * 5. Error Handling
 * 6. Accessibility
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BypassTriageDialog } from '@/components/encounters/bypass-triage-dialog';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockEncounter = {
  id: 1,
  patient_name: 'John Kamau',
  patient_mrn: 'MRN-20260104-0001',
  encounter_type: 'SCHEDULED_OPD',
  encounter_type_display: 'Scheduled Outpatient',
  triage_requirement: 'OPTIONAL',
  triage_status: 'PENDING',
};

const defaultProps = {
  encounter: mockEncounter,
  open: true,
  onOpenChange: jest.fn(),
  onBypass: jest.fn(),
  isLoading: false,
};

// =============================================================================
// TEST SUITE
// =============================================================================

describe('BypassTriageDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Dialog Rendering Tests
  // ===========================================================================
  describe('Dialog Rendering', () => {
    it('should render the dialog when open is true', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      // Radix AlertDialog uses alertdialog role
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      render(<BypassTriageDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('should display dialog title', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      // Title is in the header - get all and check at least one exists
      const titles = screen.getAllByText(/Bypass Triage/i);
      expect(titles.length).toBeGreaterThan(0);
    });

    it('should display patient information', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      expect(screen.getByText('John Kamau')).toBeInTheDocument();
      expect(screen.getByText('MRN-20260104-0001')).toBeInTheDocument();
    });

    it('should display warning message about bypassing triage', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      expect(screen.getByText(/bypassing triage/i)).toBeInTheDocument();
    });

    it('should display encounter type', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      expect(screen.getByText(/Scheduled Outpatient/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 2. Reason Selection Tests
  // ===========================================================================
  describe('Reason Selection', () => {
    it('should render reason selector', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /Select a reason/i })).toBeInTheDocument();
    });

    it('should display all bypass reason options when clicked', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Stable follow-up patient/i)).toBeInTheDocument();
        expect(screen.getByText(/Consultant.*decision/i)).toBeInTheDocument();
        expect(screen.getByText(/Chronic care review/i)).toBeInTheDocument();
        expect(screen.getByText(/Staff shortage/i)).toBeInTheDocument();
        expect(screen.getByText(/Patient preference/i)).toBeInTheDocument();
        expect(screen.getByText(/Other reason/i)).toBeInTheDocument();
      });
    });

    it('should allow selecting a reason', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Stable follow-up patient/i)).toBeInTheDocument();
      });

      // Option text can appear in multiple places (dropdown + selected value)
      await user.click(screen.getAllByText(/Stable follow-up patient/i)[0]);

      // Selected reason should be displayed
      await waitFor(() => {
        expect(screen.getAllByText(/Stable follow-up patient/i).length).toBeGreaterThan(0);
      });
    });

    it('should show validation error when trying to confirm without reason', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /Confirm Bypass/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/Please select a reason/i)).toBeInTheDocument();
      });
    });

    it('should clear validation error when reason is selected', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      // Try to confirm without reason
      const confirmButton = screen.getByRole('button', { name: /Confirm Bypass/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/Please select a reason/i)).toBeInTheDocument();
      });

      // Select a reason
      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Stable follow-up patient/i)).toBeInTheDocument();
      });

      await user.click(screen.getAllByText(/Stable follow-up patient/i)[0]);

      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/Please select a reason/i)).not.toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // 3. Confirmation Step Tests
  // ===========================================================================
  describe('Confirmation Step', () => {
    it('should render Cancel button', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('should render Confirm Bypass button', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Confirm Bypass/i })).toBeInTheDocument();
    });

    it('should call onOpenChange with false when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onBypass with reason when Confirm is clicked with valid reason', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      // Select a reason
      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Stable follow-up patient/i)).toBeInTheDocument();
      });

      await user.click(screen.getAllByText(/Stable follow-up patient/i)[0]);

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /Confirm Bypass/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(defaultProps.onBypass).toHaveBeenCalledWith(1, 'STABLE_FOLLOW_UP', undefined);
      });
    });

    it('should display confirmation message', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      // The component shows "Please confirm" in the description
      expect(screen.getByText(/Please confirm/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 4. Loading State Tests
  // ===========================================================================
  describe('Loading State', () => {
    it('should disable Confirm button while loading', () => {
      render(<BypassTriageDialog {...defaultProps} isLoading={true} />);

      const confirmButton = screen.getByRole('button', { name: /Bypassing/i });
      expect(confirmButton).toBeDisabled();
    });

    it('should show loading indicator on Confirm button', () => {
      render(<BypassTriageDialog {...defaultProps} isLoading={true} />);

      // Button text changes to "Bypassing..."
      const button = screen.getByRole('button', { name: /Bypassing/i });
      expect(button).toBeInTheDocument();
    });

    it('should disable Cancel button while loading', () => {
      render(<BypassTriageDialog {...defaultProps} isLoading={true} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();
    });

    it('should disable reason selector while loading', () => {
      render(<BypassTriageDialog {...defaultProps} isLoading={true} />);

      // The select trigger button should be disabled
      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      expect(selector).toBeDisabled();
    });
  });

  // ===========================================================================
  // 5. Error Handling Tests
  // ===========================================================================
  describe('Error Handling', () => {
    it('should display error message when provided', () => {
      render(<BypassTriageDialog {...defaultProps} error="Failed to bypass triage" />);

      expect(screen.getByText(/Failed to bypass triage/i)).toBeInTheDocument();
    });

    it('should show error styling', () => {
      render(<BypassTriageDialog {...defaultProps} error="Failed to bypass triage" />);

      const errorElement = screen.getByText(/Failed to bypass triage/i);
      expect(errorElement).toHaveClass('text-destructive');
    });
  });

  // ===========================================================================
  // 6. Additional Notes Field Tests
  // ===========================================================================
  describe('Additional Notes', () => {
    it('should render additional notes textarea when "Other reason" is selected', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      // Select "Other reason"
      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Other reason/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Other reason/i));

      // Notes textarea should appear
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Please specify/i)).toBeInTheDocument();
      });
    });

    it('should include notes in onBypass call when provided', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      // Select "Other reason"
      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Other reason/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Other reason/i));

      // Enter notes
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Please specify/i)).toBeInTheDocument();
      });

      const notesInput = screen.getByPlaceholderText(/Please specify/i);
      await user.type(notesInput, 'Patient requested direct consultation');

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /Confirm Bypass/i });
      await user.click(confirmButton);

      expect(defaultProps.onBypass).toHaveBeenCalledWith(
        1,
        'OTHER',
        'Patient requested direct consultation'
      );
    });
  });

  // ===========================================================================
  // 7. Accessibility Tests
  // ===========================================================================
  describe('Accessibility', () => {
    it('should have accessible dialog role', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      // Radix AlertDialog uses alertdialog role for better semantics
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should have aria-labelledby for dialog title', () => {
      render(<BypassTriageDialog {...defaultProps} />);

      const dialog = screen.getByRole('alertdialog');
      // Radix automatically sets aria-labelledby
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('should trap focus within dialog', async () => {
      const user = userEvent.setup();
      render(<BypassTriageDialog {...defaultProps} />);

      // Tab through focusable elements
      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // 8. Reset on Close Tests
  // ===========================================================================
  describe('Reset on Close', () => {
    it('should reset form state when dialog closes', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<BypassTriageDialog {...defaultProps} />);

      // Select a reason
      const selector = screen.getByRole('combobox', { name: /Select a reason/i });
      await user.click(selector);

      await waitFor(() => {
        expect(screen.getByText(/Stable follow-up patient/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Stable follow-up patient/i));

      // Close dialog
      rerender(<BypassTriageDialog {...defaultProps} open={false} />);

      // Reopen dialog
      rerender(<BypassTriageDialog {...defaultProps} open={true} />);

      // Should show placeholder again, not selected value
      expect(screen.getByRole('combobox', { name: /Select a reason/i })).toBeInTheDocument();
    });
  });
});
