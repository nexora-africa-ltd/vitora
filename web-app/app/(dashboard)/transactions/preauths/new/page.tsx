/**
 * New Pre-authorization Request Wizard (Enhanced)
 *
 * Multi-step form for creating a pre-authorization request.
 * Step 1: Select patient and linked claim
 * Step 2: Consent (embedded OTP/biometric flow via ConsentPanel)
 * Step 3: Clinical details (intervention search, ICD-10 picker, doctors, documents)
 * Step 4: Review and submit
 *
 * Automations:
 * - Patient picker with autocomplete (pre-fills from URL ?patient=X&claim=Y)
 * - Eligibility pre-check before consent
 * - Consent token obtained via embedded ConsentPanel (OTP/biometric)
 * - Intervention code via searchable dropdown (SHA terminology)
 * - Preauth type auto-derived from selected intervention flags
 * - Diagnoses via ICD-10 multi-select search
 * - Doctors via staff search (registration numbers)
 * - Duplicate detection before submit
 * - Estimated cost display from intervention catalog
 * - Document upload for clinical justification
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileCheck,
  Stethoscope,
  Loader2,
  CheckCircle2,
  Scissors,
  Eye,
  Heart,
  Scan,
  Pill,
  Activity,
  AlertTriangle,
  X,
  DollarSign,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { ConsentPanel } from '@/components/billing/sha/ConsentPanel';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import {
  DiagnosisCodeInput,
  emptyDiagnosisCodeValue,
  type DiagnosisCodeValue,
} from '@/components/shared/diagnosis-code-input';
import { cn } from '@/lib/utils';
import { shaApi, type ClaimAttachment } from '@/lib/api/sha';
import { encountersApi } from '@/lib/api/encounters';
import { laboratoryApi } from '@/lib/api/laboratory';
import { imagingApi } from '@/lib/api/imaging';
import { useToast } from '@/lib/hooks/use-toast';
import {
  type InterventionOption,
  mapClaimInterventionToOption,
} from '@/lib/sha/preauth-interventions';
import { extractDHAErrorMessage } from '@/lib/sha/error-parser';
import { toCrId } from '@/lib/sha/ilm-parsers';
import { usePatientEncounters } from '@/lib/hooks/use-patients';
import { useFacility } from '@/lib/context/facility-context';

// ============================================================================
// Preauth Types
// ============================================================================

const PREAUTH_TYPES = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Standard pre-authorization for general services',
    icon: FileCheck,
    color: 'text-blue-600',
    requiresDoctors: false,
  },
  {
    id: 'surgical',
    label: 'Surgical',
    description: 'Pre-authorization for surgical procedures',
    icon: Scissors,
    color: 'text-red-600',
    requiresDoctors: true,
  },
  {
    id: 'elective',
    label: 'Elective',
    description: 'Planned elective procedures requiring doctor consent',
    icon: Stethoscope,
    color: 'text-purple-600',
    requiresDoctors: true,
  },
  {
    id: 'oncology',
    label: 'Oncology',
    description: 'Cancer treatment pre-authorization',
    icon: Pill,
    color: 'text-pink-600',
    requiresDoctors: true,
  },
  {
    id: 'renal',
    label: 'Renal',
    description: 'Kidney/dialysis treatment pre-authorization',
    icon: Heart,
    color: 'text-orange-600',
    requiresDoctors: false,
  },
  {
    id: 'imaging',
    label: 'Imaging',
    description: 'Medical imaging and investigations',
    icon: Scan,
    color: 'text-cyan-600',
    requiresDoctors: false,
  },
  {
    id: 'optical',
    label: 'Optical',
    description: 'Optical/eye care services',
    icon: Eye,
    color: 'text-green-600',
    requiresDoctors: false,
  },
] as const;

type PreauthType = (typeof PREAUTH_TYPES)[number]['id'];

const ANAESTHESIA_OPTIONS = [
  { value: 'GENERAL', label: 'General' },
  { value: 'LOCAL', label: 'Local' },
  { value: 'SPINAL_BLOCK', label: 'Spinal block' },
  { value: 'SEDATION', label: 'Sedation' },
] as const;

type AnaesthesiaType = (typeof ANAESTHESIA_OPTIONS)[number]['value'];

function normalizeDoctorRegulationBody(value: string | undefined): string {
  const text = String(value || '').trim();
  if (!text) return 'KMPDC';
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  if (normalized === 'kmpdc' || normalized === 'kenya medical practitioners and dentists council') {
    return 'KMPDC';
  }
  if (normalized === 'coc' || normalized === 'clinical officers council') {
    return 'COC';
  }
  if (
    normalized === 'nck' ||
    normalized === 'nursing council' ||
    normalized === 'nursing council of kenya'
  ) {
    return 'NCK';
  }
  return text;
}

function normalizeFundLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (upper.includes('SHIF')) return 'SHIF';
  if (upper.includes('UHC')) return 'UHC';
  if (upper.includes('PMF') || upper.includes('PFMS')) return 'PMF';
  return upper;
}

function extractIlmResults(payload: unknown): Array<Record<string, unknown>> {
  const queue: unknown[] = [payload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      return current.filter(
        (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object'
      );
    }
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    for (const key of ['results', 'data', 'interventions', 'benefits', 'items']) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value.filter(
          (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object'
        );
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }
  return [];
}

function toPreauthAttachmentDocumentType(doc: DraftDocument): string {
  const required = String(doc.requiredDocType || '')
    .trim()
    .toUpperCase();
  if (required === 'IMAGING_RESULT') return 'RADIOLOGY_REQUEST';
  if (required === 'LAB_RESULTS') return 'LAB_ORDER';
  if (required === 'MEDICAL_REPORT') return 'MEDICAL_REPORT';
  if (required === 'PREAUTH_FORM') return 'CLINICAL_DOCUMENTATION';
  return 'OTHER';
}

interface DiagnosisChip {
  code: string;
  display: string;
}

interface DoctorChip {
  registration_number: string;
  name: string;
  identification_type?: string;
  regulation_body?: string;
}

interface PreauthEvidenceOption {
  key: string;
  title: string;
  subtitle: string;
  documentType: string;
  exportText: string;
}

interface DraftDocument {
  key: string;
  file: File;
  displayName: string;
  claimAttachmentId?: number;
  evidenceKey?: string;
  requiredDocType?: string;
  source?: 'manual' | 'generated' | 'required_upload' | 'evidence';
  claimFileUrl?: string;
  fileSizeBytes?: number;
  mimeType?: string;
}

function buildDocumentIdentity(name: string, size: number, mimeType: string): string {
  const normalizedName = String(name || '')
    .trim()
    .toLowerCase();
  const normalizedSize = Number.isFinite(size) ? size : 0;
  const normalizedMime = String(mimeType || '')
    .trim()
    .toLowerCase();
  return `${normalizedName}::${normalizedSize}::${normalizedMime}`;
}

function documentIdentityFromFile(file: File): string {
  return buildDocumentIdentity(file.name, file.size, file.type);
}

function documentIdentityFromDraft(doc: DraftDocument): string {
  return buildDocumentIdentity(
    doc.file?.name || doc.displayName,
    doc.fileSizeBytes ?? doc.file?.size ?? 0,
    doc.mimeType ?? doc.file?.type ?? ''
  );
}

function claimAttachmentSignature(attachment: ClaimAttachment): string {
  const checksum = String(attachment.checksum || '')
    .trim()
    .toLowerCase();
  if (checksum) return `sha256:${checksum}`;
  return buildDocumentIdentity(
    String(attachment.original_filename || attachment.name || '').trim(),
    Number(attachment.file_size || 0),
    String(attachment.mime_type || '')
  );
}

const PREAUTH_DOC_TO_ATTACHMENT_TYPE: Record<string, string> = {
  IMAGING_RESULT: 'radiology_report',
  LAB_RESULTS: 'lab_report',
  MEDICAL_REPORT: 'medical_report',
  PREAUTH_FORM: 'preauth_approval',
};

const AUTO_GENERATABLE_PREAUTH_DOC_TYPES = new Set(['MEDICAL_REPORT', 'PREAUTH_FORM']);
const PREAUTH_DRAFT_STORAGE_KEY = 'transactions-preauth-new-draft-v2';

function escapePdfText(input: string): string {
  return input.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function wrapPdfLines(lines: string[], maxCharsPerLine: number = 95): string[] {
  const wrapped: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine ?? '';
    if (line.length <= maxCharsPerLine) {
      wrapped.push(line);
      continue;
    }

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      if (!current) {
        if (word.length <= maxCharsPerLine) {
          current = word;
        } else {
          // Hard-split very long tokens (e.g. URLs/codes)
          for (let i = 0; i < word.length; i += maxCharsPerLine) {
            wrapped.push(word.slice(i, i + maxCharsPerLine));
          }
        }
        continue;
      }

      const candidate = `${current} ${word}`;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
        continue;
      }

      wrapped.push(current);
      if (word.length <= maxCharsPerLine) {
        current = word;
      } else {
        for (let i = 0; i < word.length; i += maxCharsPerLine) {
          wrapped.push(word.slice(i, i + maxCharsPerLine));
        }
        current = '';
      }
    }

    if (current) wrapped.push(current);
  }
  return wrapped;
}

function buildSimplePdf(lines: string[]): Uint8Array {
  const normalized = wrapPdfLines(lines.length > 0 ? lines : ['']);
  const safeLines = normalized.slice(0, 200);
  const contentOps = [
    'BT',
    '/F1 10 Tf',
    '50 760 Td',
    ...safeLines.flatMap((line, index) =>
      index === 0 ? [`(${escapePdfText(line)}) Tj`] : ['0 -14 Td', `(${escapePdfText(line)}) Tj`]
    ),
    'ET',
  ].join('\n');

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
  );
  objects.push(
    `4 0 obj\n<< /Length ${contentOps.length} >>\nstream\n${contentOps}\nendstream\nendobj\n`
  );
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const header = '%PDF-1.4\n';
  let body = '';
  const offsets = [0];
  let cursor = header.length;
  for (const obj of objects) {
    offsets.push(cursor);
    body += obj;
    cursor += obj.length;
  }

  const xrefStart = cursor;
  const xrefRows = [
    '0000000000 65535 f ',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
  ];
  const xref = `xref\n0 ${objects.length + 1}\n${xrefRows.join('\n')}\n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const pdfText = header + body + xref + trailer;
  return new TextEncoder().encode(pdfText);
}

function buildPdfFile(filenameBase: string, lines: string[]): File {
  const safeBase = filenameBase.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'document';
  const bytes = buildSimplePdf(lines);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new File([arrayBuffer], `${safeBase}.pdf`, { type: 'application/pdf' });
}

// ============================================================================
// Component
// ============================================================================

export default function NewPreauthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { facilityDetail } = useFacility();

  // Pre-fill from URL params (e.g., navigating from claim or patient page)
  const urlPatientId = searchParams.get('patient');
  const urlClaimId = searchParams.get('claim');
  const urlEncounterId = searchParams.get('encounter');

  const [selectedType, setSelectedType] = useState<PreauthType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---- Step 1: Patient + Claim ----
  const [patientId, setPatientId] = useState<number | null>(
    urlPatientId ? Number(urlPatientId) : null
  );
  const [claimId, setClaimId] = useState(urlClaimId || '');
  const [encounterId, setEncounterId] = useState(urlEncounterId || '');

  // ---- Step 2: Consent ----
  const [consentToken, setConsentToken] = useState('');
  const [consentTokenId, setConsentTokenId] = useState<number | undefined>();
  const [consentedInterventionCode, setConsentedInterventionCode] = useState('');
  const [shaMemberId, setShaMemberId] = useState<number | null>(null);
  const [forceConsentRefresh, setForceConsentRefresh] = useState(false);
  const [consentRefreshReason, setConsentRefreshReason] = useState<string | null>(null);

  // ---- Step 3: Clinical Details ----
  const [interventionCode, setInterventionCode] = useState('');
  const [interventionName, setInterventionName] = useState('');
  const [interventionPrice, setInterventionPrice] = useState<number | null>(null);

  const [diagnosisChips, setDiagnosisChips] = useState<DiagnosisChip[]>([]);
  const [diagnosisInput, setDiagnosisInput] =
    useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());

  const [doctorChips, setDoctorChips] = useState<DoctorChip[]>([]);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<number | undefined>();
  const [showManualDoctorForm, setShowManualDoctorForm] = useState(false);
  const [manualDoctorName, setManualDoctorName] = useState('');
  const [manualDoctorRegNumber, setManualDoctorRegNumber] = useState('');
  const [manualDoctorIdType, setManualDoctorIdType] = useState('registration_number');
  const [manualDoctorRegBody, setManualDoctorRegBody] = useState('KMPDC');
  const [manualLookupIdType, setManualLookupIdType] = useState<'National ID' | 'passport'>(
    'National ID'
  );
  const [manualLookupIdNumber, setManualLookupIdNumber] = useState('');
  const [manualLookupLoading, setManualLookupLoading] = useState(false);

  const [tariffChips, setTariffChips] = useState<string[]>([]);
  const [tariffInput, setTariffInput] = useState('');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
  const [typeOfAnaesthesia, setTypeOfAnaesthesia] = useState<AnaesthesiaType | ''>('');
  const [providerNotificationEmail, setProviderNotificationEmail] = useState('');
  const [providerNotificationEmailTouched, setProviderNotificationEmailTouched] = useState(false);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalNotesTouched, setClinicalNotesTouched] = useState(false);
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const [linkedEvidenceKeys, setLinkedEvidenceKeys] = useState<string[]>([]);
  const [evidenceClaimAttachmentIds, setEvidenceClaimAttachmentIds] = useState<
    Record<string, number>
  >({});
  const [evidenceBusyKeys, setEvidenceBusyKeys] = useState<string[]>([]);
  const [generatedRequiredDocTypes, setGeneratedRequiredDocTypes] = useState<string[]>([]);
  const [uploadedRequiredDocTypes, setUploadedRequiredDocTypes] = useState<string[]>([]);
  const [requiredDocUploadBusyTypes, setRequiredDocUploadBusyTypes] = useState<string[]>([]);
  const [showEvidenceSearch, setShowEvidenceSearch] = useState(false);
  const [activeEvidenceDocType, setActiveEvidenceDocType] = useState<string | null>(null);
  const [evidenceSearchTerm, setEvidenceSearchTerm] = useState('');
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [activeDocumentKey, setActiveDocumentKey] = useState<string | null>(null);
  const [attachmentEditName, setAttachmentEditName] = useState('');
  const [attachmentReplacementFile, setAttachmentReplacementFile] = useState<File | null>(null);
  const [attachmentDialogBusy, setAttachmentDialogBusy] = useState(false);
  const clinicalNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const evidenceSearchRef = useRef<HTMLInputElement | null>(null);
  const previousInterventionCodeRef = useRef('');
  const previousEncounterIdRef = useRef<number | null>(null);
  const hydratedDraftRef = useRef(false);

  const selectedEncounterIdNumber = useMemo(() => {
    const parsed = Number(encounterId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [encounterId]);

  const derivePreauthType = useCallback(
    (intervention: Partial<InterventionOption>): PreauthType => {
      const asRecord = intervention as Record<string, unknown>;
      const nestedRaw = ((asRecord.raw_data && typeof asRecord.raw_data === 'object'
        ? asRecord.raw_data
        : null) ||
        (asRecord.intervention_payload && typeof asRecord.intervention_payload === 'object'
          ? asRecord.intervention_payload
          : null) ||
        {}) as Record<string, unknown>;

      const isFlagTrue = (...candidates: unknown[]): boolean => {
        for (const value of candidates) {
          if (value === true) return true;
          if (typeof value === 'number' && value !== 0) return true;
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
          }
        }
        return false;
      };

      if (
        isFlagTrue(
          intervention.needsManualPreauthApproval,
          intervention.needs_manual_preauth_approval,
          nestedRaw.needsManualPreauthApproval,
          nestedRaw.needs_manual_preauth_approval
        )
      )
        return 'elective';

      if (
        isFlagTrue(
          intervention.isSurgicalPreauth,
          intervention.is_surgical_preauth,
          intervention.requiresSurgicalPreauth,
          intervention.requires_surgical_preauth,
          nestedRaw.isSurgicalPreauth,
          nestedRaw.is_surgical_preauth,
          nestedRaw.requiresSurgicalPreauth,
          nestedRaw.requires_surgical_preauth
        )
      )
        return 'surgical';

      if (
        isFlagTrue(
          intervention.isRenalPreauth,
          intervention.is_renal_preauth,
          intervention.requiresRenalPreauth,
          intervention.requires_renal_preauth,
          nestedRaw.isRenalPreauth,
          nestedRaw.is_renal_preauth,
          nestedRaw.requiresRenalPreauth,
          nestedRaw.requires_renal_preauth
        )
      )
        return 'renal';

      if (
        isFlagTrue(
          intervention.isOncologyPreauth,
          intervention.is_oncology_preauth,
          intervention.requiresOncologyPreauth,
          intervention.requires_oncology_preauth,
          nestedRaw.isOncologyPreauth,
          nestedRaw.is_oncology_preauth,
          nestedRaw.requiresOncologyPreauth,
          nestedRaw.requires_oncology_preauth
        )
      )
        return 'oncology';

      if (
        isFlagTrue(
          intervention.isImagingPreauth,
          intervention.is_imaging_preauth,
          intervention.requiresRadiologyPreauth,
          intervention.requires_radiology_preauth,
          nestedRaw.isImagingPreauth,
          nestedRaw.is_imaging_preauth,
          nestedRaw.requiresRadiologyPreauth,
          nestedRaw.requires_radiology_preauth
        )
      )
        return 'imaging';

      if (
        isFlagTrue(
          intervention.isOpticalPreauth,
          intervention.is_optical_preauth,
          intervention.requiresOpticalPreauth,
          intervention.requires_optical_preauth,
          nestedRaw.isOpticalPreauth,
          nestedRaw.is_optical_preauth,
          nestedRaw.requiresOpticalPreauth,
          nestedRaw.requires_optical_preauth
        )
      )
        return 'optical';

      return 'normal';
    },
    []
  );

  // ---- Eligibility pre-check ----
  const {
    data: eligibility,
    isLoading: eligibilityLoading,
    error: eligibilityError,
  } = useQuery({
    queryKey: ['patient-eligibility', patientId],
    queryFn: async () => {
      if (!patientId) return null;
      const result = await shaApi.checkPatientEligibility(patientId);
      if (result.member) {
        setShaMemberId(result.member.id);
      }
      return result;
    },
    enabled: !!patientId,
    retry: false,
  });

  // ---- Patient claims (for claim link picker) ----
  const { data: patientClaims, isLoading: patientClaimsLoading } = useQuery({
    queryKey: ['patient-claims', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const result = await shaApi.getClaims({ patient: patientId, page_size: 50 });
      return result.results || [];
    },
    enabled: !!patientId,
  });

  const { data: patientEncounters } = usePatientEncounters(patientId ?? -1);

  const { data: selectedEncounterDiagnoses } = useQuery({
    queryKey: ['preauth-encounter-diagnoses', selectedEncounterIdNumber],
    queryFn: () => encountersApi.getDiagnoses(selectedEncounterIdNumber!),
    enabled: selectedEncounterIdNumber != null,
    staleTime: 30_000,
  });

  const selectedClaimIdNumber = useMemo(() => {
    const parsed = Number(claimId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [claimId]);

  const { data: selectedClaim, isLoading: selectedClaimLoading } = useQuery({
    queryKey: ['preauth-context-claim', selectedClaimIdNumber],
    queryFn: () => shaApi.getClaim(selectedClaimIdNumber!),
    enabled: selectedClaimIdNumber != null,
    staleTime: 30_000,
  });

  const { data: selectedClaimAttachments = [], isLoading: selectedClaimAttachmentsLoading } =
    useQuery({
      queryKey: ['preauth-context-claim-attachments', selectedClaimIdNumber],
      queryFn: () => shaApi.getClaimAttachments(selectedClaimIdNumber!),
      enabled: selectedClaimIdNumber != null,
      staleTime: 30_000,
    });

  const { data: selectedEncounterRecord } = useQuery({
    queryKey: ['preauth-encounter-record', selectedEncounterIdNumber],
    queryFn: () => encountersApi.get(selectedEncounterIdNumber!),
    enabled: selectedEncounterIdNumber != null,
    staleTime: 30_000,
  });

  const claimLinkedShaMemberId = useMemo(() => {
    const raw = selectedClaim as unknown as Record<string, unknown> | null;
    if (!raw) return null;
    const candidate = raw.sha_member ?? raw.shaMember;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0)
      return candidate;
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [selectedClaim]);

  const effectiveShaMemberId = shaMemberId ?? claimLinkedShaMemberId;

  const patientCrId = useMemo(() => {
    const claim = selectedClaim as unknown as Record<string, unknown> | null;
    const member =
      (eligibility as unknown as { member?: Record<string, unknown> } | null)?.member || null;
    const candidates = [
      claim?.patient_cr_number,
      claim?.patientCrNumber,
      claim?.sha_member_number,
      claim?.shaMemberNumber,
      claim?.member_number,
      claim?.memberNumber,
      member?.cr_number,
      member?.crNumber,
      member?.sha_number,
      member?.shaNumber,
    ];
    for (const candidate of candidates) {
      const value = typeof candidate === 'string' ? candidate.trim() : '';
      if (!value) continue;
      const normalized = toCrId(value);
      if (/^CR\d+-\d$/i.test(normalized)) return normalized.toUpperCase();
    }
    return '';
  }, [selectedClaim, eligibility]);

  const { data: latestClaimConsent, error: latestClaimConsentError } = useQuery({
    queryKey: [
      'preauth-latest-consent',
      effectiveShaMemberId,
      selectedEncounterIdNumber,
      selectedClaimIdNumber,
      interventionCode,
    ],
    queryFn: async () => {
      if (!effectiveShaMemberId) return null;
      try {
        return await shaApi.getLatestConsent(effectiveShaMemberId, {
          claimPk: selectedClaimIdNumber ?? undefined,
          encounterId: selectedEncounterIdNumber ?? undefined,
          interventionCode: selectedType === 'elective' ? interventionCode || undefined : undefined,
        });
      } catch (error) {
        const response = (
          error as { response?: { status?: number; data?: Record<string, unknown> } }
        )?.response;
        const statusCode = response?.status;
        const code = typeof response?.data?.code === 'string' ? response.data.code : '';

        if (statusCode === 404 && code === 'consent_token_not_found') {
          return null;
        }

        if (
          statusCode === 404 &&
          (code === 'consent_token_expired' || code === 'claim_consent_expired')
        ) {
          throw error;
        }

        if (statusCode === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!effectiveShaMemberId && selectedType !== 'elective',
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (shaMemberId) return;
    if (!claimLinkedShaMemberId) return;
    setShaMemberId(claimLinkedShaMemberId);
  }, [shaMemberId, claimLinkedShaMemberId]);

  useEffect(() => {
    if (selectedType === 'elective') return;
    if (forceConsentRefresh) return;
    if (consentToken) return; // keep an explicitly-collected fresh token
    if (!latestClaimConsent?.consent_token || latestClaimConsent.status !== 'VALIDATED') return;
    setConsentTokenId(latestClaimConsent.id);
    setConsentToken(latestClaimConsent.consent_token);
    if (!consentedInterventionCode && interventionCode) {
      setConsentedInterventionCode(interventionCode);
    }
  }, [
    selectedType,
    forceConsentRefresh,
    consentToken,
    latestClaimConsent?.id,
    latestClaimConsent?.consent_token,
    latestClaimConsent?.status,
    consentedInterventionCode,
    interventionCode,
  ]);

  const claimDerivedTokenStatus = useMemo(() => {
    if (latestClaimConsent?.consent_token) {
      return {
        text: `${latestClaimConsent.consent_token.slice(0, 40)}...`,
        helper: '',
      };
    }

    const responseData = (
      latestClaimConsentError as { response?: { data?: Record<string, unknown> } } | null
    )?.response?.data;
    const code = typeof responseData?.code === 'string' ? responseData.code : '';

    if (code === 'claim_consent_expired' || code === 'consent_token_expired') {
      return {
        text: 'Expired',
        helper: 'Claim-derived token expired; collect fresh consent.',
      };
    }

    if (code === 'consent_token_not_found') {
      return {
        text: 'Not available',
        helper: 'No validated consent token found for this context.',
      };
    }

    return {
      text: 'Not available',
      helper: '',
    };
  }, [latestClaimConsent?.consent_token, latestClaimConsentError]);

  useEffect(() => {
    if (!selectedClaim) return;
    if (!encounterId && selectedClaim.encounter) {
      setEncounterId(String(selectedClaim.encounter));
    }
  }, [selectedClaim, encounterId]);

  useEffect(() => {
    if (!selectedClaim) return;
    if (!serviceStartDate && selectedClaim.service_date) {
      setServiceStartDate(String(selectedClaim.service_date));
    }
    if (!serviceEndDate) {
      const claimEndDate = selectedClaim.discharge_date || selectedClaim.service_date;
      if (claimEndDate) {
        setServiceEndDate(String(claimEndDate));
      }
    }
  }, [selectedClaim, serviceStartDate, serviceEndDate]);

  useEffect(() => {
    if (serviceStartDate && !serviceEndDate) {
      setServiceEndDate(serviceStartDate);
    }
  }, [serviceStartDate, serviceEndDate]);

  useEffect(() => {
    if (previousEncounterIdRef.current === null) {
      previousEncounterIdRef.current = selectedEncounterIdNumber;
      return;
    }
    if (previousEncounterIdRef.current === selectedEncounterIdNumber) return;
    previousEncounterIdRef.current = selectedEncounterIdNumber;
    if (!consentToken) return;
    setConsentToken('');
    setConsentTokenId(undefined);
    setConsentedInterventionCode('');
    toast({
      title: 'Consent reset',
      description:
        selectedType === 'elective'
          ? 'Encounter changed. Please obtain consent again for the updated visit context.'
          : 'Encounter changed. The active consent token will be re-linked if available.',
    });
  }, [selectedEncounterIdNumber, consentToken, selectedType, toast]);

  useEffect(() => {
    if (providerNotificationEmailTouched || providerNotificationEmail) return;
    const fallbackEmail =
      facilityDetail?.dha_facility_email || facilityDetail?.dha_admin_email || '';
    if (fallbackEmail) {
      setProviderNotificationEmail(fallbackEmail);
    }
  }, [
    facilityDetail?.dha_admin_email,
    facilityDetail?.dha_facility_email,
    providerNotificationEmail,
    providerNotificationEmailTouched,
  ]);

  const interventionOptions = useMemo<InterventionOption[]>(() => {
    const raw = selectedClaim?.claim_interventions;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry) => {
        const status = String((entry as Record<string, unknown>).status || '').toLowerCase();
        return status === 'active';
      })
      .map((entry) => mapClaimInterventionToOption(entry as Record<string, unknown>));
  }, [selectedClaim?.claim_interventions]);

  useEffect(() => {
    if (hydratedDraftRef.current) return;
    hydratedDraftRef.current = true;

    try {
      const raw = window.sessionStorage.getItem(PREAUTH_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, unknown>;

      if (typeof draft.selectedType === 'string') {
        const allowed = new Set(PREAUTH_TYPES.map((item) => item.id));
        if (allowed.has(draft.selectedType as PreauthType)) {
          setSelectedType(draft.selectedType as PreauthType);
        }
      }
      if (typeof draft.typeOfAnaesthesia === 'string') {
        const candidate = draft.typeOfAnaesthesia.toUpperCase();
        const allowed = new Set(ANAESTHESIA_OPTIONS.map((item) => item.value));
        if (allowed.has(candidate as AnaesthesiaType)) {
          setTypeOfAnaesthesia(candidate as AnaesthesiaType);
        }
      }
    } catch {
      // Ignore malformed drafts and continue with a fresh form.
    }
  }, []);

  useEffect(() => {
    if (!hydratedDraftRef.current) return;

    const payload = {
      selectedType,
      typeOfAnaesthesia,
    };

    window.sessionStorage.setItem(PREAUTH_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  }, [
    selectedType,
    typeOfAnaesthesia,
  ]);

  const { data: selectedInterventionRecord, isFetching: selectedInterventionRecordLoading } =
    useQuery({
      queryKey: [
        'preauth-intervention-record',
        interventionCode,
        selectedClaimIdNumber,
        patientCrId,
        patientId,
        effectiveShaMemberId,
      ],
      queryFn: async () => {
        if (!interventionCode) return null;

        if (patientCrId) {
          const parentBenefitCode = interventionCode.includes('-')
            ? interventionCode.split('-').slice(0, 2).join('-')
            : '';
          if (parentBenefitCode) {
            try {
              const subBenefits = await shaApi.ilmSubBenefits({
                patient_id: patientCrId,
                parent_benefit_code: parentBenefitCode,
                ...(patientId ? { patient_pk: patientId } : {}),
                ...(effectiveShaMemberId ? { sha_member_id: effectiveShaMemberId } : {}),
              });
              const subBenefitCodes = extractIlmResults(subBenefits.data)
                .map((item) =>
                  String(item.subBenefitCode || item.sub_benefit_code || item.code || '').trim()
                )
                .filter(Boolean);

              const claimType = String(
                (selectedClaim as { claim_type?: string } | null)?.claim_type || ''
              ).toLowerCase();
              const serviceType = claimType === 'inpatient' ? 'INPATIENT' : 'OUTPATIENT';

              for (const subBenefitCode of subBenefitCodes.slice(0, 25)) {
                const interventions = await shaApi.ilmBenefitInterventions({
                  patient_id: patientCrId,
                  sub_benefit_code: subBenefitCode,
                  ...(patientId ? { patient_pk: patientId } : {}),
                  ...(effectiveShaMemberId ? { sha_member_id: effectiveShaMemberId } : {}),
                  service_type: serviceType,
                });
                const match = extractIlmResults(interventions.data).find((item) => {
                  const code = String(
                    item.code || item.interventionCode || item.intervention_code || ''
                  ).trim();
                  return code === interventionCode;
                });
                if (match) return match;
              }
            } catch {
              // Fall through to terminology lookup for non-doc metadata fallback.
            }
          }
        }

        const selectedClaimRecord = selectedClaim as unknown as Record<string, unknown> | null;
        const facilityRecord = selectedClaimRecord?.facility;
        const facilityLevelFromFacility =
          facilityRecord && typeof facilityRecord === 'object'
            ? (facilityRecord as Record<string, unknown>).level
            : undefined;
        const facilityLevelRaw =
          selectedClaimRecord?.facility_level ??
          selectedClaimRecord?.facilityLevel ??
          facilityLevelFromFacility;
        const facilityLevel =
          typeof facilityLevelRaw === 'number'
            ? facilityLevelRaw
            : typeof facilityLevelRaw === 'string'
              ? Number(String(facilityLevelRaw).replace(/^L/i, ''))
              : NaN;

        const exact = await shaApi.searchInterventions({
          code: interventionCode,
          ...(Number.isFinite(facilityLevel) ? { facility_level: facilityLevel } : {}),
          limit: 1,
        });
        const exactMatch = (exact.results || [])[0] || null;
        if (exactMatch) return exactMatch;

        const fallback = await shaApi.searchInterventions({
          search: interventionCode,
          limit: 200,
        });
        return (fallback.results || []).find((item) => item.code === interventionCode) || null;
      },
      enabled: !!interventionCode,
      staleTime: 30_000,
    });

  const interventionSelectOptions = useMemo(() => {
    return interventionOptions.map((item) => {
      const mechanism = item.paymentMechanism
        ? item.paymentMechanism.replaceAll('_', ' ').toUpperCase()
        : null;
      const mechanismLabel =
        mechanism === 'FEE FOR SERVICE' ? 'FFS' : mechanism === 'PER DIEM' ? 'PER DIEM' : mechanism;
      const effectiveNeedsPreauth =
        item.needsPreauth ??
        (item.isSurgicalPreauth ||
          item.isRenalPreauth ||
          item.isOncologyPreauth ||
          item.isImagingPreauth ||
          item.isOpticalPreauth ||
          item.needsManualPreauthApproval ||
          false);
      const flags: string[] = [];
      if (mechanismLabel) flags.push(mechanismLabel);
      if (effectiveNeedsPreauth) flags.push('PREAUTH');
      return {
        value: item.code,
        label: `${item.code} - ${item.name}`,
        sublabel: flags.join(' • ') || undefined,
      };
    });
  }, [interventionOptions]);

  const selectedRequiredDocumentTypes = useMemo(() => {
    const selectedFromBenefits = interventionOptions.find(
      (entry) => entry.code === interventionCode
    );
    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    if (!raw && !selectedFromBenefits) return [] as string[];
    const extras = (
      raw?.raw_data && typeof raw.raw_data === 'object' ? raw.raw_data : null
    ) as Record<string, unknown> | null;
    const docTypes = [
      ...(Array.isArray(selectedFromBenefits?.requiredPreauthDocumentTypes)
        ? selectedFromBenefits.requiredPreauthDocumentTypes
        : []),
      ...(Array.isArray(selectedFromBenefits?.required_preauth_document_types)
        ? selectedFromBenefits.required_preauth_document_types
        : []),
      ...(Array.isArray(raw?.requiredPreauthDocumentTypes) ? raw.requiredPreauthDocumentTypes : []),
      ...(Array.isArray(raw?.required_preauth_document_types)
        ? raw.required_preauth_document_types
        : []),
      ...(Array.isArray(extras?.requiredPreauthDocumentTypes)
        ? extras.requiredPreauthDocumentTypes
        : []),
      ...(Array.isArray(extras?.required_preauth_document_types)
        ? extras.required_preauth_document_types
        : []),
    ];
    return Array.from(
      new Set(docTypes.map((item) => String(item).trim().toUpperCase()).filter(Boolean))
    );
  }, [interventionOptions, interventionCode, selectedInterventionRecord]);

  const restoredRequiredDocumentTypes = useMemo(() => {
    const fromDocuments = documents
      .map((doc) =>
        String(doc.requiredDocType || '')
          .trim()
          .toUpperCase()
      )
      .filter(Boolean);
    return Array.from(
      new Set([...generatedRequiredDocTypes, ...uploadedRequiredDocTypes, ...fromDocuments])
    );
  }, [documents, generatedRequiredDocTypes, uploadedRequiredDocTypes]);

  const effectiveRequiredDocumentTypes = useMemo(() => {
    if (selectedRequiredDocumentTypes.length > 0) return selectedRequiredDocumentTypes;
    return restoredRequiredDocumentTypes;
  }, [selectedRequiredDocumentTypes, restoredRequiredDocumentTypes]);

  const needsLabEvidence = effectiveRequiredDocumentTypes.includes('LAB_RESULTS');
  const needsImagingEvidence = effectiveRequiredDocumentTypes.includes('IMAGING_RESULT');

  const { data: patientLabResults } = useQuery({
    queryKey: ['preauth-patient-lab-results', patientId],
    queryFn: () => laboratoryApi.getPatientResults(patientId!),
    enabled: !!patientId && needsLabEvidence,
    staleTime: 30_000,
  });

  const { data: patientImagingOrders } = useQuery({
    queryKey: ['preauth-patient-imaging-orders', patientId],
    queryFn: () => imagingApi.getPatientOrders(patientId!),
    enabled: !!patientId && needsImagingEvidence,
    staleTime: 30_000,
  });

  const preauthEvidenceOptions = useMemo<PreauthEvidenceOption[]>(() => {
    const options: PreauthEvidenceOption[] = [];

    if (needsLabEvidence) {
      for (const row of patientLabResults || []) {
        const result = row as unknown as Record<string, unknown>;
        const id = Number(result.id || 0);
        if (!id) continue;
        const testName = String(
          result.test_name || result.test || result.parameter_name || `Lab result #${id}`
        );
        const numericValue = result.numeric_value;
        const textValue = result.text_value;
        const optionValue = result.option_value;
        const formattedValue = result.formatted_value;
        const value = String(
          formattedValue ||
            (numericValue != null ? numericValue : '') ||
            textValue ||
            optionValue ||
            result.result_value ||
            result.value ||
            ''
        ).trim();
        const status = String(
          result.verification_status || result.result_flag || result.status || ''
        ).trim();
        const enteredAt = String(result.entered_at || '').trim();
        options.push({
          key: `lab-${id}`,
          title: testName,
          subtitle:
            [value, status, enteredAt ? `at ${enteredAt}` : ''].filter(Boolean).join(' • ') ||
            'Lab result',
          documentType: 'LAB_RESULTS',
          exportText: `LAB RESULT\nID: ${id}\nTest: ${testName}\nValue: ${value || '-'}\nStatus: ${status || '-'}\nEntered At: ${enteredAt || '-'}\n`,
        });
      }
    }

    if (needsImagingEvidence) {
      for (const row of patientImagingOrders || []) {
        const order = row as unknown as Record<string, unknown>;
        const id = Number(order.id || 0);
        if (!id) continue;
        const status = String(order.status || '').toUpperCase();
        if (status !== 'REPORTED' && status !== 'COMPLETED') continue;
        const orderNumber = String(order.order_number || `IMG-${id}`);
        const summary =
          order.report_summary && typeof order.report_summary === 'object'
            ? String(
                (order.report_summary as Record<string, unknown>).impression ||
                  (order.report_summary as Record<string, unknown>).findings ||
                  ''
              )
            : '';
        options.push({
          key: `img-${id}`,
          title: `Imaging ${orderNumber}`,
          subtitle: summary || status,
          documentType: 'IMAGING_RESULT',
          exportText: `IMAGING RESULT\nID: ${id}\nOrder: ${orderNumber}\nStatus: ${status || '-'}\nSummary: ${summary || '-'}\n`,
        });
      }
    }

    return options;
  }, [needsLabEvidence, needsImagingEvidence, patientLabResults, patientImagingOrders]);

  const resolveRequiredDocTypeForDocument = useCallback((doc: DraftDocument): string | null => {
    const explicit = String(doc.requiredDocType || '')
      .trim()
      .toUpperCase();
    if (explicit) return explicit;
    const label = String(doc.displayName || doc.file?.name || '')
      .trim()
      .toUpperCase();
    if (label.includes('PREAUTH FORM')) return 'PREAUTH_FORM';
    if (label.includes('MEDICAL REPORT')) return 'MEDICAL_REPORT';
    if (label.includes('LAB RESULT')) return 'LAB_RESULTS';
    if (label.includes('IMAGING RESULT')) return 'IMAGING_RESULT';
    return null;
  }, []);

  const fulfilledRequiredDocTypes = useMemo(() => {
    const linkedTypes = linkedEvidenceKeys
      .map((key) => preauthEvidenceOptions.find((option) => option.key === key)?.documentType)
      .filter((value): value is string => !!value);
    const fromDocuments = documents
      .map((doc) => resolveRequiredDocTypeForDocument(doc))
      .filter((value): value is string => !!value);
    return new Set([
      ...linkedTypes,
      ...generatedRequiredDocTypes,
      ...uploadedRequiredDocTypes,
      ...fromDocuments,
    ]);
  }, [
    linkedEvidenceKeys,
    preauthEvidenceOptions,
    generatedRequiredDocTypes,
    uploadedRequiredDocTypes,
    documents,
    resolveRequiredDocTypeForDocument,
  ]);

  const missingRequiredDocumentTypes = useMemo(() => {
    return effectiveRequiredDocumentTypes.filter(
      (docType) => !fulfilledRequiredDocTypes.has(docType)
    );
  }, [effectiveRequiredDocumentTypes, fulfilledRequiredDocTypes]);

  const hasAllRequiredDocuments = missingRequiredDocumentTypes.length === 0;

  const filteredEvidenceOptions = useMemo(() => {
    const term = evidenceSearchTerm.trim().toLowerCase();
    return preauthEvidenceOptions.filter((option) => {
      if (activeEvidenceDocType && option.documentType !== activeEvidenceDocType) return false;
      if (!term) return true;
      const haystack = `${option.title} ${option.subtitle} ${option.documentType}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [preauthEvidenceOptions, activeEvidenceDocType, evidenceSearchTerm]);

  const documentsByRequiredType = useMemo(() => {
    const grouped: Record<string, DraftDocument[]> = {};
    for (const doc of documents) {
      const docType = resolveRequiredDocTypeForDocument(doc);
      if (!docType) continue;
      if (!grouped[docType]) grouped[docType] = [];
      grouped[docType]!.push(doc);
    }
    return grouped;
  }, [documents, resolveRequiredDocTypeForDocument]);

  const claimAttachmentById = useMemo(() => {
    const map = new Map<number, ClaimAttachment>();
    selectedClaimAttachments.forEach((attachment) => {
      map.set(attachment.id, attachment);
    });
    return map;
  }, [selectedClaimAttachments]);

  const explicitClaimAttachmentIds = useMemo(() => {
    const unique = new Set<number>();
    documents.forEach((doc) => {
      if (typeof doc.claimAttachmentId === 'number') unique.add(doc.claimAttachmentId);
    });
    return Array.from(unique);
  }, [documents]);

  const staleAttachmentRefs = useMemo(() => {
    if (selectedClaimAttachmentsLoading) return [];
    return explicitClaimAttachmentIds.filter((id) => !claimAttachmentById.has(id));
  }, [claimAttachmentById, explicitClaimAttachmentIds, selectedClaimAttachmentsLoading]);

  const resolvedPreauthAttachmentSummary = useMemo(() => {
    const signatures = new Set<string>();
    let fromClaim = 0;
    let fromUploads = 0;
    let dedupedOut = 0;

    explicitClaimAttachmentIds.forEach((attachmentId) => {
      const attachment = claimAttachmentById.get(attachmentId);
      if (!attachment) return;
      const signature = claimAttachmentSignature(attachment);
      if (signatures.has(signature)) {
        dedupedOut += 1;
      } else {
        signatures.add(signature);
        fromClaim += 1;
      }
    });

    const uploadableDocuments = documents.filter(
      (doc) => doc.file && doc.file.size > 0 && typeof doc.claimAttachmentId !== 'number'
    );
    uploadableDocuments.forEach((doc) => {
      const signature = documentIdentityFromDraft(doc);
      if (signatures.has(signature)) {
        dedupedOut += 1;
      } else {
        signatures.add(signature);
        fromUploads += 1;
      }
    });

    return {
      total: signatures.size,
      fromClaim,
      fromUploads,
      dedupedOut,
    };
  }, [claimAttachmentById, documents, explicitClaimAttachmentIds]);

  const includedAttachmentRows = useMemo(() => {
    return documents
      .filter((doc) => typeof doc.claimAttachmentId === 'number' || (doc.file && doc.file.size > 0))
      .map((doc) => {
        const claimAttachment =
          typeof doc.claimAttachmentId === 'number'
            ? claimAttachmentById.get(doc.claimAttachmentId)
            : undefined;
        const stale = typeof doc.claimAttachmentId === 'number' && !claimAttachment;
        return {
          key: doc.key,
          title: doc.displayName || doc.file.name,
          sourceLabel: claimAttachment ? 'existing claim attachment' : 'new upload',
          stale,
        };
      });
  }, [claimAttachmentById, documents]);

  const selectedInterventionTariff = useMemo(() => {
    if (interventionPrice != null) return interventionPrice;

    const selectedFromBenefits = interventionOptions.find(
      (entry) => entry.code === interventionCode
    );
    if (selectedFromBenefits?.price != null) return selectedFromBenefits.price;

    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    if (!raw) return null;

    const rawData =
      raw.raw_data && typeof raw.raw_data === 'object'
        ? (raw.raw_data as Record<string, unknown>)
        : null;

    const candidates = [
      raw.price,
      raw.tariff_amount,
      raw.tariffAmount,
      raw.overallTariff,
      raw.overall_tariff,
      raw.kephLevelTarriff,
      raw.keph_level_tarriff,
      raw.level2_tariff,
      raw.level3_tariff,
      raw.level4_tariff,
      raw.level5_tariff,
      raw.level6_tariff,
      rawData?.level_2_tariff,
      rawData?.level_3_tariff,
      rawData?.level_4_tariff,
      rawData?.level_5_tariff,
      rawData?.level_6_tariff,
      rawData?.['Tariff (KES)'],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
      if (typeof candidate === 'string') {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }, [interventionPrice, interventionCode, interventionOptions, selectedInterventionRecord]);

  const shouldShowTariffLookupWarning = useMemo(() => {
    if (!interventionCode) return false;
    if (selectedInterventionTariff != null) return false;
    if (selectedInterventionRecordLoading) return false;
    return true;
  }, [interventionCode, selectedInterventionTariff, selectedInterventionRecordLoading]);

  const patientActiveFunds = useMemo(() => {
    const funds = new Set<string>();

    (eligibility?.eligible_schemes || []).forEach((scheme) => {
      const normalized = normalizeFundLabel(scheme);
      if (normalized) funds.add(normalized);
    });

    const schemeCategory = normalizeFundLabel(eligibility?.member?.scheme_category);
    if (schemeCategory) funds.add(schemeCategory);

    const directSchemes =
      (eligibility as unknown as { schemes?: Array<{ schemeName?: string }> })?.schemes || [];
    directSchemes.forEach((entry) => {
      const normalized = normalizeFundLabel(entry?.schemeName);
      if (normalized) funds.add(normalized);
    });

    return Array.from(funds);
  }, [eligibility]);

  const interventionFunds = useMemo(() => {
    const selectedFromBenefits = interventionOptions.find(
      (entry) => entry.code === interventionCode
    );
    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    const nestedRaw =
      raw?.raw_data && typeof raw.raw_data === 'object'
        ? (raw.raw_data as Record<string, unknown>)
        : null;

    const rawFunds = [
      selectedFromBenefits?.fund,
      selectedFromBenefits?.interventionFund,
      selectedFromBenefits?.intervention_fund,
      selectedFromBenefits?.supportedScheme,
      selectedFromBenefits?.supported_scheme,
      ...(selectedFromBenefits?.schemes || []),
      raw?.fund,
      raw?.interventionFund,
      raw?.intervention_fund,
      raw?.supportedScheme,
      raw?.supported_scheme,
      ...(Array.isArray(raw?.schemes) ? raw.schemes : []),
      nestedRaw?.fund,
      nestedRaw?.interventionFund,
      nestedRaw?.intervention_fund,
      nestedRaw?.supportedScheme,
      nestedRaw?.supported_scheme,
      ...(Array.isArray(nestedRaw?.schemes) ? nestedRaw.schemes : []),
    ];

    return Array.from(new Set(rawFunds.map((value) => normalizeFundLabel(value)).filter(Boolean)));
  }, [interventionOptions, interventionCode, selectedInterventionRecord]);

  const isInterventionFundCovered = useMemo(() => {
    const hasAllFundsCoverage = interventionFunds.some((fund) => fund === 'ALL' || fund === '*');
    if (hasAllFundsCoverage) return true;
    if (interventionFunds.length === 0 || patientActiveFunds.length === 0) return null;
    return interventionFunds.some((fund) => patientActiveFunds.includes(fund));
  }, [interventionFunds, patientActiveFunds]);

  // ---- Duplicate detection ----
  const { data: existingPreauths } = useQuery({
    queryKey: ['preauth-duplicate-check', consentToken, interventionCode],
    queryFn: () => shaApi.listLocalPreauths({ consent_token: consentToken }),
    enabled: !!consentToken && !!interventionCode,
  });

  const hasDuplicate = useMemo(() => {
    if (!existingPreauths?.results || !interventionCode) return false;
    return existingPreauths.results.some(
      (p) => p.intervention_code === interventionCode && p.status !== 'cancelled'
    );
  }, [existingPreauths, interventionCode]);

  const doctorAuthorizationRequired = useMemo(() => {
    const fromBenefit = interventionOptions.find((entry) => entry.code === interventionCode);
    if (typeof fromBenefit?.needsDoctorAuthorization === 'boolean') {
      return fromBenefit.needsDoctorAuthorization;
    }
    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    if (!raw) return false;
    const candidate = raw.needsDoctorAuthorization ?? raw.needs_doctor_authorization;
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'string') return candidate.trim().toLowerCase() === 'true';
    if (typeof candidate === 'number') return candidate !== 0;
    return false;
  }, [interventionOptions, interventionCode, selectedInterventionRecord]);

  const isElectiveIntervention = useMemo(() => {
    const fromBenefit = interventionOptions.find((entry) => entry.code === interventionCode);
    const fromBenefitLegacy = (fromBenefit as Record<string, unknown> | undefined)
      ?.needs_manual_preauth_approval;
    const fromBenefitFlag = fromBenefit?.needsManualPreauthApproval ?? fromBenefitLegacy;
    if (typeof fromBenefitFlag === 'boolean') {
      return fromBenefitFlag;
    }
    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    if (!raw) return selectedType === 'elective';
    const candidate = raw.needsManualPreauthApproval ?? raw.needs_manual_preauth_approval;
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'string') return candidate.trim().toLowerCase() === 'true';
    if (typeof candidate === 'number') return candidate !== 0;
    return selectedType === 'elective';
  }, [interventionCode, interventionOptions, selectedInterventionRecord, selectedType]);

  const extractedEncounterFields = useMemo(() => {
    const encounter = selectedEncounterRecord as unknown as Record<string, unknown> | null;
    if (!encounter) {
      return {
        chiefComplaint: '',
        vitalSigns: '',
        historyOfPresentIllness: '',
        physicalExamination: '',
        investigationReportDetails: '',
      };
    }
    const chiefComplaint = String(encounter.chief_complaint || '').trim();
    const historyOfPresentIllness = String(encounter.history_of_present_illness || '').trim();
    const physicalExamination = String(encounter.physical_examination || '').trim();
    const investigationReportDetails = String(encounter.notes || '').trim();
    const vitalSegments: string[] = [];
    if (encounter.temperature != null && String(encounter.temperature).trim()) {
      vitalSegments.push(`Temp ${String(encounter.temperature).trim()}C`);
    }
    if (encounter.pulse != null && String(encounter.pulse).trim()) {
      vitalSegments.push(`Pulse ${String(encounter.pulse).trim()} bpm`);
    }
    if (encounter.blood_pressure != null && String(encounter.blood_pressure).trim()) {
      vitalSegments.push(`BP ${String(encounter.blood_pressure).trim()}`);
    }
    if (encounter.respiratory_rate != null && String(encounter.respiratory_rate).trim()) {
      vitalSegments.push(`RR ${String(encounter.respiratory_rate).trim()}/min`);
    }
    if (encounter.spo2 != null && String(encounter.spo2).trim()) {
      vitalSegments.push(`SpO2 ${String(encounter.spo2).trim()}%`);
    }

    return {
      chiefComplaint,
      vitalSigns: vitalSegments.join(', '),
      historyOfPresentIllness,
      physicalExamination,
      investigationReportDetails,
    };
  }, [selectedEncounterRecord]);

  // ---- Validation ----
  const typeConfig = PREAUTH_TYPES.find((t) => t.id === selectedType);
  const requiresAnaesthesiaSelection = selectedType === 'surgical';
  const hasPatientContext = patientId !== null && selectedClaimIdNumber !== null;
  const hasInterventionSelected = interventionCode.trim().length > 0;
  const hasConsent = !!consentToken;
  const canUseClaimLinkedConsent = Boolean(selectedType !== 'elective' && selectedClaimIdNumber);
  const canReuseClaimConsent = Boolean(
    !forceConsentRefresh &&
    canUseClaimLinkedConsent &&
    ((latestClaimConsent?.status === 'VALIDATED' && latestClaimConsent?.consent_token) ||
      selectedClaim?.consent_obtained)
  );
  const hasConsentForWorkflow = hasConsent || canUseClaimLinkedConsent;
  const effectiveConsentToken = consentToken || latestClaimConsent?.consent_token || '';
  const consentTokenSourceLabel = canUseClaimLinkedConsent
    ? 'Claim-linked token'
    : 'Explicit consent token';
  const canProceedStep3 =
    interventionCode.trim().length > 0 &&
    diagnosisChips.length > 0 &&
    (!(typeConfig?.requiresDoctors || doctorAuthorizationRequired) || doctorChips.length > 0) &&
    (!requiresAnaesthesiaSelection || !!typeOfAnaesthesia);

  const showInterventionSection = hasPatientContext;
  const showConsentSection =
    showInterventionSection &&
    hasInterventionSelected &&
    (!canUseClaimLinkedConsent || forceConsentRefresh);
  const showClinicalSection =
    showInterventionSection && hasInterventionSelected && hasConsentForWorkflow;
  const showReviewSection = showClinicalSection && canProceedStep3;
  const hasConsentInterventionMismatch = Boolean(
    selectedType === 'elective' &&
    consentToken &&
    consentedInterventionCode &&
    interventionCode &&
    consentedInterventionCode.trim() !== interventionCode.trim()
  );

  // ---- Handlers ----
  const handleConsentObtained = useCallback(
    (id: number, token: string, _credential?: unknown, consentInterventionCode?: string) => {
      setConsentTokenId(id);
      setConsentToken(token);
      setForceConsentRefresh(false);
      setConsentRefreshReason(null);
      queryClient.invalidateQueries({ queryKey: ['preauth-latest-consent'] });

      if (!consentInterventionCode) return;
      setConsentedInterventionCode(consentInterventionCode);
      setInterventionCode(consentInterventionCode);

      const matched = interventionOptions.find((item) => item.code === consentInterventionCode);
      setInterventionName(matched?.name || consentInterventionCode);
      setInterventionPrice(matched?.price ?? null);
      if (matched) {
        setSelectedType(
          derivePreauthType({
            needsManualPreauthApproval: matched.needsManualPreauthApproval,
            needs_manual_preauth_approval: (matched as unknown as Record<string, unknown>)
              .needs_manual_preauth_approval as boolean | undefined,
            isSurgicalPreauth: matched.isSurgicalPreauth,
            isRenalPreauth: matched.isRenalPreauth,
            isOncologyPreauth: matched.isOncologyPreauth,
            isImagingPreauth: matched.isImagingPreauth,
            isOpticalPreauth: matched.isOpticalPreauth,
          })
        );
      }
      setTariffChips((prev) =>
        prev.includes(consentInterventionCode) ? prev : [consentInterventionCode, ...prev]
      );
    },
    [interventionOptions, derivePreauthType, queryClient]
  );

  const selectIntervention = useCallback(
    (item: InterventionOption) => {
      if (
        selectedType === 'elective' &&
        consentToken &&
        consentedInterventionCode &&
        consentedInterventionCode.trim() !== item.code.trim()
      ) {
        setConsentToken('');
        setConsentTokenId(undefined);
        toast({
          title: 'Consent reset',
          description:
            'Intervention changed after consent. Please complete consent again for the selected intervention.',
        });
      }
      setInterventionCode(item.code);
      setInterventionName(item.name);
      setInterventionPrice(item.price ?? null);
      setSelectedType(derivePreauthType(item));
      // Auto-add intervention code as the first tariff item
      setTariffChips((prev) => (prev.includes(item.code) ? prev : [item.code, ...prev]));
    },
    [derivePreauthType, consentToken, consentedInterventionCode, selectedType, toast]
  );

  useEffect(() => {
    if (!interventionCode) {
      if (selectedType !== null) setSelectedType(null);
      if (typeOfAnaesthesia) setTypeOfAnaesthesia('');
      if (linkedEvidenceKeys.length > 0) setLinkedEvidenceKeys([]);
      if (Object.keys(evidenceClaimAttachmentIds).length > 0) setEvidenceClaimAttachmentIds({});
      if (generatedRequiredDocTypes.length > 0) setGeneratedRequiredDocTypes([]);
      if (uploadedRequiredDocTypes.length > 0) setUploadedRequiredDocTypes([]);
      if (showEvidenceSearch) setShowEvidenceSearch(false);
      if (activeEvidenceDocType) setActiveEvidenceDocType(null);
      if (evidenceSearchTerm) setEvidenceSearchTerm('');
      previousInterventionCodeRef.current = '';
      return;
    }

    if (
      previousInterventionCodeRef.current &&
      previousInterventionCodeRef.current !== interventionCode
    ) {
      if (typeOfAnaesthesia) setTypeOfAnaesthesia('');
      if (linkedEvidenceKeys.length > 0) setLinkedEvidenceKeys([]);
      if (Object.keys(evidenceClaimAttachmentIds).length > 0) setEvidenceClaimAttachmentIds({});
      if (generatedRequiredDocTypes.length > 0) setGeneratedRequiredDocTypes([]);
      if (uploadedRequiredDocTypes.length > 0) setUploadedRequiredDocTypes([]);
      if (showEvidenceSearch) setShowEvidenceSearch(false);
      if (activeEvidenceDocType) setActiveEvidenceDocType(null);
      if (evidenceSearchTerm) setEvidenceSearchTerm('');
    }
    previousInterventionCodeRef.current = interventionCode;

    const selectedFromBenefits = interventionOptions.find(
      (entry) => entry.code === interventionCode
    );
    const source = {
      ...((selectedInterventionRecord as unknown as Partial<InterventionOption> | null) || {}),
      ...(selectedFromBenefits
        ? {
            needsManualPreauthApproval: selectedFromBenefits.needsManualPreauthApproval,
            needs_manual_preauth_approval: (
              selectedFromBenefits as unknown as Record<string, unknown>
            ).needs_manual_preauth_approval as boolean | undefined,
            isSurgicalPreauth: selectedFromBenefits.isSurgicalPreauth,
            isRenalPreauth: selectedFromBenefits.isRenalPreauth,
            isOncologyPreauth: selectedFromBenefits.isOncologyPreauth,
            isImagingPreauth: selectedFromBenefits.isImagingPreauth,
            isOpticalPreauth: selectedFromBenefits.isOpticalPreauth,
          }
        : {}),
    };

    if (!Object.keys(source).length) return;
    const derivedType = derivePreauthType(source);
    const selectedInterventionName =
      typeof (selectedInterventionRecord as Record<string, unknown> | null)?.name === 'string'
        ? String((selectedInterventionRecord as Record<string, unknown>).name)
        : '';
    if (derivedType !== selectedType) {
      setSelectedType(derivedType);
    }
    if (!interventionName && selectedFromBenefits?.name) {
      setInterventionName(selectedFromBenefits.name);
    } else if (!interventionName && selectedInterventionName) {
      setInterventionName(selectedInterventionName);
    }
  }, [
    interventionCode,
    interventionOptions,
    selectedInterventionRecord,
    derivePreauthType,
    selectedType,
    interventionName,
    linkedEvidenceKeys.length,
    evidenceClaimAttachmentIds,
    generatedRequiredDocTypes.length,
    uploadedRequiredDocTypes.length,
    showEvidenceSearch,
    activeEvidenceDocType,
    evidenceSearchTerm,
    typeOfAnaesthesia,
  ]);

  useEffect(() => {
    if (selectedType === 'surgical') return;
    if (!typeOfAnaesthesia) return;
    setTypeOfAnaesthesia('');
  }, [selectedType, typeOfAnaesthesia]);

  useEffect(() => {
    if (diagnosisChips.length > 0) return;
    const claimCode = selectedClaim?.primary_diagnosis_code?.trim();
    if (claimCode) {
      const claimDescription = selectedClaim?.primary_diagnosis_description?.trim() || claimCode;
      setDiagnosisChips([{ code: claimCode, display: `${claimCode} - ${claimDescription}` }]);
      return;
    }
    const encounterDiagnosis =
      (selectedEncounterDiagnoses || []).find((entry) => {
        const type = String(entry.diagnosis_type || '').toUpperCase();
        return type === 'PRIMARY' || type === 'WORKING';
      }) || selectedEncounterDiagnoses?.[0];
    if (!encounterDiagnosis) return;
    const code = (
      encounterDiagnosis.icd11_code ||
      encounterDiagnosis.icd10_code_display ||
      encounterDiagnosis.icd10_display ||
      ''
    )
      .toString()
      .trim();
    if (!code) return;
    const description = (
      encounterDiagnosis.icd11_display ||
      encounterDiagnosis.icd10_description ||
      encounterDiagnosis.icd10_display ||
      code
    )
      .toString()
      .trim();
    setDiagnosisChips([{ code, display: `${code} - ${description}` }]);
  }, [
    diagnosisChips.length,
    selectedClaim?.primary_diagnosis_code,
    selectedClaim?.primary_diagnosis_description,
    selectedEncounterDiagnoses,
  ]);

  useEffect(() => {
    if (doctorChips.length > 0) return;
    const clinician = selectedClaim?.encounter_clinician;
    if (!clinician) return;
    const registrationNumber =
      clinician.license_number?.trim() || clinician.national_id?.trim() || String(clinician.id);
    const name = clinician.name?.trim() || `Clinician ${clinician.id}`;
    setDoctorChips([
      {
        registration_number: registrationNumber,
        name,
        identification_type: 'registration_number',
        regulation_body: clinician.licensing_body?.trim() || 'KMPDC',
      },
    ]);
  }, [doctorChips.length, selectedClaim?.encounter_clinician]);

  useEffect(() => {
    if (!interventionCode) return;
    const diagnosisLine =
      diagnosisChips.length > 0
        ? diagnosisChips.map((entry) => entry.code).join(', ')
        : 'Pending diagnosis';
    const doctorLine =
      doctorChips.length > 0
        ? doctorChips.map((entry) => entry.name).join(', ')
        : 'Pending clinician assignment';

    const prefix = [
      `Procedure requested: ${interventionCode}${interventionName ? ` - ${interventionName}` : ''}`,
      `Working diagnosis: ${diagnosisLine}`,
      `Attending clinician(s): ${doctorLine}`,
    ];

    const existingLines = clinicalNotes.split('\n');
    const rationaleStart = existingLines.findIndex((line) =>
      line.toLowerCase().startsWith('clinical rationale:')
    );
    const rationaleLines =
      rationaleStart >= 0 ? existingLines.slice(rationaleStart) : ['Clinical rationale: '];
    const nextNotes = [...prefix, ...rationaleLines].join('\n');
    if (nextNotes !== clinicalNotes) {
      setClinicalNotes(nextNotes);
    }
  }, [interventionCode, interventionName, diagnosisChips, doctorChips, clinicalNotes]);

  useEffect(() => {
    if (!interventionCode) return;
    setTariffChips((prev) =>
      prev.includes(interventionCode) ? prev : [interventionCode, ...prev]
    );
  }, [interventionCode]);

  useEffect(() => {
    const textarea = clinicalNotesRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [clinicalNotes]);

  const addDiagnosis = useCallback((item: { code: string; description: string }) => {
    setDiagnosisChips((prev) => {
      if (prev.some((d) => d.code === item.code)) return prev;
      return [...prev, { code: item.code, display: `${item.code} - ${item.description}` }];
    });
  }, []);

  const removeDiagnosis = useCallback((code: string) => {
    setDiagnosisChips((prev) => prev.filter((d) => d.code !== code));
  }, []);

  const addDoctor = useCallback(
    (doc: {
      name: string;
      registration_number: string;
      identification_type?: string;
      regulation_body?: string;
    }) => {
      setDoctorChips((prev) => {
        if (prev.some((d) => d.registration_number === doc.registration_number)) return prev;
        return [
          ...prev,
          {
            registration_number: doc.registration_number,
            name: doc.name,
            identification_type: doc.identification_type || 'registration_number',
            regulation_body: doc.regulation_body || 'KMPDC',
          },
        ];
      });
    },
    []
  );

  const removeDoctor = useCallback((regNum: string) => {
    setDoctorChips((prev) => prev.filter((d) => d.registration_number !== regNum));
  }, []);

  const addManualDoctor = useCallback(() => {
    const name = manualDoctorName.trim();
    const regNumber = manualDoctorRegNumber.trim();
    if (!name || !regNumber) {
      toast({
        title: 'Missing required fields',
        description: 'Practitioner name and registration/identification number are required.',
        variant: 'destructive',
      });
      return;
    }

    addDoctor({
      name,
      registration_number: regNumber,
      identification_type: manualDoctorIdType || 'registration_number',
      regulation_body: manualDoctorRegBody.trim() || 'KMPDC',
    });

    setManualDoctorName('');
    setManualDoctorRegNumber('');
    setManualDoctorIdType('registration_number');
    setManualDoctorRegBody('KMPDC');
    setShowManualDoctorForm(false);
  }, [
    addDoctor,
    manualDoctorIdType,
    manualDoctorName,
    manualDoctorRegBody,
    manualDoctorRegNumber,
    toast,
  ]);

  const lookupManualDoctor = useCallback(async () => {
    const identificationNumber = manualLookupIdNumber.trim();
    if (!identificationNumber) {
      toast({
        title: 'ID required',
        description: 'Enter National ID or passport number to lookup practitioner details.',
        variant: 'destructive',
      });
      return;
    }

    setManualLookupLoading(true);
    try {
      const result = await shaApi.searchPractitioner({
        identification_type: manualLookupIdType,
        identification_number: identificationNumber,
      });
      const practitioner = result.message;

      const fullName = practitioner?.membership?.full_name || '';
      const registrationId = practitioner?.membership?.registration_id || '';
      const licensingBody = practitioner?.membership?.licensing_body || 'KMPDC';

      setManualDoctorName(fullName || manualDoctorName);
      setManualDoctorRegNumber(registrationId || identificationNumber);
      setManualDoctorRegBody(licensingBody);
      setManualDoctorIdType(
        registrationId
          ? 'registration_number'
          : manualLookupIdType === 'passport'
            ? 'passport'
            : 'national_id'
      );

      toast({
        title: 'Practitioner found',
        description: 'Fields prefilled from DHA HWR lookup. Review and add practitioner.',
      });
    } catch (error) {
      toast({
        title: 'Lookup failed',
        description: error instanceof Error ? error.message : 'Unable to find practitioner in HWR',
        variant: 'destructive',
      });
    } finally {
      setManualLookupLoading(false);
    }
  }, [manualLookupIdNumber, manualLookupIdType, manualDoctorName, toast]);

  const makeDraftDocument = useCallback(
    (
      file: File,
      options?: {
        claimAttachmentId?: number;
        displayName?: string;
        evidenceKey?: string;
        requiredDocType?: string;
        source?: DraftDocument['source'];
        claimFileUrl?: string;
        fileSizeBytes?: number;
        mimeType?: string;
      }
    ): DraftDocument => ({
      key: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      displayName: options?.displayName || file.name,
      claimAttachmentId: options?.claimAttachmentId,
      evidenceKey: options?.evidenceKey,
      requiredDocType: options?.requiredDocType,
      source: options?.source || 'manual',
      claimFileUrl: options?.claimFileUrl,
      fileSizeBytes: options?.fileSizeBytes,
      mimeType: options?.mimeType,
    }),
    []
  );

  const activeDocument = useMemo(
    () => documents.find((entry) => entry.key === activeDocumentKey) || null,
    [documents, activeDocumentKey]
  );

  const openAttachmentDialog = useCallback((document: DraftDocument) => {
    setActiveDocumentKey(document.key);
    setAttachmentEditName(document.displayName || document.file.name);
    setAttachmentReplacementFile(null);
    setAttachmentDialogOpen(true);
  }, []);

  const removeDocumentByKey = useCallback(
    (key: string) => {
      const target = documents.find((entry) => entry.key === key);
      if (!target) return;

      setDocuments((prev) => prev.filter((entry) => entry.key !== key));

      if (target.evidenceKey) {
        setLinkedEvidenceKeys((prev) => prev.filter((entry) => entry !== target.evidenceKey));
        setEvidenceClaimAttachmentIds((prev) => {
          const next = { ...prev };
          delete next[target.evidenceKey as string];
          return next;
        });
      }

      if (target.requiredDocType && target.source === 'generated') {
        const remainingSameType = documents.some(
          (entry) =>
            entry.key !== key &&
            entry.requiredDocType === target.requiredDocType &&
            entry.source === 'generated'
        );
        if (!remainingSameType) {
          setGeneratedRequiredDocTypes((prev) =>
            prev.filter((item) => item !== target.requiredDocType)
          );
        }
      }

      if (target.requiredDocType && target.source === 'required_upload') {
        const remainingSameType = documents.some(
          (entry) =>
            entry.key !== key &&
            entry.requiredDocType === target.requiredDocType &&
            entry.source === 'required_upload'
        );
        if (!remainingSameType) {
          setUploadedRequiredDocTypes((prev) =>
            prev.filter((item) => item !== target.requiredDocType)
          );
        }
      }
    },
    [documents]
  );

  const hasDuplicateDocument = useCallback(
    (file: File, options?: { ignoreKey?: string }): boolean => {
      const identity = documentIdentityFromFile(file);
      const ignoreKey = options?.ignoreKey;
      return documents.some(
        (doc) => doc.key !== ignoreKey && documentIdentityFromDraft(doc) === identity
      );
    },
    [documents]
  );

  const removeStaleAttachmentRefs = useCallback(() => {
    if (staleAttachmentRefs.length === 0) return;
    setDocuments((prev) =>
      prev.filter(
        (doc) =>
          !(
            typeof doc.claimAttachmentId === 'number' &&
            staleAttachmentRefs.includes(doc.claimAttachmentId)
          )
      )
    );
    toast({
      title: 'Stale references removed',
      description: `Removed ${staleAttachmentRefs.length} stale attachment reference${staleAttachmentRefs.length === 1 ? '' : 's'}.`,
    });
  }, [staleAttachmentRefs, toast]);

  const uploadRequiredDocument = useCallback(
    async (documentType: string, files: FileList | null) => {
      if (!files || files.length === 0) return;
      const selectedFiles = Array.from(files);
      const normalizedDocType = String(documentType || '')
        .trim()
        .toUpperCase();
      if (!normalizedDocType) return;

      const seenBatchIdentities = new Set<string>();
      const dedupedFiles = selectedFiles.filter((file) => {
        const identity = documentIdentityFromFile(file);
        if (seenBatchIdentities.has(identity)) return false;
        seenBatchIdentities.add(identity);
        return !hasDuplicateDocument(file);
      });
      const skippedCount = selectedFiles.length - dedupedFiles.length;

      if (dedupedFiles.length === 0) {
        toast({
          title: 'Duplicate file skipped',
          description: 'This document is already attached in the preauth form.',
        });
        return;
      }

      setRequiredDocUploadBusyTypes((prev) =>
        prev.includes(normalizedDocType) ? prev : [...prev, normalizedDocType]
      );

      try {
        const draftDocsToAdd: DraftDocument[] = [];
        if (selectedClaimIdNumber) {
          const attachmentType = PREAUTH_DOC_TO_ATTACHMENT_TYPE[normalizedDocType] || 'other';
          for (const file of dedupedFiles) {
            const created = await shaApi.createClaimAttachment(selectedClaimIdNumber, {
              attachment_type: attachmentType,
              name: file.name,
              description: `Required preauth document (${normalizedDocType.replace(/_/g, ' ')})`,
              file,
            });
            draftDocsToAdd.push(
              makeDraftDocument(file, {
                claimAttachmentId: created.id,
                requiredDocType: normalizedDocType,
                source: 'required_upload',
                claimFileUrl: created.file || undefined,
                fileSizeBytes: created.file_size || undefined,
                mimeType: created.mime_type || file.type,
              })
            );
          }
        } else {
          draftDocsToAdd.push(
            ...dedupedFiles.map((file) =>
              makeDraftDocument(file, {
                requiredDocType: normalizedDocType,
                source: 'required_upload',
              })
            )
          );
        }

        setDocuments((prev) => [...prev, ...draftDocsToAdd]);
        setUploadedRequiredDocTypes((prev) =>
          prev.includes(normalizedDocType) ? prev : [...prev, normalizedDocType]
        );

        toast({
          title: 'Required document uploaded',
          description: `${normalizedDocType.replace(/_/g, ' ')} file${dedupedFiles.length > 1 ? 's' : ''} added.${skippedCount > 0 ? ` Skipped ${skippedCount} duplicate file${skippedCount > 1 ? 's' : ''}.` : ''}`,
        });
      } catch (error) {
        toast({
          title: 'Upload failed',
          description:
            error instanceof Error ? error.message : 'Unable to upload required document',
          variant: 'destructive',
        });
      } finally {
        setRequiredDocUploadBusyTypes((prev) =>
          prev.filter((entry) => entry !== normalizedDocType)
        );
      }
    },
    [hasDuplicateDocument, makeDraftDocument, selectedClaimIdNumber, toast]
  );

  const addEvidenceAsDocument = useCallback(
    async (option: PreauthEvidenceOption) => {
      if (linkedEvidenceKeys.includes(option.key)) return;
      setEvidenceBusyKeys((prev) => (prev.includes(option.key) ? prev : [...prev, option.key]));

      try {
        const safeName = option.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const file = buildPdfFile(
          `${option.documentType.toLowerCase()}-${safeName || option.key}`,
          option.exportText.split('\n')
        );

        if (hasDuplicateDocument(file)) {
          toast({
            title: 'Duplicate file skipped',
            description: `${option.title} is already attached.`,
          });
          return;
        }

        let createdAttachmentId: number | null = null;
        let createdAttachmentUrl: string | undefined;
        let createdAttachmentMimeType: string | undefined;
        let createdAttachmentSize: number | undefined;

        if (selectedClaimIdNumber) {
          const attachmentType = PREAUTH_DOC_TO_ATTACHMENT_TYPE[option.documentType] || 'other';
          const created = await shaApi.createClaimAttachment(selectedClaimIdNumber, {
            attachment_type: attachmentType,
            name: option.title,
            description: `Auto-linked preauth evidence (${option.documentType})`,
            file,
          });
          if (typeof created?.id === 'number') {
            createdAttachmentId = created.id;
          }
          createdAttachmentUrl = created.file || undefined;
          createdAttachmentMimeType = created.mime_type || undefined;
          createdAttachmentSize = created.file_size || undefined;
          toast({
            title: 'Evidence attached to claim',
            description: `${option.title} uploaded as ${attachmentType.replace(/_/g, ' ')}.`,
          });
        }

        setDocuments((prev) => [
          ...prev,
          makeDraftDocument(file, {
            claimAttachmentId: createdAttachmentId ?? undefined,
            evidenceKey: option.key,
            displayName: option.title,
            requiredDocType: option.documentType,
            source: 'evidence',
            claimFileUrl: createdAttachmentUrl,
            fileSizeBytes: createdAttachmentSize,
            mimeType: createdAttachmentMimeType || file.type,
          }),
        ]);
        setLinkedEvidenceKeys((prev) => [...prev, option.key]);
        if (createdAttachmentId != null) {
          setEvidenceClaimAttachmentIds((prev) => ({
            ...prev,
            [option.key]: createdAttachmentId as number,
          }));
        }
      } catch (error) {
        toast({
          title: 'Evidence attachment failed',
          description: error instanceof Error ? error.message : 'Failed to attach evidence',
          variant: 'destructive',
        });
      } finally {
        setEvidenceBusyKeys((prev) => prev.filter((entry) => entry !== option.key));
      }
    },
    [hasDuplicateDocument, linkedEvidenceKeys, makeDraftDocument, selectedClaimIdNumber, toast]
  );

  const attachFirstEvidenceForType = useCallback(
    async (documentType: string) => {
      const candidate = preauthEvidenceOptions.find(
        (option) => option.documentType === documentType && !linkedEvidenceKeys.includes(option.key)
      );
      if (!candidate) return;
      await addEvidenceAsDocument(candidate);
    },
    [preauthEvidenceOptions, linkedEvidenceKeys, addEvidenceAsDocument]
  );

  const detachEvidence = useCallback(
    (key: string) => {
      setLinkedEvidenceKeys((prev) => prev.filter((entry) => entry !== key));
      setDocuments((prev) => prev.filter((entry) => entry.evidenceKey !== key));
      setEvidenceClaimAttachmentIds((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast({
        title: 'Evidence detached',
        description: 'The linked record was removed from this draft preauth package.',
      });
    },
    [toast]
  );

  const removeEvidenceFromClaim = useCallback(
    async (key: string) => {
      if (!selectedClaimIdNumber) return;
      const attachmentId = evidenceClaimAttachmentIds[key];
      if (!attachmentId) {
        detachEvidence(key);
        return;
      }

      try {
        await shaApi.deleteClaimAttachment(selectedClaimIdNumber, attachmentId);
        setLinkedEvidenceKeys((prev) => prev.filter((entry) => entry !== key));
        setDocuments((prev) => prev.filter((entry) => entry.evidenceKey !== key));
        setEvidenceClaimAttachmentIds((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        toast({
          title: 'Removed from claim',
          description: 'Attachment deleted from linked claim and detached from this preauth draft.',
        });
      } catch (error) {
        toast({
          title: 'Failed to remove from claim',
          description:
            error instanceof Error ? error.message : 'Unable to delete attachment from claim',
          variant: 'destructive',
        });
      }
    },
    [detachEvidence, evidenceClaimAttachmentIds, selectedClaimIdNumber, toast]
  );

  const removeRequiredDocType = useCallback(
    async (docType: string) => {
      const targets = documents.filter((doc) => resolveRequiredDocTypeForDocument(doc) === docType);
      if (targets.length === 0) return;

      setAttachmentDialogBusy(true);
      try {
        if (selectedClaimIdNumber) {
          for (const doc of targets) {
            if (doc.claimAttachmentId) {
              await shaApi.deleteClaimAttachment(selectedClaimIdNumber, doc.claimAttachmentId);
            }
          }
        }

        setDocuments((prev) =>
          prev.filter((doc) => resolveRequiredDocTypeForDocument(doc) !== docType)
        );
        setGeneratedRequiredDocTypes((prev) => prev.filter((item) => item !== docType));
        setUploadedRequiredDocTypes((prev) => prev.filter((item) => item !== docType));

        const evidenceKeys = targets
          .map((doc) => doc.evidenceKey)
          .filter((key): key is string => !!key);
        if (evidenceKeys.length > 0) {
          setLinkedEvidenceKeys((prev) => prev.filter((key) => !evidenceKeys.includes(key)));
          setEvidenceClaimAttachmentIds((prev) => {
            const next = { ...prev };
            for (const key of evidenceKeys) delete next[key];
            return next;
          });
        }

        toast({
          title: 'Attachment removed',
          description: `${docType.replace(/_/g, ' ')} removed. You can now replace it.`,
        });
      } catch (error) {
        toast({
          title: 'Remove failed',
          description: error instanceof Error ? error.message : 'Unable to remove attachment',
          variant: 'destructive',
        });
      } finally {
        setAttachmentDialogBusy(false);
      }
    },
    [documents, resolveRequiredDocTypeForDocument, selectedClaimIdNumber, toast]
  );

  const saveAttachmentChanges = useCallback(async () => {
    if (!activeDocument) return;
    const nextName =
      attachmentEditName.trim() || activeDocument.displayName || activeDocument.file.name;

    if (
      attachmentReplacementFile &&
      hasDuplicateDocument(attachmentReplacementFile, { ignoreKey: activeDocument.key })
    ) {
      toast({
        title: 'Duplicate file skipped',
        description: 'This replacement file is already attached.',
        variant: 'destructive',
      });
      return;
    }

    setAttachmentDialogBusy(true);
    try {
      let updatedName = nextName;
      let updatedFile = activeDocument.file;
      let updatedFileUrl = activeDocument.claimFileUrl;
      let updatedFileSize = activeDocument.fileSizeBytes;
      let updatedMimeType = activeDocument.mimeType;

      if (activeDocument.claimAttachmentId && selectedClaimIdNumber) {
        const updated = await shaApi.updateClaimAttachment(
          selectedClaimIdNumber,
          activeDocument.claimAttachmentId,
          {
            name: nextName,
            ...(attachmentReplacementFile ? { file: attachmentReplacementFile } : {}),
          }
        );
        updatedName = updated.name || nextName;
        if (attachmentReplacementFile) updatedFile = attachmentReplacementFile;
        updatedFileUrl = updated.file || updatedFileUrl;
        updatedFileSize = updated.file_size || updatedFileSize;
        updatedMimeType = updated.mime_type || updatedMimeType;
      } else if (attachmentReplacementFile) {
        updatedFile = attachmentReplacementFile;
        updatedFileSize = attachmentReplacementFile.size;
        updatedMimeType = attachmentReplacementFile.type;
      }

      setDocuments((prev) =>
        prev.map((entry) =>
          entry.key === activeDocument.key
            ? {
                ...entry,
                displayName: updatedName,
                file: updatedFile,
                claimFileUrl: updatedFileUrl,
                fileSizeBytes: updatedFileSize,
                mimeType: updatedMimeType,
              }
            : entry
        )
      );

      setAttachmentDialogOpen(false);
      setAttachmentReplacementFile(null);
      toast({
        title: 'Attachment updated',
        description: 'Attachment details were updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unable to update attachment',
        variant: 'destructive',
      });
    } finally {
      setAttachmentDialogBusy(false);
    }
  }, [
    activeDocument,
    attachmentEditName,
    attachmentReplacementFile,
    hasDuplicateDocument,
    selectedClaimIdNumber,
    toast,
  ]);

  const deleteAttachmentFromDialog = useCallback(async () => {
    if (!activeDocument) return;

    setAttachmentDialogBusy(true);
    try {
      if (activeDocument.claimAttachmentId && selectedClaimIdNumber) {
        await shaApi.deleteClaimAttachment(selectedClaimIdNumber, activeDocument.claimAttachmentId);
      }

      if (activeDocument.evidenceKey) {
        setLinkedEvidenceKeys((prev) =>
          prev.filter((entry) => entry !== activeDocument.evidenceKey)
        );
        setEvidenceClaimAttachmentIds((prev) => {
          if (!activeDocument.evidenceKey) return prev;
          const next = { ...prev };
          delete next[activeDocument.evidenceKey];
          return next;
        });
      }

      removeDocumentByKey(activeDocument.key);
      setAttachmentDialogOpen(false);
      toast({
        title: 'Attachment deleted',
        description: 'Attachment removed from this preauth draft and claim (if linked).',
      });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete attachment',
        variant: 'destructive',
      });
    } finally {
      setAttachmentDialogBusy(false);
    }
  }, [activeDocument, removeDocumentByKey, selectedClaimIdNumber, toast]);

  const openEvidenceSearchForType = useCallback((documentType: string) => {
    setShowEvidenceSearch(true);
    setActiveEvidenceDocType(documentType);
    setEvidenceSearchTerm('');
    setTimeout(() => evidenceSearchRef.current?.focus(), 0);
  }, []);

  const generateRequiredDocDraft = useCallback(
    async (documentType: string) => {
      if (!AUTO_GENERATABLE_PREAUTH_DOC_TYPES.has(documentType)) return;

      setDocuments((prev) =>
        prev.filter(
          (doc) =>
            !(
              resolveRequiredDocTypeForDocument(doc) === documentType &&
              (doc.source === 'generated' || doc.source === 'required_upload')
            )
        )
      );
      setGeneratedRequiredDocTypes((prev) => prev.filter((item) => item !== documentType));
      setUploadedRequiredDocTypes((prev) => prev.filter((item) => item !== documentType));

      const encounterCtx = selectedEncounterIdNumber || selectedClaim?.encounter;
      const contextToken = encounterCtx
        ? `encounter-${encounterCtx}`
        : selectedClaimIdNumber
          ? `claim-${selectedClaimIdNumber}`
          : interventionCode
            ? `intervention-${interventionCode.toLowerCase()}`
            : `draft-${Date.now()}`;
      if (!encounterCtx && !selectedClaimIdNumber && !patientId) {
        toast({
          title: 'Context required',
          description: `Select patient/claim context to auto-generate ${documentType.replace(/_/g, ' ')}.`,
          variant: 'destructive',
        });
        return;
      }

      const diagnosisText = diagnosisChips.map((entry) => entry.code).join(', ') || '-';
      const clinicianText = doctorChips.map((entry) => entry.name).join(', ') || '-';
      const nowIso = new Date().toISOString();

      const contentLines =
        documentType === 'PREAUTH_FORM'
          ? [
              'PREAUTH FORM (AUTO-GENERATED ATTACHMENT)',
              `Generated At: ${nowIso}`,
              '',
              `Patient ID: ${patientId || '-'}`,
              `Claim ID: ${selectedClaimIdNumber || '-'}`,
              `Encounter ID: ${encounterCtx || '-'}`,
              `Intervention Code: ${interventionCode || '-'}`,
              `Intervention Name: ${interventionName || '-'}`,
              `Preauth Type: ${selectedType || '-'}`,
              `Attending Clinician(s): ${clinicianText}`,
              `Diagnosis Codes: ${diagnosisText}`,
              '',
              'Clinical Rationale:',
              clinicalNotes || '-',
              '',
            ]
          : [
              'MEDICAL REPORT (AUTO-GENERATED ATTACHMENT)',
              `Generated At: ${nowIso}`,
              '',
              `Patient ID: ${patientId || '-'}`,
              `Encounter ID: ${encounterCtx || '-'}`,
              `Claim ID: ${selectedClaimIdNumber || '-'}`,
              '',
              'Clinical Context:',
              `Intervention: ${interventionCode || '-'}${interventionName ? ` - ${interventionName}` : ''}`,
              `Diagnosis: ${diagnosisText}`,
              `Clinician: ${clinicianText}`,
              '',
              'Clinical Notes:',
              clinicalNotes || 'Auto-generated from preauth context.',
            ];
      const file = buildPdfFile(`${documentType.toLowerCase()}-${contextToken}`, contentLines);

      if (hasDuplicateDocument(file)) {
        toast({
          title: 'Duplicate file skipped',
          description: `${documentType.replace(/_/g, ' ')} is already attached.`,
        });
        return;
      }

      try {
        let createdAttachmentId: number | undefined;
        if (selectedClaimIdNumber) {
          const attachmentType = PREAUTH_DOC_TO_ATTACHMENT_TYPE[documentType] || 'other';
          const created = await shaApi.createClaimAttachment(selectedClaimIdNumber, {
            attachment_type: attachmentType,
            name: `${documentType.replace(/_/g, ' ')} draft`,
            description: `Auto-generated from ${contextToken.replace(/-/g, ' ')}`,
            file,
          });
          createdAttachmentId = created.id;
        }
        setDocuments((prev) => [
          ...prev,
          makeDraftDocument(file, {
            claimAttachmentId: createdAttachmentId,
            displayName: `${documentType.replace(/_/g, ' ')} draft`,
            requiredDocType: documentType,
            source: 'generated',
          }),
        ]);
        setGeneratedRequiredDocTypes((prev) => [...prev, documentType]);
        toast({
          title: 'Document generated',
          description: `${documentType.replace(/_/g, ' ')} draft added to uploads.`,
        });
      } catch (error) {
        toast({
          title: 'Generation failed',
          description: error instanceof Error ? error.message : 'Unable to generate draft document',
          variant: 'destructive',
        });
      }
    },
    [
      resolveRequiredDocTypeForDocument,
      selectedEncounterIdNumber,
      selectedClaim?.encounter,
      selectedClaimIdNumber,
      hasDuplicateDocument,
      makeDraftDocument,
      patientId,
      interventionCode,
      interventionName,
      diagnosisChips,
      doctorChips,
      clinicalNotes,
      selectedType,
      toast,
    ]
  );

  const handleSubmit = async () => {
    const requiresExplicitConsentToken = selectedType === 'elective';
    const consentTokenForSubmit = (effectiveConsentToken || '').trim();
    if (
      !canProceedStep3 ||
      (requiresExplicitConsentToken && !consentTokenForSubmit) ||
      (forceConsentRefresh && !consentTokenForSubmit) ||
      !patientId ||
      !selectedClaimIdNumber ||
      !hasAllRequiredDocuments ||
      hasConsentInterventionMismatch ||
      (selectedType === 'surgical' && !typeOfAnaesthesia)
    )
      return;
    setIsSubmitting(true);
    try {
      const extraFields: Record<string, unknown> = {};
      if (selectedType) {
        extraFields.preauth_type = selectedType;
      }
      extraFields.needs_manual_preauth_approval = selectedType === 'elective';
      if (diagnosisChips.length > 0) {
        extraFields.diagnoses = diagnosisChips.map((d) => ({
          ...(consentTokenForSubmit ? { consent_token: consentTokenForSubmit } : {}),
          icd_code: d.code,
        }));
      }
      if (doctorChips.length > 0) {
        extraFields.doctors = doctorChips.map((d, index) => ({
          identification_number: d.registration_number,
          identification_type: d.identification_type || 'registration_number',
          regulation_body: normalizeDoctorRegulationBody(d.regulation_body),
          intervention_code: interventionCode.trim(),
          is_primary: index === 0,
        }));
      }
      if (tariffChips.length > 0) {
        extraFields.items = tariffChips.map((itemCode) => ({
          item_code: itemCode,
          ItemCode: itemCode,
          unit_price:
            selectedInterventionTariff != null ? String(selectedInterventionTariff) : undefined,
          UnitPrice:
            selectedInterventionTariff != null ? String(selectedInterventionTariff) : undefined,
          quantity: '1',
          Quantity: '1',
        }));
      }
      if (clinicalNotes.trim()) {
        extraFields.clinical_notes = clinicalNotes;
      }
      if (selectedType === 'surgical') {
        const chiefComplaint = extractedEncounterFields.chiefComplaint;
        const vitalSigns = extractedEncounterFields.vitalSigns;
        const historyOfPresentIllness = extractedEncounterFields.historyOfPresentIllness;
        const physicalExamination = extractedEncounterFields.physicalExamination;
        const investigationReportDetails = extractedEncounterFields.investigationReportDetails;

        if (chiefComplaint) {
          extraFields.chief_complaint = chiefComplaint;
          extraFields.chiefComplaint = chiefComplaint;
        }
        if (vitalSigns) {
          extraFields.vital_signs = vitalSigns;
          extraFields.vitalSigns = vitalSigns;
        }
        if (historyOfPresentIllness) {
          extraFields.history_of_present_illness = historyOfPresentIllness;
          extraFields.historyOfPresentIllness = historyOfPresentIllness;
        }
        if (physicalExamination) {
          extraFields.physical_examination = physicalExamination;
          extraFields.physicalExamination = physicalExamination;
        }
        if (investigationReportDetails) {
          extraFields.investigation_report_details = investigationReportDetails;
          extraFields.investigationReportDetails = investigationReportDetails;
        }
        if (typeOfAnaesthesia) {
          extraFields.type_of_anaesthesia = typeOfAnaesthesia;
          extraFields.typeOfAnaesthesia = typeOfAnaesthesia;
          extraFields.anaesthesiaType = typeOfAnaesthesia;
        }
      }
      if (serviceStartDate) {
        const serviceStartIso = `${serviceStartDate}T00:00:00Z`;
        extraFields.ServiceStart = serviceStartIso;
        extraFields.service_start = serviceStartIso;
        extraFields.expected_service_start_date = serviceStartIso;
      }
      if (serviceEndDate) {
        const serviceEndIso = `${serviceEndDate}T00:00:00Z`;
        extraFields.ServiceEnd = serviceEndIso;
        extraFields.service_end = serviceEndIso;
        extraFields.expected_service_end_date = serviceEndIso;
      }
      if (providerNotificationEmail.trim()) {
        extraFields.ProviderNotificationEmail = providerNotificationEmail.trim();
        extraFields.provider_notification_email = providerNotificationEmail.trim();
        extraFields.notification_email = providerNotificationEmail.trim();
      }

      const explicitAttachmentIds = Array.from(
        new Set(
          documents
            .map((doc) => doc.claimAttachmentId)
            .filter((id): id is number => typeof id === 'number')
        )
      );
      const uploadableDocuments = documents.filter(
        (doc) => doc.file && doc.file.size > 0 && typeof doc.claimAttachmentId !== 'number'
      );
      const uploadFiles = uploadableDocuments.map((doc, index) => ({
        field_name: `preauth_file_${index + 1}`,
        file: doc.file,
      }));
      extraFields.attachment_ids = explicitAttachmentIds;
      if (uploadableDocuments.length > 0) {
        extraFields.attachments = uploadableDocuments.map((doc, index) => ({
          file_field_name: `preauth_file_${index + 1}`,
          document_title: doc.displayName || doc.file.name,
          document_type: toPreauthAttachmentDocumentType(doc),
        }));
      }

      const result = await shaApi.ilmPreauthCreate({
        ...(consentTokenForSubmit ? { consent_token: consentTokenForSubmit } : {}),
        intervention_code: interventionCode.trim(),
        patient_pk: patientId,
        claim_pk: selectedClaimIdNumber,
        extra_fields: extraFields,
        files: uploadFiles,
      });

      toast({
        title: 'Pre-authorization Submitted',
        description: `${typeConfig?.label || 'Selected'} preauth for ${interventionCode} submitted to SHA.`,
      });
      window.sessionStorage.removeItem(PREAUTH_DRAFT_STORAGE_KEY);
      queryClient.invalidateQueries({ queryKey: ['preauths-list'] });

      // Redirect to the new preauth detail page if we have the record_id
      const resultAny = result as unknown as Record<string, unknown>;
      const dataObj = (resultAny?.data as Record<string, unknown>) || resultAny || {};
      const recordId = dataObj.record_id;
      if (recordId) {
        router.push(`/transactions/preauths/${recordId}`);
      } else {
        router.push('/transactions/preauths');
      }
    } catch (err) {
      const errorMessage = extractDHAErrorMessage(err);
      const axiosData = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const errorCode = typeof axiosData?.code === 'string' ? axiosData.code : '';
      if (errorCode === 'dha_visit_not_started') {
        const refreshReason =
          errorMessage ||
          'The linked consent token does not have an active DHA visit. Collect a fresh consent below and resubmit.';
        setForceConsentRefresh(true);
        setConsentRefreshReason(refreshReason);
        setConsentToken('');
        setConsentTokenId(undefined);
        setConsentedInterventionCode('');
        toast({
          title: 'DHA Visit Not Started',
          description: refreshReason,
          variant: 'destructive',
        });
      } else if (errorCode === 'invalid_attachment_ids') {
        const invalidIdsRaw = axiosData?.invalid_attachment_ids;
        const invalidIds = Array.isArray(invalidIdsRaw)
          ? invalidIdsRaw
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0)
          : [];
        if (invalidIds.length > 0) {
          setDocuments((prev) =>
            prev.filter(
              (doc) =>
                !(
                  typeof doc.claimAttachmentId === 'number' &&
                  invalidIds.includes(doc.claimAttachmentId)
                )
            )
          );
        }
        toast({
          title: 'Stale attachments detected',
          description:
            invalidIds.length > 0
              ? `Removed ${invalidIds.length} stale attachment reference${invalidIds.length === 1 ? '' : 's'}. Review attachments and submit again.`
              : 'Some selected claim attachments are no longer valid. Review attachments and submit again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Submission Failed',
          description: errorMessage || 'Failed to submit pre-authorization',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAll = () => {
    if (!window.confirm('Clear all fields and start over?')) return;
    window.sessionStorage.removeItem(PREAUTH_DRAFT_STORAGE_KEY);

    // Patient / claim
    setPatientId(null);
    setClaimId('');
    setEncounterId('');
    setShaMemberId(null);

    // Consent
    setConsentToken('');
    setConsentTokenId(undefined);
    setConsentedInterventionCode('');
    setForceConsentRefresh(false);
    setConsentRefreshReason(null);

    // Intervention
    setSelectedType(null);
    setInterventionCode('');
    setInterventionName('');
    setInterventionPrice(null);

    // Clinical
    setDiagnosisChips([]);
    setDiagnosisInput(emptyDiagnosisCodeValue());
    setDoctorChips([]);
    setSelectedStaffUserId(undefined);
    setShowManualDoctorForm(false);
    setManualDoctorName('');
    setManualDoctorRegNumber('');
    setManualDoctorIdType('registration_number');
    setManualDoctorRegBody('KMPDC');
    setManualLookupIdType('National ID');
    setManualLookupIdNumber('');
    setTariffChips([]);
    setTariffInput('');
    setServiceStartDate('');
    setServiceEndDate('');
    setTypeOfAnaesthesia('');
    setProviderNotificationEmail('');
    setProviderNotificationEmailTouched(false);
    setClinicalNotes('');
    setClinicalNotesTouched(false);

    // Documents
    setDocuments([]);
    setLinkedEvidenceKeys([]);
    setEvidenceClaimAttachmentIds({});
    setEvidenceBusyKeys([]);
    setGeneratedRequiredDocTypes([]);
    setUploadedRequiredDocTypes([]);
    setRequiredDocUploadBusyTypes([]);

    hydratedDraftRef.current = false;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Pre-authorization"
        helpContent="Submit a pre-authorization request to SHA. Link patient + claim, obtain consent, and provide required clinical information."
      />

      <p className="text-xs text-muted-foreground">
        Complete each section to progressively unlock the next one.
      </p>

      <div className="space-y-6">
        <h3 className="text-lg font-medium">1. Patient and Context</h3>
        {/* Patient Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Patient *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PatientSearchInput
              value={patientId}
              onChange={(id) => setPatientId(id)}
              placeholder="Search patient by name or MRN..."
            />

            {/* Eligibility Status */}
            {patientId && (
              <div className="mt-3">
                {eligibilityLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking SHA eligibility...
                  </div>
                )}
                {eligibilityError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Eligibility Check Failed</AlertTitle>
                    <AlertDescription className="text-xs">
                      {eligibilityError instanceof Error
                        ? eligibilityError.message
                        : 'Unable to verify eligibility. You may proceed but submission may fail.'}
                    </AlertDescription>
                  </Alert>
                )}
                {eligibility && !eligibilityLoading && (
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-md p-2.5 text-sm',
                      eligibility.is_eligible
                        ? 'bg-green-50 text-green-800 dark:bg-green-900/10 dark:text-green-400'
                        : 'bg-destructive/10 text-destructive'
                    )}
                  >
                    {eligibility.is_eligible ? (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        <span>Patient is SHA eligible</span>
                        {eligibility.member && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            Member #{eligibility.member.sha_number || eligibility.member.id}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        <span>Patient is not SHA eligible — preauth may be rejected</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Claim Link (required) */}
            <div className="space-y-1.5">
              <Label htmlFor="claim-id" className="text-xs text-muted-foreground">
                Link to Claim *
              </Label>
              {patientId && patientClaims && patientClaims.length > 0 ? (
                <select
                  id="claim-id"
                  value={claimId}
                  onChange={(e) => setClaimId(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Select claim —</option>
                  {patientClaims.map((claim) => (
                    <option key={claim.id} value={String(claim.id)}>
                      #{claim.id} — {claim.claim_number || claim.sha_claim_reference || 'No ref'} (
                      {claim.status}){claim.service_date ? ` • ${claim.service_date}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="claim-id"
                  type="number"
                  value={claimId}
                  onChange={(e) => setClaimId(e.target.value)}
                  placeholder={
                    patientId
                      ? patientClaimsLoading
                        ? 'Loading claims...'
                        : 'No claims found — enter ID manually'
                      : 'Select a patient first'
                  }
                  className="h-8 text-sm"
                  disabled={patientClaimsLoading}
                />
              )}
              {patientId && patientClaimsLoading && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading patient claims…
                </p>
              )}
              {patientId && !selectedClaimIdNumber && !patientClaimsLoading && (
                <p className="text-xs text-destructive">
                  A linked claim is required before you can continue to intervention and consent.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="encounter-id" className="text-xs text-muted-foreground">
                Encounter (optional)
              </Label>
              {patientId && (patientEncounters?.length || 0) > 0 ? (
                <select
                  id="encounter-id"
                  value={encounterId}
                  onChange={(e) => setEncounterId(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— None —</option>
                  {(patientEncounters || []).map((encounter) => (
                    <option key={encounter.id} value={String(encounter.id)}>
                      #{encounter.id} — {encounter.chief_complaint || 'No chief complaint'} (
                      {encounter.encounter_type})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="encounter-id"
                  type="number"
                  value={encounterId}
                  onChange={(e) => setEncounterId(e.target.value)}
                  placeholder="Enter encounter ID"
                  className="h-8 text-sm"
                  disabled={!patientId}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {showInterventionSection && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">2. Select Intervention</h3>

          {/* Intervention Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Intervention *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {interventionCode ? (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-mono text-sm font-medium">{interventionCode}</p>
                    <p className="text-xs text-muted-foreground">{interventionName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {interventionPrice != null && (
                      <Badge variant="secondary" className="font-mono">
                        <DollarSign className="mr-0.5 h-3 w-3" />
                        KES {interventionPrice.toLocaleString()}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setInterventionCode('');
                        setInterventionName('');
                        setInterventionPrice(null);
                        setSelectedType(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="preauth-intervention">Intervention</Label>
                  {selectedClaimLoading ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading claim interventions…
                    </p>
                  ) : interventionSelectOptions.length > 0 ? (
                    <SearchableSelect
                      className="w-full"
                      options={interventionSelectOptions}
                      value={interventionCode}
                      onValueChange={(value) => {
                        const selected = interventionOptions.find((item) => item.code === value);
                        if (!selected) return;
                        selectIntervention({
                          code: selected.code,
                          name: selected.name,
                          price: selected.price,
                          access_point: selected.accessPoint,
                          isSurgicalPreauth: selected.isSurgicalPreauth,
                          isRenalPreauth: selected.isRenalPreauth,
                          isOncologyPreauth: selected.isOncologyPreauth,
                          isImagingPreauth: selected.isImagingPreauth,
                          isOpticalPreauth: selected.isOpticalPreauth,
                          needsDoctorAuthorization: selected.needsDoctorAuthorization,
                          needsManualPreauthApproval: selected.needsManualPreauthApproval,
                          needs_manual_preauth_approval: (
                            selected as unknown as Record<string, unknown>
                          ).needs_manual_preauth_approval as boolean | undefined,
                        });
                      }}
                      placeholder="Select intervention"
                      searchPlaceholder="Search intervention code or name..."
                      emptyMessage="No interventions found"
                      disabled={selectedClaimLoading || interventionSelectOptions.length === 0}
                    />
                  ) : (
                    <Alert variant="destructive" className="py-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        This claim has no active interventions. Add the intervention to the claim
                        (and to the DHA visit) before requesting preauth.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {interventionCode && selectedType && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="text-sm font-medium">
                    Pre-auth Type: {typeConfig?.label || selectedType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Read-only, auto-derived from selected intervention flags.
                  </p>
                </div>
              )}

              {interventionCode && selectedType === 'surgical' && (
                <div className="space-y-1.5">
                  <Label htmlFor="type-of-anaesthesia">Type of Anaesthesia *</Label>
                  <select
                    id="type-of-anaesthesia"
                    value={typeOfAnaesthesia}
                    onChange={(e) => setTypeOfAnaesthesia(e.target.value as AnaesthesiaType | '')}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— Select anaesthesia —</option>
                    {ANAESTHESIA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {!typeOfAnaesthesia && (
                    <p className="text-xs text-destructive">
                      Type of anaesthesia is required for surgical preauth.
                    </p>
                  )}
                </div>
              )}

              {interventionCode && (
                <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tariff</span>
                    <span className="font-mono">
                      {selectedInterventionTariff != null
                        ? `KES ${selectedInterventionTariff.toLocaleString()}`
                        : 'Not available'}
                    </span>
                  </div>
                  {shouldShowTariffLookupWarning && (
                    <Alert variant="destructive" className="py-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Unable to resolve tariff amount for this intervention. Verify tariff
                        metadata on the linked claim intervention or SHA terminology catalog.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Required Preauth Documents</p>
                    {effectiveRequiredDocumentTypes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveRequiredDocumentTypes.map((docType) => (
                          <Badge key={docType} variant="outline" className="text-[11px]">
                            {docType.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No document requirements returned for this intervention.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Fund Coverage</p>
                    {isInterventionFundCovered === true ? (
                      <div className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-[11px] text-green-800 dark:bg-green-900/20 dark:text-green-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {interventionFunds.includes('ALL') || interventionFunds.includes('*')
                          ? 'Patient fund covers this intervention (ALL funds accepted)'
                          : `Patient fund covers this intervention (${interventionFunds.join(', ')})`}
                      </div>
                    ) : isInterventionFundCovered === false ? (
                      <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Intervention fund ({interventionFunds.join(', ')}) does not match active
                        patient fund ({patientActiveFunds.join(', ') || 'unknown'})
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Unable to confirm fund match yet.
                      </p>
                    )}
                  </div>

                  {(showEvidenceSearch || preauthEvidenceOptions.length > 0) && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          Search patient lab/imaging records scoped to selected patient{' '}
                          {patientId ? `#${patientId}` : ''}
                        </p>
                        {activeEvidenceDocType && (
                          <Badge variant="outline" className="text-[10px]">
                            {activeEvidenceDocType.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          ref={evidenceSearchRef}
                          value={evidenceSearchTerm}
                          onChange={(e) => setEvidenceSearchTerm(e.target.value)}
                          placeholder="Search by test, order number, summary..."
                          className="h-8 text-xs"
                        />
                        {activeEvidenceDocType && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => setActiveEvidenceDocType(null)}
                          >
                            Clear filter
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {filteredEvidenceOptions.slice(0, 12).map((option) => {
                          const selected = linkedEvidenceKeys.includes(option.key);
                          const busy = evidenceBusyKeys.includes(option.key);
                          return (
                            <div
                              key={option.key}
                              className="flex items-center justify-between rounded border px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{option.title}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {option.subtitle}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={selected ? 'secondary' : 'outline'}
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    if (selected) {
                                      detachEvidence(option.key);
                                      return;
                                    }
                                    void addEvidenceAsDocument(option);
                                  }}
                                  disabled={busy}
                                >
                                  {selected ? 'Detach' : busy ? 'Attaching...' : 'Attach'}
                                </Button>
                                {selected &&
                                  selectedClaimIdNumber &&
                                  evidenceClaimAttachmentIds[option.key] && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => void removeEvidenceFromClaim(option.key)}
                                    >
                                      Remove from claim
                                    </Button>
                                  )}
                              </div>
                            </div>
                          );
                        })}
                        {filteredEvidenceOptions.length === 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            No matching records found for this patient.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showConsentSection && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">
            {selectedType === 'elective' ? '3. Obtain Patient Consent' : '3. Consent Context'}
          </h3>

          {forceConsentRefresh && consentRefreshReason && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>DHA Visit Not Active</AlertTitle>
              <AlertDescription className="text-xs">{consentRefreshReason}</AlertDescription>
            </Alert>
          )}

          {canReuseClaimConsent ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/10 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Using active claim consent token for normal same-day preauth.</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Intervention is not elective (`needsManualPreauthApproval` is false/absent), so
                  preauth uses the existing visit consent token.
                </p>
              </CardContent>
            </Card>
          ) : shaMemberId ? (
            <ConsentPanel
              shaMemberId={shaMemberId}
              consentId={consentTokenId}
              encounterId={selectedEncounterIdNumber ?? undefined}
              interventionCodes={interventionCode ? [interventionCode] : undefined}
              onConsentObtained={handleConsentObtained}
              disableAutoDetect={forceConsentRefresh}
            />
          ) : (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No SHA Member Record</AlertTitle>
                  <AlertDescription>
                    No SHA member record found for this patient. Enter the consent token manually if
                    you already have one from a prior visit.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-consent">Consent Token (manual entry)</Label>
                  <Input
                    id="manual-consent"
                    value={consentToken}
                    onChange={(e) => setConsentToken(e.target.value)}
                    placeholder="Paste consent token from prior OTP validation..."
                    className="font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show consent status */}
          {consentToken && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/10 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Consent token available</span>
            </div>
          )}
        </div>
      )}

      {showClinicalSection && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">4. Clinical Details</h3>

          {/* Diagnoses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Diagnoses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Chips */}
              {diagnosisChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {diagnosisChips.map((chip) => (
                    <Badge
                      key={chip.code}
                      variant="secondary"
                      className="gap-1 pr-1 font-mono text-xs"
                    >
                      {chip.code}
                      <button
                        type="button"
                        onClick={() => removeDiagnosis(chip.code)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {!selectedClaim?.primary_diagnosis_code && (
                <p className="text-xs text-muted-foreground">
                  No diagnosis found on linked claim. Use the diagnosis picker below.
                </p>
              )}
              <div className="space-y-2 rounded-md border p-3">
                <DiagnosisCodeInput
                  value={diagnosisInput}
                  onChange={setDiagnosisInput}
                  defaultToICD11={false}
                  showVersionToggle
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const code =
                      diagnosisInput.icd11Code?.trim() ||
                      diagnosisInput.icd10Display.split(' - ')[0]?.trim();
                    if (!code) return;
                    const description =
                      diagnosisInput.icd11Display?.split(' - ').slice(1).join(' - ').trim() ||
                      diagnosisInput.icd10Display?.trim() ||
                      code;
                    addDiagnosis({ code, description });
                    setDiagnosisInput(emptyDiagnosisCodeValue());
                  }}
                >
                  Add Diagnosis
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Doctors (shown for types that require them, or always available) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Doctors / Practitioners
                {(typeConfig?.requiresDoctors || doctorAuthorizationRequired) && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(typeConfig?.requiresDoctors || doctorAuthorizationRequired) && (
                <p className="text-xs text-muted-foreground">
                  {selectedType === 'elective'
                    ? 'Elective preauths require doctor consent — listed doctors will receive an approval request via Practice360.'
                    : doctorAuthorizationRequired
                      ? 'This intervention requires doctor authorization. Provide at least one practitioner.'
                      : `${typeConfig?.label || 'Selected'} preauths require at least one practitioner.`}
                </p>
              )}
              {/* Chips */}
              {doctorChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {doctorChips.map((doc) => (
                    <Badge
                      key={doc.registration_number}
                      variant="secondary"
                      className="gap-1 pr-1 text-xs"
                    >
                      {doc.name} ({doc.registration_number})
                      <button
                        type="button"
                        onClick={() => removeDoctor(doc.registration_number)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Select clinician (if not prefilled)</Label>
                <StaffSearchCombobox
                  value={selectedStaffUserId}
                  onSelect={(_userId, staff) => {
                    setSelectedStaffUserId(staff.user);
                    addDoctor({
                      name: staff.full_name || `Staff ${staff.id}`,
                      registration_number:
                        staff.license_number || staff.employee_id || String(staff.id),
                      identification_type: 'registration_number',
                      regulation_body: 'KMPDC',
                    });
                  }}
                  placeholder="Search staff..."
                />
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setShowManualDoctorForm((prev) => !prev)}
                >
                  {showManualDoctorForm ? 'Cancel manual entry' : 'Or Enter manually'}
                </button>
              </div>

              {showManualDoctorForm && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Enter ID, lookup HWR, then review and add.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-xs">Lookup ID Type</Label>
                      <select
                        value={manualLookupIdType}
                        onChange={(e) =>
                          setManualLookupIdType(e.target.value as 'National ID' | 'passport')
                        }
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="National ID">National ID</option>
                        <option value="passport">Passport</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ID Number</Label>
                      <Input
                        value={manualLookupIdNumber}
                        onChange={(e) => setManualLookupIdNumber(e.target.value)}
                        placeholder="e.g. 12345678"
                        className="h-8"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => void lookupManualDoctor()}
                        disabled={manualLookupLoading || !manualLookupIdNumber.trim()}
                      >
                        {manualLookupLoading ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Looking up...
                          </>
                        ) : (
                          'Lookup HWR'
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name *</Label>
                      <Input
                        value={manualDoctorName}
                        onChange={(e) => setManualDoctorName(e.target.value)}
                        placeholder="Dr Jane Doe"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Registration / ID No. *</Label>
                      <Input
                        value={manualDoctorRegNumber}
                        onChange={(e) => setManualDoctorRegNumber(e.target.value)}
                        placeholder="P12345"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Identification Type</Label>
                      <select
                        value={manualDoctorIdType}
                        onChange={(e) => setManualDoctorIdType(e.target.value)}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="registration_number">Registration Number</option>
                        <option value="national_id">National ID</option>
                        <option value="passport">Passport</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Regulation Body</Label>
                      <Input
                        value={manualDoctorRegBody}
                        onChange={(e) => setManualDoctorRegBody(e.target.value)}
                        placeholder="KMPDC"
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Button type="button" size="sm" variant="outline" onClick={addManualDoctor}>
                      Add practitioner
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tariff Items + Clinical Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tariff-items">Tariff Items</Label>
                <p className="text-xs text-muted-foreground">
                  Auto-filled from selected intervention. Add more codes as needed.
                </p>
                <div className="flex min-h-[2rem] flex-wrap gap-1.5 rounded-md border p-2">
                  {tariffChips.map((code) => (
                    <Badge key={code} variant="secondary" className="gap-1 font-mono text-xs">
                      {code}
                      <button
                        type="button"
                        onClick={() => setTariffChips((prev) => prev.filter((c) => c !== code))}
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Input
                    id="tariff-items"
                    value={tariffInput}
                    onChange={(e) => setTariffInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && tariffInput.trim()) {
                        e.preventDefault();
                        const code = tariffInput.trim().replace(/,$/, '');
                        if (code && !tariffChips.includes(code)) {
                          setTariffChips((prev) => [...prev, code]);
                        }
                        setTariffInput('');
                      }
                    }}
                    placeholder={
                      tariffChips.length > 0 ? 'Add more codes...' : 'e.g., SHA-19-001-A'
                    }
                    className="h-6 min-w-[150px] flex-1 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clinical-notes">Clinical Justification</Label>
                <Textarea
                  ref={clinicalNotesRef}
                  id="clinical-notes"
                  value={clinicalNotes}
                  onChange={(e) => {
                    setClinicalNotesTouched(true);
                    setClinicalNotes(e.target.value);
                  }}
                  placeholder="Clinical justification for pre-authorization (required for complex procedures)..."
                  rows={3}
                  className="min-h-[120px] resize-none overflow-hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="service-start-date">Service Start Date</Label>
                  <Input
                    id="service-start-date"
                    type="date"
                    value={serviceStartDate}
                    onChange={(e) => setServiceStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="service-end-date">Service End Date</Label>
                  <Input
                    id="service-end-date"
                    type="date"
                    value={serviceEndDate}
                    onChange={(e) => setServiceEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="provider-notification-email">Provider Notification Email</Label>
                <Input
                  id="provider-notification-email"
                  type="email"
                  value={providerNotificationEmail}
                  onChange={(e) => {
                    setProviderNotificationEmailTouched(true);
                    setProviderNotificationEmail(e.target.value);
                  }}
                  placeholder="billing@facility.example"
                />
                <p className="text-xs text-muted-foreground">
                  Used by DHA for provider notifications; you can override the default before
                  submit.
                </p>
              </div>

              {/* Document Upload */}
              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                <p className="text-xs text-muted-foreground">
                  Upload clinical justification documents, X-rays, referral letters, etc.
                </p>

                {effectiveRequiredDocumentTypes.length > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                    <p className="text-xs text-muted-foreground">Required preauth documents</p>
                    {effectiveRequiredDocumentTypes.map((docType) => {
                      const isFulfilled = fulfilledRequiredDocTypes.has(docType);
                      const hasEvidenceOption = preauthEvidenceOptions.some(
                        (option) => option.documentType === docType
                      );
                      const typedDocs = documentsByRequiredType[docType] || [];
                      const hasTypedDocs = typedDocs.length > 0;
                      const canGenerate =
                        AUTO_GENERATABLE_PREAUTH_DOC_TYPES.has(docType) &&
                        !!(
                          selectedEncounterIdNumber ||
                          selectedClaim?.encounter ||
                          selectedClaimIdNumber ||
                          patientId ||
                          interventionCode
                        );
                      return (
                        <div
                          key={docType}
                          className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{docType.replace(/_/g, ' ')}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {isFulfilled ? 'Attached' : 'Pending'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {hasEvidenceOption && !isFulfilled && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => void attachFirstEvidenceForType(docType)}
                              >
                                Fetch & attach
                              </Button>
                            )}
                            {(docType === 'LAB_RESULTS' || docType === 'IMAGING_RESULT') && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => openEvidenceSearchForType(docType)}
                                disabled={!patientId}
                              >
                                Search records
                              </Button>
                            )}
                            {canGenerate && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => void generateRequiredDocDraft(docType)}
                              >
                                Generate
                              </Button>
                            )}
                            <label className="inline-flex cursor-pointer items-center rounded-md border px-2 py-1 text-[11px] hover:bg-accent">
                              Upload
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
                                className="hidden"
                                onChange={(e) => {
                                  void uploadRequiredDocument(docType, e.target.files);
                                  e.target.value = '';
                                }}
                                disabled={requiredDocUploadBusyTypes.includes(docType)}
                              />
                            </label>
                            {hasTypedDocs && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => openAttachmentDialog(typedDocs[0] as DraftDocument)}
                              >
                                Manage
                              </Button>
                            )}
                            {isFulfilled && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => void removeRequiredDocType(docType)}
                                disabled={attachmentDialogBusy}
                              >
                                Remove
                              </Button>
                            )}
                            {requiredDocUploadBusyTypes.includes(docType) && (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {documents.map((doc) => (
                    <Badge key={doc.key} variant="outline" className="gap-1 pr-1 text-xs">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => openAttachmentDialog(doc)}
                      >
                        {doc.displayName} (
                        {(((doc.fileSizeBytes ?? doc.file.size) || 0) / 1024).toFixed(0)} KB)
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showReviewSection && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">5. Review &amp; Submit</h3>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                {selectedType && (
                  <Badge variant="outline" className="capitalize">
                    <Activity className="mr-1 h-3 w-3" />
                    {selectedType}
                  </Badge>
                )}
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {consentTokenSourceLabel}
                </Badge>
                {isInterventionFundCovered === true && (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Fund covered
                  </Badge>
                )}
                {interventionPrice != null && (
                  <Badge variant="secondary" className="font-mono">
                    <DollarSign className="mr-0.5 h-3 w-3" />
                    KES {interventionPrice.toLocaleString()}
                  </Badge>
                )}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">
                    {resolvedPreauthAttachmentSummary.total} attachment
                    {resolvedPreauthAttachmentSummary.total === 1 ? '' : 's'} will be submitted
                  </span>
                  {` (${resolvedPreauthAttachmentSummary.fromUploads} from this form, ${resolvedPreauthAttachmentSummary.fromClaim} existing on claim)`}
                  {resolvedPreauthAttachmentSummary.dedupedOut > 0
                    ? ` • ${resolvedPreauthAttachmentSummary.dedupedOut} duplicate${resolvedPreauthAttachmentSummary.dedupedOut === 1 ? '' : 's'} removed automatically.`
                    : '.'}
                </AlertDescription>
              </Alert>

              {staleAttachmentRefs.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between gap-3">
                    <span>
                      {staleAttachmentRefs.length} stale attachment reference
                      {staleAttachmentRefs.length === 1 ? '' : 's'} detected.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={removeStaleAttachmentRefs}
                    >
                      Remove stale references
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Included attachments</p>
                  <span className="text-xs text-muted-foreground">
                    {includedAttachmentRows.length} selected
                  </span>
                </div>
                {includedAttachmentRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No attachments selected yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {includedAttachmentRows.map((row) => (
                      <div
                        key={row.key}
                        className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{row.title}</p>
                          <p
                            className={cn(
                              'text-[11px] text-muted-foreground',
                              row.stale && 'text-destructive'
                            )}
                          >
                            {row.stale ? 'stale reference' : row.sourceLabel}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => removeDocumentByKey(row.key)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Patient</span>
                  <p>ID: {patientId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Intervention</span>
                  <p className="font-mono">{interventionCode}</p>
                  {interventionName && (
                    <p className="text-xs text-muted-foreground">{interventionName}</p>
                  )}
                </div>
                {selectedType === 'surgical' && (
                  <div>
                    <span className="text-muted-foreground">Type of Anaesthesia</span>
                    <p>{typeOfAnaesthesia || 'Not selected'}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Fund Coverage</span>
                  {isInterventionFundCovered === true ? (
                    <p className="text-green-700 dark:text-green-400">
                      Patient fund covers this intervention
                    </p>
                  ) : isInterventionFundCovered === false ? (
                    <p className="text-amber-700 dark:text-amber-400">
                      Fund mismatch: patient may not be covered
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Coverage not confirmed</p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Token used for submit</span>
                  <p className="max-w-[200px] truncate font-mono text-xs">
                    {effectiveConsentToken
                      ? `${effectiveConsentToken.slice(0, 40)}...`
                      : 'Resolved on submit'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Claim-derived token</span>
                  <p className="max-w-[200px] truncate font-mono text-xs">
                    {claimDerivedTokenStatus.text}
                  </p>
                  {claimDerivedTokenStatus.helper && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {claimDerivedTokenStatus.helper}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Fresh/session token</span>
                  <p className="max-w-[200px] truncate font-mono text-xs">
                    {consentToken
                      ? `${consentToken.slice(0, 40)}...`
                      : 'Not captured in this session'}
                  </p>
                </div>
                {claimId && (
                  <div>
                    <span className="text-muted-foreground">Linked Claim</span>
                    <p>#{claimId}</p>
                  </div>
                )}
                {encounterId && (
                  <div>
                    <span className="text-muted-foreground">Encounter</span>
                    <p>#{encounterId}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Service Start</span>
                  <p>{serviceStartDate || 'Not set'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Service End</span>
                  <p>{serviceEndDate || 'Not set'}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Provider Notification Email</span>
                  <p className="break-all">
                    {providerNotificationEmail || 'Will use facility default'}
                  </p>
                </div>
                {selectedType === 'surgical' && (
                  <>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Chief Complaint</span>
                      <p>
                        {extractedEncounterFields.chiefComplaint || 'Not available from encounter'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Vital Signs</span>
                      <p>{extractedEncounterFields.vitalSigns || 'Not available from encounter'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">History of Present Illness</span>
                      <p>
                        {extractedEncounterFields.historyOfPresentIllness ||
                          'Not available from encounter'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Physical Examination</span>
                      <p>
                        {extractedEncounterFields.physicalExamination ||
                          'Not available from encounter'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Investigation Report Details</span>
                      <p>
                        {extractedEncounterFields.investigationReportDetails ||
                          'Not available from encounter'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Diagnoses */}
              {diagnosisChips.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Diagnoses</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {diagnosisChips.map((d) => (
                      <Badge key={d.code} variant="outline" className="font-mono text-xs">
                        {d.code}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Doctors */}
              {doctorChips.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Doctors</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {doctorChips.map((d) => (
                      <Badge key={d.registration_number} variant="outline" className="text-xs">
                        {d.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Items */}
              {tariffChips.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Tariff Items</span>
                  <p className="mt-0.5 font-mono text-xs">{tariffChips.join(', ')}</p>
                </div>
              )}

              {/* Clinical Notes */}
              {clinicalNotes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Clinical Notes</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs">{clinicalNotes}</p>
                </div>
              )}

              {/* Documents */}
              {documents.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Documents ({documents.length})</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {documents.map((doc) => (
                      <Badge key={doc.key} variant="outline" className="text-xs">
                        {doc.displayName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {missingRequiredDocumentTypes.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Required Documents Pending</AlertTitle>
                  <AlertDescription>
                    Attach all required preauth documents before submission:{' '}
                    {missingRequiredDocumentTypes.join(', ').replace(/_/g, ' ')}.
                  </AlertDescription>
                </Alert>
              )}

              {hasConsentInterventionMismatch && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Consent and Intervention Mismatch</AlertTitle>
                  <AlertDescription>
                    The consent token was captured for {consentedInterventionCode} but this preauth
                    is for {interventionCode}. Please complete consent again for the selected
                    intervention.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Duplicate warning */}
          {hasDuplicate && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate Preauth Warning</AlertTitle>
              <AlertDescription>
                A pre-authorization with this consent token + intervention code already exists.
                Submitting will likely fail. Consider cancelling the existing one first.
              </AlertDescription>
            </Alert>
          )}

          {selectedType === 'elective' && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-400">
                Doctor Consent Required
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                This elective preauth will trigger doctor consent approval. Listed doctors will
                receive a notification to approve via Practice360.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <Dialog
        open={attachmentDialogOpen}
        onOpenChange={(open) => {
          setAttachmentDialogOpen(open);
          if (!open) {
            setAttachmentReplacementFile(null);
            setActiveDocumentKey(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Attachment</DialogTitle>
            <DialogDescription>View, rename, replace, or remove this attachment.</DialogDescription>
          </DialogHeader>

          {activeDocument ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Current file</Label>
                <div className="flex items-center gap-2">
                  <p className="text-sm">{activeDocument.displayName}</p>
                  {activeDocument.source && (
                    <Badge variant="outline" className="text-[10px]">
                      {activeDocument.source === 'generated'
                        ? 'Generated'
                        : activeDocument.source === 'evidence'
                          ? 'Evidence'
                          : activeDocument.source === 'required_upload'
                            ? 'Required upload'
                            : 'Manual'}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(
                    ((activeDocument.fileSizeBytes ?? activeDocument.file.size) || 0) / 1024
                  ).toFixed(0)}{' '}
                  KB
                  {activeDocument.claimAttachmentId ? ' • Saved to claim' : ' • Draft only'}
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="attachment-name">Display name</Label>
                <Input
                  id="attachment-name"
                  value={attachmentEditName}
                  onChange={(e) => setAttachmentEditName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="attachment-replace">Replace file</Label>
                <Input
                  id="attachment-replace"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
                  onChange={(e) => setAttachmentReplacementFile(e.target.files?.[0] || null)}
                />
                {attachmentReplacementFile && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {attachmentReplacementFile.name}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const url =
                      activeDocument.claimFileUrl || URL.createObjectURL(activeDocument.file);
                    window.open(url, '_blank', 'noopener,noreferrer');
                    if (!activeDocument.claimFileUrl) {
                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                    }
                  }}
                >
                  View attachment
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No attachment selected.</p>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteAttachmentFromDialog()}
              disabled={!activeDocument || attachmentDialogBusy}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAttachmentDialogOpen(false)}
                disabled={attachmentDialogBusy}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void saveAttachmentChanges()}
                disabled={!activeDocument || attachmentDialogBusy}
              >
                {attachmentDialogBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={() => {
            window.sessionStorage.removeItem(PREAUTH_DRAFT_STORAGE_KEY);
            router.push('/transactions/preauths');
          }}
        >
          Cancel
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClearAll} disabled={isSubmitting}>
            <X className="mr-2 h-4 w-4" />
            Clear all
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !showReviewSection ||
              hasDuplicate ||
              !hasAllRequiredDocuments ||
              hasConsentInterventionMismatch
            }
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck className="mr-2 h-4 w-4" />
            )}
            Submit to SHA
          </Button>
        </div>
      </div>
    </div>
  );
}
