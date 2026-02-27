/**
 * New Encounter - Patient Step
 *
 * First step in the new encounter workflow.
 * Allows selecting a patient for the encounter.
 * Optionally allows recording vitals upfront with threshold alerts.
 *
 * Route: /encounters/new/patient
 */
'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { VitalsForm } from '@/components/encounters/vitals-form';
import { useNewEncounterStore, type NewEncounterVitals } from '@/lib/stores/new-encounter-store';
import type { Patient } from '@/lib/types/patient';
import type { EncounterFormData } from '@/lib/types/encounter-form';
import { AlertTriangle, User } from 'lucide-react';

export default function NewEncounterPatientPage() {
  const router = useRouter();
  const {
    getPatient,
    setPatient,
    markSectionComplete,
    getRecordVitalsNow,
    setRecordVitalsNow,
    getVitals,
    setVitals,
    hasVitals,
  } = useNewEncounterStore();

  const { id: patientId, data: selectedPatient } = getPatient();
  const recordVitalsNow = getRecordVitalsNow();
  const vitals = getVitals();
  const vitalsRecorded = hasVitals();

  // Auto-mark vitals section complete when vitals are recorded
  useEffect(() => {
    if (recordVitalsNow && vitalsRecorded) {
      markSectionComplete('vitals');
    }
  }, [recordVitalsNow, vitalsRecorded, markSectionComplete]);

  // Build EncounterFormData for VitalsForm component
  const formData = useMemo((): EncounterFormData => ({
    patient: patientId,
    encounter_type: 'OPD',
    encounter_date: new Date().toISOString().split('T')[0] || '',
    chief_complaint: '',
    status: 'CREATED',
    // Vitals from store
    temperature: vitals.temperature ?? null,
    pulse: vitals.pulse ?? null,
    blood_pressure_systolic: vitals.blood_pressure_systolic ?? null,
    blood_pressure_diastolic: vitals.blood_pressure_diastolic ?? null,
    respiratory_rate: vitals.respiratory_rate ?? null,
    spo2: vitals.spo2 ?? null,
    weight: vitals.weight ?? null,
    height: vitals.height ?? null,
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
  }), [patientId, vitals]);

  // Handle patient selection
  const handlePatientChange = useCallback(
    (newPatientId: number | null, patient: Patient | null) => {
      setPatient(newPatientId, patient);
    },
    [setPatient]
  );

  // Handle checkbox toggle
  const handleRecordVitalsToggle = useCallback(
    (checked: boolean) => {
      setRecordVitalsNow(checked);
      if (checked) {
        // Mark vitals section as complete if vitals are being recorded
        // (will be validated before proceeding)
      }
    },
    [setRecordVitalsNow]
  );

  // Handle vitals changes (VitalsForm onChange signature)
  const handleVitalChange = useCallback(
    (field: keyof EncounterFormData, value: number | null) => {
      // Map EncounterFormData vitals fields to NewEncounterVitals
      const vitalFields: (keyof NewEncounterVitals)[] = [
        'temperature', 'pulse', 'blood_pressure_systolic', 'blood_pressure_diastolic',
        'respiratory_rate', 'spo2', 'weight', 'height'
      ];
      if (vitalFields.includes(field as keyof NewEncounterVitals)) {
        setVitals({ [field]: value });
      }
    },
    [setVitals]
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
              Select Patient <span className="text-destructive">*</span>
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

        {/* Record Vitals Option */}
        {patientId && (
          <Card>
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="record-vitals"
                  checked={recordVitalsNow}
                  onCheckedChange={handleRecordVitalsToggle}
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="record-vitals"
                    className="text-base sm:text-lg font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                    Record Vitals Now?
                  </Label>
                  <CardDescription className="mt-1">
                    Optionally record vital signs during registration. If skipped, vitals
                    must be recorded during triage before consultation.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Vitals Form - Shown when checkbox is checked */}
        {patientId && recordVitalsNow && (
          <VitalsForm
            data={formData}
            onChange={handleVitalChange}
            patient={selectedPatient}
          />
        )}

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
