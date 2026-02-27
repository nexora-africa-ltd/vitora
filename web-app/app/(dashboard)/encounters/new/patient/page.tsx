/**
 * New Encounter - Patient Step
 *
 * First step in the new encounter workflow.
 * Allows selecting a patient for the encounter.
 * Optionally allows recording vitals upfront.
 *
 * Route: /encounters/new/patient
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Activity, Thermometer, Heart, Droplets, Wind, Scale, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { useNewEncounterStore, type NewEncounterVitals } from '@/lib/stores/new-encounter-store';
import type { Patient } from '@/lib/types/patient';
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
  } = useNewEncounterStore();

  const { id: patientId, data: selectedPatient } = getPatient();
  const recordVitalsNow = getRecordVitalsNow();
  const vitals = getVitals();

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

  // Handle vitals changes
  const handleVitalChange = useCallback(
    (field: keyof NewEncounterVitals, value: string) => {
      const numValue = value === '' ? null : parseFloat(value);
      setVitals({ [field]: numValue });
    },
    [setVitals]
  );

  // Navigate to next step
  const handleNext = useCallback(() => {
    if (patientId) {
      markSectionComplete('patient');
      if (recordVitalsNow) {
        markSectionComplete('vitals');
      }
      router.push('/encounters/new/details');
    }
  }, [patientId, markSectionComplete, recordVitalsNow, router]);

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

            {/* Vitals Form - Shown when checkbox is checked */}
            {recordVitalsNow && (
              <CardContent className="px-3 sm:px-6 pt-0 border-t">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-4">
                  {/* Temperature */}
                  <div className="space-y-2">
                    <Label htmlFor="temperature" className="flex items-center gap-2 text-sm">
                      <Thermometer className="h-4 w-4" />
                      Temperature
                    </Label>
                    <div className="flex">
                      <Input
                        id="temperature"
                        type="number"
                        step="0.1"
                        min={30}
                        max={45}
                        placeholder="36.5"
                        value={vitals.temperature ?? ''}
                        onChange={(e) => handleVitalChange('temperature', e.target.value)}
                        className="rounded-r-none"
                      />
                      <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground">
                        °C
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal: 36.5-37.5°C</p>
                  </div>

                  {/* Heart Rate / Pulse */}
                  <div className="space-y-2">
                    <Label htmlFor="pulse" className="flex items-center gap-2 text-sm">
                      <Heart className="h-4 w-4" />
                      Heart Rate
                    </Label>
                    <div className="flex">
                      <Input
                        id="pulse"
                        type="number"
                        min={0}
                        max={300}
                        placeholder="72"
                        value={vitals.pulse ?? ''}
                        onChange={(e) => handleVitalChange('pulse', e.target.value)}
                        className="rounded-r-none"
                      />
                      <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground">
                        bpm
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal: 60-100 bpm</p>
                  </div>

                  {/* Blood Pressure */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Droplets className="h-4 w-4" />
                      Blood Pressure
                    </Label>
                    <div className="flex items-center gap-1">
                      <Input
                        id="bp-systolic"
                        type="number"
                        min={0}
                        max={300}
                        placeholder="120"
                        value={vitals.blood_pressure_systolic ?? ''}
                        onChange={(e) => handleVitalChange('blood_pressure_systolic', e.target.value)}
                        className="w-20"
                      />
                      <span className="text-muted-foreground">/</span>
                      <Input
                        id="bp-diastolic"
                        type="number"
                        min={0}
                        max={200}
                        placeholder="80"
                        value={vitals.blood_pressure_diastolic ?? ''}
                        onChange={(e) => handleVitalChange('blood_pressure_diastolic', e.target.value)}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">mmHg</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal: 90-120/60-80</p>
                  </div>

                  {/* SpO2 */}
                  <div className="space-y-2">
                    <Label htmlFor="spo2" className="flex items-center gap-2 text-sm">
                      <Droplets className="h-4 w-4" />
                      SpO2
                    </Label>
                    <div className="flex">
                      <Input
                        id="spo2"
                        type="number"
                        min={0}
                        max={100}
                        placeholder="98"
                        value={vitals.spo2 ?? ''}
                        onChange={(e) => handleVitalChange('spo2', e.target.value)}
                        className="rounded-r-none"
                      />
                      <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal: 95-100%</p>
                  </div>

                  {/* Respiratory Rate */}
                  <div className="space-y-2">
                    <Label htmlFor="respiratory_rate" className="flex items-center gap-2 text-sm">
                      <Wind className="h-4 w-4" />
                      Respiratory Rate
                    </Label>
                    <div className="flex">
                      <Input
                        id="respiratory_rate"
                        type="number"
                        min={0}
                        max={60}
                        placeholder="16"
                        value={vitals.respiratory_rate ?? ''}
                        onChange={(e) => handleVitalChange('respiratory_rate', e.target.value)}
                        className="rounded-r-none"
                      />
                      <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground">
                        /min
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal: 12-20/min</p>
                  </div>

                  {/* Weight */}
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="flex items-center gap-2 text-sm">
                      <Scale className="h-4 w-4" />
                      Weight
                    </Label>
                    <div className="flex">
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        min={0}
                        max={500}
                        placeholder="70"
                        value={vitals.weight ?? ''}
                        onChange={(e) => handleVitalChange('weight', e.target.value)}
                        className="rounded-r-none"
                      />
                      <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground">
                        kg
                      </span>
                    </div>
                  </div>

                  {/* Height */}
                  <div className="space-y-2">
                    <Label htmlFor="height" className="flex items-center gap-2 text-sm">
                      <Ruler className="h-4 w-4" />
                      Height
                    </Label>
                    <div className="flex">
                      <Input
                        id="height"
                        type="number"
                        min={0}
                        max={300}
                        placeholder="170"
                        value={vitals.height ?? ''}
                        onChange={(e) => handleVitalChange('height', e.target.value)}
                        className="rounded-r-none"
                      />
                      <span className="inline-flex items-center px-3 border border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground">
                        cm
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
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
