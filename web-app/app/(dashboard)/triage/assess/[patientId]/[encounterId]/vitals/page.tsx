/**
 * Triage Assess - Vitals Tab
 *
 * First step in triage assessment workflow.
 * Captures vital signs: Temperature, BP, HR, SpO2, RR, Weight, Height.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/vitals
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Activity, Thermometer, Heart, Wind, Scale, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { HelpPopover } from '@/components/shared/help-popover';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import { VitalAlertsPanel } from '@/components/triage/vital-alerts-panel';
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
// Vital Alert Generation
// =============================================================================

function generateVitalAlerts(vitals: VitalsFormData): TriageAlert[] {
  const alerts: TriageAlert[] = [];

  // SpO2 alerts
  if (vitals.spo2 !== null && vitals.spo2 !== undefined) {
    if (vitals.spo2 < 90) {
      alerts.push({
        id: 'spo2-critical',
        vital_type: 'SPO2' as VitalType,
        value: vitals.spo2,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Critical SpO2: ${vitals.spo2}% - Hypoxemia`,
        threshold: 90,
      });
    } else if (vitals.spo2 < 95) {
      alerts.push({
        id: 'spo2-warning',
        vital_type: 'SPO2' as VitalType,
        value: vitals.spo2,
        severity: 'WARNING' as AlertSeverity,
        message: `Low SpO2: ${vitals.spo2}% - Monitor closely`,
        threshold: 95,
      });
    }
  }

  // Heart rate alerts
  if (vitals.heart_rate !== null && vitals.heart_rate !== undefined) {
    if (vitals.heart_rate < 50 || vitals.heart_rate > 120) {
      alerts.push({
        id: 'hr-warning',
        vital_type: 'HEART_RATE' as VitalType,
        value: vitals.heart_rate,
        severity: (vitals.heart_rate < 40 || vitals.heart_rate > 150 ? 'CRITICAL' : 'WARNING') as AlertSeverity,
        message: `Abnormal heart rate: ${vitals.heart_rate} bpm`,
        threshold: vitals.heart_rate < 50 ? 50 : 120,
      });
    }
  }

  // Temperature alerts
  if (vitals.temperature !== null && vitals.temperature !== undefined) {
    if (vitals.temperature >= 39) {
      alerts.push({
        id: 'temp-critical',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: (vitals.temperature >= 40 ? 'CRITICAL' : 'WARNING') as AlertSeverity,
        message: `High fever: ${vitals.temperature}°C`,
        threshold: 39,
      });
    } else if (vitals.temperature < 35) {
      alerts.push({
        id: 'temp-low',
        vital_type: 'TEMPERATURE' as VitalType,
        value: vitals.temperature,
        severity: 'WARNING' as AlertSeverity,
        message: `Hypothermia risk: ${vitals.temperature}°C`,
        threshold: 35,
      });
    }
  }

  // Blood pressure alerts
  if (vitals.systolic_bp !== null && vitals.systolic_bp !== undefined) {
    if (vitals.systolic_bp >= 180) {
      alerts.push({
        id: 'bp-critical-high',
        vital_type: 'SYSTOLIC_BP' as VitalType,
        value: vitals.systolic_bp,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Hypertensive crisis: ${vitals.systolic_bp} mmHg systolic`,
        threshold: 180,
      });
    } else if (vitals.systolic_bp < 90) {
      alerts.push({
        id: 'bp-critical-low',
        vital_type: 'SYSTOLIC_BP' as VitalType,
        value: vitals.systolic_bp,
        severity: 'CRITICAL' as AlertSeverity,
        message: `Hypotension: ${vitals.systolic_bp} mmHg systolic`,
        threshold: 90,
      });
    }
  }

  // Respiratory rate alerts
  if (vitals.respiratory_rate !== null && vitals.respiratory_rate !== undefined) {
    if (vitals.respiratory_rate > 30 || vitals.respiratory_rate < 8) {
      alerts.push({
        id: 'rr-abnormal',
        vital_type: 'RESPIRATORY_RATE' as VitalType,
        value: vitals.respiratory_rate,
        severity: (vitals.respiratory_rate > 35 || vitals.respiratory_rate < 6 ? 'CRITICAL' : 'WARNING') as AlertSeverity,
        message: `Abnormal respiratory rate: ${vitals.respiratory_rate}/min`,
        threshold: vitals.respiratory_rate < 8 ? 8 : 30,
      });
    }
  }

  return alerts;
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
      systolic_bp: currentVitals?.systolic_bp ?? null,
      diastolic_bp: currentVitals?.diastolic_bp ?? null,
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
                </Label>
                <InputGroup>
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
                {errors.temperature && (
                  <p className="text-sm text-destructive">{errors.temperature.message}</p>
                )}
              </div>

              {/* Heart Rate */}
              <div className="space-y-2">
                <Label htmlFor="heart_rate" className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-muted-foreground" />
                  Heart Rate
                </Label>
                <InputGroup>
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
                {errors.heart_rate && (
                  <p className="text-sm text-destructive">{errors.heart_rate.message}</p>
                )}
              </div>

              {/* SpO2 */}
              <div className="space-y-2">
                <Label htmlFor="spo2" className="flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  SpO₂
                </Label>
                <InputGroup>
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
                {errors.spo2 && (
                  <p className="text-sm text-destructive">{errors.spo2.message}</p>
                )}
              </div>
            </div>

            {/* Row 2: Blood Pressure, Respiratory Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Systolic BP */}
              <div className="space-y-2">
                <Label htmlFor="systolic_bp">Systolic BP</Label>
                <InputGroup>
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
                {errors.systolic_bp && (
                  <p className="text-sm text-destructive">{errors.systolic_bp.message}</p>
                )}
              </div>

              {/* Diastolic BP */}
              <div className="space-y-2">
                <Label htmlFor="diastolic_bp">Diastolic BP</Label>
                <InputGroup>
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
                {errors.diastolic_bp && (
                  <p className="text-sm text-destructive">{errors.diastolic_bp.message}</p>
                )}
              </div>

              {/* Respiratory Rate */}
              <div className="space-y-2">
                <Label htmlFor="respiratory_rate" className="flex items-center gap-1.5">
                  <Wind className="h-4 w-4 text-muted-foreground" />
                  Respiratory Rate
                </Label>
                <InputGroup>
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
                {errors.respiratory_rate && (
                  <p className="text-sm text-destructive">{errors.respiratory_rate.message}</p>
                )}
              </div>
            </div>

            {/* Row 3: Weight, Height, BMI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Weight */}
              <div className="space-y-2">
                <Label htmlFor="weight" className="flex items-center gap-1.5">
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
                <Label htmlFor="height" className="flex items-center gap-1.5">
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
                <Label>BMI</Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-muted/50">
                  {bmiValue ? (
                    <span className={bmiColor}>{bmiValue.toFixed(1)}</span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
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
