'use client';

import { usePermissions } from '@/lib/hooks/use-permissions';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { ActionKey } from '@/lib/permissions/actions';

interface PermissionGateProps {
  /** Required module access (RBAC layer 1) */
  module?: ModuleKey;
  /** Required action permission (RBAC layer 2) */
  action?: ActionKey;
  /** Required Django permission string */
  permission?: string;
  /** Content shown when access is denied (defaults to hiding children) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Declarative permission gate that shows/hides children based on the
 * user's RBAC role and permissions.
 *
 * @example
 * ```tsx
 * <PermissionGate action="pharmacy.dispense">
 *   <Button onClick={handleDispense}>Dispense</Button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  module,
  action,
  permission,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { canAccessModule, canPerformAction, hasPermission, isAuthenticated } = usePermissions();

  if (!isAuthenticated) return <>{fallback}</>;

  if (module && !canAccessModule(module)) return <>{fallback}</>;
  if (action && !canPerformAction(action)) return <>{fallback}</>;
  if (permission && !hasPermission(permission)) return <>{fallback}</>;

  return <>{children}</>;
}
