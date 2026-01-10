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
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
} from 'lucide-react';
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
      return <ShieldCheck className={cn(iconClass, 'text-green-600')} />;
    case 'ineligible':
      return <ShieldOff className={cn(iconClass, 'text-red-600')} />;
    case 'expired':
      return <ShieldAlert className={cn(iconClass, 'text-orange-600')} />;
    case 'pending':
      return <Clock className={cn(iconClass, 'text-yellow-600')} />;
    case 'checking':
      return <Loader2 className={cn(iconClass, 'text-gray-500 animate-spin')} />;
    case 'error':
      return <AlertCircle className={cn(iconClass, 'text-red-600')} />;
    default:
      return <ShieldAlert className={cn(iconClass, 'text-gray-400')} />;
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
        status === 'eligible' && 'text-green-600',
        status === 'ineligible' && 'text-red-600',
        status === 'expired' && 'text-orange-600',
        status === 'pending' && 'text-yellow-600',
        status === 'error' && 'text-red-600',
        status === 'checking' && 'text-gray-500',
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
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
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
        return 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800';
      case 'ineligible':
        return 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800';
      case 'expired':
        return 'border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800';
      case 'pending':
        return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800';
      case 'error':
        return 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800';
      default:
        return 'border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-700';
    }
  };

  return (
    <Card className={cn('p-4 border-2', getBannerStyles())}>
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className={cn(
          'flex items-center justify-center w-12 h-12 rounded-full',
          status === 'eligible' && 'bg-green-100 dark:bg-green-900',
          status === 'ineligible' && 'bg-red-100 dark:bg-red-900',
          status === 'expired' && 'bg-orange-100 dark:bg-orange-900',
          status === 'pending' && 'bg-yellow-100 dark:bg-yellow-900',
          status === 'error' && 'bg-red-100 dark:bg-red-900',
          status === 'checking' && 'bg-gray-100 dark:bg-gray-800',
        )}>
          <StatusIcon status={status} className="h-6 w-6" />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Status Title */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn(
              'font-semibold text-lg',
              status === 'eligible' && 'text-green-700 dark:text-green-300',
              status === 'ineligible' && 'text-red-700 dark:text-red-300',
              status === 'expired' && 'text-orange-700 dark:text-orange-300',
              status === 'pending' && 'text-yellow-700 dark:text-yellow-300',
              status === 'error' && 'text-red-700 dark:text-red-300',
              status === 'checking' && 'text-gray-600 dark:text-gray-400',
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
            <div className="space-y-1 text-sm text-green-700 dark:text-green-300">
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
            </div>
          )}

          {status === 'ineligible' && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Cash payment required. Patient is not enrolled in SHA or coverage is inactive.
            </p>
          )}

          {status === 'expired' && coverageEndDate && (
            <p className="text-sm text-orange-600 dark:text-orange-400">
              Coverage expired on {formatCoverageDate(coverageEndDate)}. 
              Cash payment required or coverage renewal needed.
            </p>
          )}

          {status === 'pending' && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Coverage verification is pending. Please wait or retry.
            </p>
          )}

          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400">
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
                copayPercentage === 0 && 'bg-green-600'
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
