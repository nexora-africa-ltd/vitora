/**
 * New Encounter - History Step
 *
 * Third step in the new encounter workflow.
 * Captures medical history (optional).
 *
 * Route: /encounters/new/history
 */
'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MedicalHistoryFormContent } from '@/components/encounters/medical-history-form';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import type { EncounterFormData } from '@/lib/types/encounter-form';

export default function NewEncounterHistoryPage() {
  const router = useRouter();
  const {
    getHistory,
    setHistory,
    markSectionComplete,
    getPatient,
    getDetails,
  } = useNewEncounterStore();

  const history = getHistory();
  const { data: patientData } = getPatient();
  const details = getDetails();

  // Build form data for MedicalHistoryFormContent
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
      // History from store
      allergies: history.allergies ?? '',
      chronic_conditions: history.chronic_conditions ?? '',
      current_medications: history.current_medications ?? '',
      past_surgeries: history.past_surgeries ?? '',
      family_history: history.family_history ?? '',
      social_history: history.social_history ?? '',
      // Notes (empty)
      notes: '',
      history_of_present_illness: '',
      physical_examination: '',
      assessment: '',
    }),
    [patientData, details, history]
  );

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: keyof EncounterFormData, value: string) => {
      const historyFields = [
        'allergies',
        'chronic_conditions',
        'current_medications',
        'past_surgeries',
        'family_history',
        'social_history',
      ] as const;

      if (historyFields.includes(field as (typeof historyFields)[number])) {
        setHistory({ [field]: value });
      }
    },
    [setHistory]
  );

  // Navigate to previous step
  const handlePrevious = useCallback(() => {
    router.push('/encounters/new/details');
  }, [router]);

  // Check if any history fields have data
  const hasHistoryData = useMemo(() => {
    return !!(
      history.allergies?.trim() ||
      history.chronic_conditions?.trim() ||
      history.current_medications?.trim() ||
      history.past_surgeries?.trim() ||
      history.family_history?.trim() ||
      history.social_history?.trim()
    );
  }, [history]);

  // Auto-mark section complete when history is entered
  useEffect(() => {
    if (hasHistoryData) {
      markSectionComplete('history');
    }
  }, [hasHistoryData, markSectionComplete]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    router.push('/encounters/new/notes');
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
        {/* History Card */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
              Medical History
            </CardTitle>
            <CardDescription>
              Document the patient&apos;s relevant medical background. This step is optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <MedicalHistoryFormContent
              data={formData}
              onChange={handleFieldChange}
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
            Next: Notes
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
    </div>
  );
}
