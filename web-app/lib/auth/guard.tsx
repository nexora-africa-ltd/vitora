'use client';

import { usePathname } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import type { FacilityModules } from '@/lib/auth/context';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { ActionKey } from '@/lib/permissions/actions';

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
interface RouteAccessRequirement {
  moduleKey?: ModuleKey;
  facilityModule?: keyof FacilityModules;
  actionKey?: ActionKey;
}

const ROUTE_ACCESS_MAP: [string, RouteAccessRequirement][] = [
  ['/pharmacy', { moduleKey: 'pharmacy', facilityModule: 'pharmacy' }],
  ['/laboratory', { moduleKey: 'laboratory', facilityModule: 'laboratory' }],
  ['/imaging', { moduleKey: 'imaging', facilityModule: 'imaging' }],
  ['/admissions', { moduleKey: 'inpatient', facilityModule: 'inpatient' }],
  ['/wards', { moduleKey: 'inpatient', facilityModule: 'inpatient' }],
  ['/inpatient', { moduleKey: 'inpatient', facilityModule: 'inpatient' }],
  ['/blood-bank', { moduleKey: 'blood_bank', facilityModule: 'blood_bank' }],
  ['/dialysis', { moduleKey: 'dialysis', facilityModule: 'dialysis' }],
  ['/last-office', { moduleKey: 'last_office' }],
  ['/transactions', { moduleKey: 'billing' }],
  ['/finance', { moduleKey: 'billing' }],
  ['/insurance', { moduleKey: 'billing', facilityModule: 'private_insurance' }],
  ['/encounters', { moduleKey: 'encounters', facilityModule: 'outpatient' }],
  ['/triage', { moduleKey: 'triage', facilityModule: 'outpatient' }],
  ['/emergency', { moduleKey: 'emergency', facilityModule: 'emergency' }],
  ['/surveillance', { moduleKey: 'surveillance' }],
  ['/clinics', { moduleKey: 'clinics' }],
  ['/theatre', { moduleKey: 'theatre', facilityModule: 'theatre' }],
  ['/mch', { moduleKey: 'mch', facilityModule: 'maternity' }],
  ['/ai', { actionKey: 'ai.use_chat' }],
  ['/admin', { moduleKey: 'admin' }],
  ['/patients', { moduleKey: 'patients' }],
];

/**
 * Resolve a pathname to its required ModuleKey, if any.
 */
export function getModuleForRoute(pathname: string): ModuleKey | null {
  for (const [prefix, requirement] of ROUTE_ACCESS_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return requirement.moduleKey ?? null;
    }
  }
  return null;
}

function getRouteAccessRequirement(pathname: string): RouteAccessRequirement | null {
  for (const [prefix, requirement] of ROUTE_ACCESS_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return requirement;
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
  const { canAccessModule, canPerformAction, isAuthenticated } = usePermissions();
  const { hasModule } = useFacility();

  if (!isAuthenticated) return <>{children}</>;

  const requirement = getRouteAccessRequirement(pathname);
  if (requirement?.moduleKey && !canAccessModule(requirement.moduleKey)) {
    return fallback ?? <AccessDenied />;
  }

  if (requirement?.facilityModule && !hasModule(requirement.facilityModule)) {
    return fallback ?? <AccessDenied />;
  }

  if (requirement?.actionKey && !canPerformAction(requirement.actionKey)) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}
