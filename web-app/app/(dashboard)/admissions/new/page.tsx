'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Save, X, AlertCircle, User, UserPlus, AlertTriangle, Sparkles, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
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
} from '@/lib/hooks/use-inpatient';
import { useEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { usePatient } from '@/lib/hooks/use-patients';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { BedRecommendationCard, CompatibilityOverrideDialog, BedSelectionGrid } from '@/components/inpatient';
import { getApiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type {
  CompatibilityViolation,
  CompatibilityCheckResult,
  SmartAdmissionType,
} from '@/lib/types/inpatient';
import { useMCHRegistration } from '@/lib/hooks/use-mch';

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
  const selectedMchRegistrationId = useMemo(
    () => (mchRegistrationId ? Number(mchRegistrationId) : undefined),
    [mchRegistrationId]
  );
  const { data: mchRegistrationData } = useMCHRegistration(selectedMchRegistrationId);

  // Diagnosis state
  const [diagnosisValue, setDiagnosisValue] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());
  const [diagnosisPrefilled, setDiagnosisPrefilled] = useState(false);

  // Fetch encounter data if encounterId provided (for prefilling diagnosis)
  const { data: encounter } = useEncounter(encounterId || 0);
  const { data: encounterDiagnoses } = useEncounterDiagnoses(encounterId || 0);

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

  // Prefill diagnosis from encounter's primary diagnosis
  useEffect(() => {
    if (encounterDiagnoses && !diagnosisPrefilled) {
      // Find primary diagnosis or use first one
      const primaryDiagnosis = encounterDiagnoses.find((d: any) => d.diagnosis_type === 'PRIMARY')
        || encounterDiagnoses[0];

      if (primaryDiagnosis) {
        if (primaryDiagnosis.icd11_code) {
          setDiagnosisValue({
            ...emptyDiagnosisCodeValue(),
            icd11Code: primaryDiagnosis.icd11_code,
            icd11Display: `${primaryDiagnosis.icd11_code} - ${primaryDiagnosis.icd11_display || primaryDiagnosis.free_text_diagnosis || ''}`,
          });
        } else if (primaryDiagnosis.icd10_code || primaryDiagnosis.icd10_display) {
          const display = primaryDiagnosis.icd10_display || '';
          const code = display.split(' - ')[0] || String(primaryDiagnosis.icd10_code || '');
          const text = display.split(' - ').slice(1).join(' - ') || primaryDiagnosis.free_text_diagnosis || '';
          setDiagnosisValue({
            ...emptyDiagnosisCodeValue(),
            icd10Code: primaryDiagnosis.icd10_code || null,
            icd10Display: `${code} - ${text}`,
          });
        } else if (primaryDiagnosis.free_text_diagnosis) {
          setDiagnosisValue({
            ...emptyDiagnosisCodeValue(),
            icd10Display: primaryDiagnosis.free_text_diagnosis,
          });
        }
        setDiagnosisPrefilled(true);
      }
    }
  }, [encounterDiagnoses, diagnosisPrefilled]);

  // Computed values
  const hasDiagnosis = !!(diagnosisValue.icd11Code || diagnosisValue.icd10Code || diagnosisValue.icd10Display || diagnosisValue.snomedCode);
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

  const admittingDiagnosis = diagnosisValue.icd11Code
    || diagnosisValue.icd10Display?.split(' - ')[0]
    || diagnosisValue.snomedCode
    || '';

  const admittingDiagnosisText = diagnosisValue.icd11Display?.split(' - ').slice(1).join(' - ')
    || diagnosisValue.icd10Display?.split(' - ').slice(1).join(' - ')
    || diagnosisValue.snomedDisplay
    || '';

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
                      <p className="text-xs text-muted-foreground">
                        {wardRecommendationData.incompatible_wards.length} ward{wardRecommendationData.incompatible_wards.length !== 1 ? 's' : ''} excluded due to constraint violations
                      </p>
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
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <div className="space-y-1">
                <Label htmlFor="mch-registration">MCH Registration *</Label>
                <p className="text-sm text-muted-foreground">
                  Maternity admissions must be linked to the pregnancy registration to preserve labour, delivery, and postpartum continuity.
                </p>
              </div>
              <Input
                id="mch-registration"
                value={mchRegistrationId}
                onChange={(e) => setMchRegistrationId(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Enter MCH registration ID"
                inputMode="numeric"
              />
              {mchRegistrationData && (
                <div className="rounded-md border bg-background/80 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{mchRegistrationData.mch_number}</Badge>
                    <Badge variant="secondary">{mchRegistrationData.status}</Badge>
                  </div>
                  <p className="mt-2 font-medium">
                    {mchRegistrationData.mother_name}
                  </p>
                  <p className="text-muted-foreground">
                    Registered on {mchRegistrationData.registration_date}
                  </p>
                </div>
              )}
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

          {/* Admitting Diagnosis */}
          <DiagnosisCodeInput
            value={diagnosisValue}
            onChange={setDiagnosisValue}
            label="Admitting Diagnosis"
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
              onClick={async () => {
                if (!patientId || !user) return;
                const admissionDate = new Date().toISOString();
                if (!recommendedBedId) return;

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
                    // Include override info if compatibility was overridden
                    ...(overrideReason && {
                      constraint_override: true,
                      constraint_override_reason: overrideReason,
                      constraint_violations: compatibilityViolations.map((v) => v.message),
                    }),
                  });

                  toast.success('Admission created successfully');
                  router.push('/admissions');
                } catch (err) {
                  const message = getApiErrorMessage(err);
                  toast.error('Failed to create admission', { description: message });
                }
              }}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              {createAdmission.isPending ? 'Creating...' : 'Create Admission'}
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
