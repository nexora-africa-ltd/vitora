/**
 * usePermissions Hook
 * 
 * Provides role-based access control (RBAC) for patient identity editing
 * and other sensitive operations in the Vitora HMIS.
 * 
 * Permission Hierarchy:
 * - ADMIN role bypasses all permission checks
 * - Clinical roles (NURSE, DOCTOR) cannot edit patient identity by default
 * - Registration clerks can edit demographics with manage_patient_identity permission
 * - Billing clerks can create invoices but not clinical data
 * 
 * Usage:
 * ```tsx
 * const { canEditPatient, canEditIdentity, hasPermission } = usePermissions();
 * 
 * if (canEditPatient) {
 *   // Show edit button
 * }
 * ```
 */
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';

// =============================================================================
// Types
// =============================================================================

export interface PermissionsResult {
  /** Can edit patient medical/demographic info (not identity) */
  canEditPatient: boolean;
  /** Can edit patient identity (name, DOB, national_id) - more restricted */
  canEditIdentity: boolean;
  /** Can create new invoices */
  canCreateInvoice: boolean;
  /** Can create new encounters */
  canCreateEncounter: boolean;
  /** Can view sensitive patients (HIV, GBV, Mental Health) */
  canViewSensitive: boolean;
  /** Check for a specific permission by name */
  hasPermission: (permission: string) => boolean;
  /** User's role */
  role: string | null;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Roles that bypass permission checks */
const ADMIN_ROLES = ['ADMIN', 'SUPERUSER', 'SYSTEM_ADMIN'];

/** Clinical roles that should NOT edit patient identity */
const CLINICAL_ROLES = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST', 'LAB_TECHNICIAN'];

/** Roles that can edit patient identity */
const IDENTITY_EDIT_ROLES = ['ADMIN', 'SUPERUSER', 'REGISTRATION_CLERK', 'RECORDS_OFFICER'];

// =============================================================================
// Hook Implementation
// =============================================================================

export function usePermissions(): PermissionsResult {
  const { user, isAuthenticated } = useAuth();

  return useMemo(() => {
    // Unauthenticated users have no permissions
    if (!isAuthenticated || !user) {
      return {
        canEditPatient: false,
        canEditIdentity: false,
        canCreateInvoice: false,
        canCreateEncounter: false,
        canViewSensitive: false,
        hasPermission: () => false,
        role: null,
        isAuthenticated: false,
      };
    }

    const userRole = user.role || '';
    const userPermissions = user.permissions || [];
    const isAdmin = ADMIN_ROLES.includes(userRole);
    const isClinical = CLINICAL_ROLES.includes(userRole);
    const canEditIdentityByRole = IDENTITY_EDIT_ROLES.includes(userRole);

    /**
     * Check if user has a specific permission
     * Admin roles bypass this check
     */
    const hasPermission = (permission: string): boolean => {
      if (isAdmin) return true;
      return userPermissions.includes(permission);
    };

    /**
     * Can edit patient (medical info, demographics except identity)
     * Requires 'edit_patient' permission or admin role
     */
    const canEditPatient = isAdmin || hasPermission('edit_patient');

    /**
     * Can edit patient identity (name, DOB, national_id)
     * More restricted - requires 'manage_patient_identity' permission
     * - Admin roles: always allowed
     * - Clinical roles: only with explicit manage_patient_identity permission
     * - Non-clinical roles: allowed if in IDENTITY_EDIT_ROLES or has permission
     */
    const hasIdentityPermission = userPermissions.includes('manage_patient_identity');
    const canEditIdentity = isAdmin || hasIdentityPermission || (
      !isClinical && canEditIdentityByRole
    );

    /**
     * Can create invoices
     * Requires 'create_invoice' permission
     */
    const canCreateInvoice = isAdmin || hasPermission('create_invoice');

    /**
     * Can create encounters
     * Requires 'create_encounter' permission
     */
    const canCreateEncounter = isAdmin || hasPermission('create_encounter');

    /**
     * Can view sensitive patients (HIV, GBV, Mental Health)
     * Requires 'view_sensitive_patient' permission
     */
    const canViewSensitive = isAdmin || hasPermission('view_sensitive_patient');

    return {
      canEditPatient,
      canEditIdentity,
      canCreateInvoice,
      canCreateEncounter,
      canViewSensitive,
      hasPermission,
      role: userRole,
      isAuthenticated: true,
    };
  }, [user, isAuthenticated]);
}

// =============================================================================
// Exports
// =============================================================================

export default usePermissions;
