'use client';

import { useAuth } from './context';

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
 */
export function PermissionGuard({ 
  children, 
  requiredPermission,
  fallback 
}: PermissionGuardProps) {
  const { user } = useAuth();

  // Check required permission
  if (!user?.permissions?.includes(requiredPermission)) {
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
