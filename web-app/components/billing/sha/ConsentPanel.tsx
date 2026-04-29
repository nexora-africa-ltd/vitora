/**
 * DHA HIE Consent Panel
 * Handles OTP-based consent verification for SHA claims
 *
 * Flow:
 * 1. User clicks "Send OTP" → OTP sent to member's phone
 * 2. User enters OTP code → validates and obtains consent token
 * 3. Consent token displayed with expiry info
 */
'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ShieldCheck,
  Send,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSendConsentOTP, useStartVisit, useConsentDetail } from '@/lib/hooks/use-sha';
import type { ConsentStatus } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface ConsentPanelProps {
  /** SHA Member ID to obtain consent for */
  shaMemberId: number;
  /** Existing consent token ID (if already obtained) */
  consentId?: number;
  /** Callback when consent is successfully obtained */
  onConsentObtained?: (consentId: number, consentToken: string) => void;
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
  onConsentObtained,
  className,
}: ConsentPanelProps) {
  const [step, setStep] = useState<'idle' | 'otp_sent' | 'validated'>(
    initialConsentId ? 'validated' : 'idle'
  );
  const [otpCode, setOtpCode] = useState('');
  const [consentId, setConsentId] = useState<number | undefined>(initialConsentId);
  const [error, setError] = useState<string | null>(null);

  const sendOTP = useSendConsentOTP();
  const startVisit = useStartVisit();
  const { data: consentDetail } = useConsentDetail(consentId);

  const handleSendOTP = async () => {
    setError(null);
    sendOTP.mutate(
      { sha_member_id: shaMemberId },
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

  const handleValidateOTP = async () => {
    if (!consentId || !otpCode.trim()) return;
    setError(null);
    startVisit.mutate(
      { consent_id: consentId, otp_code: otpCode.trim() },
      {
        onSuccess: (response) => {
          setStep('validated');
          setOtpCode('');
          onConsentObtained?.(response.id, response.consent_token);
        },
        onError: (err: Error) => {
          setError(err.message || 'Invalid OTP code');
        },
      }
    );
  };

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Patient Consent
          </CardTitle>
          {consentDetail && getStatusBadge(consentDetail.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Send OTP */}
        {step === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Send a one-time password to the patient&apos;s registered phone number for consent verification.
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
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
          </div>
        )}

        {/* Step 2: Enter OTP */}
        {step === 'otp_sent' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit OTP code sent to the patient&apos;s phone.
            </p>
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
              <p className="text-sm text-destructive">{error}</p>
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

        {/* Step 3: Consent validated */}
        {step === 'validated' && consentDetail && (
          <div className="space-y-2">
            <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-3 space-y-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-400">
                Consent obtained successfully
              </p>
              {consentDetail.expires_at && (
                <p className="text-xs text-green-700 dark:text-green-500">
                  Valid until {format(parseISO(consentDetail.expires_at), 'dd MMM yyyy, HH:mm')}
                </p>
              )}
              {!consentDetail.is_valid && (
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
