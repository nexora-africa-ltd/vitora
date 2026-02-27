/**
 * Sensitive Case Banner
 * Displays a prominent warning banner for cases involving sensitive issues
 * (GBV, child protection, trafficking, etc.)
 */

'use client';

import { Shield, Lock, AlertTriangle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SENSITIVE_REASONS,
  REFERRAL_REASON_LABELS,
  type SWReferralReason,
} from '@/lib/types/social-work';

// =============================================================================
// Types
// =============================================================================

interface SensitiveCaseBannerProps {
  /** The referral reason triggering sensitivity */
  referralReason: SWReferralReason | string;
  /** Whether the case/referral is explicitly marked sensitive */
  isSensitive?: boolean;
  /** Confidentiality level (if available from case model) */
  confidentialityLevel?: 'STANDARD' | 'RESTRICTED' | 'HIGHLY_RESTRICTED';
  /** Optional additional className */
  className?: string;
  /** Compact mode — shows a smaller inline variant */
  compact?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

const CONFIDENTIALITY_CONFIG: Record<
  string,
  { label: string; icon: typeof Shield; className: string }
> = {
  STANDARD: {
    label: 'Standard Access',
    icon: Eye,
    className: 'text-yellow-700 dark:text-yellow-400',
  },
  RESTRICTED: {
    label: 'Restricted Access',
    icon: Lock,
    className: 'text-orange-700 dark:text-orange-400',
  },
  HIGHLY_RESTRICTED: {
    label: 'Highly Restricted',
    icon: Shield,
    className: 'text-destructive',
  },
};

// =============================================================================
// Component
// =============================================================================

export function SensitiveCaseBanner({
  referralReason,
  isSensitive,
  confidentialityLevel,
  className,
  compact = false,
}: SensitiveCaseBannerProps) {
  const isReasonSensitive = SENSITIVE_REASONS.includes(
    referralReason as SWReferralReason
  );
  const showBanner = isSensitive || isReasonSensitive;

  if (!showBanner) return null;

  const reasonLabel =
    REFERRAL_REASON_LABELS[referralReason as SWReferralReason] || referralReason;

  const confConfig = confidentialityLevel
    ? CONFIDENTIALITY_CONFIG[confidentialityLevel]
    : undefined;
  const ConfIcon = confConfig?.icon ?? Shield;

  // Compact variant — single‑line badge‑like display
  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          'bg-destructive/10 text-destructive border border-destructive/20',
          className
        )}
      >
        <Shield className="h-3 w-3 shrink-0" />
        <span>Sensitive</span>
        {confConfig && (
          <>
            <span className="text-destructive/40">·</span>
            <span>{confConfig.label}</span>
          </>
        )}
      </div>
    );
  }

  // Full banner
  return (
    <div
      className={cn(
        'rounded-lg border p-3 sm:p-4',
        'bg-destructive/5 border-destructive/20',
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-destructive/10 p-2 shrink-0">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm sm:text-base font-semibold text-destructive">
              Sensitive Case
            </h4>
            {confConfig && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
                  confConfig.className
                )}
              >
                <ConfIcon className="h-3 w-3" />
                {confConfig.label}
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            This case involves{' '}
            <span className="font-medium text-foreground">{reasonLabel}</span>.
            Access is restricted to authorized personnel only. All access is
            audited under the Kenya Data Protection Act 2019.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Encrypted records
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Audit-logged access
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
