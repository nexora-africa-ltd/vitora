/**
 * Patient Verification Bar
 *
 * A minimal, compact component for verifying patient information:
 * - Client Registry (CR) lookup - fetch demographics
 * - SHA Eligibility check - verify insurance coverage
 *
 * Both functions are presented equally without bias.
 */
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Database,
  X,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type {
  ClientRegistryClient,
  DirectEligibilityCheckResponse,
} from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

interface PatientVerificationBarProps {
  /** Callback when CR client is found */
  onClientFound?: (client: ClientRegistryClient) => void;
  /** Callback when eligibility is verified */
  onEligibilityVerified?: (eligibility: DirectEligibilityCheckResponse) => void;
  /** Default national ID */
  defaultNationalId?: string;
  /** Custom class name */
  className?: string;
}

type ActionType = 'idle' | 'cr' | 'eligibility';
type Status = 'idle' | 'loading' | 'success' | 'not_found' | 'error';

// ============================================================================
// Result Display Components
// ============================================================================

interface CRResultProps {
  client: ClientRegistryClient;
  onUse: () => void;
  onClear: () => void;
}

function CRResult({ client, onUse, onClear }: CRResultProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 text-sm">
      <Database className="h-4 w-4 text-blue-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          {client.first_name} {client.last_name}
        </span>
        <span className="text-muted-foreground ml-2">
          {client.date_of_birth} • {client.gender === 'M' ? 'Male' : client.gender === 'F' ? 'Female' : 'Other'}
        </span>
        {client.client_number && (
          <Badge variant="outline" className="ml-2 text-xs">
            {client.client_number}
          </Badge>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={onUse} className="h-7 text-xs">
        Use
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} className="h-7 w-7 p-0">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface EligibilityResultProps {
  eligibility: DirectEligibilityCheckResponse;
  onClear: () => void;
}

function EligibilityResult({ eligibility, onClear }: EligibilityResultProps) {
  const isEligible = eligibility.is_eligible;

  return (
    <div className={cn(
      "flex flex-col gap-2 p-3 rounded-md text-sm",
      isEligible ? "bg-green-50 dark:bg-green-950/30" : "bg-yellow-50 dark:bg-yellow-950/30"
    )}>
      <div className="flex items-center gap-3">
        {isEligible ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-yellow-600 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {isEligible ? (
            <>
              <span className="font-medium text-green-700 dark:text-green-300">Eligible</span>
              {eligibility.full_name && (
                <span className="text-green-600 dark:text-green-400 ml-2">{eligibility.full_name}</span>
              )}
              <span className="text-green-600 dark:text-green-400 ml-2">
                {eligibility.copay_percentage === 0 ? '• Full coverage' : `• ${eligibility.copay_percentage}% copay`}
              </span>
              {eligibility.coverage_end_date && (
                <span className="text-green-600/70 dark:text-green-400/70 ml-1">
                  until {eligibility.coverage_end_date}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="font-medium text-yellow-700 dark:text-yellow-300">Not Eligible</span>
              {eligibility.sha_number && (
                <span className="text-yellow-600 dark:text-yellow-400 ml-2">• {eligibility.sha_number}</span>
              )}
            </>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClear} className="h-7 w-7 p-0">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Additional details for ineligible patients */}
      {!isEligible && (eligibility.reason || eligibility.possible_solution) && (
        <div className="pl-7 space-y-1 text-xs">
          {eligibility.reason && (
            <p className="text-yellow-700 dark:text-yellow-300">{eligibility.reason}</p>
          )}
          {eligibility.possible_solution && (
            <p className="text-blue-600 dark:text-blue-400 font-medium">
              💡 {eligibility.possible_solution}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PatientVerificationBar({
  onClientFound,
  onEligibilityVerified,
  defaultNationalId = '',
  className,
}: PatientVerificationBarProps) {
  const [nationalId, setNationalId] = useState(defaultNationalId);
  const [activeAction, setActiveAction] = useState<ActionType>('idle');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>();

  // Results
  const [crClient, setCrClient] = useState<ClientRegistryClient | null>(null);
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);

  const handleCRLookup = useCallback(async () => {
    if (!nationalId || nationalId.trim().length < 5) {
      setError('Enter at least 5 characters');
      return;
    }

    setActiveAction('cr');
    setStatus('loading');
    setError(undefined);
    setCrClient(null);

    try {
      const response = await shaApi.fetchFromClientRegistry({
        national_id: nationalId.trim(),
      });

      if (response.found && response.client) {
        setCrClient(response.client);
        setStatus('success');
      } else {
        setStatus('not_found');
        setError('Not found in Client Registry');
      }
    } catch (err) {
      console.error('CR lookup failed:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setActiveAction('idle');
    }
  }, [nationalId]);

  const handleEligibilityCheck = useCallback(async () => {
    if (!nationalId || nationalId.trim().length < 5) {
      setError('Enter at least 5 characters');
      return;
    }

    setActiveAction('eligibility');
    setStatus('loading');
    setError(undefined);
    setEligibility(null);

    try {
      const response = await shaApi.checkDirectEligibility({
        national_id: nationalId.trim(),
      });

      if (response.error) {
        setStatus('error');
        setError(response.error);
      } else {
        setEligibility(response);
        setStatus('success');
        onEligibilityVerified?.(response);
      }
    } catch (err) {
      console.error('Eligibility check failed:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setActiveAction('idle');
    }
  }, [nationalId, onEligibilityVerified]);

  const handleUseCRClient = useCallback(() => {
    if (crClient) {
      onClientFound?.(crClient);
    }
  }, [crClient, onClientFound]);

  const clearCRResult = () => {
    setCrClient(null);
    setStatus('idle');
    setError(undefined);
  };

  const clearEligibilityResult = () => {
    setEligibility(null);
    setStatus('idle');
    setError(undefined);
  };

  const isLoading = status === 'loading';

  return (
    <div className={cn("space-y-2", className)}>
      {/* Input and action buttons */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Input
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder="National ID"
            className="pr-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleEligibilityCheck();
              }
            }}
          />
          {nationalId && (
            <button
              type="button"
              onClick={() => {
                setNationalId('');
                setCrClient(null);
                setEligibility(null);
                setError(undefined);
                setStatus('idle');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear National ID"
              aria-label="Clear National ID"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCRLookup}
          disabled={isLoading || !nationalId.trim()}
          className="shrink-0"
        >
          {activeAction === 'cr' && isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Database className="h-4 w-4 mr-1" />
          )}
          Lookup CR
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleEligibilityCheck}
          disabled={isLoading || !nationalId.trim()}
          className="shrink-0"
        >
          {activeAction === 'eligibility' && isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <SHALogo size="sm" className="mr-1" />
          )}
          Check Eligibility
        </Button>
      </div>

      {/* Error message */}
      {error && status !== 'success' && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Results */}
      {crClient && (
        <CRResult
          client={crClient}
          onUse={handleUseCRClient}
          onClear={clearCRResult}
        />
      )}

      {eligibility && (
        <EligibilityResult
          eligibility={eligibility}
          onClear={clearEligibilityResult}
        />
      )}
    </div>
  );
}

export default PatientVerificationBar;
