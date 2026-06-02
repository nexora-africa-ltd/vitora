/**
 * Encounter Edit - Vitals Step
 *
 * First step in the encounter edit workflow.
 * Captures vital signs: Temperature, BP, HR, SpO2, RR, Weight, Height.
 *
 * Route: /encounters/[id]/edit/vitals
 */
'use client';

import { useCallback, useMemo, useEffect } from 'react';
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

export default function EncounterEditVitalsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getVitals, setVitals, getSession, markSectionComplete, setDirty } = useEncounterEditStore();
  const updateEncounter = useUpdateEncounter();

  const session = getSession(encounterId);
  const vitals = getVitals(encounterId);

  // Build form data from store for VitalsForm component
  const formData = useMemo((): EncounterFormData => ({
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
  }), [session, vitals]);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof EncounterFormData, value: number | null) => {
    const vitalFields = [
      'temperature', 'pulse', 'blood_pressure_systolic', 'blood_pressure_diastolic',
      'respiratory_rate', 'spo2', 'weight', 'height'
    ];

    if (vitalFields.includes(field)) {
      setVitals(encounterId, { [field]: value });
    }
  }, [encounterId, setVitals]);

  // Build auto-save data
  const autoSaveData = useMemo(() => {
    if (!vitals) return null;

    const bp = vitals.blood_pressure_systolic && vitals.blood_pressure_diastolic
      ? `${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}`
      : '';

    return {
      temperature: vitals.temperature,
      pulse: vitals.pulse,
      blood_pressure: bp,
      respiratory_rate: vitals.respiratory_rate,
      spo2: vitals.spo2,
      weight: vitals.weight,
      height: vitals.height,
    };
  }, [vitals]);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Check if patient went through triage
  const wasTriaged = encounter?.triage_status === 'COMPLETED';

  // Auto-save hook
  const autoSave = useAutoSave({
    data: autoSaveData,
    onSave: async (data) => {
      if (!encounterId || !data) return;
      await updateEncounter.mutateAsync({ id: encounterId, data });
    },
    debounceMs: 2000,
    enabled: isEditable && !!vitals,
    onError: (error) => {
      console.error('Auto-save failed:', error);
    },
    onSuccess: () => {
      setDirty(encounterId, false);
    },
  });

  // Navigate to next step
  const handleNext = useCallback(() => {
    // Mark section as complete
    markSectionComplete(encounterId, 'vitals');
    // Navigate to history step
    router.push(`/encounters/${encounterId}/edit/history`);
  }, [encounterId, markSectionComplete, router]);

  // Manual save
  const handleSave = useCallback(async () => {
    if (!autoSaveData) return;

    try {
      await updateEncounter.mutateAsync({ id: encounterId, data: autoSaveData });
      autoSave.reset();
      toast({
        title: 'Vitals Saved',
        description: 'Vital signs have been saved successfully.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save vitals.',
        variant: 'destructive',
      });
    }
  }, [autoSaveData, encounterId, updateEncounter, autoSave, toast]);

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
      <VitalsForm
        data={formData}
        onChange={handleFieldChange}
        disabled={!isEditable}
        fromTriage={wasTriaged}
        vitalsSource={encounter?.vitals_source || (wasTriaged ? 'TRIAGE' : undefined)}
        patientDob={encounter?.patient_date_of_birth}
        patientGender={encounter?.patient_gender}
      />

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 1 of 7 — Vital signs recorded
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={updateEncounter.isPending || !isEditable}
              >
                {updateEncounter.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
              <Button onClick={handleNext}>
                Next: History
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
