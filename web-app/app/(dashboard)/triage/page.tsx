/**
 * Triage Module - Main Queue Page
 *
 * Displays the triage queue dashboard with priority-sorted patients.
 * Default landing page for triage module.
 *
 * Route: /triage
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { TriageQueueDashboard } from '@/components/triage';
import { WaitTimeStatsCard } from '@/components/triage';
import { useTriageQueue, useTriageQueueActions, useTriageWaitTimeStats } from '@/lib/hooks/use-triage';
import { useToast } from '@/components/ui/use-toast';
import type { TriageCategory, AssignedArea, QueueStatus } from '@/lib/types/triage';

export default function TriageQueuePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedArea, setSelectedArea] = useState<AssignedArea | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<TriageCategory | 'all'>('all');

  // Fetch queue data
  const {
    data: queueData,
    isLoading: isQueueLoading,
    refetch: refetchQueue,
    dataUpdatedAt,
  } = useTriageQueue({
    area: selectedArea !== 'all' ? selectedArea : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
  });

  // Fetch wait time stats for the stats card
  const { data: waitTimeStats, isLoading: isStatsLoading } = useTriageWaitTimeStats({
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

  // Handlers
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
    [callPatient, refetchQueue, toast]
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
    [markWithClinician, refetchQueue, toast]
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
    [markComplete, refetchQueue, toast]
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
    [markLWBS, refetchQueue, toast]
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Queue"
        description="Manage patient triage queue by priority"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetchQueue()} disabled={isQueueLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isQueueLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleNewTriage}>
              <Plus className="h-4 w-4 mr-2" />
              New Triage
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Stats Card - Sidebar */}
        <div className="lg:col-span-1">
          <WaitTimeStatsCard
            stats={waitTimeStats?.by_category ?? []}
            overallAvgMinutes={waitTimeStats?.avg_wait_minutes ?? 0}
            overallMedianMinutes={waitTimeStats?.median_wait_minutes ?? 0}
            targetMetPercentage={waitTimeStats?.target_met_percentage ?? 0}
            isLoading={isStatsLoading}
            compact
          />
        </div>

        {/* Queue Dashboard - Main Content */}
        <div className="lg:col-span-3">
          <TriageQueueDashboard
            queueItems={queueData?.results ?? []}
            isLoading={isQueueLoading}
            lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined}
            onCallPatient={handleCallPatient}
            onMarkWithClinician={handleMarkWithClinician}
            onMarkComplete={handleMarkComplete}
            onMarkLWBS={handleMarkLWBS}
            onSelectPatient={handleSelectPatient}
            onRefresh={() => refetchQueue()}
          />
        </div>
      </div>
    </div>
  );
}
