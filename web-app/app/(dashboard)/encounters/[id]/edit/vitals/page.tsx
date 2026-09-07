/**
 * Encounter Edit - Vitals Step
 *
 * First step in the encounter edit workflow.
 * Captures vital signs: Temperature, BP, HR, SpO2, RR, Weight, Height.
 *
 * Route: /encounters/[id]/edit/vitals
 */
'use client';

import { useCallback, useMemo, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { EncounterEditInsights } from '@/components/encounters/encounter-edit-insights';
import { VitalsForm } from '@/components/encounters/vitals-form';
import { AutoSaveStatusIndicator } from '@/components/ui/auto-save-status';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useUpdateEncounter } from '@/lib/hooks/use-encounters';
import { useAutoSave } from '@/lib/hooks/use-auto-save';
import { useToast } from '@/lib/hooks/use-toast';
import type { EncounterFormData } from '@/lib/types/encounter-form';
import { AlertTriangle } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api/client';
import { AxiosError } from 'axios';

type FieldErrorMap = Record<string, string[]>;

function toFieldLabel(field: string): string {
  return field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function normalizeEncounterError(error: unknown): { message: string; fieldErrors: FieldErrorMap } {
  const message = getApiErrorMessage(error) || 'Failed to save vitals.';
  const fieldErrors: FieldErrorMap = {};

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (['detail', 'error', 'message', 'code'].includes(key)) {
          continue;
        }
        if (Array.isArray(value)) {
          const messages = value.filter((v): v is string => typeof v === 'string');
          if (messages.length > 0) {
            fieldErrors[key] = messages;
          }
        } else if (typeof value === 'string') {
          fieldErrors[key] = [value];
        }
      }
    }
  }

  return { message, fieldErrors };
}

function toVitalsPayload(vitals: {
  temperature?: number | null;
  pulse?: number | null;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;
} | null): {
  temperature?: number;
  pulse?: number;
  blood_pressure?: string;
  respiratory_rate?: number;
  spo2?: number;
  weight?: number;
  height?: number;
} | null {
  if (!vitals) return null;

  const payload: {
    temperature?: number;
    pulse?: number;
    blood_pressure?: string;
    respiratory_rate?: number;
    spo2?: number;
    weight?: number;
    height?: number;
  } = {};

  const num = (value: number | null | undefined): number | undefined => {
    if (value == null) return undefined;
    return Number.isFinite(value) ? value : undefined;
  };

  const temperature = num(vitals.temperature);
  const pulse = num(vitals.pulse);
  const respiratoryRate = num(vitals.respiratory_rate);
  const spo2 = num(vitals.spo2);
  const weight = num(vitals.weight);
  const height = num(vitals.height);
  const systolic = num(vitals.blood_pressure_systolic);
  const diastolic = num(vitals.blood_pressure_diastolic);

  if (temperature !== undefined) payload.temperature = temperature;
  if (pulse !== undefined) payload.pulse = pulse;
  if (respiratoryRate !== undefined) payload.respiratory_rate = respiratoryRate;
  if (spo2 !== undefined) payload.spo2 = spo2;
  if (weight !== undefined) payload.weight = weight;
  if (height !== undefined) payload.height = height;
  if (systolic !== undefined && diastolic !== undefined) {
    payload.blood_pressure = `${Math.round(systolic)}/${Math.round(diastolic)}`;
  }

  return payload;
}

export default function EncounterEditVitalsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const encounterRouteId = String(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const encounterStoreId = encounter?.id ?? 0;
  const { getVitals, setVitals, getSession, markSectionComplete, setDirty } =
    useEncounterEditStore();
  const updateEncounter = useUpdateEncounter();
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [saveFieldErrors, setSaveFieldErrors] = useState<FieldErrorMap>({});

  const session = getSession(encounterStoreId);
  const vitals = getVitals(encounterStoreId);

  // Build form data from store for VitalsForm component
  const formData = useMemo(
    (): EncounterFormData => ({
      patient: session?.patientId || null,
      encounter_type: session?.encounter_type || 'OPD',
      encounter_date: session?.encounter_date || '',
      chief_complaint: session?.chief_complaint || '',
      status: session?.status || 'CREATED',
      // Vitals from store
      temperature: vitals?.temperature ?? null,
      pulse: vitals?.pulse ?? null,
      blood_pressure_systolic: vitals?.blood_pressure_systolic ?? null,
      blood_pressure_diastolic: vitals?.blood_pressure_diastolic ?? null,
      respiratory_rate: vitals?.respiratory_rate ?? null,
      spo2: vitals?.spo2 ?? null,
      weight: vitals?.weight ?? null,
      height: vitals?.height ?? null,
      // Empty for this step
      allergies: '',
      chronic_conditions: '',
      current_medications: '',
      past_surgeries: '',
      family_history: '',
      social_history: '',
      notes: '',
      history_of_present_illness: '',
      physical_examination: '',
      assessment: '',
    }),
    [session, vitals]
  );

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: keyof EncounterFormData, value: number | null) => {
      if (saveErrorMessage || Object.keys(saveFieldErrors).length > 0) {
        setSaveErrorMessage(null);
        setSaveFieldErrors({});
      }

      const vitalFields = [
        'temperature',
        'pulse',
        'blood_pressure_systolic',
        'blood_pressure_diastolic',
        'respiratory_rate',
        'spo2',
        'weight',
        'height',
      ];

      if (vitalFields.includes(field)) {
        setVitals(encounterStoreId, { [field]: value });
      }
    },
    [encounterStoreId, setVitals, saveErrorMessage, saveFieldErrors]
  );

  // Build auto-save data
  const autoSaveData = useMemo(() => toVitalsPayload(vitals), [vitals]);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Check if patient went through triage
  const wasTriaged = encounter?.triage_status === 'COMPLETED';

  // Auto-save hook
  const autoSave = useAutoSave({
    data: autoSaveData,
    onSave: async (data) => {
      if (!encounterRouteId || !data) return;
      await updateEncounter.mutateAsync({ id: encounterRouteId, data });
    },
    debounceMs: 2000,
    // Disabled for vitals step to prevent input jitter/reset while typing.
    // Manual Save remains available and now surfaces normalized inline errors.
    enabled: false,
    onError: (error) => {
      console.error('Auto-save failed:', error);
      const normalized = normalizeEncounterError(error);
      setSaveErrorMessage(normalized.message);
      setSaveFieldErrors(normalized.fieldErrors);
    },
    onSuccess: () => {
      setDirty(encounterStoreId, false);
    },
  });

  // Navigate to next step
  const handleNext = useCallback(() => {
    // Mark section as complete
    markSectionComplete(encounterStoreId, 'vitals');
    // Always go to History (present in both template and free-text flows)
    router.push(`/encounters/${encounterRouteId}/edit/history`);
  }, [encounterStoreId, encounterRouteId, markSectionComplete, router]);

  // Manual save
  const handleSave = useCallback(async () => {
    if (!autoSaveData) return;

    setSaveErrorMessage(null);
    setSaveFieldErrors({});

    try {
      await updateEncounter.mutateAsync({ id: encounterRouteId, data: autoSaveData });
      autoSave.reset();
      toast({
        title: 'Vitals Saved',
        description: 'Vital signs have been saved successfully.',
      });
    } catch (err) {
      const normalized = normalizeEncounterError(err);
      setSaveErrorMessage(normalized.message);
      setSaveFieldErrors(normalized.fieldErrors);

      toast({
        title: 'Save failed',
        description: normalized.message,
        variant: 'destructive',
      });
    }
  }, [autoSaveData, encounterRouteId, updateEncounter, autoSave, toast]);

  if (isLoading || !session) {
    return null; // Layout shows loading
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Vital Signs"
        helpContent="Record the patient's vital signs. Temperature, blood pressure, heart rate, oxygen saturation, respiratory rate, weight, and height."
        actions={
          <AutoSaveStatusIndicator
            status={autoSave.status}
            lastSaved={autoSave.lastSaved}
            error={autoSave.error}
            isDirty={autoSave.isDirty}
            pendingCount={autoSave.pendingCount}
          />
        }
      />

      {/* Proactive AI Insights */}
      <EncounterEditInsights />

      {/* Non-editable warning */}
      {!isEditable && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription className="text-sm">
            This encounter is {encounter?.status?.toLowerCase()} and cannot be edited.
          </AlertDescription>
        </Alert>
      )}

      {/* Vitals Form */}
      {(saveErrorMessage || Object.keys(saveFieldErrors).length > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Vitals save blocked by validation errors</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            {saveErrorMessage ? <p>{saveErrorMessage}</p> : null}
            {Object.entries(saveFieldErrors).map(([field, errors]) => (
              <p key={field}>
                <span className="font-medium">{toFieldLabel(field)}:</span> {errors.join(' ')}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <VitalsForm
        data={formData}
        onChange={handleFieldChange}
        disabled={!isEditable}
        errors={Object.fromEntries(
          Object.entries(saveFieldErrors).map(([field, errors]) => [field, errors.join(' ')])
        )}
        fromTriage={wasTriaged}
        vitalsSource={encounter?.vitals_source || (wasTriaged ? 'TRIAGE' : undefined)}
        patientDob={encounter?.patient_date_of_birth}
        patientGender={encounter?.patient_gender}
      />

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Step 1 of 7 — Vital signs recorded</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={updateEncounter.isPending || !isEditable}
              >
                {updateEncounter.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button onClick={handleNext}>
                Next: History
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
