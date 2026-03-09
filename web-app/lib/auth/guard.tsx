'use client';

import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/use-permissions';
import type { ModuleKey } from '@/lib/permissions/constants';

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
export function PermissionGuard({
  children,
  requiredPermission,
  fallback
}: PermissionGuardProps) {
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
 * @deprecated AuthGuard is no longer needed - auth redirects are handled by middleware.
 * Remove this wrapper from layouts. Use PermissionGuard for permission-based access.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// =============================================================================
// Route → Module mapping for RouteGuard
// =============================================================================

/**
 * Maps URL path prefixes to their required RBAC module key.
 * Routes not listed here are accessible to any authenticated user.
 * Order matters: more specific prefixes should come first.
 */
const ROUTE_MODULE_MAP: [string, ModuleKey][] = [
  ['/pharmacy', 'pharmacy'],
  ['/laboratory', 'laboratory'],
  ['/imaging', 'imaging'],
  ['/admissions', 'inpatient'],
  ['/wards', 'inpatient'],
  ['/inpatient', 'inpatient'],
  ['/transactions', 'billing'],
  ['/finance', 'billing'],
  ['/insurance', 'billing'],
  ['/encounters', 'encounters'],
  ['/triage', 'triage'],
  ['/emergency', 'emergency'],
  ['/surveillance', 'surveillance'],
  ['/clinics', 'clinics'],
  ['/theatre', 'theatre'],
  ['/admin', 'admin'],
  ['/patients', 'patients'],
];

/**
 * Resolve a pathname to its required ModuleKey, if any.
 */
export function getModuleForRoute(pathname: string): ModuleKey | null {
  for (const [prefix, moduleKey] of ROUTE_MODULE_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return moduleKey;
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
  const { canAccessModule, isAuthenticated } = usePermissions();

  if (!isAuthenticated) return <>{children}</>;

  const requiredModule = getModuleForRoute(pathname);
  if (requiredModule && !canAccessModule(requiredModule)) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}
