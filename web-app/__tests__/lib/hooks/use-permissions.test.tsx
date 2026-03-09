/**
 * Permission Hook Tests - RED Phase
 *
 * Tests for usePermissions hook that provides role-based access control
 * for patient identity editing and other sensitive operations.
 *
 * Acceptance Criteria:
 * - canEditPatient() checks for edit_patient permission
 * - canEditIdentity() checks for manage_patient_identity (more restricted)
 * - Admin role bypasses permission checks
 * - Clinical roles (NURSE, DOCTOR) cannot edit identity by default
 * - Registration clerks can edit demographics
 */
import React from 'react';
import { renderHook } from '@testing-library/react';

// Mock auth context
const mockUser = {
  id: 1,
  username: 'testuser',
  role: 'NURSE',
  permissions: ['view_patient'],
};

jest.mock('@/lib/auth/context', () => ({
  useAuth: jest.fn(() => ({ user: mockUser, isAuthenticated: true })),
}));

import { useAuth } from '@/lib/auth/context';

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// =============================================================================
// Test Suite
// =============================================================================

describe('usePermissions Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Basic Permission Checks
  // ===========================================================================
  describe('Basic Permission Checks', () => {
    it('should return canEditPatient = false when user lacks edit_patient permission', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, permissions: ['view_patient'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditPatient).toBe(false);
    });

    it('should return canEditPatient = true when user has edit_patient permission', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, permissions: ['view_patient', 'edit_patient'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditPatient).toBe(true);
    });

    it('should check for specific permission using hasPermission()', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, permissions: ['view_patient', 'create_encounter'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasPermission('view_patient')).toBe(true);
      expect(result.current.hasPermission('create_encounter')).toBe(true);
      expect(result.current.hasPermission('delete_patient')).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Identity Editing (More Restricted)
  // ===========================================================================
  describe('Identity Editing Permissions', () => {
    it('should return canEditIdentity = false for regular edit_patient permission', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, permissions: ['view_patient', 'edit_patient'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      // edit_patient allows editing medical info, but NOT identity (name, DOB, national_id)
      expect(result.current.canEditPatient).toBe(true);
      expect(result.current.canEditIdentity).toBe(false);
    });

    it('should return canEditIdentity = true only with manage_patient_identity permission', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, permissions: ['view_patient', 'edit_patient', 'manage_patient_identity'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditIdentity).toBe(true);
    });
  });

  // ===========================================================================
  // 3. Role-Based Overrides
  // ===========================================================================
  describe('Role-Based Overrides', () => {
    it('should grant all permissions to ADMIN role', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'ADMIN', permissions: [] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      // Admin bypasses permission checks
      expect(result.current.canEditPatient).toBe(true);
      expect(result.current.canEditIdentity).toBe(true);
      expect(result.current.hasPermission('any_permission')).toBe(true);
    });

    it('should deny identity editing to NURSE role by default', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'NURSE', permissions: ['view_patient', 'edit_patient'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditIdentity).toBe(false);
    });

    it('should deny identity editing to DOCTOR role by default', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'DOCTOR', permissions: ['view_patient', 'create_encounter', 'edit_patient'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditIdentity).toBe(false);
    });

    it('should allow identity editing to RECEPTIONIST role', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          ...mockUser,
          role: 'RECEPTIONIST',
          permissions: ['view_patient', 'edit_patient', 'manage_patient_identity']
        },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditIdentity).toBe(true);
    });
  });

  // ===========================================================================
  // 4. Billing Permissions
  // ===========================================================================
  describe('Billing Permissions', () => {
    it('should return canCreateInvoice based on create_invoice permission', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'BILLING_CLERK', permissions: ['view_patient', 'create_invoice'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canCreateInvoice).toBe(true);
    });

    it('should deny invoice creation to clinical staff', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'DOCTOR', permissions: ['view_patient', 'create_encounter'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canCreateInvoice).toBe(false);
    });
  });

  // ===========================================================================
  // 5. Encounter Permissions
  // ===========================================================================
  describe('Encounter Permissions', () => {
    it('should return canCreateEncounter for clinical staff', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'DOCTOR', permissions: ['view_patient', 'create_encounter'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canCreateEncounter).toBe(true);
    });

    it('should deny encounter creation to billing staff', async () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'BILLING_CLERK', permissions: ['view_patient', 'create_invoice'] },
        isAuthenticated: true,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canCreateEncounter).toBe(false);
    });
  });

  // ===========================================================================
  // 6. Unauthenticated Users
  // ===========================================================================
  describe('Unauthenticated Users', () => {
    it('should deny all permissions when not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
      } as any);

      const { usePermissions } = await import('@/lib/hooks/use-permissions');
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canEditPatient).toBe(false);
      expect(result.current.canEditIdentity).toBe(false);
      expect(result.current.canCreateInvoice).toBe(false);
      expect(result.current.canCreateEncounter).toBe(false);
      expect(result.current.hasPermission('any')).toBe(false);
    });
  });
});
