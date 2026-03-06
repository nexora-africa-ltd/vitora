/**
 * Encounter Edit - Notes Step
 *
 * Third step in the encounter edit workflow.
 * Captures clinical notes: HPI, Physical Examination, Assessment, Clinical Templates.
 *
 * Route: /encounters/[id]/edit/notes
 */
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { ClinicalNotesFormContent } from '@/components/encounters/clinical-notes-form';
import { ClinicalTemplateFormContent } from '@/components/encounters/clinical-template-section';
import { StructureNoteButton } from '@/components/encounters/structure-note-button';
import { AutoSaveStatusIndicator } from '@/components/ui/auto-save-status';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useUpdateEncounter } from '@/lib/hooks/use-encounters';
import { useClinicalTemplate } from '@/lib/hooks/use-clinical-templates';
import { useAutoSave } from '@/lib/hooks/use-auto-save';
import { useToast } from '@/lib/hooks/use-toast';
import type { EncounterFormData } from '@/lib/types/encounter-form';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';
import { AlertTriangle, ClipboardList, LayoutTemplate } from 'lucide-react';

export default function EncounterEditNotesPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getNotes, setNotes, getSession, markSectionComplete, setDirty } = useEncounterEditStore();
  const updateEncounter = useUpdateEncounter();

  const session = getSession(encounterId);
  const notes = getNotes(encounterId);

  // Clinical template state
  const [selectedTemplate, setSelectedTemplate] = useState<ClinicalTemplate | null>(null);

  // Fetch template if encounter has one
  const { data: existingTemplate } = useClinicalTemplate(notes?.clinical_template || 0);

  // Set selected template when existing template loads
  useEffect(() => {
    if (existingTemplate) {
      setSelectedTemplate(existingTemplate);
    }
  }, [existingTemplate]);

  // Build form data from store
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
    // Empty history
    allergies: '',
    chronic_conditions: '',
    current_medications: '',
    past_surgeries: '',
    family_history: '',
    social_history: '',
    // Notes from store
    notes: notes?.notes || '',
    history_of_present_illness: notes?.history_of_present_illness || '',
    physical_examination: notes?.physical_examination || '',
    assessment: notes?.assessment || '',
    clinical_template: notes?.clinical_template || null,
    clinical_template_data: notes?.clinical_template_data || null,
  }), [session, notes]);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof EncounterFormData, value: unknown) => {
    const notesFields = [
      'history_of_present_illness', 'physical_examination', 'assessment', 'notes',
      'clinical_template', 'clinical_template_data'
    ];

    if (notesFields.includes(field)) {
      setNotes(encounterId, { [field]: value });
    }
  }, [encounterId, setNotes]);

  // Handle template selection
  const handleTemplateSelect = useCallback(async (template: ClinicalTemplate) => {
    setSelectedTemplate(template);

    try {
      const { encountersApi } = await import('@/lib/api/encounters');
      const { populated_data } = await encountersApi.populateTemplate(
        encounterId,
        template.id,
        true
      );

      const typedData = (populated_data || {}) as Record<string, Record<string, unknown>>;

      setNotes(encounterId, {
        clinical_template: template.id,
        clinical_template_data: typedData,
      });

      toast({
        title: 'Template Applied',
        description: `${template.name} has been applied with existing data auto-populated.`,
      });
    } catch (error) {
      console.error('Failed to auto-populate template:', error);
      setNotes(encounterId, {
        clinical_template: template.id,
        clinical_template_data: notes?.clinical_template_data || {},
      });

      toast({
        title: 'Template Selected',
        description: `${template.name} has been applied to this encounter.`,
      });
    }
  }, [encounterId, setNotes, notes, toast]);

  // Handle template data changes
  const handleTemplateDataChange = useCallback((data: Record<string, Record<string, unknown>>) => {
    setNotes(encounterId, { clinical_template_data: data });
  }, [encounterId, setNotes]);

  // Build auto-save data
  const autoSaveData = useMemo(() => {
    if (!notes) return null;

    return {
      history_of_present_illness: notes.history_of_present_illness,
      physical_examination: notes.physical_examination,
      assessment: notes.assessment,
      notes: notes.notes,
      clinical_template: notes.clinical_template,
      clinical_template_data: notes.clinical_template_data,
    };
  }, [notes]);

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
    enabled: isEditable && !!notes,
    onError: (error) => {
      console.error('Auto-save failed:', error);
    },
    onSuccess: () => {
      setDirty(encounterId, false);
    },
  });

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterId}/edit/history`);
  }, [encounterId, router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    markSectionComplete(encounterId, 'notes');
    router.push(`/encounters/${encounterId}/edit/diagnosis`);
  }, [encounterId, markSectionComplete, router]);

  // Manual save
  const handleSave = useCallback(async () => {
    if (!autoSaveData) return;

    try {
      await updateEncounter.mutateAsync({ id: encounterId, data: autoSaveData });
      autoSave.reset();
      toast({
        title: 'Notes Saved',
        description: 'Clinical notes have been saved successfully.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save clinical notes.',
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
        title="Clinical Notes"
        helpContent="Document the history of present illness (HPI), physical examination findings, and clinical assessment. Optionally use a clinical template for structured documentation."
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

      {/* Clinical Notes Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              History of Present Illness & Assessment
            </CardTitle>
            {isEditable && (
              <StructureNoteButton
                freeText={
                  [notes?.history_of_present_illness, notes?.physical_examination, notes?.assessment, notes?.notes]
                    .filter(Boolean)
                    .join('\n\n')
                }
                onAccept={(sections) => {
                  if (sections.subjective) setNotes(encounterId, { history_of_present_illness: sections.subjective });
                  if (sections.objective) setNotes(encounterId, { physical_examination: sections.objective });
                  if (sections.assessment) setNotes(encounterId, { assessment: sections.assessment });
                  if (sections.plan) setNotes(encounterId, { notes: sections.plan });
                }}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ClinicalNotesFormContent
            data={formData}
            onChange={handleFieldChange}
            disabled={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Clinical Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" />
            Clinical Template (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ClinicalTemplateFormContent
            encounterId={encounterId}
            encounterType={session.encounter_type}
            chiefComplaint={session.chief_complaint}
            selectedTemplate={selectedTemplate}
            templateData={notes?.clinical_template_data || null}
            onTemplateSelect={handleTemplateSelect}
            onTemplateDataChange={handleTemplateDataChange}
            disabled={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 3 of 7 — Clinical notes documented
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
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
                Next: Diagnosis
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
