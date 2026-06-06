/**
 * DHA HIE Consent Panel
 * Handles OTP-based and biometric consent verification for SHA claims.
 *
 * Flows:
 * A) OTP: Send OTP → Enter code → Validate → consent token
 * B) Biometric: Initiate → iframe fingerprint capture → poll status → consent token
 */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ShieldCheck,
  Send,
  KeyRound,
  Fingerprint,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSendConsentOTP, useStartVisit, useConsentDetail } from '@/lib/hooks/use-sha';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ConsentStatus, ClaimFlow } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

type ConsentMethod = 'otp' | 'biometric';
type ConsentStep = 'idle' | 'otp_sent' | 'biometric_pending' | 'validated';

/**
 * Credential captured during consent that can be reused by downstream
 * ILM calls (start_visit, discharge) without re-prompting the user.
 */
export interface ConsentCredential {
  /** OTP code the patient supplied (present for OTP flow). */
  otp?: string;
  /** Biometric authorisation GUID (present for biometric flow). */
  authGuid?: string;
}

interface ConsentPanelProps {
  /** SHA Member ID to obtain consent for */
  shaMemberId: number;
  /** Existing consent token ID (if already obtained) */
  consentId?: number;
  /** Intervention codes to include with the OTP request (determines DHA benefit package) */
  interventionCodes?: string[];
  /**
   * Callback when consent is successfully obtained. The `credential` arg
   * carries the raw OTP / biometric GUID so downstream steps can call
   * DHA ILM endpoints without re-prompting the patient.
   */
  onConsentObtained?: (
    consentId: number,
    consentToken: string,
    credential: ConsentCredential,
  ) => void;
  /**
   * Routed DHA HIE flow. ECCIF skips initial consent; PHC uses simplified
   * messaging. Defaults to SHIF when omitted.
   */
  flow?: ClaimFlow;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusBadge(status: ConsentStatus) {
  switch (status) {
    case 'VALIDATED':
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Validated
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          Pending OTP
        </Badge>
      );
    case 'EXPIRED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Expired
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
  }
}

// ============================================================================
// Component
// ============================================================================

export function ConsentPanel({
  shaMemberId,
  consentId: initialConsentId,
  interventionCodes,
  onConsentObtained,
  flow = 'shif',
  className,
}: ConsentPanelProps) {
  const [step, setStep] = useState<ConsentStep>(
    initialConsentId ? 'validated' : 'idle'
  );
  const [method, setMethod] = useState<ConsentMethod>('otp');
  const [otpCode, setOtpCode] = useState('');
  const [consentId, setConsentId] = useState<number | undefined>(initialConsentId);
  const [error, setError] = useState<string | null>(null);

  // Biometric state
  const [biometricAuthGuid, setBiometricAuthGuid] = useState<string | null>(null);
  const [biometricIframeUrl, setBiometricIframeUrl] = useState<string | null>(null);
  const [biometricPolling, setBiometricPolling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendOTP = useSendConsentOTP();
  const startVisit = useStartVisit();
  const { data: consentDetail } = useConsentDetail(consentId);

  // Track sandbox OTP from backend (DHA UAT returns the OTP in non-production)
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);

  const handleSendOTP = async () => {
    setError(null);
    setMethod('otp');
    sendOTP.mutate(
      {
        sha_member_id: shaMemberId,
        ...(interventionCodes?.length ? { intervention_codes: interventionCodes } : {}),
      },
      {
        onSuccess: (response) => {
          setConsentId(response.consent_id);
          // In sandbox/UAT, DHA returns the OTP in the response — auto-fill for convenience
          if (response.sandbox_otp) {
            setOtpCode(response.sandbox_otp);
            setSandboxOtp(response.sandbox_otp);
          }
          setStep('otp_sent');
        },
        onError: (err: unknown) => {
          setError(getApiErrorMessage(err) || 'Failed to send OTP');
        },
      }
    );
  };

  const handleValidateOTP = async () => {
    if (!consentId || !otpCode.trim()) return;
    setError(null);
    const submittedOtp = otpCode.trim();
    startVisit.mutate(
      {
        consent_id: consentId,
        otp_code: submittedOtp,
        ...(interventionCodes?.length ? { intervention_codes: interventionCodes } : {}),
      },
      {
        onSuccess: (response) => {
          setStep('validated');
          setOtpCode('');
          onConsentObtained?.(response.id, response.consent_token, { otp: submittedOtp });
        },
        onError: (err: unknown) => {
          setError(getApiErrorMessage(err) || 'Invalid OTP code');
        },
      }
    );
  };

  // ---- Biometric flow ----
  const handleStartBiometric = async () => {
    setError(null);
    setMethod('biometric');
    try {
      const result = await shaApi.authorizeBiometric({
        sha_member_id: shaMemberId,
        workstation_id: 'vitora-web',
        agent_national_id: '', // Resolved server-side from logged-in user
      });
      setConsentId(result.consent_id);
      setBiometricAuthGuid(result.auth_guid);
      setBiometricIframeUrl(result.iframe_url);
      setStep('biometric_pending');
      setBiometricPolling(true);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'Failed to initiate biometric auth');
    }
  };

  const stopPolling = useCallback(() => {
    setBiometricPolling(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Poll biometric auth status every 3s
  useEffect(() => {
    if (!biometricPolling || !biometricAuthGuid) return;
    const poll = async () => {
      try {
        const status = await shaApi.getBiometricAuthStatus(biometricAuthGuid);
        if (status.status === 'AUTHORIZED') {
          stopPolling();
          setStep('validated');
          onConsentObtained?.(consentId!, status.consent_token, { authGuid: biometricAuthGuid });
        } else if (status.status === 'FAILED' || status.status === 'EXPIRED') {
          stopPolling();
          setError(`Biometric authorization ${status.status.toLowerCase()}`);
          setStep('idle');
        }
      } catch {
        // Non-fatal — keep polling
      }
    };
    pollIntervalRef.current = setInterval(poll, 3000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [biometricPolling, biometricAuthGuid, consentId, onConsentObtained, stopPolling]);

  const handleCancelBiometric = async () => {
    if (biometricAuthGuid) {
      try {
        await shaApi.cancelBiometricAuth(biometricAuthGuid);
      } catch { /* best effort */ }
    }
    stopPolling();
    setBiometricAuthGuid(null);
    setBiometricIframeUrl(null);
    setStep('idle');
  };

  // ECCIF: emergency claims are opened without an initial consent token.
  // Render a notice instead of the OTP wizard.
  if (flow === 'eccif') {
    return (
      <Card className={cn('relative overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Emergency Claim &mdash; Consent Skipped
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ECCIF flow allows the claim to be opened without an initial consent token.
            Capture identity and consent post-stabilisation if/when the patient is identified.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Patient Consent
            {flow === 'phc' && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                PHC \u00b7 simplified
              </Badge>
            )}
          </CardTitle>
          {consentDetail && getStatusBadge(consentDetail.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Choose method */}
        {step === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Verify patient consent via OTP or biometric fingerprint.
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleSendOTP}
                disabled={sendOTP.isPending}
                size="sm"
              >
                {sendOTP.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send OTP
              </Button>
              <Button
                variant="outline"
                onClick={handleStartBiometric}
                size="sm"
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                Biometric
              </Button>
            </div>
          </div>
        )}

        {/* Step 2a: Enter OTP */}
        {step === 'otp_sent' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit OTP code sent to the patient&apos;s phone.
            </p>
            {sandboxOtp && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Sandbox OTP auto-filled from DHA UAT — click Verify to proceed
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="otp-code">OTP Code</Label>
              <div className="flex gap-2">
                <Input
                  id="otp-code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="max-w-[180px] font-mono"
                />
                <Button
                  onClick={handleValidateOTP}
                  disabled={startVisit.isPending || otpCode.length < 4}
                  size="sm"
                >
                  {startVisit.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  Verify
                </Button>
              </div>
            </div>
            {error && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                {error.toLowerCase().includes('restricted to biometric') && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-2.5 space-y-2">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      This patient is restricted to biometric verification at their registered facility. OTP is not allowed.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                      onClick={() => {
                        setError(null);
                        setStep('idle');
                        handleStartBiometric();
                      }}
                    >
                      <Fingerprint className="mr-2 h-3.5 w-3.5" />
                      Use Biometric Instead
                    </Button>
                  </div>
                )}
                {error.toLowerCase().includes('whitelist') && !error.toLowerCase().includes('restricted to biometric') && (
                  <p className="text-xs text-muted-foreground">
                    You may need to submit an OTP whitelist request for this beneficiary via DHA.
                  </p>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSendOTP}
              disabled={sendOTP.isPending}
            >
              Resend OTP
            </Button>
          </div>
        )}

        {/* Step 2b: Biometric pending */}
        {step === 'biometric_pending' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Waiting for fingerprint capture…</span>
            </div>
            {biometricIframeUrl && (
              <div className="rounded-md border overflow-hidden">
                <iframe
                  src={biometricIframeUrl}
                  title="Biometric Fingerprint Capture"
                  className="w-full h-[280px]"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              </div>
            )}
            {!biometricIframeUrl && (
              <p className="text-xs text-muted-foreground">
                Biometric device should be active. The system is polling for authorization…
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelBiometric}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Step 3: Consent validated */}
        {step === 'validated' && consentDetail && (
          <div className="space-y-2">
            <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-3 space-y-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-400">
                Consent obtained successfully
                {method === 'biometric' && ' (biometric)'}
              </p>
              {consentDetail?.expires_at && (
                <p className="text-xs text-green-700 dark:text-green-500">
                  Valid until {format(parseISO(consentDetail.expires_at), 'dd MMM yyyy, HH:mm')}
                </p>
              )}
              {consentDetail && !consentDetail.is_valid && (
                <div className="mt-2">
                  <Badge variant="destructive" className="text-xs">Expired — re-consent required</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setStep('idle');
                      setConsentId(undefined);
                      setError(null);
                    }}
                  >
                    Re-obtain Consent
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
