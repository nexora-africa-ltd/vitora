'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Save, Search, X, AlertCircle, User, UserPlus, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
} from '@/lib/hooks/use-inpatient';
import { useEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { useICD10Search } from '@/lib/hooks/use-encounter-form';
import { usePatient } from '@/lib/hooks/use-patients';
import { ICD11Select } from '@/components/terminology';
import { BedRecommendationCard, CompatibilityOverrideDialog, BedSelectionGrid } from '@/components/inpatient';
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
  const [useICD11, setUseICD11] = useState(true); // Default to ICD-11 (SHA standard)
  const [icd10Code, setIcd10Code] = useState('');
  const [icd10Text, setIcd10Text] = useState('');
  const [icd11Value, setIcd11Value] = useState<{ code: string; title: string } | null>(null);
  const [icd10SearchQuery, setIcd10SearchQuery] = useState('');
  const [isIcd10SearchOpen, setIsIcd10SearchOpen] = useState(false);
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

  // ICD-10 search
  const { data: icd10SearchResults, isLoading: isSearching } = useICD10Search(icd10SearchQuery);

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
  }, [patientId, selectedWardId, requiresIsolation, checkCompatibility]);

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
  }, [
    patientId,
    selectedWardId,
    assignmentStrategy,
    admissionType,
    requiresIsolation,
    requiresOxygen,
    requiresVentilator,
    recommendBed,
    smartRecommendBed,
  ]);

  // Prefill diagnosis from encounter's primary diagnosis
  useEffect(() => {
    if (encounterDiagnoses && !diagnosisPrefilled) {
      // Find primary diagnosis or use first one
      const primaryDiagnosis = encounterDiagnoses.find((d: any) => d.diagnosis_type === 'PRIMARY')
        || encounterDiagnoses[0];

      if (primaryDiagnosis) {
        // Check if it has ICD-11 code
        if (primaryDiagnosis.icd11_code) {
          setUseICD11(true);
          setIcd11Value({
            code: primaryDiagnosis.icd11_code,
            title: primaryDiagnosis.icd11_display || primaryDiagnosis.free_text_diagnosis || '',
          });
        }
        // Check if it has ICD-10 code
        else if (primaryDiagnosis.icd10_code || primaryDiagnosis.icd10_display) {
          setUseICD11(false);
          const displayParts = (primaryDiagnosis.icd10_display || '').split(' - ');
          setIcd10Code(displayParts[0] || String(primaryDiagnosis.icd10_code || ''));
          setIcd10Text(displayParts.slice(1).join(' - ') || primaryDiagnosis.free_text_diagnosis || '');
        }
        // Fallback to free text
        else if (primaryDiagnosis.free_text_diagnosis) {
          setIcd10Text(primaryDiagnosis.free_text_diagnosis);
        }
        setDiagnosisPrefilled(true);
      }
    }
  }, [encounterDiagnoses, diagnosisPrefilled]);

  // Handle ICD-10 code selection
  const handleSelectICD10 = (code: any) => {
    setIcd10Code(code.code);
    setIcd10Text(code.short_description || code.description);
    setIcd10SearchQuery('');
    setIsIcd10SearchOpen(false);
  };

  // Clear diagnosis
  const handleClearDiagnosis = () => {
    setIcd10Code('');
    setIcd10Text('');
    setIcd11Value(null);
  };

  // Computed values
  const hasDiagnosis = useICD11
    ? !!icd11Value
    : (!!icd10Code || !!icd10Text);
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

  const admittingDiagnosis = useICD11
    ? icd11Value?.code || ''
    : icd10Code;

  const admittingDiagnosisText = useICD11
    ? icd11Value?.title || ''
    : icd10Text;

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

          {/* Ward Selection */}
          <div className="space-y-2">
            <Label>Ward</Label>
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
                  <Label>Assignment strategy</Label>
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
                      <SelectItem value="SMART">Smart recommendation (Phase C)</SelectItem>
                      <SelectItem value="RULES">Rules-based recommendation (Phase B)</SelectItem>
                      <SelectItem value="MANUAL">Manual bed selection</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Smart recommendation is the default assisted flow. It evaluates workload, emergency buffer, and discharge planning before you create the admission.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Admission type</Label>
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
                  <div className="space-y-0.5">
                    <Label htmlFor="requires-isolation" className="cursor-pointer text-sm font-medium">Isolation required</Label>
                    <p className="text-xs text-muted-foreground">Use ward compatibility and recommendation scoring for isolation placement.</p>
                  </div>
                  <Switch id="requires-isolation" checked={requiresIsolation} onCheckedChange={setRequiresIsolation} />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="requires-oxygen" className="cursor-pointer text-sm font-medium">Needs oxygen</Label>
                    <p className="text-xs text-muted-foreground">Include oxygen-equipped beds when evaluating recommendations.</p>
                  </div>
                  <Switch id="requires-oxygen" checked={requiresOxygen} onCheckedChange={setRequiresOxygen} />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="requires-ventilator" className="cursor-pointer text-sm font-medium">Needs ventilator</Label>
                    <p className="text-xs text-muted-foreground">Prioritize beds and wards that can support advanced respiratory care.</p>
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

          {/* Diagnosis Section with ICD-10/ICD-11 Toggle */}
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Label className="text-base font-medium">Admitting Diagnosis</Label>
              <div className="flex items-center gap-2">
                <span className={cn("text-sm", !useICD11 && "font-medium")}>ICD-10</span>
                <Switch
                  checked={useICD11}
                  onCheckedChange={(checked) => {
                    setUseICD11(checked);
                    handleClearDiagnosis();
                  }}
                />
                <span className={cn("text-sm", useICD11 && "font-medium")}>ICD-11</span>
              </div>
            </div>

            {/* Show selected diagnosis */}
            {hasDiagnosis ? (
              <div className="flex flex-col gap-2 p-3 rounded-md border bg-muted/50 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="font-mono shrink-0">
                    {admittingDiagnosis}
                  </Badge>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {useICD11 ? 'ICD-11' : 'ICD-10'}
                  </Badge>
                  {diagnosisPrefilled && (
                    <Badge variant="outline" className="text-xs bg-blue-50 shrink-0">
                      From Encounter
                    </Badge>
                  )}
                </div>
                <span className="flex-1 text-sm truncate min-w-0">
                  {admittingDiagnosisText}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end sm:self-auto shrink-0"
                  onClick={handleClearDiagnosis}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                {/* ICD-11 Search */}
                {useICD11 && (
                  <ICD11Select
                    value={icd11Value}
                    onSelect={setIcd11Value}
                    placeholder="Search ICD-11 codes (e.g., malaria, pneumonia, diabetes)..."
                  />
                )}

                {/* ICD-10 Search */}
                {!useICD11 && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search ICD-10 codes (e.g., malaria, J18, B50)..."
                        value={icd10SearchQuery}
                        onChange={(e) => {
                          setIcd10SearchQuery(e.target.value);
                          setIsIcd10SearchOpen(true);
                        }}
                        onFocus={() => setIsIcd10SearchOpen(true)}
                        className="pl-9"
                      />

                      {/* Search Results Dropdown */}
                      {isIcd10SearchOpen && icd10SearchQuery.length >= 2 && (
                        <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-64 overflow-y-auto">
                          <CardContent className="p-2">
                            {isSearching ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="flex items-center gap-2 p-2">
                                    <Skeleton className="h-5 w-16" />
                                    <Skeleton className="h-4 flex-1" />
                                  </div>
                                ))}
                              </div>
                            ) : icd10SearchResults && icd10SearchResults.length > 0 ? (
                              <ul className="space-y-1">
                                {icd10SearchResults.map((code: any) => (
                                  <li key={code.id}>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectICD10(code)}
                                      className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors text-left"
                                    >
                                      <Badge variant="outline" className="font-mono shrink-0">
                                        {code.code}
                                      </Badge>
                                      <span className="text-sm">
                                        {code.short_description || code.description}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-center text-muted-foreground py-4 text-sm">
                                No ICD-10 codes found for &quot;{icd10SearchQuery}&quot;
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Manual entry fallback */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="manual-icd10-code">ICD-10 Code (manual)</Label>
                        <Input
                          id="manual-icd10-code"
                          value={icd10Code}
                          onChange={(e) => setIcd10Code(e.target.value.toUpperCase())}
                          placeholder="e.g., B50.0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="manual-diagnosis-text">Diagnosis Description</Label>
                        <Input
                          id="manual-diagnosis-text"
                          value={icd10Text}
                          onChange={(e) => setIcd10Text(e.target.value)}
                          placeholder="e.g., Plasmodium falciparum malaria with cerebral complications"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

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

                router.push('/admissions');
              }}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              {createAdmission.isPending ? 'Creating...' : 'Create Admission'}
            </Button>
            {createAdmission.error && (
              <p className="text-sm text-destructive">Failed to create admission. Please try again.</p>
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
