/**
 * ClaimILMPanel — Proactive DHA HIE workflow for an SHA Claim.
 *
 * Replaces the legacy form-driven panel. Auto-derives every field the app
 * already knows (patient CR ID, intervention codes, service type, invoice,
 * practitioner licence) and only prompts the user for genuinely novel input
 * (OTP code, discharge reason, cancel reason).
 *
 * Sections:
 *   1. Visit status pill + warnings (capitation mismatch, per-diem note)
 *   2. Open Visit — single-button when all prerequisites are satisfied
 *   3. Manage interventions & diagnoses (Add via Dialog, manage on Overview tab)
 *   4. Lifecycle — Preview, Submit (outpatient auto-OTP), Cancel (under More)
 */
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Fingerprint,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { shaApi } from '@/lib/api/sha';
import type {
  IlmApplyPreviewLinesResponse,
  IlmMaterializePreviewInvoiceResponse,
} from '@/lib/api/sha';
import { useAuth } from '@/lib/auth/context';
import { useFacility } from '@/lib/context/facility-context';
import { useQuery } from '@tanstack/react-query';
import type { CapitationValidationResult } from '@/lib/api/sha';
import type { IlmCallResult } from '@/lib/schemas/sha.schema';
import type { Claim } from '@/lib/types/sha';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import type { ConsentCredential } from './ConsentPanel';
import {
  validateInterventionCombination,
  getBenefitCode,
  INTERVENTION_COMBINATION_RULES,
  getAllowedCombinations,
  isAlonePackage,
} from '@/lib/sha/combination-rules';
import { toCrId } from '@/lib/sha/ilm-parsers';
import {
  useBenefitInterventions,
  type InterventionOption,
} from '@/lib/hooks/use-benefit-interventions';
import { format, parseISO } from 'date-fns';
import { ClaimPreviewPanel } from './ClaimPreviewPanel';

// =============================================================================
// Constants
// =============================================================================

/**
 * Fallback prefixes that are exclusively inpatient when an intervention has no
 * `access_point` populated. SHA-01 = Emergency / Ambulance (IP-only per DHA).
 */
const INPATIENT_PREFIXES = [
  'SHA-01', // Emergency & ambulance
  'SHA-03', // Inpatient surgical
  'SHA-07', // Inpatient medical
  'SHA-13', // ICU / HDU
  'SHA-19', // Maternity (inpatient)
  'SHA-20', // Mental health (inpatient)
  'SHA-O7', // Common typo seen in legacy data
];

const OUTPATIENT_DISCHARGE_REASONS = [
  { value: 'RECOVERED', label: 'Recovered' },
  { value: 'REFERRED', label: 'Referred' },
  { value: 'ABSCONDED', label: 'Absconded' },
  { value: 'OTHER', label: 'Other' },
] as const;

const CANCEL_REASONS = [
  { value: 'WRONG_PATIENT', label: 'Wrong patient' },
  { value: 'NO_SERVICE_GIVEN', label: 'No service given' },
  { value: 'WRONG_BENEFIT', label: 'Wrong benefit' },
  { value: 'EXPIRED_VISIT', label: 'Expired visit' },
  { value: 'EXHAUSTED_BENEFIT', label: 'Exhausted benefit' },
  { value: 'TIME_BARRED', label: 'Time-barred' },
  { value: 'OTHER_REASONS', label: 'Other' },
] as const;

type ActionKey =
  | 'startVisit'
  | 'resendOtp'
  | 'addIntervention'
  | 'addVirtualClaimLine'
  | 'addDiagnosis'
  | 'preview'
  | 'applyPreviewLines'
  | 'materializePreviewInvoice'
  | 'sendDischargeOtp'
  | 'submit'
  | 'close';

type ChecklistMode = 'auto' | 'manual';

interface PreSubmitChecklistItem {
  id: string;
  label: string;
  mode: ChecklistMode;
  complete: boolean;
  detail?: string;
}

// =============================================================================
// Helpers
// =============================================================================

type InterventionLike = {
  intervention_code: string;
  access_point?: 'IP' | 'OP' | 'BOTH';
};

/**
 * Derive the DHA `service_type` for the visit.
 *
 * Precedence (most authoritative first):
 *   1. Hard IP-only prefix list (SHA-01 ambulance, SHA-03/07/13/19/20 inpatient
 *      families). DHA's /start-visit rejects these as OUTPATIENT regardless of
 *      what the catalogue's `access_point` says, and our local catalogue
 *      sometimes stores free-text values like "OP and IP" that don't normalise
 *      cleanly. The prefix rule is authoritative here.
 *   2. Explicit `access_point === 'IP'` on any intervention → INPATIENT.
 *   3. All interventions with `access_point === 'OP'` → OUTPATIENT.
 *   4. Mixed or empty → OUTPATIENT (safe default for typical OPD claims).
 */
function deriveServiceType(interventions: InterventionLike[]): 'INPATIENT' | 'OUTPATIENT' {
  // 1. Hard prefix override
  for (const { intervention_code } of interventions) {
    const prefix = intervention_code.split('-').slice(0, 2).join('-');
    if (INPATIENT_PREFIXES.includes(prefix)) return 'INPATIENT';
  }
  // 2. Explicit IP via access_point
  if (interventions.some((i) => i.access_point === 'IP')) return 'INPATIENT';
  // 3. Explicit OP
  const withAccess = interventions.filter((i) => i.access_point);
  if (withAccess.length > 0 && withAccess.every((i) => i.access_point === 'OP')) {
    return 'OUTPATIENT';
  }
  // 4. Default
  return 'OUTPATIENT';
}

interface PractitionerFields {
  practitioner_identification_number?: string;
  practitioner_identification_type?: string;
  practitioner_regulation_body?: string;
}

interface ClinicianInfo {
  license_number?: string | null;
  licensing_body?: string | null;
  national_id?: string | null;
}

function derivePractitionerFields(
  clinician: ClinicianInfo | null | undefined,
  user: ReturnType<typeof useAuth>['user'],
): PractitionerFields {
  const source = clinician?.national_id || clinician?.license_number ? clinician : user;
  if (!source) return {};
  // DHA only accepts 'National ID' as practitioner_identification_type.
  // Even when we have a license number, we must identify by national ID.
  if (source.national_id) {
    return {
      practitioner_identification_number: source.national_id,
      practitioner_identification_type: 'National ID',
      practitioner_regulation_body: source.licensing_body || undefined,
    };
  }
  // Fallback: use license number with National ID type (DHA resolves internally)
  if (source.license_number) {
    return {
      practitioner_identification_number: source.license_number,
      practitioner_identification_type: 'National ID',
      practitioner_regulation_body: source.licensing_body || undefined,
    };
  }
  return {};
}

function formatErr(e: unknown): string {
  const err = e as {
    response?: {
      data?: {
        error?: string;
        detail?: string;
        message?: string;
        errors?: Record<string, string[]> | string[];
      };
    };
    message?: string;
  };
  const data = err?.response?.data;
  if (data?.error) return data.error;
  if (data?.detail) return data.detail;
  if (data?.message) return data.message;
  if (Array.isArray(data?.errors)) {
    return (data.errors as string[]).join('; ');
  }
  if (data?.errors && typeof data.errors === 'object') {
    return Object.entries(data.errors)
      .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`)
      .join('; ');
  }
  return err?.message ?? 'Request failed';
}

function extractInterventionCombinationError(e: unknown): string | null {
  const data = (e as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  const rawError =
    typeof data?.error === 'string'
      ? data.error
      : typeof data?.message === 'string'
        ? data.message
        : '';

  if (!rawError) return null;

  const tryExtractFromObject = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null;
    const edi = (value as Record<string, unknown>)['EDI ERROR'];
    if (!edi || typeof edi !== 'object') return null;
    const combo = (edi as Record<string, unknown>)['Intervention Combination'];
    return typeof combo === 'string' ? combo : null;
  };

  const trimmed = rawError.trim();

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const fromDirectJson = tryExtractFromObject(parsed);
    if (fromDirectJson) return fromDirectJson;
  } catch {
    // ignore; rawError may be plain text with embedded JSON payload
  }

  const embeddedJsonStart = trimmed.indexOf('{');
  if (embeddedJsonStart >= 0) {
    const embeddedJson = trimmed.slice(embeddedJsonStart);
    try {
      const parsed = JSON.parse(embeddedJson) as unknown;
      const fromEmbeddedJson = tryExtractFromObject(parsed);
      if (fromEmbeddedJson) return fromEmbeddedJson;
    } catch {
      // ignore; fall back to null
    }
  }

  return null;
}

function extractPreviewInvoiceNumber(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const invoices = (payload as { invoices?: unknown }).invoices;
  if (!Array.isArray(invoices)) return '';
  for (const invoice of invoices) {
    if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice)) continue;
    const invoiceRecord = invoice as Record<string, unknown>;
    const value =
      (invoiceRecord.invoice_number as string | undefined) ||
      (invoiceRecord.invoice_no as string | undefined) ||
      (invoiceRecord.invoice as string | undefined) ||
      '';
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
}

// =============================================================================
// Types
// =============================================================================

interface ClaimILMPanelProps {
  /** Full claim object — used to auto-derive every ILM field. */
  claim: Claim;
  /**
   * Routed DHA HIE flow info. When omitted, behaves as the legacy SHIF panel
   * (all sections visible, standard add-intervention endpoint).
   */
  flow?: ClaimFlowInfo;
  /** Validated consent token string (passed through from ConsentPanel). */
  consentToken?: string;
  /** Raw OTP / biometric GUID captured during consent — auto-flows into start_visit. */
  consentCredential?: ConsentCredential;
  /** Intervention code selected during consent — reused for start_visit to avoid mismatch. */
  consentInterventionCode?: string;
  /** Called after any action finishes so the parent can refetch the claim. */
  onChange?: () => void;
  /** Emits context parsed from preview payload for sibling workflow panels. */
  onPreviewContext?: (ctx: {
    authorizationCode?: string;
    memberNumber?: string;
    dhaInvoiceNumber?: string;
  }) => void;
}

// =============================================================================
// Component
// =============================================================================

export function ClaimILMPanel({
  claim,
  flow,
  consentToken = '',
  consentCredential,
  consentInterventionCode = '',
  onChange,
  onPreviewContext,
}: ClaimILMPanelProps) {
  const { user } = useAuth();
  const { facilityDetail } = useFacility();
  const claimId = claim.id;

  // ---- Derived context from claim + auth ----
  const visitStarted = !!claim.dha_visit_started_at;
  const patientCrId =
    claim.dha_external_id ||
    toCrId(claim.sha_member_number ?? '') ||
    '';

  // ---- Shared cascading benefit-package → intervention fetch ----
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
    patientCrId,
    enabled: !!patientCrId,
  });

  const [previewDhaInvoiceNumber, setPreviewDhaInvoiceNumber] = useState('');
  const localInvoiceNumber = (claim.invoice_number || '').trim();
  const dhaInvoiceNumber = (claim.dha_invoice_number || previewDhaInvoiceNumber || '').trim();
  const activeInterventions = useMemo(
    () => (claim.claim_interventions ?? []).filter((i) => i.status === 'active'),
    [claim.claim_interventions],
  );
  const interventionCodes = useMemo(
    () => activeInterventions.map((i) => i.intervention_code),
    [activeInterventions],
  );

  // ---- Combination-aware benefit-package filtering ----
  // When interventions already exist on the claim, only show benefit
  // packages that are allowed to be combined (or show all if no
  // interventions yet).  Also detect whether the claim is locked
  // (primary has allowedCombinations === 'ALONE').
  const primaryBenefitCode = useMemo(
    () => (interventionCodes.length > 0 ? getBenefitCode(interventionCodes[0]!) : null),
    [interventionCodes],
  );
  const combinableBenefitCodes = useMemo(
    () => (primaryBenefitCode ? getAllowedCombinations(primaryBenefitCode) : null),
    [primaryBenefitCode],
  );
  const aloneClaim = useMemo(
    () => (primaryBenefitCode ? isAlonePackage(primaryBenefitCode) : false),
    [primaryBenefitCode],
  );
  const allowedBenefitPackageOptions = useMemo(() => {
    if (!primaryBenefitCode) return null; // no restriction
    if (combinableBenefitCodes === null) return null;
    return benefitPackageOptions.filter((pkg) => combinableBenefitCodes.includes(pkg.code));
  }, [benefitPackageOptions, primaryBenefitCode, combinableBenefitCodes]);
  const effectiveBenefitPackageOptions =
    allowedBenefitPackageOptions ?? benefitPackageOptions;

  const practitionerFields = useMemo(
    () => derivePractitionerFields(claim.encounter_clinician, user),
    [claim.encounter_clinician, user],
  );
  const hasPractitioner = !!practitionerFields.practitioner_identification_number;

  const useVirtualLine = flow?.addLineEndpoint === 'add_virtual_claim_line';
  const requiresConsent = flow ? flow.requiresConsent : true;
  const isInpatientFlow = !!flow?.supportsInpatientDischarge;
  const facilityAgentNationalId = facilityDetail?.biometrics_agent_national_id || '';
  const [biometricBusy, setBiometricBusy] = useState(false);

  // ---- Local UI state ----
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IlmCallResult | null>(null);
  const [previewResult, setPreviewResult] = useState<IlmCallResult | null>(null);
  const [applyPreviewResult, setApplyPreviewResult] = useState<IlmApplyPreviewLinesResponse | null>(null);
  const [materializePreviewResult, setMaterializePreviewResult] =
    useState<IlmMaterializePreviewInvoiceResponse | null>(null);
  const [replacePreviewLines, setReplacePreviewLines] = useState(true);

  const { data: latestConsentToken } = useQuery({
    queryKey: ['sha-latest-consent-for-workflow', claim.sha_member, claim.updated_at],
    enabled: typeof claim.sha_member === 'number' && !!flow?.requiresConsent,
    queryFn: async () => {
      try {
        if (typeof claim.sha_member !== 'number') return null;
        return await shaApi.getLatestConsent(claim.sha_member);
      } catch (e: unknown) {
        const statusCode = (e as { response?: { status?: number } })?.response?.status;
        if (statusCode === 404) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });

  const tokenStatus = useMemo(() => {
    if (!requiresConsent) {
      return {
        label: 'Token not required',
        detail: 'Emergency flow',
        badgeClass: 'border-slate-300 text-slate-700',
      };
    }

    const tokenValue = latestConsentToken?.consent_token || consentToken || '';
    const expiresAt = latestConsentToken?.expires_at || null;
    const now = Date.now();

    if (visitStarted && tokenValue) {
      const suffix = expiresAt ? ` · expires ${format(parseISO(expiresAt), 'dd MMM HH:mm')}` : '';
      return {
        label: 'Token active',
        detail: `${tokenValue.slice(0, 10)}${tokenValue.length > 10 ? '...' : ''}${suffix}`,
        badgeClass: 'border-emerald-300 text-emerald-700',
      };
    }

    if (visitStarted && !tokenValue) {
      return {
        label: 'Visit active',
        detail: 'Session is open at DHA',
        badgeClass: 'border-emerald-300 text-emerald-700',
      };
    }

    if (!tokenValue) {
      return {
        label: 'No token',
        detail: 'Run consent to generate one',
        badgeClass: 'border-amber-300 text-amber-700',
      };
    }

    if (!expiresAt) {
      return {
        label: 'Token present',
        detail: `${tokenValue.slice(0, 10)}${tokenValue.length > 10 ? '...' : ''}`,
        badgeClass: 'border-emerald-300 text-emerald-700',
      };
    }

    let expiresTs = 0;
    try {
      expiresTs = parseISO(expiresAt).getTime();
    } catch {
      expiresTs = 0;
    }

    if (expiresTs > 0 && expiresTs <= now) {
      return {
        label: 'Token expired',
        detail: `Expired ${format(parseISO(expiresAt), 'dd MMM HH:mm')}`,
        badgeClass: 'border-destructive text-destructive',
      };
    }

    const minutesLeft = expiresTs > 0 ? Math.floor((expiresTs - now) / 60_000) : null;
    if (minutesLeft !== null && minutesLeft <= 10) {
      return {
        label: 'Token expiring',
        detail: `${minutesLeft} min left · ${format(parseISO(expiresAt), 'dd MMM HH:mm')}`,
        badgeClass: 'border-amber-300 text-amber-700',
      };
    }

    return {
      label: 'Token valid',
      detail: `Expires ${format(parseISO(expiresAt), 'dd MMM HH:mm')}`,
      badgeClass: 'border-emerald-300 text-emerald-700',
    };
  }, [
    latestConsentToken?.consent_token,
    latestConsentToken?.expires_at,
    consentToken,
    requiresConsent,
    visitStarted,
  ]);

  // OTP for start_visit — auto-filled from consent credential
  const [startOtp, setStartOtp] = useState(consentCredential?.otp ?? '');
  const [startAuthGuid, setStartAuthGuid] = useState(consentCredential?.authGuid ?? '');
  // Sync local credential state when consent is obtained via the parent
  // (ConsentPanel) after this panel has already mounted.
  useEffect(() => {
    if (consentCredential?.otp) setStartOtp(consentCredential.otp);
    if (consentCredential?.authGuid) setStartAuthGuid(consentCredential.authGuid);
  }, [consentCredential?.otp, consentCredential?.authGuid]);

  // ---- Auto-open visit when consent was freshly obtained in this session ----
  // If ConsentPanel just validated OTP/biometric and passed the credential
  // through, we can skip the manual "Validate & Open Visit" button click
  // and open the DHA visit straight away.
  const autoOpenStarted = useRef(false);

  useEffect(() => {
    if (autoOpenStarted.current) return;
    if (visitStarted) return;
    if (!consentCredential || (!consentCredential.otp && !consentCredential.authGuid)) return;
    if (!patientCrId) return;
    const code = consentInterventionCode || interventionCodes[0] || '';
    if (!code) return;

    autoOpenStarted.current = true;

    // Small delay so the UI can render the busy state before the async call
    const timer = setTimeout(() => {
      openVisitRef.current();
    }, 300);

    return () => clearTimeout(timer);
  }, [
    visitStarted,
    consentCredential,
    patientCrId,
    consentInterventionCode,
    interventionCodes,
  ]);

  // Outpatient discharge state
  // OTP is pre-populated from the consent credential captured at start-visit
  // so the user doesn't have to re-enter it. If DHA requires a fresh discharge
  // OTP, the user can click "Request fresh OTP" to call ilmSendDischargeOtp.
  const [dischargeOtp, setDischargeOtp] = useState(consentCredential?.otp ?? '');
  const [dischargeOtpRefreshed, setDischargeOtpRefreshed] = useState(false);
  useEffect(() => {
    if (consentCredential?.otp && !dischargeOtpRefreshed) {
      setDischargeOtp(consentCredential.otp);
    }
  }, [consentCredential?.otp, dischargeOtpRefreshed]);
  const [dischargeReason, setDischargeReason] =
    useState<(typeof OUTPATIENT_DISCHARGE_REASONS)[number]['value']>('RECOVERED');
  const [dischargeNotes, setDischargeNotes] = useState('');

  // Cancel state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] =
    useState<(typeof CANCEL_REASONS)[number]['value']>('OTHER_REASONS');
  const [cancelText, setCancelText] = useState('');

  // Manual intervention selection for start_visit when neither claim nor
  // consent provided one. User picks explicitly to avoid DHA rejecting
  // hardcoded fallbacks (e.g. SHA-12-001 not supported for OUTPATIENT).
  const [manualInterventionCode, setManualInterventionCode] = useState('');

  // Effective intervention code that will be sent on start_visit — used to
  // enable/disable the button, satisfy the prereqs, and give the user visibility
  // into what will be sent.
  const effectiveInterventionCode = useMemo(
    () => interventionCodes[0] || consentInterventionCode || manualInterventionCode || '',
    [interventionCodes, consentInterventionCode, manualInterventionCode],
  );

  // Service type derived from active interventions on the claim, falling back
  // to the manually selected intervention when the claim has none yet.
  const serviceType = useMemo((): 'INPATIENT' | 'OUTPATIENT' => {
    if (activeInterventions.length > 0) return deriveServiceType(activeInterventions);
    if (selectedIntervention) {
      if (selectedIntervention.accessPoint === 'IP') return 'INPATIENT';
      if (selectedIntervention.accessPoint === 'OP') return 'OUTPATIENT';
    }
    const code = effectiveInterventionCode;
    if (!code) return 'OUTPATIENT';
    const prefix = code.split('-').slice(0, 2).join('-');
    if (INPATIENT_PREFIXES.includes(prefix)) return 'INPATIENT';
    return 'OUTPATIENT';
  }, [activeInterventions, selectedIntervention, effectiveInterventionCode]);

  const hasPerDiemIntervention = useMemo(
    () => (claim.claim_interventions ?? []).some((item) => item.status === 'active' && item.is_per_diem),
    [claim.claim_interventions],
  );

  // Add intervention / diagnosis dialogs
  const [addInterventionOpen, setAddInterventionOpen] = useState(false);
  const [addDialogPkgCode, setAddDialogPkgCode] = useState('');
  const [newInterventionCode, setNewInterventionCode] = useState('');
  const [addInterventionInlineError, setAddInterventionInlineError] = useState<string | null>(null);
  const [addDiagnosisOpen, setAddDiagnosisOpen] = useState(false);
  const [newIcdCode, setNewIcdCode] = useState('');
  const [diagnosisAnchorCode, setDiagnosisAnchorCode] = useState('');

  const {
    data: preSubmitValidation,
    isFetching: preSubmitValidationLoading,
    refetch: refetchPreSubmitValidation,
  } = useQuery({
    queryKey: ['sha-claim-submit-validation', claimId, claim.updated_at],
    queryFn: () => shaApi.validateClaimSubmission(claimId),
    enabled: !!claimId && visitStarted,
    staleTime: 0,
  });

  const {
    data: attachmentSyncStatus,
    isFetching: attachmentSyncStatusLoading,
    refetch: refetchAttachmentSyncStatus,
  } = useQuery({
    queryKey: ['sha-claim-dha-attachment-sync-status-checklist', claimId, claim.updated_at],
    queryFn: () => shaApi.ilmAttachmentSyncStatus(claimId),
    enabled: !!claimId && visitStarted,
    staleTime: 0,
  });

  const attachmentSyncMatched = attachmentSyncStatus?.matched ?? 0;
  const attachmentSyncTotal = attachmentSyncStatus?.total ?? 0;
  const dhaAttachmentsSynced = attachmentSyncStatus?.all_matched ?? false;

  const preSubmitChecklist = useMemo<PreSubmitChecklistItem[]>(() => {
    const preSubmitErrors = preSubmitValidation?.errors ?? [];
    const hasError = (matcher: (error: string) => boolean) => preSubmitErrors.some(matcher);

    return [
      {
        id: 'items',
        label: 'Claim has billable items',
        mode: 'auto',
        complete: !hasError((error) => /at least one item|missing SHA tariff code/i.test(error)),
      },
      {
        id: 'attachments',
        label: 'Required core attachments (clinical notes + invoice)',
        mode: 'auto',
        complete: !hasError((error) => /Missing required attachment:/i.test(error)),
      },
      {
        id: 'dha-attachments',
        label: 'Attachments synced to DHA claim attachments endpoint',
        mode: 'manual',
        complete: dhaAttachmentsSynced,
        detail: `${attachmentSyncMatched}/${attachmentSyncTotal} strict file/type matches on DHA`,
      },
      {
        id: 'amount',
        label: 'Claimed amount is greater than zero',
        mode: 'auto',
        complete: !hasError((error) => /Claimed amount must be greater than zero/i.test(error)),
      },
      {
        id: 'preview',
        label: 'Claim preview completed',
        mode: 'auto',
        complete: !hasError((error) => /Claim must be previewed before submission/i.test(error)),
      },
      {
        id: 'docs-by-intervention',
        label: 'Intervention-specific required documents uploaded',
        mode: 'manual',
        complete: !hasError((error) => /Missing required document '/i.test(error)),
      },
      {
        id: 'consent',
        label: 'Consent token / visit authorization valid',
        mode: 'manual',
        complete: !hasError((error) => /validated consent token|start visit flow/i.test(error)),
      },
      {
        id: 'preauth',
        label: 'All required pre-authorizations approved',
        mode: 'manual',
        complete: !hasError((error) => /pre-authorization|preauth|must be approved/i.test(error)),
      },
    ];
  }, [
    preSubmitValidation?.errors,
    dhaAttachmentsSynced,
    attachmentSyncMatched,
    attachmentSyncTotal,
  ]);

  const [autoFixedChecklistIds, setAutoFixedChecklistIds] = useState<string[]>([]);
  const previousChecklistStateRef = useRef<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (!visitStarted || preSubmitChecklist.length === 0) return;
    const autoFixableIds = new Set(['items', 'attachments', 'amount', 'preview']);
    const currentMap = Object.fromEntries(preSubmitChecklist.map((item) => [item.id, item.complete]));
    const previousMap = previousChecklistStateRef.current;

    if (previousMap) {
      const newlyAutoFixed = preSubmitChecklist
        .filter((item) => autoFixableIds.has(item.id))
        .filter((item) => previousMap[item.id] === false && item.complete)
        .map((item) => item.id);

      if (newlyAutoFixed.length > 0) {
        setAutoFixedChecklistIds((prev) => Array.from(new Set([...prev, ...newlyAutoFixed])));
      }
    }

    previousChecklistStateRef.current = currentMap;
  }, [preSubmitChecklist, visitStarted]);

  const allChecklistItemsComplete = preSubmitChecklist.every((item) => item.complete);
  const preSubmitChecklistBlocking = visitStarted && (
    preSubmitValidationLoading || (preSubmitValidation ? !allChecklistItemsComplete : false)
  );

  const refreshPreSubmitChecklist = useCallback(() => {
    void refetchPreSubmitValidation();
    void refetchAttachmentSyncStatus();
  }, [refetchPreSubmitValidation, refetchAttachmentSyncStatus]);

  const addInterventionValidation = useMemo(
    () => validateInterventionCombination(interventionCodes, newInterventionCode),
    [interventionCodes, newInterventionCode],
  );

  // ---- Capitation provider validation (PHC flow only) ----
  const [capitationWarning, setCapitationWarning] = useState<CapitationValidationResult | null>(
    null,
  );
  useEffect(() => {
    if (!useVirtualLine || !claim.sha_member) return;
    let cancelled = false;
    shaApi
      .validateCapitationProvider(claim.sha_member, claimId)
      .then((res) => {
        if (!cancelled) setCapitationWarning(res);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      cancelled = true;
    };
  }, [claim.sha_member, claimId, useVirtualLine]);

  // ---- Action runner ----
  async function run<T extends ActionKey>(action: T, fn: () => Promise<IlmCallResult>) {
    setBusy(action);
    setError(null);
    try {
      const r = await fn();
      setLastResult(r);
      onChange?.();
      return r;
    } catch (e: unknown) {
      const msg = formatErr(e);
      const lower = msg.toLowerCase();
      // DHA rejects OTP for patients registered with biometrics — guide to biometric path
      if (lower.includes('restricted to biometric') || lower.includes('biometric') && (lower.includes('required') || lower.includes('restrict'))) {
        setError(
          'This patient requires biometric consent. DHA does not allow OTP for this patient. ' +
            'Use the "Biometric consent" button below to capture their fingerprint.'
        );
      } else {
        setError(msg);
      }
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'consent_token_expired') {
        toast.error('Consent token has expired. Please re-consent the patient.');
        // Re-fetch claim data so dha_visit_started_at (which the backend cleared)
        // is reflected in the UI, unblocking the consent + start-visit flow.
        onChange?.();
      } else if (code === 'consent_token_not_found') {
        toast.error('No validated consent token for this claim. Please complete the consent flow.');
      }
      throw e;
    } finally {
      setBusy(null);
    }
  }

  // ---- Action handlers ----
  const handleResendOtp = useCallback(async () => {
    if (!claim.sha_member) return;
    setBusy('resendOtp');
    setError(null);
    try {
      const memberId = typeof claim.sha_member === 'number' ? claim.sha_member : 0;
      // Pass intervention codes so the OTP targets the right benefit package.
      // Priority: claim interventions → consent intervention → none.
      let codes: string[] = [];
      if (interventionCodes.length > 0) {
        codes = interventionCodes;
      } else if (consentInterventionCode) {
        codes = [consentInterventionCode];
      }
      const result = await shaApi.sendConsentOTP({
        sha_member_id: memberId,
        ...(codes.length ? { intervention_codes: codes } : {}),
      });
      // If sandbox/UAT, auto-fill the OTP
      if (result.sandbox_otp) {
        setStartOtp(result.sandbox_otp);
      }
      setError(null);
    } catch (e: unknown) {
      setError(formatErr(e));
    } finally {
      setBusy(null);
    }
  }, [claim.sha_member, interventionCodes, consentInterventionCode]);

  const handleStartBiometric = useCallback(async () => {
    setBiometricBusy(true);
    setError(null);
    try {
      const memberId = typeof claim.sha_member === 'number' ? claim.sha_member : 0;
      const result = await shaApi.authorizeBiometric({
        sha_member_id: memberId,
        workstation_id: facilityDetail?.workstation_id || 'vitora-web',
        agent_national_id: facilityAgentNationalId,
      });
      setStartAuthGuid(result.auth_guid);
      if (result.sandbox_mode) {
        // Auto-open visit — biometric is already VALIDATED in sandbox
        setTimeout(() => openVisitRef.current(), 300);
      } else {
        toast.info('Biometric authorization initiated — waiting for fingerprint…');
      }
    } catch (e: unknown) {
      setError(formatErr(e));
    } finally {
      setBiometricBusy(false);
    }
  }, [claim.sha_member, facilityDetail?.workstation_id, facilityAgentNationalId]);

  async function openVisit() {
    if (!patientCrId) return;
    if (visitStarted) return;
    // DHA start_visit accepts either otp (6-digit code) or auth_guid (biometric).
    // The consent token is the OUTPUT of start_visit, never an input.
    // Priority: biometric auth_guid → manually entered OTP → OTP from consent flow.
    const credential: Record<string, string> = {};
    if (startAuthGuid) {
      credential.auth_guid = startAuthGuid;
    } else if (startOtp) {
      credential.otp = startOtp;
    } else if (consentCredential?.otp) {
      credential.otp = consentCredential.otp;
    }
    if (Object.keys(credential).length === 0) {
      setError('Enter the OTP sent to the patient, or use biometric consent.');
      return;
    }
    // DHA start_visit requires at least one valid intervention code.
    // Priority: (1) interventions already on the claim,
    //           (2) intervention selected during consent (same one used to validate OTP),
    //           (3) intervention manually selected in the panel dropdown.
    let codes: string[] = [];
    if (interventionCodes.length > 0) {
      codes = interventionCodes;
    } else if (consentInterventionCode) {
      codes = [consentInterventionCode];
    } else if (manualInterventionCode) {
      codes = [manualInterventionCode];
    }
    if (codes.length === 0) {
      setError('Select an intervention below before opening the visit.');
      return;
    }
    await run('startVisit', () =>
      shaApi.ilmStartVisit(claimId, {
        ...credential,
        patient_id: patientCrId,
        intervention_codes: codes,
        service_type: serviceType,
        ...(serviceType === 'INPATIENT' && claim.admission_date
          ? { admission_date: claim.admission_date }
          : {}),
        ...(hasPractitioner ? practitionerFields : {}),
      }),
    );
  }
  // Ref to the latest openVisit so callbacks/effects that schedule async work
  // (sandbox biometric auto-open, auto-open effect) always use current state.
  const openVisitRef = useRef(openVisit);
  openVisitRef.current = openVisit;

  async function preview() {
    if (serviceType === 'INPATIENT' && hasPerDiemIntervention && !claim.discharge_date) {
      setError(
        'DHA blocks preview for active inpatient PER DIEM claims before discharge. Complete discharge first, then retry preview.',
      );
      return;
    }
    const result = await run('preview', () => shaApi.ilmPreview(claimId));
    if (result) {
      setPreviewResult(result);
      setPreviewDhaInvoiceNumber(extractPreviewInvoiceNumber(result.payload));
      if (result.payload && typeof result.payload === 'object' && !Array.isArray(result.payload)) {
        const payload = result.payload as Record<string, unknown>;
        const authorizationCode = String(payload.authorization_code || '').trim();
        const memberNumber = String(payload.member_number || '').trim();
        const dhaInvoiceNumber = extractPreviewInvoiceNumber(result.payload);
        onPreviewContext?.({
          authorizationCode: authorizationCode || undefined,
          memberNumber: memberNumber || undefined,
          dhaInvoiceNumber: dhaInvoiceNumber || undefined,
        });
      }
      setApplyPreviewResult(null);
      setMaterializePreviewResult(null);
      if (visitStarted) {
        void refetchPreSubmitValidation();
      }
    }
  }

  async function applyPreviewLines() {
    const payload = previewResult?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      setError('Run preview first before applying preview lines.');
      return;
    }

    setBusy('applyPreviewLines');
    setError(null);
    setApplyPreviewResult(null);
    setMaterializePreviewResult(null);
    try {
      const result = await shaApi.ilmApplyPreviewLines(
        claimId,
        payload as Record<string, unknown>,
        replacePreviewLines,
      );
      setApplyPreviewResult(result);
      if (!claim.dha_invoice_number && result.detected_invoice_number) {
        setPreviewDhaInvoiceNumber(result.detected_invoice_number);
      }
      toast.success(result.message || 'Preview lines applied to local claim items.');
      onChange?.();
      if (visitStarted) {
        void refetchPreSubmitValidation();
      }
    } catch (e: unknown) {
      setError(formatErr(e));
    } finally {
      setBusy(null);
    }
  }

  async function materializePreviewInvoice() {
    setBusy('materializePreviewInvoice');
    setError(null);
    setMaterializePreviewResult(null);
    try {
      const result = await shaApi.ilmMaterializePreviewInvoice(claimId, {
        replace_existing: replacePreviewLines,
        invoice_number:
          applyPreviewResult?.detected_invoice_number ||
          previewDhaInvoiceNumber ||
          claim.dha_invoice_number ||
          undefined,
      });
      setMaterializePreviewResult(result);
      toast.success('Preview invoice materialization completed.');
      onChange?.();
    } catch (e: unknown) {
      setError(formatErr(e));
    } finally {
      setBusy(null);
    }
  }

  async function requestFreshDischargeOtp() {
    if (!consentToken || !patientCrId) return;
    setBusy('sendDischargeOtp');
    setError(null);
    try {
      await shaApi.ilmSendDischargeOtp({
        consent_token: consentToken,
        patient_id: patientCrId,
      });
      setDischargeOtp('');
      setDischargeOtpRefreshed(true);
    } catch (e: unknown) {
      setError(formatErr(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitOutpatient() {
    if (!dhaInvoiceNumber || (!dischargeOtp && !startAuthGuid)) return;
    await run('submit', () =>
      shaApi.ilmSubmit(claimId, {
        invoice_number: dhaInvoiceNumber,
        ...(dischargeOtp ? { otp: dischargeOtp } : { discharge_auth_guid: startAuthGuid }),
        discharge_reason: dischargeReason,
        ...(dischargeNotes ? { notes: dischargeNotes } : {}),
        ...practitionerFields,
      }),
    );
  }

  async function addIntervention() {
    if (!newInterventionCode) return;
    setAddInterventionInlineError(null);
    if (interventionCodes.includes(newInterventionCode)) {
      const duplicateMessage = `Intervention ${newInterventionCode} is already on the claim.`;
      setError(duplicateMessage);
      setAddInterventionInlineError(duplicateMessage);
      return;
    }
    if (!addInterventionValidation.valid) {
      const reason = addInterventionValidation.reason ?? 'This intervention combination is not allowed.';
      setError(reason);
      setAddInterventionInlineError(reason);
      return;
    }
    const fn = useVirtualLine
      ? () =>
          shaApi.ilmAddVirtualClaimLine(claimId, {
            intervention_code: newInterventionCode,
          })
      : () => shaApi.ilmAddIntervention(claimId, { intervention_code: newInterventionCode });
    try {
      await run(useVirtualLine ? 'addVirtualClaimLine' : 'addIntervention', fn);
      setAddInterventionOpen(false);
      setNewInterventionCode('');
      setAddInterventionInlineError(null);
    } catch (e: unknown) {
      const inlineMessage = extractInterventionCombinationError(e);
      if (inlineMessage) {
        setAddInterventionInlineError(inlineMessage);
      }
    }
  }

  async function addDiagnosis() {
    if (!newIcdCode || !diagnosisAnchorCode) return;
    await run('addDiagnosis', () =>
      shaApi.ilmAddDiagnosis(claimId, {
        icd_code: newIcdCode,
        intervention_code: diagnosisAnchorCode,
        ...practitionerFields,
      }),
    );
    setAddDiagnosisOpen(false);
    setNewIcdCode('');
    setDiagnosisAnchorCode('');
  }

  async function cancelClaim() {
    await run('close', () =>
      shaApi.ilmClose(claimId, {
        cancel_reason_type: cancelReason,
        cancel_reason_text: cancelText,
      }),
    );
    setCancelOpen(false);
    setCancelText('');
  }

  // ---- Prerequisites ----
  // For opening a visit, the DHA start_visit endpoint validates the OTP directly
  // (no pre-validated consent token needed). The consent token is only required
  // for post-visit operations (add interventions, submit).
  // Practitioner licence is recommended but NOT mandatory for visit start.
  const hasConsentOrOtp = !!consentToken || !!startOtp || !!startAuthGuid;
  const prereqs: Array<{ label: string; ok: boolean; hint?: string }> = [
    {
      label: 'Patient consent',
      ok: requiresConsent ? hasConsentOrOtp : true,
      hint: requiresConsent
        ? hasConsentOrOtp
          ? consentToken ? 'Token validated' : 'OTP entered — will validate on visit start'
          : undefined
        : 'Not required for emergency flow',
    },
    {
      label: 'Patient CR ID',
      ok: !!patientCrId,
      hint: patientCrId || undefined,
    },
    {
      label: `Active interventions`,
      ok: activeInterventions.length > 0 || !!effectiveInterventionCode,
      hint: activeInterventions.length > 0
        ? `${activeInterventions.length} on claim`
        : effectiveInterventionCode
          ? `Will use ${effectiveInterventionCode}`
          : 'Add at least one intervention first',
    },
    {
      label: 'Practitioner licence',
      ok: true, // Soft — DHA accepts without practitioner for visit start
      hint: hasPractitioner
        ? practitionerFields.practitioner_identification_number
        : 'Optional for visit start (add later)',
    },
    {
      label: 'OTP / biometric',
      ok: !!(startOtp || startAuthGuid || consentToken),
      hint: startAuthGuid
        ? 'Biometric authorised'
        : startOtp
          ? 'OTP ready'
          : consentToken
            ? 'Consent validated'
            : 'Enter OTP from patient below',
    },
  ];
  const canOpenVisit = prereqs.every((p) => p.ok);
  // Minimal requirements to attempt start_visit (DHA needs OTP + patient_id + intervention)
  const canAttemptVisit =
    !!patientCrId &&
    !!(startOtp || startAuthGuid || consentToken) &&
    !!effectiveInterventionCode;

  const panelTitle = flow
    ? `DHA HIE Workflow - ${flow.badgeLabel}`
    : 'DHA HIE Workflow';

  const isStartingVisit = busy !== null && busy === 'startVisit';
  const previewLoading = busy === 'preview';
  const applyPreviewLoading = busy === 'applyPreviewLines';
  const materializePreviewLoading = busy === 'materializePreviewInvoice';
  const previewDone = !!previewResult?.payload;
  const applyPreviewDone = !!applyPreviewResult?.success;
  const materializePreviewDone = !!materializePreviewResult?.success;

  function workflowButtonClass(loading: boolean, done: boolean): string {
    if (loading) {
      return '!border-amber-400 !bg-amber-50 !text-amber-800 hover:!bg-amber-100';
    }
    if (done) {
      return '!border-emerald-500 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100';
    }
    return '';
  }

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{panelTitle}</CardTitle>
            {flow && (
              <p className="text-xs text-muted-foreground mt-0.5">{flow.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${tokenStatus.badgeClass}`}>
                Token: {tokenStatus.label}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{tokenStatus.detail}</span>
            </div>
          </div>
          <VisitStatusPill visitStarted={visitStarted} startedAt={claim.dha_visit_started_at} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Capitation warning (PHC) */}
        {capitationWarning && !capitationWarning.is_valid && (
          <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">
              Provider mismatch
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              {capitationWarning.warning}
            </AlertDescription>
          </Alert>
        )}

        {/* Per-diem note */}
        {flow?.isPerDiem && (
          <Alert>
            <AlertTitle className="text-sm">Per-diem billing</AlertTitle>
            <AlertDescription className="text-xs">
              Line items are computed automatically from accrued admission days at discharge.
              Use the Interventions list on the Overview tab to transfer between wards.
            </AlertDescription>
          </Alert>
        )}

        {/* Inline error / success feedback */}
        {error && (
          <Alert variant="destructive">
            <AlertTitle className="text-sm">Action failed</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* ====================================================================
            STEP 1 — Open Visit
        ==================================================================== */}
        {!visitStarted && (
          <section className="space-y-3">
            <StepHeader index={1} title="Open visit at DHA" />

            <PrereqGrid prereqs={prereqs} />

            {/* Intervention selector — shown when neither the claim nor consent
                provided an intervention code and the user has not yet picked one
                manually. DHA requires a valid, facility-eligible, FEE-FOR-SERVICE
                intervention on start_visit. Capitation and inactive codes are
                filtered out server-side. */}
            {activeInterventions.length === 0 && !consentInterventionCode && !manualInterventionCode && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <Label className="text-xs font-medium text-amber-900 dark:text-amber-100">
                  Select intervention for this visit
                </Label>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Consent didn&apos;t include one. Pick a benefit package and intervention your facility is entitled to bill.
                </p>
                {benefitPackagesLoading ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-background">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-xs text-muted-foreground">Loading benefit packages…</span>
                  </div>
                ) : benefitPackageOptions.length > 0 ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="ilm-manual-package" className="text-xs font-medium text-amber-800 dark:text-amber-200">
                        Benefit Package
                      </Label>
                      <Select
                        value={selectedBenefitPkgCode}
                        onValueChange={(value) => {
                          setSelectedBenefitPkgCode(value);
                          setManualInterventionCode('');
                          if (error === 'Select an intervention below before opening the visit.') {
                            setError(null);
                          }
                        }}
                      >
                        <SelectTrigger id="ilm-manual-package" className="bg-background">
                          <SelectValue placeholder="Select benefit package…" />
                        </SelectTrigger>
                        <SelectContent>
                          {benefitPackageOptions.map((pkg) => (
                            <SelectItem key={pkg.code} value={pkg.code}>
                              {pkg.code} — {pkg.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedBenefitPkgCode && (
                      <div className="space-y-1">
                        <Label htmlFor="ilm-manual-intervention" className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          Intervention
                        </Label>
                        {interventionsLoading ? (
                          <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-background">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span className="text-xs text-muted-foreground">Loading interventions…</span>
                          </div>
                        ) : interventionOptions.length > 0 ? (
                          <Select
                            value={manualInterventionCode}
                            onValueChange={(value) => {
                              setManualInterventionCode(value);
                              if (error === 'Select an intervention below before opening the visit.') {
                                setError(null);
                              }
                            }}
                          >
                            <SelectTrigger id="ilm-manual-intervention" className="bg-background">
                              <SelectValue placeholder="Choose an intervention…" />
                            </SelectTrigger>
                            <SelectContent>
                              {interventionOptions.map((opt) => (
                                <SelectItem key={opt.code} value={opt.code}>
                                  <span className="font-mono text-xs">{opt.code}</span>
                                  {' — '}
                                  {opt.name}
                                  {opt.category ? ` · ${opt.category}` : ''}
                                  {opt.price ? ` · KES ${Number(opt.price).toLocaleString()}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">
                            No interventions found for this package.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300 py-1">
                    No eligible benefit packages found for this patient. DHA may not recognise their enrollment.
                  </p>
                )}
              </div>
            )}

            {/*
              DHA start_visit requires either:
                - otp (6-digit code sent to patient's phone)
                - auth_guid (from a completed biometric fingerprint match)
              The consent token is the OUTPUT of start_visit, never an input.
              Patients who aren't OTP-whitelisted MUST use the biometric path.
            */}
            {requiresConsent && (
              <>
                {startAuthGuid ? (
                  /* Biometric path — auth GUID already obtained, just need to open */
                  <div className="space-y-2">
                    {isStartingVisit ? (
                      <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <div className="text-sm">
                          <span className="font-medium">Opening visit</span>
                          <span className="text-muted-foreground">
                            {' · '}validating biometric consent &amp; starting DHA session…
                          </span>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={openVisit}
                        disabled={!canOpenVisit || busy !== null}
                      >
                        <Play className="mr-2 h-3 w-3" />
                        Open visit (biometric)
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Biometric fingerprint verified — ready to open the DHA visit.
                    </p>
                  </div>
                ) : consentCredential?.otp ? (
                  /* Fresh OTP from consent flow — single click to open */
                  <div className="space-y-1">
                    {isStartingVisit ? (
                      <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <div className="text-sm">
                          <span className="font-medium">Opening visit</span>
                          <span className="text-muted-foreground">
                            {' · '}validating consent &amp; starting DHA session…
                          </span>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={openVisit}
                        disabled={!canOpenVisit || busy !== null}
                      >
                        <Play className="mr-2 h-3 w-3" />
                        Open Visit
                      </Button>
                    )}
                    <p className="text-xs text-green-600 dark:text-green-400">
                      OTP validated — ready to open the DHA visit.
                    </p>
                  </div>
                ) : (
                  /* No credential yet — show OTP entry + Send OTP + Biometric */
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label htmlFor="ilm-start-otp" className="text-xs">
                          OTP from patient
                          {startOtp && (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                              · entered
                            </span>
                          )}
                        </Label>
                        <Input
                          id="ilm-start-otp"
                          value={startOtp}
                          onChange={(e) => setStartOtp(e.target.value)}
                          placeholder="Enter 6-digit OTP received by patient"
                        />
                      </div>
                      {startOtp ? (
                        <Button
                          onClick={openVisit}
                          disabled={!canAttemptVisit || busy !== null}
                          className="w-full sm:w-auto"
                        >
                          {isStartingVisit ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-2 h-3 w-3" />
                          )}
                          Validate &amp; Open Visit
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResendOtp}
                          disabled={busy === 'resendOtp' || !claim.sha_member}
                          className="w-full sm:w-auto"
                        >
                          {busy === 'resendOtp' ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="mr-1 h-3 w-3" />
                          )}
                          Send OTP
                        </Button>
                      )}
                    </div>
                    {!startOtp && (
                      <p className="text-[11px] text-muted-foreground">
                        Ask the patient for the OTP sent to their phone. If they didn&apos;t receive it or it expired, click &quot;Send OTP&quot;.
                      </p>
                    )}
                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleStartBiometric}
                      disabled={biometricBusy || busy !== null}
                      className="w-full"
                    >
                      {biometricBusy ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Fingerprint className="mr-2 h-3 w-3" />
                      )}
                      Biometric consent
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Emergency (ECCIF) — no consent required */}
            {!requiresConsent && (
              <Button onClick={openVisit} disabled={!canOpenVisit || busy !== null}>
                {isStartingVisit ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Play className="mr-2 h-3 w-3" />
                )}
                Open emergency claim
              </Button>
            )}

            {activeInterventions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Will submit {activeInterventions.length} intervention
                {activeInterventions.length === 1 ? '' : 's'} ({serviceType.toLowerCase()})
                {hasPractitioner ? `, on behalf of ${practitionerFields.practitioner_regulation_body}-${practitionerFields.practitioner_identification_number}` : ''}.
              </p>
            )}
            {activeInterventions.length === 0 && effectiveInterventionCode && (
              <p className="text-xs text-muted-foreground">
                Will submit intervention <span className="font-mono">{effectiveInterventionCode}</span>
                {' '}({serviceType.toLowerCase()})
                {consentInterventionCode === effectiveInterventionCode ? ' — from consent' : ''}
                {manualInterventionCode === effectiveInterventionCode && !consentInterventionCode ? ' — manually selected' : ''}
                {hasPractitioner ? `, on behalf of ${practitionerFields.practitioner_regulation_body}-${practitionerFields.practitioner_identification_number}` : ''}.
              </p>
            )}
          </section>
        )}

        {/* ====================================================================
            STEP 2 — Manage interventions & diagnoses
        ==================================================================== */}
        {visitStarted && (
          <section className="space-y-3">
            <StepHeader index={2} title="Interventions & diagnoses" />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {activeInterventions.length} active intervention
                {activeInterventions.length === 1 ? '' : 's'}. Manage existing ones on the
                Interventions tab.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddInterventionOpen(true)}
                  disabled={busy !== null || aloneClaim}
                >
                  Add intervention
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDiagnosisAnchorCode(interventionCodes[0] ?? '');
                    setAddDiagnosisOpen(true);
                  }}
                  disabled={busy !== null || activeInterventions.length === 0}
                >
                  Add diagnosis
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ====================================================================
            STEP 3 — Lifecycle (preview / submit)
        ==================================================================== */}
        {visitStarted && (
          <section className="space-y-3">
            <StepHeader index={3} title="Lifecycle" />

      <PreSubmitChecklistBox
        loading={
          preSubmitValidationLoading || attachmentSyncStatusLoading
        }
        items={preSubmitChecklist}
        autoFixedIds={autoFixedChecklistIds}
        onRefresh={refreshPreSubmitChecklist}
      />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className={workflowButtonClass(previewLoading, previewDone)}
                onClick={preview}
                disabled={busy !== null}
              >
                {previewLoading ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : previewDone ? (
                  <CheckCircle2 className="mr-2 h-3 w-3" />
                ) : (
                  <RefreshCw className="mr-2 h-3 w-3" />
                )}
                1. Preview claim
              </Button>
              <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                <Label htmlFor="replace-preview-lines" className="text-xs text-muted-foreground">
                  Replace existing items
                </Label>
                <Switch
                  id="replace-preview-lines"
                  checked={replacePreviewLines}
                  onCheckedChange={setReplacePreviewLines}
                  disabled={busy !== null}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className={workflowButtonClass(applyPreviewLoading, applyPreviewDone)}
                onClick={applyPreviewLines}
                disabled={busy !== null || !previewResult?.payload}
              >
                {applyPreviewLoading ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : applyPreviewDone ? (
                  <CheckCircle2 className="mr-2 h-3 w-3" />
                ) : (
                  <CircleDashed className="mr-2 h-3 w-3" />
                )}
                2. Apply preview lines locally
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={workflowButtonClass(materializePreviewLoading, materializePreviewDone)}
                onClick={materializePreviewInvoice}
                disabled={busy !== null || (!previewResult?.payload && !applyPreviewResult?.success)}
              >
                {materializePreviewLoading ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : materializePreviewDone ? (
                  <CheckCircle2 className="mr-2 h-3 w-3" />
                ) : (
                  <CircleDashed className="mr-2 h-3 w-3" />
                )}
                3. Materialize preview invoice
              </Button>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded border p-2">
                <p className="text-muted-foreground">DHA invoice</p>
                <p className="font-medium">{dhaInvoiceNumber || 'Not available yet (run preview)'}</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-muted-foreground">Local invoice</p>
                <p className="font-medium">{localInvoiceNumber || 'Not linked'}</p>
              </div>
            </div>

            {!!previewResult?.payload && (
              <ClaimPreviewPanel payload={previewResult.payload} />
            )}

            {applyPreviewResult?.success && (
              <Alert>
                <AlertTitle className="text-sm">Preview lines applied</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <p>
                    Created {applyPreviewResult.created_item_count} item(s)
                    {applyPreviewResult.replace_existing
                      ? ` after replacing ${applyPreviewResult.previous_item_count} existing item(s)`
                      : ''}
                    . Claimed amount is now KES {applyPreviewResult.claimed_amount}.
                  </p>
                  {applyPreviewResult.detected_invoice_number && (
                    <p>
                      Preview invoice: {applyPreviewResult.detected_invoice_number}
                      {applyPreviewResult.invoice_linked ? ' (linked to local invoice)' : ''}.
                    </p>
                  )}
                  {(applyPreviewResult.final_bill_created || applyPreviewResult.final_bill_updated) && (
                    <p>
                      Final Bill auto-generated
                      {applyPreviewResult.final_bill_attachment_id
                        ? ` (attachment #${applyPreviewResult.final_bill_attachment_id})`
                        : ''}
                      {applyPreviewResult.final_bill_updated ? ' and refreshed from latest invoice data.' : '.'}
                    </p>
                  )}
                  {applyPreviewResult.final_bill_skipped_reason && (
                    <p>
                      Final Bill auto-generation skipped: {applyPreviewResult.final_bill_skipped_reason}.
                    </p>
                  )}
                  {typeof applyPreviewResult.allocation_pending_count === 'number' && (
                    <p>
                      {applyPreviewResult.allocation_pending_count} line(s) still need payer-allocation
                      review in invoice details (for fields not prefilled during materialization).
                    </p>
                  )}
                  {applyPreviewResult.unmatched_tariff_codes.length > 0 && (
                    <p>
                      Unmatched tariff codes: {applyPreviewResult.unmatched_tariff_codes.join(', ')}
                    </p>
                  )}
                  {applyPreviewResult.parse_errors.length > 0 && (
                    <p>
                      Skipped lines: {applyPreviewResult.parse_errors.join(' | ')}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {materializePreviewResult?.success && (
              <Alert>
                <AlertTitle className="text-sm">Preview invoice materialized</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <p>
                    Invoice {materializePreviewResult.invoice_number || 'N/A'}
                    {materializePreviewResult.invoice_id
                      ? ` (#${materializePreviewResult.invoice_id})`
                      : ''}
                    {' '}
                    {materializePreviewResult.linked_existing_invoice
                      ? 'linked from an existing claim.'
                      : 'is linked to this claim.'}
                  </p>
                  <p>
                    {materializePreviewResult.materialized
                      ? `Created ${materializePreviewResult.items_created || 0} item(s)${typeof materializePreviewResult.items_replaced === 'number' ? ` after replacing ${materializePreviewResult.items_replaced} item(s)` : ''}.`
                      : `Skipped: ${materializePreviewResult.skipped_reason || 'not materialized'}.`}
                  </p>
                  {(materializePreviewResult.final_bill_created ||
                    materializePreviewResult.final_bill_updated) && (
                    <p>
                      Final Bill auto-generated
                      {materializePreviewResult.final_bill_attachment_id
                        ? ` (attachment #${materializePreviewResult.final_bill_attachment_id})`
                        : ''}
                      {materializePreviewResult.final_bill_updated
                        ? ' and refreshed from latest invoice data.'
                        : '.'}
                    </p>
                  )}
                  {materializePreviewResult.final_bill_skipped_reason && (
                    <p>
                      Final Bill auto-generation skipped: {materializePreviewResult.final_bill_skipped_reason}.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Submit — inpatient defers to DischargePanel */}
            {isInpatientFlow ? (
              <Alert>
                <AlertTitle className="text-sm">Inpatient submission</AlertTitle>
                <AlertDescription className="text-xs">
                  Inpatient claims are submitted via the Discharge panel below.
                </AlertDescription>
              </Alert>
            ) : (
              <OutpatientSubmitBlock
                dhaInvoiceNumber={dhaInvoiceNumber}
                localInvoiceNumber={localInvoiceNumber}
                consentToken={consentToken}
                patientCrId={patientCrId}
                hasBiometric={!!startAuthGuid}
                dischargeOtp={dischargeOtp}
                setDischargeOtp={setDischargeOtp}
                dischargeReason={dischargeReason}
                setDischargeReason={setDischargeReason}
                dischargeNotes={dischargeNotes}
                setDischargeNotes={setDischargeNotes}
                otpPrefilledFromConsent={
                  !!consentCredential?.otp && !dischargeOtpRefreshed
                }
                preSubmitChecklistBlocking={preSubmitChecklistBlocking}
                busy={busy}
                onRequestFreshOtp={requestFreshDischargeOtp}
                onSubmit={submitOutpatient}
              />
            )}
          </section>
        )}

        {/* ====================================================================
            More actions — collapsed by default
        ==================================================================== */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground -ml-2">
              <ChevronRight className="mr-1 h-3 w-3 transition-transform data-[state=open]:rotate-90" />
              More actions
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-3">
            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-xs">
                <p className="font-medium">Cancel this claim</p>
                <p className="text-muted-foreground">
                  Permanently closes the claim with DHA. Cannot be undone.
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setCancelOpen(true)}
                disabled={busy !== null}
              >
                Cancel claim…
              </Button>
            </div>

            {lastResult && (
              <details className="rounded-md border p-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Last DHA response (HTTP {lastResult.status_code})
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                  {JSON.stringify(lastResult.payload ?? {}, null, 2)}
                </pre>
              </details>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      {/* =================== Dialogs =================== */}

      {/* Add intervention */}
      <Dialog
        open={addInterventionOpen}
        onOpenChange={(open) => {
          setAddInterventionOpen(open);
          if (!open) {
            setAddDialogPkgCode('');
            setNewInterventionCode('');
          }
        }}
      >
        <DialogContent className="sm:max-w-xl overflow-visible">
          <DialogHeader>
            <DialogTitle>Add intervention</DialogTitle>
            <DialogDescription>
              Append an intervention to this visit at DHA.
              {useVirtualLine && ' Submitted as a PHC virtual claim line.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Benefit package selector */}
            <div className="space-y-1">
              <Label className="text-xs">Benefit Package</Label>
              {benefitPackagesLoading ? (
                <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-background">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading packages…</span>
                </div>
              ) : effectiveBenefitPackageOptions.length > 0 ? (
                <Select
                  value={addDialogPkgCode}
                  onValueChange={(code) => {
                    setAddDialogPkgCode(code);
                    setSelectedBenefitPkgCode(code);
                    setNewInterventionCode('');
                    setAddInterventionInlineError(null);
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select benefit package…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {effectiveBenefitPackageOptions.map((pkg) => (
                      <SelectItem key={pkg.code} value={pkg.code} className="whitespace-normal leading-snug">
                        {pkg.code} — {pkg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : aloneClaim ? (
                <p className="text-xs text-amber-600 py-2">
                  This claim&apos;s primary intervention must be reported alone and cannot be combined
                  with any other benefit package.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No compatible benefit packages are available to combine with the existing
                  interventions on this claim.
                </p>
              )}
            </div>

            {/* Intervention selector — shown after package is selected */}
            <div className="space-y-1">
              <Label className="text-xs">Intervention</Label>
              {interventionsLoading ? (
                <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-background">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs text-muted-foreground">Loading interventions…</span>
                </div>
              ) : interventionOptions.length > 0 ? (
                <Select
                  value={newInterventionCode}
                  onValueChange={(value) => {
                    setNewInterventionCode(value);
                    setAddInterventionInlineError(null);
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select intervention…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {interventionOptions.map((opt) => (
                      <SelectItem key={opt.code} value={opt.code} className="whitespace-normal leading-snug">
                        <span className="font-mono text-xs">{opt.code}</span>
                        {' — '}
                        {opt.name}
                        {opt.category ? ` · ${opt.category}` : ''}
                        {opt.price ? ` · KES ${Number(opt.price).toLocaleString()}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  {addDialogPkgCode
                    ? 'No interventions found for this package.'
                    : 'Select a benefit package above to see available interventions.'}
                </p>
              )}
            </div>
            <CombinationGuard
              newCode={newInterventionCode}
              existing={interventionCodes}
            />
            {addInterventionInlineError && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{addInterventionInlineError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddInterventionOpen(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={addIntervention}
              disabled={
                !newInterventionCode ||
                interventionCodes.includes(newInterventionCode) ||
                !addInterventionValidation.valid ||
                busy !== null
              }
            >
              {(busy === 'addIntervention' || busy === 'addVirtualClaimLine') && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add diagnosis */}
      <Dialog open={addDiagnosisOpen} onOpenChange={setAddDiagnosisOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add diagnosis</DialogTitle>
            <DialogDescription>
              Anchor an ICD code to one of the active interventions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-icd" className="text-xs">
                ICD-10 code
              </Label>
              <Input
                id="new-icd"
                value={newIcdCode}
                onChange={(e) => setNewIcdCode(e.target.value.toUpperCase())}
                placeholder="e.g. J18.9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="anchor-intervention" className="text-xs">
                Anchored to intervention
              </Label>
              <Select value={diagnosisAnchorCode} onValueChange={setDiagnosisAnchorCode}>
                <SelectTrigger id="anchor-intervention">
                  <SelectValue placeholder="Select intervention" />
                </SelectTrigger>
                <SelectContent>
                  {activeInterventions.map((iv) => (
                    <SelectItem key={iv.intervention_code} value={iv.intervention_code}>
                      {iv.intervention_code} · {iv.intervention_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDiagnosisOpen(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={addDiagnosis}
              disabled={!newIcdCode || !diagnosisAnchorCode || busy !== null}
            >
              {busy === 'addDiagnosis' && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel claim</DialogTitle>
            <DialogDescription>
              Permanently closes this claim with DHA. This cannot be reversed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cancel-reason" className="text-xs">
                Reason
              </Label>
              <Select
                value={cancelReason}
                onValueChange={(v) =>
                  setCancelReason(v as (typeof CANCEL_REASONS)[number]['value'])
                }
              >
                <SelectTrigger id="cancel-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANCEL_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cancel-text" className="text-xs">
                Notes (optional)
              </Label>
              <Textarea
                id="cancel-text"
                value={cancelText}
                onChange={(e) => setCancelText(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={busy !== null}
            >
              Keep claim
            </Button>
            <Button variant="destructive" onClick={cancelClaim} disabled={busy !== null}>
              {busy === 'close' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Confirm cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ClaimILMPanel;

// =============================================================================
// Sub-components
// =============================================================================

function StepHeader({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {index}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
    </div>
  );
}

function VisitStatusPill({
  visitStarted,
  startedAt,
}: {
  visitStarted: boolean;
  startedAt?: string | null;
}) {
  if (visitStarted) {
    let when = '';
    if (startedAt) {
      try {
        when = format(parseISO(startedAt), 'dd MMM, HH:mm');
      } catch {
        /* ignore */
      }
    }
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Visit open{when ? ` · ${when}` : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CircleDashed className="h-3 w-3" />
      Visit not opened
    </Badge>
  );
}

function PrereqGrid({
  prereqs,
}: {
  prereqs: Array<{ label: string; ok: boolean; hint?: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 rounded-md border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-3">
      {prereqs.map((p) => (
        <div key={p.label} className="flex items-start gap-2 text-xs">
          {p.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0">
            <p className="font-medium leading-tight">{p.label}</p>
            {p.hint && (
              <p className="truncate text-[11px] text-muted-foreground">{p.hint}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreSubmitChecklistBox({
  loading,
  items,
  autoFixedIds,
  onRefresh,
}: {
  loading: boolean;
  items: PreSubmitChecklistItem[];
  autoFixedIds: string[];
  onRefresh: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Pre-submit checklist</p>
        <div className="inline-flex items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking…
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const autoFixed = autoFixedIds.includes(item.id);
          return (
            <div key={item.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="flex items-start gap-2">
                {item.complete ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div>
                  <p>{item.label}</p>
                  {item.detail ? (
                    <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                  ) : null}
                </div>
              </div>
              {item.complete ? (
                autoFixed ? (
                  <Badge variant="outline" className="h-5 text-[10px]">Auto-fixed</Badge>
                ) : (
                  <Badge variant="outline" className="h-5 text-[10px]">Complete</Badge>
                )
              ) : item.mode === 'auto' ? (
                <Badge variant="outline" className="h-5 text-[10px]">Auto-fix ready</Badge>
              ) : (
                <Badge variant="outline" className="h-5 text-[10px]">Manual action</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CombinationGuard({
  newCode,
  existing,
}: {
  newCode: string;
  existing: string[];
}) {
  if (!newCode && existing.length === 0) return null;

  if (newCode && existing.length > 0) {
    const validation = validateInterventionCombination(existing, newCode);
    if (!validation.valid) {
      return (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-700 dark:text-amber-300">{validation.reason}</span>
        </div>
      );
    }
  }

  if (existing.length > 0 && !newCode) {
    const primaryCode = existing[0];
    if (!primaryCode) return null;
    const primaryBenefit = getBenefitCode(primaryCode);
    const rules = INTERVENTION_COMBINATION_RULES[primaryBenefit];
    if (rules?.allowedCombinations === 'ALONE') {
      return (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {rules.name} must be reported alone — no additional interventions allowed.
        </p>
      );
    }
    if (rules && Array.isArray(rules.allowedCombinations)) {
      return (
        <p className="text-xs text-muted-foreground">
          Allowed combinations: {rules.allowedCombinations.join(', ')}
        </p>
      );
    }
  }

  return null;
}

interface OutpatientSubmitBlockProps {
  dhaInvoiceNumber: string;
  localInvoiceNumber: string;
  consentToken: string;
  patientCrId: string;
  hasBiometric: boolean;
  dischargeOtp: string;
  setDischargeOtp: (v: string) => void;
  dischargeReason: (typeof OUTPATIENT_DISCHARGE_REASONS)[number]['value'];
  setDischargeReason: (v: (typeof OUTPATIENT_DISCHARGE_REASONS)[number]['value']) => void;
  dischargeNotes: string;
  setDischargeNotes: (v: string) => void;
  /** True when `dischargeOtp` was prefilled from the consent OTP (not a fresh discharge OTP). */
  otpPrefilledFromConsent: boolean;
  preSubmitChecklistBlocking: boolean;
  busy: ActionKey | null;
  onRequestFreshOtp: () => Promise<void>;
  onSubmit: () => Promise<void>;
}

function OutpatientSubmitBlock(props: OutpatientSubmitBlockProps) {
  const {
    dhaInvoiceNumber,
    localInvoiceNumber,
    consentToken,
    patientCrId,
    hasBiometric,
    dischargeOtp,
    setDischargeOtp,
    dischargeReason,
    setDischargeReason,
    dischargeNotes,
    setDischargeNotes,
    otpPrefilledFromConsent,
    preSubmitChecklistBlocking,
    busy,
    onRequestFreshOtp,
    onSubmit,
  } = props;

  const missing: string[] = [];
  if (!dhaInvoiceNumber) missing.push('DHA invoice number');
  if (!consentToken) missing.push('consent token');
  if (!patientCrId) missing.push('patient CR ID');

  if (missing.length > 0) {
    return (
      <Alert>
        <AlertTitle className="text-sm">Cannot submit yet</AlertTitle>
        <AlertDescription className="text-xs">
          Missing: {missing.join(', ')}.
        </AlertDescription>
      </Alert>
    );
  }

  if (hasBiometric) {
    return (
      <div className="space-y-3 rounded-md border p-3">
        <div className="text-xs">
          <p className="font-medium">Submit claim</p>
          <p className="text-muted-foreground">
            DHA invoice {dhaInvoiceNumber}
            {localInvoiceNumber ? ` · local invoice ${localInvoiceNumber}` : ''}
            {' · '}biometric consent on file.
          </p>
        </div>
        <Button onClick={onSubmit} disabled={busy !== null} size="sm">
          {busy === 'submit' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Send className="mr-2 h-3 w-3" />
          )}
          Submit (biometric authorised)
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-xs">
        <p className="font-medium">Submit claim</p>
        <p className="text-muted-foreground">
          DHA invoice {dhaInvoiceNumber}
          {localInvoiceNumber ? ` · local invoice ${localInvoiceNumber}` : ''}
          {' · '}discharge consent required.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="discharge-otp" className="text-xs">
            Discharge OTP
            {otpPrefilledFromConsent && dischargeOtp && (
              <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                · using consent OTP
              </span>
            )}
          </Label>
          <Input
            id="discharge-otp"
            value={dischargeOtp}
            onChange={(e) => setDischargeOtp(e.target.value)}
            placeholder="From patient SMS"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="discharge-reason" className="text-xs">
            Discharge reason
          </Label>
          <Select
            value={dischargeReason}
            onValueChange={(v) =>
              setDischargeReason(
                v as (typeof OUTPATIENT_DISCHARGE_REASONS)[number]['value'],
              )
            }
          >
            <SelectTrigger id="discharge-reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPATIENT_DISCHARGE_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {dischargeReason === 'OTHER' && (
        <div className="space-y-1">
          <Label htmlFor="discharge-notes" className="text-xs">
            Notes
          </Label>
          <Input
            id="discharge-notes"
            value={dischargeNotes}
            onChange={(e) => setDischargeNotes(e.target.value)}
            placeholder="Brief reason for discharge"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onSubmit}
          disabled={busy !== null || !dischargeOtp || preSubmitChecklistBlocking}
          size="sm"
        >
          {busy === 'submit' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Send className="mr-2 h-3 w-3" />
          )}
          Submit claim
        </Button>
        {preSubmitChecklistBlocking && (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            Complete all checklist items above to enable submission.
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRequestFreshOtp}
          disabled={busy !== null}
          className="text-xs text-muted-foreground"
        >
          {busy === 'sendDischargeOtp' && (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          )}
          Request fresh OTP
        </Button>
      </div>
    </div>
  );
}
