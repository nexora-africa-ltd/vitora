/**
 * New Encounter - Details Step
 *
 * Second step in the new encounter workflow.
 * Captures encounter type, date, and chief complaint.
 *
 * Route: /encounters/new/details
 */
'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, AlertTriangle, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import {
  ENCOUNTER_TYPE_GROUPS,
  getEncounterTypesByGroup,
} from '@/lib/utils/constants';
import type { EncounterType } from '@/lib/types/encounter';

export default function NewEncounterDetailsPage() {
  const router = useRouter();
  const { getDetails, setDetails, markSectionComplete, getPatient } = useNewEncounterStore();

  const details = getDetails();
  const { data: patientData } = getPatient();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: 'encounter_type' | 'encounter_date' | 'chief_complaint', value: string) => {
      if (field === 'encounter_type') {
        setDetails({ encounter_type: value as EncounterType });
      } else {
        setDetails({ [field]: value });
      }
      // Clear error for this field
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [setDetails, errors]
  );

  // Validate form
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!details.chief_complaint.trim()) {
      newErrors.chief_complaint = 'Chief complaint is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [details]);

  // Navigate to previous step
  const handlePrevious = useCallback(() => {
    router.push('/encounters/new/patient');
  }, [router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    if (validateForm()) {
      markSectionComplete('details');
      router.push('/encounters/new/history');
    }
  }, [validateForm, markSectionComplete, router]);

  // Check if encounter type requires immediate attention (skip triage prompt)
  const isUrgentEncounterType =
    details.encounter_type === 'EMERGENCY' || details.encounter_type === 'IPD';

  // Redirect to patient step if no patient selected
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
        {/* Details Card */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
              Encounter Details
            </CardTitle>
            <CardDescription>
              Specify the type of encounter and the chief complaint.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Encounter Type */}
              <div className="space-y-2">
                <Label htmlFor="encounter_type">Encounter Type</Label>
                <Select
                  value={details.encounter_type}
                  onValueChange={(value) =>
                    handleFieldChange('encounter_type', value)
                  }
                >
                  <SelectTrigger id="encounter_type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Walk-in / Mandatory triage */}
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['walk-in'].label}</SelectLabel>
                      {getEncounterTypesByGroup('walk-in').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    {/* Scheduled / Optional triage */}
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['scheduled'].label}</SelectLabel>
                      {getEncounterTypesByGroup('scheduled').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    {/* Pre-assessed / No triage */}
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
              </div>

              {/* Encounter Date */}
              <div className="space-y-2">
                <Label htmlFor="encounter_date">
                  Date <span className="text-muted-foreground text-xs">(today)</span>
                </Label>
                <Input
                  id="encounter_date"
                  type="date"
                  value={details.encounter_date}
                  disabled
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>

              {/* Status Badge */}
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="h-10 flex items-center">
                  <Badge variant="secondary">Draft</Badge>
                </div>
              </div>
            </div>

            {/* Chief Complaint */}
            <div className="space-y-2">
              <Label htmlFor="chief_complaint">
                Chief Complaint <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="chief_complaint"
                placeholder="What brings the patient in today? Describe the main complaint..."
                value={details.chief_complaint}
                onChange={(e) => handleFieldChange('chief_complaint', e.target.value)}
                rows={3}
                className={errors.chief_complaint ? 'border-destructive' : ''}
              />
              {errors.chief_complaint && (
                <p className="text-sm text-destructive">{errors.chief_complaint}</p>
              )}
            </div>

            {/* Urgent Encounter Info */}
            {isUrgentEncounterType && (
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-200">
                  {details.encounter_type === 'EMERGENCY'
                    ? 'Emergency Encounter'
                    : 'Inpatient Encounter'}
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  Triage will be skipped for this encounter type. Vital signs can be recorded
                  later once the patient is stabilized.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={handlePrevious}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext}>
            Next: History
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
    </div>
  );
}
