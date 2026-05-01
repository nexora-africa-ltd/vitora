/**
 * Doctor Consent Polling Card
 *
 * Shows when a preauth's doctor_consent_state is "REQUESTED" — meaning
 * the system is waiting for the doctor to approve via Practice360.
 *
 * Auto-polls every 10s. Shows retry on failure, toast on final state.
 */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { SHAPreauth } from '@/lib/schemas/sha.schema';

// ============================================================================
// Types
// ============================================================================

interface DoctorConsentCardProps {
  /** The SHAPreauth record being tracked */
  preauth: SHAPreauth;
  /** Callback when doctor consent state changes to a terminal state */
  onStateChange?: (preauth: SHAPreauth) => void;
  /** Custom class name */
  className?: string;
}

// Terminal states that stop polling
const TERMINAL_STATES = ['APPROVED', 'REJECTED', 'FAILED', 'CANCELLED'];

// ============================================================================
// Component
// ============================================================================

export function DoctorConsentCard({
  preauth: initialPreauth,
  onStateChange,
  className,
}: DoctorConsentCardProps) {
  const [preauth, setPreauth] = useState<SHAPreauth>(initialPreauth);
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const state = preauth.doctor_consent_state || '';
  const isTerminal = TERMINAL_STATES.includes(state.toUpperCase());
  const isWaiting = state.toUpperCase() === 'REQUESTED' || state === '';

  const poll = useCallback(async () => {
    if (isTerminal) return;
    setIsPolling(true);
    setPollError(null);
    try {
      const updated = await shaApi.pollDoctorConsent(preauth.id);
      setPreauth(updated);
      setPollCount((c) => c + 1);

      const newState = (updated.doctor_consent_state || '').toUpperCase();
      if (TERMINAL_STATES.includes(newState)) {
        // Show toast for terminal state
        if (newState === 'APPROVED') {
          toast({
            title: 'Doctor Consent Approved',
            description: `Doctor approved the pre-authorization for ${updated.intervention_code}.`,
          });
        } else {
          toast({
            title: 'Doctor Consent ' + newState,
            description: `Doctor consent for ${updated.intervention_code} was ${newState.toLowerCase()}.`,
            variant: 'destructive',
          });
        }
        onStateChange?.(updated);
      }
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Failed to poll status');
    } finally {
      setIsPolling(false);
    }
  }, [preauth.id, isTerminal, toast, onStateChange]);

  // Auto-poll every 10s while not in terminal state
  useEffect(() => {
    if (isTerminal) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial poll
    poll();

    intervalRef.current = setInterval(poll, 10_000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTerminal, poll]);

  // Update when parent preauth changes
  useEffect(() => {
    setPreauth(initialPreauth);
  }, [initialPreauth]);

  // Don't show card if consent was never requested
  if (!state && preauth.status !== 'submitted') {
    return null;
  }

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-primary" />
            Doctor Consent
          </CardTitle>
          {getStateBadge(state)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Intervention</span>
            <p className="font-mono text-xs">{preauth.intervention_code}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Preauth Status</span>
            <p className="capitalize">{preauth.status}</p>
          </div>
        </div>

        {/* Waiting state — show polling indicator */}
        {isWaiting && !pollError && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/10 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-800 dark:text-amber-400">
              <p className="font-medium">Awaiting doctor approval on Practice360</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-checking every 10 seconds (poll #{pollCount})
              </p>
            </div>
          </div>
        )}

        {/* Error state — show retry */}
        {pollError && (
          <div className="flex items-center justify-between rounded-md bg-destructive/10 p-3">
            <div className="text-sm text-destructive">
              <p className="font-medium">Failed to check status</p>
              <p className="text-xs mt-0.5">{pollError}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={poll}
              disabled={isPolling}
            >
              <RefreshCw className={cn('mr-1 h-3 w-3', isPolling && 'animate-spin')} />
              Retry
            </Button>
          </div>
        )}

        {/* Approved state */}
        {state.toUpperCase() === 'APPROVED' && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/10 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-green-800 dark:text-green-400">
              Doctor has approved this pre-authorization
            </p>
          </div>
        )}

        {/* Rejected/Failed state */}
        {(state.toUpperCase() === 'REJECTED' || state.toUpperCase() === 'FAILED') && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
            <XCircle className="h-4 w-4 text-destructive" />
            <div className="text-sm text-destructive">
              <p className="font-medium">
                Doctor consent {state.toLowerCase()}
              </p>
              <p className="text-xs mt-0.5">
                You may retry by requesting doctor consent again.
              </p>
            </div>
          </div>
        )}

        {/* Manual refresh button when not terminal */}
        {!isTerminal && !pollError && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={poll}
              disabled={isPolling}
              className="text-xs"
            >
              <RefreshCw className={cn('mr-1 h-3 w-3', isPolling && 'animate-spin')} />
              {isPolling ? 'Checking...' : 'Check now'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getStateBadge(state: string) {
  const upper = state.toUpperCase();
  switch (upper) {
    case 'APPROVED':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'REJECTED':
    case 'FAILED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          {upper === 'REJECTED' ? 'Rejected' : 'Failed'}
        </Badge>
      );
    case 'REQUESTED':
      return (
        <Badge variant="secondary">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Awaiting Approval
        </Badge>
      );
    default:
      return state ? (
        <Badge variant="outline">{state}</Badge>
      ) : null;
  }
}
