/**
 * Eligibility Banner Component
 * Displays SHA eligibility status for a patient
 *
 * @see docs/sha-frontend-integration-guide.md - Flow 2
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
  ShieldOff,
  ShieldAlert,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type {
  EligibilityState,
  EligibilityStatus,
  SchemeCategory,
} from '@/lib/types/sha';
import { format, parseISO, isPast } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface EligibilityBannerProps {
  /** Patient ID to check eligibility for */
  patientId: number;
  /** Whether to auto-check on mount */
  autoCheck?: boolean;
  /** Callback when eligibility status changes */
  onStatusChange?: (state: EligibilityState) => void;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSchemeDisplayName(category?: SchemeCategory): string {
  const names: Record<SchemeCategory, string> = {
    SHIF_EMPLOYED: 'SHIF Employed',
    SHIF_SELF_EMPLOYED: 'SHIF Self-Employed',
    SHIF_INDIGENT: 'SHIF Indigent',
    SHIF_ELDERLY: 'SHIF Elderly',
    SHIF_PWD: 'SHIF PWD',
    SHIF_STUDENT: 'SHIF Student',
    NHIF_LEGACY: 'NHIF Legacy',
    UNKNOWN: 'Unknown',
  };
  return category ? names[category] || category : 'Unknown';
}

function formatCoverageDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function EligibilityBannerSkeleton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </Card>
  );
}

// ============================================================================
// Status Icon Component
// ============================================================================

function StatusIcon({
  status,
  className
}: {
  status: EligibilityStatus;
  className?: string;
}) {
  const iconClass = cn('h-5 w-5', className);

  switch (status) {
    case 'eligible':
      return <SHALogo size="md" className={className} />;
    case 'ineligible':
      return <ShieldOff className={cn(iconClass, 'text-destructive')} />;
    case 'expired':
      return <ShieldAlert className={cn(iconClass, 'text-warning-foreground')} />;
    case 'pending':
      return <Clock className={cn(iconClass, 'text-warning-foreground')} />;
    case 'checking':
      return <Loader2 className={cn(iconClass, 'text-muted-foreground animate-spin')} />;
    case 'error':
      return <AlertCircle className={cn(iconClass, 'text-destructive')} />;
    default:
      return <ShieldAlert className={cn(iconClass, 'text-muted-foreground')} />;
  }
}

// ============================================================================
// Compact Banner Component
// ============================================================================

function CompactEligibilityBanner({
  eligibility,
  onRefresh,
  isRefreshing,
}: {
  eligibility: EligibilityState;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { status, copayPercentage, coverageEndDate } = eligibility;

  return (
    <div className="flex items-center gap-2">
      <StatusIcon status={status} />

      <span className={cn(
        'text-sm font-medium',
        status === 'eligible' && 'text-success',
        status === 'ineligible' && 'text-destructive',
        status === 'expired' && 'text-warning-foreground',
        status === 'pending' && 'text-warning-foreground',
        status === 'error' && 'text-destructive',
        status === 'checking' && 'text-muted-foreground',
      )}>
        {status === 'eligible' && 'SHA Eligible'}
        {status === 'ineligible' && 'Not Eligible'}
        {status === 'expired' && 'Coverage Expired'}
        {status === 'pending' && 'Pending Verification'}
        {status === 'checking' && 'Checking...'}
        {status === 'error' && 'Check Failed'}
      </span>

      {status === 'eligible' && copayPercentage !== undefined && copayPercentage > 0 && (
        <Badge variant="secondary" className="text-xs">
          Copay: {copayPercentage}%
        </Badge>
      )}

      {status === 'eligible' && copayPercentage === 0 && (
        <Badge variant="secondary" className="text-xs bg-success/10 text-success">
          Full Coverage
        </Badge>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="h-6 w-6 p-0 ml-1"
      >
        <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
      </Button>
    </div>
  );
}

// ============================================================================
// Full Banner Component
// ============================================================================

function FullEligibilityBanner({
  eligibility,
  onRefresh,
  isRefreshing,
}: {
  eligibility: EligibilityState;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { status, copayPercentage, coverageEndDate, schemeCategory, memberName, checkedAt, errorMessage, member } = eligibility;

  const getBannerStyles = () => {
    switch (status) {
      case 'eligible':
        return 'border-success bg-success/10';
      case 'ineligible':
        return 'border-destructive bg-destructive/10';
      case 'expired':
        return 'border-warning bg-warning/10';
      case 'pending':
        return 'border-warning bg-warning/10';
      case 'error':
        return 'border-destructive bg-destructive/10';
      default:
        return 'border-muted bg-muted';
    }
  };

  return (
    <Card className={cn('p-4 border-2', getBannerStyles())}>
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className={cn(
          'flex items-center justify-center w-12 h-12 rounded-full',
          status === 'eligible' && 'bg-success/20',
          status === 'ineligible' && 'bg-destructive/20',
          status === 'expired' && 'bg-warning/20',
          status === 'pending' && 'bg-warning/20',
          status === 'error' && 'bg-destructive/20',
          status === 'checking' && 'bg-muted',
        )}>
          <StatusIcon status={status} className="h-6 w-6" />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Status Title */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn(
              'font-semibold text-lg',
              status === 'eligible' && 'text-success',
              status === 'ineligible' && 'text-destructive',
              status === 'expired' && 'text-warning-foreground',
              status === 'pending' && 'text-warning-foreground',
              status === 'error' && 'text-destructive',
              status === 'checking' && 'text-muted-foreground',
            )}>
              {status === 'eligible' && 'SHA ELIGIBLE'}
              {status === 'ineligible' && 'NOT SHA ELIGIBLE'}
              {status === 'expired' && 'COVERAGE EXPIRED'}
              {status === 'pending' && 'PENDING VERIFICATION'}
              {status === 'checking' && 'CHECKING ELIGIBILITY...'}
              {status === 'error' && 'ELIGIBILITY CHECK FAILED'}
            </h4>
          </div>

          {/* Status Details */}
          {status === 'eligible' && (
            <div className="space-y-1 text-sm text-success">
              {coverageEndDate && (
                <p>
                  <span className="font-medium">Coverage:</span> Active until {formatCoverageDate(coverageEndDate)}
                </p>
              )}
              <p>
                <span className="font-medium">Scheme:</span> {getSchemeDisplayName(schemeCategory)}
                {' | '}
                <span className="font-medium">Copay:</span> {copayPercentage ?? 0}%
              </p>
              {memberName && (
                <p>
                  <span className="font-medium">Verified:</span> {memberName}
                </p>
              )}
              {/* PFMS Eligibility Badge (SHA Integration Checklist #13) */}
              {member?.is_pfms_eligible && (
                <div className="mt-1.5">
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                    🏛️ PFMS Eligible: {member.pfms_category_display || member.pfms_category}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Government Subsidy Coverage)
                  </span>
                </div>
              )}
            </div>
          )}

          {status === 'ineligible' && (
            <p className="text-sm text-destructive">
              Cash payment required. Patient is not enrolled in SHA or coverage is inactive.
            </p>
          )}

          {status === 'expired' && coverageEndDate && (
            <p className="text-sm text-warning-foreground">
              Coverage expired on {formatCoverageDate(coverageEndDate)}.
              Cash payment required or coverage renewal needed.
            </p>
          )}

          {status === 'pending' && (
            <p className="text-sm text-warning-foreground">
              Coverage verification is pending. Please wait or retry.
            </p>
          )}

          {status === 'error' && (
            <p className="text-sm text-destructive">
              {errorMessage || 'Unable to verify SHA coverage. You can proceed with manual billing.'}
            </p>
          )}

          {/* Member Info Badge */}
          {member && (
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                SHA Member: {member.sha_member_number}
              </Badge>
            </div>
          )}

          {/* Last Checked */}
          {checkedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Last verified: {format(parseISO(checkedAt), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </div>

        {/* Copay Badge & Refresh */}
        <div className="flex flex-col items-end gap-2">
          {status === 'eligible' && (
            <Badge
              variant={copayPercentage === 0 ? 'default' : 'secondary'}
              className={cn(
                'text-sm px-3 py-1',
                copayPercentage === 0 && 'bg-success text-success-foreground'
              )}
            >
              {copayPercentage === 0 ? 'Full Coverage' : `${copayPercentage}% Copay`}
            </Badge>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EligibilityBanner({
  patientId,
  autoCheck = true,
  onStatusChange,
  compact = false,
  className,
}: EligibilityBannerProps) {
  const [eligibility, setEligibility] = useState<EligibilityState>({
    status: 'checking',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkEligibility = useCallback(async () => {
    setIsRefreshing(true);

    const newState: EligibilityState = { status: 'checking' };
    setEligibility(newState);

    try {
      const response = await shaApi.checkPatientEligibility(patientId);

      if (response.is_eligible) {
        // Check if coverage is expired
        if (response.coverage_end_date && isPast(parseISO(response.coverage_end_date))) {
          newState.status = 'expired';
        } else {
          newState.status = 'eligible';
        }
      } else {
        newState.status = 'ineligible';
      }

      newState.member = response.member;
      newState.coverageEndDate = response.coverage_end_date;
      newState.copayPercentage = response.copay_percentage;
      newState.schemeCategory = response.scheme_category;
      newState.memberName = response.verified_name;
      newState.checkedAt = response.checked_at;

      setEligibility(newState);
      onStatusChange?.(newState);
    } catch (error) {
      console.error('Eligibility check failed:', error);
      const errorState: EligibilityState = {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'An unexpected error occurred',
      };
      setEligibility(errorState);
      onStatusChange?.(errorState);
    } finally {
      setIsRefreshing(false);
    }
  }, [patientId, onStatusChange]);

  useEffect(() => {
    if (autoCheck && patientId) {
      checkEligibility();
    }
  }, [patientId, autoCheck, checkEligibility]);

  if (eligibility.status === 'checking' && !isRefreshing) {
    return <EligibilityBannerSkeleton compact={compact} />;
  }

  return (
    <div className={className}>
      {compact ? (
        <CompactEligibilityBanner
          eligibility={eligibility}
          onRefresh={checkEligibility}
          isRefreshing={isRefreshing}
        />
      ) : (
        <FullEligibilityBanner
          eligibility={eligibility}
          onRefresh={checkEligibility}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  );
}

// ============================================================================
// Hook for programmatic eligibility check
// ============================================================================

export function useEligibilityCheck(patientId?: number) {
  const [eligibility, setEligibility] = useState<EligibilityState>({
    status: 'checking',
  });
  const [isLoading, setIsLoading] = useState(false);

  const checkEligibility = useCallback(async (pid?: number) => {
    const id = pid ?? patientId;
    if (!id) return null;

    setIsLoading(true);
    setEligibility({ status: 'checking' });

    try {
      const response = await shaApi.checkPatientEligibility(id);

      let status: EligibilityStatus = 'ineligible';
      if (response.is_eligible) {
        if (response.coverage_end_date && isPast(parseISO(response.coverage_end_date))) {
          status = 'expired';
        } else {
          status = 'eligible';
        }
      }

      const newState: EligibilityState = {
        status,
        member: response.member,
        coverageEndDate: response.coverage_end_date,
        copayPercentage: response.copay_percentage,
        schemeCategory: response.scheme_category,
        memberName: response.verified_name,
        checkedAt: response.checked_at,
      };

      setEligibility(newState);
      return newState;
    } catch (error) {
      const errorState: EligibilityState = {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'An unexpected error occurred',
      };
      setEligibility(errorState);
      return errorState;
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  return {
    eligibility,
    isLoading,
    checkEligibility,
  };
}

export default EligibilityBanner;
