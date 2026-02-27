/**
 * New Encounter - Patient Step
 *
 * First step in the new encounter workflow.
 * Allows selecting a patient for the encounter.
 *
 * Route: /encounters/new/patient
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import type { Patient } from '@/lib/types/patient';
import { AlertTriangle, User } from 'lucide-react';

export default function NewEncounterPatientPage() {
  const router = useRouter();
  const { getPatient, setPatient, markSectionComplete } = useNewEncounterStore();

  const { id: patientId, data: selectedPatient } = getPatient();

  // Handle patient selection
  const handlePatientChange = useCallback(
    (newPatientId: number | null, patient: Patient | null) => {
      setPatient(newPatientId, patient);
    },
    [setPatient]
  );

  // Navigate to next step
  const handleNext = useCallback(() => {
    if (patientId) {
      markSectionComplete('patient');
      router.push('/encounters/new/details');
    }
  }, [patientId, markSectionComplete, router]);

  const canProceed = patientId !== null;

  return (
    <div className="space-y-4 sm:space-y-6">
        {/* Patient Selection Card */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <User className="h-4 w-4 sm:h-5 sm:w-5" />
              Select Patient
            </CardTitle>
            <CardDescription>
              Search for an existing patient or select from recent patients.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <PatientSelector
              value={patientId}
              selectedPatient={selectedPatient}
              onChange={handlePatientChange}
            />
          </CardContent>
        </Card>

        {/* Validation Warning */}
        {!canProceed && (
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Please select a patient to continue.
            </AlertDescription>
          </Alert>
        )}

        {/* Navigation */}
        <div className="flex justify-end">
          <Button onClick={handleNext} disabled={!canProceed}>
            Next: Details
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
    </div>
  );
}
