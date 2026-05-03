/**
 * DHA HIE Biometrics Consent Component
 *
 * Implements the biometric fingerprint authorization flow:
 * 1. Detect Hardware Server (GET http://localhost:18065/status)
 * 2. POST /api/sha/consent/authorize/ → get auth_guid + iframe_url
 * 3. Render iframe for fingerprint capture
 * 4. Poll authorization status until AUTHORIZED or timeout
 *
 * Falls back to OTP if hardware is not detected.
 */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Fingerprint,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';

// ============================================================================
// Types
// ============================================================================

interface BiometricsConsentProps {
  /** SHA Member ID to authorize */
  shaMemberId: number;
  /** National ID of the agent (staff member operating the device) */
  agentNationalId: string;
  /** Callback when biometric auth is successful */
  onAuthorized?: (consentId: number, authGuid: string) => void;
  /** Callback when hardware is not detected (parent can switch to OTP) */
  onHardwareNotDetected?: () => void;
  /** Custom class name */
  className?: string;
}

type BiometricStep = 'detecting' | 'ready' | 'authorizing' | 'polling' | 'authorized' | 'failed';

const HARDWARE_SERVER_URL = 'http://localhost:18065/status';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000; // 2 minutes

// ============================================================================
// Component
// ============================================================================

export function BiometricsConsent({
  shaMemberId,
  agentNationalId,
  onAuthorized,
  onHardwareNotDetected,
  className,
}: BiometricsConsentProps) {
  const [step, setStep] = useState<BiometricStep>('detecting');
  const [workstationId, setWorkstationId] = useState<string>('');
  const [authGuid, setAuthGuid] = useState<string>('');
  const [iframeUrl, setIframeUrl] = useState<string>('');
  const [consentId, setConsentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Detect hardware server on mount
  useEffect(() => {
    detectHardware();
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectHardware = async () => {
    setStep('detecting');
    setError(null);
    try {
      const response = await fetch(HARDWARE_SERVER_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        const wsId = data.workstationID || data.workstation_id || '';
        if (wsId) {
          setWorkstationId(wsId);
          setStep('ready');
        } else {
          throw new Error('No workstationID in response');
        }
      } else {
        throw new Error(`Hardware server returned ${response.status}`);
      }
    } catch {
      setStep('failed');
      setError('Biometric hardware not detected. Please ensure the fingerprint device is connected and the Hardware Server is running.');
      onHardwareNotDetected?.();
    }
  };

  const startAuthorization = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await shaApi.authorizeBiometric({
        sha_member_id: shaMemberId,
        workstation_id: workstationId,
        agent_national_id: agentNationalId,
      });

      setAuthGuid(result.auth_guid);
      setIframeUrl(result.iframe_url);
      setConsentId(result.consent_id);
      setStep('polling');

      // Start polling
      pollStartRef.current = Date.now();
      pollTimerRef.current = setInterval(() => pollStatus(result.auth_guid), POLL_INTERVAL_MS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initiate biometric authorization';
      setError(message);
      setStep('ready');
    } finally {
      setIsLoading(false);
    }
  };

  const pollStatus = useCallback(async (guid: string) => {
    // Check timeout
    if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setStep('failed');
      setError('Biometric verification timed out. Please try again.');
      return;
    }

    try {
      const result = await shaApi.getBiometricAuthStatus(guid);

      if (result.status === 'AUTHORIZED') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setStep('authorized');
        if (consentId) {
          onAuthorized?.(consentId, guid);
        }
      } else if (result.status === 'FAILED' || result.status === 'EXPIRED') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setStep('failed');
        setError(`Biometric verification ${result.status.toLowerCase()}. Please try again.`);
      }
      // PENDING: continue polling
    } catch {
      // Network error during polling — don't stop, retry on next interval
    }
  }, [consentId, onAuthorized]);

  // Update pollStatus ref when consentId changes
  useEffect(() => {
    if (step === 'polling' && authGuid) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => pollStatus(authGuid), POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [step, authGuid, pollStatus]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Step: Detecting Hardware */}
      {step === 'detecting' && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Detecting biometric hardware...</span>
        </div>
      )}

      {/* Step: Ready to authorize */}
      {step === 'ready' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-400">
              Hardware detected (Workstation: {workstationId})
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Click below to start fingerprint verification. The patient will need to place their finger on the biometric device.
          </p>
          <Button
            onClick={startAuthorization}
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="mr-2 h-4 w-4" />
            )}
            Start Fingerprint Verification
          </Button>
        </div>
      )}

      {/* Step: Polling (iframe active) */}
      {step === 'polling' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Awaiting fingerprint...</span>
            <Badge variant="secondary">PENDING</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Please ask the patient to place their finger on the biometric device.
          </p>
          {iframeUrl && (
            <div className="rounded-lg border overflow-hidden bg-white">
              <iframe
                src={iframeUrl}
                title="Biometric Fingerprint Capture"
                className="w-full h-48 border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          )}
        </div>
      )}

      {/* Step: Authorized */}
      {step === 'authorized' && (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            Fingerprint verified successfully
          </span>
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            AUTHORIZED
          </Badge>
        </div>
      )}

      {/* Step: Failed */}
      {step === 'failed' && error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            {workstationId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null);
                  setStep('ready');
                }}
              >
                Retry
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Hardware not detected — show fallback notice */}
      {step === 'failed' && !workstationId && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4" />
          <span>Use OTP verification instead</span>
        </div>
      )}
    </div>
  );
}
