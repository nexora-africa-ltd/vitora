/**
 * New Encounter - Notes Step
 *
 * Fourth step in the new encounter workflow.
 * Captures clinical notes (HPI, PE, Assessment) - optional for new encounters.
 *
 * Route: /encounters/new/notes
 */
'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClinicalNotesFormContent } from '@/components/encounters/clinical-notes-form';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import type { EncounterFormData } from '@/lib/types/encounter-form';

export default function NewEncounterNotesPage() {
  const router = useRouter();
  const {
    getNotes,
    setNotes,
    markSectionComplete,
    getPatient,
    getDetails,
    getHistory,
  } = useNewEncounterStore();

  const notes = getNotes();
  const { data: patientData } = getPatient();
  const details = getDetails();
  const history = getHistory();

  // Build form data for ClinicalNotesFormContent
  const formData = useMemo(
    (): EncounterFormData => ({
      patient: patientData?.id ?? null,
      encounter_type: details.encounter_type,
      encounter_date: details.encounter_date,
      chief_complaint: details.chief_complaint,
      status: 'CREATED',
      // Vitals (empty for new)
      temperature: null,
      pulse: null,
      blood_pressure_systolic: null,
      blood_pressure_diastolic: null,
      respiratory_rate: null,
      spo2: null,
      weight: null,
      height: null,
      // History
      allergies: history.allergies ?? '',
      chronic_conditions: history.chronic_conditions ?? '',
      current_medications: history.current_medications ?? '',
      past_surgeries: history.past_surgeries ?? '',
      family_history: history.family_history ?? '',
      social_history: history.social_history ?? '',
      // Notes from store
      notes: notes.notes ?? '',
      history_of_present_illness: notes.history_of_present_illness ?? '',
      physical_examination: notes.physical_examination ?? '',
      assessment: notes.assessment ?? '',
    }),
    [patientData, details, history, notes]
  );

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: keyof EncounterFormData, value: string) => {
      const notesFields = [
        'notes',
        'history_of_present_illness',
        'physical_examination',
        'assessment',
      ] as const;

      if (notesFields.includes(field as (typeof notesFields)[number])) {
        setNotes({ [field]: value });
      }
    },
    [setNotes]
  );

  // Navigate to previous step
  const handlePrevious = useCallback(() => {
    router.push('/encounters/new/history');
  }, [router]);

  // Check if any notes fields have data
  const hasNotesData = useMemo(() => {
    return !!(
      notes.history_of_present_illness?.trim() ||
      notes.physical_examination?.trim() ||
      notes.assessment?.trim() ||
      notes.notes?.trim()
    );
  }, [notes]);

  // Auto-mark section complete when notes are entered
  useEffect(() => {
    if (hasNotesData) {
      markSectionComplete('notes');
    }
  }, [hasNotesData, markSectionComplete]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    router.push('/encounters/new/diagnosis');
  }, [router]);

  // Redirect if missing required data
  useEffect(() => {
    if (!patientData) {
      router.push('/encounters/new/patient');
    }
  }, [patientData, router]);

  if (!patientData) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
        {/* Notes Card */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
              Clinical Notes
            </CardTitle>
            <CardDescription>
              Document history of present illness, physical examination, and assessment.
              This step is optional for new encounters.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <ClinicalNotesFormContent
              data={formData}
              onChange={handleFieldChange}
              showRequiredIndicators={false}
            />
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={handlePrevious}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext}>
            Next: Diagnosis
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
    </div>
  );
}
