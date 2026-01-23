'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './context';

/**
 * Hook for handling logout functionality
 * Returns a function that logs out the user and redirects to login
 */
export function useLogout() {
  const { logout } = useAuth();
  const router = useRouter();

  return useCallback(() => {
    logout();
    router.push('/login');
  }, [logout, router]);
}

/**
 * Hook for checking if user has specific permission
 */
export function useHasPermission(permission: string): boolean {
  const { user } = useAuth();
  return user?.permissions?.includes(permission) ?? false;
}

/**
 * Hook for checking if user is staff
 */
export function useIsStaff(): boolean {
  const { user } = useAuth();
  return user?.is_staff ?? false;
}

/**
 * Supervisor-level roles (hierarchy_level <= 3)
 * These roles have access to view all claimed encounters and other supervisory features.
 */
const SUPERVISOR_ROLES = [
  'ADMIN',
  'MEDICAL_DIRECTOR',
  'CLINICAL_DIRECTOR',
  'DEPARTMENT_HEAD',
  'SENIOR_CONSULTANT',
  'MATRON',
  'NURSING_OFFICER',
  'SUPERVISOR',
  'MANAGER',
  'HEAD_OF_DEPARTMENT',
];

/**
 * Hook for checking if user has supervisor-level access.
 *
 * Returns true if user:
 * - Is a superuser
 * - Is staff (is_staff)
 * - Has a role in SUPERVISOR_ROLES
 * - Has 'encounters.view_all_claimed' permission
 */
export function useIsSupervisor(): boolean {
  const { user } = useAuth();

  if (!user) return false;

  // Superusers and staff have supervisor access
  if (user.is_superuser || user.is_staff) return true;

  // Check if user role is a supervisor-level role
  if (user.role && SUPERVISOR_ROLES.includes(user.role.toUpperCase())) return true;

  // Check for specific permission
  if (user.permissions?.includes('encounters.view_all_claimed')) return true;

  return false;
}
