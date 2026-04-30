/**
 * SHA Consent Step
 *
 * Inline OTP consent flow shown after check-in for SHA-eligible patients.
 * Can be skipped (consent deferred to billing/claims time).
 *
 * Flow:
 * 1. Auto-checks if patient has an SHAMember record
 * 2. If eligible → shows "Obtain Consent" OTP wizard inline
 * 3. User can skip → consent will be obtained later at billing
 * 4. On success → links consent token to the encounter created at check-in
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Loader2,
  Send,
  KeyRound,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useSendConsentOTP, useStartVisit } from '@/lib/hooks/use-sha';
import type { SHAMember } from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

interface SHAConsentStepProps {
  /** Patient ID to look up SHA membership */
  patientId: number;
  /** Encounter ID created during check-in (to link consent) */
  encounterId?: number | null;
  /** Called when consent is obtained or skipped */
  onComplete?: (result: { consented: boolean; consentId?: number }) => void;
  /** Whether to auto-check on mount */
  autoCheck?: boolean;
  /** Custom className */
  className?: string;
}

type StepState =
  | 'checking'       // Looking up SHA member
  | 'not_eligible'   // No SHA member record — skip
  | 'ready'          // SHA member found, ready to send OTP
  | 'otp_sent'       // OTP sent, waiting for code
  | 'validating'     // Validating OTP
  | 'done'           // Consent obtained
  | 'skipped';       // User chose to skip

// ============================================================================
// Component
// ============================================================================

export function SHAConsentStep({
  patientId,
  encounterId,
  onComplete,
  autoCheck = true,
  className,
}: SHAConsentStepProps) {
  const [step, setStep] = useState<StepState>('checking');
  const [shaMember, setSHAMember] = useState<SHAMember | null>(null);
  const [consentId, setConsentId] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sendOTP = useSendConsentOTP();
  const startVisit = useStartVisit();

  // Check SHA eligibility on mount
  const checkEligibility = useCallback(async () => {
    setStep('checking');
    try {
      const result = await shaApi.checkPatientEligibility(patientId);
      if (result.is_eligible && result.member) {
        setSHAMember(result.member);
        setStep('ready');
      } else {
        setStep('not_eligible');
        onComplete?.({ consented: false });
      }
    } catch {
      // If eligibility check fails, don't block the flow
      setStep('not_eligible');
      onComplete?.({ consented: false });
    }
  }, [patientId, onComplete]);

  useEffect(() => {
    if (autoCheck) {
      checkEligibility();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handleSendOTP = () => {
    if (!shaMember) return;
    setError(null);

    sendOTP.mutate(
      { sha_member_id: shaMember.id },
      {
        onSuccess: (response) => {
          setConsentId(response.consent_id);
          setStep('otp_sent');
        },
        onError: (err: Error) => {
          setError(err.message || 'Failed to send OTP');
        },
      }
    );
  };

  const handleValidateOTP = () => {
    if (!consentId || !otpCode.trim()) return;
    setError(null);
    setStep('validating');

    startVisit.mutate(
      {
        consent_id: consentId,
        otp_code: otpCode.trim(),
        ...(encounterId ? { encounter_id: encounterId } : {}),
      },
      {
        onSuccess: (response) => {
          setStep('done');
          setOtpCode('');
          onComplete?.({ consented: true, consentId: response.id });
        },
        onError: (err: Error) => {
          setStep('otp_sent');
          setError(err.message || 'Invalid OTP code');
        },
      }
    );
  };

  const handleSkip = () => {
    setStep('skipped');
    onComplete?.({ consented: false });
  };

  // Don't render anything for non-SHA patients
  if (step === 'not_eligible' || step === 'skipped') {
    return null;
  }

  // Loading state
  if (step === 'checking') {
    return (
      <div className={cn('rounded-lg border p-4', className)}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking SHA coverage...
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">SHA Visit Consent</span>
          <Badge variant="outline" className="text-[10px]">
            {shaMember?.sha_member_number}
          </Badge>
        </div>
        {step !== 'done' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-xs h-7"
          >
            <SkipForward className="mr-1 h-3 w-3" />
            Skip
          </Button>
        )}
      </div>

      {/* Step: Ready to send OTP */}
      {step === 'ready' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Send a one-time password to the patient&apos;s phone to authorize this visit with DHA.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            onClick={handleSendOTP}
            disabled={sendOTP.isPending}
            size="sm"
          >
            {sendOTP.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-2 h-3.5 w-3.5" />
            )}
            Send OTP
          </Button>
        </div>
      )}

      {/* Step: Enter OTP */}
      {(step === 'otp_sent' || step === 'validating') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter the 6-digit code sent to the patient&apos;s phone.
          </p>
          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <Label htmlFor="sha-otp-checkin" className="sr-only">OTP Code</Label>
              <Input
                id="sha-otp-checkin"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="font-mono h-9 max-w-[140px]"
                disabled={step === 'validating'}
              />
            </div>
            <Button
              onClick={handleValidateOTP}
              disabled={step === 'validating' || otpCode.length < 4}
              size="sm"
              className="h-9"
            >
              {step === 'validating' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              )}
              Verify
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSendOTP}
            disabled={sendOTP.isPending}
            className="text-xs h-7"
          >
            Resend OTP
          </Button>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Visit consent obtained
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
