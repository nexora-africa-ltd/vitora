/**
 * Triage Assess - Vitals Tab
 *
 * First step in triage assessment workflow.
 * Captures vital signs: Temperature, BP, HR, SpO2, RR, Weight, Height.
 * Features real-time inline alerts for critical/warning values.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/vitals
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  Thermometer,
  Heart,
  Wind,
  Scale,
  Ruler,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { HelpPopover } from '@/components/shared/help-popover';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { usePatientContext } from '@/lib/context/patient-context';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { useTriageAssessHistoryAvailability } from '@/lib/hooks/use-triage-assess-history-availability';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import {
  VitalAlertsPanel,
  evaluateVitalSeverity,
} from '@/components/triage';
import type { TriageAlert, VitalType, AlertSeverity } from '@/lib/types/triage';

// Import shared vitals module
import {
  triageVitalsSchema,
  generateVitalAlerts as generateVitalAlertsShared,
  getAgeAdjustedInputThresholds,
  getVitalRangeHint,
  type TriageVitalsFormValues,
  type VitalAlert,
} from '@/lib/vitals';
import { getAgeGroup, isPediatric, isNeonateOrInfant } from '@/lib/types/triage';

// Use shared schema
const vitalsSchema = triageVitalsSchema;
type VitalsFormData = TriageVitalsFormValues;

// =============================================================================
// Vital Alert Generation - Using shared module
// =============================================================================

/**
 * Generate alerts using shared vitals module and convert to TriageAlert format.
 * Accepts optional age group to use age-adjusted thresholds.
 */
function generateVitalAlerts(vitals: VitalsFormData, _ageGroup?: string | null): TriageAlert[] {
  // Convert triage field names to shared module field names
  const mappedVitals = {
    temperature: vitals.temperature,
    heart_rate: vitals.heart_rate,
    systolic_bp: vitals.systolic_bp,
    diastolic_bp: vitals.diastolic_bp,
    spo2: vitals.spo2,
    respiratory_rate: vitals.respiratory_rate,
  };

  // Use shared alert generation (age-adjusted thresholds handled by caller
  // via evaluateVitalSeverity; the panel alerts use DEFAULT_THRESHOLDS mapped
  // to VitalType keys which don't overlap with the string-keyed INPUT_THRESHOLDS,
  // so we pass undefined to use the standard VitalThreshold defaults here).
  const sharedAlerts = generateVitalAlertsShared(mappedVitals);

  // Convert to TriageAlert format (add threshold field)
  return sharedAlerts.map((alert) => ({
    id: alert.id || `${alert.field}-${alert.severity.toLowerCase()}`,
    vital_type: alert.vital_type,
    value: alert.value,
    severity: alert.severity as AlertSeverity,
    message: alert.message,
    threshold: alert.threshold ?? null,
    clinical_note: alert.clinical_note ?? undefined,
  }));
}

// =============================================================================
// Inline Alert Badge
// =============================================================================

type AlertSeverityType = 'normal' | 'warning' | 'critical' | 'emergency' | null;

interface InlineAlertBadgeProps {
  severity: AlertSeverityType;
  message: string | null;
}

function InlineAlertBadge({ severity, message }: InlineAlertBadgeProps) {
  if (!severity || severity === 'normal' || !message) {
    return null;
  }

  if (severity === 'emergency') {
    return (
      <div className="flex items-center gap-1.5 mt-1 p-1.5 rounded-md bg-rose-100 dark:bg-rose-950/70 border-2 border-rose-500 dark:border-rose-600">
        <AlertCircle className="h-3.5 w-3.5 text-rose-700 dark:text-rose-300 shrink-0 animate-pulse" />
        <span className="text-xs font-bold text-rose-800 dark:text-rose-200">{message}</span>
      </div>
    );
  }

  if (severity === 'critical') {
    return (
      <div className="flex items-center gap-1.5 mt-1 p-1.5 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700">
        <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0 animate-pulse" />
        <span className="text-xs font-medium text-red-700 dark:text-red-300">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1 p-1.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{message}</span>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function TriageVitalsPage() {
  const router = useRouter();
  const params = useParams();
  const { encounter } = useEncounterContext();
  const { patient } = usePatientContext();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;

  // Compute patient age group for age-adjusted vital thresholds
  const patientAgeGroup = patient ? getAgeGroup(patient.date_of_birth) : null;
  const ageThresholds = getAgeAdjustedInputThresholds(patientAgeGroup);
  const patientIdNum = parseInt(patientId, 10);
  const encounterIdNum = parseInt(encounterId, 10);
  const { showHistoryStep } = useTriageAssessHistoryAvailability(patientIdNum, encounterIdNum);

  // Get triage store for persisting vitals across tabs
  const { setVitals, getVitals, markSectionComplete, markSectionVisited } = useTriageAssessStore();
  const currentVitals = getVitals(parseInt(encounterId, 10));

  const [alerts, setAlerts] = useState<TriageAlert[]>([]);

  // Auto-save vitals to store when navigating away (e.g. via tab click)
  const getValuesRef = useRef<(() => VitalsFormData) | null>(null);

  useEffect(() => {
    return () => {
      markSectionVisited(encounterIdNum, 'vitals');
      // Save current form values to store on unmount so tab navigation
      // doesn't lose entered data
      const currentValues = getValuesRef.current?.();
      if (currentValues) {
        setVitals(encounterIdNum, {
          temperature: currentValues.temperature ?? undefined,
          heart_rate: currentValues.heart_rate ?? undefined,
          systolic_bp: currentValues.systolic_bp ?? undefined,
          diastolic_bp: currentValues.diastolic_bp ?? undefined,
          spo2: currentValues.spo2 ?? undefined,
          respiratory_rate: currentValues.respiratory_rate ?? undefined,
          weight: currentValues.weight ?? undefined,
          height: currentValues.height ?? undefined,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterIdNum]);

  // Parse blood pressure from string format if separate fields not available
  const getEncounterBP = (): { systolic: number | null; diastolic: number | null } => {
    // Prefer computed fields if available
    if (encounter?.systolic_bp || encounter?.diastolic_bp) {
      return {
        systolic: encounter.systolic_bp ?? null,
        diastolic: encounter.diastolic_bp ?? null,
      };
    }
    // Fall back to parsing blood_pressure string (format: "120/80")
    const bp = encounter?.blood_pressure;
    if (!bp) return { systolic: null, diastolic: null };
    const parts = bp.split('/');
    const systolicStr = parts[0];
    const diastolicStr = parts[1];
    if (!systolicStr || !diastolicStr) return { systolic: null, diastolic: null };
    const systolic = parseInt(systolicStr, 10);
    const diastolic = parseInt(diastolicStr, 10);
    return {
      systolic: isNaN(systolic) ? null : systolic,
      diastolic: isNaN(diastolic) ? null : diastolic,
    };
  };

  const encounterBP = getEncounterBP();

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VitalsFormData>({
    resolver: zodResolver(vitalsSchema),
    defaultValues: {
      temperature: currentVitals?.temperature ?? encounter?.temperature ?? null,
      heart_rate: currentVitals?.heart_rate ?? encounter?.pulse ?? null,
      systolic_bp: currentVitals?.systolic_bp ?? encounterBP.systolic,
      diastolic_bp: currentVitals?.diastolic_bp ?? encounterBP.diastolic,
      spo2: currentVitals?.spo2 ?? encounter?.spo2 ?? null,
      respiratory_rate: currentVitals?.respiratory_rate ?? encounter?.respiratory_rate ?? null,
      weight: currentVitals?.weight ?? encounter?.weight ?? null,
      height: currentVitals?.height ?? encounter?.height ?? null,
    },
  });

  // Keep getValuesRef in sync so cleanup effect can read current form values
  getValuesRef.current = getValues;

  // Watch for vital changes to generate alerts
  const watchedVitals = watch();

  // Calculate BMI if weight and height are available (age-aware)
  const weight = watchedVitals.weight;
  const height = watchedVitals.height;
  const bmiResult = weight && height
    ? calculateBMI(weight, height, patient?.date_of_birth, patient?.gender as 'M' | 'F' | 'O' | undefined)
    : null;
  const bmiValue = bmiResult?.bmi;
  const bmiColor = bmiResult?.classification ? getBMIColorClass(bmiResult.classification) : '';
  const showNeonatalFields = patientAgeGroup ? isNeonateOrInfant(patientAgeGroup) : false;
  const showPediatricFields = patientAgeGroup ? isPediatric(patientAgeGroup) : false;
  const isUnder2 = patientAgeGroup === 'neonate' || patientAgeGroup === 'infant' || patientAgeGroup === 'toddler';

  // Real-time vital evaluation for inline field color-coding (age-adjusted)
  const temperatureSeverity = evaluateVitalSeverity(watchedVitals.temperature, ageThresholds.temperature!, 'temperature');
  const heartRateSeverity = evaluateVitalSeverity(watchedVitals.heart_rate, ageThresholds.heart_rate!);
  const spo2Severity = evaluateVitalSeverity(watchedVitals.spo2, ageThresholds.spo2!);
  const systolicSeverity = evaluateVitalSeverity(watchedVitals.systolic_bp, ageThresholds.systolic_bp!);
  const diastolicSeverity = evaluateVitalSeverity(watchedVitals.diastolic_bp, ageThresholds.diastolic_bp!);
  const respiratorySeverity = evaluateVitalSeverity(watchedVitals.respiratory_rate, ageThresholds.respiratory_rate!);

  // Helper to get input styling based on severity
  const getInputSeverityClass = (severity: ReturnType<typeof evaluateVitalSeverity>) => {
    if (severity.severity === 'emergency') {
      return 'border-rose-600 bg-rose-100 dark:bg-rose-950/50 focus-within:ring-rose-600/30 border-2';
    }
    if (severity.severity === 'critical') {
      return 'border-red-500 bg-red-50 dark:bg-red-950/30 focus-within:ring-red-500/30';
    }
    if (severity.severity === 'warning') {
      return 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 focus-within:ring-amber-500/30';
    }
    if (severity.severity === 'normal') {
      return 'border-green-400 dark:border-green-600';
    }
    return '';
  };

  // Update alerts in real-time as user types
  useEffect(() => {
    const newAlerts = generateVitalAlerts(watchedVitals);
    setAlerts(newAlerts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedVitals.temperature,
    watchedVitals.heart_rate,
    watchedVitals.spo2,
    watchedVitals.systolic_bp,
    watchedVitals.diastolic_bp,
    watchedVitals.respiratory_rate,
  ]);

  const onSubmit = useCallback(
    async (data: VitalsFormData) => {
      // Generate alerts from vitals
      const vitalAlerts = generateVitalAlerts(data);
      setAlerts(vitalAlerts);

      // Store vitals in triage store
      setVitals(parseInt(encounterId, 10), {
        temperature: data.temperature ?? undefined,
        heart_rate: data.heart_rate ?? undefined,
        systolic_bp: data.systolic_bp ?? undefined,
        diastolic_bp: data.diastolic_bp ?? undefined,
        spo2: data.spo2 ?? undefined,
        respiratory_rate: data.respiratory_rate ?? undefined,
        weight: data.weight ?? undefined,
        height: data.height ?? undefined,
      });

      // Mark vitals section as complete
      markSectionComplete(parseInt(encounterId, 10), 'vitals');

      // Navigate to next tab
      router.push(
        `/triage/assess/${patientId}/${encounterId}/${showHistoryStep ? 'history' : 'assessment'}`
      );
    },
    [router, patientId, encounterId, setVitals, markSectionComplete, showHistoryStep]
  );

  // Parse number input helper
  const parseNumberInput = (value: string): number | null => {
    if (value === '' || value === undefined) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  return (
    <div className="space-y-6">
      {/* Vital Alerts Panel */}
      {alerts.length > 0 && <VitalAlertsPanel alerts={alerts} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Vital Signs Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Vital Signs</CardTitle>
                <HelpPopover content="Record the patient's vital signs. Critical values will trigger alerts." />
              </div>
              <Badge variant="secondary">Step 1 of {showHistoryStep ? 4 : 3}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Row 1: Temperature, Heart Rate, SpO2 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Temperature */}
              <div className="space-y-2">
                <Label htmlFor="temperature" className="flex items-center gap-1.5">
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                  Temperature
                  {temperatureSeverity.severity === 'normal' && watchedVitals.temperature != null && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                </Label>
                <InputGroup className={cn(getInputSeverityClass(temperatureSeverity))}>
                  <InputGroupInput
                    id="temperature"
                    type="number"
                    step="0.1"
                    placeholder="36.5"
                    {...register('temperature', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>°C</InputGroupAddon>
                </InputGroup>
                {errors.temperature ? (
                  <p className="text-sm text-destructive">{errors.temperature.message}</p>
                ) : temperatureSeverity.message ? (
                  <InlineAlertBadge severity={temperatureSeverity.severity} message={temperatureSeverity.message} />
                ) : (
                  <p className="text-xs text-muted-foreground">{getVitalRangeHint('temperature', patientAgeGroup)}</p>
                )}
              </div>

              {/* Heart Rate */}
              <div className="space-y-2">
                <Label htmlFor="heart_rate" className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-muted-foreground" />
                  Heart Rate
                  {heartRateSeverity.severity === 'normal' && watchedVitals.heart_rate != null && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                </Label>
                <InputGroup className={cn(getInputSeverityClass(heartRateSeverity))}>
                  <InputGroupInput
                    id="heart_rate"
                    type="number"
                    placeholder="72"
                    {...register('heart_rate', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>bpm</InputGroupAddon>
                </InputGroup>
                {errors.heart_rate ? (
                  <p className="text-sm text-destructive">{errors.heart_rate.message}</p>
                ) : heartRateSeverity.message ? (
                  <InlineAlertBadge severity={heartRateSeverity.severity} message={heartRateSeverity.message} />
                ) : (
                  <p className="text-xs text-muted-foreground">{getVitalRangeHint('heart_rate', patientAgeGroup)}</p>
                )}
              </div>

              {/* SpO2 */}
              <div className="space-y-2">
                <Label htmlFor="spo2" className="flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  SpO₂
                  {spo2Severity.severity === 'normal' && watchedVitals.spo2 != null && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                </Label>
                <InputGroup className={cn(getInputSeverityClass(spo2Severity))}>
                  <InputGroupInput
                    id="spo2"
                    type="number"
                    placeholder="98"
                    {...register('spo2', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>%</InputGroupAddon>
                </InputGroup>
                {errors.spo2 ? (
                  <p className="text-sm text-destructive">{errors.spo2.message}</p>
                ) : spo2Severity.message ? (
                  <InlineAlertBadge severity={spo2Severity.severity} message={spo2Severity.message} />
                ) : (
                  <p className="text-xs text-muted-foreground">{getVitalRangeHint('spo2', patientAgeGroup)}</p>
                )}
              </div>
            </div>

            {/* Row 2: Blood Pressure, Respiratory Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Systolic BP */}
              <div className="space-y-2">
                <Label htmlFor="systolic_bp" className="flex items-center gap-1.5">
                  Systolic BP
                  {systolicSeverity.severity === 'normal' && watchedVitals.systolic_bp != null && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                </Label>
                <InputGroup className={cn(getInputSeverityClass(systolicSeverity))}>
                  <InputGroupInput
                    id="systolic_bp"
                    type="number"
                    placeholder="120"
                    {...register('systolic_bp', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>mmHg</InputGroupAddon>
                </InputGroup>
                {errors.systolic_bp ? (
                  <p className="text-sm text-destructive">{errors.systolic_bp.message}</p>
                ) : systolicSeverity.message ? (
                  <InlineAlertBadge severity={systolicSeverity.severity} message={systolicSeverity.message} />
                ) : (
                  <p className="text-xs text-muted-foreground">{getVitalRangeHint('systolic_bp', patientAgeGroup)}</p>
                )}
              </div>

              {/* Diastolic BP */}
              <div className="space-y-2">
                <Label htmlFor="diastolic_bp" className="flex items-center gap-1.5">
                  Diastolic BP
                  {diastolicSeverity.severity === 'normal' && watchedVitals.diastolic_bp != null && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                </Label>
                <InputGroup className={cn(getInputSeverityClass(diastolicSeverity))}>
                  <InputGroupInput
                    id="diastolic_bp"
                    type="number"
                    placeholder="80"
                    {...register('diastolic_bp', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>mmHg</InputGroupAddon>
                </InputGroup>
                {errors.diastolic_bp ? (
                  <p className="text-sm text-destructive">{errors.diastolic_bp.message}</p>
                ) : diastolicSeverity.message ? (
                  <InlineAlertBadge severity={diastolicSeverity.severity} message={diastolicSeverity.message} />
                ) : (
                  <p className="text-xs text-muted-foreground">{getVitalRangeHint('diastolic_bp', patientAgeGroup)}</p>
                )}
              </div>

              {/* Respiratory Rate */}
              <div className="space-y-2">
                <Label htmlFor="respiratory_rate" className="flex items-center gap-1.5">
                  <Wind className="h-4 w-4 text-muted-foreground" />
                  Respiratory Rate
                  {respiratorySeverity.severity === 'normal' && watchedVitals.respiratory_rate != null && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                  )}
                </Label>
                <InputGroup className={cn(getInputSeverityClass(respiratorySeverity))}>
                  <InputGroupInput
                    id="respiratory_rate"
                    type="number"
                    placeholder="16"
                    {...register('respiratory_rate', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>/min</InputGroupAddon>
                </InputGroup>
                {errors.respiratory_rate ? (
                  <p className="text-sm text-destructive">{errors.respiratory_rate.message}</p>
                ) : respiratorySeverity.message ? (
                  <InlineAlertBadge severity={respiratorySeverity.severity} message={respiratorySeverity.message} />
                ) : (
                  <p className="text-xs text-muted-foreground">{getVitalRangeHint('respiratory_rate', patientAgeGroup)}</p>
                )}
              </div>
            </div>

            {/* Row 3: Weight, Height, BMI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              {/* Weight */}
              <div className="space-y-2">
                <Label htmlFor="weight" className="flex items-center gap-1.5 h-5">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  Weight
                </Label>
                <InputGroup>
                  <InputGroupInput
                    id="weight"
                    type="number"
                    step="0.1"
                    placeholder={showNeonatalFields ? '3.5' : showPediatricFields ? '15' : '70'}
                    {...register('weight', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>kg</InputGroupAddon>
                </InputGroup>
                {errors.weight && (
                  <p className="text-sm text-destructive">{errors.weight.message}</p>
                )}
              </div>

              {/* Height / Length */}
              <div className="space-y-2">
                <Label htmlFor="height" className="flex items-center gap-1.5 h-5">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  {isUnder2 ? 'Length (recumbent)' : 'Height'}
                </Label>
                <InputGroup>
                  <InputGroupInput
                    id="height"
                    type="number"
                    placeholder={showNeonatalFields ? '50' : showPediatricFields ? '95' : '170'}
                    {...register('height', {
                      setValueAs: parseNumberInput,
                    })}
                  />
                  <InputGroupAddon>cm</InputGroupAddon>
                </InputGroup>
                {errors.height && (
                  <p className="text-sm text-destructive">{errors.height.message}</p>
                )}
              </div>

              {/* BMI (calculated) — only for age ≥ 2 years */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 h-5">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  {isUnder2 ? 'Growth' : 'BMI'}
                </Label>
                {isUnder2 ? (
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/50">
                    <span className="text-xs text-muted-foreground">
                      {weight && height
                        ? 'Use weight-for-length z-scores (WHO charts)'
                        : 'Enter weight & length'}
                    </span>
                  </div>
                ) : (
                  <div className="h-9 flex items-center justify-between px-3 rounded-md border bg-muted/50">
                    {bmiValue ? (
                      <>
                        <span className={cn('font-medium', bmiColor)}>{bmiValue.toFixed(1)}</span>
                        {bmiResult?.classification && (
                          <Badge variant="outline" className={cn('ml-2', bmiColor)}>
                            {bmiResult.classification}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                )}
                {!isUnder2 && bmiResult?.message && (
                  <p className="text-xs text-muted-foreground">{bmiResult.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/triage')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {showHistoryStep ? 'Next: History' : 'Next: Assessment'}
          </Button>
        </div>
      </form>
    </div>
  );
}
