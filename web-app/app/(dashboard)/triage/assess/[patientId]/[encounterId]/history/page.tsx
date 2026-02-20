/**
 * Triage Assess - History Tab
 *
 * Second step in triage assessment workflow.
 * Displays patient's medical history, allergies, and past encounters.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/history
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  Pill,
  Stethoscope,
  Calendar,
  FileText,
  History,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePatientContext } from '@/lib/context/patient-context';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { usePatientEncounters } from '@/lib/hooks/use-patients';
import { formatDate } from '@/lib/utils/format';
import type { PatientEncounter } from '@/lib/types/patient';

// =============================================================================
// Schema
// =============================================================================

const historySchema = z.object({
  allergies_noted: z.string().optional(),
  current_medications: z.string().optional(),
  past_medical_history: z.string().optional(),
  notes: z.string().optional(),
});

type HistoryFormData = z.infer<typeof historySchema>;

// =============================================================================
// Past Encounter Card Component
// =============================================================================

function PastEncounterCard({ encounter }: { encounter: PatientEncounter }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
      <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{formatDate(encounter.encounter_date)}</span>
          <Badge variant="outline" className="text-xs">
            {encounter.encounter_type}
          </Badge>
          <Badge variant="secondary" className="text-xs">{encounter.status}</Badge>
        </div>
        {encounter.chief_complaint && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {encounter.chief_complaint}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function TriageHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const { patient, isLoading: isPatientLoading } = usePatientContext();
  const { encounter } = useEncounterContext();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;

  // Get triage store for persisting history across tabs
  const { setHistory, getHistory } = useTriageAssessStore();
  const currentHistory = getHistory(parseInt(encounterId, 10));

  // Fetch patient's past encounters
  const { data: encountersData, isLoading: isEncountersLoading } = usePatientEncounters(
    parseInt(patientId, 10)
  );

  // Filter out current encounter from history (limit to 5 most recent)
  const pastEncounters = (encountersData || [])
    .filter((e) => e.id !== parseInt(encounterId, 10))
    .slice(0, 5);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<HistoryFormData>({
    resolver: zodResolver(historySchema),
    defaultValues: {
      allergies_noted: currentHistory?.allergies_noted || '',
      current_medications: currentHistory?.current_medications || '',
      past_medical_history: currentHistory?.past_medical_history || '',
      notes: currentHistory?.notes || '',
    },
  });

  const onSubmit = useCallback(
    async (data: HistoryFormData) => {
      // Store history in triage store
      setHistory(parseInt(encounterId, 10), {
        allergies_noted: data.allergies_noted,
        current_medications: data.current_medications,
        past_medical_history: data.past_medical_history,
        notes: data.notes,
      });

      // Navigate to next tab
      router.push(`/triage/assess/${patientId}/${encounterId}/assessment`);
    },
    [router, patientId, encounterId, setHistory]
  );

  const handleBack = useCallback(() => {
    router.push(`/triage/assess/${patientId}/${encounterId}/vitals`);
  }, [router, patientId, encounterId]);

  // Loading state
  if (isPatientLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Patient History Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Patient History</CardTitle>
                <HelpPopover content="Review and note any relevant medical history for triage assessment." />
              </div>
              <Badge variant="secondary">Step 2 of 4</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Allergies */}
            <div className="space-y-2">
              <Label htmlFor="allergies_noted" className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Allergies
              </Label>
              <Textarea
                id="allergies_noted"
                placeholder="Record any known allergies (medications, foods, environmental)..."
                rows={2}
                {...register('allergies_noted')}
              />
              {errors.allergies_noted && (
                <p className="text-sm text-destructive">{errors.allergies_noted.message}</p>
              )}
            </div>

            {/* Current Medications */}
            <div className="space-y-2">
              <Label htmlFor="current_medications" className="flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-muted-foreground" />
                Current Medications
              </Label>
              <Textarea
                id="current_medications"
                placeholder="List current medications, dosages, and frequency..."
                rows={2}
                {...register('current_medications')}
              />
              {errors.current_medications && (
                <p className="text-sm text-destructive">{errors.current_medications.message}</p>
              )}
            </div>

            {/* Past Medical History */}
            <div className="space-y-2">
              <Label htmlFor="past_medical_history" className="flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                Past Medical History
              </Label>
              <Textarea
                id="past_medical_history"
                placeholder="Chronic conditions, surgeries, hospitalisations..."
                rows={2}
                {...register('past_medical_history')}
              />
              {errors.past_medical_history && (
                <p className="text-sm text-destructive">{errors.past_medical_history.message}</p>
              )}
            </div>

            {/* Additional Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Additional Notes
              </Label>
              <Textarea
                id="notes"
                placeholder="Any other relevant information for triage..."
                rows={2}
                {...register('notes')}
              />
              {errors.notes && (
                <p className="text-sm text-destructive">{errors.notes.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Past Encounters Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Recent Encounters</CardTitle>
            </div>
            <CardDescription>Patient&apos;s recent visits for context</CardDescription>
          </CardHeader>
          <CardContent>
            {isEncountersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : pastEncounters.length > 0 ? (
              <div className="space-y-2">
                {pastEncounters.map((enc) => (
                  <PastEncounterCard key={enc.id} encounter={enc} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No previous encounters on record
              </p>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={handleBack}>
            Back: Vitals
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Next: Assessment
          </Button>
        </div>
      </form>
    </div>
  );
}
