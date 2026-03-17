/**
 * New Encounter - Complaint Step
 *
 * Second step in the new encounter workflow.
 * Captures the chief complaint (encounter type is selected in step 1).
 *
 * Route: /encounters/new/details
 */
'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/select';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import { ENCOUNTER_TYPES } from '@/lib/utils/constants';
import {
  CHIEF_COMPLAINT_CONFIG,
  type ChiefComplaintCategory,
} from '@/lib/types/triage';

export default function NewEncounterDetailsPage() {
  const router = useRouter();
  const { getDetails, setDetails, markSectionComplete, getPatient } = useNewEncounterStore();

  const details = getDetails();
  const { data: patientData } = getPatient();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resolve encounter type label for display
  const encounterTypeLabel =
    ENCOUNTER_TYPES.find((t) => t.value === details.encounter_type)?.label ?? details.encounter_type;

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: 'encounter_date' | 'chief_complaint' | 'chief_complaint_category', value: string) => {
      if (field === 'chief_complaint_category') {
        setDetails({ chief_complaint_category: value as ChiefComplaintCategory });
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
              Chief Complaint
            </CardTitle>
            <CardDescription>
              Describe what brings the patient in today.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 space-y-4">
            {/* Encounter context (read-only summary from step 1) */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Encounter Type (read-only) */}
              <div className="space-y-2">
                <Label>Encounter Type</Label>
                <div className="h-10 flex items-center">
                  <Badge variant="outline">{encounterTypeLabel}</Badge>
                </div>
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

            {/* Chief Complaint Category */}
            <div className="space-y-2">
              <Label htmlFor="chief_complaint_category">
                Complaint Category
              </Label>
              <Select
                value={details.chief_complaint_category || undefined}
                onValueChange={(value) =>
                  handleFieldChange('chief_complaint_category', value)
                }
              >
                <SelectTrigger id="chief_complaint_category">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(CHIEF_COMPLAINT_CONFIG) as [
                      ChiefComplaintCategory,
                      { label: string },
                    ][]
                  ).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
