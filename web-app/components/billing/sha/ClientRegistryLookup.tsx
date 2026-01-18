/**
 * Client Registry Lookup Component
 * Searches SHA Client Registry by National ID, Huduma Number, or Passport
 * Also verifies SHA eligibility for found clients
 *
 * @see docs/sha-frontend-integration-guide.md - Flow 1
 */
'use client';

import React, { useState, useCallback } from 'react';
import { Search, CheckCircle2, AlertCircle, Info, Loader2, UserCheck, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import type {
  ClientRegistryClient,
  CRLookupStatus,
  ClientRegistryFetchRequest,
  DirectEligibilityCheckResponse,
} from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

interface ClientRegistryLookupProps {
  /** Type of identifier to search */
  identifierType: 'national_id' | 'huduma_number' | 'passport_number';
  /** Current value of the identifier field (controlled mode) */
  value?: string;
  /** Callback when value changes (controlled mode) */
  onChange?: (value: string) => void;
  /** Callback when client is found and verified */
  onClientFound?: (client: ClientRegistryClient, eligibility?: DirectEligibilityCheckResponse) => void;
  /** Callback when lookup status changes */
  onStatusChange?: (status: CRLookupStatus) => void;
  /** Whether the lookup is disabled */
  disabled?: boolean;
  /** Whether to show the full client details card */
  showDetails?: boolean;
  /** Whether to also check SHA eligibility */
  checkEligibility?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Status Display Component
// ============================================================================

interface StatusDisplayProps {
  status: CRLookupStatus;
  client?: ClientRegistryClient | null;
  errorMessage?: string;
}

function StatusDisplay({ status, client, errorMessage }: StatusDisplayProps) {
  switch (status) {
    case 'idle':
      return null;

    case 'searching':
      return (
        <div className="flex items-center gap-2 text-muted-foreground text-sm mt-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Searching Client Registry...</span>
        </div>
      );

    case 'found':
      return (
        <div className="flex items-center gap-2 text-green-600 text-sm mt-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>CR Verified</span>
          {client?.client_number && (
            <Badge variant="outline" className="text-green-600 border-green-600">
              {client.client_number}
            </Badge>
          )}
        </div>
      );

    case 'not_found':
      return (
        <Alert variant="default" className="mt-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-600">Not in Client Registry</AlertTitle>
          <AlertDescription className="text-yellow-600">
            Patient will be registered in SHA Client Registry on save.
          </AlertDescription>
        </Alert>
      );

    case 'error':
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>CR Lookup Failed</AlertTitle>
          <AlertDescription>
            {errorMessage || 'Unable to verify with Client Registry. You can continue with manual entry.'}
          </AlertDescription>
        </Alert>
      );

    default:
      return null;
  }
}

// ============================================================================
// Client Details Card
// ============================================================================

interface ClientDetailsCardProps {
  client: ClientRegistryClient;
  eligibility?: DirectEligibilityCheckResponse | null;
}

function ClientDetailsCard({ client, eligibility }: ClientDetailsCardProps) {
  const isEligible = eligibility?.is_eligible ?? false;

  return (
    <div className={cn(
      "mt-4 p-4 border rounded-lg",
      isEligible
        ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
        : "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800"
    )}>
      <div className="flex items-center gap-2 mb-3">
        <UserCheck className={cn("h-5 w-5", isEligible ? "text-green-600" : "text-yellow-600")} />
        <h4 className={cn("font-medium", isEligible ? "text-green-700 dark:text-green-300" : "text-yellow-700 dark:text-yellow-300")}>
          Client Registry Record
        </h4>
        <Badge variant="outline" className={cn("ml-auto", isEligible ? "text-green-600 border-green-600" : "text-yellow-600 border-yellow-600")}>
          {client.client_number}
        </Badge>
      </div>

      {/* SHA Eligibility Status */}
      {eligibility && (
        <div className={cn(
          "mb-3 p-2 rounded-md flex items-center gap-2",
          isEligible ? "bg-green-100 dark:bg-green-900" : "bg-yellow-100 dark:bg-yellow-900"
        )}>
          {isEligible ? (
            <>
              <ShieldCheck className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <span className="font-medium text-green-700 dark:text-green-300">SHA COVERED</span>
                {eligibility.coverage_end_date && (
                  <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                    until {eligibility.coverage_end_date}
                  </span>
                )}
                {eligibility.copay_percentage !== undefined && eligibility.copay_percentage === 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs bg-green-200 text-green-700">
                    Full Coverage
                  </Badge>
                )}
              </div>
            </>
          ) : (
            <>
              <ShieldOff className="h-5 w-5 text-yellow-600" />
              <div className="flex-1">
                <span className="font-medium text-yellow-700 dark:text-yellow-300">NOT SHA COVERED</span>
                <span className="ml-2 text-sm text-yellow-600 dark:text-yellow-400">
                  {eligibility.reason || 'Cash payment required'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <Label className="text-muted-foreground text-xs">Name</Label>
          <p className="font-medium">
            {client.first_name} {client.middle_name && `${client.middle_name} `}{client.last_name}
          </p>
        </div>

        <div>
          <Label className="text-muted-foreground text-xs">Date of Birth</Label>
          <p className="font-medium">{client.date_of_birth}</p>
        </div>

        <div>
          <Label className="text-muted-foreground text-xs">Gender</Label>
          <p className="font-medium">
            {client.gender === 'M' ? 'Male' : client.gender === 'F' ? 'Female' : 'Other'}
          </p>
        </div>

        {client.national_id && (
          <div>
            <Label className="text-muted-foreground text-xs">National ID</Label>
            <p className="font-medium">{client.national_id}</p>
          </div>
        )}

        {client.phone_number && (
          <div>
            <Label className="text-muted-foreground text-xs">Phone</Label>
            <p className="font-medium">{client.phone_number}</p>
          </div>
        )}

        {client.county && (
          <div>
            <Label className="text-muted-foreground text-xs">Location</Label>
            <p className="font-medium">
              {client.county}
              {client.sub_county && `, ${client.sub_county}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ClientRegistryLookup({
  identifierType,
  value: controlledValue,
  onChange,
  onClientFound,
  onStatusChange,
  disabled = false,
  showDetails = true,
  checkEligibility: shouldCheckEligibility = true,
  className,
}: ClientRegistryLookupProps) {
  const [status, setStatus] = useState<CRLookupStatus>('idle');
  const [client, setClient] = useState<ClientRegistryClient | null>(null);
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [internalValue, setInternalValue] = useState('');

  // Use controlled value if provided, otherwise use internal state
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleValueChange = useCallback((newValue: string) => {
    if (isControlled) {
      onChange?.(newValue);
    } else {
      setInternalValue(newValue);
    }
  }, [isControlled, onChange]);

  const updateStatus = useCallback((newStatus: CRLookupStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const handleLookup = useCallback(async () => {
    if (!value || value.trim().length < 3) {
      return;
    }

    updateStatus('searching');
    setClient(null);
    setEligibility(null);
    setErrorMessage(undefined);

    try {
      const request: ClientRegistryFetchRequest = {
        [identifierType]: value.trim(),
      };

      const response = await shaApi.fetchFromClientRegistry(request);

      if (response.found && response.client) {
        setClient(response.client);

        // Also check SHA eligibility if enabled
        let eligibilityResult: DirectEligibilityCheckResponse | null = null;
        if (shouldCheckEligibility && identifierType === 'national_id') {
          try {
            eligibilityResult = await shaApi.checkDirectEligibility({
              national_id: value.trim(),
            });
            setEligibility(eligibilityResult);
          } catch (eligError) {
            console.warn('Eligibility check failed:', eligError);
            // Don't fail the whole lookup if eligibility check fails
          }
        }

        updateStatus('found');
        onClientFound?.(response.client, eligibilityResult ?? undefined);
      } else {
        updateStatus('not_found');
      }
    } catch (error) {
      console.error('Client Registry lookup failed:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
      updateStatus('error');
    }
  }, [value, identifierType, updateStatus, onClientFound, shouldCheckEligibility]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLookup();
    }
  }, [handleLookup]);

  const identifierLabel = {
    national_id: 'National ID',
    huduma_number: 'Huduma Number',
    passport_number: 'Passport Number',
  }[identifierType];

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={`Enter ${identifierLabel}`}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              status === 'found' && 'border-green-500 focus:ring-green-500',
              status === 'error' && 'border-red-500 focus:ring-red-500'
            )}
          />
        </div>
        <Button
          type="button"
          variant={status === 'found' ? 'outline' : 'secondary'}
          onClick={handleLookup}
          disabled={disabled || status === 'searching' || !value || value.trim().length < 3}
          className={cn(
            status === 'found' && 'border-green-500 text-green-600 hover:text-green-700'
          )}
        >
          {status === 'searching' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'found' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span className="ml-2">
            {status === 'found' ? 'Verified' : 'Verify CR'}
          </span>
        </Button>
      </div>

      <StatusDisplay
        status={status}
        client={client}
        errorMessage={errorMessage}
      />

      {showDetails && status === 'found' && client && (
        <ClientDetailsCard client={client} eligibility={eligibility} />
      )}
    </div>
  );
}

// ============================================================================
// Hook for programmatic lookup
// ============================================================================

export function useClientRegistryLookup() {
  const [status, setStatus] = useState<CRLookupStatus>('idle');
  const [client, setClient] = useState<ClientRegistryClient | null>(null);
  const [error, setError] = useState<string>();

  const lookup = useCallback(async (
    identifierType: 'national_id' | 'huduma_number' | 'passport_number',
    value: string
  ) => {
    if (!value || value.trim().length < 3) {
      return null;
    }

    setStatus('searching');
    setClient(null);
    setError(undefined);

    try {
      const request: ClientRegistryFetchRequest = {
        [identifierType]: value.trim(),
      };

      const response = await shaApi.fetchFromClientRegistry(request);

      if (response.found && response.client) {
        setClient(response.client);
        setStatus('found');
        return response.client;
      } else {
        setStatus('not_found');
        return null;
      }
    } catch (err) {
      console.error('Client Registry lookup failed:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setClient(null);
    setError(undefined);
  }, []);

  return {
    status,
    client,
    error,
    lookup,
    reset,
  };
}

export default ClientRegistryLookup;
