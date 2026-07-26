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

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  Loader2,
  Send,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  SkipForward,
  X,
  AlertTriangle,
  Fingerprint,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useSendConsentOTP, useStartVisit } from '@/lib/hooks/use-sha';
import { useBenefitInterventions } from '@/lib/hooks/use-benefit-interventions';
import type { InterventionOption } from '@/lib/hooks/use-benefit-interventions';
import { useFacility } from '@/lib/context/facility-context';
import { OtpWhitelistRequestSheet, WhitelistStatusBadge } from './otp-whitelist-request-sheet';
import { ContactPicker, DEFAULT_OTP_RECIPIENT } from './contact-picker';
import type { SHAMember } from '@/lib/types/sha';
import { extractDHAErrorMessage } from '@/lib/sha/error-parser';
import { toCrId } from '@/lib/sha/ilm-parsers';

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
  /** Patient date of birth (ISO string) — used for minor detection in OTP/whitelist flows */
  patientDateOfBirth?: string;
  /** Called when an error occurs during consent (for parent to show toast etc.) */
  onError?: (error: string) => void;
  /** Custom className */
  className?: string;
  /** Optional beneficiary display name for dependent workflows */
  patientName?: string;
  /** Optional patient CR/SHA lookup identifier used for dependant-first benefit search */
  patientCrNumber?: string;
  /** Optional workflow context for principal vs dependent admissions */
  workflowMemberType?: 'principal' | 'dependent';
}

type StepState =
  | 'checking'         // Looking up SHA member
  | 'not_eligible'     // No SHA coverage — skip
  | 'ready'            // SHA eligible, ready to obtain consent
  | 'biometric_pending' // Biometric dialog open, waiting for fingerprint
  | 'biometric_failed'  // Biometrics failed/expired, showing OTP fallback option
  | 'otp_sent'         // OTP sent, waiting for code
  | 'validating'       // Validating OTP or starting visit with auth_guid
  | 'done'             // Consent obtained
  | 'skipped';         // User chose to skip

/**
 * Derive the DHA service_type from the selected intervention's access_point.
 * - "IP" → INPATIENT
 * - "OP" → OUTPATIENT
 * - "OP and IP" or missing → use code prefix heuristic
 */
function deriveServiceType(intervention: InterventionOption | null): 'INPATIENT' | 'OUTPATIENT' {
  if (!intervention) return 'OUTPATIENT';
  const ap = intervention.accessPoint;
  if (ap === 'IP') return 'INPATIENT';
  if (ap === 'OP') return 'OUTPATIENT';
  const prefix = intervention.code.split('-').slice(0, 2).join('-');
  const inpatientPrefixes = ['SHA-07', 'SHA-19', 'SHA-03', 'SHA-13', 'SHA-20'];
  if (inpatientPrefixes.includes(prefix)) return 'INPATIENT';
  return 'OUTPATIENT';
}

// ============================================================================
// Component
// ============================================================================

export function SHAConsentStep({
  patientId,
  encounterId,
  onComplete,
  onError,
  autoCheck = true,
  patientDateOfBirth,
  className,
  patientName,
  patientCrNumber,
  workflowMemberType,
}: SHAConsentStepProps) {
  const [step, setStep] = useState<StepState>('checking');
  const [shaMember, setSHAMember] = useState<SHAMember | null>(null);
  const [eligibilityInfo, setEligibilityInfo] = useState<{
    verifiedName?: string;
    coverageEndDate?: string;
  } | null>(null);
  const [consentId, setConsentId] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpServerMessage, setOtpServerMessage] = useState<string | null>(null);
  const [isReusedConsent, setIsReusedConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingMember, setIsCreatingMember] = useState(false);

  // ---- Shared cascading benefit-package → intervention fetch ----
  const crId = useMemo(
    () => toCrId(patientCrNumber || shaMember?.sha_member_number || shaMember?.sha_number || ''),
    [shaMember, patientCrNumber],
  );
  const {
    benefitPackageOptions,
    benefitPackagesLoading,
    selectedBenefitPkgCode,
    setSelectedBenefitPkgCode,
    interventionOptions,
    interventionsLoading,
    selectedIntervention,
    setSelectedInterventionCode,
  } = useBenefitInterventions({
    patientCrId: crId,
    enabled: !!shaMember && !!crId,
  });

  // OTP resend countdown (seconds)
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Whitelist request sheet
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  // Existing whitelist status (checked on mount when SHA eligible)
  const [existingWhitelistStatus, setExistingWhitelistStatus] = useState<string | null>(null);
  const [isCheckingWhitelist, setIsCheckingWhitelist] = useState(false);

  // Inline biometric state (matches claims ConsentPanel pattern)
  const [biometricIframeUrl, setBiometricIframeUrl] = useState<string | null>(null);
  const [biometricAuthGuid, setBiometricAuthGuid] = useState<string | null>(null);
  const [biometricConsentId, setBiometricConsentId] = useState<number | null>(null);
  const biometricPollRef = useRef<NodeJS.Timeout | null>(null);

  // Contact picker state (for OTP target selection)
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>(undefined);

  const isMountedRef = useRef(true);
  const sendOTP = useSendConsentOTP();
  const startVisit = useStartVisit();
  const { facilityDetail } = useFacility();
  const facilityLevel = facilityDetail?.level;
  const facilityAgentNationalId = facilityDetail?.biometrics_agent_national_id || '';
  const hasCheckedRef = useRef(false);

  // Biometric consent is primary for Level 4+ facilities
  const isBiometricPrimary = useMemo(() => {
    if (!facilityLevel) return false;
    const numLevel = parseInt(facilityLevel.replace(/[^0-9]/g, ''), 10);
    return numLevel >= 4;
  }, [facilityLevel]);
  const isDependentWorkflow = workflowMemberType === 'dependent';

  // Check SHA eligibility on mount
  const checkEligibility = useCallback(async () => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    setStep('checking');
    try {
      // If we have an encounter, check if a DHA visit was already started (consent already obtained)
      if (encounterId) {
        try {
          const claims = await shaApi.getClaims({ encounter: encounterId });
          const visitAlreadyStarted = claims.results?.some(
            (c) => !!c.dha_visit_started_at
          );
          if (visitAlreadyStarted) {
            setStep('done');
            onComplete?.({ consented: true });
            return;
          }
        } catch {
          // Best effort — if claim lookup fails, proceed with eligibility check
        }
      }

      const result = await shaApi.checkPatientEligibility(patientId);
      if (result.is_eligible && result.member) {
        setSHAMember(result.member);
        setEligibilityInfo({
          verifiedName: result.verified_name,
          coverageEndDate: result.coverage_end_date,
        });
        setStep('ready');
      } else if (result.is_eligible) {
        // Eligible via direct DHA check but no local SHAMember record yet.
        // Still show OTP button — we'll create the member on-demand when user clicks Send OTP.
        setEligibilityInfo({
          verifiedName: result.verified_name,
          coverageEndDate: result.coverage_end_date,
        });
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
  }, [patientId, encounterId, onComplete]);

  useEffect(() => {
    if (autoCheck) {
      checkEligibility();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Check for existing whitelist requests once we have SHA member info
  useEffect(() => {
    if (step !== 'ready' || !shaMember) return;
    if (!crId) return;
    let cancelled = false;
    setIsCheckingWhitelist(true);
    shaApi
      .listLocalOtpWhitelists({ status: 'requested' })
      .then((result) => {
        if (cancelled) return;
        // Check if any pending whitelist matches this patient
        const match = result.results?.find(
          (r) => r.patient === patientId || r.beneficiary_cr_id === crId
        );
        if (match) {
          setExistingWhitelistStatus(match.status?.toUpperCase() || 'REQUESTED');
        }
      })
      .catch(() => { /* best effort */ })
      .finally(() => { if (!cancelled) setIsCheckingWhitelist(false); });
    return () => { cancelled = true; };
  }, [step, shaMember, patientId, crId]);

  // Cleanup intervals on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (biometricPollRef.current) clearInterval(biometricPollRef.current);
    };
  }, []);

  const handleSendOTP = async () => {
    setError(null);
    setOtpServerMessage(null);
    setIsReusedConsent(false);

    // If we don't have an SHAMember yet, create one on-demand
    let memberId = shaMember?.id;
    if (!memberId) {
      setIsCreatingMember(true);
      try {
        const created = await shaApi.ensureSHAMember(patientId);
        if (created) {
          setSHAMember(created);
          memberId = created.id;
        } else {
          setError('Could not create SHA member record. Try again or skip.');
          setIsCreatingMember(false);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create SHA member record');
        setIsCreatingMember(false);
        return;
      }
      setIsCreatingMember(false);
    }

    const interventionCode = selectedIntervention?.code || '';
    const beneficiaryContactId =
      selectedContactId && selectedContactId !== DEFAULT_OTP_RECIPIENT
        ? selectedContactId
        : undefined;
    sendOTP.mutate(
      {
        sha_member_id: memberId,
        ...(interventionCode ? { intervention_codes: [interventionCode] } : {}),
        ...(beneficiaryContactId ? { beneficiary_contact_id: beneficiaryContactId } : {}),
      },
      {
        onSuccess: (response) => {
          setConsentId(response.consent_id);
          const responseMessage = response.message?.trim();
          if (responseMessage) {
            setOtpServerMessage(responseMessage);
          }

          const reusedByMessage = (responseMessage || '').toLowerCase().includes('reused');
          const reusedByStatus = String(response.status || '').toUpperCase() === 'VALIDATED';
          const reused = reusedByMessage || reusedByStatus;
          setIsReusedConsent(reused);

          // In sandbox/UAT, DHA returns the OTP in the response — auto-fill for convenience
          if (!reused && response.sandbox_otp) {
            setOtpCode(response.sandbox_otp);
          } else if (reused) {
            setOtpCode('');
          }
          setStep('otp_sent');
          // Start 60s resend countdown
          setResendCountdown(60);
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setResendCountdown((prev) => {
              if (prev <= 1) {
                if (countdownRef.current) clearInterval(countdownRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        },
        onError: (err: unknown) => {
          const errorMsg = extractDHAErrorMessage(err) || 'Failed to send OTP';
          setError(errorMsg);
          onError?.(errorMsg);
        },
      }
    );
  };

  const handleValidateOTP = () => {
    if (!consentId || !otpCode.trim()) return;
    setError(null);
    setStep('validating');

    const interventionCode = selectedIntervention?.code || '';
    startVisit.mutate(
      {
        consent_id: consentId,
        otp_code: otpCode.trim(),
        service_type: deriveServiceType(selectedIntervention),
        ...(interventionCode ? { intervention_codes: [interventionCode] } : {}),
        ...(encounterId ? { encounter_id: encounterId } : {}),
      },
      {
        onSuccess: (response) => {
          setIsReusedConsent(false);
          setOtpServerMessage(null);
          setStep('done');
          setOtpCode('');
          onComplete?.({ consented: true, consentId: response.id });
        },
        onError: (err: unknown) => {
          const errorMsg = extractDHAErrorMessage(err) || 'Failed to verify OTP';
          setStep('otp_sent');
          setError(errorMsg);
          onError?.(errorMsg);
        },
      }
    );
  };

  // ---- Inline biometric flow (matches claims ConsentPanel pattern) ----

  const startBiometricPolling = (guid: string, cId: number) => {
    if (biometricPollRef.current) clearInterval(biometricPollRef.current);
    biometricPollRef.current = setInterval(async () => {
      try {
        const result = await shaApi.getBiometricAuthStatus(guid);
        if (!isMountedRef.current) return;
        const s = result.status?.toUpperCase();
        if (s === 'AUTHORIZED') {
          stopBiometricPolling();
          handleBiometricSuccess({ authGuid: guid, consentId: cId });
        } else if (s === 'FAILED' || s === 'REJECTED') {
          stopBiometricPolling();
          setStep('biometric_failed');
          setError('Biometric verification failed. Please try again or use OTP.');
        } else if (s === 'EXPIRED') {
          stopBiometricPolling();
          setStep('biometric_failed');
          setError('Biometric session expired. Please try again or use OTP.');
        }
      } catch {
        // Network error during polling — continue
      }
    }, 3000);
  };

  const stopBiometricPolling = () => {
    if (biometricPollRef.current) {
      clearInterval(biometricPollRef.current);
      biometricPollRef.current = null;
    }
  };

  const handleBiometricStart = async () => {
    setError(null);
    setStep('biometric_pending');
    const memberId = shaMember?.id;
    if (!memberId) {
      setError('SHA member record not found');
      setStep('ready');
      return;
    }
    try {
      const result = await shaApi.authorizeBiometric({
        sha_member_id: memberId,
        workstation_id: facilityDetail?.workstation_id || 'WS-001',
        agent_national_id: facilityAgentNationalId,
      });

      setBiometricConsentId(result.consent_id);
      setConsentId(result.consent_id);
      setBiometricAuthGuid(result.auth_guid);

      if (result.sandbox_mode) {
        // Sandbox — auto-approve after brief delay
        await new Promise((r) => setTimeout(r, 1500));
        handleBiometricSuccess({ authGuid: result.auth_guid, consentId: result.consent_id! });
        return;
      }

      setBiometricIframeUrl(result.iframe_url);
      startBiometricPolling(result.auth_guid, result.consent_id!);
    } catch (err: unknown) {
      setStep('ready');
      const errorMsg = extractDHAErrorMessage(err) || 'Failed to initiate biometric auth';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  const handleBiometricSuccess = (result: { authGuid: string; consentId: number }) => {
    stopBiometricPolling();
    setBiometricIframeUrl(null);
    setBiometricAuthGuid(result.authGuid);
    setBiometricConsentId(result.consentId);
    setConsentId(result.consentId);
    setError(null);
    setStep('validating');

    // Start visit using auth_guid (no OTP needed)
    const interventionCode = selectedIntervention?.code || '';
    startVisit.mutate(
      {
        consent_id: result.consentId,
        auth_guid: result.authGuid,
        service_type: deriveServiceType(selectedIntervention),
        ...(interventionCode ? { intervention_codes: [interventionCode] } : {}),
        ...(encounterId ? { encounter_id: encounterId } : {}),
      },
      {
        onSuccess: (response) => {
          setStep('done');
          onComplete?.({ consented: true, consentId: response.id });
        },
        onError: (err: unknown) => {
          const errorMsg = extractDHAErrorMessage(err) || 'Failed to start visit after biometric verification';
          setStep('biometric_failed');
          setError(errorMsg);
          onError?.(errorMsg);
        },
      }
    );
  };

  const handleBiometricCancel = async () => {
    stopBiometricPolling();
    if (biometricAuthGuid) {
      try {
        await shaApi.cancelBiometricAuth(biometricAuthGuid);
      } catch { /* best effort */ }
    }
    setBiometricAuthGuid(null);
    setBiometricIframeUrl(null);
    setBiometricConsentId(null);
    setStep('ready');
  };

  const handleSkip = () => {
    setStep('skipped');
    onComplete?.({ consented: false });
  };

  // Don't render anything if explicitly skipped
  if (step === 'skipped') {
    return null;
  }

  // Show a brief status for non-SHA patients
  if (step === 'not_eligible') {
    return (
      <div className={cn('rounded-lg border border-muted p-3', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>No active SHA coverage — patient will pay via selected payment method.</span>
        </div>
      </div>
    );
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
          {shaMember?.sha_member_number && (
            <Badge variant="outline" className="text-[10px]">
              {shaMember.sha_member_number}
            </Badge>
          )}
          {!shaMember && eligibilityInfo?.verifiedName && (
            <Badge variant="outline" className="text-[10px] text-green-600">
              Verified
            </Badge>
          )}
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

      {/* Step: Ready to obtain consent */}
      {step === 'ready' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {isBiometricPrimary
              ? 'Verify patient identity with fingerprint, then start the SHA visit.'
              : 'Select the visit intervention, then send a one-time password to the patient\u0027s phone.'}
            {eligibilityInfo?.verifiedName && (
              <>
                <span className="block mt-0.5 text-green-600 dark:text-green-400">
                  {isDependentWorkflow
                    ? `Coverage verified for principal ${eligibilityInfo.verifiedName}`
                    : `Coverage verified for ${eligibilityInfo.verifiedName}`}
                  {eligibilityInfo.coverageEndDate && ` • Valid until ${eligibilityInfo.coverageEndDate}`}
                </span>
                {isDependentWorkflow && patientName && (
                  <span className="block mt-0.5 text-emerald-600 dark:text-emerald-400">
                    Admitting dependant: {patientName}
                  </span>
                )}
              </>
            )}
          </p>

          {/* Benefit package selector (step 1) */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Benefit Package</Label>
            {benefitPackagesLoading ? (
              <div className="flex items-center gap-2 h-9 px-3 border rounded-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs text-muted-foreground">Loading packages...</span>
              </div>
            ) : benefitPackageOptions.length > 0 ? (
              <select
                value={selectedBenefitPkgCode}
                onChange={(e) => setSelectedBenefitPkgCode(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="">Select benefit package...</option>
                {benefitPackageOptions.map((pkg) => (
                  <option key={pkg.code} value={pkg.code}>
                    {pkg.code} — {pkg.name || 'Unknown'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                {shaMember
                  ? 'No eligible benefit packages found. OTP can still be sent.'
                  : 'Benefit packages will load after member verification. OTP can still be sent.'}
              </p>
            )}
          </div>

          {/* Intervention selector (step 2 — shown after benefit package is selected) */}
          {selectedBenefitPkgCode && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Intervention</Label>
              {interventionsLoading ? (
                <div className="flex items-center gap-2 h-9 px-3 border rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading interventions...</span>
                </div>
              ) : interventionOptions.length > 0 ? (
                <select
                  value={selectedIntervention?.code || ''}
                  onChange={(e) => setSelectedInterventionCode(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="">Select intervention...</option>
                  {interventionOptions.map((item) => {
                    const extra = item.paymentMechanism ? ` (${item.paymentMechanism})` : '';
                    return (
                      <option key={item.code} value={item.code}>
                        {item.code} — {item.name || 'Unknown'}{extra}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No interventions found for this package.
                </p>
              )}
            </div>
          )}

          {/* Contact picker (for OTP target) — only show when not biometric primary */}
          {!isBiometricPrimary && crId && (
            <ContactPicker
              beneficiaryCrId={crId}
              onSelect={setSelectedContactId}
              selectedContactId={selectedContactId}
              patientDateOfBirth={patientDateOfBirth}
            />
          )}

          {/* Existing whitelist request status */}
          {existingWhitelistStatus && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2">
              <span className="text-xs text-muted-foreground">OTP Whitelist:</span>
              <WhitelistStatusBadge status={existingWhitelistStatus} />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Action buttons: always show both biometric and OTP options */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleSendOTP}
              disabled={sendOTP.isPending || isCreatingMember || (!!crId && !selectedContactId)}
              size="sm"
            >
              {(sendOTP.isPending || isCreatingMember) ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-2 h-3.5 w-3.5" />
              )}
              {isCreatingMember ? 'Preparing...' : 'Send OTP'}
            </Button>
            <Button
              variant={isBiometricPrimary ? 'default' : 'outline'}
              onClick={handleBiometricStart}
              disabled={!!crId && !selectedContactId}
              size="sm"
            >
              <Fingerprint className="mr-2 h-3.5 w-3.5" />
              {isBiometricPrimary ? 'Verify Fingerprint' : 'Biometric'}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Enter OTP */}
      {(step === 'otp_sent' || step === 'validating') && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter the 6-digit code sent to the patient&apos;s phone.
          </p>
          {isReusedConsent && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                {otpServerMessage || 'An active consent token for today was found and reused.'}
              </p>
              <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">
                No OTP entry is required. Proceed to continue with this visit.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <Label htmlFor="sha-otp-checkin" className="sr-only">OTP Code</Label>
              <Input
                id="sha-otp-checkin"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder={isReusedConsent ? 'OTP not required' : '6-digit code'}
                maxLength={6}
                className="font-mono h-9"
                disabled={step === 'validating' || isReusedConsent}
              />
            </div>
            <Button
              onClick={() => {
                if (isReusedConsent) {
                  if (consentId) {
                    setStep('done');
                    onComplete?.({ consented: true, consentId });
                  }
                  return;
                }
                handleValidateOTP();
              }}
              disabled={step === 'validating' || (!isReusedConsent && otpCode.length < 4)}
              size="sm"
              className="h-9"
            >
              {step === 'validating' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isReusedConsent ? 'Proceed' : 'Verify'}
            </Button>
          </div>
          {error && (() => {
            const lower = error.toLowerCase();
            const isBiometricRestricted = lower.includes('restricted to biometric');
            const isWhitelistError = lower.includes('whitelist');
            if (isBiometricRestricted) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 space-y-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
                  </div>
                  <div className="flex flex-row flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0"
                      onClick={() => {
                        setError(null);
                        handleBiometricStart();
                      }}
                    >
                      <Fingerprint className="mr-2 h-3.5 w-3.5" />
                      Use Biometric Instead
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0"
                      onClick={() => setWhitelistOpen(true)}
                    >
                      <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                      Request OTP Whitelist
                    </Button>
                  </div>
                </div>
              );
            }
            if (isWhitelistError) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 space-y-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0"
                    onClick={() => setWhitelistOpen(true)}
                  >
                    <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                    Request OTP Whitelist
                  </Button>
                </div>
              );
            }
            return <p className="text-xs text-destructive">{error}</p>;
          })()}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSendOTP}
              disabled={sendOTP.isPending || resendCountdown > 0 || isReusedConsent}
              className="text-xs h-7"
            >
              {sendOTP.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              {resendCountdown > 0 ? `Resend OTP (${resendCountdown}s)` : 'Resend OTP'}
            </Button>
            {resendCountdown > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Code expires in {resendCountdown}s
              </span>
            )}
          </div>

          {/* OTP Whitelist Request Sheet */}
          <OtpWhitelistRequestSheet
            open={whitelistOpen}
            onOpenChange={setWhitelistOpen}
            shaNumber={shaMember?.sha_member_number || shaMember?.sha_number || ''}
            facilityFrCode={facilityDetail?.sha_facility_code || ''}
            beneficiaryName={eligibilityInfo?.verifiedName}
            patientDateOfBirth={patientDateOfBirth}
          />
        </div>
      )}

      {/* Step: Biometric pending — inline iframe (matches claims ConsentPanel) */}
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
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBiometricCancel}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Step: Biometric failed — offer OTP fallback */}
      {step === 'biometric_failed' && (
        <div className="space-y-3">
          <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Biometric verification unavailable
                </p>
                <p className="text-xs text-muted-foreground">
                  {error || 'Fingerprint verification could not be completed. You can send an OTP to the patient\u0027s phone instead.'}
                </p>
              </div>
            </div>
          </div>

          {/* Check for DHA-specific errors (restricted to biometric / whitelist) */}
          {error && (() => {
            const lower = error.toLowerCase();
            const isBiometricRestricted = lower.includes('restricted to biometric');
            const isWhitelist = lower.includes('whitelist');
            if (isBiometricRestricted) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 space-y-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
                  </div>
                  <div className="flex flex-row flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0"
                      onClick={() => {
                        setError(null);
                        handleBiometricStart();
                      }}
                    >
                      <Fingerprint className="mr-2 h-3.5 w-3.5" />
                      Use Biometric Instead
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0"
                      onClick={() => setWhitelistOpen(true)}
                    >
                      <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                      Request OTP Whitelist
                    </Button>
                  </div>
                </div>
              );
            }
            if (isWhitelist) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 space-y-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 shrink-0"
                    onClick={() => setWhitelistOpen(true)}
                  >
                    <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                    Request OTP Whitelist
                  </Button>
                </div>
              );
            }
            return null;
          })()}

          {/* Contact picker for OTP target */}
          {crId && (
            <ContactPicker
              beneficiaryCrId={crId}
              onSelect={setSelectedContactId}
              selectedContactId={selectedContactId}
              patientDateOfBirth={patientDateOfBirth}
            />
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => {
                setError(null);
                handleBiometricStart();
              }}
              variant="outline"
              disabled={!!crId && !selectedContactId}
              size="sm"
            >
              <Fingerprint className="mr-1.5 h-3.5 w-3.5" />
              Retry Biometric
            </Button>
            <Button
              onClick={handleSendOTP}
              disabled={sendOTP.isPending || isCreatingMember || (!!crId && !selectedContactId)}
              size="sm"
            >
              {(sendOTP.isPending || isCreatingMember) ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Send OTP Instead
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWhitelistOpen(true)}
              className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Request OTP Whitelist
            </Button>
          </div>

          {/* OTP Whitelist Request Sheet (for biometric fallback) */}
          <OtpWhitelistRequestSheet
            open={whitelistOpen}
            onOpenChange={setWhitelistOpen}
            shaNumber={shaMember?.sha_member_number || shaMember?.sha_number || ''}
            facilityFrCode={facilityDetail?.sha_facility_code || ''}
            beneficiaryName={eligibilityInfo?.verifiedName}
            patientDateOfBirth={patientDateOfBirth}
          />
        </div>
      )}

      {/* Step: Validating (biometric path — no OTP input needed) */}
      {step === 'validating' && biometricAuthGuid && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Starting SHA visit...</span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
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
