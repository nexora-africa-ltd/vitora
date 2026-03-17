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
import { ArrowRight, Activity, AlertTriangle, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { VitalsForm } from '@/components/encounters/vitals-form';
import { useNewEncounterStore, type NewEncounterVitals } from '@/lib/stores/new-encounter-store';
import type { Patient } from '@/lib/types/patient';
import type { EncounterFormData } from '@/lib/types/encounter-form';
import type { EncounterType } from '@/lib/types/encounter';
import {
  ENCOUNTER_TYPE_GROUPS,
  ENCOUNTER_TRIAGE_REQUIREMENT,
  getEncounterTypesByGroup,
} from '@/lib/utils/constants';

export default function NewEncounterPatientPage() {
  const router = useRouter();
  const {
    getPatient,
    setPatient,
    getDetails,
    setDetails,
    markSectionComplete,
    getRecordVitalsNow,
    setRecordVitalsNow,
    getVitals,
    setVitals,
    hasVitals,
  } = useNewEncounterStore();

  const { id: patientId, data: selectedPatient } = getPatient();
  const details = getDetails();
  const recordVitalsNow = getRecordVitalsNow();
  const vitals = getVitals();
  const vitalsRecorded = hasVitals();

  // Encounter type context
  const encounterType = details.encounter_type;
  const triageRequirement = ENCOUNTER_TRIAGE_REQUIREMENT[encounterType] || 'MANDATORY';
  const triageLabel =
    triageRequirement === 'MANDATORY'
      ? 'Triage required'
      : triageRequirement === 'OPTIONAL'
        ? 'Triage optional'
        : 'No triage needed';

  // Admission urgency (IPD-specific)
  const admissionUrgency = details.admission_urgency;

  // Handle encounter type change
  const handleEncounterTypeChange = useCallback(
    (value: string) => {
      const newType = value as EncounterType;
      // Clear admission urgency when switching away from IPD
      if (newType !== 'IPD') {
        setDetails({ encounter_type: newType, admission_urgency: '' });
      } else {
        setDetails({ encounter_type: newType, admission_urgency: admissionUrgency || 'ROUTINE' });
      }
    },
    [setDetails, admissionUrgency]
  );

  // Handle admission urgency change
  const handleUrgencyChange = useCallback(
    (value: string) => {
      setDetails({ admission_urgency: value as 'ROUTINE' | 'URGENT' | 'EMERGENCY' });
    },
    [setDetails]
  );

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
        {/* Encounter Type Selector */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <CardTitle className="text-base sm:text-lg">
                  Encounter Type
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={encounterType}
                  onValueChange={handleEncounterTypeChange}
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['walk-in'].label}</SelectLabel>
                      {getEncounterTypesByGroup('walk-in').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['scheduled'].label}</SelectLabel>
                      {getEncounterTypesByGroup('scheduled').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['pre-assessed'].label}</SelectLabel>
                      {getEncounterTypesByGroup('pre-assessed').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Badge
                  variant="secondary"
                  className={
                    triageRequirement === 'MANDATORY'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : triageRequirement === 'OPTIONAL'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  }
                >
                  {triageLabel}
                </Badge>
              </div>
            </div>
          </CardHeader>
          {/* IPD urgency selector */}
          {encounterType === 'IPD' && (
            <CardContent className="px-3 sm:px-6 pt-0 pb-3 sm:pb-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Label className="text-sm font-medium shrink-0">Admission Urgency</Label>
                <Select
                  value={admissionUrgency || 'ROUTINE'}
                  onValueChange={handleUrgencyChange}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Select urgency..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROUTINE">Routine (Elective)</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="EMERGENCY">Emergency Admission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  Inpatient encounter — admission details will be required after creation.
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
          {encounterType === 'EMERGENCY' && (
            <CardContent className="px-3 sm:px-6 pt-0 pb-3 sm:pb-4">
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  Emergency encounter — patient will be fast-tracked through triage.
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>

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
            Next: Complaint
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
    </div>
  );
}
