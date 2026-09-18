'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import type { ModuleKey } from '@/lib/permissions/constants';
import {
  STANDARD_ROUTE_ACCESS_MAP,
  isLISStandaloneRouteAllowed,
  isStandardRouteAllowed,
} from '@/lib/auth/route-access';

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredPermission: string;
  fallback?: React.ReactNode;
}

/**
 * PermissionGuard checks if the user has the required permission.
 *
 * Note: Authentication is handled by middleware.ts (server-side redirect).
 * This component only handles permission-based access control.
 *
 * Uses usePermissions hook which properly handles:
 * - Superusers (bypass all permission checks)
 * - Admin roles (bypass all permission checks)
 * - Permission mapping (simple names to Django format)
 */
export function PermissionGuard({ children, requiredPermission, fallback }: PermissionGuardProps) {
  const { hasPermission, isAuthenticated } = usePermissions();

  // Check required permission (superusers/admins automatically pass)
  if (!isAuthenticated || !hasPermission(requiredPermission)) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}

/**
 * Default access denied UI component
 */
function AccessDenied() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          You do not have permission to access this page.
        </p>
      </div>
    </div>
  );
}

/**
 * AuthGuard — redirects to /login when the user's session has expired.
 * Wraps the dashboard layout to force navigation on auth loss.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect to login when session expires (e.g., desktop app restored from tray)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Redirect to change-password when backend requires it (e.g., admin-generated credentials)
  useEffect(() => {
    if (!isLoading && isAuthenticated && mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [isAuthenticated, isLoading, mustChangePassword, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

// =============================================================================
// Route → Module mapping for RouteGuard
// =============================================================================


/**
 * Resolve a pathname to its required ModuleKey, if any.
 */
export function getModuleForRoute(pathname: string): ModuleKey | null {
  for (const [prefix, requirement] of STANDARD_ROUTE_ACCESS_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return requirement.moduleKey ?? null;
    }
  }
  return null;
}

interface RouteGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * RouteGuard protects pages by matching the current pathname to a required
 * RBAC module and blocking access when the user lacks that module permission.
 *
 * Wrap the dashboard layout (or individual page groups) so that navigating
 * to e.g. /pharmacy/* is denied for users whose role doesn't include the
 * pharmacy module.
 */
export function RouteGuard({ children, fallback }: RouteGuardProps) {
  const pathname = usePathname();
  const { canAccessModule, canPerformAction, hasPermission, isAuthenticated } = usePermissions();
  const { hasModule, facilityDetail, facility } = useFacility();

  if (!isAuthenticated) return <>{children}</>;

  const isLISStandaloneProfile =
    facilityDetail?.operating_mode === 'STANDALONE_LAB' ||
    facility?.operating_mode === 'STANDALONE_LAB' ||
    facility?.deployment_profile === 'lis_standalone';
  if (isLISStandaloneProfile) {
    if (!isLISStandaloneRouteAllowed(pathname, { canAccessModule, hasModule, canPerformAction })) {
      return fallback ?? <AccessDenied />;
    }
  } else if (
    !isStandardRouteAllowed(pathname, {
      canAccessModule,
      hasModule,
      canPerformAction,
      hasPermission,
    })
  ) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}
