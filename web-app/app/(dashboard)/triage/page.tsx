/**
 * Triage Module - Main Queue Page
 *
 * Displays both the waiting queue (patients awaiting triage) and
 * the priority queue (triaged patients waiting for consultation).
 *
 * Route: /triage
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Clock, Target, Users, UserPlus, Stethoscope } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PatientStageBadge } from '@/components/shared/patient-stage-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TriageQueueDashboard } from '@/components/triage';
import { KPICard } from '@/components/reports/kpi-card';
import { 
  useTriageQueue, 
  useTriageQueueActions, 
  useTriageWaitTimeStats,
  useWaitingQueue,
  useStartTriage,
  useCancelWaitingEntry,
} from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageCategory, AssignedArea, TriageQueueEntry, TriageQueueItem } from '@/lib/types/triage';

// Transform TriageQueueEntry to TriageQueueItem for the dashboard
function transformQueueEntries(entries: TriageQueueEntry[]): TriageQueueItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    patient_id: entry.patient_id,
    patient_name: entry.patient_name,
    patient_mrn: entry.patient_mrn,
    patient_age: entry.patient_age,
    patient_gender: entry.patient_gender,
    triage_category: entry.triage_category,
    chief_complaint_category: entry.chief_complaint_category || 'OTHER' as const,
    chief_complaint: entry.chief_complaint,
    assigned_area: entry.assigned_area,
    assigned_area_display: entry.assigned_area_display || entry.assigned_area_label,
    status: entry.status,
    arrival_time: entry.arrival_time,
    triage_time: entry.triage_time || entry.created_at,
    wait_time_minutes: entry.wait_time_minutes,
    alerts_count: entry.alerts_count ?? entry.alerts?.length ?? 0,
    called_by: entry.called_by_name ?? undefined,
    called_at: entry.called_at ?? undefined,
  }));
}

export default function TriageQueuePage() {
  const router = useRouter();
  const [selectedArea, setSelectedArea] = useState<AssignedArea | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<TriageCategory | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'waiting' | 'priority'>('waiting');

  // Fetch waiting queue (patients awaiting triage)
  const {
    data: waitingData,
    isLoading: isWaitingLoading,
    refetch: refetchWaiting,
  } = useWaitingQueue({});

  // Fetch triaged queue (patients with triage assessments)
  const {
    data: queueData,
    isLoading: isQueueLoading,
    refetch: refetchQueue,
    dataUpdatedAt,
  } = useTriageQueue({
    area: selectedArea !== 'all' ? selectedArea : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
  });

  // Fetch wait time stats for the KPI cards
  const { data: waitTimeStats } = useTriageWaitTimeStats({
    dateRange: 'today',
  });

  // Queue actions
  const {
    callPatient,
    markWithClinician,
    markComplete,
    markLWBS,
    isLoading: isActionLoading,
  } = useTriageQueueActions();

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

  // Handlers for priority queue
  const handleCallPatient = useCallback(
    async (queueEntryId: number) => {
      try {
        await callPatient(queueEntryId);
        toast({
          title: 'Patient Called',
          description: 'Patient has been notified.',
        });
        refetchQueue();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to call patient. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [callPatient, refetchQueue]
  );

  const handleMarkWithClinician = useCallback(
    async (queueEntryId: number) => {
      try {
        await markWithClinician(queueEntryId);
        toast({
          title: 'Status Updated',
          description: 'Patient is now with clinician.',
        });
        refetchQueue();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to update status. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [markWithClinician, refetchQueue]
  );

  const handleMarkComplete = useCallback(
    async (queueEntryId: number) => {
      try {
        await markComplete(queueEntryId);
        toast({
          title: 'Completed',
          description: 'Patient has been marked as completed.',
        });
        refetchQueue();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to complete. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [markComplete, refetchQueue]
  );

  const handleMarkLWBS = useCallback(
    async (queueEntryId: number, reason: string) => {
      try {
        await markLWBS(queueEntryId, reason);
        toast({
          title: 'LWBS Recorded',
          description: 'Patient marked as left without being seen.',
        });
        refetchQueue();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to record LWBS. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [markLWBS, refetchQueue]
  );

  const handleSelectPatient = useCallback(
    (patientId: number) => {
      router.push(`/patients/${patientId}`);
    },
    [router]
  );

  const handleNewTriage = useCallback(() => {
    router.push('/triage/new');
  }, [router]);

  const handleRefreshAll = useCallback(() => {
    refetchWaiting();
    refetchQueue();
  }, [refetchWaiting, refetchQueue]);

  const waitingCount = waitingData?.results?.length ?? 0;
  const priorityCount = queueData?.results?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Queue"
        description="Manage patient check-in and triage queue"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefreshAll} disabled={isQueueLoading || isWaitingLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${(isQueueLoading || isWaitingLoading) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleNewTriage}>
              <Plus className="h-4 w-4 mr-2" />
              New Triage
            </Button>
          </div>
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          id="waiting-triage"
          title="Waiting for Triage"
          value={waitingCount}
          description="Patients checked in, awaiting triage"
          variant={waitingCount > 5 ? 'warning' : 'default'}
        />
        <KPICard
          id="in-queue"
          title="In Priority Queue"
          value={priorityCount}
          description="Triaged patients waiting for consultation"
        />
        <KPICard
          id="avg-wait-time"
          title="Avg Wait Time"
          value={waitTimeStats?.avg_wait_minutes ?? 0}
          unit="min"
          description="Average wait time today"
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

      {/* Tabbed Queue Views */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'waiting' | 'priority')}>
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="waiting" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Awaiting Triage
            {waitingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{waitingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="priority" className="gap-2">
            <Stethoscope className="h-4 w-4" />
            Awaiting Consultation
            {priorityCount > 0 && (
              <Badge variant="secondary" className="ml-1">{priorityCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Waiting Queue Tab */}
        <TabsContent value="waiting" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Patients Awaiting Triage</CardTitle>
              <CardDescription>
                Patients who have checked in and are waiting to be triaged. Click "Start Triage" to begin assessment.
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
        </TabsContent>

        {/* Priority Queue Tab - Patients Awaiting Consultation */}
        <TabsContent value="priority" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Awaiting Consultation</CardTitle>
              <CardDescription>
                Patients who have been triaged and are waiting for clinician consultation, sorted by KETA priority.
              </CardDescription>
            </CardHeader>
          </Card>
          <TriageQueueDashboard
            queueItems={transformQueueEntries(queueData?.results ?? [])}
            isLoading={isQueueLoading}
            lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined}
            onCallPatient={handleCallPatient}
            onMarkWithClinician={handleMarkWithClinician}
            onMarkComplete={handleMarkComplete}
            onMarkLWBS={handleMarkLWBS}
            onSelectPatient={(item) => handleSelectPatient(item.patient_id)}
            onRefresh={() => refetchQueue()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
