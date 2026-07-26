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
import { ExternalLink, Fingerprint, Loader2, LogOut, Plus, Trash2, UploadCloud } from 'lucide-react';
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
import {
  DiagnosisCodeInput,
  emptyDiagnosisCodeValue,
  type DiagnosisCodeValue,
} from '@/components/shared/diagnosis-code-input';
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

const DOC_HELP_BY_CODE: Record<string, { label: string; what: string; sourceHint: string }> = {
  MEDICAL_REPORT: {
    label: 'Medical report',
    what: 'Comprehensive clinician report for the case, including diagnosis and management summary.',
    sourceHint: 'Use the auto-generated medical report attachment or upload a compiled clinician report PDF.',
  },
  CASE_NOTE: {
    label: 'Clinical notes',
    what: 'Clinical case notes and treatment narrative for the admission.',
    sourceHint: 'Use clinician notes, ward round notes, or compiled clinical notes PDF.',
  },
  CRITICAL_CARE_UNIT_CASE: {
    label: 'Critical care unit case notes',
    what: 'ICU/HDU case narrative or critical care chart for this admission.',
    sourceHint: 'Use ICU/HDU notes, nursing kardex extracts, or compiled critical-care notes PDF.',
  },
  FINAL_BILL: {
    label: 'Final bill',
    what: 'Finalized invoice document for the claim/admission.',
    sourceHint: 'Use the final invoice PDF/printout from Billing (not a draft bill).',
  },
  CLAIM_FORM: {
    label: 'Claim form',
    what: 'Provider claim cover/summary form submitted with billing evidence.',
    sourceHint: 'Use facility claim summary form PDF (or claim cover sheet export where available).',
  },
  DISCHARGE_SUMMARY: {
    label: 'Discharge summary',
    what: 'Clinical discharge summary with diagnosis, treatment, and outcome.',
    sourceHint: 'Use discharge summary generated from inpatient discharge workflow.',
  },
};

type ValidationDocOrigin = 'core_attachment' | 'intervention_document' | 'preview_applicable_document';

interface MissingValidationDoc {
  key: string;
  code: string;
  uploadDocType: string;
  label: string;
  what: string;
  sourceHint: string;
  origin: ValidationDocOrigin;
  interventionCode?: string;
  rawError: string;
}

function normalizeValidationDocCode(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function toUploadDocumentType(validationDocCode: string): string {
  const normalized = normalizeValidationDocCode(validationDocCode);
  if (normalized === 'MEDICAL_REPORT') return 'MEDICAL_REPORT';
  if (normalized === 'CLINICAL_NOTES') return 'CASE_NOTE';
  if (normalized === 'INVOICE') return 'FINAL_BILL';
  return normalized;
}

function equivalentRequiredDocCodes(validationDocCode: string): Set<string> {
  const normalized = normalizeValidationDocCode(validationDocCode);
  const equivalents = new Set<string>([normalized]);
  if (normalized === 'INVOICE' || normalized === 'FINAL_BILL') {
    equivalents.add('INVOICE');
    equivalents.add('FINAL_BILL');
  }
  return equivalents;
}

function toDocLabel(validationDocCode: string): string {
  const normalized = normalizeValidationDocCode(validationDocCode);
  const known = DOC_HELP_BY_CODE[normalized];
  if (known?.label) return known.label;
  return normalized
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractMissingValidationDocs(errors: string[]): MissingValidationDoc[] {
  const byDocType = new Map<string, MissingValidationDoc>();

  for (const error of errors) {
    const coreMatch = error.match(/Missing required attachment:\s*([^\s].*)$/i);
    if (coreMatch?.[1]) {
      const rawCode = coreMatch[1].trim();
      const uploadDocType = toUploadDocumentType(rawCode);
      if (!byDocType.has(uploadDocType)) {
        const docHelp = DOC_HELP_BY_CODE[uploadDocType];
        byDocType.set(uploadDocType, {
          key: uploadDocType,
          code: normalizeValidationDocCode(rawCode),
          uploadDocType,
          label: docHelp?.label || toDocLabel(rawCode),
          what: docHelp?.what || `Required document type: ${rawCode}`,
          sourceHint: docHelp?.sourceHint || 'Upload a clear PDF/image document for this required type.',
          origin: 'core_attachment',
          rawError: error,
        });
      }
      continue;
    }

    const interventionMatch = error.match(/Missing required document\s+'([^']+)'\s+for intervention\s+(.+)$/i);
    if (interventionMatch?.[1]) {
      const rawCode = interventionMatch[1].trim();
      const interventionCode = interventionMatch[2]?.trim();
      const uploadDocType = toUploadDocumentType(rawCode);
      if (!byDocType.has(uploadDocType)) {
        const docHelp = DOC_HELP_BY_CODE[uploadDocType];
        byDocType.set(uploadDocType, {
          key: uploadDocType,
          code: normalizeValidationDocCode(rawCode),
          uploadDocType,
          label: docHelp?.label || toDocLabel(rawCode),
          what: docHelp?.what || `Intervention-required document type: ${rawCode}`,
          sourceHint: docHelp?.sourceHint || 'Upload a clear PDF/image document for this required type.',
          origin: 'intervention_document',
          interventionCode: interventionCode || undefined,
          rawError: error,
        });
      }
    }
  }

  return Array.from(byDocType.values());
}

function collectRequiredDocumentTypesFromPreview(payload: Record<string, unknown>): Array<{
  code: string;
  interventionCode?: string;
}> {
  const byCode = new Map<string, { code: string; interventionCode?: string }>();
  const appendDoc = (rawValue: unknown, interventionCode?: string) => {
    const normalized = normalizeValidationDocCode(String(rawValue || ''));
    if (!normalized) return;
    const existing = byCode.get(normalized);
    if (existing) {
      if (!existing.interventionCode && interventionCode) {
        existing.interventionCode = interventionCode;
      }
      return;
    }
    byCode.set(normalized, { code: normalized, interventionCode });
  };

  const topLevelRequired = Array.isArray(payload.applicable_document_types)
    ? payload.applicable_document_types
    : [];
  topLevelRequired.forEach((doc) => appendDoc(doc));

  const interventions = Array.isArray(payload.interventions) ? payload.interventions : [];
  for (const intervention of interventions) {
    const row = asRecord(intervention);
    const interventionCode = String(row.intervention_code || '').trim() || undefined;
    const requiredDocTypes = Array.isArray(row.applicable_document_types)
      ? row.applicable_document_types
      : [];
    requiredDocTypes.forEach((doc) => appendDoc(doc, interventionCode));
  }

  return Array.from(byCode.values());
}

const LOCAL_ATTACHMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'clinical_notes', label: 'Clinical notes' },
  { value: 'medical_report', label: 'Medical report' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'radiology_report', label: 'Radiology report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'invoice', label: 'Invoice / Final bill' },
  { value: 'discharge_summary', label: 'Discharge summary' },
  { value: 'operative_notes', label: 'Operative notes' },
  { value: 'preauth_approval', label: 'Preauth approval' },
  { value: 'other', label: 'Other' },
];

const AUTO_GENERATABLE_MISSING_DOC_TYPES = new Set(['MEDICAL_REPORT', 'CASE_NOTE', 'FINAL_BILL']);

const DOCTOR_ID_TYPES = [
  { value: 'National ID', label: 'National ID' },
  { value: 'Passport', label: 'Passport' },
  { value: 'License Number', label: 'License Number' },
] as const;

const DOCTOR_REGULATORS = ['KMPDC', 'NCK', 'COC', 'PPB', 'KMLTTB', 'KNDI'] as const;

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readDiagnosisCode(value: Record<string, unknown>): string {
  return String(value.diagnosis_code || value.icd_code || '').trim();
}

function readDiagnosisName(value: Record<string, unknown>): string {
  return String(value.diagnosis_name || value.diagnosis || '').trim();
}

function diagnosisCodeForPayload(value: DiagnosisCodeValue): string {
  if (value.icd11Code) return value.icd11Code.trim();
  if (value.icd10Display) return value.icd10Display.split(' - ')[0]?.trim() || '';
  return '';
}

function idTypeNeedsRegulator(idType: string): boolean {
  return String(idType || '').trim().toLowerCase().includes('license');
}

function toAttachmentUrl(filePath?: string | null): string {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return new URL(normalizedPath, getApiBaseUrl()).toString();
}

function parseDateTime(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInteger(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.floor(raw));
}

function formatElapsedFrom(start: Date): string {
  const diffMs = Math.max(0, Date.now() - start.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function extractMissingDocsFromErrorText(message: string): string[] {
  const match = message.match(/missing the following documents?\s+(.+)$/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/,|\band\b/i)
    .map((part) => part.replace(/["'\[\]{}]/g, '').trim())
    .filter(Boolean);
}

function extractDischargeErrorDetails(error: any): { message: string; missingDocs: string[] } {
  const responseData = error?.response?.data as Record<string, unknown> | undefined;
  const message = String(responseData?.message || '').trim();
  const fallback = String(responseData?.error || error?.message || 'Discharge failed').trim();

  if (!message) {
    return {
      message: fallback,
      missingDocs: extractMissingDocsFromErrorText(fallback),
    };
  }

  const nestedJsonMatch = message.match(/failed to discharge patient:\s*(\{.*\})$/i);
  if (!nestedJsonMatch?.[1]) {
    const resolved = message || fallback;
    return { message: resolved, missingDocs: extractMissingDocsFromErrorText(resolved) };
  }

  try {
    const nested = JSON.parse(nestedJsonMatch[1]) as Record<string, unknown>;
    const nestedErrors = nested.error;
    if (Array.isArray(nestedErrors) && nestedErrors.length > 0) {
      const resolved = nestedErrors.map((entry) => String(entry)).join(' ');
      return { message: resolved, missingDocs: extractMissingDocsFromErrorText(resolved) };
    }

    const ediError = nested['EDI ERROR'];
    if (ediError && typeof ediError === 'object') {
      const otpBlock = (ediError as Record<string, unknown>).otp;
      if (otpBlock && typeof otpBlock === 'object') {
        const otpMessages = (otpBlock as Record<string, unknown>).message;
        if (Array.isArray(otpMessages) && otpMessages.length > 0) {
          const resolved = otpMessages.map((entry) => String(entry)).join(' ');
          return { message: resolved, missingDocs: extractMissingDocsFromErrorText(resolved) };
        }
      }
    }
  } catch {
    const resolved = message || fallback;
    return { message: resolved, missingDocs: extractMissingDocsFromErrorText(resolved) };
  }

  const resolved = message || fallback;
  return { message: resolved, missingDocs: extractMissingDocsFromErrorText(resolved) };
}

function extractDischargeErrorMessage(error: any): string {
  return extractDischargeErrorDetails(error).message;
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
  if (type === 'medical_report') {
    return 'MEDICAL_REPORT';
  }
  if (type === 'clinical_notes') {
    return 'CASE_NOTE';
  }
  if (type === 'lab_report') {
    return 'LAB_RESULTS';
  }
  if (type === 'radiology_report') {
    return 'IMAGING_REPORT';
  }
  if (type === 'prescription') {
    return 'PRESCRIPTION';
  }
  if (type === 'operative_notes') {
    return 'THEATRE_NOTES';
  }
  if (type === 'preauth_approval') {
    return 'PREAUTH_FORM';
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
    return 'FINAL_BILL';
  }
  return 'OTHER';
}

function mergeMissingDocs(...groups: MissingValidationDoc[][]): MissingValidationDoc[] {
  const byKey = new Map<string, MissingValidationDoc>();
  for (const group of groups) {
    for (const doc of group) {
      if (!byKey.has(doc.key)) {
        byKey.set(doc.key, doc);
        continue;
      }
      const existing = byKey.get(doc.key)!;
      if (!existing.interventionCode && doc.interventionCode) {
        existing.interventionCode = doc.interventionCode;
      }
    }
  }
  return Array.from(byKey.values());
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
  const [diagnosisCodeInput, setDiagnosisCodeInput] = useState<DiagnosisCodeValue>(
    emptyDiagnosisCodeValue()
  );
  const [diagnosisInterventionInput, setDiagnosisInterventionInput] = useState(
    activeInterventions[0]?.intervention_code || ''
  );
  const [doctorIdNumberInput, setDoctorIdNumberInput] = useState('');
  const [doctorIdTypeInput, setDoctorIdTypeInput] = useState('National ID');
  const [doctorRegulationBodyInput, setDoctorRegulationBodyInput] = useState('');
  const [attachmentSyncMessage, setAttachmentSyncMessage] = useState('');
  const [lastDhaRequiredDocs, setLastDhaRequiredDocs] = useState<string[]>([]);
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
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const {
    data: attachmentSyncStatus,
    refetch: refetchAttachmentSyncStatus,
    isFetching: fetchingAttachmentSyncStatus,
  } = useQuery({
    queryKey: ['discharge-dha-attachment-sync-status', claimId],
    queryFn: () => shaApi.ilmAttachmentSyncStatus(claimId),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const {
    data: ilmPreviewResult,
    refetch: refetchIlmPreview,
    isLoading: loadingIlmPreview,
    isFetching: fetchingIlmPreview,
  } = useQuery({
    queryKey: ['discharge-ilm-preview', claimId],
    queryFn: () => shaApi.ilmPreview(claimId),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const {
    data: submitValidation,
    refetch: refetchSubmitValidation,
    isFetching: fetchingSubmitValidation,
  } = useQuery({
    queryKey: ['discharge-submit-validation', claimId],
    queryFn: () => shaApi.validateClaimSubmission(claimId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const claimDiagnoses = useMemo(() => {
    const payload = asRecord(ilmPreviewResult?.payload);
    const diagnoses = Array.isArray(payload.claim_diagnoses) ? payload.claim_diagnoses : [];
    return diagnoses
      .map((entry, index) => {
        const row = asRecord(entry);
        const icdCode = readDiagnosisCode(row);
        if (!icdCode) return null;
        const interventionCode = String(row.intervention_code || '').trim();
        return {
          key: `${icdCode}-${interventionCode || 'none'}-${index}`,
          icdCode,
          name: readDiagnosisName(row),
          interventionCode,
          recordedAt: String(row.recorded_on || row.original_visit_date || '').trim(),
        };
      })
      .filter(
        (row): row is {
          key: string;
          icdCode: string;
          name: string;
          interventionCode: string;
          recordedAt: string;
        } => !!row
      );
  }, [ilmPreviewResult?.payload]);

  const claimDoctors = useMemo(() => {
    const payload = asRecord(ilmPreviewResult?.payload);
    const doctors = Array.isArray(payload.claim_doctors) ? payload.claim_doctors : [];
    return doctors
      .map((entry, index) => {
        const row = asRecord(entry);
        const sladeCode = String(row.slade_code || row.identification_number || '').trim();
        const doctorName = String(row.doctor_name || row.name || '').trim();
        if (!sladeCode && !doctorName) return null;
        return {
          key: `${sladeCode || doctorName || 'doctor'}-${index}`,
          sladeCode,
          doctorName,
          requestStatus: String(row.doctor_request_status || row.status || '').trim(),
          recordedAt: String(row.recorded_on || row.created_at || '').trim(),
        };
      })
      .filter(
        (row): row is {
          key: string;
          sladeCode: string;
          doctorName: string;
          requestStatus: string;
          recordedAt: string;
        } => !!row
      );
  }, [ilmPreviewResult?.payload]);

  const perDiemTransparency = useMemo(() => {
    const payload = asRecord(ilmPreviewResult?.payload);
    const visitStartDate = parseDateTime(payload.visit_start);
    if (!visitStartDate) return null;

    const interventions = Array.isArray(payload.interventions) ? payload.interventions : [];
    const perDiemInterventions = interventions.filter((entry) => {
      const row = asRecord(entry);
      return String(row.intervention_payment_mechanism || '').toUpperCase().includes('PER DIEM');
    });
    if (perDiemInterventions.length === 0) return null;

    const accruedPerDiemDays = perDiemInterventions.reduce((maxDays, entry) => {
      const row = asRecord(entry);
      const days = parseInteger(row.accrued_per_diem_days);
      if (days === null) return maxDays;
      return Math.max(maxDays, days);
    }, 0);

    const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
    const latestBillTo = invoices
      .flatMap((invoice) => {
        const inv = asRecord(invoice);
        return Array.isArray(inv.lines) ? inv.lines : [];
      })
      .map((line) => {
        const row = asRecord(line);
        return parseDateTime(row.bill_to || row.charge_date);
      })
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;

    return {
      elapsed: formatElapsedFrom(visitStartDate),
      accruedPerDiemDays,
      latestBillTo,
    };
  }, [ilmPreviewResult?.payload]);

  const selectedDiagnosisCode = useMemo(
    () => diagnosisCodeForPayload(diagnosisCodeInput),
    [diagnosisCodeInput]
  );
  const diagnosisUsesIcd10Fallback = useMemo(
    () => !diagnosisCodeInput.icd11Code && !!diagnosisCodeInput.icd10Display,
    [diagnosisCodeInput.icd10Display, diagnosisCodeInput.icd11Code],
  );
  const doctorNeedsRegulator = idTypeNeedsRegulator(doctorIdTypeInput);

  const validationErrors = submitValidation?.errors || [];
  const actionableValidationErrors = useMemo(
    () => validationErrors.filter((error) => !/Inpatient claim requires discharge completion before submission/i.test(error)),
    [validationErrors],
  );
  const missingRequiredDischargeDocs = useMemo(
    () => {
      const payload = asRecord(ilmPreviewResult?.payload);
      const existingDhaDocCodes = new Set<string>();
      for (const attachment of localAttachments) {
        const inferred = inferDhaDocumentTypeFromLocalAttachment(attachment);
        const normalizedInferred = normalizeValidationDocCode(inferred);
        if (normalizedInferred) {
          existingDhaDocCodes.add(normalizedInferred);
        }

        const equivalentCodes = equivalentRequiredDocCodes(normalizedInferred);
        equivalentCodes.forEach((code) => existingDhaDocCodes.add(code));
      }

      const validationMissing = extractMissingValidationDocs(actionableValidationErrors);

      const previewRequired = collectRequiredDocumentTypesFromPreview(payload);
      const previewMissing: MissingValidationDoc[] = [];
      for (const required of previewRequired) {
        const candidates = equivalentRequiredDocCodes(required.code);
        const satisfied = Array.from(candidates).some((candidate) => existingDhaDocCodes.has(candidate));
        if (satisfied) continue;

        const uploadDocType = toUploadDocumentType(required.code);
        const docHelp = DOC_HELP_BY_CODE[uploadDocType] || DOC_HELP_BY_CODE[required.code];
        previewMissing.push({
          key: uploadDocType,
          code: required.code,
          uploadDocType,
          label: docHelp?.label || toDocLabel(required.code),
          what: docHelp?.what || `Required by DHA preview: ${required.code}`,
          sourceHint: docHelp?.sourceHint || 'Upload a clear PDF/image document for this required type.',
          origin: 'preview_applicable_document',
          interventionCode: required.interventionCode,
          rawError: `DHA preview applicable_document_types requires ${required.code}`,
        });
      }

      return mergeMissingDocs(validationMissing, previewMissing);
    },
    [actionableValidationErrors, ilmPreviewResult?.payload, localAttachments],
  );
  const hasMissingRequiredDischargeDocs = missingRequiredDischargeDocs.length > 0;
  const autoGeneratableMissingDocs = useMemo(
    () => missingRequiredDischargeDocs.filter((doc) => AUTO_GENERATABLE_MISSING_DOC_TYPES.has(doc.uploadDocType)),
    [missingRequiredDischargeDocs],
  );
  const hasAutoGeneratableMissingDocs = autoGeneratableMissingDocs.length > 0;
  const dischargeErrorDocTargets = useMemo(
    () => lastDhaRequiredDocs.map((rawDoc) => {
      const normalized = normalizeValidationDocCode(rawDoc);
      const matchedRequirement = missingRequiredDischargeDocs.find((doc) => {
        const labelNorm = normalizeValidationDocCode(doc.label);
        const candidates = [
          normalizeValidationDocCode(doc.code),
          normalizeValidationDocCode(doc.uploadDocType),
          labelNorm,
        ];
        return (
          candidates.includes(normalized)
          || labelNorm.includes(normalized)
          || normalized.includes(labelNorm)
        );
      });

      return {
        rawDoc,
        inputId: matchedRequirement ? `doc-${matchedRequirement.key}` : null,
      };
    }),
    [lastDhaRequiredDocs, missingRequiredDischargeDocs],
  );
  const dhaAttachmentMatched = attachmentSyncStatus?.matched ?? 0;
  const dhaAttachmentTotal = attachmentSyncStatus?.total ?? localAttachments.length;
  const dhaAttachmentsSynced = attachmentSyncStatus?.all_matched ?? localAttachments.length === 0;

  function focusMissingDocInput(inputId: string | null) {
    if (!inputId || typeof document === 'undefined') return;
    const input = document.getElementById(inputId);
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (input instanceof HTMLElement) {
      input.focus();
    }
  }

  async function resolveRemoteAttachmentMapping(localAttachmentId: number): Promise<{
    remoteAttachmentId: string;
    interventionCode: string;
  } | null> {
    const syncStatus = await shaApi.ilmAttachmentSyncStatus(claimId);
    const matched = (syncStatus.matched_details || []).find((item) => item.attachment_id === localAttachmentId);
    if (!matched || !matched.remote_attachment_id) {
      return null;
    }
    return {
      remoteAttachmentId: matched.remote_attachment_id,
      interventionCode: matched.intervention_code || activeInterventions[0]?.intervention_code || '',
    };
  }

  async function removeAttachmentOnDhaIfMapped(localAttachment: LocalClaimAttachment): Promise<void> {
    const mapping = await resolveRemoteAttachmentMapping(localAttachment.id);
    if (!mapping?.remoteAttachmentId) {
      return;
    }
    if (!mapping.interventionCode) {
      throw new Error('Cannot remove DHA attachment: intervention_code is missing.');
    }
    await shaApi.ilmRemoveAttachment(claimId, {
      attachment_id: mapping.remoteAttachmentId,
      intervention_code: mapping.interventionCode,
    });
  }

  const activeAttachment = useMemo<LocalClaimAttachment | null>(
    () => localAttachments.find((att) => att.id === activeAttachmentId) ?? null,
    [localAttachments, activeAttachmentId],
  );

  async function runPostAttachmentAutomation(options: { pushLocalUpload: boolean }): Promise<void> {
    if (options.pushLocalUpload) {
      const pushResult = await shaApi.ilmPushLocalAttachments(claimId);
      setAttachmentSyncMessage(
        pushResult.failed > 0
          ? `DHA sync completed with warnings: ${pushResult.uploaded} uploaded, ${pushResult.failed} failed.`
          : `DHA sync completed: ${pushResult.uploaded} attachment(s) uploaded.`
      );
    }

    await Promise.all([
      refetchLocalAttachments(),
      refetchAttachmentSyncStatus(),
      refetchIlmPreview(),
      refetchSubmitValidation(),
      typeof admissionIdForPreview === 'number' ? refetchClinicalSummary() : Promise.resolve(),
    ]);
  }

  const uploadDocMutation = useMutation({
    mutationFn: async ({
      requirement,
      file,
    }: {
      requirement: MissingValidationDoc;
      file: File;
    }) => {
      const fallbackInterventionCode = activeInterventions[0]?.intervention_code;
      await shaApi.ilmAddAttachment(claimId, [file], {
        document_type: requirement.uploadDocType,
        document_title: file.name,
        document_description: `${requirement.label} uploaded from discharge panel`,
        ...(fallbackInterventionCode ? { intervention_code: fallbackInterventionCode } : {}),
      });
      return { requirementKey: requirement.key, fileName: file.name };
    },
    onSuccess: async (result) => {
      setError(null);
      setLastDhaRequiredDocs([]);
      setDocFiles((prev) => ({ ...prev, [result.requirementKey]: null }));
      await runPostAttachmentAutomation({ pushLocalUpload: false });
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
      setLastDhaRequiredDocs([]);
      await runPostAttachmentAutomation({ pushLocalUpload: true });
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
      const hadReplacementFile = !!attachmentReplacementFile;
      if (hadReplacementFile) {
        await removeAttachmentOnDhaIfMapped(activeAttachment);

        const nextDocType = inferDhaDocumentTypeFromLocalAttachment({
          attachment_type: attachmentTypeInput || activeAttachment.attachment_type,
          name: attachmentNameInput || activeAttachment.name,
          original_filename: attachmentReplacementFile.name,
        });
        const interventionCode = activeInterventions[0]?.intervention_code || '';
        await shaApi.ilmAddAttachment(claimId, [attachmentReplacementFile], {
          document_type: nextDocType,
          document_title: attachmentNameInput || attachmentReplacementFile.name,
          document_description: attachmentDescriptionInput || '',
          ...(interventionCode ? { intervention_code: interventionCode } : {}),
        });
      }
      await shaApi.updateClaimAttachment(claimId, activeAttachment.id, {
        attachment_type: attachmentTypeInput,
        name: attachmentNameInput,
        description: attachmentDescriptionInput,
        file: attachmentReplacementFile ?? undefined,
      });
      return { hadReplacementFile };
    },
    onSuccess: async (result: { hadReplacementFile: boolean }) => {
      setError(null);
      setLastDhaRequiredDocs([]);
      if (result.hadReplacementFile) {
        await runPostAttachmentAutomation({ pushLocalUpload: false });
      } else {
        await refreshDischargePanelData();
      }
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
      await removeAttachmentOnDhaIfMapped(activeAttachment);
      await shaApi.deleteClaimAttachment(claimId, activeAttachment.id);
    },
    onSuccess: async () => {
      setError(null);
      await refreshDischargePanelData();
      onChange?.();
      setAttachmentDialogOpen(false);
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to delete attachment');
    },
  });

  const addDiagnosisMutation = useMutation({
    mutationFn: async () => {
      const icdCode = selectedDiagnosisCode;
      const interventionCode = diagnosisInterventionInput.trim();
      if (!icdCode) {
        throw new Error('ICD code is required.');
      }
      if (!interventionCode) {
        throw new Error('Select an intervention to anchor this diagnosis.');
      }
      if (diagnosisUsesIcd10Fallback) {
        throw new Error('DHA diagnosis endpoint requires ICD-11. Select an ICD-11 diagnosis code.');
      }
      await shaApi.ilmAddDiagnosis(claimId, {
        icd_code: icdCode,
        intervention_code: interventionCode,
      });
    },
    onSuccess: async () => {
      setError(null);
      setDiagnosisCodeInput(emptyDiagnosisCodeValue());
      await refreshDischargePanelData();
      onChange?.();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to add diagnosis');
    },
  });

  const removeDiagnosisMutation = useMutation({
    mutationFn: async ({ icdCode, interventionCode }: { icdCode: string; interventionCode?: string }) => {
      const fallbackInterventionCode =
        diagnosisInterventionInput.trim() || activeInterventions[0]?.intervention_code || '';
      const resolvedInterventionCode = interventionCode?.trim() || fallbackInterventionCode;
      if (!resolvedInterventionCode) {
        throw new Error(`Cannot remove ${icdCode}: intervention code is missing.`);
      }
      await shaApi.ilmRemoveDiagnosis(claimId, {
        icd_code: icdCode,
        intervention_code: resolvedInterventionCode,
      });
    },
    onSuccess: async () => {
      setError(null);
      await refreshDischargePanelData();
      onChange?.();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to remove diagnosis');
    },
  });

  const addDoctorMutation = useMutation({
    mutationFn: async () => {
      const consent = token.trim();
      const idNumber = doctorIdNumberInput.trim();
      const idType = doctorIdTypeInput.trim() || 'National ID';
      const regulationBody = doctorRegulationBodyInput.trim();
      if (!consent) {
        throw new Error('Consent token is required before adding doctor details.');
      }
      if (!idNumber) {
        throw new Error('Doctor identification number is required.');
      }
      if (idTypeNeedsRegulator(idType) && !regulationBody) {
        throw new Error('Select the licensing body for license-number identification.');
      }
      await shaApi.ilmAddEmergencyDoctor({
        consent_token: consent,
        identification_number: idNumber,
        identification_type: idType,
        ...(idTypeNeedsRegulator(idType) ? { regulation_body: regulationBody } : {}),
      });
    },
    onSuccess: async () => {
      setError(null);
      setDoctorIdNumberInput('');
      if (!idTypeNeedsRegulator(doctorIdTypeInput)) {
        setDoctorRegulationBodyInput('');
      }
      await refreshDischargePanelData();
      onChange?.();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to add doctor');
    },
  });

  const removeDoctorMutation = useMutation({
    mutationFn: async () => {
      const consent = token.trim();
      if (!consent) {
        throw new Error('Consent token is required to remove doctor details.');
      }
      await shaApi.ilmRemoveEmergencyDoctor({ consent_token: consent });
    },
    onSuccess: async () => {
      setError(null);
      await refreshDischargePanelData();
      onChange?.();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to remove doctor');
    },
  });

  const syncAttachmentsMutation = useMutation({
    mutationFn: async () => shaApi.ilmPushLocalAttachments(claimId),
    onSuccess: async (result) => {
      setError(null);
      setAttachmentSyncMessage(
        result.failed > 0
          ? `DHA sync completed with warnings: ${result.uploaded} uploaded, ${result.failed} failed.`
          : `DHA sync completed: ${result.uploaded} attachment(s) uploaded.`
      );
      await Promise.all([
        refetchLocalAttachments(),
        refetchAttachmentSyncStatus(),
        refetchIlmPreview(),
        refetchSubmitValidation(),
      ]);
      onChange?.();
    },
    onError: (e: any) => {
      setAttachmentSyncMessage('');
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to sync attachments to DHA');
    },
  });

  const autoGenerateMissingDocsMutation = useMutation({
    mutationFn: async () => {
      const result = await shaApi.autoAttachDocuments(claimId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: async (result) => {
      setError(null);
      const attached = Number(result.attached || 0);
      const alreadyAttached = Number(result.already_attached || 0);
      await runPostAttachmentAutomation({ pushLocalUpload: true });
      if (attached > 0) {
        setAttachmentSyncMessage(
          `Auto-generated and attached ${attached} document(s). Existing auto-attach types already present: ${alreadyAttached}.`
        );
      } else {
        setAttachmentSyncMessage(
          'No new auto-generatable documents were produced. Upload remaining required docs manually.'
        );
      }
      onChange?.();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to auto-generate missing documents');
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
    if (!diagnosisInterventionInput && activeInterventions[0]?.intervention_code) {
      setDiagnosisInterventionInput(activeInterventions[0].intervention_code);
    }
  }, [activeInterventions, diagnosisInterventionInput]);

  useEffect(() => {
    if (!idTypeNeedsRegulator(doctorIdTypeInput) && doctorRegulationBodyInput) {
      setDoctorRegulationBodyInput('');
    }
  }, [doctorIdTypeInput, doctorRegulationBodyInput]);

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
    refetchInterval: typeof admissionIdForPreview === 'number' ? 60_000 : false,
    refetchIntervalInBackground: true,
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
    if (!dhaAttachmentsSynced) {
      setError(
        `Sync attachments to DHA before discharge OTP. Currently matched ${dhaAttachmentMatched}/${dhaAttachmentTotal}.`
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
      setError(extractDischargeErrorMessage(e));
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
    if (!dhaAttachmentsSynced) {
      setError(
        `Sync attachments to DHA before biometric verification. Currently matched ${dhaAttachmentMatched}/${dhaAttachmentTotal}.`
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
      setError(extractDischargeErrorMessage(e));
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
    if (!dhaAttachmentsSynced) {
      setError(
        `Cannot submit discharge: DHA is still missing attachments (${dhaAttachmentMatched}/${dhaAttachmentTotal} matched).`
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
    setLastDhaRequiredDocs([]);
    try {
      await shaApi.ilmDischarge({
        claim_id: claimId,
        consent_token: token,
        discharge_date: dischargeDate,
        discharge_reason: dischargeReason,
        invoice_number: invoiceNumber,
        ...(authGuid ? { auth_guid: authGuid } : { otp }),
      });
      setLastDhaRequiredDocs([]);
      setStep('complete');
      onChange?.();
    } catch (e: any) {
      const details = extractDischargeErrorDetails(e);
      setError(details.message);
      setLastDhaRequiredDocs(details.missingDocs);
    } finally {
      setBusy(false);
    }
  }

  async function refreshDischargePanelData() {
    await Promise.all([
      refetchLocalAttachments(),
      refetchAttachmentSyncStatus(),
      refetchIlmPreview(),
      refetchSubmitValidation(),
      typeof admissionIdForPreview === 'number' ? refetchClinicalSummary() : Promise.resolve(),
    ]);
  }

  async function runFreshPreview() {
    await refetchIlmPreview();
    await refetchSubmitValidation();
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
  const diagnosisBusy = addDiagnosisMutation.isPending || removeDiagnosisMutation.isPending;
  const doctorBusy = addDoctorMutation.isPending || removeDoctorMutation.isPending;

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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Inpatient Discharge</CardTitle>
            <HelpPopover content="Per DHA HIE spec, inpatient claims are submitted by discharging the patient. This sends a discharge OTP for patient consent, then finalizes the discharge which simultaneously submits the claim to SHA." />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshDischargePanelData()}
            disabled={
              fetchingLocalAttachments
              || fetchingAttachmentSyncStatus
              || fetchingIlmPreview
              || fetchingSubmitValidation
              || fetchingClinicalSummary
            }
          >
            {(fetchingLocalAttachments || fetchingAttachmentSyncStatus || fetchingIlmPreview || fetchingSubmitValidation || fetchingClinicalSummary)
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : null}
            Refresh panel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lastDhaRequiredDocs.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>DHA required docs from latest discharge error</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-2">
                {dischargeErrorDocTargets.map((target) => (
                  target.inputId ? (
                    <button
                      key={target.rawDoc}
                      type="button"
                      className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs underline-offset-2 hover:underline"
                      onClick={() => focusMissingDocInput(target.inputId)}
                    >
                      {target.rawDoc}
                    </button>
                  ) : (
                    <span
                      key={target.rawDoc}
                      className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs"
                    >
                      {target.rawDoc}
                    </span>
                  )
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Click a highlighted required document to jump to its upload input when available.
              </p>
            </AlertDescription>
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

        {perDiemTransparency && (
          <Alert>
            <AlertTitle>Per-diem transparency</AlertTitle>
            <AlertDescription>
              <p>
                Elapsed stay since visit start: {perDiemTransparency.elapsed}; accrued per-diem days from DHA:{' '}
                {perDiemTransparency.accruedPerDiemDays}
              </p>
              {perDiemTransparency.latestBillTo ? (
                <p className="text-xs text-muted-foreground">
                  Latest billed timestamp in preview: {perDiemTransparency.latestBillTo.toLocaleString()}
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        <Alert variant={actionableValidationErrors.length > 0 ? 'destructive' : 'default'}>
          <AlertTitle>Claim validation status</AlertTitle>
          <AlertDescription>
            {actionableValidationErrors.length === 0 ? (
              'No submission validation blockers currently reported for this claim.'
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {actionableValidationErrors.map((validationError, index) => (
                  <li key={`${validationError}-${index}`}>{validationError}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>

        <Alert variant={hasMissingRequiredDischargeDocs ? 'destructive' : 'default'}>
          <AlertTitle>Missing required documents</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>
                {hasMissingRequiredDischargeDocs
                  ? `Missing: ${missingRequiredDischargeDocs.map((d) => d.label).join(', ')}`
                  : 'No required document blockers reported by claim validation or DHA preview applicable_document_types.'}
              </p>
              {hasMissingRequiredDischargeDocs && hasAutoGeneratableMissingDocs ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => autoGenerateMissingDocsMutation.mutate()}
                    disabled={
                      autoGenerateMissingDocsMutation.isPending
                      || uploadDocMutation.isPending
                      || fetchingLocalAttachments
                    }
                  >
                    {autoGenerateMissingDocsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Auto-generate + retry preview
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Can auto-generate: {autoGeneratableMissingDocs.map((doc) => doc.label).join(', ')}
                  </span>
                </div>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>

        <Alert variant={dhaAttachmentsSynced ? 'default' : 'destructive'}>
          <AlertTitle>DHA attachment sync status</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>
                {dhaAttachmentsSynced
                  ? `Synced to DHA: ${dhaAttachmentMatched}/${dhaAttachmentTotal} matched.`
                  : `Not fully synced to DHA yet: ${dhaAttachmentMatched}/${dhaAttachmentTotal} matched. Run manual sync before OTP/discharge.`}
              </p>
              {!dhaAttachmentsSynced ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => syncAttachmentsMutation.mutate()}
                    disabled={syncAttachmentsMutation.isPending || fetchingAttachmentSyncStatus}
                  >
                    {syncAttachmentsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="mr-2 h-4 w-4" />
                    )}
                    Sync attachments to DHA now
                  </Button>
                </div>
              ) : null}
              {attachmentSyncMessage ? (
                <p className="text-xs text-muted-foreground">{attachmentSyncMessage}</p>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>

        {hasMissingRequiredDischargeDocs && (
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">Upload missing documents now</p>
            {missingRequiredDischargeDocs.map((doc) => (
              <div key={doc.key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`doc-${doc.key}`}>{doc.label}</Label>
                    <HelpPopover
                      content={`What this is: ${doc.what}\n\nRecommended source: ${doc.sourceHint}`}
                    />
                  </div>
                  {doc.interventionCode ? (
                    <p className="text-xs text-muted-foreground mb-1">
                      Required for intervention: {doc.interventionCode}
                    </p>
                  ) : null}
                  <Input
                    id={`doc-${doc.key}`}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setDocFiles((prev) => ({ ...prev, [doc.key]: file }));
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!docFiles[doc.key] || uploadDocMutation.isPending || fetchingLocalAttachments}
                  onClick={() => {
                    const selected = docFiles[doc.key];
                    if (!selected) return;
                    uploadDocMutation.mutate({ requirement: doc, file: selected });
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

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Claim diagnoses (DHA)</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void runFreshPreview()}
              disabled={loadingIlmPreview || fetchingIlmPreview || diagnosisBusy}
            >
              {fetchingIlmPreview ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <div>
              <DiagnosisCodeInput
                label="Diagnosis code"
                value={diagnosisCodeInput}
                onChange={setDiagnosisCodeInput}
                showSNOMED={false}
                defaultToICD11={false}
                disabled={diagnosisBusy}
              />
              {diagnosisUsesIcd10Fallback ? (
                <p className="text-xs text-destructive mt-1">
                  DHA diagnosis submission expects ICD-11. Pick an ICD-11 diagnosis before adding.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="discharge-diagnosis-intervention">Intervention</Label>
              <select
                id="discharge-diagnosis-intervention"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={diagnosisInterventionInput}
                onChange={(e) => setDiagnosisInterventionInput(e.target.value)}
              >
                <option value="">Select intervention</option>
                {activeInterventions.map((intervention) => (
                  <option key={intervention.intervention_code} value={intervention.intervention_code}>
                    {intervention.intervention_code}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => addDiagnosisMutation.mutate()}
              disabled={!selectedDiagnosisCode || !diagnosisInterventionInput.trim() || diagnosisUsesIcd10Fallback || diagnosisBusy}
            >
              {addDiagnosisMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </div>

          {claimDiagnoses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No diagnoses found in DHA preview yet.</p>
          ) : (
            <div className="space-y-2">
              {claimDiagnoses.map((diagnosis) => (
                <div
                  key={diagnosis.key}
                  className="flex flex-col gap-2 rounded border bg-background p-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {diagnosis.icdCode}
                      {diagnosis.name ? ` - ${diagnosis.name}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Intervention: {diagnosis.interventionCode || '-'}
                      {diagnosis.recordedAt ? ` • Recorded: ${diagnosis.recordedAt}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={diagnosisBusy}
                    onClick={() => {
                      removeDiagnosisMutation.mutate({
                        icdCode: diagnosis.icdCode,
                        interventionCode: diagnosis.interventionCode,
                      });
                    }}
                  >
                    {removeDiagnosisMutation.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-3 w-3" />
                    )}
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Claim doctors (DHA)</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void runFreshPreview()}
              disabled={loadingIlmPreview || fetchingIlmPreview || doctorBusy}
            >
              {fetchingIlmPreview ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          <div
            className={`grid grid-cols-1 gap-3 ${doctorNeedsRegulator
              ? 'sm:grid-cols-[1fr_180px_140px_auto]'
              : 'sm:grid-cols-[1fr_180px_auto]'} sm:items-end`}
          >
            <div>
              <Label htmlFor="discharge-doctor-id">Doctor identification number</Label>
              <Input
                id="discharge-doctor-id"
                value={doctorIdNumberInput}
                onChange={(e) => setDoctorIdNumberInput(e.target.value)}
                placeholder="e.g. National ID or SLADE"
              />
            </div>
            <div>
              <Label htmlFor="discharge-doctor-id-type">ID type</Label>
              <select
                id="discharge-doctor-id-type"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={doctorIdTypeInput}
                onChange={(e) => setDoctorIdTypeInput(e.target.value)}
              >
                {DOCTOR_ID_TYPES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            {doctorNeedsRegulator ? (
              <div>
                <Label htmlFor="discharge-doctor-regulator">Licensing body</Label>
                <select
                  id="discharge-doctor-regulator"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={doctorRegulationBodyInput}
                  onChange={(e) => setDoctorRegulationBodyInput(e.target.value)}
                >
                  <option value="">Select body</option>
                  {DOCTOR_REGULATORS.map((regulator) => (
                    <option key={regulator} value={regulator}>
                      {regulator}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => addDoctorMutation.mutate()}
              disabled={
                !token.trim()
                || !doctorIdNumberInput.trim()
                || (doctorNeedsRegulator && !doctorRegulationBodyInput.trim())
                || doctorBusy
              }
            >
              {addDoctorMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </div>

          {!token.trim() ? (
            <p className="text-xs text-muted-foreground">
              Enter consent token above to add or remove claim doctor details.
            </p>
          ) : null}

          {claimDoctors.length === 0 ? (
            <p className="text-xs text-muted-foreground">No doctors found in DHA preview yet.</p>
          ) : (
            <div className="space-y-2">
              {claimDoctors.map((doctor) => (
                <div
                  key={doctor.key}
                  className="flex flex-col gap-2 rounded border bg-background p-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {doctor.doctorName || 'Doctor'}
                      {doctor.sladeCode ? ` - ${doctor.sladeCode}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status: {doctor.requestStatus || '-'}
                      {doctor.recordedAt ? ` • Recorded: ${doctor.recordedAt}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!token.trim() || doctorBusy}
                    onClick={() => {
                      removeDoctorMutation.mutate();
                    }}
                  >
                    {removeDoctorMutation.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-3 w-3" />
                    )}
                    Remove
                  </Button>
                </div>
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
                disabled={
                  busy
                  || !token
                  || hasMissingPerDiemTariffs
                  || hasMissingRequiredDischargeDocs
                  || !dhaAttachmentsSynced
                }
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
                  || !dhaAttachmentsSynced
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
                disabled={
                  busy
                  || (!otp && !authGuid)
                  || hasMissingPerDiemTariffs
                  || !dhaAttachmentsSynced
                  || (useBiometric && biometricStatus === 'pending')
                }
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
