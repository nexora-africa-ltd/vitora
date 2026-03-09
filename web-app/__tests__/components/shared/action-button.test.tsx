/**
 * ActionButton Component Tests
 *
 * Tests the permission-aware button that auto-hides when the current
 * user lacks the specified action permission.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionButton } from '@/components/shared/action-button';

// --- Mock setup ---

const mockCanPerformAction = jest.fn(() => true);

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canAccessModule: jest.fn(() => true),
    canPerformAction: mockCanPerformAction,
    hasPermission: jest.fn(() => true),
    canEditPatient: true,
    canEditIdentity: false,
    canCreateInvoice: true,
    canCreateEncounter: true,
    canViewSensitive: false,
    role: 'DOCTOR',
    roleCategory: 'CLINICAL',
    isAuthenticated: true,
    isSuperuser: false,
  }),
}));

describe('ActionButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanPerformAction.mockReturnValue(true);
  });

  // =========================================================================
  // Rendering
  // =========================================================================
  describe('rendering', () => {
    it('renders button when user can perform the action', () => {
      render(
        <ActionButton action="inpatient.discharge" onClick={jest.fn()}>
          Discharge Patient
        </ActionButton>
      );
      expect(screen.getByRole('button', { name: 'Discharge Patient' })).toBeInTheDocument();
      expect(mockCanPerformAction).toHaveBeenCalledWith('inpatient.discharge');
    });

    it('hides button when user cannot perform the action', () => {
      mockCanPerformAction.mockReturnValue(false);
      const { container } = render(
        <ActionButton action="inpatient.discharge" onClick={jest.fn()}>
          Discharge Patient
        </ActionButton>
      );
      expect(screen.queryByRole('button', { name: 'Discharge Patient' })).not.toBeInTheDocument();
      expect(container.innerHTML).toBe('');
    });

    it('renders fallback when user lacks permission', () => {
      mockCanPerformAction.mockReturnValue(false);
      render(
        <ActionButton
          action="billing.void_invoice"
          fallback={<span>Contact supervisor</span>}
        >
          Void Invoice
        </ActionButton>
      );
      expect(screen.queryByRole('button', { name: 'Void Invoice' })).not.toBeInTheDocument();
      expect(screen.getByText('Contact supervisor')).toBeInTheDocument();
    });

    it('renders nothing (no fallback) by default when denied', () => {
      mockCanPerformAction.mockReturnValue(false);
      const { container } = render(
        <ActionButton action="billing.void_invoice">
          Void Invoice
        </ActionButton>
      );
      expect(container.innerHTML).toBe('');
    });
  });

  // =========================================================================
  // Button props pass-through
  // =========================================================================
  describe('button props pass-through', () => {
    it('passes variant and size to the underlying Button', () => {
      render(
        <ActionButton action="pharmacy.dispense" variant="outline" size="sm">
          Dispense
        </ActionButton>
      );
      const button = screen.getByRole('button', { name: 'Dispense' });
      expect(button).toBeInTheDocument();
      // outline variant applies border classes
      expect(button.className).toContain('border');
    });

    it('passes className to the button', () => {
      render(
        <ActionButton action="pharmacy.dispense" className="w-full justify-start">
          Dispense
        </ActionButton>
      );
      const button = screen.getByRole('button', { name: 'Dispense' });
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('justify-start');
    });

    it('passes disabled prop to the button', () => {
      render(
        <ActionButton action="pharmacy.dispense" disabled>
          Dispense
        </ActionButton>
      );
      expect(screen.getByRole('button', { name: 'Dispense' })).toBeDisabled();
    });

    it('fires onClick when clicked', () => {
      const handleClick = jest.fn();
      render(
        <ActionButton action="laboratory.collect_sample" onClick={handleClick}>
          Collect Sample
        </ActionButton>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Collect Sample' }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Action key checking
  // =========================================================================
  describe('action key checking', () => {
    it('checks the correct action key for pharmacy', () => {
      render(
        <ActionButton action="pharmacy.dispense">Dispense</ActionButton>
      );
      expect(mockCanPerformAction).toHaveBeenCalledWith('pharmacy.dispense');
    });

    it('checks the correct action key for laboratory', () => {
      render(
        <ActionButton action="laboratory.verify_results">Verify</ActionButton>
      );
      expect(mockCanPerformAction).toHaveBeenCalledWith('laboratory.verify_results');
    });

    it('checks the correct action key for billing', () => {
      render(
        <ActionButton action="billing.record_payment">Pay</ActionButton>
      );
      expect(mockCanPerformAction).toHaveBeenCalledWith('billing.record_payment');
    });

    it('checks the correct action key for encounters', () => {
      render(
        <ActionButton action="encounters.prescribe">Prescribe</ActionButton>
      );
      expect(mockCanPerformAction).toHaveBeenCalledWith('encounters.prescribe');
    });
  });

  // =========================================================================
  // Unauthenticated users
  // =========================================================================
  describe('unauthenticated users', () => {
    it('hides button when user is not authenticated', async () => {
      // Re-mock with isAuthenticated = false
      jest.resetModules();
      jest.doMock('@/lib/hooks/use-permissions', () => ({
        usePermissions: () => ({
          canPerformAction: jest.fn(() => true),
          isAuthenticated: false,
        }),
      }));

      const { ActionButton: UnauthButton } = await import(
        '@/components/shared/action-button'
      );
      const { container } = render(
        <UnauthButton action="inpatient.discharge">
          Discharge
        </UnauthButton>
      );
      expect(container.innerHTML).toBe('');
    });

    it('shows fallback for unauthenticated users', async () => {
      jest.resetModules();
      jest.doMock('@/lib/hooks/use-permissions', () => ({
        usePermissions: () => ({
          canPerformAction: jest.fn(() => true),
          isAuthenticated: false,
        }),
      }));

      const { ActionButton: UnauthButton } = await import(
        '@/components/shared/action-button'
      );
      render(
        <UnauthButton
          action="inpatient.discharge"
          fallback={<span>Login required</span>}
        >
          Discharge
        </UnauthButton>
      );
      expect(screen.queryByRole('button', { name: 'Discharge' })).not.toBeInTheDocument();
      expect(screen.getByText('Login required')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Children rendering
  // =========================================================================
  describe('children rendering', () => {
    it('renders icon + text children correctly', () => {
      render(
        <ActionButton action="inpatient.discharge">
          <span data-testid="icon">🏥</span>
          Discharge
        </ActionButton>
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Discharge')).toBeInTheDocument();
    });
  });
});
