/**
 * usePermissions Hook
 *
 * Two-layer RBAC for Vitora HMIS:
 *
 * Layer 1 – Module Access (navigation visibility):
 *   canAccessModule('pharmacy')  → checks Django permission via MODULE_PERMISSIONS
 *
 * Layer 2 – Action Permissions (button/feature visibility):
 *   canPerformAction('pharmacy.dispense') → checks role against ACTION_PERMISSIONS
 *
 * Also preserves legacy convenience booleans (canEditPatient, canCreateInvoice, …)
 * and a generic hasPermission() for ad-hoc checks.
 *
 * Permission Hierarchy:
 * - Superusers (is_superuser=true) bypass all checks
 * - ADMIN roles bypass all checks
 * - Other users checked against permissions list / role
 *
 * Usage:
 * ```tsx
 * const { canAccessModule, canPerformAction, hasPermission } = usePermissions();
 *
 * // Sidebar filtering
 * if (canAccessModule('pharmacy')) { /* show nav item *\/ }
 *
 * // Action gating
 * if (canPerformAction('pharmacy.dispense')) { /* show dispense button *\/ }
 * ```
 */
import { useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import { MODULE_PERMISSIONS, type ModuleKey } from '@/lib/permissions/constants';
import { ACTION_PERMISSIONS, type ActionKey } from '@/lib/permissions/actions';

// =============================================================================
// Types
// =============================================================================

export interface PermissionsResult {
  // --- Layer 1: Module access (navigation filtering) ---
  /** Check if user can access a sidebar module */
  canAccessModule: (module: ModuleKey) => boolean;

  // --- Layer 2: Action permissions (button/feature visibility) ---
  /** Check if user's role can perform a specific action */
  canPerformAction: (action: ActionKey) => boolean;

  // --- Generic ---
  /** Check for a specific Django permission by name */
  hasPermission: (permission: string) => boolean;

  // --- Legacy convenience booleans ---
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

  // --- User context ---
  /** User's role code (e.g. 'DOCTOR', 'NURSE') */
  role: string | null;
  /** User's role category (e.g. 'CLINICAL', 'ADMINISTRATIVE') */
  roleCategory: string | null;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether user is a superuser (has all permissions) */
  isSuperuser: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Roles that bypass permission checks */
const ADMIN_ROLES = ['ADMIN', 'SUPERUSER', 'SYSTEM_ADMIN'];

/** Clinical roles that should NOT edit patient identity */
const CLINICAL_ROLES = ['NURSE', 'DOCTOR', 'CLINICAL_OFFICER', 'PHARMACIST', 'LAB_TECH'];

/** Roles that can edit patient identity */
const IDENTITY_EDIT_ROLES = ['ADMIN', 'SUPERUSER', 'RECEPTIONIST', 'RECORDS_CLERK'];

/**
 * Permission mapping from simple names to Django permission format
 * Format: simple_name -> [app_label.codename variants]
 */
const PERMISSION_MAP: Record<string, string[]> = {
  // Patient permissions
  'edit_patient': ['patients.change_patient', 'change_patient'],
  'add_patient': ['patients.add_patient', 'add_patient'],
  'view_patient': ['patients.view_patient', 'view_patient'],
  'delete_patient': ['patients.delete_patient', 'delete_patient'],
  'view_sensitive_patient': ['patients.view_sensitive_patient', 'view_sensitive_patient'],
  'manage_patient_identity': ['patients.change_patient', 'manage_patient_identity'],

  // Encounter permissions
  'create_encounter': ['encounters.add_encounter', 'add_encounter'],
  'edit_encounter': ['encounters.change_encounter', 'change_encounter'],
  'view_encounter': ['encounters.view_encounter', 'view_encounter'],

  // Billing permissions
  'create_invoice': ['billing.add_invoice', 'add_invoice'],
  'edit_invoice': ['billing.change_invoice', 'change_invoice'],
  'view_invoice': ['billing.view_invoice', 'view_invoice'],

  // Pharmacy permissions
  'dispense_medication': ['pharmacy.add_dispensing', 'dispense_medication'],
  'view_prescriptions': ['pharmacy.view_prescription', 'view_prescription'],

  // Lab permissions
  'create_lab_order': ['laboratory.add_laborder', 'add_laborder'],
  'view_lab_results': ['laboratory.view_labresult', 'view_labresult'],

  // Triage permissions
  'create_triage': ['triage.add_triageassessment', 'add_triageassessment'],
  'view_triage': ['triage.view_triageassessment', 'view_triageassessment'],
};

// =============================================================================
// Hook Implementation
// =============================================================================

export function usePermissions(): PermissionsResult {
  const { user, isAuthenticated } = useAuth();

  const isSuperuser = useMemo(() => {
    if (!user) return false;
    const userRole = user.role || '';
    return user.is_superuser === true || (user.is_staff === true && userRole === 'ADMIN');
  }, [user]);

  const isAdmin = useMemo(() => {
    return isSuperuser || ADMIN_ROLES.includes(user?.role || '');
  }, [user, isSuperuser]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!isAuthenticated || !user) return false;
    if (isSuperuser || isAdmin) return true;

    const userPermissions = user.permissions || [];

    // Check direct match
    if (userPermissions.includes(permission)) return true;

    // Check mapped permissions
    const mappedPerms = PERMISSION_MAP[permission];
    if (mappedPerms) {
      return mappedPerms.some(p => userPermissions.includes(p));
    }

    // Check codename-only match (e.g. "change_patient" matches "patients.change_patient")
    return userPermissions.some(p => {
      const codename = p.includes('.') ? p.split('.')[1] : p;
      return codename === permission;
    });
  }, [user, isAuthenticated, isSuperuser, isAdmin]);

  const canAccessModule = useCallback((module: ModuleKey): boolean => {
    if (!isAuthenticated) return false;
    if (isSuperuser) return true;

    const requiredPerm = MODULE_PERMISSIONS[module];
    if (requiredPerm === null) return true; // null = no permission required (e.g. dashboard)

    if (typeof requiredPerm === 'string') {
      return hasPermission(requiredPerm);
    }

    return requiredPerm.some((permission) => hasPermission(permission));
  }, [isAuthenticated, isSuperuser, hasPermission]);

  const canPerformAction = useCallback((action: ActionKey): boolean => {
    if (!isAuthenticated || !user) return false;
    if (isSuperuser) return true;

    const allowedRoles = ACTION_PERMISSIONS[action];
    if (!allowedRoles) return false;

    const userRole = user.role || '';
    return (allowedRoles as readonly string[]).includes(userRole);
  }, [user, isAuthenticated, isSuperuser]);

  return useMemo(() => {
    // Unauthenticated users have no permissions
    if (!isAuthenticated || !user) {
      return {
        canAccessModule: () => false,
        canPerformAction: () => false,
        hasPermission: () => false,
        canEditPatient: false,
        canEditIdentity: false,
        canCreateInvoice: false,
        canCreateEncounter: false,
        canViewSensitive: false,
        role: null,
        roleCategory: null,
        isAuthenticated: false,
        isSuperuser: false,
      };
    }

    const userRole = user.role || '';
    const isClinical = CLINICAL_ROLES.includes(userRole);
    const canEditIdentityByRole = IDENTITY_EDIT_ROLES.includes(userRole);

    const canEditPatient = isAdmin || isSuperuser || hasPermission('edit_patient');

    const hasIdentityPermission = hasPermission('manage_patient_identity');
    const canEditIdentity = isAdmin || isSuperuser || hasIdentityPermission || (
      !isClinical && canEditIdentityByRole
    );

    const canCreateInvoice = isAdmin || isSuperuser || hasPermission('create_invoice');
    const canCreateEncounter = isAdmin || isSuperuser || hasPermission('create_encounter');
    const canViewSensitive = isAdmin || isSuperuser || hasPermission('view_sensitive_patient');

    return {
      canAccessModule,
      canPerformAction,
      hasPermission,
      canEditPatient,
      canEditIdentity,
      canCreateInvoice,
      canCreateEncounter,
      canViewSensitive,
      role: userRole,
      roleCategory: (user as unknown as { role_category?: string }).role_category ?? null,
      isAuthenticated: true,
      isSuperuser,
    };
  }, [user, isAuthenticated, isSuperuser, isAdmin, hasPermission, canAccessModule, canPerformAction]);
}

// =============================================================================
// Exports
// =============================================================================

export default usePermissions;
