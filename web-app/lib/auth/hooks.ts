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
