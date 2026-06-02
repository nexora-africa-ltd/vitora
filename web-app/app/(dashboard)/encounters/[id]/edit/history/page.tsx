/**
 * Encounter Edit - History Step
 *
 * Second step in the encounter edit workflow.
 * Captures medical history: allergies, chronic conditions, medications, surgeries, family/social history.
 *
 * Route: /encounters/[id]/edit/history
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Save, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { EncounterEditInsights } from '@/components/encounters/encounter-edit-insights';
import { MedicalHistoryFormContent } from '@/components/encounters/medical-history-form';
import { AutoSaveStatusIndicator } from '@/components/ui/auto-save-status';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useUpdateEncounter } from '@/lib/hooks/use-encounters';
import { useAutoSave } from '@/lib/hooks/use-auto-save';
import { useToast } from '@/lib/hooks/use-toast';
import type { EncounterFormData } from '@/lib/types/encounter-form';
import { AlertTriangle } from 'lucide-react';

export default function EncounterEditHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getHistory, setHistory, getSession, markSectionComplete, setDirty } = useEncounterEditStore();
  const updateEncounter = useUpdateEncounter();

  const session = getSession(encounterId);
  const history = getHistory(encounterId);

  // Build form data from store for MedicalHistoryFormContent
  const formData = useMemo((): EncounterFormData => ({
    patient: session?.patientId || null,
    encounter_type: session?.encounter_type || 'OPD',
    encounter_date: session?.encounter_date || '',
    chief_complaint: session?.chief_complaint || '',
    status: session?.status || 'CREATED',
    // Empty vitals
    temperature: null,
    pulse: null,
    blood_pressure_systolic: null,
    blood_pressure_diastolic: null,
    respiratory_rate: null,
    spo2: null,
    weight: null,
    height: null,
    // History from store
    allergies: history?.allergies || '',
    chronic_conditions: history?.chronic_conditions || '',
    current_medications: history?.current_medications || '',
    past_surgeries: history?.past_surgeries || '',
    family_history: history?.family_history || '',
    social_history: history?.social_history || '',
    // Empty notes
    notes: '',
    history_of_present_illness: '',
    physical_examination: '',
    assessment: '',
  }), [session, history]);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof EncounterFormData, value: unknown) => {
    const historyFields = [
      'allergies', 'chronic_conditions', 'current_medications',
      'past_surgeries', 'family_history', 'social_history'
    ];

    if (historyFields.includes(field)) {
      setHistory(encounterId, { [field]: value as string });
    }
  }, [encounterId, setHistory]);

  // Build auto-save data
  const autoSaveData = useMemo(() => {
    if (!history) return null;

    return {
      allergies: history.allergies,
      chronic_conditions: history.chronic_conditions,
      current_medications: history.current_medications,
      past_surgeries: history.past_surgeries,
      family_history: history.family_history,
      social_history: history.social_history,
    };
  }, [history]);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Auto-save hook
  const autoSave = useAutoSave({
    data: autoSaveData,
    onSave: async (data) => {
      if (!encounterId || !data) return;
      await updateEncounter.mutateAsync({ id: encounterId, data });
    },
    debounceMs: 2000,
    enabled: isEditable && !!history,
    onError: (error) => {
      console.error('Auto-save failed:', error);
    },
    onSuccess: () => {
      setDirty(encounterId, false);
    },
  });

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterId}/edit/vitals`);
  }, [encounterId, router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    markSectionComplete(encounterId, 'history');
    router.push(`/encounters/${encounterId}/edit/notes`);
  }, [encounterId, markSectionComplete, router]);

  // Manual save
  const handleSave = useCallback(async () => {
    if (!autoSaveData) return;

    try {
      await updateEncounter.mutateAsync({ id: encounterId, data: autoSaveData });
      autoSave.reset();
      toast({
        title: 'History Saved',
        description: 'Medical history has been saved successfully.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save medical history.',
        variant: 'destructive',
      });
    }
  }, [autoSaveData, encounterId, updateEncounter, autoSave, toast]);

  if (isLoading || !session) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Medical History"
        helpContent="Document the patient's medical history including allergies, chronic conditions, current medications, past surgeries, and family/social history."
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

      {/* Medical History Form */}
      <Card>
        <CardContent className="pt-6">
          <MedicalHistoryFormContent
            data={formData}
            onChange={handleFieldChange}
            disabled={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 2 of 7 — Medical history recorded
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={updateEncounter.isPending || !isEditable}
              >
                {updateEncounter.isPending ? (
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">Save</span>
              </Button>
              <Button onClick={handleNext}>
                <span className="hidden sm:inline">Next: Notes</span>
                <ArrowRight className="h-4 w-4 sm:ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
