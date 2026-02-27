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

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import {
  VitalAlertsPanel,
  DEFAULT_THRESHOLDS,
  evaluateVitalSeverity,
  type VitalThresholds,
} from '@/components/triage';
import type { TriageAlert, VitalType, AlertSeverity } from '@/lib/types/triage';

// =============================================================================
// Schema
// =============================================================================

const vitalsSchema = z.object({
  temperature: z.union([
    z.literal(null),
    z.number().min(30, 'Must be 30-45°C').max(45, 'Must be 30-45°C'),
  ]).nullable().optional(),
  heart_rate: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-300').max(300, 'Must be 0-300'),
  ]).nullable().optional(),
  systolic_bp: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-300').max(300, 'Must be 0-300'),
  ]).nullable().optional(),
  diastolic_bp: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-200').max(200, 'Must be 0-200'),
  ]).nullable().optional(),
  spo2: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-100%').max(100, 'Must be 0-100%'),
  ]).nullable().optional(),
  respiratory_rate: z.union([
    z.literal(null),
    z.number().min(0, 'Must be 0-60').max(60, 'Must be 0-60'),
  ]).nullable().optional(),
  weight: z.union([
    z.literal(null),
    z.number().min(0, 'Must be positive').max(500, 'Must be < 500kg'),
  ]).nullable().optional(),
  height: z.union([
    z.literal(null),
    z.number().min(0, 'Must be positive').max(300, 'Must be < 300cm'),
  ]).nullable().optional(),
});

type VitalsFormData = z.infer<typeof vitalsSchema>;

// =============================================================================
// Vital Alert Generation (matches DEFAULT_THRESHOLDS from vital-input-with-alert)
// =============================================================================

function generateVitalAlerts(vitals: VitalsFormData): TriageAlert[] {
  const alerts: TriageAlert[] = [];

  // SpO2 alerts - emergency ≤85, critical <90, warning <95
  if (vitals.spo2 !== null && vitals.spo2 !== undefined) {
    if (vitals.spo2 <= 85) {
      alerts.push({
        id: 'spo2-emergency',
        vital_type: 'SPO2' as VitalType,
        value: vitals.spo2,
        severity: 'CRITICAL' as AlertSeverity,
        message: `EMERGENCY: ${vitals.spo2}% - Severe hypoxemia`,
        threshold: 85,
      });
    } else if (vitals.spo2 < 90) {
      alerts.push({
        id: 'spo2-critical',
        vital_type: 'SPO2' as VitalType,
        value: vitals.spo2,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.spo2}% - Moderate hypoxemia`,
        threshold: 90,
      });
    } else if (vitals.spo2 < 95) {
      alerts.push({
        id: 'spo2-warning',
        vital_type: 'SPO2' as VitalType,
        value: vitals.spo2,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.spo2}% - Mild hypoxemia`,
        threshold: 95,
      });
    }
  }

  // Heart rate alerts - critical <40 or >150, warning <50 or >100
  if (vitals.heart_rate !== null && vitals.heart_rate !== undefined) {
    if (vitals.heart_rate < 40) {
      alerts.push({
        id: 'hr-critical-low',
        vital_type: 'HEART_RATE' as VitalType,
        value: vitals.heart_rate,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.heart_rate} bpm - Severe bradycardia`,
        threshold: 40,
      });
    } else if (vitals.heart_rate > 150) {
      alerts.push({
        id: 'hr-critical-high',
        vital_type: 'HEART_RATE' as VitalType,
        value: vitals.heart_rate,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.heart_rate} bpm - Severe tachycardia`,
        threshold: 150,
      });
    } else if (vitals.heart_rate < 50) {
      alerts.push({
        id: 'hr-warning-low',
        vital_type: 'HEART_RATE' as VitalType,
        value: vitals.heart_rate,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.heart_rate} bpm - Bradycardia`,
        threshold: 50,
      });
    } else if (vitals.heart_rate > 100) {
      alerts.push({
        id: 'hr-warning-high',
        vital_type: 'HEART_RATE' as VitalType,
        value: vitals.heart_rate,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.heart_rate} bpm - Tachycardia`,
        threshold: 100,
      });
    }
  }

  // Temperature alerts - matches legacy clinical terminology
  // Critical: <32°C (severe hypothermia), ≥40°C (hyperpyrexia)
  // Warning: 32-35°C (moderate hypothermia), 35-36°C (mild hypothermia)
  // Warning: >37.5-38.4°C (low-grade fever), 38.5-39.9°C (moderate fever)
  if (vitals.temperature !== null && vitals.temperature !== undefined) {
    if (vitals.temperature < 32) {
      alerts.push({
        id: 'temp-critical-low',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.temperature}°C - Severe hypothermia`,
        threshold: 32,
      });
    } else if (vitals.temperature >= 40) {
      alerts.push({
        id: 'temp-critical-high',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.temperature}°C - High fever / Hyperpyrexia`,
        threshold: 40,
      });
    } else if (vitals.temperature >= 38.5) {
      alerts.push({
        id: 'temp-moderate-fever',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.temperature}°C - Moderate fever`,
        threshold: 38.5,
      });
    } else if (vitals.temperature > 37.5) {
      alerts.push({
        id: 'temp-low-fever',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.temperature}°C - Low-grade fever`,
        threshold: 37.5,
      });
    } else if (vitals.temperature < 35) {
      alerts.push({
        id: 'temp-moderate-hypothermia',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.temperature}°C - Moderate hypothermia`,
        threshold: 35,
      });
    } else if (vitals.temperature < 36) {
      alerts.push({
        id: 'temp-mild-hypothermia',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.temperature}°C - Mild hypothermia`,
        threshold: 36,
      });
    }
  }

  // Blood pressure alerts - critical <90 or >180 systolic
  if (vitals.systolic_bp !== null && vitals.systolic_bp !== undefined) {
    if (vitals.systolic_bp >= 180) {
      alerts.push({
        id: 'bp-critical-high',
        vital_type: 'SYSTOLIC_BP' as VitalType,
        value: vitals.systolic_bp,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.systolic_bp} mmHg - Hypertensive crisis`,
        threshold: 180,
      });
    } else if (vitals.systolic_bp < 90) {
      alerts.push({
        id: 'bp-critical-low',
        vital_type: 'SYSTOLIC_BP' as VitalType,
        value: vitals.systolic_bp,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.systolic_bp} mmHg - Hypotension`,
        threshold: 90,
      });
    } else if (vitals.systolic_bp > 140) {
      alerts.push({
        id: 'bp-warning-high',
        vital_type: 'SYSTOLIC_BP' as VitalType,
        value: vitals.systolic_bp,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.systolic_bp} mmHg - Elevated blood pressure`,
        threshold: 140,
      });
    } else if (vitals.systolic_bp < 100) {
      alerts.push({
        id: 'bp-warning-low',
        vital_type: 'SYSTOLIC_BP' as VitalType,
        value: vitals.systolic_bp,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.systolic_bp} mmHg - Low blood pressure`,
        threshold: 100,
      });
    }
  }

  // Respiratory rate alerts - critical <8 or >30, warning <10 or >24
  if (vitals.respiratory_rate !== null && vitals.respiratory_rate !== undefined) {
    if (vitals.respiratory_rate < 8) {
      alerts.push({
        id: 'rr-critical-low',
        vital_type: 'RESPIRATORY_RATE' as VitalType,
        value: vitals.respiratory_rate,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.respiratory_rate}/min - Respiratory depression`,
        threshold: 8,
      });
    } else if (vitals.respiratory_rate > 30) {
      alerts.push({
        id: 'rr-critical-high',
        vital_type: 'RESPIRATORY_RATE' as VitalType,
        value: vitals.respiratory_rate,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical: ${vitals.respiratory_rate}/min - Respiratory distress`,
        threshold: 30,
      });
    } else if (vitals.respiratory_rate < 10) {
      alerts.push({
        id: 'rr-warning-low',
        vital_type: 'RESPIRATORY_RATE' as VitalType,
        value: vitals.respiratory_rate,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.respiratory_rate}/min - Bradypnea`,
        threshold: 10,
      });
    } else if (vitals.respiratory_rate > 24) {
      alerts.push({
        id: 'rr-warning-high',
        vital_type: 'RESPIRATORY_RATE' as VitalType,
        value: vitals.respiratory_rate,
        severity: 'WARNING' as AlertSeverity,
        message: `Warning: ${vitals.respiratory_rate}/min - Tachypnea`,
        threshold: 24,
      });
    }
  }

  return alerts;
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

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;

  // Get triage store for persisting vitals across tabs
  const { setVitals, getVitals } = useTriageAssessStore();
  const currentVitals = getVitals(parseInt(encounterId, 10));

  const [alerts, setAlerts] = useState<TriageAlert[]>([]);

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

  // Watch for vital changes to generate alerts
  const watchedVitals = watch();

  // Calculate BMI if weight and height are available
  const weight = watchedVitals.weight;
  const height = watchedVitals.height;
  const bmiResult = weight && height ? calculateBMI(weight, height) : null;
  const bmiValue = bmiResult?.bmi;
  const bmiColor = bmiResult?.classification ? getBMIColorClass(bmiResult.classification) : '';

  // Real-time vital evaluation for inline field color-coding
  const temperatureSeverity = evaluateVitalSeverity(watchedVitals.temperature, DEFAULT_THRESHOLDS.temperature!, 'temperature');
  const heartRateSeverity = evaluateVitalSeverity(watchedVitals.heart_rate, DEFAULT_THRESHOLDS.heart_rate!);
  const spo2Severity = evaluateVitalSeverity(watchedVitals.spo2, DEFAULT_THRESHOLDS.spo2!);
  const systolicSeverity = evaluateVitalSeverity(watchedVitals.systolic_bp, DEFAULT_THRESHOLDS.systolic_bp!);
  const diastolicSeverity = evaluateVitalSeverity(watchedVitals.diastolic_bp, DEFAULT_THRESHOLDS.diastolic_bp!);
  const respiratorySeverity = evaluateVitalSeverity(watchedVitals.respiratory_rate, DEFAULT_THRESHOLDS.respiratory_rate!);

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

      // Navigate to next tab
      router.push(`/triage/assess/${patientId}/${encounterId}/history`);
    },
    [router, patientId, encounterId, setVitals]
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
              <Badge variant="secondary">Step 1 of 4</Badge>
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
                  <p className="text-xs text-muted-foreground">Normal: 36.5-37.5°C</p>
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
                  <p className="text-xs text-muted-foreground">Normal: 60-100 bpm</p>
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
                  <p className="text-xs text-muted-foreground">Normal: 95-100%</p>
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
                  <p className="text-xs text-muted-foreground">Normal: 90-120 mmHg</p>
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
                  <p className="text-xs text-muted-foreground">Normal: 60-80 mmHg</p>
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
                  <p className="text-xs text-muted-foreground">Normal: 12-20/min</p>
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
                    placeholder="70"
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

              {/* Height */}
              <div className="space-y-2">
                <Label htmlFor="height" className="flex items-center gap-1.5 h-5">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  Height
                </Label>
                <InputGroup>
                  <InputGroupInput
                    id="height"
                    type="number"
                    placeholder="170"
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

              {/* BMI (calculated) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 h-5">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  BMI
                </Label>
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
                {bmiResult?.message && (
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
            Next: History
          </Button>
        </div>
      </form>
    </div>
  );
}
