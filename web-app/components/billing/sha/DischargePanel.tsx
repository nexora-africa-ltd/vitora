/**
 * DischargePanel — Inpatient SHA claim discharge workflow.
 *
 * Per DHA HIE spec (Scenarios 1-3), inpatient claims are submitted via
 * the discharge flow:
 *   1. Send discharge OTP (or initiate biometric auth)
 *   2. Collect OTP/auth_guid + discharge details
 *   3. Call POST /api/v1/claims/discharge → claim submitted to SHA
 *
 * The discharge call simultaneously discharges the patient and submits the claim.
 */
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Fingerprint, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HelpPopover } from '@/components/shared/help-popover';
import { shaApi } from '@/lib/api/sha';
import { billingApi } from '@/lib/api/billing';
import { inpatientApi } from '@/lib/api/inpatient';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import { useQuery } from '@tanstack/react-query';
import { useFacility } from '@/lib/context/facility-context';

const DISCHARGE_REASONS = [
  { value: 'RECOVERED', label: 'Recovered' },
  { value: 'IMPROVED', label: 'Improved' },
  { value: 'TRANSFERRED', label: 'Transferred' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'DAMA', label: 'Discharged Against Medical Advice' },
  { value: 'ABSCONDED', label: 'Absconded' },
  { value: 'OTHER', label: 'Other' },
] as const;

interface DischargePanelProps {
  claimId: number;
  flow: ClaimFlowInfo;
  claimPatientId?: number;
  claimEncounterId?: number;
  shaMemberId?: number;
  consentToken?: string;
  patientExternalId?: string;
  invoiceNumber?: string;
  invoiceId?: number | null;
  facilityLevel?: number;
  activeInterventions?: Array<{
    intervention_code: string;
    is_per_diem?: boolean;
    level2_tariff?: string | null;
    level3_tariff?: string | null;
    level4_tariff?: string | null;
    level5_tariff?: string | null;
    level6_tariff?: string | null;
  }>;
  onChange?: () => void;
}

type Step = 'details' | 'otp_sent' | 'complete';

function extractOtpFromMessage(message: string): string {
  const match = message.match(/\b(\d{4,8})\b/);
  return match ? match[1] : '';
}

export function DischargePanel({
  claimId,
  flow,
  claimPatientId,
  claimEncounterId,
  shaMemberId,
  consentToken = '',
  patientExternalId = '',
  invoiceNumber: initialInvoice = '',
  invoiceId,
  facilityLevel,
  activeInterventions = [],
  onChange,
}: DischargePanelProps) {
  const [step, setStep] = useState<Step>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [dischargeDate, setDischargeDate] = useState(
    new Date().toISOString().split('T')[0]!
  );
  const [dischargeReason, setDischargeReason] = useState('RECOVERED');
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoice);
  const [token, setToken] = useState(consentToken);
  const [patientId, setPatientId] = useState(patientExternalId);
  const [otp, setOtp] = useState('');
  const [authGuid, setAuthGuid] = useState('');
  const [useBiometric, setUseBiometric] = useState(false);
  const [editContextFields, setEditContextFields] = useState(false);
  const [otpServerMessage, setOtpServerMessage] = useState('');
  const [biometricInfo, setBiometricInfo] = useState('');
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'pending' | 'authorized' | 'failed' | 'expired'>('idle');
  const biometricPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { facilityDetail } = useFacility();

  const hasInvoiceNumber = invoiceNumber.trim().length > 0;

  const { data: fallbackInvoice } = useQuery({
    queryKey: ['discharge-invoice-number', invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId!),
    enabled: !hasInvoiceNumber && typeof invoiceId === 'number',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (consentToken) setToken(consentToken);
  }, [consentToken]);

  useEffect(() => {
    if (patientExternalId) setPatientId(patientExternalId);
  }, [patientExternalId]);

  useEffect(() => {
    if (initialInvoice) setInvoiceNumber(initialInvoice);
  }, [initialInvoice]);

  useEffect(() => {
    const fallbackNumber = fallbackInvoice?.invoice_number;
    if (!hasInvoiceNumber && fallbackNumber) {
      setInvoiceNumber(fallbackNumber);
    }
  }, [fallbackInvoice?.invoice_number, hasInvoiceNumber]);

  function stopBiometricPolling() {
    if (biometricPollRef.current) {
      clearInterval(biometricPollRef.current);
      biometricPollRef.current = null;
    }
  }

  function startBiometricPolling(guid: string) {
    stopBiometricPolling();
    setBiometricStatus('pending');
    biometricPollRef.current = setInterval(async () => {
      try {
        const result = await shaApi.getBiometricAuthStatus(guid);
        const statusUpper = String(result?.status || '').toUpperCase();

        if (statusUpper === 'AUTHORIZED') {
          stopBiometricPolling();
          setBiometricStatus('authorized');
          setBiometricInfo('Biometric verification successful. You can now discharge and submit the claim.');
        } else if (statusUpper === 'FAILED' || statusUpper === 'REJECTED') {
          stopBiometricPolling();
          setBiometricStatus('failed');
          setBiometricInfo('Biometric verification failed. Retry biometric verification or switch to OTP.');
          setAuthGuid('');
        } else if (statusUpper === 'EXPIRED') {
          stopBiometricPolling();
          setBiometricStatus('expired');
          setBiometricInfo('Biometric session expired. Retry biometric verification or switch to OTP.');
          setAuthGuid('');
        }
      } catch {
        // Keep polling on transient network errors.
      }
    }, 3000);
  }

  useEffect(() => {
    return () => {
      stopBiometricPolling();
    };
  }, []);

  const missingPerDiemTariffs = useMemo(() => {
    if (!facilityLevel) return [] as string[];

    return activeInterventions
      .filter((intervention) => intervention.is_per_diem)
      .filter((intervention) => {
        const tariffMap: Record<number, string | null | undefined> = {
          2: intervention.level2_tariff,
          3: intervention.level3_tariff,
          4: intervention.level4_tariff,
          5: intervention.level5_tariff,
          6: intervention.level6_tariff,
        };
        return !tariffMap[facilityLevel];
      })
      .map((intervention) => intervention.intervention_code);
  }, [activeInterventions, facilityLevel]);

  const hasMissingPerDiemTariffs = missingPerDiemTariffs.length > 0;
  const contextComplete = !!token && !!patientId && hasInvoiceNumber;

  const { data: resolvedAdmission } = useQuery({
    queryKey: ['discharge-admission-lookup', claimPatientId, claimEncounterId],
    enabled: typeof claimPatientId === 'number' && typeof claimEncounterId === 'number',
    staleTime: 60_000,
    queryFn: async () => {
      const response = await inpatientApi.listAdmissions({
        patient: claimPatientId,
        admission_status: 'ACTIVE',
        page_size: 100,
      });
      return response.results.find((admission) => admission.ipd_encounter === claimEncounterId) || null;
    },
  });

  const admissionIdForPreview = resolvedAdmission?.id;

  const {
    data: clinicalSummary,
    isLoading: loadingClinicalSummary,
    isFetching: fetchingClinicalSummary,
    isError: clinicalSummaryError,
    refetch: refetchClinicalSummary,
  } = useQuery({
    queryKey: ['admission-clinical-summary', admissionIdForPreview],
    enabled: typeof admissionIdForPreview === 'number',
    staleTime: 30_000,
    queryFn: () => inpatientApi.getAdmissionClinicalSummary(admissionIdForPreview!),
  });

  // Don't render if flow doesn't support inpatient discharge
  if (!flow.supportsInpatientDischarge) return null;

  async function sendDischargeOtp() {
    if (!token) {
      setError('Consent token is required. Complete the consent step first.');
      return;
    }
    setBusy(true);
    setError(null);
    setOtpServerMessage('');
    setBiometricInfo('');
    setBiometricStatus('idle');
    stopBiometricPolling();
    try {
      const response = await shaApi.ilmSendDischargeOtp({
        consent_token: token,
        patient_id: patientId,
      });

      const data = (response?.data ?? {}) as Record<string, unknown>;
      const payloadMessage = typeof data.message === 'string' ? data.message : '';
      if (payloadMessage) {
        setOtpServerMessage(payloadMessage);
      }

      const sandboxOtp =
        (typeof data.sandbox_otp === 'string' && data.sandbox_otp) ||
        (typeof data.otp === 'string' && data.otp) ||
        extractOtpFromMessage(payloadMessage);
      if (sandboxOtp) {
        setOtp(sandboxOtp);
      }

      setUseBiometric(false);
      setStep('otp_sent');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to send discharge OTP');
    } finally {
      setBusy(false);
    }
  }

  async function startBiometricVerification() {
    if (!shaMemberId) {
      setError('SHA member is required to start biometric verification.');
      return;
    }

    setBusy(true);
    setError(null);
    setBiometricInfo('');
    setBiometricStatus('pending');
    setOtpServerMessage('');
    stopBiometricPolling();
    try {
      const result = await shaApi.authorizeBiometric({
        sha_member_id: shaMemberId,
        workstation_id: facilityDetail?.workstation_id || 'WS-001',
        agent_national_id: facilityDetail?.biometrics_agent_national_id || '',
      });

      setAuthGuid(result.auth_guid || '');
      setUseBiometric(true);
      setStep('otp_sent');
      setOtp('');

      if (result.sandbox_mode) {
        stopBiometricPolling();
        setBiometricStatus('authorized');
        setBiometricInfo('Biometric verification accepted in sandbox mode. You can proceed to discharge.');
      } else {
        setBiometricInfo('Complete fingerprint verification, then proceed with discharge using the generated auth GUID.');
        startBiometricPolling(result.auth_guid);
        if (result.iframe_url && typeof window !== 'undefined') {
          window.open(result.iframe_url, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to initiate biometric verification');
    } finally {
      setBusy(false);
    }
  }

  async function submitDischarge() {
    if (hasMissingPerDiemTariffs) {
      const levelText = facilityLevel ? `Level ${facilityLevel}` : 'current facility level';
      setError(
        `Cannot submit discharge: missing per-diem tariff for ${levelText} on ${missingPerDiemTariffs.join(', ')}.`
      );
      return;
    }
    if (!otp && !authGuid) {
      setError('Enter the discharge OTP or provide a biometric auth GUID.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await shaApi.ilmDischarge({
        consent_token: token,
        discharge_date: dischargeDate,
        discharge_reason: dischargeReason,
        invoice_number: invoiceNumber,
        ...(authGuid ? { auth_guid: authGuid } : { otp }),
      });
      setStep('complete');
      onChange?.();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Discharge failed');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'complete') {
    return (
      <Card className="border-green-200 dark:border-green-800">
        <CardContent className="py-6">
          <Alert>
            <LogOut className="h-4 w-4" />
            <AlertTitle>Patient Discharged &amp; Claim Submitted</AlertTitle>
            <AlertDescription>
              The inpatient claim has been submitted to SHA via discharge.
              Check the claim status for adjudication updates.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Inpatient Discharge</CardTitle>
          <HelpPopover content="Per DHA HIE spec, inpatient claims are submitted by discharging the patient. This sends a discharge OTP for patient consent, then finalizes the discharge which simultaneously submits the claim to SHA." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {hasMissingPerDiemTariffs && (
          <Alert variant="destructive">
            <AlertTitle>Per-diem tariff missing</AlertTitle>
            <AlertDescription>
              {`Cannot proceed with discharge submission. No Level ${facilityLevel} per-diem tariff is configured for: ${missingPerDiemTariffs.join(', ')}.`}
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Clinical timeline preview</p>
            {typeof admissionIdForPreview === 'number' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void refetchClinicalSummary()}
                disabled={loadingClinicalSummary || fetchingClinicalSummary}
              >
                {fetchingClinicalSummary ? 'Refreshing…' : 'Refresh'}
              </Button>
            ) : null}
          </div>

          {typeof admissionIdForPreview !== 'number' ? (
            <p className="text-xs text-muted-foreground">
              Clinical timeline will appear once the active admission is resolved from this claim.
            </p>
          ) : loadingClinicalSummary ? (
            <p className="text-xs text-muted-foreground">Loading clinical timeline…</p>
          ) : clinicalSummaryError ? (
            <p className="text-xs text-destructive">
              Failed to load clinical timeline preview. You can still continue discharge.
            </p>
          ) : clinicalSummary ? (
            <>
              <p className="text-xs text-muted-foreground">
                {clinicalSummary.entries.length} timeline entr{clinicalSummary.entries.length === 1 ? 'y' : 'ies'} from ward rounds, kardex shift notes, and handover notes.
              </p>
              <details className="rounded border bg-background p-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Preview rendered narrative</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
                  {clinicalSummary.rendered_text || 'No timeline notes available.'}
                </pre>
              </details>
            </>
          ) : null}
        </div>

        {/* Step 1: Discharge details + send OTP */}
        {step === 'details' && (
          <div className="space-y-4">
            {contextComplete && !editContextFields ? (
              <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
                <p className="font-medium">Using pre-filled claim context</p>
                <p className="text-muted-foreground">Consent token and patient ID are already available from visit flow.</p>
                <p><span className="font-medium">Patient ID:</span> {patientId}</p>
                <p><span className="font-medium">Invoice:</span> {invoiceNumber}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditContextFields(true)}
                  className="h-7 px-2 text-xs"
                >
                  Edit these fields
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="discharge-token">Consent token</Label>
                  <Input
                    id="discharge-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="From start-visit step"
                  />
                </div>
                <div>
                  <Label htmlFor="discharge-patient-id">DHA patient_id</Label>
                  <Input
                    id="discharge-patient-id"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="discharge-date">Discharge date</Label>
                <Input
                  id="discharge-date"
                  type="date"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="discharge-reason">Reason</Label>
                <select
                  id="discharge-reason"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={dischargeReason}
                  onChange={(e) => setDischargeReason(e.target.value)}
                >
                  {DISCHARGE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              {(editContextFields || !invoiceNumber) && (
                <div>
                  <Label htmlFor="discharge-invoice">Invoice number</Label>
                  <Input
                    id="discharge-invoice"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                </div>
              )}
            </div>

            {contextComplete && editContextFields && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditContextFields(false)}
                className="h-7 px-2 text-xs"
              >
                Use compact pre-filled view
              </Button>
            )}

            <Button
              onClick={sendDischargeOtp}
              disabled={busy || !token || hasMissingPerDiemTariffs}
            >
              {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Send Discharge OTP
            </Button>

            <Button
              variant="outline"
              onClick={startBiometricVerification}
              disabled={busy || !token || hasMissingPerDiemTariffs || !shaMemberId}
            >
              {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              <Fingerprint className="mr-2 h-4 w-4" />
              Verify Biometrics
            </Button>
          </div>
        )}

        {/* Step 2: Enter OTP or auth_guid and finalize */}
        {step === 'otp_sent' && (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Discharge OTP Sent</AlertTitle>
              <AlertDescription>
                An OTP has been sent to the patient&apos;s registered contact.
                Enter it below, or use the biometric auth GUID if patient authenticated via biometrics.
              </AlertDescription>
            </Alert>

            {otpServerMessage ? (
              <Alert>
                <AlertTitle>DHA response</AlertTitle>
                <AlertDescription>{otpServerMessage}</AlertDescription>
              </Alert>
            ) : null}

            {biometricInfo ? (
              <Alert>
                <AlertTitle>Biometric verification</AlertTitle>
                <AlertDescription>{biometricInfo}</AlertDescription>
              </Alert>
            ) : null}

            {useBiometric && biometricStatus === 'pending' ? (
              <Alert>
                <AlertTitle>Waiting for fingerprint verification</AlertTitle>
                <AlertDescription>
                  We are polling DHA for biometric status. Keep this panel open while the patient completes fingerprint verification.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-3">
              {!useBiometric ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="discharge-otp">Discharge OTP</Label>
                    <Input
                      id="discharge-otp"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter OTP from patient"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUseBiometric(true)}
                  >
                    Use biometric instead
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="discharge-auth-guid">Biometric Auth GUID</Label>
                    <Input
                      id="discharge-auth-guid"
                      value={authGuid}
                      onChange={(e) => setAuthGuid(e.target.value)}
                      placeholder="Auth GUID from biometric consent"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      stopBiometricPolling();
                      setBiometricStatus('idle');
                      setUseBiometric(false);
                    }}
                  >
                    Use OTP instead
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startBiometricVerification}
                    disabled={busy || !shaMemberId}
                  >
                    Retry biometric
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={submitDischarge}
                disabled={busy || (!otp && !authGuid) || hasMissingPerDiemTariffs || (useBiometric && biometricStatus === 'pending')}
              >
                {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Discharge &amp; Submit Claim
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  stopBiometricPolling();
                  setBiometricStatus('idle');
                  setStep('details');
                }}
              >
                ← Back to details
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
