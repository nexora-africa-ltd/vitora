/**
 * DHA HIE Consent Panel
 * Handles OTP-based and biometric consent verification for SHA claims.
 *
 * Flows:
 * A) OTP: Send OTP → Enter code → Validate → consent token
 * B) Biometric: Initiate → iframe fingerprint capture → poll status → consent token
 */
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ShieldCheck,
  ShieldAlert,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSendConsentOTP, useStartVisit, useConsentDetail } from '@/lib/hooks/use-sha';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ConsentStatus, ClaimFlow } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useFacility } from '@/lib/context/facility-context';
import { ContactPicker } from '@/components/patients/contact-picker';
import { toCrId } from '@/lib/sha/ilm-parsers';

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
  /** Patient's DHA Client Registry ID (CR number) — used to fetch live entitled interventions */
  patientCrId?: string;
  /** Existing consent token ID (if already obtained) */
  consentId?: number;
  /** Intervention codes to include with the OTP request (determines DHA benefit package) */
  interventionCodes?: string[];
  /**
   * Callback when consent is successfully obtained. The `credential` arg
   * carries the raw OTP / biometric GUID so downstream steps can call
   * DHA ILM endpoints without re-prompting the patient. The `interventionCode`
   * is the code the user selected during consent — should be reused for start_visit.
   */
  onConsentObtained?: (
    consentId: number,
    consentToken: string,
    credential: ConsentCredential,
    interventionCode?: string,
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
// Helpers
// ============================================================================

interface DhaInterventionItem {
  code: string;
  name: string;
  paymentMechanism?: string;
  tariff?: number;
}

/**
 * Extract intervention items from the DHA `ilmBenefitInterventions` response.
 * DHA returns deeply nested payloads — this normalizes across known shapes.
 */
function extractDhaInterventionItems(data: unknown): DhaInterventionItem[] {
  if (!data) return [];
  const items: DhaInterventionItem[] = [];

  function extract(obj: unknown): void {
    if (!obj) return;
    if (Array.isArray(obj)) {
      for (const item of obj) extract(item);
      return;
    }
    if (typeof obj !== 'object') return;
    const rec = obj as Record<string, unknown>;

    // If this object has `code` or `interventionCode`, it's likely an intervention
    const code = String(rec.code || rec.interventionCode || rec.intervention_code || '');
    const name = String(
      rec.name || rec.interventionName || rec.intervention_name ||
      rec.benefit_name || rec.benefitName || rec.description || ''
    );
    if (code) {
      items.push({
        code,
        name: name || code,
        paymentMechanism: String(rec.paymentMechanism || rec.payment_mechanism || ''),
        tariff: typeof rec.overallTariff === 'number' ? rec.overallTariff
          : typeof rec.overall_tariff === 'number' ? rec.overall_tariff
          : undefined,
      });
      return;
    }

    // Recurse into nested arrays
    if (Array.isArray(rec.results)) extract(rec.results);
    if (Array.isArray(rec.data)) extract(rec.data);
    if (Array.isArray(rec.interventions)) extract(rec.interventions);
    if (Array.isArray(rec.benefits)) extract(rec.benefits);
  }

  extract(data);
  return items;
}

// ============================================================================
// Component
// ============================================================================

export function ConsentPanel({
  shaMemberId,
  patientCrId,
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

  // ---- Intervention selection: live DHA query → static catalog fallback ----
  // Per DHA docs (Scenario 6), the correct flow is:
  //   1. Call `ilmBenefitInterventions(patient_id, sub_benefit_code)` to get
  //      the interventions DHA explicitly allows for this patient + facility.
  //   2. Fall back to the static OCL catalog only if DHA returns nothing.
  const { facilityDetail } = useFacility();
  const facilityLevel = facilityDetail?.level ? parseInt(facilityDetail.level.replace(/[^0-9]/g, ''), 10) : undefined;
  const facilityAgentNationalId = facilityDetail?.biometrics_agent_national_id || '';
  const facilityLevelKnown = typeof facilityLevel === 'number' && !Number.isNaN(facilityLevel);
  const isPhcLevel = facilityLevelKnown && facilityLevel! <= 3;

  // ---- Resolve patient CR ID: prop first, then derive from SHA member ----
  const { data: fallbackSHAMember } = useQuery({
    queryKey: ['sha-member', shaMemberId],
    queryFn: () => shaApi.getSHAMember(shaMemberId),
    enabled: !patientCrId && !!shaMemberId,
    staleTime: 5 * 60 * 1000,
  });
  const resolvedCrId = patientCrId || (fallbackSHAMember && toCrId(fallbackSHAMember.sha_member_number));

  // Step 1: Live DHA benefit-interventions (requires patient CR ID).
  // Try SHA-12-SC-01 (Outpatient PHC) first — most dispensaries are PHC-contracted.
  const { data: liveInterventionsResp } = useQuery({
    queryKey: ['sha-live-benefit-interventions', resolvedCrId],
    queryFn: () =>
      shaApi.ilmBenefitInterventions({
        patient_id: resolvedCrId!,
        sub_benefit_code: 'SHA-12-SC-01',
      }),
    enabled: !!resolvedCrId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });

  // Parse the live DHA response into options.
  const liveOptions = useMemo(() => {
    if (!liveInterventionsResp?.data) return [];
    const items = extractDhaInterventionItems(liveInterventionsResp.data);
    return items
      .filter((i) => i.code && i.name)
      .map((i) => ({
        code: i.code,
        label: `${i.name}${i.paymentMechanism ? ` · ${i.paymentMechanism}` : ''}${i.tariff ? ` · KES ${Number(i.tariff).toLocaleString()}` : ''}`,
        schemes: undefined as string[] | undefined,
      }));
  }, [liveInterventionsResp]);

  // Step 2: Static catalog fallback (FFS + OP + active + level-filtered).
  const { data: staticInterventions } = useQuery({
    queryKey: ['sha-interventions-for-consent-static', facilityLevel],
    queryFn: () =>
      shaApi.searchInterventionCodes('', 100, facilityLevel, {
        paymentMechanism: isPhcLevel ? 'FEE FOR SERVICE,FIXED FEE FOR SERVICE,CAPITATION' : 'FEE FOR SERVICE',
        accessPoint: 'OP',
        activeOnly: true,
      }),
    // Only run if live DHA returned nothing and we have a facility level
    enabled: facilityLevelKnown && liveOptions.length === 0,
    staleTime: 60 * 60 * 1000,
  });

  const staticOptions = useMemo(() => {
    if (!staticInterventions?.length) return [];
    return staticInterventions.map((i) => ({
      code: i.code,
      schemes: i.schemes,
      label: `${i.name}${i.category ? ` · ${i.category}` : ''}${i.price ? ` · KES ${Number(i.price).toLocaleString()}` : ''}`,
    }));
  }, [staticInterventions]);

  // Use live DHA results when available, otherwise fall back to static catalog.
  const interventionOptions = liveOptions.length > 0 ? liveOptions : staticOptions;

  const [selectedIntervention, setSelectedIntervention] = useState(
    interventionCodes?.[0] || ''
  );
  // Update selection when interventions load
  useEffect(() => {
    if (!selectedIntervention && interventionOptions.length > 0) {
      setSelectedIntervention(interventionOptions[0]!.code);
    }
  }, [interventionOptions, selectedIntervention]);

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

  // Contact selection for OTP recipient
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>();

  // ---- Auto-detect existing PENDING consent from check-in ----
  // If OTP was already sent (e.g. during check-in or by automation),
  // skip ahead to the "Enter OTP" step instead of showing "Send OTP".
  const hasCheckedExisting = useRef(false);
  useEffect(() => {
    if (hasCheckedExisting.current || initialConsentId || step !== 'idle') return;
    hasCheckedExisting.current = true;

    shaApi.getLatestConsent(shaMemberId).then((data) => {
      if (data?.exists && data?.id) {
        setConsentId(data.id);
        if (data.status === 'VALIDATED') {
          setStep('validated');
          if (data.consent_token) {
            onConsentObtained?.(data.id, data.consent_token, {}, selectedIntervention);
          }
        } else if (data.status === 'PENDING') {
          // OTP already sent — jump to entry step
          setStep('otp_sent');
        }
      }
    }).catch(() => {
      // 404 or error — no existing consent, stay in idle (normal flow)
    });
  }, [shaMemberId, initialConsentId, step, onConsentObtained]);

  const handleSendOTP = async () => {
    setError(null);
    setMethod('otp');
    const codes = interventionCodes?.length
      ? interventionCodes
      : selectedIntervention ? [selectedIntervention] : [];
    sendOTP.mutate(
      {
        sha_member_id: shaMemberId,
        ...(codes.length ? { intervention_codes: codes } : {}),
        ...(selectedContactId ? { beneficiary_contact_id: selectedContactId } : {}),
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
    const codes = interventionCodes?.length
      ? interventionCodes
      : selectedIntervention ? [selectedIntervention] : [];
    startVisit.mutate(
      {
        consent_id: consentId,
        otp_code: submittedOtp,
        ...(codes.length ? { intervention_codes: codes } : {}),
      },
      {
        onSuccess: (response) => {
          setStep('validated');
          setOtpCode('');
          onConsentObtained?.(response.id, response.consent_token, { otp: submittedOtp }, selectedIntervention);
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
        workstation_id: facilityDetail?.workstation_id || 'vitora-web',
        agent_national_id: facilityAgentNationalId,
      });
      setConsentId(result.consent_id);
      setBiometricAuthGuid(result.auth_guid);
      setBiometricIframeUrl(result.iframe_url);
      if (result.sandbox_mode) {
        setStep('validated');
        stopPolling();
        const sandboxToken = result.consent_token || '';
        onConsentObtained?.(result.consent_id!, sandboxToken, { authGuid: result.auth_guid }, selectedIntervention);
        return;
      }
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
          onConsentObtained?.(consentId!, status.consent_token, { authGuid: biometricAuthGuid }, selectedIntervention);
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
                PHC · simplified
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
              Select the service type and verify patient consent via OTP or biometric.
            </p>
            {/* Intervention select — shown when no interventions are pre-set */}
            {!interventionCodes?.length && (
              <div className="space-y-1">
                <Label className="text-xs">Service / Intervention</Label>
                <Select value={selectedIntervention} onValueChange={setSelectedIntervention}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select intervention" />
                  </SelectTrigger>
                  <SelectContent>
                    {interventionOptions.map((opt) => (
                      <SelectItem key={opt.code} value={opt.code} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {resolvedCrId && (
              <ContactPicker
                beneficiaryCrId={resolvedCrId}
                onSelect={setSelectedContactId}
                selectedContactId={selectedContactId}
              />
            )}
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
              Enter the OTP code sent to the patient&apos;s phone.
            </p>
            {/* Intervention select — also available during OTP entry */}
            {!interventionCodes?.length && (
              <div className="space-y-1">
                <Label className="text-xs">Service / Intervention</Label>
                <Select value={selectedIntervention} onValueChange={setSelectedIntervention}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select intervention" />
                  </SelectTrigger>
                  <SelectContent>
                    {interventionOptions.map((opt) => (
                      <SelectItem key={opt.code} value={opt.code} className="text-xs">
                        {opt.label}
                        {opt.schemes && opt.schemes.length > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            · {opt.schemes.join(', ')}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {resolvedCrId && (
              <ContactPicker
                beneficiaryCrId={resolvedCrId}
                onSelect={setSelectedContactId}
                selectedContactId={selectedContactId}
              />
            )}
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
                {otpCode.length >= 4 ? (
                  <Button
                    onClick={handleValidateOTP}
                    disabled={startVisit.isPending}
                    size="sm"
                  >
                    {startVisit.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" />
                    )}
                    Verify
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleSendOTP}
                    disabled={sendOTP.isPending}
                    size="sm"
                  >
                    {sendOTP.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {consentId ? 'Resend OTP' : 'Send OTP'}
                  </Button>
                )}
              </div>
              {!otpCode && (
                <p className="text-[11px] text-muted-foreground">
                  Ask the patient for the OTP. If not received, click &quot;Resend OTP&quot;.
                </p>
              )}
            </div>
            {error && (
              <div className="space-y-2">
                {(() => {
                  const lower = error.toLowerCase();
                  const isBiometricRestricted = lower.includes('restricted to biometric');
                  const isWhitelist = lower.includes('whitelist');
                  const hasKnownGuidance = isBiometricRestricted || isWhitelist;

                  return (
                    <>
                      {!hasKnownGuidance && (
                        <p className="text-sm text-destructive">{error}</p>
                      )}
                      {isBiometricRestricted && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 space-y-3">
                          <div className="flex gap-2">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                            <p className="text-sm text-amber-900 dark:text-amber-200">
                              {error}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
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
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                              asChild
                            >
                              <a href="/transactions/sha-claims/whitelist">
                                <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                                Request OTP Whitelist
                              </a>
                            </Button>
                          </div>
                        </div>
                      )}
                      {!isBiometricRestricted && isWhitelist && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 space-y-3">
                          <div className="flex gap-2">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                            <p className="text-sm text-amber-900 dark:text-amber-200">
                              {error}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                            asChild
                          >
                            <a href="/transactions/sha-claims/whitelist">
                              <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                              Request OTP Whitelist
                            </a>
                          </Button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
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
