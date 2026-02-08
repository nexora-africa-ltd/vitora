/**
 * Triage Module - Main Queue Page
 *
 * Displays the waiting queue (patients awaiting triage).
 * Note: Patients awaiting consultation are now managed on the Encounters page.
 *
 * Route: /triage
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, UserPlus, HelpCircle } from 'lucide-react';
import { PatientStageBadge } from '@/components/shared/patient-stage-badge';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationBanner } from '@/components/shared/notification-banner';
import { KPICard } from '@/components/reports/kpi-card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useTriageWaitTimeStats,
  useWaitingQueue,
  useStartTriage,
  useCancelWaitingEntry,
} from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';

// =============================================================================
// Help Popover Component
// =============================================================================

function HelpPopover({ content }: { content: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 hover:bg-muted transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="max-w-xs p-3">
        <p className="text-sm text-muted-foreground">{content}</p>
      </PopoverContent>
    </Popover>
  );
}

export default function TriageQueuePage() {
  const router = useRouter();
  const [showQueueBanner, setShowQueueBanner] = useState(true);

  // Fetch waiting queue (patients awaiting triage) - auto-refreshes every 15s
  const {
    data: waitingData,
    isLoading: isWaitingLoading,
    refetch: refetchWaiting,
  } = useWaitingQueue({});

  // Fetch wait time stats for the KPI cards
  const { data: waitTimeStats } = useTriageWaitTimeStats({
    dateRange: 'today',
  });

  // Calculate trend for target met percentage (comparing to 85% KETA target)
  const targetMetTrend = useMemo(() => {
    const current = waitTimeStats?.target_met_percentage ?? 0;
    const target = 85; // KETA target
    return {
      direction: current >= target ? 'up' : 'down',
      change: current - target,
    } as const;
  }, [waitTimeStats?.target_met_percentage]);

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

  // Handle pull-to-refresh
  const handlePullRefresh = useCallback(async () => {
    await refetchWaiting();
  }, [refetchWaiting]);

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      isRefreshing={isWaitingLoading}
      className="min-h-full"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Triage Queue</h1>
            <HelpPopover content="Assess and prioritize patients for clinical care. Pull down to refresh on mobile, or use the refresh button in the header." />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleNewTriage} className="h-9 sm:h-10">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Triage</span>
            </Button>
          </div>
        </div>

        {/* Info: Consultation Queue moved to Encounters */}
        <NotificationBanner
          show={showQueueBanner}
          onDismiss={() => setShowQueueBanner(false)}
          title="Consultation Queue Relocated"
          description="Patients awaiting consultation after triage are now managed on the Encounters page."
          variant="info"
          action={{
          label: "Go to Encounters",
          onClick: () => router.push('/encounters'),
        }}
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          id="waiting-triage"
          title="In Queue"
          value={waitingCount}
          description="Awaiting triage"
          variant={waitingCount > 5 ? 'warning' : 'default'}
        />
        <KPICard
          id="current-wait"
          title="Current Wait"
          value={waitTimeStats?.current_queue?.avg_wait_minutes ?? 0}
          unit="min"
          description="Avg queue wait now"
          variant={
            (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 30 
              ? 'destructive' 
              : (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 15
                ? 'warning'
                : 'default'
          }
          valueClassName={
            (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 30 
              ? 'text-destructive' 
              : (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 15
                ? 'text-warning'
                : undefined
          }
        />
        <KPICard
          id="completion-time"
          title="Avg Completion"
          value={waitTimeStats?.completion_time?.avg_minutes ?? 0}
          unit="min"
          description={
            <span className="flex items-center gap-1.5 flex-wrap">
              <span>Arrival → done</span>
              {(waitTimeStats?.completion_time?.count ?? 0) > 0 && (
                <span className="text-muted-foreground">
                  ({waitTimeStats?.completion_time?.count} today)
                </span>
              )}
            </span>
          }
        />
        <KPICard
          id="target-met"
          title="Target Met"
          value={waitTimeStats?.target_met_percentage ?? 100}
          unit="%"
          trend={targetMetTrend.direction}
          change={Math.abs(targetMetTrend.change)}
          changeType={targetMetTrend.direction === 'up' ? 'increase' : 'decrease'}
          variant={(waitTimeStats?.target_met_percentage ?? 100) >= 85 ? 'success' : 'warning'}
          description="KETA compliance"
        />
      </div>

      {/* Patients Awaiting Triage */}
      <Card>
        <CardHeader className="px-4 sm:px-6 pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            <CardTitle className="text-base sm:text-lg">Patients Awaiting Triage</CardTitle>
            <HelpPopover content="Patients who have checked in and are waiting to be triaged. Click 'Start Triage' to begin assessment. This list auto-refreshes every 15 seconds." />
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {isWaitingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 sm:h-16 w-full" />
              ))}
            </div>
          ) : waitingData?.results?.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <UserPlus className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-sm sm:text-base">No patients waiting for triage</p>
              <p className="text-xs sm:text-sm mt-1">
                Patients will appear here after registration/check-in
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => router.push('/patients/new')}
              >
                Register New Patient
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {waitingData?.results?.map((entry) => {
                const isInProgress = entry.status === 'IN_TRIAGE';
                
                return (
                  <div
                    key={entry.id}
                    className={`p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                      isInProgress ? 'border-primary/50 bg-primary/5' : ''
                    }`}
                  >
                    {/* Mobile: Vertical stack layout */}
                    <div className="sm:hidden space-y-2">
                      {/* Row 1: Name + Priority */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm leading-tight">{entry.patient_name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {entry.priority_hint && entry.priority_hint !== 'NORMAL' && (
                            <Badge 
                              variant={entry.priority_hint === 'EMERGENCY' ? 'destructive' : 'secondary'}
                              size="sm"
                            >
                              {entry.priority_hint}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Row 2: MRN + Stage */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" size="sm">
                          {entry.patient_mrn}
                        </Badge>
                        <PatientStageBadge
                          stage={isInProgress ? 'IN_TRIAGE' : 'AWAITING_TRIAGE'}
                          size="sm"
                        />
                      </div>
                      
                      {/* Row 3: Demographics + Wait time */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {entry.patient_gender === 'M' ? 'M' : entry.patient_gender === 'F' ? 'F' : 'O'}
                          {entry.patient_age && `, ${entry.patient_age}y`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {entry.wait_time_minutes}m
                        </span>
                      </div>
                      
                      {/* Row 4: Reason (if any) */}
                      {entry.reason_for_visit && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {entry.reason_for_visit}
                        </p>
                      )}
                      
                      {/* Row 5: Actions - full width */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9"
                          onClick={() => handleCancelWaiting(entry.id, 'Patient left')}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-9"
                          variant={isInProgress ? 'secondary' : 'default'}
                          onClick={() => handleStartTriage(entry.id, entry.patient, entry.encounter)}
                        >
                          {isInProgress ? 'Continue' : 'Start'} Triage
                        </Button>
                      </div>
                    </div>
                    
                    {/* Desktop: Horizontal layout */}
                    <div className="hidden sm:flex sm:items-center sm:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{entry.patient_name}</span>
                          <Badge variant="outline" size="sm">
                            {entry.patient_mrn}
                          </Badge>
                          <PatientStageBadge
                            stage={isInProgress ? 'IN_TRIAGE' : 'AWAITING_TRIAGE'}
                            size="sm"
                          />
                          {entry.priority_hint && entry.priority_hint !== 'NORMAL' && (
                            <Badge 
                              variant={entry.priority_hint === 'EMERGENCY' ? 'destructive' : 'secondary'}
                              size="sm"
                            >
                              {entry.priority_hint}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>{entry.patient_gender === 'M' ? 'Male' : entry.patient_gender === 'F' ? 'Female' : 'Other'}</span>
                          {entry.patient_age && <span>{entry.patient_age} yrs</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {entry.wait_time_minutes} min
                          </span>
                          {entry.reason_for_visit && (
                            <span className="truncate max-w-[200px]">{entry.reason_for_visit}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelWaiting(entry.id, 'Patient left')}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant={isInProgress ? 'secondary' : 'default'}
                          onClick={() => handleStartTriage(entry.id, entry.patient, entry.encounter)}
                        >
                          {isInProgress ? 'Continue' : 'Start'} Triage
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PullToRefresh>
  );
}
