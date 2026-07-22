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
import { ExternalLink, Fingerprint, Loader2, LogOut, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { shaApi } from '@/lib/api/sha';
import { billingApi } from '@/lib/api/billing';
import { inpatientApi } from '@/lib/api/inpatient';
import { getApiBaseUrl } from '@/lib/api/client';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import { useMutation, useQuery } from '@tanstack/react-query';
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

const REQUIRED_DHA_DISCHARGE_DOCS: Array<{
  code: string;
  label: string;
  what: string;
  sourceHint: string;
}> = [
  {
    code: 'CRITICAL_CARE_UNIT_CASE',
    label: 'Critical care unit case notes',
    what: 'ICU/HDU case narrative or critical care chart for this admission.',
    sourceHint: 'Use ICU/HDU notes, nursing kardex extracts, or compiled critical-care notes PDF.',
  },
  {
    code: 'FINAL_BILL',
    label: 'Final bill',
    what: 'Finalized invoice document for the claim/admission.',
    sourceHint: 'Use the final invoice PDF/printout from Billing (not a draft bill).',
  },
  {
    code: 'CLAIM_FORM',
    label: 'Claim form',
    what: 'Provider claim cover/summary form submitted with billing evidence.',
    sourceHint: 'Use facility claim summary form PDF (or claim cover sheet export where available).',
  },
  {
    code: 'DISCHARGE_SUMMARY',
    label: 'Discharge summary',
    what: 'Clinical discharge summary with diagnosis, treatment, and outcome.',
    sourceHint: 'Use discharge summary generated from inpatient discharge workflow.',
  },
];

const LOCAL_ATTACHMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'clinical_notes', label: 'Clinical notes' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'radiology_report', label: 'Radiology report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'invoice', label: 'Invoice / Final bill' },
  { value: 'discharge_summary', label: 'Discharge summary' },
  { value: 'operative_notes', label: 'Operative notes' },
  { value: 'preauth_approval', label: 'Preauth approval' },
  { value: 'other', label: 'Other' },
];

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toAttachmentUrl(filePath?: string | null): string {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return new URL(normalizedPath, getApiBaseUrl()).toString();
}

function inferDhaDocumentTypeFromLocalAttachment(attachment: {
  attachment_type: string;
  name: string;
  original_filename?: string | null;
}): string {
  const type = String(attachment.attachment_type || '').trim().toLowerCase();
  const haystack = normalizeText(`${attachment.name} ${attachment.original_filename || ''}`);

  if (type === 'critical_care_unit_case') {
    return 'CRITICAL_CARE_UNIT_CASE';
  }
  if (type === 'final_bill') {
    return 'FINAL_BILL';
  }
  if (type === 'claim_form') {
    return 'CLAIM_FORM';
  }
  if (type === 'case_note') {
    return 'CASE_NOTE';
  }

  if (type === 'discharge_summary' || haystack.includes('discharge summary')) {
    return 'DISCHARGE_SUMMARY';
  }
  if (haystack.includes('claim form')) {
    return 'CLAIM_FORM';
  }
  if (haystack.includes('final bill')) {
    return 'FINAL_BILL';
  }
  if (haystack.includes('critical care') || haystack.includes('icu')) {
    return 'CRITICAL_CARE_UNIT_CASE';
  }
  if (type === 'invoice') {
    return 'INVOICE';
  }
  return 'OTHER';
}

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
type LocalClaimAttachment = Awaited<ReturnType<typeof shaApi.getClaimAttachments>>[number];

function extractOtpFromMessage(message: string): string {
  const match = message.match(/\b(\d{4,8})\b/);
  return match?.[1] ?? '';
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
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [attachmentDialogMode, setAttachmentDialogMode] = useState<'create' | 'edit'>('edit');
  const [activeAttachmentId, setActiveAttachmentId] = useState<number | null>(null);
  const [attachmentTypeInput, setAttachmentTypeInput] = useState('other');
  const [attachmentNameInput, setAttachmentNameInput] = useState('');
  const [attachmentDescriptionInput, setAttachmentDescriptionInput] = useState('');
  const [attachmentReplacementFile, setAttachmentReplacementFile] = useState<File | null>(null);
  const biometricPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { facilityDetail } = useFacility();

  const hasInvoiceNumber = invoiceNumber.trim().length > 0;

  const { data: fallbackInvoice } = useQuery({
    queryKey: ['discharge-invoice-number', invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId!),
    enabled: !hasInvoiceNumber && typeof invoiceId === 'number',
    staleTime: 60_000,
  });

  const {
    data: localAttachments = [],
    refetch: refetchLocalAttachments,
    isFetching: fetchingLocalAttachments,
  } = useQuery({
    queryKey: ['discharge-local-attachments', claimId],
    queryFn: () => shaApi.getClaimAttachments(claimId),
    staleTime: 0,
  });

  const presentDhaDocTypes = useMemo(() => {
    const set = new Set<string>();
    for (const attachment of localAttachments) {
      set.add(inferDhaDocumentTypeFromLocalAttachment(attachment));
    }
    return set;
  }, [localAttachments]);

  const missingRequiredDischargeDocs = useMemo(
    () => REQUIRED_DHA_DISCHARGE_DOCS.filter((doc) => !presentDhaDocTypes.has(doc.code)),
    [presentDhaDocTypes],
  );
  const hasMissingRequiredDischargeDocs = missingRequiredDischargeDocs.length > 0;

  const activeAttachment = useMemo<LocalClaimAttachment | null>(
    () => localAttachments.find((att) => att.id === activeAttachmentId) ?? null,
    [localAttachments, activeAttachmentId],
  );

  const uploadDocMutation = useMutation({
    mutationFn: async ({ docType, file }: { docType: string; file: File }) => {
      const fallbackInterventionCode = activeInterventions[0]?.intervention_code;
      await shaApi.ilmAddAttachment(claimId, [file], {
        document_type: docType,
        document_title: file.name,
        document_description: `${docType.replace(/_/g, ' ')} uploaded from discharge panel`,
        ...(fallbackInterventionCode ? { intervention_code: fallbackInterventionCode } : {}),
      });
      return { docType, fileName: file.name };
    },
    onSuccess: async (result) => {
      setError(null);
      setDocFiles((prev) => ({ ...prev, [result.docType]: null }));
      await refetchLocalAttachments();
      onChange?.();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Attachment upload failed');
    },
  });

  useEffect(() => {
    if (!attachmentDialogOpen) return;
    if (attachmentDialogMode === 'create') {
      return;
    }
    if (!activeAttachment) return;
    setAttachmentTypeInput(activeAttachment.attachment_type || 'other');
    setAttachmentNameInput(activeAttachment.name || '');
    setAttachmentDescriptionInput(activeAttachment.description || '');
    setAttachmentReplacementFile(null);
  }, [attachmentDialogOpen, attachmentDialogMode, activeAttachment]);

  function openCreateAttachmentDialog() {
    setAttachmentDialogMode('create');
    setActiveAttachmentId(null);
    setAttachmentTypeInput('other');
    setAttachmentNameInput('');
    setAttachmentDescriptionInput('');
    setAttachmentReplacementFile(null);
    setAttachmentDialogOpen(true);
  }

  function openEditAttachmentDialog(attachment: LocalClaimAttachment) {
    setAttachmentDialogMode('edit');
    setActiveAttachmentId(attachment.id);
    setAttachmentTypeInput(attachment.attachment_type || 'other');
    setAttachmentNameInput(attachment.name || '');
    setAttachmentDescriptionInput(attachment.description || '');
    setAttachmentReplacementFile(null);
    setAttachmentDialogOpen(true);
  }

  const createAttachmentMutation = useMutation({
    mutationFn: async () => {
      if (!attachmentReplacementFile) {
        throw new Error('Select a file to create the attachment');
      }
      return shaApi.createClaimAttachment(claimId, {
        attachment_type: attachmentTypeInput,
        name: attachmentNameInput || attachmentReplacementFile.name,
        description: attachmentDescriptionInput,
        file: attachmentReplacementFile,
      });
    },
    onSuccess: async () => {
      setError(null);
      await refetchLocalAttachments();
      onChange?.();
      setAttachmentDialogOpen(false);
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to create attachment');
    },
  });

  const updateAttachmentMutation = useMutation({
    mutationFn: async () => {
      if (!activeAttachment) {
        throw new Error('No attachment selected');
      }
      return shaApi.updateClaimAttachment(claimId, activeAttachment.id, {
        attachment_type: attachmentTypeInput,
        name: attachmentNameInput,
        description: attachmentDescriptionInput,
        file: attachmentReplacementFile ?? undefined,
      });
    },
    onSuccess: async () => {
      setError(null);
      await refetchLocalAttachments();
      onChange?.();
      setAttachmentDialogOpen(false);
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to update attachment');
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async () => {
      if (!activeAttachment) {
        throw new Error('No attachment selected');
      }
      await shaApi.deleteClaimAttachment(claimId, activeAttachment.id);
    },
    onSuccess: async () => {
      setError(null);
      await refetchLocalAttachments();
      onChange?.();
      setAttachmentDialogOpen(false);
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to delete attachment');
    },
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
    if (hasMissingRequiredDischargeDocs) {
      setError(
        `Upload required DHA discharge documents first: ${missingRequiredDischargeDocs.map((d) => d.label).join(', ')}.`,
      );
      return;
    }
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
    if (hasMissingRequiredDischargeDocs) {
      setError(
        `Upload required DHA discharge documents first: ${missingRequiredDischargeDocs.map((d) => d.label).join(', ')}.`,
      );
      return;
    }
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
    if (hasMissingRequiredDischargeDocs) {
      setError(
        `Cannot submit discharge: missing DHA documents: ${missingRequiredDischargeDocs.map((d) => d.label).join(', ')}.`,
      );
      return;
    }
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

  const activeAttachmentUrl = toAttachmentUrl(activeAttachment?.file);
  const activeAttachmentIsImage = String(activeAttachment?.mime_type || '').startsWith('image/');
  const activeAttachmentIsPdf = String(activeAttachment?.mime_type || '').includes('pdf');
  const activeAttachmentIsCrossOrigin = (() => {
    if (!activeAttachmentUrl || typeof window === 'undefined') return false;
    try {
      const target = new URL(activeAttachmentUrl);
      return target.origin !== window.location.origin;
    } catch {
      return false;
    }
  })();
  const attachmentCrudBusy =
    createAttachmentMutation.isPending
    || updateAttachmentMutation.isPending
    || deleteAttachmentMutation.isPending;

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

        <Alert variant={hasMissingRequiredDischargeDocs ? 'destructive' : 'default'}>
          <AlertTitle>Required DHA discharge documents</AlertTitle>
          <AlertDescription>
            {hasMissingRequiredDischargeDocs
              ? `Missing: ${missingRequiredDischargeDocs.map((d) => d.label).join(', ')}`
              : 'All required discharge document categories are present locally.'}
          </AlertDescription>
        </Alert>

        {hasMissingRequiredDischargeDocs && (
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">Upload missing documents now</p>
            {missingRequiredDischargeDocs.map((doc) => (
              <div key={doc.code} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`doc-${doc.code}`}>{doc.label}</Label>
                    <HelpPopover
                      content={`What this is: ${doc.what}\n\nRecommended source: ${doc.sourceHint}`}
                    />
                  </div>
                  <Input
                    id={`doc-${doc.code}`}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setDocFiles((prev) => ({ ...prev, [doc.code]: file }));
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!docFiles[doc.code] || uploadDocMutation.isPending || fetchingLocalAttachments}
                  onClick={() => {
                    const selected = docFiles[doc.code];
                    if (!selected) return;
                    uploadDocMutation.mutate({ docType: doc.code, file: selected });
                  }}
                >
                  {uploadDocMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Upload
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Local claim attachments</p>
            <Button type="button" size="sm" variant="outline" onClick={openCreateAttachmentDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add attachment
            </Button>
          </div>

          {localAttachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No local attachments yet.</p>
          ) : (
            <div className="space-y-2">
              {localAttachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  className="w-full rounded border bg-background p-2 text-left hover:bg-muted/30"
                  onClick={() => openEditAttachmentDialog(attachment)}
                >
                  <p className="text-sm font-medium">{attachment.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {attachment.attachment_type.replace(/_/g, ' ')}
                    {attachment.original_filename ? ` • ${attachment.original_filename}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={attachmentDialogOpen}
          onOpenChange={(open) => {
            setAttachmentDialogOpen(open);
            if (!open) {
              setAttachmentReplacementFile(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {attachmentDialogMode === 'create' ? 'Add claim attachment' : 'Manage claim attachment'}
              </DialogTitle>
              <DialogDescription>
                {attachmentDialogMode === 'create'
                  ? 'Create a new local attachment for this claim.'
                  : 'View, edit, replace, or remove this local attachment.'}
              </DialogDescription>
            </DialogHeader>

            {attachmentDialogMode === 'edit' && activeAttachment && activeAttachmentUrl ? (
              <div className="space-y-2 rounded border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Attachment preview</p>
                  <a
                    href={activeAttachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Open original
                  </a>
                </div>
                {activeAttachmentIsImage ? (
                  <img
                    src={activeAttachmentUrl}
                    alt={activeAttachment.name}
                    className="max-h-72 w-full rounded border object-contain bg-background"
                  />
                ) : activeAttachmentIsPdf && !activeAttachmentIsCrossOrigin ? (
                  <iframe
                    title={activeAttachment.name}
                    src={activeAttachmentUrl}
                    className="h-72 w-full rounded border bg-background"
                  />
                ) : activeAttachmentIsPdf ? (
                  <p className="text-xs text-muted-foreground">
                    PDF inline preview is blocked by browser/frame security for cross-origin media.
                    Use <span className="font-medium">Open original</span>.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Inline preview is not available for this file type.
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="attachment-name">Name</Label>
                <Input
                  id="attachment-name"
                  value={attachmentNameInput}
                  onChange={(e) => setAttachmentNameInput(e.target.value)}
                  placeholder="Attachment name"
                />
              </div>
              <div>
                <Label htmlFor="attachment-type">Type</Label>
                <select
                  id="attachment-type"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={attachmentTypeInput}
                  onChange={(e) => setAttachmentTypeInput(e.target.value)}
                >
                  {LOCAL_ATTACHMENT_TYPES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="attachment-file">
                  {attachmentDialogMode === 'create' ? 'File (required)' : 'Replace file (optional)'}
                </Label>
                <Input
                  id="attachment-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                  onChange={(e) => setAttachmentReplacementFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="attachment-description">Description</Label>
                <Input
                  id="attachment-description"
                  value={attachmentDescriptionInput}
                  onChange={(e) => setAttachmentDescriptionInput(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <div>
                {attachmentDialogMode === 'edit' && activeAttachment ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={attachmentCrudBusy}
                    onClick={() => {
                      if (!window.confirm('Delete this attachment? This cannot be undone.')) return;
                      deleteAttachmentMutation.mutate();
                    }}
                  >
                    {deleteAttachmentMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAttachmentDialogOpen(false)}
                  disabled={attachmentCrudBusy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    attachmentCrudBusy
                    || !attachmentNameInput.trim()
                    || (attachmentDialogMode === 'create' && !attachmentReplacementFile)
                  }
                  onClick={() => {
                    if (attachmentDialogMode === 'create') {
                      createAttachmentMutation.mutate();
                      return;
                    }
                    updateAttachmentMutation.mutate();
                  }}
                >
                  {attachmentCrudBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {attachmentDialogMode === 'create' ? 'Create attachment' : 'Save changes'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={sendDischargeOtp}
                disabled={busy || !token || hasMissingPerDiemTariffs || hasMissingRequiredDischargeDocs}
              >
                {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Send Discharge OTP
              </Button>

              <Button
                variant="outline"
                onClick={startBiometricVerification}
                disabled={
                  busy
                  || !token
                  || hasMissingPerDiemTariffs
                  || hasMissingRequiredDischargeDocs
                  || !shaMemberId
                }
              >
                {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                <Fingerprint className="mr-2 h-4 w-4" />
                Verify Biometrics
              </Button>
            </div>
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
