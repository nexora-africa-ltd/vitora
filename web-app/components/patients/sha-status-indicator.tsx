/**
 * SHA Status Indicator for Patient Check-in
 *
 * Compact dot/pulse indicator that auto-checks SHA eligibility and CR status
 * when a patient is selected. Shows details in a hover popover.
 */
'use client';

import { useEffect, useCallback, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Database,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SHALogo } from '@/components/ui/sha-logo';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useRequiresInternet } from '@/lib/hooks/use-requires-internet';
import { extractSHAErrorInfo } from '@/lib/sha/error-utils';
import type { DirectEligibilityCheckResponse, ClientRegistryClient } from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

type EligibilityState = 'idle' | 'checking' | 'eligible' | 'ineligible' | 'error';
type CRState = 'idle' | 'searching' | 'found' | 'not_found' | 'error';

interface SHAStatusIndicatorProps {
  /** Patient ID for eligibility lookup */
  patientId: number;
  /** National ID or identification number for direct checks */
  identificationNumber?: string;
  /** Trigger auto-check when true */
  enabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function SHAStatusIndicator({
  patientId,
  identificationNumber,
  enabled = true,
}: SHAStatusIndicatorProps) {
  const { isSustainedOffline, offlineTooltip } = useRequiresInternet();
  const [eligibilityState, setEligibilityState] = useState<EligibilityState>('idle');
  const [eligibilityData, setEligibilityData] = useState<DirectEligibilityCheckResponse | null>(
    null
  );
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  const [crState, setCRState] = useState<CRState>('idle');
  const [crClient, setCRClient] = useState<ClientRegistryClient | null>(null);
  const [crError, setCRError] = useState<string | null>(null);

  const checkEligibility = useCallback(async () => {
    setEligibilityState('checking');
    setEligibilityError(null);

    try {
      const result = await shaApi.checkPatientEligibility(patientId);

      const shaError = extractSHAErrorInfo(result);
      setEligibilityData({
        is_eligible: result.is_eligible,
        copay_percentage: result.copay_percentage ?? 0,
        coverage_end_date: result.coverage_end_date ?? null,
        full_name: result.verified_name ?? null,
        sha_number: null,
        reason: result.message,
        message: result.message,
        detail: result.detail,
        error: result.error,
        error_code: result.error_code,
        error_title: result.error_title,
        error_detail: result.error_detail,
        upstream_status: result.upstream_status,
      });
      if (shaError) {
        setEligibilityError(shaError.message);
        setEligibilityState('error');
      } else {
        setEligibilityState(result.is_eligible ? 'eligible' : 'ineligible');
      }
    } catch (err) {
      const shaError = extractSHAErrorInfo(err);
      setEligibilityError(
        shaError?.message || (err instanceof Error ? err.message : 'Eligibility check failed')
      );
      setEligibilityState('error');
    }
  }, [patientId]);

  const checkCR = useCallback(async () => {
    if (!identificationNumber || identificationNumber.trim().length < 5) {
      setCRState('idle');
      return;
    }

    setCRState('searching');
    setCRError(null);

    try {
      const result = await shaApi.fetchFromClientRegistry({
        national_id: identificationNumber.trim(),
      });

      if (result.found && result.client) {
        setCRClient(result.client);
        setCRState('found');
      } else {
        setCRState('not_found');
      }
    } catch (err) {
      setCRError(err instanceof Error ? err.message : 'CR lookup failed');
      setCRState('error');
    }
  }, [identificationNumber]);

  // Auto-trigger on mount (skip if sustained offline)
  useEffect(() => {
    if (!enabled || isSustainedOffline) return;
    checkEligibility();
    checkCR();
  }, [enabled, isSustainedOffline, checkEligibility, checkCR]);

  const handleRetry = () => {
    checkEligibility();
    checkCR();
  };

  const isChecking = eligibilityState === 'checking' || crState === 'searching';

  return (
    <div className="flex items-center gap-1.5">
      {/* Dot indicator */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="SHA status"
          >
            <StatusDot eligibility={eligibilityState} isChecking={isChecking} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-72 p-0">
          <div className="space-y-3 p-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SHALogo size="sm" />
                <span className="text-sm font-medium">SHA Verification</span>
              </div>
              {isSustainedOffline ? (
                <span
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                  title={offlineTooltip}
                >
                  <WifiOff className="h-3 w-3" /> Offline
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isChecking}
                  className="h-6 w-6 p-0"
                >
                  <RefreshCw className={cn('h-3 w-3', isChecking && 'animate-spin')} />
                </Button>
              )}
            </div>

            {/* Eligibility Section */}
            <EligibilitySection
              state={eligibilityState}
              data={eligibilityData}
              error={eligibilityError}
            />

            {/* CR Section */}
            {identificationNumber && (
              <CRSection state={crState} client={crClient} error={crError} />
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Compact inline label */}
      <StatusLabel eligibility={eligibilityState} isChecking={isChecking} />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusDot({
  eligibility,
  isChecking,
}: {
  eligibility: EligibilityState;
  isChecking: boolean;
}) {
  if (isChecking) {
    return (
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
      </span>
    );
  }

  const colors: Record<EligibilityState, string> = {
    idle: 'bg-gray-400',
    checking: 'bg-blue-500',
    eligible: 'bg-green-500',
    ineligible: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <span className="relative flex h-3 w-3">
      {eligibility === 'eligible' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
      )}
      <span className={cn('relative inline-flex h-3 w-3 rounded-full', colors[eligibility])} />
    </span>
  );
}

function StatusLabel({
  eligibility,
  isChecking,
}: {
  eligibility: EligibilityState;
  isChecking: boolean;
}) {
  if (isChecking) {
    return <span className="text-[10px] text-muted-foreground">Checking...</span>;
  }

  const labels: Record<EligibilityState, { text: string; className: string }> = {
    idle: { text: '', className: '' },
    checking: { text: 'Checking...', className: 'text-muted-foreground' },
    eligible: { text: 'SHA', className: 'text-green-600 dark:text-green-400 font-medium' },
    ineligible: { text: 'No SHA', className: 'text-yellow-600 dark:text-yellow-400' },
    error: { text: 'SHA Error', className: 'text-red-600 dark:text-red-400' },
  };

  const label = labels[eligibility];
  if (!label.text) return null;

  return <span className={cn('text-[10px]', label.className)}>{label.text}</span>;
}

function EligibilitySection({
  state,
  data,
  error,
}: {
  state: EligibilityState;
  data: DirectEligibilityCheckResponse | null;
  error: string | null;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SHALogo size="xs" muted />
        Eligibility
      </div>

      {state === 'checking' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Verifying coverage...
        </div>
      )}

      {state === 'eligible' && data && (
        <div className="space-y-1 rounded-md bg-green-50 p-2 dark:bg-green-950/20">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span className="text-xs font-medium text-green-700 dark:text-green-300">Eligible</span>
          </div>
          <div className="space-y-0.5 pl-5 text-[11px] text-green-600 dark:text-green-400">
            {data.full_name && <p>{data.full_name}</p>}
            <p>
              {data.copay_percentage === 0 ? 'Full coverage' : `${data.copay_percentage}% copay`}
            </p>
            {data.coverage_end_date && <p>Until {data.coverage_end_date}</p>}
          </div>
        </div>
      )}

      {state === 'ineligible' && data && (
        <div className="space-y-1 rounded-md bg-yellow-50 p-2 dark:bg-yellow-950/20">
          <div className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
              Not Eligible
            </span>
          </div>
          {data.reason && (
            <p className="pl-5 text-[11px] text-yellow-600 dark:text-yellow-400">{data.reason}</p>
          )}
          {data.possible_solution && (
            <p className="pl-5 text-[11px] text-blue-600 dark:text-blue-400">
              Tip: {data.possible_solution}
            </p>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-1 rounded-md bg-red-50 p-2 dark:bg-red-950/20">
          <div className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">{data?.error_title || 'SHA check failed'}</span>
          </div>
          <p className="break-words pl-5 text-[11px] text-red-600 dark:text-red-400">
            {error || data?.error || 'Check failed'}
          </p>
          {data?.error_detail && data.error_detail !== error && (
            <p className="break-words pl-5 text-[10px] text-red-600/90 dark:text-red-400/90">
              {data.error_detail}
            </p>
          )}
          {(data?.error_code || typeof data?.upstream_status === 'number') && (
            <p className="pl-5 font-mono text-[10px] text-red-600/90 dark:text-red-400/90">
              {data?.error_code || 'SHA_ERROR'}
              {typeof data?.upstream_status === 'number'
                ? ` (upstream ${data.upstream_status})`
                : ''}
            </p>
          )}
        </div>
      )}

      {state === 'idle' && <div className="text-xs text-muted-foreground">Not checked</div>}
    </div>
  );
}

function CRSection({
  state,
  client,
  error,
}: {
  state: CRState;
  client: ClientRegistryClient | null;
  error: string | null;
}) {
  return (
    <div className="space-y-1 border-t pt-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Database className="h-3 w-3" />
        Client Registry
      </div>

      {state === 'searching' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Looking up...
        </div>
      )}

      {state === 'found' && client && (
        <div className="rounded-md bg-blue-50 p-2 dark:bg-blue-950/20">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Found</span>
          </div>
          <div className="space-y-0.5 pl-5 text-[11px] text-blue-600 dark:text-blue-400">
            <p>
              {client.first_name} {client.last_name}
            </p>
            {client.client_number && <p>CR: {client.client_number}</p>}
          </div>
        </div>
      )}

      {state === 'not_found' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Not in Client Registry
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error || 'Lookup failed'}</span>
        </div>
      )}
    </div>
  );
}
