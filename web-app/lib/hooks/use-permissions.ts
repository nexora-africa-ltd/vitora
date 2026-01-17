/**
 * usePermissions Hook
 * 
 * Provides role-based access control (RBAC) for patient identity editing
 * and other sensitive operations in the Vitora HMIS.
 * 
 * Permission Hierarchy:
 * - ADMIN role bypasses all permission checks
 * - Superusers (is_superuser=true) have all permissions
 * - Clinical roles (NURSE, DOCTOR) cannot edit patient identity by default
 * - Registration clerks can edit demographics with manage_patient_identity permission
 * - Billing clerks can create invoices but not clinical data
 * 
 * Permission Format:
 * Backend sends permissions as "app_label.codename" (e.g., "patients.change_patient")
 * This hook checks both the full format and just the codename for flexibility.
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
  /** Whether user is a superuser (has all permissions) */
  isSuperuser: boolean;
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
        isSuperuser: false,
      };
    }

    const userRole = user.role || '';
    const userPermissions = user.permissions || [];
    const isSuperuser = user.is_staff === true; // Backend sets is_staff=true for superusers
    const isAdmin = isSuperuser || ADMIN_ROLES.includes(userRole);
    const isClinical = CLINICAL_ROLES.includes(userRole);
    const canEditIdentityByRole = IDENTITY_EDIT_ROLES.includes(userRole);

    /**
     * Check if user has a specific permission
     * Handles both simple names (edit_patient) and Django format (patients.change_patient)
     * Superusers and Admin roles bypass this check
     */
    const hasPermission = (permission: string): boolean => {
      // Superusers have all permissions
      if (isSuperuser || isAdmin) return true;
      
      // Check direct match first
      if (userPermissions.includes(permission)) return true;
      
      // Check mapped permissions
      const mappedPerms = PERMISSION_MAP[permission];
      if (mappedPerms) {
        return mappedPerms.some(p => userPermissions.includes(p));
      }
      
      // Check if permission exists as codename (after the dot)
      // e.g., looking for "change_patient" should match "patients.change_patient"
      return userPermissions.some(p => {
        const codename = p.includes('.') ? p.split('.')[1] : p;
        return codename === permission;
      });
    };

    /**
     * Can edit patient (medical info, demographics except identity)
     * Requires 'edit_patient' / 'patients.change_patient' permission or admin role
     */
    const canEditPatient = isAdmin || isSuperuser || hasPermission('edit_patient');

    /**
     * Can edit patient identity (name, DOB, national_id)
     * More restricted - requires 'manage_patient_identity' permission
     * - Admin/Superuser: always allowed
     * - Clinical roles: only with explicit manage_patient_identity permission
     * - Non-clinical roles: allowed if in IDENTITY_EDIT_ROLES or has permission
     */
    const hasIdentityPermission = hasPermission('manage_patient_identity');
    const canEditIdentity = isAdmin || isSuperuser || hasIdentityPermission || (
      !isClinical && canEditIdentityByRole
    );

    /**
     * Can create invoices
     * Requires 'create_invoice' / 'billing.add_invoice' permission
     */
    const canCreateInvoice = isAdmin || isSuperuser || hasPermission('create_invoice');

    /**
     * Can create encounters
     * Requires 'create_encounter' / 'encounters.add_encounter' permission
     */
    const canCreateEncounter = isAdmin || isSuperuser || hasPermission('create_encounter');

    /**
     * Can view sensitive patients (HIV, GBV, Mental Health)
     * Requires 'view_sensitive_patient' permission
     */
    const canViewSensitive = isAdmin || isSuperuser || hasPermission('view_sensitive_patient');

    return {
      canEditPatient,
      canEditIdentity,
      canCreateInvoice,
      canCreateEncounter,
      canViewSensitive,
      hasPermission,
      role: userRole,
      isAuthenticated: true,
      isSuperuser,
    };
  }, [user, isAuthenticated]);
}

// =============================================================================
// Exports
// =============================================================================

export default usePermissions;
