/**
 * Biometrics Consent Dialog
 *
 * Hosts the DHA HIE biometric authorization iframe and polls for
 * authorization status. Shows a 10-minute countdown timer and supports
 * up to 3 retry attempts on failure/expiry.
 *
 * Flow:
 * 1. Opens dialog with iframe_url from authorizeBiometric response
 * 2. Polls getBiometricAuthStatus every 3s
 * 3. On AUTHORIZED → calls onSuccess with auth_guid
 * 4. On FAILED/EXPIRED → shows retry option (up to 3 retries)
 * 5. On cancel → calls cancelBiometricAuth + onCancel
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Fingerprint, Loader2, RefreshCcw, X, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';

// ============================================================================
// Types
// ============================================================================

interface BiometricsConsentDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void;
  /** SHA member ID for the patient */
  shaMemberId: number;
  /** Facility workstation ID */
  workstationId: string;
  /** Agent (clerk) national ID */
  agentNationalId: string;
  /** Called on successful biometric authorization */
  onSuccess: (result: { authGuid: string; consentId: number }) => void;
  /** Called when user cancels or gives up */
  onCancel: () => void;
  /** Called when max retries exhausted (user should fall back to OTP) */
  onMaxRetriesExhausted: () => void;
}

type BiometricStatus = 'initiating' | 'pending' | 'authorized' | 'failed' | 'expired' | 'cancelled';

const MAX_RETRIES = 3;
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_SECONDS = 600; // 10 minutes

// ============================================================================
// Component
// ============================================================================

export function BiometricsConsentDialog({
  open,
  onOpenChange,
  shaMemberId,
  workstationId,
  agentNationalId,
  onSuccess,
  onCancel,
  onMaxRetriesExhausted,
}: BiometricsConsentDialogProps) {
  const [status, setStatus] = useState<BiometricStatus>('initiating');
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [authGuid, setAuthGuid] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(TIMEOUT_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Stop polling/countdown when dialog closes
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [open]);

  // Initiate biometric auth when dialog opens
  const initiateBiometric = useCallback(async () => {
    setStatus('initiating');
    setError(null);
    setIframeUrl(null);
    setAuthGuid(null);
    setSecondsRemaining(TIMEOUT_SECONDS);

    try {
      const result = await shaApi.authorizeBiometric({
        sha_member_id: shaMemberId,
        workstation_id: workstationId,
        agent_national_id: agentNationalId,
      });

      if (!isMountedRef.current) return;

      setIframeUrl(result.iframe_url);
      setAuthGuid(result.auth_guid);
      setConsentId(result.consent_id);
      setStatus('pending');

      // Start polling
      startPolling(result.auth_guid, result.consent_id);
      // Start countdown
      startCountdown();
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(getApiErrorMessage(err));
      setStatus('failed');
    }
  }, [shaMemberId, workstationId, agentNationalId]);

  // Start biometric auth when dialog opens
  useEffect(() => {
    if (open && status === 'initiating') {
      initiateBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startPolling = (guid: string, cId: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const result = await shaApi.getBiometricAuthStatus(guid);
        if (!isMountedRef.current) return;

        const s = result.status?.toUpperCase();
        if (s === 'AUTHORIZED') {
          stopTimers();
          setStatus('authorized');
          onSuccess({ authGuid: guid, consentId: cId });
        } else if (s === 'FAILED' || s === 'REJECTED') {
          stopTimers();
          setStatus('failed');
          setError('Biometric verification failed. The patient may retry fingerprint capture.');
        } else if (s === 'EXPIRED') {
          stopTimers();
          setStatus('expired');
          setError('Biometric session expired. Please try again.');
        }
        // PENDING → keep polling
      } catch {
        // Network error during polling — continue, don't break the flow
      }
    }, POLL_INTERVAL_MS);
  };

  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSecondsRemaining(TIMEOUT_SECONDS);
    countdownRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          stopTimers();
          setStatus('expired');
          setError('Biometric session timed out.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const handleRetry = () => {
    const newRetryCount = retryCount + 1;
    if (newRetryCount >= MAX_RETRIES) {
      onMaxRetriesExhausted();
      return;
    }
    setRetryCount(newRetryCount);
    initiateBiometric();
  };

  const handleCancel = async () => {
    stopTimers();
    if (authGuid) {
      try {
        await shaApi.cancelBiometricAuth(authGuid);
      } catch {
        // Best effort — cancellation may fail
      }
    }
    setStatus('cancelled');
    onCancel();
    onOpenChange(false);
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              <DialogTitle>Biometric Verification</DialogTitle>
            </div>
            {status === 'pending' && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {formatTime(secondsRemaining)}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <StatusIndicator status={status} />
            <span className="text-sm text-muted-foreground">
              {status === 'initiating' && 'Initiating biometric session...'}
              {status === 'pending' && 'Waiting for patient fingerprint...'}
              {status === 'authorized' && 'Biometric verified successfully'}
              {status === 'failed' && 'Verification failed'}
              {status === 'expired' && 'Session expired'}
              {status === 'cancelled' && 'Cancelled'}
            </span>
            {retryCount > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-auto">
                Attempt {retryCount + 1}/{MAX_RETRIES}
              </Badge>
            )}
          </div>

          {/* Iframe for fingerprint capture */}
          {status === 'pending' && iframeUrl && (
            <div className="rounded-md border bg-muted/30 overflow-hidden">
              <iframe
                src={iframeUrl}
                title="DHA Biometric Capture"
                className="w-full h-[300px] border-0"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          )}

          {/* Loading state */}
          {status === 'initiating' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error message */}
          {error && (status === 'failed' || status === 'expired') && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            {(status === 'failed' || status === 'expired') && retryCount < MAX_RETRIES - 1 && (
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry ({MAX_RETRIES - retryCount - 1} left)
              </Button>
            )}
            {(status === 'failed' || status === 'expired') && retryCount >= MAX_RETRIES - 1 && (
              <Button variant="outline" size="sm" onClick={() => onMaxRetriesExhausted()}>
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                Fall back to OTP
              </Button>
            )}
            {status === 'pending' && (
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function StatusIndicator({ status }: { status: BiometricStatus }) {
  switch (status) {
    case 'initiating':
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case 'pending':
      return <Fingerprint className={cn('h-4 w-4 text-primary animate-pulse')} />;
    case 'authorized':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'failed':
    case 'expired':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'cancelled':
      return <X className="h-4 w-4 text-muted-foreground" />;
  }
}
