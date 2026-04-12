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

/**
 * Pre-compute which roles have access to each module based on ACTION_PERMISSIONS.
 * Used as a fallback when Django group permissions are not assigned.
 */
const MODULE_ROLE_ACCESS: Record<string, Set<string>> = {};
for (const [actionKey, roles] of Object.entries(ACTION_PERMISSIONS)) {
  const modulePrefix = actionKey.split('.')[0] ?? actionKey;
  if (!MODULE_ROLE_ACCESS[modulePrefix]) {
    MODULE_ROLE_ACCESS[modulePrefix] = new Set();
  }
  for (const role of roles) {
    MODULE_ROLE_ACCESS[modulePrefix].add(role);
  }
}

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
  /** Whether user has an admin role (ADMIN, SUPERUSER, SYSTEM_ADMIN) */
  isAdmin: boolean;
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
  'submit_sha_claim': ['billing.submit_sha_claim'],
  'approve_sha_claim': ['billing.approve_sha_claim'],
  'appeal_sha_claim': ['billing.appeal_sha_claim'],

  // Pharmacy permissions
  'dispense_medication': ['pharmacy.add_dispensing', 'dispense_medication'],
  'view_prescriptions': ['pharmacy.view_prescription', 'view_prescription'],

  // Lab permissions
  'create_lab_order': ['laboratory.add_laborder', 'add_laborder'],
  'view_lab_results': ['laboratory.view_labresult', 'view_labresult'],

  // Triage permissions
  'create_triage': ['triage.add_triageassessment', 'add_triageassessment'],
  'view_triage': ['triage.view_triageassessment', 'view_triageassessment'],
  'perform_triage': ['triage.perform_triage'],
  'view_triage_queue': ['triage.view_triage_queue'],
  'override_triage_category': ['triage.override_triage_category'],
  'escalate_patient': ['triage.escalate_patient'],

  // Death record permissions
  'certify_death': ['patients.certify_death'],
  'release_body': ['patients.release_body'],
  'void_death_record': ['patients.void_death_record'],

  // Inpatient permissions
  'receive_critical_alerts': ['inpatient.receive_critical_alerts'],

  // Referral permissions
  'accept_referral': ['referrals.accept_referral'],
  'decline_referral': ['referrals.decline_referral'],
  'view_sensitive_referral': ['referrals.view_sensitive_referral'],

  // Clinic permissions
  'manage_clinic_staff': ['clinics.manage_clinic_staff'],
  'manage_clinic_schedule': ['clinics.manage_clinic_schedule'],
  'view_ccc_clinic': ['clinics.view_ccc_clinic'],
  'view_mental_health_clinic': ['clinics.view_mental_health_clinic'],

  // Surveillance permissions
  'escalate_ihr_to_county': ['surveillance.escalate_ihr_to_county'],
  'escalate_ihr_to_national': ['surveillance.escalate_ihr_to_national'],
  'notify_ihr_to_who': ['surveillance.notify_ihr_to_who'],

  // MCH permissions
  'view_sensitive_mch': ['mch.view_sensitive_mch_registration'],
  'view_sensitive_hei': ['mch.view_sensitive_hei_followup'],

  // Allied health permissions
  'approve_physiotherapy_order': ['physiotherapy.approve_physiotherapy_order'],
  'approve_ot_order': ['occupational_therapy.approve_ot_order'],
  'view_sensitive_counselling_referral': ['counselling.view_sensitive_counselling_referral'],
  'view_sensitive_counselling_session': ['counselling.view_sensitive_counselling_session'],
  'accept_sw_referral': ['social_work.accept_sw_referral'],
  'assign_social_worker': ['social_work.assign_social_worker'],
  'view_sensitive_sw_referral': ['social_work.view_sensitive_sw_referral'],
  'close_sw_case': ['social_work.close_sw_case'],
  'view_sensitive_sw_case': ['social_work.view_sensitive_sw_case'],
  'supervise_sw_case': ['social_work.supervise_sw_case'],
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

    // Layer 1a: Check Django group/user permissions
    if (typeof requiredPerm === 'string') {
      if (hasPermission(requiredPerm)) return true;
    } else if (requiredPerm.some((permission) => hasPermission(permission))) {
      return true;
    }

    // Layer 1b: Fallback — check if the user's role has any action
    // permissions for this module. Covers roles whose Django group
    // permissions haven't been synced yet.
    const userRole = user?.role || '';
    if (userRole && MODULE_ROLE_ACCESS[module]?.has(userRole)) {
      return true;
    }

    return false;
  }, [isAuthenticated, isSuperuser, hasPermission, user]);

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
        isAdmin: false,
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
      isAdmin,
    };
  }, [user, isAuthenticated, isSuperuser, isAdmin, hasPermission, canAccessModule, canPerformAction]);
}

// =============================================================================
// Exports
// =============================================================================

export default usePermissions;
