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
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  CircleDashed,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { shaApi } from '@/lib/api/sha';
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
} from '@/lib/sha/combination-rules';
import { toCrId } from '@/lib/sha/ilm-parsers';
import { format, parseISO } from 'date-fns';

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
  | 'sendDischargeOtp'
  | 'submit'
  | 'close';

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

function derivePractitionerFields(user: ReturnType<typeof useAuth>['user']): PractitionerFields {
  if (!user) return {};
  // DHA only accepts 'National ID' as practitioner_identification_type.
  // Even when we have a license number, we must identify by national ID.
  if (user.national_id) {
    return {
      practitioner_identification_number: user.national_id,
      practitioner_identification_type: 'National ID',
      practitioner_regulation_body: user.licensing_body || 'KMPDC',
    };
  }
  // Fallback: use license number with National ID type (DHA resolves internally)
  if (user.license_number) {
    return {
      practitioner_identification_number: user.license_number,
      practitioner_identification_type: 'National ID',
      practitioner_regulation_body: user.licensing_body || 'KMPDC',
    };
  }
  return {};
}

function formatErr(e: unknown): string {
  const err = e as { response?: { data?: { error?: string; detail?: string } }; message?: string };
  return (
    err?.response?.data?.error ??
    err?.response?.data?.detail ??
    err?.message ??
    'Request failed'
  );
}

interface LiveInterventionItem {
  code: string;
  name: string;
  paymentMechanism?: string;
  tariff?: number;
}

/**
 * Extract intervention items from the DHA `ilmBenefitInterventions` response.
 * DHA returns deeply nested payloads — this normalizes across known shapes.
 */
function extractLiveInterventionItems(data: unknown): LiveInterventionItem[] {
  if (!data) return [];
  const items: LiveInterventionItem[] = [];

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
}: ClaimILMPanelProps) {
  const { user } = useAuth();
  const { facilityDetail } = useFacility();
  const claimId = claim.id;

  // ---- Intervention selection: live DHA → static catalog fallback ----
  // Per DHA docs (Scenario 6), we MUST call ilmBenefitInterventions to get
  // what this patient + facility can actually bill. The static catalog is only
  // a fallback when DHA is unreachable.
  const facilityLevel = facilityDetail?.level
    ? parseInt(facilityDetail.level.replace(/[^0-9]/g, ''), 10)
    : undefined;
  const facilityLevelKnown = typeof facilityLevel === 'number' && !Number.isNaN(facilityLevel);
  const isPhcLevel = facilityLevelKnown && facilityLevel! <= 3;

  // Patient CR ID (needed for ilmBenefitInterventions)
  const derivedPatientCrId =
    claim.dha_external_id ||
    toCrId(claim.sha_member_number ?? '') ||
    '';

  // Step 1: Live DHA benefit-interventions — authoritative source.
  const { data: liveInterventionsResp } = useQuery({
    queryKey: ['sha-live-benefit-interventions-ilm', derivedPatientCrId],
    queryFn: () =>
      shaApi.ilmBenefitInterventions({
        patient_id: derivedPatientCrId,
        sub_benefit_code: 'SHA-12-SC-01',
      }),
    enabled: !!derivedPatientCrId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });

  const liveOutpatientOptions = useMemo(() => {
    if (!liveInterventionsResp?.data) return [];
    const items = extractLiveInterventionItems(liveInterventionsResp.data);
    return items
      .filter((i) => i.code && i.name)
      .map((i) => ({
        code: i.code,
        name: i.name,
        category: i.paymentMechanism || undefined,
        price: i.tariff,
        schemes: undefined as string[] | undefined,
      }));
  }, [liveInterventionsResp]);

  // Step 2: Static catalog fallback (FFS + OP + active + level-filtered).
  const { data: fallbackInterventions } = useQuery({
    queryKey: ['ilm-fallback-outpatient-interventions', facilityLevel],
    queryFn: () =>
      shaApi.searchInterventionCodes('', 100, facilityLevel, {
        paymentMechanism: isPhcLevel ? 'FEE FOR SERVICE,FIXED FEE FOR SERVICE,CAPITATION' : 'FEE FOR SERVICE',
        accessPoint: 'OP',
        activeOnly: true,
      }),
    enabled: facilityLevelKnown && liveOutpatientOptions.length === 0,
    staleTime: 60 * 60 * 1000,
  });
  const staticOutpatientOptions = useMemo(() => {
    if (!fallbackInterventions?.length) return [];
    return fallbackInterventions.map((i) => ({
      code: i.code,
      name: i.name,
      category: i.category,
      price: i.price,
      schemes: i.schemes,
    }));
  }, [fallbackInterventions]);

  // Use live DHA results when available, otherwise static catalog.
  const outpatientOptions = liveOutpatientOptions.length > 0
    ? liveOutpatientOptions
    : staticOutpatientOptions;

  // ---- Derived context from claim + auth ----
  const visitStarted = !!claim.dha_visit_started_at;
  // Patient CR ID: prefer dha_external_id (set after DHA interaction), fall back
  // to deriving from SHA member number (e.g. SHA-12345 → CR12345)
  const patientCrId =
    claim.dha_external_id ||
    toCrId(claim.sha_member_number ?? '') ||
    '';
  const invoiceNumber = claim.invoice_number ?? '';
  const activeInterventions = useMemo(
    () => (claim.claim_interventions ?? []).filter((i) => i.status === 'active'),
    [claim.claim_interventions],
  );
  const interventionCodes = useMemo(
    () => activeInterventions.map((i) => i.intervention_code),
    [activeInterventions],
  );
  const serviceType = useMemo(
    () => deriveServiceType(activeInterventions),
    [activeInterventions],
  );
  const practitionerFields = useMemo(() => derivePractitionerFields(user), [user]);
  const hasPractitioner = !!practitionerFields.practitioner_identification_number;

  const useVirtualLine = flow?.addLineEndpoint === 'add_virtual_claim_line';
  const requiresConsent = flow ? flow.requiresConsent : true;
  const isInpatientFlow = !!flow?.supportsInpatientDischarge;

  // ---- Local UI state ----
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IlmCallResult | null>(null);

  // OTP for start_visit — auto-filled from consent credential
  const [startOtp, setStartOtp] = useState(consentCredential?.otp ?? '');
  const [startAuthGuid, setStartAuthGuid] = useState(consentCredential?.authGuid ?? '');
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
      openVisit();
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

  // Add intervention / diagnosis dialogs
  const [addInterventionOpen, setAddInterventionOpen] = useState(false);
  const [newInterventionCode, setNewInterventionCode] = useState('');
  const [interventionComboboxOpen, setInterventionComboboxOpen] = useState(false);
  const [addDiagnosisOpen, setAddDiagnosisOpen] = useState(false);
  const [newIcdCode, setNewIcdCode] = useState('');
  const [diagnosisAnchorCode, setDiagnosisAnchorCode] = useState('');

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
      setError(formatErr(e));
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

  async function openVisit() {
    if (!patientCrId) return;
    const credential = startAuthGuid
      ? { auth_guid: startAuthGuid }
      : { otp: startOtp };
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
        ...(hasPractitioner ? practitionerFields : {}),
      }),
    );
  }

  async function preview() {
    await run('preview', () => shaApi.ilmPreview(claimId));
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
    if (!invoiceNumber || (!dischargeOtp && !startAuthGuid)) return;
    await run('submit', () =>
      shaApi.ilmSubmit(claimId, {
        invoice_number: invoiceNumber,
        ...(dischargeOtp ? { otp: dischargeOtp } : { discharge_auth_guid: startAuthGuid }),
        discharge_reason: dischargeReason,
        ...(dischargeNotes ? { notes: dischargeNotes } : {}),
        ...practitionerFields,
      }),
    );
  }

  async function addIntervention() {
    if (!newInterventionCode) return;
    const fn = useVirtualLine
      ? () =>
          shaApi.ilmAddVirtualClaimLine(claimId, {
            intervention_code: newInterventionCode,
          })
      : () => shaApi.ilmAddIntervention(claimId, { intervention_code: newInterventionCode });
    await run(useVirtualLine ? 'addVirtualClaimLine' : 'addIntervention', fn);
    setAddInterventionOpen(false);
    setNewInterventionCode('');
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
      ok: activeInterventions.length > 0,
      hint: activeInterventions.length > 0
        ? `${activeInterventions.length} on claim`
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
  // Effective intervention code that will be sent on start_visit — used to
  // enable/disable the button and give the user visibility into what will be sent.
  const effectiveInterventionCode =
    interventionCodes[0] || consentInterventionCode || manualInterventionCode || '';
  // Minimal requirements to attempt start_visit (DHA needs OTP + patient_id + intervention)
  const canAttemptVisit =
    !!patientCrId &&
    !!(startOtp || startAuthGuid || consentToken) &&
    !!effectiveInterventionCode;

  const panelTitle = flow
    ? `DHA HIE Workflow - ${flow.badgeLabel}`
    : 'DHA HIE Workflow';

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
                provided an intervention code. DHA requires a valid, facility-
                eligible, FEE-FOR-SERVICE intervention on start_visit. Capitation
                and inactive codes are filtered out server-side. */}
            {activeInterventions.length === 0 && !consentInterventionCode && (
              <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <Label htmlFor="ilm-manual-intervention" className="text-xs font-medium text-amber-900 dark:text-amber-100">
                  Select intervention for this visit
                </Label>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Consent didn&apos;t include one. Pick a fee-for-service outpatient intervention your facility is entitled to bill.
                  {facilityLevelKnown ? ` (filtered to KEPH Level ${facilityLevel})` : ''}
                </p>
                {!facilityLevelKnown ? (
                  <p className="text-[11px] text-red-700 dark:text-red-300">
                    Your facility&apos;s KEPH level is not set. Please contact your admin to configure it before selecting an intervention.
                  </p>
                ) : (
                  <>
                    <Select value={manualInterventionCode} onValueChange={setManualInterventionCode}>
                      <SelectTrigger id="ilm-manual-intervention" className="bg-background">
                        <SelectValue placeholder={outpatientOptions.length > 0 ? 'Choose an intervention…' : 'Loading eligible interventions…'} />
                      </SelectTrigger>
                      <SelectContent>
                        {outpatientOptions.map((opt) => (
                          <SelectItem key={opt.code} value={opt.code}>
                            <span className="font-mono text-xs">{opt.code}</span>
                            {' — '}
                            {opt.name}
                            {opt.category ? ` · ${opt.category}` : ''}
                            {opt.schemes && opt.schemes.length > 0 ? ` · ${opt.schemes.join(', ')}` : ''}
                            {opt.price ? ` · KES ${Number(opt.price).toLocaleString()}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {outpatientOptions.length === 0 && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        No fee-for-service outpatient interventions found for a Level {facilityLevel} facility.
                        Basic outpatient (SHA-12) is paid via capitation and cannot be billed per visit.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* OTP / auth GUID input — only shown if not auto-populated */}
            {requiresConsent && !startAuthGuid && (
              <div className="space-y-2">
                {busy === 'startVisit' && consentCredential?.otp ? (
                  /* Auto-open in progress — show clean loading state */
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
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor="ilm-start-otp" className="text-xs">
                        OTP from patient
                        {consentCredential?.otp && (
                          <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                            · auto-filled from consent
                          </span>
                        )}
                      </Label>
                      <Input
                        id="ilm-start-otp"
                        value={startOtp}
                        onChange={(e) => setStartOtp(e.target.value)}
                        placeholder="Enter OTP received by patient"
                      />
                    </div>
                    {/* When OTP is entered: show "Open visit" (validates OTP + starts visit in one DHA call) */}
                    {/* When OTP is empty: show "Send/Resend OTP" to get a fresh code */}
                    {startOtp ? (
                      <Button
                        onClick={openVisit}
                        disabled={!canAttemptVisit || busy !== null}
                        className="w-full sm:w-auto"
                      >
                        {busy === 'startVisit' ? (
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
                      title="Send a fresh OTP to the patient's phone"
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
              )}
              {!startOtp && (
                  <p className="text-[11px] text-muted-foreground">
                    Ask the patient for the OTP sent to their phone. If they didn&apos;t receive it or it expired, click &quot;Send OTP&quot;.
                  </p>
                )}
              </div>
            )}

            {/* Biometric path — no OTP input, just the action button */}
            {startAuthGuid && (
              <Button onClick={openVisit} disabled={!canOpenVisit || busy !== null}>
                {busy === 'startVisit' ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Play className="mr-2 h-3 w-3" />
                )}
                Open visit (biometric)
              </Button>
            )}

            {/* Emergency (ECCIF) — no consent required */}
            {!requiresConsent && (
              <Button onClick={openVisit} disabled={!canOpenVisit || busy !== null}>
                {busy === 'startVisit' ? (
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
                Overview tab.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddInterventionOpen(true)}
                  disabled={busy !== null}
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

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={preview} disabled={busy !== null}>
                {busy === 'preview' ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3 w-3" />
                )}
                Preview claim
              </Button>
            </div>

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
                invoiceNumber={invoiceNumber}
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
      <Dialog open={addInterventionOpen} onOpenChange={setAddInterventionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add intervention</DialogTitle>
            <DialogDescription>
              Append an intervention to this visit at DHA.
              {useVirtualLine && ' Submitted as a PHC virtual claim line.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Intervention
              </Label>
              <Popover open={interventionComboboxOpen} onOpenChange={setInterventionComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-mono text-xs h-9"
                  >
                    {newInterventionCode
                      ? (() => {
                          const opt = outpatientOptions.find((o) => o.code === newInterventionCode);
                          return opt
                            ? `${opt.code} — ${opt.name}${opt.price ? ` · KES ${Number(opt.price).toLocaleString()}` : ''}`
                            : newInterventionCode;
                        })()
                      : 'Select intervention…'}
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command filter={(value, search) => {
                    const opt = outpatientOptions.find((o) => o.code === value);
                    if (!opt) return 0;
                    const haystack = `${opt.code} ${opt.name} ${opt.category ?? ''}`.toLowerCase();
                    return haystack.includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Search by code or name…" className="h-9" />
                    <CommandList>
                      <CommandEmpty>No matching intervention found.</CommandEmpty>
                      <CommandGroup>
                        {outpatientOptions.map((opt) => (
                          <CommandItem
                            key={opt.code}
                            value={opt.code}
                            onSelect={(value) => {
                              setNewInterventionCode(value.toUpperCase());
                              setInterventionComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-3 w-3 ${newInterventionCode === opt.code ? 'opacity-100' : 'opacity-0'}`}
                            />
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{opt.code}</span>
                              <span className="text-xs text-muted-foreground">
                                {opt.name}
                                {opt.category ? ` · ${opt.category}` : ''}
                                {opt.price ? ` · KES ${Number(opt.price).toLocaleString()}` : ''}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <CombinationGuard
              newCode={newInterventionCode}
              existing={interventionCodes}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddInterventionOpen(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
            <Button onClick={addIntervention} disabled={!newInterventionCode || busy !== null}>
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
  invoiceNumber: string;
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
  busy: ActionKey | null;
  onRequestFreshOtp: () => Promise<void>;
  onSubmit: () => Promise<void>;
}

function OutpatientSubmitBlock(props: OutpatientSubmitBlockProps) {
  const {
    invoiceNumber,
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
    busy,
    onRequestFreshOtp,
    onSubmit,
  } = props;

  const missing: string[] = [];
  if (!invoiceNumber) missing.push('invoice number');
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
            Invoice {invoiceNumber} · biometric consent on file.
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
          Invoice {invoiceNumber} · discharge consent required.
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
        <Button onClick={onSubmit} disabled={busy !== null || !dischargeOtp} size="sm">
          {busy === 'submit' ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Send className="mr-2 h-3 w-3" />
          )}
          Submit claim
        </Button>
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
