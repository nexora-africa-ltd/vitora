/**
 * New Encounter - Diagnosis Step
 *
 * Fifth step in the new encounter workflow.
 * Captures ICD-10/ICD-11 diagnoses (optional).
 *
 * Route: /encounters/new/diagnosis
 */
'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DiagnosisFormContent } from '@/components/encounters/diagnosis-form';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import type { DiagnosisFormData } from '@/lib/types/encounter-form';

export default function NewEncounterDiagnosisPage() {
  const router = useRouter();
  const {
    getDiagnoses,
    addDiagnosis,
    removeDiagnosis,
    updateDiagnosis,
    markSectionComplete,
    getPatient,
    getDetails,
  } = useNewEncounterStore();

  const diagnoses = getDiagnoses();
  const { data: patientData } = getPatient();
  const details = getDetails();
  const isIPD = details.encounter_type === 'IPD';

  // Redirect if missing required data
  useEffect(() => {
    if (!patientData) {
      router.push('/encounters/new/patient');
    }
  }, [patientData, router]);

  // Mark section complete when diagnoses are added
  useEffect(() => {
    if (diagnoses.length > 0) {
      markSectionComplete('diagnosis');
    }
  }, [diagnoses.length, markSectionComplete]);

  // Handle add diagnosis - saves immediately to store and marks section complete
  const handleAddDiagnosis = useCallback(
    (diagnosis: DiagnosisFormData) => {
      addDiagnosis(diagnosis);
      // Section completion is handled by the useEffect above
    },
    [addDiagnosis]
  );

  // Handle remove diagnosis
  const handleRemoveDiagnosis = useCallback(
    (index: number) => {
      removeDiagnosis(index);
    },
    [removeDiagnosis]
  );

  // Handle update diagnosis - also triggers save
  const handleUpdateDiagnosis = useCallback(
    (index: number, diagnosis: DiagnosisFormData) => {
      updateDiagnosis(index, diagnosis);
    },
    [updateDiagnosis]
  );

  // Navigate to previous step
  const handlePrevious = useCallback(() => {
    router.push('/encounters/new/notes');
  }, [router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    if (isIPD) {
      router.push('/encounters/new/admission');
    } else {
      router.push('/encounters/new/review');
    }
  }, [router, isIPD]);

  if (!patientData) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
        {/* Diagnosis Card */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
              Diagnoses
            </CardTitle>
            <CardDescription>
              Add ICD-10/ICD-11 diagnoses. This step is optional - diagnoses can be added
              after further clinical assessment.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <DiagnosisFormContent
              diagnoses={diagnoses}
              onAdd={handleAddDiagnosis}
              onRemove={handleRemoveDiagnosis}
              onUpdate={handleUpdateDiagnosis}
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
            {isIPD ? 'Next: Admission' : 'Next: Review'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
    </div>
  );
}
