/**
 * SHA Benefits Alert — Reusable eligibility + benefits-aware banner.
 *
 * Consumed by encounter creation, admissions, and patient lookup to show
 * whether a patient can be treated at this facility with SHA.
 */
'use client';

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { BenefitsAvailableState } from '@/lib/hooks/use-sha';

// ============================================================================
// Types
// ============================================================================

export interface SHABenefitsAlertProps {
  /** Is the patient SHA-eligible? */
  shaEligible: boolean;
  /** Benefits availability state from useBenefitsAvailable + deriveBenefitsState */
  benefitsState: BenefitsAvailableState;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SHABenefitsAlert({
  shaEligible,
  benefitsState,
  className,
}: SHABenefitsAlertProps) {
  // Still loading eligibility or benefits — show nothing
  if (benefitsState.status === 'idle' || benefitsState.status === 'loading') {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/20 p-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">Checking SHA benefits...</p>
        </div>
      </div>
    );
  }

  // Error fetching benefits
  if (benefitsState.status === 'error') {
    return (
      <div className={className}>
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Benefits Check Failed
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {benefitsState.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // SHA eligible + benefits available
  if (shaEligible && benefitsState.status === 'available') {
    return (
      <div className={className}>
        <div className="flex gap-2 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-700 dark:bg-green-950/40">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-green-800 dark:text-green-300">
              Eligible for Treatment at This Facility
            </p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
              This patient has active SHA benefit packages. SHA claims can be
              submitted for covered services.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // SHA eligible but zero benefits — cannot be treated
  if (shaEligible && benefitsState.status === 'empty') {
    return (
      <div className={className}>
        <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950/40">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-red-800 dark:text-red-300">
              Cannot Be Treated at This Facility
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
              This patient is enrolled in SHA but has no active benefit packages
              at this facility. SHA claims cannot be submitted. Consider
              registering as a private/cash patient.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Not SHA eligible or benefits not checked — nothing
  return null;
}

export default SHABenefitsAlert;
