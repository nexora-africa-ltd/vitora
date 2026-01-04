/**
 * Triage Module - Main Queue Page
 *
 * Displays the waiting queue (patients awaiting triage).
 * Note: Patients awaiting consultation are now managed on the Encounters page.
 *
 * Route: /triage
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Clock, UserPlus, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { PatientStageBadge } from '@/components/shared/patient-stage-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { KPICard } from '@/components/reports/kpi-card';
import { 
  useTriageWaitTimeStats,
  useWaitingQueue,
  useStartTriage,
  useCancelWaitingEntry,
} from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';

export default function TriageQueuePage() {
  const router = useRouter();

  // Fetch waiting queue (patients awaiting triage)
  const {
    data: waitingData,
    isLoading: isWaitingLoading,
    refetch: refetchWaiting,
  } = useWaitingQueue({});

  // Fetch wait time stats for the KPI cards
  const { data: waitTimeStats } = useTriageWaitTimeStats({
    dateRange: 'today',
  });

  // Waiting queue actions
  const { mutateAsync: startTriage } = useStartTriage();
  const { mutateAsync: cancelWaiting } = useCancelWaitingEntry();

  // Handle starting triage for a waiting patient
  const handleStartTriage = useCallback(
    async (waitingId: number, patientId: number, encounterId: number | null) => {
      try {
        await startTriage(waitingId);
        // Navigate to triage form
        if (encounterId) {
          router.push(`/triage/new?patientId=${patientId}&encounterId=${encounterId}`);
        } else {
          toast({
            title: 'Error',
            description: 'No encounter found. Please create an encounter first.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to start triage. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [startTriage, router]
  );

  // Handle cancelling a waiting entry
  const handleCancelWaiting = useCallback(
    async (waitingId: number, reason: string) => {
      try {
        await cancelWaiting({ id: waitingId, reason });
        toast({
          title: 'Removed from Queue',
          description: 'Patient has been removed from the waiting queue.',
        });
        refetchWaiting();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to remove patient. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [cancelWaiting, refetchWaiting]
  );

  const handleNewTriage = useCallback(() => {
    router.push('/triage/new');
  }, [router]);

  const waitingCount = waitingData?.results?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Queue"
        description="Assess and prioritize patients for clinical care"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetchWaiting()} disabled={isWaitingLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isWaitingLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleNewTriage}>
              <Plus className="h-4 w-4 mr-2" />
              New Triage
            </Button>
          </div>
        }
      />

      {/* Info: Consultation Queue moved to Encounters */}
      <Alert>
        <ExternalLink className="h-4 w-4" />
        <AlertTitle>Consultation Queue Relocated</AlertTitle>
        <AlertDescription>
          Patients awaiting consultation after triage are now managed on the{' '}
          <Link href="/encounters" className="font-medium underline underline-offset-4 hover:text-primary">
            Encounters page
          </Link>
          .
        </AlertDescription>
      </Alert>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          id="waiting-triage"
          title="Waiting for Triage"
          value={waitingCount}
          description="Patients checked in, awaiting triage"
          variant={waitingCount > 5 ? 'warning' : 'default'}
        />
        <KPICard
          id="avg-wait-time"
          title="Avg Wait Time"
          value={waitTimeStats?.avg_wait_minutes ?? 0}
          unit="min"
          description="Average triage wait time today"
        />
        <KPICard
          id="target-met"
          title="Target Met"
          value={waitTimeStats?.target_met_percentage ?? 0}
          unit="%"
          variant={(waitTimeStats?.target_met_percentage ?? 0) >= 85 ? 'success' : 'warning'}
          description="Within KETA targets"
        />
      </div>

      {/* Patients Awaiting Triage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Patients Awaiting Triage
          </CardTitle>
          <CardDescription>
            Patients who have checked in and are waiting to be triaged. Click &quot;Start Triage&quot; to begin assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isWaitingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : waitingData?.results?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No patients waiting for triage</p>
              <p className="text-sm mt-1">
                Patients will appear here after registration/check-in
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push('/patients/new')}
              >
                Register New Patient
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {waitingData?.results?.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{entry.patient_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {entry.patient_mrn}
                      </Badge>
                      <PatientStageBadge 
                        stage={entry.status === 'IN_TRIAGE' ? 'IN_TRIAGE' : 'AWAITING_TRIAGE'} 
                        size="sm" 
                      />
                      {entry.priority_hint && entry.priority_hint !== 'NORMAL' && (
                        <Badge variant={entry.priority_hint === 'EMERGENCY' ? 'destructive' : 'secondary'}>
                          {entry.priority_hint}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{entry.patient_gender === 'M' ? 'Male' : entry.patient_gender === 'F' ? 'Female' : 'Other'}</span>
                      {entry.patient_age && <span>{entry.patient_age} yrs</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Waiting {entry.wait_time_minutes} min
                      </span>
                    </div>
                    {entry.reason_for_visit && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        Reason: {entry.reason_for_visit}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelWaiting(entry.id, 'Patient left')}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleStartTriage(entry.id, entry.patient, entry.encounter)}
                    >
                      Start Triage
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
