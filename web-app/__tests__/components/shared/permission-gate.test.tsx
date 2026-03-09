/**
 * PermissionGate Component Tests
 *
 * Tests the declarative permission gate used to hide/show
 * action buttons based on RBAC module, action, and permission checks.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PermissionGate } from '@/components/shared/permission-gate';

// --- Mock setup ---

const mockCanAccessModule = jest.fn(() => true);
const mockCanPerformAction = jest.fn(() => true);
const mockHasPermission = jest.fn(() => true);

jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canAccessModule: mockCanAccessModule,
    canPerformAction: mockCanPerformAction,
    hasPermission: mockHasPermission,
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

describe('PermissionGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessModule.mockReturnValue(true);
    mockCanPerformAction.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
  });

  // =========================================================================
  // Module gating
  // =========================================================================
  describe('module gating', () => {
    it('renders children when user has module access', () => {
      render(
        <PermissionGate module="pharmacy">
          <button>Dispense</button>
        </PermissionGate>
      );
      expect(screen.getByText('Dispense')).toBeInTheDocument();
      expect(mockCanAccessModule).toHaveBeenCalledWith('pharmacy');
    });

    it('hides children when user lacks module access', () => {
      mockCanAccessModule.mockReturnValue(false);
      render(
        <PermissionGate module="pharmacy">
          <button>Dispense</button>
        </PermissionGate>
      );
      expect(screen.queryByText('Dispense')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Action gating
  // =========================================================================
  describe('action gating', () => {
    it('renders children when user can perform action', () => {
      render(
        <PermissionGate action="pharmacy.dispense">
          <button>Confirm Dispense</button>
        </PermissionGate>
      );
      expect(screen.getByText('Confirm Dispense')).toBeInTheDocument();
      expect(mockCanPerformAction).toHaveBeenCalledWith('pharmacy.dispense');
    });

    it('hides children when user cannot perform action', () => {
      mockCanPerformAction.mockReturnValue(false);
      render(
        <PermissionGate action="pharmacy.dispense">
          <button>Confirm Dispense</button>
        </PermissionGate>
      );
      expect(screen.queryByText('Confirm Dispense')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Permission gating
  // =========================================================================
  describe('permission gating', () => {
    it('renders children when user has permission', () => {
      render(
        <PermissionGate permission="edit_patient">
          <button>Edit</button>
        </PermissionGate>
      );
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('hides children when user lacks permission', () => {
      mockHasPermission.mockReturnValue(false);
      render(
        <PermissionGate permission="delete_patient">
          <button>Delete</button>
        </PermissionGate>
      );
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Custom fallback
  // =========================================================================
  describe('fallback', () => {
    it('renders custom fallback when access denied', () => {
      mockCanPerformAction.mockReturnValue(false);
      render(
        <PermissionGate action="billing.void_invoice" fallback={<span>Contact admin</span>}>
          <button>Void Invoice</button>
        </PermissionGate>
      );
      expect(screen.queryByText('Void Invoice')).not.toBeInTheDocument();
      expect(screen.getByText('Contact admin')).toBeInTheDocument();
    });

    it('renders nothing (null) by default when denied', () => {
      mockCanPerformAction.mockReturnValue(false);
      const { container } = render(
        <PermissionGate action="billing.void_invoice">
          <button>Void Invoice</button>
        </PermissionGate>
      );
      expect(container.innerHTML).toBe('');
    });
  });

  // =========================================================================
  // Combined gates
  // =========================================================================
  describe('combined gates', () => {
    it('renders when both module and action pass', () => {
      render(
        <PermissionGate module="pharmacy" action="pharmacy.dispense">
          <button>Dispense</button>
        </PermissionGate>
      );
      expect(screen.getByText('Dispense')).toBeInTheDocument();
    });

    it('hides when module passes but action fails', () => {
      mockCanPerformAction.mockReturnValue(false);
      render(
        <PermissionGate module="pharmacy" action="pharmacy.dispense">
          <button>Dispense</button>
        </PermissionGate>
      );
      expect(screen.queryByText('Dispense')).not.toBeInTheDocument();
    });

    it('hides when module fails even if action would pass', () => {
      mockCanAccessModule.mockReturnValue(false);
      render(
        <PermissionGate module="pharmacy" action="pharmacy.dispense">
          <button>Dispense</button>
        </PermissionGate>
      );
      expect(screen.queryByText('Dispense')).not.toBeInTheDocument();
    });
  });
});
