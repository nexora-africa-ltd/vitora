'use client';

import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFacility } from '@/lib/context/facility-context';
import type { FacilityModules } from '@/lib/auth/context';

interface FacilityModuleWarningProps {
  /** The facility module to check */
  module: keyof FacilityModules;
  /** Human-readable module label (e.g. "Laboratory") */
  label: string;
  /** Optional custom message. Defaults to "[label] is not enabled at this facility." */
  message?: string;
}

/**
 * Shows an inline warning when a facility module is disabled.
 * Useful in forms that reference workflows from other departments
 * (e.g. lab orders in an encounter form at a facility with no lab).
 *
 * Renders nothing if the module is enabled or the user is a superuser.
 */
export function FacilityModuleWarning({ module, label, message }: FacilityModuleWarningProps) {
  const { hasModule } = useFacility();

  if (hasModule(module)) return null;

  return (
    <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
        {message || `${label} is not enabled at this facility. Consider a referral if ${label.toLowerCase()} services are needed.`}
      </AlertDescription>
    </Alert>
  );
}
