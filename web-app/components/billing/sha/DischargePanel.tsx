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

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HelpPopover } from '@/components/shared/help-popover';
import { shaApi } from '@/lib/api/sha';
import { billingApi } from '@/lib/api/billing';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import { useQuery } from '@tanstack/react-query';

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

export function DischargePanel({
  claimId,
  flow,
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

  // Don't render if flow doesn't support inpatient discharge
  if (!flow.supportsInpatientDischarge) return null;

  async function sendDischargeOtp() {
    if (!token) {
      setError('Consent token is required. Complete the consent step first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await shaApi.ilmSendDischargeOtp({
        consent_token: token,
        patient_id: patientId,
      });
      setStep('otp_sent');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to send discharge OTP');
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
                    onClick={() => setUseBiometric(false)}
                  >
                    Use OTP instead
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={submitDischarge}
                disabled={busy || (!otp && !authGuid) || hasMissingPerDiemTariffs}
              >
                {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Discharge &amp; Submit Claim
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('details')}
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
