/**
 * New Pre-authorization Request Wizard (Enhanced)
 *
 * Multi-step form for creating a pre-authorization request.
 * Step 1: Select patient (+ optional claim link)
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
  Search,
  X,
  Upload,
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
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { ConsentPanel } from '@/components/billing/sha/ConsentPanel';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue, type DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { encountersApi } from '@/lib/api/encounters';
import { laboratoryApi } from '@/lib/api/laboratory';
import { imagingApi } from '@/lib/api/imaging';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useBenefitInterventions } from '@/lib/hooks/use-benefit-interventions';
import { toCrId } from '@/lib/sha/ilm-parsers';
import { usePatientEncounters } from '@/lib/hooks/use-patients';

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

interface InterventionOption {
  code: string;
  name: string;
  category?: string;
  price?: number;
  access_point?: string;
  isSurgicalPreauth?: boolean;
  isRenalPreauth?: boolean;
  isOncologyPreauth?: boolean;
  isImagingPreauth?: boolean;
  isOpticalPreauth?: boolean;
  is_surgical_preauth?: boolean;
  is_renal_preauth?: boolean;
  is_oncology_preauth?: boolean;
  is_imaging_preauth?: boolean;
  is_optical_preauth?: boolean;
  requiresSurgicalPreauth?: boolean;
  requiresRenalPreauth?: boolean;
  requiresOncologyPreauth?: boolean;
  requiresRadiologyPreauth?: boolean;
  requiresOpticalPreauth?: boolean;
  requires_surgical_preauth?: boolean;
  requires_renal_preauth?: boolean;
  requires_oncology_preauth?: boolean;
  requires_radiology_preauth?: boolean;
  requires_optical_preauth?: boolean;
  needsDoctorAuthorization?: boolean;
  needs_doctor_authorization?: boolean;
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

const PREAUTH_DOC_TO_ATTACHMENT_TYPE: Record<string, string> = {
  IMAGING_RESULT: 'radiology_report',
  LAB_RESULTS: 'lab_report',
  MEDICAL_REPORT: 'medical_report',
  PREAUTH_FORM: 'preauth_approval',
};

const AUTO_GENERATABLE_PREAUTH_DOC_TYPES = new Set(['MEDICAL_REPORT', 'PREAUTH_FORM']);

// ============================================================================
// Component
// ============================================================================

export default function NewPreauthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const [shaMemberId, setShaMemberId] = useState<number | null>(null);

  // ---- Step 3: Clinical Details ----
  const [interventionCode, setInterventionCode] = useState('');
  const [interventionName, setInterventionName] = useState('');
  const [interventionPrice, setInterventionPrice] = useState<number | null>(null);
  const [interventionSearch, setInterventionSearch] = useState('');
  const [showInterventionDropdown, setShowInterventionDropdown] = useState(false);

  const [diagnosisChips, setDiagnosisChips] = useState<DiagnosisChip[]>([]);
  const [diagnosisInput, setDiagnosisInput] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());

  const [doctorChips, setDoctorChips] = useState<DoctorChip[]>([]);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<number | undefined>();

  const [tariffChips, setTariffChips] = useState<string[]>([]);
  const [tariffInput, setTariffInput] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalNotesTouched, setClinicalNotesTouched] = useState(false);
  const [documents, setDocuments] = useState<File[]>([]);
  const [linkedEvidenceKeys, setLinkedEvidenceKeys] = useState<string[]>([]);
  const [evidenceBusyKeys, setEvidenceBusyKeys] = useState<string[]>([]);
  const [generatedRequiredDocTypes, setGeneratedRequiredDocTypes] = useState<string[]>([]);
  const clinicalNotesRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedEncounterIdNumber = useMemo(() => {
    const parsed = Number(encounterId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [encounterId]);

  const derivePreauthType = useCallback((intervention: Partial<InterventionOption>): PreauthType => {
    if (intervention.isSurgicalPreauth || intervention.is_surgical_preauth || intervention.requiresSurgicalPreauth || intervention.requires_surgical_preauth) return 'surgical';
    if (intervention.isRenalPreauth || intervention.is_renal_preauth || intervention.requiresRenalPreauth || intervention.requires_renal_preauth) return 'renal';
    if (intervention.isOncologyPreauth || intervention.is_oncology_preauth || intervention.requiresOncologyPreauth || intervention.requires_oncology_preauth) return 'oncology';
    if (intervention.isImagingPreauth || intervention.is_imaging_preauth || intervention.requiresRadiologyPreauth || intervention.requires_radiology_preauth) return 'imaging';
    if (intervention.isOpticalPreauth || intervention.is_optical_preauth || intervention.requiresOpticalPreauth || intervention.requires_optical_preauth) return 'optical';
    return 'normal';
  }, []);

  // ---- Eligibility pre-check ----
  const { data: eligibility, isLoading: eligibilityLoading, error: eligibilityError } = useQuery({
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

  const { data: selectedClaim } = useQuery({
    queryKey: ['preauth-context-claim', selectedClaimIdNumber],
    queryFn: () => shaApi.getClaim(selectedClaimIdNumber!),
    enabled: selectedClaimIdNumber != null,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedClaim) return;
    if (!encounterId && selectedClaim.encounter) {
      setEncounterId(String(selectedClaim.encounter));
    }
  }, [selectedClaim, encounterId]);

  const patientCrIdForBenefits = useMemo(() => {
    return (
      selectedClaim?.dha_external_id
      || toCrId(selectedClaim?.sha_member_number || '')
      || toCrId(eligibility?.member?.sha_number || '')
      || ''
    );
  }, [selectedClaim?.dha_external_id, selectedClaim?.sha_member_number, eligibility?.member?.sha_number]);

  const {
    benefitPackageOptions,
    benefitPackagesLoading,
    selectedBenefitPkgCode,
    setSelectedBenefitPkgCode,
    interventionOptions,
    interventionsLoading,
  } = useBenefitInterventions({
    patientCrId: patientCrIdForBenefits,
    enabled: !!patientCrIdForBenefits,
  });

  const { data: selectedInterventionRecord } = useQuery({
    queryKey: ['preauth-intervention-record', interventionCode],
    queryFn: async () => {
      if (!interventionCode) return null;
      const result = await shaApi.searchInterventions({
        search: interventionCode,
        page_size: 20,
      });
      return (result.results || []).find((item) => item.code === interventionCode) || null;
    },
    enabled: !!interventionCode,
    staleTime: 30_000,
  });

  const interventionSelectOptions = useMemo(() => {
    return interventionOptions
      .filter((item) => item.needsPreauth)
      .map((item) => {
      const mechanism = item.paymentMechanism
        ? item.paymentMechanism.replaceAll('_', ' ').toUpperCase()
        : null;
      const mechanismLabel = mechanism === 'FEE FOR SERVICE'
        ? 'FFS'
        : mechanism === 'PER DIEM'
          ? 'PER DIEM'
          : mechanism;
      const flags: string[] = [];
      if (mechanismLabel) flags.push(mechanismLabel);
      if (item.needsPreauth) flags.push('PREAUTH');
      return {
        value: item.code,
        label: `${item.code} - ${item.name}`,
        sublabel: flags.join(' • ') || undefined,
      };
      });
  }, [interventionOptions]);

  const selectedRequiredDocumentTypes = useMemo(() => {
    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    if (!raw) return [] as string[];
    const docTypes = [
      ...(Array.isArray(raw.requiredPreauthDocumentTypes) ? raw.requiredPreauthDocumentTypes : []),
      ...(Array.isArray(raw.required_preauth_document_types) ? raw.required_preauth_document_types : []),
      ...(Array.isArray(raw.applicable_document_types) ? raw.applicable_document_types : []),
      ...(Array.isArray(raw.applicableDocumentTypes) ? raw.applicableDocumentTypes : []),
    ];
    return Array.from(new Set(docTypes.map((item) => String(item))));
  }, [selectedInterventionRecord]);

  const needsLabEvidence = selectedRequiredDocumentTypes.includes('LAB_RESULTS');
  const needsImagingEvidence = selectedRequiredDocumentTypes.includes('IMAGING_RESULT');

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
        const testName = String(result.test_name || result.test || result.parameter_name || `Lab result #${id}`);
        const value = String(result.result_value || result.value || '').trim();
        const status = String(result.status || '').trim();
        options.push({
          key: `lab-${id}`,
          title: testName,
          subtitle: [value, status].filter(Boolean).join(' • ') || 'Lab result',
          documentType: 'LAB_RESULTS',
          exportText: `LAB RESULT\nID: ${id}\nTest: ${testName}\nValue: ${value || '-'}\nStatus: ${status || '-'}\n`,
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
        const summary = order.report_summary && typeof order.report_summary === 'object'
          ? String((order.report_summary as Record<string, unknown>).impression || (order.report_summary as Record<string, unknown>).findings || '')
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

  const fulfilledRequiredDocTypes = useMemo(() => {
    const linkedTypes = linkedEvidenceKeys
      .map((key) => preauthEvidenceOptions.find((option) => option.key === key)?.documentType)
      .filter((value): value is string => !!value);
    return new Set([...linkedTypes, ...generatedRequiredDocTypes]);
  }, [linkedEvidenceKeys, preauthEvidenceOptions, generatedRequiredDocTypes]);

  const selectedInterventionTariff = useMemo(() => {
    if (interventionPrice != null) return interventionPrice;
    const raw = selectedInterventionRecord as Record<string, unknown> | null;
    if (!raw) return null;
    const candidates = [raw.overallTariff, raw.overall_tariff, raw.kephLevelTarriff, raw.keph_level_tarriff];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
      if (typeof candidate === 'string') {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  }, [interventionPrice, selectedInterventionRecord]);

  // ---- Intervention search ----
  const debouncedInterventionSearch = useDebounce(interventionSearch, 300);
  const { data: interventionResults, isLoading: interventionLoading } = useQuery({
    queryKey: ['intervention-search', debouncedInterventionSearch],
    queryFn: () => shaApi.searchInterventionCodes(debouncedInterventionSearch, 15),
    enabled: debouncedInterventionSearch.length >= 2,
  });

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

  // ---- Validation ----
  const typeConfig = PREAUTH_TYPES.find((t) => t.id === selectedType);
  const hasPatientContext = patientId !== null;
  const hasInterventionSelected = interventionCode.trim().length > 0;
  const hasConsent = !!consentToken;
  const canProceedStep3 =
    interventionCode.trim().length > 0 &&
    diagnosisChips.length > 0 &&
    (!(typeConfig?.requiresDoctors || doctorAuthorizationRequired) || doctorChips.length > 0);

  const showInterventionSection = hasPatientContext;
  const showConsentSection = showInterventionSection && hasInterventionSelected;
  const showClinicalSection = showConsentSection && hasConsent;
  const showReviewSection = showClinicalSection && canProceedStep3;

  // ---- Handlers ----
  const handleConsentObtained = useCallback((
    id: number,
    token: string,
    _credential?: any,
    consentInterventionCode?: string,
  ) => {
    setConsentTokenId(id);
    setConsentToken(token);

    if (!consentInterventionCode) return;
    setInterventionCode(consentInterventionCode);

    const matched = interventionOptions.find((item) => item.code === consentInterventionCode);
    setInterventionName(matched?.name || consentInterventionCode);
    setInterventionPrice(matched?.price ?? null);
    if (matched) {
      setSelectedType(
        derivePreauthType({
          isSurgicalPreauth: matched.isSurgicalPreauth,
          isRenalPreauth: matched.isRenalPreauth,
          isOncologyPreauth: matched.isOncologyPreauth,
          isImagingPreauth: matched.isImagingPreauth,
          isOpticalPreauth: matched.isOpticalPreauth,
        })
      );
    }
    setInterventionSearch('');
    setShowInterventionDropdown(false);
    setTariffChips((prev) => (
      prev.includes(consentInterventionCode) ? prev : [consentInterventionCode, ...prev]
    ));
  }, [interventionOptions, derivePreauthType]);

  const selectIntervention = useCallback((item: InterventionOption) => {
    setInterventionCode(item.code);
    setInterventionName(item.name);
    setInterventionPrice(item.price ?? null);
    setSelectedType(derivePreauthType(item));
    setInterventionSearch('');
    setShowInterventionDropdown(false);
    // Auto-add intervention code as the first tariff item
    setTariffChips((prev) => prev.includes(item.code) ? prev : [item.code, ...prev]);
  }, [derivePreauthType]);

  useEffect(() => {
    if (!interventionCode) {
      if (selectedType !== null) setSelectedType(null);
      if (linkedEvidenceKeys.length > 0) setLinkedEvidenceKeys([]);
      return;
    }

    const selectedFromBenefits = interventionOptions.find((entry) => entry.code === interventionCode);
    const source = selectedFromBenefits
      ? {
          isSurgicalPreauth: selectedFromBenefits.isSurgicalPreauth,
          isRenalPreauth: selectedFromBenefits.isRenalPreauth,
          isOncologyPreauth: selectedFromBenefits.isOncologyPreauth,
          isImagingPreauth: selectedFromBenefits.isImagingPreauth,
          isOpticalPreauth: selectedFromBenefits.isOpticalPreauth,
        }
      : (selectedInterventionRecord as unknown as Partial<InterventionOption> | null);

    if (!source) return;
    const derivedType = derivePreauthType(source);
    if (derivedType !== selectedType) {
      setSelectedType(derivedType);
    }
    if (!interventionName && selectedFromBenefits?.name) {
      setInterventionName(selectedFromBenefits.name);
    } else if (!interventionName && selectedInterventionRecord?.name) {
      setInterventionName(selectedInterventionRecord.name);
    }
  }, [
    interventionCode,
    interventionOptions,
    selectedInterventionRecord,
    derivePreauthType,
    selectedType,
    interventionName,
    linkedEvidenceKeys.length,
  ]);

  useEffect(() => {
    if (diagnosisChips.length > 0) return;
    const claimCode = selectedClaim?.primary_diagnosis_code?.trim();
    if (claimCode) {
      const claimDescription = selectedClaim?.primary_diagnosis_description?.trim() || claimCode;
      setDiagnosisChips([{ code: claimCode, display: `${claimCode} - ${claimDescription}` }]);
      return;
    }
    const encounterDiagnosis = (selectedEncounterDiagnoses || []).find((entry) => {
      const type = String(entry.diagnosis_type || '').toUpperCase();
      return type === 'PRIMARY' || type === 'WORKING';
    }) || selectedEncounterDiagnoses?.[0];
    if (!encounterDiagnosis) return;
    const code = (encounterDiagnosis.icd11_code || encounterDiagnosis.icd10_code_display || encounterDiagnosis.icd10_display || '').toString().trim();
    if (!code) return;
    const description = (encounterDiagnosis.icd11_display || encounterDiagnosis.icd10_description || encounterDiagnosis.icd10_display || code).toString().trim();
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
      clinician.license_number?.trim()
      || clinician.national_id?.trim()
      || String(clinician.id);
    const name = clinician.name?.trim() || `Clinician ${clinician.id}`;
    setDoctorChips([{
      registration_number: registrationNumber,
      name,
      identification_type: 'registration_number',
      regulation_body: clinician.licensing_body?.trim() || 'KMPDC',
    }]);
  }, [doctorChips.length, selectedClaim?.encounter_clinician]);

  useEffect(() => {
    if (clinicalNotesTouched) return;
    if (!interventionCode) return;
    const diagnosisLine = diagnosisChips.length > 0
      ? diagnosisChips.map((entry) => entry.code).join(', ')
      : 'Pending diagnosis';
    const doctorLine = doctorChips.length > 0
      ? doctorChips.map((entry) => entry.name).join(', ')
      : 'Pending clinician assignment';
    setClinicalNotes(
      [
        `Procedure requested: ${interventionCode}${interventionName ? ` - ${interventionName}` : ''}`,
        `Working diagnosis: ${diagnosisLine}`,
        `Attending clinician(s): ${doctorLine}`,
        'Clinical rationale: ',
      ].join('\n')
    );
  }, [
    interventionCode,
    interventionName,
    diagnosisChips,
    doctorChips,
    clinicalNotes,
    clinicalNotesTouched,
  ]);

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

  const addDoctor = useCallback((doc: {
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
  }, []);

  const removeDoctor = useCallback((regNum: string) => {
    setDoctorChips((prev) => prev.filter((d) => d.registration_number !== regNum));
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setDocuments((prev) => [...prev, ...Array.from(files)]);
    }
    e.target.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addEvidenceAsDocument = useCallback(async (option: PreauthEvidenceOption) => {
    if (linkedEvidenceKeys.includes(option.key)) return;
    setEvidenceBusyKeys((prev) => (prev.includes(option.key) ? prev : [...prev, option.key]));

    try {
      const safeName = option.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = `${option.documentType.toLowerCase()}-${safeName || option.key}.txt`;
      const file = new File([option.exportText], filename, { type: 'text/plain' });

      if (selectedClaimIdNumber) {
        const attachmentType = PREAUTH_DOC_TO_ATTACHMENT_TYPE[option.documentType] || 'other';
        await shaApi.createClaimAttachment(selectedClaimIdNumber, {
          attachment_type: attachmentType,
          name: option.title,
          description: `Auto-linked preauth evidence (${option.documentType})`,
          file,
        });
        toast({
          title: 'Evidence attached to claim',
          description: `${option.title} uploaded as ${attachmentType.replace(/_/g, ' ')}.`,
        });
      }

      setDocuments((prev) => [...prev, file]);
      setLinkedEvidenceKeys((prev) => [...prev, option.key]);
    } catch (error) {
      toast({
        title: 'Evidence attachment failed',
        description: error instanceof Error ? error.message : 'Failed to attach evidence',
        variant: 'destructive',
      });
    } finally {
      setEvidenceBusyKeys((prev) => prev.filter((entry) => entry !== option.key));
    }
  }, [linkedEvidenceKeys, selectedClaimIdNumber, toast]);

  const attachFirstEvidenceForType = useCallback(async (documentType: string) => {
    const candidate = preauthEvidenceOptions.find(
      (option) => option.documentType === documentType && !linkedEvidenceKeys.includes(option.key)
    );
    if (!candidate) return;
    await addEvidenceAsDocument(candidate);
  }, [preauthEvidenceOptions, linkedEvidenceKeys, addEvidenceAsDocument]);

  const generateRequiredDocDraft = useCallback(async (documentType: string) => {
    if (!AUTO_GENERATABLE_PREAUTH_DOC_TYPES.has(documentType)) return;
    if (generatedRequiredDocTypes.includes(documentType)) return;

    const encounterCtx = selectedEncounterIdNumber || selectedClaim?.encounter;
    if (!encounterCtx) {
      toast({
        title: 'Encounter context required',
        description: `Select an encounter to auto-generate ${documentType.replace(/_/g, ' ')}.`,
        variant: 'destructive',
      });
      return;
    }

    const contentLines = [
      `Document Type: ${documentType}`,
      `Patient ID: ${patientId || '-'}`,
      `Encounter ID: ${encounterCtx}`,
      `Intervention: ${interventionCode || '-'}`,
      `Diagnosis: ${diagnosisChips.map((entry) => entry.code).join(', ') || '-'}`,
      `Clinician: ${doctorChips.map((entry) => entry.name).join(', ') || '-'}`,
      '',
      'Summary:',
      clinicalNotes || 'Auto-generated from preauth context.',
    ];
    const file = new File(
      [contentLines.join('\n')],
      `${documentType.toLowerCase()}-encounter-${encounterCtx}.txt`,
      { type: 'text/plain' }
    );

    try {
      if (selectedClaimIdNumber) {
        const attachmentType = PREAUTH_DOC_TO_ATTACHMENT_TYPE[documentType] || 'other';
        await shaApi.createClaimAttachment(selectedClaimIdNumber, {
          attachment_type: attachmentType,
          name: `${documentType.replace(/_/g, ' ')} draft`,
          description: `Auto-generated from encounter ${encounterCtx}`,
          file,
        });
      }
      setDocuments((prev) => [...prev, file]);
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
  }, [
    generatedRequiredDocTypes,
    selectedEncounterIdNumber,
    selectedClaim?.encounter,
    patientId,
    interventionCode,
    diagnosisChips,
    doctorChips,
    clinicalNotes,
    selectedClaimIdNumber,
    toast,
  ]);

  const handleSubmit = async () => {
    if (!canProceedStep3 || !consentToken || !patientId) return;
    setIsSubmitting(true);
    try {
      const extraFields: Record<string, unknown> = {};
      if (selectedType) {
        extraFields.preauth_type = selectedType;
      }
      if (diagnosisChips.length > 0) {
        extraFields.diagnoses = diagnosisChips.map((d) => ({
          consent_token: consentToken.trim(),
          icd_code: d.code,
        }));
      }
      if (doctorChips.length > 0) {
        extraFields.doctors = doctorChips.map((d, index) => ({
          identification_number: d.registration_number,
          identification_type: d.identification_type || 'registration_number',
          regulation_body: d.regulation_body || 'KMPDC',
          intervention_code: interventionCode.trim(),
          is_primary: index === 0,
        }));
      }
      if (tariffChips.length > 0) {
        extraFields.items = tariffChips.map((itemCode) => ({
          item_code: itemCode,
          unit_price: selectedInterventionTariff != null ? String(selectedInterventionTariff) : undefined,
        }));
      }
      if (clinicalNotes.trim()) {
        extraFields.clinical_notes = clinicalNotes;
      }

      const result = await shaApi.ilmPreauthCreate({
        consent_token: consentToken.trim(),
        intervention_code: interventionCode.trim(),
        patient_pk: patientId,
        claim_pk: claimId ? Number(claimId) : undefined,
        extra_fields: extraFields,
      });

      toast({
        title: 'Pre-authorization Submitted',
        description: `${typeConfig?.label || 'Selected'} preauth for ${interventionCode} submitted to SHA.`,
      });
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
      toast({
        title: 'Submission Failed',
        description: err instanceof Error ? err.message : 'Failed to submit pre-authorization',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = () => {
      setShowInterventionDropdown(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

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
                        {eligibilityError instanceof Error ? eligibilityError.message : 'Unable to verify eligibility. You may proceed but submission may fail.'}
                      </AlertDescription>
                    </Alert>
                  )}
                  {eligibility && !eligibilityLoading && (
                    <div className={cn(
                      'flex items-center gap-2 rounded-md p-2.5 text-sm',
                      eligibility.is_eligible
                        ? 'bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-400'
                        : 'bg-destructive/10 text-destructive'
                    )}>
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

              {/* Claim Link (optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="claim-id" className="text-xs text-muted-foreground">Link to Claim (optional)</Label>
                {patientId && patientClaims && patientClaims.length > 0 ? (
                  <select
                    id="claim-id"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— None —</option>
                    {patientClaims.map((claim) => (
                      <option key={claim.id} value={String(claim.id)}>
                        #{claim.id} — {claim.claim_number || claim.sha_claim_reference || 'No ref'} ({claim.status}){claim.service_date ? ` • ${claim.service_date}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="claim-id"
                    type="number"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    placeholder={patientId ? (patientClaimsLoading ? 'Loading claims...' : 'No claims found — enter ID manually') : 'Select a patient first'}
                    className="h-8 text-sm"
                    disabled={patientClaimsLoading}
                  />
                )}
                {patientId && patientClaimsLoading && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading patient claims…
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="encounter-id" className="text-xs text-muted-foreground">Encounter (optional)</Label>
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
                        #{encounter.id} — {encounter.chief_complaint || 'No chief complaint'} ({encounter.encounter_type})
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
                patientCrIdForBenefits ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="preauth-benefit-package">Benefit Package</Label>
                      <select
                        id="preauth-benefit-package"
                        value={selectedBenefitPkgCode}
                        onChange={(e) => setSelectedBenefitPkgCode(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        disabled={benefitPackagesLoading || benefitPackageOptions.length === 0}
                      >
                        <option value="">
                          {benefitPackagesLoading ? 'Loading packages...' : 'Select benefit package'}
                        </option>
                        {benefitPackageOptions.map((pkg) => (
                          <option key={pkg.code} value={pkg.code}>
                            {pkg.code} - {pkg.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="preauth-intervention">Intervention</Label>
                      <SearchableSelect
                        className="w-full"
                        options={interventionSelectOptions}
                        value={interventionCode}
                        onValueChange={(value) => {
                          const selected = interventionOptions.find((item) => item.code === value && item.needsPreauth);
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
                          });
                        }}
                        placeholder={interventionsLoading ? 'Loading interventions...' : 'Select intervention'}
                        searchPlaceholder="Search intervention code or name..."
                        emptyMessage="No preauth interventions found"
                        disabled={interventionsLoading || interventionSelectOptions.length === 0}
                      />
                      {!interventionsLoading && interventionSelectOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No interventions requiring pre-authorization are available under this package.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search interventions by code or name..."
                      value={interventionSearch}
                      onChange={(e) => {
                        setInterventionSearch(e.target.value);
                        setShowInterventionDropdown(true);
                      }}
                      onFocus={() => setShowInterventionDropdown(true)}
                      className="pl-9"
                    />
                    {showInterventionDropdown && debouncedInterventionSearch.length >= 2 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
                        {interventionLoading ? (
                          <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                        ) : interventionResults && interventionResults.length > 0 ? (
                          interventionResults.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-accent text-sm border-b last:border-0"
                              onClick={() => selectIntervention(item)}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-mono font-medium">{item.code}</span>
                                  <p className="text-xs text-muted-foreground line-clamp-1">{item.name}</p>
                                </div>
                                {item.price != null && (
                                  <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">
                                    KES {item.price.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-sm text-muted-foreground">No interventions found</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}

              {interventionCode && selectedType && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="text-sm font-medium">Pre-auth Type: {typeConfig?.label || selectedType}</p>
                  <p className="text-xs text-muted-foreground">
                    Read-only, auto-derived from selected intervention flags.
                  </p>
                </div>
              )}

              {interventionCode && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tariff</span>
                    <span className="font-mono">
                      {selectedInterventionTariff != null
                        ? `KES ${selectedInterventionTariff.toLocaleString()}`
                        : 'Not available'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Required Preauth Documents</p>
                    {selectedRequiredDocumentTypes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRequiredDocumentTypes.map((docType) => (
                          <Badge key={docType} variant="outline" className="text-[11px]">
                            {docType.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No document requirements returned for this intervention.</p>
                    )}
                  </div>

                  {preauthEvidenceOptions.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-muted-foreground">
                        Available patient evidence (lab/imaging) for quick attachment generation
                      </p>
                      <div className="space-y-1.5">
                        {preauthEvidenceOptions.slice(0, 8).map((option) => {
                          const selected = linkedEvidenceKeys.includes(option.key);
                          const busy = evidenceBusyKeys.includes(option.key);
                          return (
                            <div key={option.key} className="flex items-center justify-between rounded border px-2 py-1.5">
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{option.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{option.subtitle}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={selected ? 'secondary' : 'outline'}
                                className="h-7 text-xs"
                                onClick={() => void addEvidenceAsDocument(option)}
                                disabled={selected || busy}
                              >
                                {selected ? 'Added' : busy ? 'Attaching...' : 'Attach'}
                              </Button>
                            </div>
                          );
                        })}
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
          <h3 className="text-lg font-medium">3. Obtain Patient Consent</h3>

          {shaMemberId ? (
            <ConsentPanel
              shaMemberId={shaMemberId}
              consentId={consentTokenId}
              interventionCodes={interventionCode ? [interventionCode] : undefined}
              onConsentObtained={handleConsentObtained}
            />
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No SHA Member Record</AlertTitle>
                  <AlertDescription>
                    No SHA member record found for this patient. Enter the consent token manually
                    if you already have one from a prior visit.
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
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/10 p-3 text-sm text-green-800 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Consent token obtained successfully</span>
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
                    <Badge key={chip.code} variant="secondary" className="gap-1 pr-1 font-mono text-xs">
                      {chip.code}
                      <button
                        type="button"
                        onClick={() => removeDiagnosis(chip.code)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
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
                    const code = diagnosisInput.icd11Code?.trim()
                      || diagnosisInput.icd10Display.split(' - ')[0]?.trim();
                    if (!code) return;
                    const description = diagnosisInput.title?.trim()
                      || diagnosisInput.icd11Title?.trim()
                      || diagnosisInput.icd10Display?.trim()
                      || code;
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
                {(typeConfig?.requiresDoctors || doctorAuthorizationRequired) && <span className="text-destructive ml-1">*</span>}
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
                    <Badge key={doc.registration_number} variant="secondary" className="gap-1 pr-1 text-xs">
                      {doc.name} ({doc.registration_number})
                      <button
                        type="button"
                        onClick={() => removeDoctor(doc.registration_number)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
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
                      registration_number: staff.license_number || staff.employee_id || String(staff.id),
                      identification_type: 'registration_number',
                      regulation_body: 'KMPDC',
                    });
                  }}
                  placeholder="Search staff..."
                />
              </div>
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
                <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border p-2">
                  {tariffChips.map((code) => (
                    <Badge key={code} variant="secondary" className="gap-1 text-xs font-mono">
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
                    placeholder={tariffChips.length > 0 ? 'Add more codes...' : 'e.g., SHA-19-001-A'}
                    className="flex-1 min-w-[150px] border-0 p-0 h-6 text-sm shadow-none focus-visible:ring-0"
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

              {/* Document Upload */}
              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                <p className="text-xs text-muted-foreground">
                  Upload clinical justification documents, X-rays, referral letters, etc.
                </p>

                {selectedRequiredDocumentTypes.length > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                    <p className="text-xs text-muted-foreground">Required preauth documents</p>
                    {selectedRequiredDocumentTypes.map((docType) => {
                      const isFulfilled = fulfilledRequiredDocTypes.has(docType);
                      const hasEvidenceOption = preauthEvidenceOptions.some((option) => option.documentType === docType);
                      const canGenerate = AUTO_GENERATABLE_PREAUTH_DOC_TYPES.has(docType) && !!(selectedEncounterIdNumber || selectedClaim?.encounter);
                      return (
                        <div key={docType} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
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
                                Auto-attach
                              </Button>
                            )}
                            {canGenerate && !isFulfilled && (
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {documents.map((file, i) => (
                    <Badge key={i} variant="outline" className="gap-1 pr-1 text-xs">
                      {file.name} ({(file.size / 1024).toFixed(0)} KB)
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Upload className="h-4 w-4" />
                  Upload File
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showReviewSection && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">5. Review &amp; Submit</h3>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                {selectedType && (
                  <Badge variant="outline" className="capitalize">
                    <Activity className="mr-1 h-3 w-3" />
                    {selectedType}
                  </Badge>
                )}
                {interventionPrice != null && (
                  <Badge variant="secondary" className="font-mono">
                    <DollarSign className="mr-0.5 h-3 w-3" />
                    KES {interventionPrice.toLocaleString()}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                <div>
                  <span className="text-muted-foreground">Consent Token</span>
                  <p className="font-mono text-xs truncate max-w-[200px]">{consentToken.slice(0, 40)}...</p>
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
              </div>

              {/* Diagnoses */}
              {diagnosisChips.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Diagnoses</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
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
                  <div className="flex flex-wrap gap-1.5 mt-1">
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
                  <p className="font-mono text-xs mt-0.5">{tariffChips.join(', ')}</p>
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
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {documents.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {f.name}
                      </Badge>
                    ))}
                  </div>
                </div>
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
              <AlertTitle className="text-amber-800 dark:text-amber-400">Doctor Consent Required</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
                This elective preauth will trigger doctor consent approval.
                Listed doctors will receive a notification to approve via Practice360.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => router.push('/transactions/preauths')}
        >
          Cancel
        </Button>

        <Button onClick={handleSubmit} disabled={isSubmitting || !showReviewSection || hasDuplicate}>
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileCheck className="mr-2 h-4 w-4" />
          )}
          Submit to SHA
        </Button>
      </div>
    </div>
  );
}
