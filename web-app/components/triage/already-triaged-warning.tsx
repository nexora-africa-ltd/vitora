/**
 * Already Triaged Warning Component
 *
 * Displayed when a user navigates to the new triage page for an encounter
 * that already has a triage assessment completed.
 *
 * Sprint 1.7: Triage Architecture Improvements
 */
'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, ArrowLeft, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TriageCategoryBadge } from './triage-category-badge';
import { useTriageAssessmentByEncounter } from '@/lib/hooks/use-triage';
import type { TriageCategory } from '@/lib/types/triage';

export interface AlreadyTriagedWarningProps {
  /**
   * The encounter ID that already has a triage assessment
   */
  encounterId: number;
  /**
   * Patient name for display
   */
  patientName?: string;
  /**
   * Callback when user wants to select a different patient
   */
  onSelectDifferentPatient?: () => void;
}

/**
 * Warning component shown when attempting to triage an already-triaged encounter.
 *
 * Displays:
 * - Alert explaining the situation
 * - Summary of existing triage assessment
 * - Actions: View assessment, Go back to queue, Select different patient
 */
export function AlreadyTriagedWarning({
  encounterId,
  patientName,
  onSelectDifferentPatient,
}: AlreadyTriagedWarningProps) {
  const router = useRouter();

  // Fetch the existing assessment for this encounter
  const { data: assessment, isLoading, isError, refetch } = useTriageAssessmentByEncounter(encounterId);

  const handleViewAssessment = () => {
    if (assessment?.id) {
      router.push(`/triage/${assessment.id}`);
    }
  };

  const handleBackToQueue = () => {
    router.push('/triage');
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error fetching assessment (but we know one exists)
  if (isError || !assessment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Already Triaged
          </CardTitle>
          <CardDescription>
            This encounter has already been triaged, but we couldn&apos;t load the assessment details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Assessment Already Exists</AlertTitle>
            <AlertDescription>
              {patientName
                ? `${patientName} has already been triaged for this encounter.`
                : 'This encounter has already been triaged.'}
              {' '}Creating a new triage assessment is not allowed.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
            <Button variant="outline" onClick={handleBackToQueue}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Queue
            </Button>
            {onSelectDifferentPatient && (
              <Button variant="secondary" onClick={onSelectDifferentPatient}>
                Select Different Patient
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success: show assessment summary
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Already Triaged
        </CardTitle>
        <CardDescription>
          {patientName
            ? `${patientName} has already been triaged for this encounter.`
            : 'This encounter has already been triaged.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Triage Already Completed</AlertTitle>
          <AlertDescription>
            A triage assessment already exists for this encounter. You can view
            the existing assessment or select a different patient.
          </AlertDescription>
        </Alert>

        {/* Assessment Summary */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Triage Category</span>
            <TriageCategoryBadge category={assessment.triage_category as TriageCategory} />
          </div>

          {assessment.chief_complaint && (
            <div>
              <span className="text-sm font-medium">Chief Complaint</span>
              <p className="text-sm text-muted-foreground mt-1">
                {assessment.chief_complaint}
              </p>
            </div>
          )}

          {assessment.assigned_area && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Assigned Area</span>
              <span className="text-sm">{assessment.assigned_area}</span>
            </div>
          )}

          {assessment.triage_end_time && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Completed</span>
              <span className="text-sm text-muted-foreground">
                {new Date(assessment.triage_end_time).toLocaleString()}
              </span>
            </div>
          )}

          {assessment.triaged_by_name && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Triaged By</span>
              <span className="text-sm text-muted-foreground">
                {assessment.triaged_by_name}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleBackToQueue}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Queue
          </Button>
          {onSelectDifferentPatient && (
            <Button variant="outline" onClick={onSelectDifferentPatient}>
              Select Different Patient
            </Button>
          )}
          <Button onClick={handleViewAssessment}>
            <Eye className="h-4 w-4 mr-2" />
            View Assessment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
