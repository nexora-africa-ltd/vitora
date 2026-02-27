/**
 * VitalsForm - Refactored vital signs form
 * Uses react-hook-form, Zod validation, and modular components
 * Fetches thresholds from backend via useVitalThresholds hook
 */
'use client';

import * as React from 'react';
import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Thermometer,
  Heart,
  Wind,
  Droplets,
  Scale,
  Ruler,
  Activity,
  Info,
  ChevronRight,
  AlertTriangle,
  Lock,
  Unlock,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormItem } from '@/components/ui/form';

import { VitalInput, BloodPressureInput } from './vital-input';
import { VitalsDisplay } from './vitals-display';
import { VitalsAlerts } from './vitals-alerts';
import { vitalsSchema, type VitalsFormValues } from './vitals-schema';
import { useVitalThresholds, type VitalAlert } from '@/lib/hooks/use-vital-thresholds';
import { calculateBMI, getBMIColorClass } from '@/lib/utils/bmi';
import type { EncounterFormData } from '@/lib/types/encounter-form';
import type { Patient } from '@/lib/types/patient';

interface VitalsFormProps {
  /** Current form data (for controlled mode) */
  data: EncounterFormData;
  /** Callback when values change */
  onChange: (field: keyof EncounterFormData, value: number | null) => void;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** External errors */
  errors?: Record<string, string>;
  /** Patient info for BMI calculation */
  patient?: Patient | null;
  /** Callback to navigate to next section */
  onNext?: () => void;
  /** Whether vitals came from triage (shows read-only view first) */
  fromTriage?: boolean;
  /** Source label for vitals (e.g., "TRIAGE") */
  vitalsSource?: string;
}

export function VitalsForm({
  data,
  onChange,
  disabled = false,
  errors = {},
  patient,
  onNext,
  fromTriage = false,
  vitalsSource,
}: VitalsFormProps) {
  // Edit mode toggle - starts locked when from triage
  const [isEditMode, setIsEditMode] = React.useState(!fromTriage);

  // Use shared vital thresholds hook (fetches from backend)
  const { getAlerts, getFieldStatus, isUsingDefaults } = useVitalThresholds();

  // Initialize form with current data
  const form = useForm<VitalsFormValues>({
    resolver: zodResolver(vitalsSchema),
    defaultValues: {
      temperature: data.temperature ?? null,
      pulse: data.pulse ?? null,
      blood_pressure_systolic: data.blood_pressure_systolic ?? null,
      blood_pressure_diastolic: data.blood_pressure_diastolic ?? null,
      respiratory_rate: data.respiratory_rate ?? null,
      spo2: data.spo2 ?? null,
      weight: data.weight ?? null,
      height: data.height ?? null,
    },
    mode: 'onChange',
  });

  // Watch all values for alerts
  const watchedValues = form.watch();

  // Get alerts using shared threshold hook
  const alerts: VitalAlert[] = React.useMemo(
    () => getAlerts(watchedValues),
    [getAlerts, watchedValues]
  );
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
  const warningAlerts = alerts.filter(a => a.severity === 'WARNING');

  // Sync form changes to parent
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name && values[name] !== undefined) {
        // Map the field to EncounterFormData field
        const fieldMapping: Record<string, keyof EncounterFormData> = {
          temperature: 'temperature',
          pulse: 'pulse',
          blood_pressure_systolic: 'blood_pressure_systolic',
          blood_pressure_diastolic: 'blood_pressure_diastolic',
          respiratory_rate: 'respiratory_rate',
          spo2: 'spo2',
          weight: 'weight',
          height: 'height',
        };
        const mappedField = fieldMapping[name];
        if (mappedField) {
          onChange(mappedField, values[name] as number | null);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, onChange]);

  // Reset form when external data changes
  useEffect(() => {
    form.reset({
      temperature: data.temperature ?? null,
      pulse: data.pulse ?? null,
      blood_pressure_systolic: data.blood_pressure_systolic ?? null,
      blood_pressure_diastolic: data.blood_pressure_diastolic ?? null,
      respiratory_rate: data.respiratory_rate ?? null,
      spo2: data.spo2 ?? null,
      weight: data.weight ?? null,
      height: data.height ?? null,
    }, { keepDirty: true });
  }, [data, form]);

  // Calculate BMI
  const bmiResult = calculateBMI(
    watchedValues.weight ?? null,
    watchedValues.height ?? null,
    patient?.date_of_birth,
    patient?.gender
  );

  // Determine if form should be editable
  const canEdit = isEditMode && !disabled;
  const showReadOnlyView = fromTriage && !isEditMode;

  // Convert alerts for VitalsAlerts component (expects lowercase severity)
  const alertsForDisplay = alerts.map(a => ({
    ...a,
    severity: a.severity.toLowerCase() as 'critical' | 'warning',
    clinical_note: a.clinical_note ?? undefined,  // Convert null to undefined
  }));

  return (
    <Card className={cn(criticalAlerts.length > 0 && 'border-destructive')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Vital Signs
            </CardTitle>
            {fromTriage && vitalsSource && (
              <Badge variant="outline" className="text-xs">
                From {vitalsSource === 'TRIAGE' ? 'Triage' : vitalsSource === 'NURSING' ? 'Nursing' : vitalsSource}
              </Badge>
            )}
            {isUsingDefaults && (
              <Badge variant="secondary" className="text-xs">
                Default thresholds
              </Badge>
            )}
            {criticalAlerts.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {criticalAlerts.length} Critical
              </Badge>
            )}
            {warningAlerts.length > 0 && criticalAlerts.length === 0 && (
              <Badge variant="warning" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {warningAlerts.length} Warning
              </Badge>
            )}
          </div>

          {/* Edit mode toggle switch */}
          {fromTriage && !disabled && (
            <div className="flex items-center gap-2">
              <Label
                htmlFor="vitals-edit-mode"
                className="text-sm text-muted-foreground flex items-center gap-1.5 cursor-pointer"
              >
                {isEditMode ? (
                  <Unlock className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {isEditMode ? 'Editing' : 'Read-only'}
              </Label>
              <Switch
                id="vitals-edit-mode"
                checked={isEditMode}
                onCheckedChange={setIsEditMode}
                aria-label="Toggle vitals editing"
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Alerts Banner */}
        <VitalsAlerts alerts={alertsForDisplay} />

        {/* Read-only Card View (from triage, not in edit mode) */}
        {showReadOnlyView ? (
          <VitalsDisplay
            values={watchedValues}
            alerts={alerts}
            patient={patient}
          />
        ) : (
          /* Editable Form View */
          <FormProvider {...form}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <VitalInput
                name="temperature"
                label="Temperature"
                icon={Thermometer}
                placeholder="36.5"
                normalRange="36.5-37.5°C"
                status={getFieldStatus('temperature', alerts)}
                disabled={!canEdit}
                step="0.1"
              />

              <VitalInput
                name="pulse"
                label="Pulse"
                icon={Heart}
                placeholder="72"
                normalRange="60-100 bpm"
                status={getFieldStatus('pulse', alerts)}
                disabled={!canEdit}
              />

              <BloodPressureInput
                status={getFieldStatus('blood_pressure', alerts)}
                disabled={!canEdit}
              />

              <VitalInput
                name="respiratory_rate"
                label="Respiratory Rate"
                icon={Wind}
                placeholder="16"
                normalRange="12-20/min"
                status={getFieldStatus('respiratory_rate', alerts)}
                disabled={!canEdit}
              />

              <VitalInput
                name="spo2"
                label="SpO₂"
                icon={Droplets}
                placeholder="98"
                normalRange="95-100%"
                status={getFieldStatus('spo2', alerts)}
                disabled={!canEdit}
              />

              <VitalInput
                name="weight"
                label="Weight"
                icon={Scale}
                placeholder="70"
                disabled={!canEdit}
                step="0.1"
              />

              <VitalInput
                name="height"
                label="Height"
                icon={Ruler}
                placeholder="170"
                disabled={!canEdit}
                step="0.1"
              />

              {/* BMI (Calculated - Only show when we have values) */}
              {bmiResult.bmi !== null && bmiResult.isAgeAppropriate && (
                <FormItem className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Info className="h-4 w-4" />
                    BMI
                  </Label>
                  <div className="flex items-center gap-2 h-10">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-base font-semibold px-3 py-1.5',
                        getBMIColorClass(bmiResult.classification)
                      )}
                    >
                      {bmiResult.bmi}
                    </Badge>
                    <div className="flex flex-col">
                      <span className={cn(
                        'text-sm font-medium',
                        getBMIColorClass(bmiResult.classification)
                      )}>
                        {bmiResult.classification}
                      </span>
                      {bmiResult.percentile && (
                        <span className="text-xs text-muted-foreground">
                          {bmiResult.percentile}th percentile
                        </span>
                      )}
                    </div>
                  </div>
                  {bmiResult.message && (
                    <p className="text-xs text-muted-foreground">{bmiResult.message}</p>
                  )}
                </FormItem>
              )}
            </div>
          </FormProvider>
        )}
      </CardContent>

      {/* Navigation Footer */}
      {onNext && (
        <CardFooter className="border-t pt-4">
          <div className="flex justify-end w-full">
            <Button onClick={onNext} variant="outline">
              Next: Medical History
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default VitalsForm;
