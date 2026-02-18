/**
 * Triage In Progress Warning Component
 *
 * Displayed when a user navigates to the new triage page for an encounter
 * where triage is already in progress by another user.
 *
 * Sprint 1.7: Triage Architecture Improvements
 */
'use client';

import { useRouter } from 'next/navigation';
import { Clock, AlertTriangle, ArrowLeft, RefreshCw, UserCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useTriageAssessmentByEncounter } from '@/lib/hooks/use-triage';

export interface TriageInProgressWarningProps {
  /**
   * The encounter ID that has triage in progress
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
  /**
   * Callback when user wants to take over (proceed anyway)
   */
  onTakeOver?: () => void;
}

/**
 * Format duration from a start time to now
 */
function formatDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'less than a minute';
  } else if (diffMins === 1) {
    return '1 minute';
  } else if (diffMins < 60) {
    return `${diffMins} minutes`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`;
  }
}

/**
 * Warning component shown when another user has triage in progress.
 *
 * Displays:
 * - Alert explaining the situation
 * - Who is triaging and how long
 * - Actions: Take over, Refresh, Go back, Select different patient
 */
export function TriageInProgressWarning({
  encounterId,
  patientName,
  onSelectDifferentPatient,
  onTakeOver,
}: TriageInProgressWarningProps) {
  const router = useRouter();

  // Fetch the existing in-progress assessment for this encounter
  const { data: assessment, isLoading, refetch, isFetching } = useTriageAssessmentByEncounter(encounterId);

  const handleBackToQueue = () => {
    router.push('/triage');
  };

  const handleRefresh = async () => {
    await refetch();
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

  // If there's an assessment with start time but no end time, it's in progress
  const isInProgress = assessment && assessment.triage_start_time && !assessment.triage_end_time;
  const triagerName = assessment?.triaged_by_name || 'Another user';
  const startTime = assessment?.triage_start_time;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          Triage In Progress
        </CardTitle>
        <CardDescription>
          {patientName
            ? `${patientName} is currently being triaged.`
            : 'This encounter is currently being triaged.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assessment In Progress</AlertTitle>
          <AlertDescription>
            {isInProgress ? (
              <>
                <strong>{triagerName}</strong> started triaging this patient
                {startTime && ` ${formatDuration(startTime)} ago`}.
                You can wait for them to finish, or take over the assessment.
              </>
            ) : (
              <>
                This encounter appears to be in triage. You can refresh to check
                the current status or proceed to take over.
              </>
            )}
          </AlertDescription>
        </Alert>

        {/* In Progress Details */}
        {isInProgress && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Triaged By</span>
              <span className="text-sm">{triagerName}</span>
            </div>

            {startTime && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Started</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {new Date(startTime).toLocaleTimeString()}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {formatDuration(startTime)} ago
                  </Badge>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                In Progress
              </Badge>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
          <Button variant="outline" onClick={handleBackToQueue}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Queue
          </Button>
          {onSelectDifferentPatient && (
            <Button variant="outline" onClick={onSelectDifferentPatient}>
              Select Different Patient
            </Button>
          )}
          {onTakeOver && (
            <Button onClick={onTakeOver}>
              <UserCheck className="h-4 w-4 mr-2" />
              Take Over
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
