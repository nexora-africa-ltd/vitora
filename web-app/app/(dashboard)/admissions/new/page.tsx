'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Save, X, AlertCircle, User, UserPlus, AlertTriangle, Sparkles, ChevronDown, CheckCircle2, Bed, Stethoscope, Shield, CreditCard, Baby } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { VisibilityToggle } from '@/components/shared/visibility-toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
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
import { useUser } from '@/lib/auth';
import {
  useBeds,
  useRecommendBed,
  useSmartRecommendBed,
  useCreateAdmission,
  useInpatientWards,
  useCheckWardCompatibility,
  useGenerateWardBeds,
  useRecommendWard,
  useAdmissionRecommendations,
} from '@/lib/hooks/use-inpatient';
import { useEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { useEncounters } from '@/lib/hooks/use-encounters';
import { usePatient } from '@/lib/hooks/use-patients';
import { emptyDiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { MultiDiagnosisInput, type DiagnosisEntry } from '@/components/shared/multi-diagnosis-input';
import { BedRecommendationCard, CompatibilityOverrideDialog, BedSelectionGrid } from '@/components/inpatient';
import { getApiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type {
  CompatibilityViolation,
  CompatibilityCheckResult,
  SmartAdmissionType,
  AdmissionRecommendation,
} from '@/lib/types/inpatient';
import type { Encounter } from '@/lib/types/encounter';
import { useMCHRegistrations } from '@/lib/hooks/use-mch';
import type { MCHRegistrationListItem } from '@/lib/types/mch';

type BedAssignmentStrategy = 'SMART' | 'RULES' | 'MANUAL';

export default function NewAdmissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();

  // URL params
  const patientIdParam = searchParams.get('patient');
  const encounterIdParam = searchParams.get('encounter');
  const initialMchRegistrationParam = searchParams.get('mch_registration');
  const patientId = patientIdParam ? Number(patientIdParam) : null;
  const encounterId = encounterIdParam ? Number(encounterIdParam) : null;

  // Patient selection dialog state
  const [showPatientDialog, setShowPatientDialog] = useState(false);

  // Show dialog on mount if no patient selected
  useEffect(() => {
    if (!patientId) {
      setShowPatientDialog(true);
    }
  }, [patientId]);

  // Fetch patient details if patient ID is provided
  const { data: patientData } = usePatient(patientId || 0);

  // Form state
  const [wardId, setWardId] = useState<string>('');
  const [bedId, setBedId] = useState<string>('');
  const [wardAssignmentMode, setWardAssignmentMode] = useState<'auto' | 'manual'>('auto');
  const [assignmentStrategy, setAssignmentStrategy] = useState<BedAssignmentStrategy>('SMART');
  const [admissionType, setAdmissionType] = useState<SmartAdmissionType>('ELECTIVE');
  const [requiresIsolation, setRequiresIsolation] = useState(false);
  const [requiresOxygen, setRequiresOxygen] = useState(false);
  const [requiresVentilator, setRequiresVentilator] = useState(false);
  const [payerType, setPayerType] = useState<'CASH' | 'SHA' | 'CORPORATE'>('CASH');
  const [mchRegistrationId, setMchRegistrationId] = useState(initialMchRegistrationParam || '');
  const [mchManualMode, setMchManualMode] = useState(false);
  const [mchManualSearch, setMchManualSearch] = useState('');

  // Diagnosis state (multi-diagnosis)
  const [diagnosisEntries, setDiagnosisEntries] = useState<DiagnosisEntry[]>([]);
  const [diagnosisPrefilled, setDiagnosisPrefilled] = useState(false);

  // Fetch encounter data if encounterId provided (for prefilling diagnosis)
  const { data: encounter } = useEncounter(encounterId || 0);
  const { data: encounterDiagnoses } = useEncounterDiagnoses(encounterId || 0);

  // Pending admissions: recommendations + IPD encounters without admissions
  const { data: pendingRecsResponse } = useAdmissionRecommendations({ status: 'PENDING', page_size: 10 });
  const { data: ipdEncountersResponse } = useEncounters({ encounter_type: 'IPD', status: 'IN_PROGRESS', page_size: 10 });
  const pendingRecs: AdmissionRecommendation[] = useMemo(
    () => (pendingRecsResponse as any)?.results ?? [],
    [pendingRecsResponse]
  );
  const ipdEncounters: Encounter[] = useMemo(
    () => (ipdEncountersResponse as any)?.results ?? [],
    [ipdEncountersResponse]
  );
  const hasPendingItems = pendingRecs.length > 0 || ipdEncounters.length > 0;

  // Fetch wards and beds
  const { data: wards } = useInpatientWards();
  const selectedWardId = useMemo(() => (wardId ? Number(wardId) : undefined), [wardId]);
  // Fetch all beds for the ward (not just available) so users see full occupancy
  const { data: beds } = useBeds({ ward: selectedWardId });
  const createAdmission = useCreateAdmission();
  const recommendBed = useRecommendBed();
  const smartRecommendBed = useSmartRecommendBed();
  const wardRecommendation = useRecommendWard();
  const generateBeds = useGenerateWardBeds();

  // Get selected ward's capacity from wards list
  const selectedWardCapacity = useMemo(() => {
    const wardsList = (wards as any)?.results ?? wards ?? [];
    const ward = wardsList.find((w: any) => String(w.id) === wardId);
    return ward?.capacity || 0;
  }, [wards, wardId]);
  const selectedWard = useMemo(() => {
    const wardsList = (wards as any)?.results ?? wards ?? [];
    return wardsList.find((w: any) => String(w.id) === wardId) ?? null;
  }, [wards, wardId]);
  const isMaternityWard = selectedWard?.ward_type === 'MATERNITY';

  // --- MCH registration linking (must come after isMaternityWard) ---
  // Fetch active MCH registrations for the selected patient
  const { data: mchRegistrationsResponse, isLoading: mchLoading } = useMCHRegistrations(
    { mother: patientId ?? undefined, status: 'ACTIVE' as any, page_size: 20 },
    !!patientId && isMaternityWard
  );
  const mchRegistrations: MCHRegistrationListItem[] = useMemo(
    () => mchRegistrationsResponse?.results ?? [],
    [mchRegistrationsResponse]
  );

  // Search by MCH number when in manual mode
  const { data: mchSearchResponse } = useMCHRegistrations(
    { search: mchManualSearch, page_size: 10 },
    mchManualMode && mchManualSearch.length >= 3
  );
  const mchSearchResults: MCHRegistrationListItem[] = useMemo(
    () => mchSearchResponse?.results ?? [],
    [mchSearchResponse]
  );

  // Auto-select when there's exactly one active MCH registration
  useEffect(() => {
    if (!isMaternityWard || mchManualMode) return;
    const single = mchRegistrations.length === 1 ? mchRegistrations[0] : undefined;
    if (single && !mchRegistrationId) {
      setMchRegistrationId(String(single.id));
    }
  }, [mchRegistrations, isMaternityWard, mchManualMode, mchRegistrationId]);

  // Clear MCH selection when ward changes away from maternity
  useEffect(() => {
    if (!isMaternityWard) {
      setMchRegistrationId('');
      setMchManualMode(false);
      setMchManualSearch('');
    }
  }, [isMaternityWard]);

  // Resolve the selected MCH registration data from the lists
  const mchRegistrationData: MCHRegistrationListItem | undefined = useMemo(() => {
    if (!mchRegistrationId) return undefined;
    const id = Number(mchRegistrationId);
    return mchRegistrations.find((r) => r.id === id)
      ?? mchSearchResults.find((r) => r.id === id);
  }, [mchRegistrationId, mchRegistrations, mchSearchResults]);

  const mchRegistrationMatchesPatient = !mchRegistrationData || !patientId || mchRegistrationData.mother === patientId;

  // Show toast on generate beds success/error
  useEffect(() => {
    if (generateBeds.isSuccess && generateBeds.data) {
      toast.success(`Generated ${generateBeds.data.created} beds for this ward`);
    }
    if (generateBeds.isError) {
      toast.error('Failed to generate beds. Please try again or contact admin.');
    }
  }, [generateBeds.isSuccess, generateBeds.isError, generateBeds.data]);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Compatibility state
  const [compatibilityViolations, setCompatibilityViolations] = useState<CompatibilityViolation[]>([]);
  const [compatibilityResult, setCompatibilityResult] = useState<CompatibilityCheckResult | null>(null);
  const [showCompatibilityDialog, setShowCompatibilityDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);
  const checkCompatibility = useCheckWardCompatibility();

  // Selected ward name for dialog
  const selectedWardName = useMemo(() => {
    const wardsList = (wards as any)?.results ?? wards ?? [];
    const ward = wardsList.find((w: any) => String(w.id) === wardId);
    return ward?.name || '';
  }, [wards, wardId]);

  // Handle ward selection with compatibility check
  const handleWardChange = useCallback((newWardId: string) => {
    setWardId(newWardId);
    setBedId('');
    setCompatibilityViolations([]);
    setCompatibilityResult(null);
    setOverrideReason(null);
    recommendBed.reset();
    smartRecommendBed.reset();
  }, [recommendBed, smartRecommendBed]);

  // Handle compatibility override
  const handleCompatibilityOverride = useCallback((reason: string) => {
    setOverrideReason(reason);
    setShowCompatibilityDialog(false);
  }, []);

  // Handle selecting different ward from dialog
  const handleSelectDifferentWard = useCallback(() => {
    setWardId('');
    setBedId('');
    setCompatibilityViolations([]);
    setCompatibilityResult(null);
    recommendBed.reset();
    smartRecommendBed.reset();
  }, [recommendBed, smartRecommendBed]);

  // Auto-trigger ward recommendation when patient is available
  const [wardRecommendationData, setWardRecommendationData] = useState<typeof wardRecommendation.data>(undefined);
  const [wardRecommendationLoading, setWardRecommendationLoading] = useState(false);
  const [wardRecommendationError, setWardRecommendationError] = useState(false);
  const [hasRunWardRecommendation, setHasRunWardRecommendation] = useState(false);
  const [showIncompatibleWards, setShowIncompatibleWards] = useState(false);

  useEffect(() => {
    if (!patientId || wardAssignmentMode !== 'auto') {
      return;
    }

    const isRetrigger = hasRunWardRecommendation;
    let isCancelled = false;
    setWardRecommendationLoading(true);
    setWardRecommendationError(false);
    setWardRecommendationData(undefined);

    wardRecommendation.mutateAsync({
      patient_id: patientId,
      requires_isolation: requiresIsolation,
      requires_oxygen: requiresOxygen,
      requires_ventilator: requiresVentilator,
      admission_type: admissionType,
    }).then((result) => {
      if (!isCancelled) {
        setWardRecommendationData(result);
        setWardRecommendationLoading(false);
        setHasRunWardRecommendation(true);

        if (isRetrigger) {
          if (result.success) {
            toast.info(`Ward recommendation updated — ${result.recommended_ward_name}`, {
              description: `${result.ranked_wards.length} compatible ward${result.ranked_wards.length !== 1 ? 's' : ''}, ${result.incompatible_wards.length} excluded`,
            });
          } else {
            toast.warning('No compatible wards match the updated requirements');
          }
        }
      }
    }).catch(() => {
      if (!isCancelled) {
        setWardRecommendationError(true);
        setWardRecommendationLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, wardAssignmentMode, requiresIsolation, requiresOxygen, requiresVentilator, admissionType]);

  // Auto-select the top recommended ward
  useEffect(() => {
    if (
      wardAssignmentMode !== 'auto' ||
      !wardRecommendationData?.success ||
      !wardRecommendationData.recommended_ward_id
    ) {
      return;
    }
    const recommendedId = String(wardRecommendationData.recommended_ward_id);
    if (wardId !== recommendedId) {
      handleWardChange(recommendedId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardRecommendationData, wardAssignmentMode]);

  useEffect(() => {
    if (!patientId || !selectedWardId) {
      return;
    }

    let isCancelled = false;

    setCompatibilityViolations([]);
    setCompatibilityResult(null);
    setOverrideReason(null);

    checkCompatibility.mutateAsync({
      wardId: selectedWardId,
      patientId,
      requiresIsolation,
      requiresOxygen,
      requiresVentilator,
    }).then((result) => {
      if (isCancelled) {
        return;
      }

      setCompatibilityResult(result);

      if (!result.compatible && result.violations?.length > 0) {
        setCompatibilityViolations(result.violations);
        setShowCompatibilityDialog(true);
      }
    }).catch(() => {
      if (!isCancelled) {
        console.warn('Compatibility check failed, allowing admission');
        setCompatibilityResult(null);
      }
    });

    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, selectedWardId, requiresIsolation, requiresOxygen, requiresVentilator]);

  useEffect(() => {
    if (!patientId || !selectedWardId || assignmentStrategy === 'MANUAL') {
      return;
    }

    const payload = {
      patient_id: patientId,
      requires_isolation: requiresIsolation || undefined,
      requires_oxygen: requiresOxygen || undefined,
      requires_ventilator: requiresVentilator || undefined,
      admission_type: admissionType,
    };

    if (assignmentStrategy === 'SMART') {
      recommendBed.reset();
      smartRecommendBed.mutate({ wardId: selectedWardId, data: payload });
      return;
    }

    smartRecommendBed.reset();
    recommendBed.mutate({ wardId: selectedWardId, data: payload });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    patientId,
    selectedWardId,
    assignmentStrategy,
    admissionType,
    requiresIsolation,
    requiresOxygen,
    requiresVentilator,
  ]);

  // Prefill diagnoses from encounter diagnoses
  useEffect(() => {
    if (encounterDiagnoses && !diagnosisPrefilled) {
      const entries: DiagnosisEntry[] = [];
      for (const d of encounterDiagnoses) {
        const role = d.diagnosis_type === 'PRIMARY' ? 'PRIMARY' as const : 'SECONDARY' as const;
        let code: DiagnosisCodeValue = emptyDiagnosisCodeValue();
        if (d.icd11_code) {
          code = { ...code, icd11Code: d.icd11_code, icd11Display: `${d.icd11_code} - ${d.icd11_display || d.free_text_diagnosis || ''}` };
        } else if (d.icd10_code || d.icd10_display) {
          const display = d.icd10_display || '';
          const codeStr = display.split(' - ')[0] || String(d.icd10_code || '');
          const text = display.split(' - ').slice(1).join(' - ') || d.free_text_diagnosis || '';
          code = { ...code, icd10Code: d.icd10_code || null, icd10Display: `${codeStr} - ${text}` };
        } else if (d.free_text_diagnosis) {
          code = { ...code, icd10Display: d.free_text_diagnosis };
        }
        entries.push({ role, code });
      }
      // Ensure at least the primary exists
      if (entries.length === 0) {
        const primary = encounterDiagnoses.find((d: any) => d.diagnosis_type === 'PRIMARY') || encounterDiagnoses[0];
        if (primary) {
          let code: DiagnosisCodeValue = emptyDiagnosisCodeValue();
          if (primary.icd11_code) {
            code = { ...code, icd11Code: primary.icd11_code, icd11Display: `${primary.icd11_code} - ${primary.icd11_display || primary.free_text_diagnosis || ''}` };
          } else if (primary.free_text_diagnosis) {
            code = { ...code, icd10Display: primary.free_text_diagnosis };
          }
          entries.push({ role: 'PRIMARY', code });
        }
      }
      if (entries.length > 0) {
        setDiagnosisEntries(entries);
        setDiagnosisPrefilled(true);
      }
    }
  }, [encounterDiagnoses, diagnosisPrefilled]);

  // Computed values
  // Extract primary diagnosis from multi-diagnosis entries
  const primaryEntry = diagnosisEntries.find((e) => e.role === 'PRIMARY');
  const primaryDiagnosisValue = primaryEntry?.code ?? emptyDiagnosisCodeValue();
  const hasDiagnosis = !!(primaryDiagnosisValue.icd11Code || primaryDiagnosisValue.icd10Code || primaryDiagnosisValue.icd10Display || primaryDiagnosisValue.snomedCode);
  const hasRequiredMaternityContext = !isMaternityWard || (!!mchRegistrationId && mchRegistrationMatchesPatient);

  // With autoAssignBed, bed selection is not required (handled by backend)
  const recommendedBedId = useMemo(() => {
    if (assignmentStrategy === 'MANUAL') {
      return bedId ? Number(bedId) : null;
    }

    const recommendation = assignmentStrategy === 'SMART'
      ? smartRecommendBed.data
      : recommendBed.data;

    return recommendation?.success && recommendation.assigned_bed_id
      ? recommendation.assigned_bed_id
      : null;
  }, [assignmentStrategy, bedId, smartRecommendBed.data, recommendBed.data]);

  const canSubmit = !!patientId
    && !!wardId
    && !!recommendedBedId
    && hasDiagnosis
    && !!user
    && hasRequiredMaternityContext;

  const admittingDiagnosis = primaryDiagnosisValue.icd11Code
    || primaryDiagnosisValue.icd10Display?.split(' - ')[0]
    || primaryDiagnosisValue.snomedCode
    || '';

  const admittingDiagnosisText = primaryDiagnosisValue.icd11Display?.split(' - ').slice(1).join(' - ')
    || primaryDiagnosisValue.icd10Display?.split(' - ').slice(1).join(' - ')
    || primaryDiagnosisValue.snomedDisplay
    || '';

  const secondaryDiagnoses = diagnosisEntries.filter((e) => e.role !== 'PRIMARY');

  // Resolve the selected bed number for the confirmation dialog
  const selectedBedNumber = useMemo(() => {
    if (assignmentStrategy === 'MANUAL') {
      const bedsList = Array.isArray(beds) ? beds : beds?.results ?? [];
      const bed = bedsList.find((b: any) => String(b.id) === bedId);
      return bed?.bed_number || `Bed #${bedId}`;
    }
    const recommendation = assignmentStrategy === 'SMART' ? smartRecommendBed.data : recommendBed.data;
    return recommendation?.assigned_bed_number || (recommendedBedId ? `Bed #${recommendedBedId}` : '');
  }, [assignmentStrategy, beds, bedId, smartRecommendBed.data, recommendBed.data, recommendedBedId]);

  const handleSubmitAdmission = async () => {
    if (!patientId || !user || !recommendedBedId) return;
    const admissionDate = new Date().toISOString();

    try {
      await createAdmission.mutateAsync({
        patient: patientId,
        ward: Number(wardId),
        ...(mchRegistrationId ? { mch_registration: Number(mchRegistrationId) } : {}),
        bed: recommendedBedId,
        payer_type: payerType,
        admission_date: admissionDate,
        admitting_diagnosis: admittingDiagnosis,
        admitting_diagnosis_text: admittingDiagnosisText,
        admitting_officer: user.id,
        source_encounter: encounterId || undefined,
        ...(requiresIsolation ? { requires_isolation: true } : {}),
        ...(overrideReason && {
          constraint_override: true,
          constraint_override_reason: overrideReason,
          constraint_violations: compatibilityViolations.map((v) => v.message),
        }),
      });

      setShowConfirmDialog(false);
      toast.success('Admission created successfully');
      router.push('/admissions');
    } catch (err) {
      const message = getApiErrorMessage(err);
      toast.error('Failed to create admission', { description: message });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="New Admission"
        helpContent="Create an inpatient admission record. Select a patient, ward, and bed to admit."
      />

      {/* Encounter context banner */}
      {encounterId && encounter && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Creating admission from OPD Encounter #{encounterId}.
            {encounter.chief_complaint && ` Chief complaint: ${encounter.chief_complaint}`}
          </AlertDescription>
        </Alert>
      )}

      {/* Pending Recommendations / IPD Encounters Panel */}
      {!encounterId && hasPendingItems && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Pending Admissions
            </CardTitle>
            <CardDescription>
              Select a recommendation or IPD encounter to prefill the admission form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-y-auto">
            {pendingRecs.map((rec) => (
              <button
                key={`rec-${rec.id}`}
                type="button"
                className="w-full flex items-center justify-between gap-3 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (rec.patient_id) params.set('patient', String(rec.patient_id));
                  if (rec.encounter) params.set('encounter', String(rec.encounter));
                  router.push(`/admissions/new?${params.toString()}`);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{rec.patient_name || `Patient #${rec.patient_id}`}</span>
                    {rec.patient_mrn && <Badge variant="outline" className="text-xs shrink-0">{rec.patient_mrn}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {rec.provisional_diagnosis_text || rec.provisional_diagnosis} — {rec.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      rec.urgency === 'EMERGENCY'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        : rec.urgency === 'URGENT'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                    }`}
                  >
                    {rec.urgency}
                  </Badge>
                  <Badge variant="outline" className="text-xs">Recommendation</Badge>
                </div>
              </button>
            ))}
            {ipdEncounters.map((enc) => (
              <button
                key={`enc-${enc.id}`}
                type="button"
                className="w-full flex items-center justify-between gap-3 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('patient', String(enc.patient));
                  params.set('encounter', String(enc.id));
                  router.push(`/admissions/new?${params.toString()}`);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{enc.patient_name || `Patient #${enc.patient}`}</span>
                    {enc.patient_mrn && <Badge variant="outline" className="text-xs shrink-0">{enc.patient_mrn}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    IPD Encounter — {enc.chief_complaint || 'No complaint recorded'}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">IPD Encounter</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Details</CardTitle>
          <CardDescription>Enter the patient and ward information for this admission</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Patient Selection */}
          <div className="space-y-2">
            <Label>Patient</Label>
            {patientId && patientData ? (
              <div className="flex flex-col gap-3 p-3 rounded-md border bg-muted/50 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {patientData.first_name} {patientData.last_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                      <span className="truncate">MRN: {patientData.mrn}</span>
                      <span className="hidden xs:inline">•</span>
                      <span>ID: {patientId}</span>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto shrink-0"
                  onClick={() => router.push(`/patients?select=true&returnTo=/admissions/new`)}
                  data-testid="change-patient-button"
                >
                  <span className="sm:hidden">Change</span>
                  <span className="hidden sm:inline">Change Patient</span>
                </Button>
              </div>
            ) : patientId ? (
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-3 rounded-md border border-dashed sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-muted">
                    <UserPlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">No patient selected</p>
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="w-full sm:w-auto shrink-0"
                  onClick={() => router.push(`/patients?select=true&returnTo=/admissions/new`)}
                  data-testid="select-patient-button"
                >
                  Select Patient
                </Button>
              </div>
            )}
          </div>

          {/* Ward Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label>Ward placement</Label>
                <HelpPopover content="Smart assignment evaluates all wards for compatibility, workload, occupancy, and patient needs, then auto-selects the best option. Switch to manual to pick a specific ward." />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={wardAssignmentMode === 'auto' ? 'default' : 'outline'} className="text-xs">
                  {wardAssignmentMode === 'auto' ? 'Smart' : 'Manual'}
                </Badge>
                <Switch
                  checked={wardAssignmentMode === 'auto'}
                  onCheckedChange={(checked) => {
                    setWardAssignmentMode(checked ? 'auto' : 'manual');
                    if (checked) {
                      // Switching back to auto — clear manual selection and re-trigger
                      setWardId('');
                      setBedId('');
                      setWardRecommendationData(undefined);
                      setWardRecommendationError(false);
                      wardRecommendation.reset();
                    }
                  }}
                />
              </div>
            </div>

            {wardAssignmentMode === 'auto' ? (
              <div className="space-y-2">
                {/* Loading state */}
                {wardRecommendationLoading && (
                  <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                      <p className="text-sm text-muted-foreground">Evaluating wards for best placement...</p>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full rounded-md" />
                      <Skeleton className="h-10 w-full rounded-md" />
                      <Skeleton className="h-10 w-3/4 rounded-md" />
                    </div>
                  </div>
                )}

                {/* Recommendation results */}
                {!wardRecommendationLoading && wardRecommendationData && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">
                          {wardRecommendationData.success
                            ? `Recommended: ${wardRecommendationData.recommended_ward_name}`
                            : 'No compatible ward found'}
                        </p>
                        <HelpPopover content="Wards are ranked by a composite score: availability (30%), occupancy (20%), demographic affinity — gender, age, ward type, and capability match (20%), diagnosis cohort match (15%), and staff workload balance (15%). Wards that fail hard constraints (equipment requirements) are excluded entirely." />
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {wardRecommendationData.evaluation_time_ms} ms
                      </Badge>
                    </div>
                    {wardRecommendationData.ranked_wards.length > 0 && (
                      <div className="space-y-1">
                        {wardRecommendationData.ranked_wards.slice(0, 3).map((rw, idx) => (
                          <button
                            key={rw.ward_id}
                            type="button"
                            onClick={() => handleWardChange(String(rw.ward_id))}
                            className={cn(
                              'flex w-full items-center justify-between rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent',
                              idx === 0 && 'border-primary/30 bg-primary/5',
                              String(rw.ward_id) === wardId && 'ring-2 ring-primary'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold',
                                idx === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                              )}>
                                {idx + 1}
                              </span>
                              <span className="truncate font-medium">{rw.ward_name}</span>
                              <span className="text-xs text-muted-foreground">{rw.ward_type}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">{rw.available_beds} beds</span>
                              <Badge variant="outline" className="text-xs">Score {rw.score.toFixed(1)}</Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {wardRecommendationData.incompatible_wards.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            {wardRecommendationData.incompatible_wards.length} ward{wardRecommendationData.incompatible_wards.length !== 1 ? 's' : ''} excluded due to constraint violations
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <VisibilityToggle
                                    isVisible={showIncompatibleWards}
                                    onToggle={() => setShowIncompatibleWards((v) => !v)}
                                    label="excluded wards"
                                    size="sm"
                                    className="h-6 w-6"
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                {showIncompatibleWards ? 'Hide' : 'Show'} excluded wards
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {showIncompatibleWards && (
                          <div className="space-y-1">
                            {wardRecommendationData.incompatible_wards.map((iw) => (
                              <div
                                key={iw.ward_id}
                                className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-2 text-sm"
                              >
                                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <span className="font-medium">{iw.ward_name}</span>
                                  <span className="text-xs text-muted-foreground ml-1.5">{iw.ward_type_display || iw.ward_type}</span>
                                  <ul className="mt-0.5 text-xs text-muted-foreground list-disc list-inside">
                                    {iw.violations.map((v, vi) => (
                                      <li key={vi}>{v}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Error state */}
                {wardRecommendationError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm text-destructive">Ward recommendation failed. Switch to manual to select a ward.</p>
                  </div>
                )}

                {/* No patient selected */}
                {!patientId && (
                  <p className="text-xs text-muted-foreground">Select a patient to get a ward recommendation.</p>
                )}
              </div>
            ) : (
              /* Manual ward selection */
              <Select value={wardId} onValueChange={handleWardChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {((wards as any)?.results ?? wards ?? []).map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Compatibility warning indicator */}
            {compatibilityViolations.length > 0 && overrideReason && (
              <div className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {compatibilityViolations.length} compatibility warning{compatibilityViolations.length > 1 ? 's' : ''} (overridden)
                </span>
              </div>
            )}
          </div>

          {isMaternityWard && (
            <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label>MCH Registration *</Label>
                  <HelpPopover content="Maternity admissions must be linked to the pregnancy registration to preserve labour, delivery, and postpartum continuity." />
                </div>
                {!mchManualMode && mchRegistrations.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    onClick={() => setMchManualMode(true)}
                  >
                    Search by MCH number
                  </button>
                )}
                {mchManualMode && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      setMchManualMode(false);
                      setMchManualSearch('');
                      // Re-auto-select if single result
                      if (mchRegistrations.length === 1 && mchRegistrations[0]) {
                        setMchRegistrationId(String(mchRegistrations[0].id));
                      }
                    }}
                  >
                    Back to auto-select
                  </button>
                )}
              </div>

              {/* Loading state */}
              {mchLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-4 w-48" />
                </div>
              )}

              {/* Auto-resolve mode */}
              {!mchManualMode && !mchLoading && (
                <>
                  {/* No registrations found */}
                  {mchRegistrations.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-sm space-y-2">
                      <p className="text-muted-foreground">
                        No active MCH registration found for this patient.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link href={`/mch/registrations/new?patient=${patientId}&returnTo=${encodeURIComponent(`/admissions/new?patient=${patientId}${encounterId ? `&encounter=${encounterId}` : ''}`)}`}>
                            <Baby className="h-3.5 w-3.5 mr-1.5" />
                            Create MCH Registration
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMchManualMode(true)}
                        >
                          Search manually
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Single registration — auto-selected */}
                  {mchRegistrations.length === 1 && mchRegistrationData && (
                    <div className="rounded-md border bg-background/80 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{mchRegistrationData.mch_number}</Badge>
                        <Badge variant="secondary">{mchRegistrationData.status}</Badge>
                        {mchRegistrationData.is_high_risk && (
                          <Badge variant="destructive">High Risk</Badge>
                        )}
                        <Badge variant="outline" className="ml-auto text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Auto-selected
                        </Badge>
                      </div>
                      {mchRegistrationData.edd && (
                        <p className="mt-2 text-muted-foreground">
                          EDD: {mchRegistrationData.edd}
                          {mchRegistrationData.gestation_display && ` • ${mchRegistrationData.gestation_display}`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Multiple registrations — dropdown */}
                  {mchRegistrations.length > 1 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {mchRegistrations.length} active pregnancies found. Select the one for this admission.
                      </p>
                      <Select value={mchRegistrationId} onValueChange={setMchRegistrationId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select MCH registration" />
                        </SelectTrigger>
                        <SelectContent>
                          {mchRegistrations.map((reg) => (
                            <SelectItem key={reg.id} value={String(reg.id)}>
                              {reg.mch_number}
                              {reg.edd ? ` • EDD: ${reg.edd}` : ''}
                              {reg.is_high_risk ? ' • High Risk' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {mchRegistrationData && (
                        <div className="rounded-md border bg-background/80 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{mchRegistrationData.mch_number}</Badge>
                            <Badge variant="secondary">{mchRegistrationData.status}</Badge>
                            {mchRegistrationData.is_high_risk && (
                              <Badge variant="destructive">High Risk</Badge>
                            )}
                          </div>
                          {mchRegistrationData.edd && (
                            <p className="mt-2 text-muted-foreground">
                              EDD: {mchRegistrationData.edd}
                              {mchRegistrationData.gestation_display && ` • ${mchRegistrationData.gestation_display}`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Manual search mode */}
              {mchManualMode && (
                <div className="space-y-2">
                  <Input
                    id="mch-search"
                    value={mchManualSearch}
                    onChange={(e) => setMchManualSearch(e.target.value)}
                    placeholder="Search by MCH number, patient name, or MRN"
                  />
                  {mchManualSearch.length > 0 && mchManualSearch.length < 3 && (
                    <p className="text-xs text-muted-foreground">Type at least 3 characters to search</p>
                  )}
                  {mchSearchResults.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {mchSearchResults.map((reg) => (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => {
                            setMchRegistrationId(String(reg.id));
                            setMchManualSearch('');
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent',
                            String(reg.id) === mchRegistrationId && 'ring-2 ring-primary'
                          )}
                        >
                          <div className="min-w-0">
                            <span className="font-medium">{reg.mch_number}</span>
                            <span className="text-muted-foreground"> • {reg.mother_name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="secondary" className="text-xs">{reg.status}</Badge>
                            {reg.is_high_risk && <Badge variant="destructive" className="text-xs">HR</Badge>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {mchManualSearch.length >= 3 && mchSearchResults.length === 0 && (
                    <p className="text-sm text-muted-foreground">No registrations found matching &ldquo;{mchManualSearch}&rdquo;</p>
                  )}
                  {/* Show selected registration from manual search */}
                  {mchRegistrationData && mchManualMode && (
                    <div className="rounded-md border bg-background/80 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{mchRegistrationData.mch_number}</Badge>
                        <Badge variant="secondary">{mchRegistrationData.status}</Badge>
                        {mchRegistrationData.is_high_risk && (
                          <Badge variant="destructive">High Risk</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-muted-foreground">{mchRegistrationData.mother_name}</p>
                      {mchRegistrationData.edd && (
                        <p className="text-muted-foreground">
                          EDD: {mchRegistrationData.edd}
                          {mchRegistrationData.gestation_display && ` • ${mchRegistrationData.gestation_display}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Patient mismatch warning */}
              {mchRegistrationData && !mchRegistrationMatchesPatient && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This MCH registration belongs to a different patient. Select the matching pregnancy registration before creating the admission.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Bed Assignment Section */}
          {wardId && (
            <div className="space-y-4">
              <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Assignment strategy</Label>
                    <HelpPopover content="Smart recommendation is the default assisted flow. It evaluates workload, emergency buffer, and discharge planning before you create the admission. Rules-based applies ward constraints and scores candidates. Manual lets you pick any available bed directly." />
                  </div>
                  <Select
                    value={assignmentStrategy}
                    onValueChange={(value) => {
                      setAssignmentStrategy(value as BedAssignmentStrategy);
                      setBedId('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignment strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SMART">Smart recommendation (preview)</SelectItem>
                      <SelectItem value="RULES">Rules-based recommendation</SelectItem>
                      <SelectItem value="MANUAL">Manual bed selection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Admission type</Label>
                    <HelpPopover content="Elective admissions are planned in advance. Emergency admissions bypass normal capacity checks. Transfers come from another facility or ward." />
                  </div>
                  <Select value={admissionType} onValueChange={(value) => setAdmissionType(value as SmartAdmissionType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select admission type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ELECTIVE">Elective</SelectItem>
                      <SelectItem value="EMERGENCY">Emergency</SelectItem>
                      <SelectItem value="TRANSFER">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="requires-isolation" className="cursor-pointer text-sm font-medium">Isolation required</Label>
                    <HelpPopover content="Filters for isolation-compatible beds and factors infection control into ward scoring." />
                  </div>
                  <Switch id="requires-isolation" checked={requiresIsolation} onCheckedChange={setRequiresIsolation} />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="requires-oxygen" className="cursor-pointer text-sm font-medium">Needs oxygen</Label>
                    <HelpPopover content="Restricts recommendations to beds with oxygen supply so the patient can be safely placed." />
                  </div>
                  <Switch id="requires-oxygen" checked={requiresOxygen} onCheckedChange={setRequiresOxygen} />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="requires-ventilator" className="cursor-pointer text-sm font-medium">Needs ventilator</Label>
                    <HelpPopover content="Prioritises beds and wards that can support mechanical ventilation and advanced respiratory care." />
                  </div>
                  <Switch id="requires-ventilator" checked={requiresVentilator} onCheckedChange={setRequiresVentilator} />
                </div>
              </div>

              {assignmentStrategy === 'MANUAL' ? (
                <BedSelectionGrid
                  beds={(Array.isArray(beds) ? beds : beds?.results ?? [])}
                  selectedBedId={bedId}
                  compatibilityResult={compatibilityResult}
                  onSelectBed={(id) => setBedId(String(id))}
                  isLoading={!beds}
                  disabled={checkCompatibility.isPending}
                  wardCapacity={selectedWardCapacity}
                  onGenerateBeds={selectedWardId ? () => generateBeds.mutate(selectedWardId) : undefined}
                  isGeneratingBeds={generateBeds.isPending}
                />
              ) : (
                <BedRecommendationCard
                  strategy={assignmentStrategy}
                  isLoading={smartRecommendBed.isPending || recommendBed.isPending}
                  smartRecommendation={smartRecommendBed.data}
                  ruleRecommendation={recommendBed.data}
                  onSwitchToManual={() => setAssignmentStrategy('MANUAL')}
                />
              )}
            </div>
          )}

          {/* Admitting Diagnoses */}
          <MultiDiagnosisInput
            value={diagnosisEntries}
            onChange={setDiagnosisEntries}
            label="Admitting Diagnoses"
          />

          {/* Payer Type */}
          <div className="space-y-2">
            <Label>Payer Type</Label>
            <Select value={payerType} onValueChange={(v) => setPayerType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="SHA">SHA Insurance</SelectItem>
                <SelectItem value="CORPORATE">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit Button */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 pt-4 border-t">
            <Button
              disabled={!canSubmit || createAdmission.isPending}
              onClick={() => setShowConfirmDialog(true)}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              Review &amp; Admit
            </Button>
            {createAdmission.error && (
              <p className="text-sm text-destructive">{getApiErrorMessage(createAdmission.error)}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Patient Selection Required Dialog */}
      <Dialog open={showPatientDialog} onOpenChange={setShowPatientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient Required</DialogTitle>
            <DialogDescription>
              You need to select a patient before creating an admission. Would you like to select a patient now?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowPatientDialog(false)}
              data-testid="continue-without-patient"
              className="w-full sm:w-auto"
            >
              <span className="sm:hidden">Continue</span>
              <span className="hidden sm:inline">Continue Without Patient</span>
            </Button>
            <Button
              onClick={() => {
                setShowPatientDialog(false);
                router.push('/patients?select=true&returnTo=/admissions/new');
              }}
              data-testid="select-patient-dialog-button"
              className="w-full sm:w-auto"
            >
              <User className="h-4 w-4 mr-2" />
              Select Patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admission Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Confirm Admission</DialogTitle>
              <HelpPopover content="Review the admission details carefully before confirming. This will create an active admission record and assign the bed to this patient." />
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Patient */}
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-primary/10 mt-0.5">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Patient</p>
                <p className="font-medium">
                  {patientData ? `${patientData.first_name} ${patientData.last_name}` : `Patient #${patientId}`}
                </p>
                {patientData?.mrn && (
                  <p className="text-sm text-muted-foreground">MRN: {patientData.mrn}</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Ward & Bed */}
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-primary/10 mt-0.5">
                <Bed className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Ward &amp; Bed</p>
                <p className="font-medium">{selectedWardName || `Ward #${wardId}`}</p>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>{selectedBedNumber}</span>
                  {assignmentStrategy !== 'MANUAL' && (
                    <Badge variant="outline" className="text-xs">
                      {assignmentStrategy === 'SMART' ? 'Smart' : 'Rules'}-assigned
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Diagnosis */}
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-primary/10 mt-0.5">
                <Stethoscope className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Admitting Diagnoses</p>
                <p className="font-medium">{admittingDiagnosis}</p>
                {admittingDiagnosisText && (
                  <p className="text-sm text-muted-foreground">{admittingDiagnosisText}</p>
                )}
                {secondaryDiagnoses.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {secondaryDiagnoses.map((entry, idx) => {
                      const code = entry.code.icd11Code || entry.code.icd10Display?.split(' - ')[0] || entry.code.snomedCode || '';
                      const text = entry.code.icd11Display?.split(' - ').slice(1).join(' - ')
                        || entry.code.icd10Display?.split(' - ').slice(1).join(' - ')
                        || entry.code.snomedDisplay || '';
                      return (
                        <p key={idx} className="text-sm text-muted-foreground">
                          <Badge variant="outline" className="text-xs mr-1.5">{entry.role}</Badge>
                          {code}{text ? ` — ${text}` : ''}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Admission details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Admission Type</p>
                <p className="font-medium">{admissionType}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Payer</p>
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="font-medium">{payerType}</p>
                </div>
              </div>
              {encounterId && (
                <div>
                  <p className="text-muted-foreground">Source Encounter</p>
                  <p className="font-medium">#{encounterId}</p>
                </div>
              )}
            </div>

            {/* Special requirements */}
            {(requiresIsolation || requiresOxygen || requiresVentilator) && (
              <>
                <Separator />
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-amber-100 dark:bg-amber-950/50 mt-0.5">
                    <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Special Requirements</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {requiresIsolation && <Badge variant="secondary">Isolation</Badge>}
                      {requiresOxygen && <Badge variant="secondary">Oxygen</Badge>}
                      {requiresVentilator && <Badge variant="secondary">Ventilator</Badge>}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* MCH Registration (maternity) */}
            {isMaternityWard && mchRegistrationData && (
              <>
                <Separator />
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-pink-100 dark:bg-pink-950/50 mt-0.5">
                    <Baby className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">MCH Registration</p>
                    <p className="font-medium">{mchRegistrationData.mch_number}</p>
                    {mchRegistrationData.edd && (
                      <p className="text-sm text-muted-foreground">
                        EDD: {mchRegistrationData.edd}
                        {mchRegistrationData.gestation_display && ` • ${mchRegistrationData.gestation_display}`}
                      </p>
                    )}
                    {mchRegistrationData.is_high_risk && (
                      <Badge variant="destructive" className="mt-1">High Risk</Badge>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Compatibility override warning */}
            {overrideReason && compatibilityViolations.length > 0 && (
              <>
                <Separator />
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {compatibilityViolations.length} compatibility warning{compatibilityViolations.length > 1 ? 's' : ''} overridden.
                    Reason: {overrideReason}
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={createAdmission.isPending}
              className="w-full sm:w-auto"
            >
              Back to Edit
            </Button>
            <Button
              onClick={handleSubmitAdmission}
              disabled={createAdmission.isPending}
              className="w-full sm:w-auto"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {createAdmission.isPending ? 'Creating...' : 'Confirm Admission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compatibility Override Dialog */}
      <CompatibilityOverrideDialog
        open={showCompatibilityDialog}
        onOpenChange={setShowCompatibilityDialog}
        violations={compatibilityViolations}
        wardName={selectedWardName}
        patientName={patientData ? `${patientData.first_name} ${patientData.last_name}` : undefined}
        onOverride={handleCompatibilityOverride}
        onSelectDifferent={handleSelectDifferentWard}
        isSubmitting={checkCompatibility.isPending}
      />
    </div>
  );
}
